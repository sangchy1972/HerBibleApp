# 发版手册 — AAB / IPA 从零到上架

> 这不是 EAS 文档的复述，是**这个项目踩过的坑**。每一条都对应一次真实事故或一次白费的时间。
> 通用步骤只写命令，坑写清原因——因为原因忘了就会再踩一次。
>
> 配套：`docs/release-notes-this-version.md`（商店文案）· `CLAUDE.md` → Shipping a release（简版规则）

---

## 0. 一句话流程

```
定版本号 → 内容资产上线 → 本地校验 → 双平台构建 → 提审 → 商店文案
```

**双平台永远一起发。** 每次都是 App Store + Play 同时。`npm run build:all`。
不要交付只有 Android 的命令——这条被明确要求过。

---

## 1. 版本号

改**一个地方**：`app.json` 的 `expo.version`。

- Profile 页脚读的是 `Constants.expoConfig?.version`。曾经有人把它写死成字面量，
  结果整整一个版本里，app 对用户谎报自己的版本号。
- `versionCode` / `buildNumber` **不要手改**——`eas.json` 里是
  `appVersionSource: "remote"` + `autoIncrement`，每次生产上传自动climb。
  手改会和远端打架。

**规则：主动提议版本号，然后直接改，不要问。** 按 semver 对照上一个上线版本：
有用户可见的新功能 → minor；只有修复 → patch。业主不同意会说，但他不该需要开口让你去改。

---

## 2. 构建前：内容资产必须先上线

题库、拼图画作、计划封面、法律页都走 CDN，**不进包**。构建前它们必须已经在线，
否则新功能在包里是死的。

| 资产 | 脚本 | 桶 / 域名 |
| --- | --- | --- |
| 题库 7 语种 | `scripts/upload_quiz_r2.sh` | `herbible-quiz` → quiz.everlandapps.com |
| 拼图画作 | `scripts/upload_puzzle_art_r2.sh` | 同上，`v1/art/` |
| 计划封面 / 徽章 / 祷告音频 / 法律页 | `upload_*_r2.sh` | `herbible-plans-7languages` → covers.everlandapps.com |

### 🔴 wrangler 的环境变量陷阱

`CLOUDFLARE_API_TOKEN`（或 `CF_API_TOKEN` / `CLOUDFLARE_API_KEY`）一旦存在于 shell，
**wrangler 就用它，完全忽略 `wrangler login` 的 OAuth 登录**。结果是一个永远修不好的
401 "Invalid access token"，而报错里既不提这个变量、也不提解法。

```bash
env | grep -iE "CLOUDFLARE|CF_API"       # 先查
unset CLOUDFLARE_API_TOKEN               # 有就清掉
npx --yes wrangler login
```

所有 `upload_*_r2.sh` 脚本开头都会检测并警告，但警告只在你读它的时候有用。

### 🔴 边缘缓存：同名覆盖 ≠ 生效

`quiz.everlandapps.com` 和 `covers.everlandapps.com` 都是**自定义域名**，
Cloudflare 的边缘缓存挡在 R2 前面。**同名覆盖对象之后，旧内容还会发很久。**

两种做法，选一种：

- **路径版本**（默认，最省心）：`/v1/` → `/v2/`，同时改代码里的 base URL。
  项目规则：**path-version，绝不用 per-file SHA**。
- **原地覆盖 + 手动清缓存**：Cloudflare → 域名 → Caching → Configuration →
  Purge Cache → Custom Purge → 逐条填 URL。

⚠️ **题库原地覆盖时，不清缓存的后果不是"看到旧题"，是"quiz 卡片消失"**。
`parseBankFile` 会拒绝 `bankVersion` 与 `QUIZ_BANK_VERSION` 不符的文件并返回 null，
所以边缘发旧 body 给新客户端 = 解析失败 = 功能静默下线，且不会有任何报错。

验证清缓存是否生效：

```bash
curl -sI https://quiz.everlandapps.com/v1/quiz-en.json | grep -i 'age\|cf-cache-status\|content-length'
curl -s  https://quiz.everlandapps.com/v1/quiz-en.json | head -c 80    # 看 bankVersion / count
```

### 改题库时还要同步的三个常量

`src/constants/bibleQuiz.ts`：

| 常量 | 什么时候动 |
| --- | --- |
| `QUIZ_BANK_VERSION` | **任何**题面/答案变动。它同时是本地缓存键 `quiz:bank:v{N}:{lang}` 的一部分，不改就有用户拿着旧题对新答案 |
| `QUIZ_BANK_SIZE` | 题数变化。只喂给内容预算测试，但漂了就是静默失真 |
| `QUIZ_CDN_BASE` | 只在走路径版本时改 |

---

## 3. 本地校验（红的不许提交）

```bash
npx tsc --noEmit
npx jest
```

两个都必须绿。**`tsc` 的退出码要单独取**——写成 `npx tsc --noEmit | tail -5` 之后
`$?` 拿到的是 `tail` 的退出码，永远是 0，看起来"干净"其实是瞎的：

```bash
out=$(npx tsc --noEmit 2>&1); echo "exit: $?"; echo "$out" | tail -8
```

### 并发提交时这个保证是漏的

这个仓库出现过多个 agent / 会话同时提交。**你验证的那棵树和你提交的那棵树之间，
别人可能已经改过了。** 提交前 `git status --short` 看一眼，只 `git add` 自己动过的文件，
不要用 `git add -A`。

---

## 4. 构建

```bash
npm run build:all         # Android + iOS，profile=production
npm run build:android
npm run build:ios
npm run build:version     # 查当前 versionCode / buildNumber
```

- **`eas-cli` 哪里都没装**——不是全局，也不是依赖。所有命令走 `npx --yes eas-cli@latest`，
  这正是上面这些 npm script 在做的事。直接敲 `eas build` 会得到
  `zsh: command not found: eas`。
- `android/` 和 `ios/` 都被 easignore/gitignore，EAS 每次 **prebuild 重新生成**。
  所以改本地 `AndroidManifest.xml` 是无效的——要改就改 `app.json` 的
  `blockedPermissions` 或写 config plugin（`plugins/with*.js`）。
- `.env.local` 曾经被传到 EAS 构建机上（里面有 Cloudflare Access token 和一个
  Mac 本地路径的 `GOOGLE_SERVICES_JSON`）。现在被 `.easignore` 挡掉了，别再放回去。

### 提审

```bash
npm run submit:android    # 需要 play-service-account.json（gitignored）
npm run submit:ios
```

`play-service-account.json` **只有 `eas submit -p android` 需要**。
构建不需要它，在 Play Console 手动传 AAB 也不需要——不要为了构建去找它。

---

## 5. 上架资料

- **release notes**：`docs/release-notes-this-version.md`，7 语种，每条 ≤500 字符。
  Play 用文件末尾的「Play Console 粘贴版」（带 `<lang>` 标签）；
  **只填商店列表里实际启用的语言，填了没启用的会报错**。
- **应用图标**：Play Console 要 512×512 PNG。
- 商店文案里**不写广告 / ATT / 追踪**，只写用户看得见的改进。

### SYSTEM_ALERT_WINDOW 审核答辩词（备用，Play 人工审核问起时直接贴）

> Her Bible uses SYSTEM_ALERT_WINDOW ("Display over other apps") for a single
> user-facing feature: optional daily devotional cards (the day's Bible verse,
> and a short Bible quiz). The feature is strictly opt-in — the user enables
> the permission herself on the system settings page after an in-app
> explanation, exactly the flow the Permissions policy prescribes for special
> permissions. There are two daily cards, each tied to a reminder time the
> user chose herself; a card appears when the user unlocks the phone and may
> reappear on later unlocks that day ONLY while the user has not interacted
> with it — a single tap (opening it, or the X) dismisses that card for the
> day, and hard limits cap appearances regardless. Cards are never shown on
> the lock screen, are clearly branded with the app icon and name, and
> contain only app content — no ads, no promotions, no third-party material.
> The feature can be turned off at any time via an in-app switch (Settings →
> Cards on your screen) or by revoking the permission; while it is on, a
> visible (low-priority) notification discloses that it is active.

政策核对记录(2026-08-16,原文见 dev-guide §10):SAW 属 special permission,
官方指定的申请方式就是跳系统设置页;广告政策封杀的是**广告**出现在应用外
(明确点名 overlays)——所以悬浮卡里**永远不能**出现广告/促销/paywall 入口,
这条红线写在 dev-guide §10。2026-08-21 起改为解锁驱动(owner Option A):
重现语义、护栏与上文答辩词一致,dev-guide §10 有完整机制。

### 前台服务 specialUse 申报(1.5.0 起,每次提审 Play 会要求)

悬浮卡的解锁监听跑在 `foregroundServiceType="specialUse"` 的前台服务里。
**Play Console → App content → Foreground service permissions** 里为
`FOREGROUND_SERVICE_SPECIAL_USE` 提交申报,用途栏直接贴:

> The app offers an optional, user-enabled daily devotional card (Bible verse
> / Bible quiz) drawn over the home screen when the user unlocks the phone.
> Unlock events (ACTION_USER_PRESENT) cannot be received by a stopped app, so
> a minimal foreground service holds the broadcast receiver. The service does
> no polling and holds no wake locks; it exists solely to hear the unlock and
> show the card the user asked for. It runs only while the user has enabled
> the feature AND granted "Display over other apps", and stops itself
> otherwise. No existing dedicated foreground service type covers
> "show user-requested content at unlock".

首次带此申报的提审可能被要求演示视频:录一段「开开关 → 授权 → 锁屏 →
解锁 → 卡片出现 → 点 X 当天不再出现」即可。

### 前台服务 mediaPlayback 申报(圣经朗读后台播放,2026-08-24 起真实使用)

`FOREGROUND_SERVICE_MEDIA_PLAYBACK` 来自 expo-audio 的库清单;圣经章节朗读
现在支持后台播放 + 锁屏/通知媒体控件,该权限是**真实使用**——不要移除。
**Play Console → App content → Foreground service permissions → Media
playback**:勾选 **Media playback**("Show picture in picture" 与 "Other"
不勾),Video link 填一段 30–60 秒竖屏录屏(YouTube 不公开链接),内容:

1. 打开 app → Bible 标签 → 点粉色耳机按钮开始朗读(EN/ES/PT 才有真人音源,
   录 EN 最稳);
2. 按 Home 退到桌面 → **声音继续**;
3. 下拉通知栏 → 媒体通知可见(书名+章号、播放/暂停、快进/快退);
4. 锁屏再点亮 → 锁屏控件可暂停/恢复;
5. 回 app 结束。

---

## 6. 上架后

- 真机验证一次 **Google 登录**。EAS 用自己托管的 keystore，SHA-1 与本地 debug 不同——
  这条只有正式签名包能验。
- 真机发一封**邮箱登录邮件**，长按按钮复制链接，确认域名是 `everlandapps.com`
  而不是 `firebaseapp.com`（详见 `docs/email-signin-templates.md`）。
- 旧的 CDN 路径版本（如 `/v1/`）**先别删**——未升级的用户还在拉它。铺开后再清。

---

## 7. 内容资产的两条硬约束

这两条不属于构建流程，但每次动内容都会撞上，写在这里免得再翻代码。

### 拼图画作：只能追加，不能插入

`completedPaintings` 存的是**数量不是 id 列表**，索引 2 的意思是「今天这个数组的第三项」。
往中间插一幅，**线上已完成 N 幅的用户，收藏里的画会当场变成另外几幅**。

所以 `QUIZ_ART` 是**每一批内部按圣经年代排序，跨批次不排序**，这是永久的。
2026-08-08 那批八幅（创 3 / 创 28 / 创 37 / 创 48…）本该排在最前面，只能接在第 25 位起。

切图规格（与前 24 幅一致）：长边 **full 1200 / thumb 420**，JPEG **q82 / q80**，
progressive，去 EXIF，**全部横构图**，比例落在 **1.00–1.50**。

`FIRST_ART_ID` + `assets/puzzle/first.jpg` 是唯一打进包的那一幅，
保证没网的新用户也能完成第一幅。**改数组顺序时必须同步检查它**——否则会出现
「唯一该离线可用的那幅，恰好是唯一不可用的那幅」。

### 奖励解锁：谁是约束方会翻转

- 画作每 `TILES_PER_PAINTING = 4` 组一幅
- 卡片每 `MYSTERY_EVERY = 3` 组一张
- 每组 `SET_SIZE = 5` 题；每日上限 `DAILY_SET_LIMIT = 3` 组

`bankSizeToCollectEverything()` 取两者的大者。**加内容会改变谁在约束**：
24 幅画时卡片是约束方（120 组 = 600 题），加到 32 幅后画作成了约束方（128 组 = 640 题），
连带「用户最后收集到的是卡片还是画」也翻转了。

`__tests__/quizLifecycle.test.ts` 钉着这些数。**它红了通常不是测试过时，是内容预算变了**——
先算清楚再改断言。
