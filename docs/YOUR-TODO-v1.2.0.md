# 你要做的事 — v1.2.0 上线清单

写给你自己操作的。**顺序不能换**：内容资产必须先在线，包才有意义（`release-build-runbook.md` §2）。

代码这边全部完成：`npx tsc --noEmit` 退出 0，777 个测试全绿，`app.json` 已经是 `1.2.0`。

---

## A. 上传 33 幅拼图画作 ⬅️ 必做，现在线上是 404

不做的后果：所有拼图永远是灰底加锁头。不崩，但整个奖励系统看起来是坏的。

**本地目录**（Finder 里 <kbd>⇧⌘G</kbd> 粘贴）：

```
/Users/liwencao/Desktop/classical-bible-paintings/_upload-to-r2/v1/art/
```

里面是 `full/`（33 张，1200px）和 `thumb/`（33 张，420px）。

**上传**：

1. Cloudflare Dashboard → **R2** → bucket **`herbible-quiz`**
   （注意不是 `herbible-plans-7languages`，那个是计划封面）
2. 确认当前在 **bucket 根目录**（面包屑只有桶名，没有子目录）
3. 把 `_upload-to-r2/` 里的整个 **`v1` 文件夹**拖进去

这个目录结构本身就是按 R2 的 key 排好的，落地就是 `v1/art/full/017.jpg`，不用改名。

**验证**（一新一旧）：

```bash
curl -sI https://quiz.everlandapps.com/v1/art/full/017.jpg  | head -3
curl -sI https://quiz.everlandapps.com/v1/art/thumb/085.jpg | head -3
```

两条都要 `HTTP/2 200`。

> 全是**新 key**，边缘上没有旧对象 —— **不用清缓存**。跟 B 那件事不一样。

---

## B. 清题库的边缘缓存 ⬅️ 必做，英语和西班牙语用户现在没有 quiz

线上文件是对的（origin 已经是 v3/650），但 Cloudflare 边缘还在发旧的。

**先查清楚哪几个语言坏了**，一条命令：

```bash
for L in en es fr de pt zh-Hans zh-Hant; do
  printf '%-9s ' "$L"
  curl -s "https://quiz.everlandapps.com/v1/quiz-$L.json" | head -c 60
  echo
done
```

每行都必须出现 `"bankVersion":3`。我这边实测过的：

| 语言 | 状态 |
| --- | --- |
| `en` | ❌ 边缘发的是 bankVersion 2 / 327 题 |
| `es` | ❌ 同上 |
| `fr` | ✅ 已经是 3 / 650 |
| 其余 4 个 | 未测，用上面的命令查 |

**清缓存**：Cloudflare → 选 `everlandapps.com` → **Caching** → **Configuration** →
**Purge Cache** → **Custom Purge** → 选 URL，把坏掉的那几条**完整 URL** 逐条贴进去：

```
https://quiz.everlandapps.com/v1/quiz-en.json
https://quiz.everlandapps.com/v1/quiz-es.json
```

清完等 30 秒，把上面那条 `for` 命令再跑一遍确认。

> **为什么这件事等不得**：`parseBankFile` 会拒绝 `bankVersion` 不符的文件并返回
> null，所以边缘发旧 body 给新客户端 **不是"看到旧题"，是首页答题卡片整个消失**，
> 而且每次前台重试都命中同一份缓存，永远不会自愈。没有任何报错。
>
> 如果 purge 反复不生效，就按 `bibleQuiz.ts` 自己注释说的办法：把 `QUIZ_CDN_BASE`
> 从 `/v1` 改成 `/v2`，用 `scripts/upload_quiz_r2.sh` 重传一份。告诉我，我来改。

---

## C. 出包 —— 两个平台一起

前提：A 和 B 都验证通过了。

```bash
cd ~/HerBibleApp
npm run build:all
```

`build:all` 同时出 Android 和 iOS。**不要只出一个平台** —— 每次发版两个商店一起走。

几件不用管的事：

- `eas-cli` 全局没装、也不是依赖。`npm run build:*` 里已经是 `npx --yes eas-cli@latest`，别自己敲 `eas build`。
- `versionCode` / `buildNumber` 是远程自增（`appVersionSource: "remote"`），**不要手改**。
- 只有 `app.json` 里的 `version` 是手写的，已经是 `1.2.0`。
- `play-service-account.json` 构建阶段用不到。

构建完 EAS 会给两个链接。

**提审**：

```bash
npm run submit:android   # 需要 play-service-account.json
npm run submit:ios
```

或者在 Play Console / App Store Connect 手动传 AAB / IPA —— 手动传不需要那个
service account 文件。

**上架文案**：`docs/release-notes-this-version.md`（7 语种，每条 ≤500 字符，Play
Console 用最下面那段带 `<lang>` 标签的粘贴版）。

> ⚠️ 这份文案是在这一批 quiz 改动**之前**写的，只提了首页答题卡和结算页改版，
> 没提 33 幅画作 / 43 张卡 / Explore 搜索。**要不要我按现在的实际内容重写一版，你说一声。**

---

## D. Firebase 登录邮件 —— 7 语种主题（旧账，不挡发版）

上次做到一半：自定义域名点了、发件人名改成 Her Bible 了，剩下语言那部分。

1. Firebase Console → **Authentication** → **Templates** → **电子邮件地址登录**
2. 模板卡片右上角有个**语言下拉**（默认 English）
3. 选一个语言 → 点 ✏️ → 改 **Subject** → Save
4. 换下一个语言，重复

七条主题在 `docs/email-signin-templates.md` 的「Path A」那一节，直接复制。

> 语言下拉是**每次只作用于当前选中的那个语言**，所以要切七次。这不是 bug。
> 用户收到哪一版由 `setLanguageCode` 决定，App 已经按界面语言设好了。

---

## E. Cloudflare DMARC 记录（旧账，不挡发版）

作用是让登录邮件不进垃圾箱。做法在 `docs/email-signin-templates.md` 第 220 行起，
有完整的四条记录说明。

一句话版：Cloudflare → `everlandapps.com` → **DNS** → **Add record**

| 字段 | 值 |
| --- | --- |
| Type | `TXT` |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:dmarc@everlandapps.com` |

> ⚠️ 文档里特别标了：**不要**把 Firebase 给的 SPF 那行当成新记录加进去，
> 以及 `rua` 的邮箱**必须是你自己域名下的**。先读那一节再动手。

---

## 做完之后

CDN 那两件（A、B）做完就告诉我，我把 `docs/release-build-runbook.md` 的验证清单
勾掉，需要的话顺手重写发版文案。
