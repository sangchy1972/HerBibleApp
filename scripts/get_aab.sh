#!/usr/bin/env bash
#
# Her Bible — 打包 AAB 并断点续传下载到 ~/Downloads
# ---------------------------------------------------------------------------
# 用法:
#   bash scripts/get_aab.sh            # 默认:发起 EAS 生产构建 → 等完成 → 下载到 ~/Downloads
#   bash scripts/get_aab.sh latest     # 不构建,直接下载"最近一个已完成"的生产 AAB
#   bash scripts/get_aab.sh resume     # 下载中断后,从断点继续(用上次缓存的地址)
#
# 断点续传原理:输出文件名固定 + `curl -C -`(向服务器发 Range 头,从已下字节继续)。
# EAS 的下载链接是带签名的,可能在若干小时后过期;若 resume 报 403/401,
# 改用 `latest` 重新取一个新链接(同一个 build → 同一个文件名 → 仍能续传已下部分)。
# ---------------------------------------------------------------------------
set -euo pipefail

PLATFORM="android"
PROFILE="production"
DEST_DIR="$HOME/Downloads"
STATE="$DEST_DIR/.herbible_aab.state"   # 缓存 URL + 目标文件名,供 resume 使用
mkdir -p "$DEST_DIR"

# 从一段 EAS JSON 里抠出 .aab 的下载地址(兼容新旧字段名)。
extract_url() {
  node -e '
    let d=""; process.stdin.on("data",x=>d+=x).on("end",()=>{
      try {
        let j=JSON.parse(d);
        let b=Array.isArray(j)?j[0]:j;
        let a=(b&&b.artifacts)||{};
        process.stdout.write(a.applicationArchiveUrl||a.buildUrl||b.applicationArchiveUrl||"");
      } catch(e){ process.stdout.write(""); }
    });
  '
}

resolve_via_build() {
  echo "▶ 发起 EAS 生产构建,并等待完成(通常 10–20 分钟,别关终端)…" >&2
  npx eas-cli build --platform "$PLATFORM" --profile "$PROFILE" \
      --non-interactive --json | extract_url
}

resolve_latest_finished() {
  echo "▶ 查询最近一个已完成的生产构建…" >&2
  npx eas-cli build:list --platform "$PLATFORM" --profile "$PROFILE" \
      --status finished --limit 1 --non-interactive --json | extract_url
}

MODE="${1:-build}"
URL=""; OUT=""

case "$MODE" in
  resume)
    [ -f "$STATE" ] || { echo "✖ 没有可续传的记录,请先跑一次构建/下载。"; exit 1; }
    # shellcheck disable=SC1090
    source "$STATE"
    echo "▶ 从断点续传(沿用上次地址)…"
    ;;
  latest) URL="$(resolve_latest_finished)" ;;
  build|*) URL="$(resolve_via_build)" ;;
esac

if [ "$MODE" != "resume" ]; then
  [ -n "$URL" ] || { echo "✖ 没能解析出 AAB 下载地址。可手动: bash scripts/get_aab.sh latest"; exit 1; }
  # 用 build 的 UUID 当文件名 → 文件名稳定,断点续传才认得同一个文件。
  ID="$(printf '%s' "$URL" | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
  OUT="$DEST_DIR/HerBible-${ID:-$(date +%Y%m%d-%H%M%S)}.aab"
  printf 'URL=%q\nOUT=%q\n' "$URL" "$OUT" > "$STATE"
fi

echo "▶ 下载到: $OUT"
echo "  (若中途断开,重跑:  bash scripts/get_aab.sh resume  即可从断点继续)"

# -L 跟随重定向; -C - 断点续传; --retry 自动重试瞬时网络错误; --fail 出错即非零退出
curl -L --fail --retry 8 --retry-delay 3 --continue-at - -o "$OUT" "$URL"

echo "✓ 下载完成:"
ls -lh "$OUT"
