# 交接:Daily Verse 流程(verse → meditation → reflection → pray)

> 写给接管此子系统的 agent。本文是**地图与边界**,不是规则本体——规则在
> `docs/dev-guide.md`,冲突时以 dev-guide 为准并在同一 commit 里修正本文。
> 交接日:2026-08-28,交接基线 commit `29b9c39`(已上线 1.5.0 (35))。

## 0. 必读顺序(动手前)

1. 仓库根 `CLAUDE.md` + `README.md`
2. `docs/dev-guide.md` **§8(Prayer flow & weekly screen)、§8b(Prayer audio)** — 本子系统的规则本体
3. dev-guide **§12(Stability playbook)** — 任何新功能动工前的强制清单
4. dev-guide **§13(Mistakes ledger)** — 血泪模式,尤其 Pattern S(共享 provider 的证明必须覆盖全部消费方)与 audit-before-fix
5. 本文其余部分

## 1. 你拥有什么(scope)

**拥有(改动自主,照常走审查):**

| 域 | 文件 |
|---|---|
| 四页仪式 UI | `src/screens/PrayerFlow.tsx`(`SECTIONS = ['verse','meditation','action','prayer']`,:69;owner 口中的 reflection = 'action' 页内的写反思 sheet) |
| 每日经文数据 | `src/state/DailyVersesContext.tsx`、`src/constants/dailyVersesBundled.ts`、`src/constants/dailyVerseAudioManifest.ts`、`holidayVerse*` |
| 经文旁白音频 | `src/services/dailyVerseAudioService.ts`(bundled manifest + 当日缓存、"下载今天、删掉昨天")、`src/constants/dailyVerseAudioCdn.ts`、`src/services/verseHighlight.ts`(逐句 timings) |
| 背景音乐 | `src/state/PrayerBackgroundsContext.tsx`(manifest 驱动,顺序轮换,循环 0.8 音量) |
| 听经引导 | `src/state/listenGuide.ts`(纯逻辑)+ `__tests__/listenGuide.test.ts` |
| 完成状态 | `src/state/PrayerContext.tsx`(`prayer:records:v1`,m/e 槽位、streak 派生) |
| 内容管线脚本 | `scripts/gen_bundled_verses.mjs`、`gen_cdn_verses.mjs`、`gen_dailyverse_audio_manifest.mjs`、`upload_daily_verses_r2.sh`、**`verify_alignment.mjs`(每次内容改动后强制跑)** |

**不拥有,但你的写入喂它们(接口契约,改语义前先证明全部消费方安全 — Pattern S):**

- `prayer:records:v1` 的消费方:主屏 `WeekFireStrip`、`StreakScreen`、成就评估器(prayerStreak/earlyBird/…)、悬浮卡引擎(`prayedAmYmd/prayedPmYmd` 静默晨/晚卡)、足迹 journey、云备份 merger(`services/progressMerge.ts` 的 `mergePrayerRecords`)。
- 流程终点的下游:Gospel & Psalm 阅读 banner(`replace` 语义,dev-guide §8)、`QuizPromoHost` 的 `inGap`、流程后插屏(`maybeShowInterstitial` — **广告决策已定,勿动**)。
- 全局音频模式:`src/services/audioSession.ts` 只有两个模式,**PrayerFlow 永远用 `applyMixAudioMode`**(§8b:双播放器混音是核心设计);mount 时先 `stopNarration()`(圣经朗读与祷告旁白不并存)。
- 提醒时间(`SetReminderTimeContext`/notifee)决定入口时机,不归你。

**共享文件**(`App.tsx`、`strings.ts`、`sourceCatalog.ts`、`audioSession.ts`、`dev-guide.md`):最小化改动;与主 agent 并行工作时一人一 worktree、文件所有权不重叠(`.claude/worktrees/` 已被 jest/tsc 排除)。

## 2. 流程地图

- **入口**:`PrayerScreen.tsx:772,1130` → `navigate('PrayerFlow', { kind: 'morning'|'evening' })`。
- **四页**(PagerView):0 verse → 1 meditation(`meditation` 字段按 `\n\n` 分段)→ 2 action(写反思 sheet,键盘抬升逻辑 :486)→ 3 prayer + **Amen**。
- **旁白**:每页一段 mp3(4 clips/槽位,`listenStep` 0–3),**不自动播放**(owner 2026-08-09,勿回归);逐句高亮用 `verseHighlight` timings;听完自动翻页走 `advanceNarration()` —— 它是唯一的程序性翻页,并武装 **700ms Amen guard**(:70-73,shipped incident:自动翻页瞬间的误触 Amen)。
- **Amen**:`amened` 同步守卫(:471-472);未满足条件可重读但不计数(:351-352);完成 → `PrayerContext` 写 m/e + `useActivity().markToday()` + 庆祝 Lottie(:54-58)→ 下游各自反应。
- **音频生命周期**:AppState 后台即暂停、按 `musicOn/listenOn` 恢复(祷告**不做**后台播放——那是圣经朗读的特性);unmount 硬停(循环播放器不可靠,:698 附近)。

## 3. 内容与音频管线(改内容必读)

- 数据形状:bundled(`BUNDLED_COVERAGE_DAYS` 天)→ AsyncStorage 缓存 → CDN 全量(60 天/语言,7 语言,含 meditation/action/prayer 文案与节日 override)。**CDN 路径带 `/vN/` 版本段——重切内容必须升版本段,永远不做同名覆盖**(Cloudflare 缓存,CLAUDE.md R2 规则)。
- **对象身份陷阱**(PrayerFlow :~600 注释,shipped incident):verses 数组 bundled→cache→CDN 换引用但内容相同;凡 effect 必须 key 在 `verseId`/`verseDay` 原始值上,**绝不 key 在 dailyVerse 对象上**——曾经中途换源掐断播放中的音频。
- 音频:manifest 内置(verseId→文件名),音频字节按需拉取,当日 4 clips 缓存、昨日删除;新上传的 m4a/mp4 **必须 `ffmpeg -movflags +faststart`**,否则 expo-audio 静默失败。
- 每次动 daily-verses / corpus / versification:跑 `node scripts/verify_alignment.mjs`,红了不许提交。

## 4. 埋点(docs/analytics-events.md)

| 事件 | 说明 |
|---|---|
| `prayer_complete` | `slot`, `is_redo` — 唯一的流程完成信号 |
| `prayer_audio_play` | 每流程一次,`slot/lang/step/source` |
| user prop `prayer_audio_user='yes'` | 听过旁白的用户分层 |
| 已知盲区 | **没有 `prayer_start`**,流程内流失算不出(§8b 注明);要补先提案 |

`bible_audio_play` 是圣经阅读器的事件,与本流程无关,勿混。

## 5. 已定决策(勿重开,CLAUDE.md「Settled decisions」全文有效)

- 流程后插屏、app_open 热启动插屏、quiz_retry 不设上限——广告相关一律不碰。
- 旁白不自动播放;音频会话 MIX 不 duck;coach mark 规则在 `listenGuide.ts`(有测试钉着)。
- Amen guard 700ms、庆祝 Lottie 双段结构、"可重读不计数"语义。

## 6. 验证与提交纪律

```bash
npx tsc --noEmit && npx jest --silent && npx tsx scripts/i18n_audit.mjs
```

内容改动追加 `verify_alignment.mjs`。全绿才提交;commit 信息一行诗体英文、`-m` 里不用反引号;每次提交推双分支:

```bash
git branch -f main HEAD && git push origin claude/full-recovery-2026-05-25 main
```

(代理 127.0.0.1:10808 掉线时加 `-c http.proxy= -c https.proxy=`。)每个可见字符串走 `t()` + 六语言块;日期用 `localeFor(uiLang)`。实质性改动照家规发对抗性审查 agent,报告逐条对源码复核后再修——确认的修、存疑的驳。

## 7. 当前状态与观察项(2026-08-28)

- 线上 **1.5.0 (35)**;`d3d8932`(圣经朗读后台播放/锁屏)在 35 之后——若你动 PrayerFlow 的 mount 区,注意它已包含 `stopNarration()` + `applyMixAudioMode()`(修掉了旧内联调用丢 `shouldPlayInBackground` 的粘性 bug,勿回退)。
- 崩溃台账(dev-guide §13)与本流程相关的:挂载竞态补丁(`patches/react-native-reanimated+4.1.7.patch`,#8083+#9649)——**升级 reanimated 前先看 §13 的 patch 一节**;台账观察项里有"后台听音频时退后台"的框架 NPE(n=2,全在旧包)。
- 待办(内容侧,非代码):zh 等四语的圣经朗读人声缺音源——那是 Bible 阅读器域,不归你,但若 owner 拿它问你,指向 `bibleAudioCdn.ts` allowlist。
