# 新应用交接文档 — 轻量打卡版圣经 App

写给接手新项目的程序员。母项目是 **HerBibleApp**(Everland Apps,RN 0.81 + Expo 54,
七语种女性灵修应用)。这份文档浓缩了母项目沉淀下来的工程标准、设计标准、
广告请求逻辑设计,并标注了每一份可直接搬走的文件的位置。

**新应用范围**(owner 2026-08-16 定):
- 保留:每日经文、**早晚打卡(核心行为)**、streak 体系、提醒/悬浮卡等留存系统、插页广告变现;
- 去掉:音频功能、Quiz、阅读计划(Plans)两大板块;
- 整体更轻。

---

## 0. 一键打包交接文件夹

在母项目根目录跑(macOS 自带 rsync,`-R` 保持相对路径的目录结构):

```bash
cd /Users/liwencao/HerBibleApp && rsync -aR --exclude='android/build' \
  docs/new-app-handoff.md \
  docs/dev-guide.md \
  docs/release-build-runbook.md \
  docs/ad-routing.md docs/ad-unit-ids.md docs/ad-waterfall-US.md docs/ad-mediation-map.html \
  docs/analytics-events.md \
  docs/pre-launch-qa-checklist.md docs/play-policy-audit-report.md \
  docs/email-signin-templates.md docs/herbible-privacy.html \
  CLAUDE.md \
  src/constants/theme.ts src/constants/adPacing.ts src/constants/streakLevels.ts \
  src/services/adFrequency.ts src/services/adEngine.ts src/services/adLadders.ts \
  src/services/adValueStore.ts src/services/adRevenue.ts src/services/adRevenueConfig.ts \
  src/services/ads.ts src/services/usInterstitial.ts src/services/interstitialVisibility.ts \
  src/services/firebase.ts src/services/iap.ts src/services/att.ts \
  src/state/nudgePriority.ts src/state/NudgeCoordinatorContext.tsx src/state/promptSurface.ts \
  src/state/notifeeReminders.ts src/state/overlayCardsPrefs.ts \
  src/components/StreakDailyHost.tsx src/components/shared/DayCircle.tsx src/components/shared/FireFlame.tsx \
  src/i18n/sourceCatalog.ts scripts/i18n_audit.mjs \
  modules/expo-overlay-cards modules/expo-settings-coach modules/expo-pin-widget \
  plugins/withCookieWarmup.js plugins/withAdMobMediation.js plugins/withAndroidPackageQueries.js \
  ~/Desktop/new-app-handoff/
```

⚠️ 复制走的代码里凡是 **id 类的东西都是母应用专属**,新应用必须全部新建:
bundle id、Firebase 项目、AdMob 应用与广告单元、R2 bucket、Cloudflare Access token。
文件只当**模板和逻辑参考**。

---

## 1. 做事风格(不可谈判的几条)

完整版在 `docs/dev-guide.md`(逐模块规则手册 + §13 错误台账,**最重要的一份文件**)
和根目录 `CLAUDE.md`。浓缩:

1. **Crash-free 不可谈判。** 边界处防御性判空;native module 一律守卫式
   `require` / `requireOptionalNativeModule`,旧客户端降级为 no-op,永不 crash
   (模式见 `modules/*/index.ts`)。
2. **TypeScript strict,修类型不压类型。**
3. **i18n 在每一次改动上都不可谈判。** 每个新 `<Text>`/Alert/placeholder 必须走
   `t()`;字符串常量表必须按语言分键;日期格式化必须 `localeFor(uiLang)`。
   架构:`src/i18n/sourceCatalog.ts`(EN 源 + context 注释,单一事实)+
   `strings.ts`(六语翻译)+ `scripts/i18n_audit.mjs`(提交前必跑,missing 必须为 0)。
4. **提交前三件套:`npx tsc --noEmit` + `npx jest` + `npx tsx scripts/i18n_audit.mjs`。红的不许提交。**
5. **先审计后动手。** 修 bug 先找 root cause 证据(完整 stack trace、可复现路径),
   不做"看起来像"的修复;不做投机性升级(版本冲动要拿 diff 证据说话)。
   台账在 dev-guide §13,新项目照抄这个习惯。
6. **纯逻辑抽成纯函数并配 jest。** 广告节奏、streak 计算、nudge 仲裁在母项目全是
   可单测的纯函数,这是回归防线。
7. **成本意识。** CDN 用 Cloudflare R2(零出口费);缓存失效用路径版本号
   (`/v1/` → `/v2/`),永不按文件 SHA;能靠缓存的不加计费转换。

## 2. 设计系统标准

细则在 dev-guide §1,硬规则:

- **矢量优先,禁 emoji**(图标 Feather/自绘 SVG)。
- **颜色永不硬编码**,全部走 theme token(`src/constants/theme.ts`:ROSE/LAV/TXT/
  TXTSUB/GOLD/P/BG…)。背景**白/灰白**,玫红只做点缀不做底色。
- 主按钮:`BTN_RADIUS`(17)+ 粗体标签;卡片:radius 20 **无阴影平面卡**。
- 字体:标题 Lora(**loraBold 必须配 fontWeight '600',永不 '700'**——700 会让
  Android 掉回系统无衬线),正文 Lato / Noto Sans(CJK)。
- **每个底部 sheet 必须可下滑关闭**(`useSheetPan` 模式)且注册 `useSheetSurface`
  (防弹窗互撞)。sheet 入场用 **shared value 驱动,不用 `entering=`**(RN Modal
  树里 Reanimated 布局动画不可靠——非 Modal 树可以用 `entering` 交错入场)。
- **自适应 iPhone SE → Pro Max**,不写会爆的固定宽度;新增触达手机的界面先按 SE 宽度算一遍。

## 3. 广告请求逻辑设计(点名要求,完整写出)

> 源码即真相:`src/constants/adPacing.ts`(节奏常量)、`src/services/adFrequency.ts`
> (何时**问**要不要出广告)、`ads.ts`(展示路径)、`adEngine.ts`/`adLadders.ts`/
> `adValueStore.ts`(Android 价值引擎)、`interstitialVisibility.ts`(共享时钟)。
> 图文版:`docs/ad-routing.md`、`docs/ad-waterfall-US.md`、`docs/ad-mediation-map.html`。

### 3.1 总原则
- **只做插页(interstitial)**。无 banner、无激励、无原生——所以 mediation 里只有
  Interstitial placement 会 fill。
- **全局唯一间隔底线**:`MIN_AD_INTERVAL_MS = 60_000`,只在 `adPacing.ts` 定义一处。
  历史教训:降到 30s 曾让"长创意关闭→又满足间隔→再出一条"的链条变得可达。
- **广告免除权益**:IAP 一个 "ad-free" 权益,由终身买断 + 年订 + 月订三个商品任一
  授予(`services/iap.ts`),无后端、信任商店客户端。展示路径统一走 `areAdsRemoved()` 门。
- **iOS 初始化顺序:ATT 先于 ads init**(`ensureAttRequested().finally(initAds)`),动不得。

### 3.2 触发点位(打卡版适用的子集)
| 点位 | 规则 | 新应用 |
|---|---|---|
| `prayer_end` 类(完成一次打卡/祷告后) | 完成即请求,受全局 60s 底线 | ✅ 核心点位 |
| `app_open` 热启动 | 后台 ≥15s 回前台出一条。三重防误伤:①**广告自己引起的后台不算**(插页在 Android 是独立 Activity,后台原因必须在 'background' 事件时刻盖章,等 'active' 时可见性标志已被清);②rate 弹窗跳商店前 `suppressNextHotStart()`;③**悬浮卡点进来的入口豁免**(原生落盘时间戳,同步读,15s 宽限) | ✅ 保留(母项目已接受政策风险的结算决定) |
| `nav_churn` | tab 间切换 >5 次 且 距上次广告 ≥60s → 在下一次切换时出;一次 transition 只一发,双计数器同置零 | ✅ 可保留 |
| `quiz_retry` / `plan_day_done` | 母项目专属 | ❌ 新应用无此板块 |
| 反无效流量 | 任何"完成→广告"的点位加 **400ms 延迟**——不是频控,是防双击落在创意上(AdMob 账号安全) | ✅ 必须保留 |

**共享时钟纪律**:所有展示路径必须调 `noteInterstitialShown()` 盖章
(`interstitialVisibility.ts`)——新增第 N 条展示路径时最容易忘的就是这个。

### 3.3 Android 价值引擎(买量时才需要,可后置)
- eCPM 阶梯 + floor:US 专属阶梯只在 `region==='US' && !__DEV__` 生效;
  其他地区走 WW 阶梯;巴西属 WW。
- 价值存储用 **raw USD ×1000 后再比较**(避免浮点);T2 国家净值不对称处理;
  新手退出条件 day≥3 && imps≥2(细节以 `adEngine.ts` 头注为准)。
- **买量埋点双事件设计**:
  - 保留事件 `ad_impression`:**一个平台只有一个生产者**——Android 靠
    AdMob↔Firebase 后台关联自动上报,iOS 手动上报(remote flag
    `manualAdImpression {ios:true, android:false}`)。两边同时报就会双计。
  - 自定义事件 `ad_impression_custom`(买方优化用):Android 在 **PAID 回调**带
    value/currency/precision;iOS 在展示时上报**且永不带 value**。
  - **新用户的第一条广告价值不上报**(污染买量信号)。
  - `normalizeValue()` 千分位护甲:最右侧分隔符视为小数点("1.234,56"→1234.56),
    mediation 适配器会把数字字符串化,巴西等地区格式必须防。
- 中介:Meta Audience Network 以 **bidding** 形式接在 AdMob 里;适配器建好但
  `enabled:false`(`plugins/withAdMobMediation.js`),等量起来再开。

### 3.4 政策红线(2026-08-16 对照官方原文核过)
- **悬浮窗(overlay)里永远不放广告/促销/paywall 入口**——Play 广告政策明文:
  "Ads may only be displayed inside of the app serving them… This includes
  overlays"。悬浮卡合法恰因它只装内容。
- 从悬浮卡点进应用的那一次进入**不出开屏插页**(用户点的是灵修卡,落地先见广告
  = Better Ads 明令的形态)。
- SYSTEM_ALERT_WINDOW 的审核答辩词模板在 `docs/release-build-runbook.md` §5。

## 4. 打卡应用最值钱的可搬资产(留存系统)

这些就是为"早晚打卡"长出来的,新应用可以近乎原样搬:

| 系统 | 位置 | 说明 |
|---|---|---|
| **Nudge 协调器** | `state/nudgePriority.ts` + `NudgeCoordinatorContext.tsx` + `promptSurface.ts` | 全应用同刻只出一个弹层:优先级仲裁、每波预算、30s 间隔、tab 路由门、sheet 深度门。**任何新弹窗都必须接入**,否则互撞。接入 checklist 在 dev-guide §4 |
| **Streak 体系** | `constants/streakLevels.ts`、`components/StreakDailyHost.tsx`、`shared/FireFlame.tsx`、`shared/DayCircle.tsx` | 等级阶梯 3/5/7/14/30;**每日首开全屏仪式屏**(连续天数语义)与详情页(累计天数语义)刻意分叉,别"统一" |
| **提醒体系** | `state/notifeeReminders.ts` | 早/晚富通知(用户可调时刻)+ 固定时段 extras + 隔 2h 的清醒时段横幅;channel/分组/防双发逻辑都踩过坑 |
| **悬浮卡(重点)** | `modules/expo-overlay-cards/` | AlarmManager 冷进程→WindowManager 画卡,应用死了也能弹;亮屏解锁才弹、8 分钟重试×5"拿起手机就见"、每日一次、开机重排、小米二段权限、事件先落盘回头再进 Firebase。对打卡应用是核弹级留存件,dev-guide §10 有完整物理学 |
| **Widget** | `modules/expo-pin-widget/` + `widgets/` | 一键 pin + 每日经文镜像(~1MB RemoteViews 上限) |
| **设置页浮教练** | `modules/expo-settings-coach/` | 跳系统设置后浮在设置页上的引导卡(注意:它自己就是悬浮窗,SAW 未授权前浮不出来) |
| **评分两段式** | `components/RatePromptSheet.tsx` | Yes→感谢屏(五星圈第五颗)→再跳商店;店内评审 API 的所有坑(静默 no-op、离线、focus 探针)都写在文件里 |
| **ANR 修复** | `plugins/withCookieWarmup.js` | 首次网络请求触发 WebView cookie 初始化跨线程锁的 ANR,后台预热修复(trace 实证过) |

## 5. 发布标准

完整 runbook:`docs/release-build-runbook.md`(为什么那部分最重要)。骨架:

- **双平台一起发**,`npm run build:all`;EAS 走 `npx --yes eas-cli@latest`。
- 版本号只活在 `app.json` 一处;versionCode/buildNumber 远端自增,永不手改。
- 语义化版本自己提、自己改,owner 不同意会推翻——不要等着被吩咐。
- 商店文案 7 语种各 ≤500 字符;只填商店已启用的语言。
- R2 上传用 wrangler;shell 里有 `CLOUDFLARE_API_TOKEN` 时 wrangler 会无视
  `wrangler login`(陈年 token 401 到天荒地老)。

## 6. 新项目起步 checklist(账号/后台层)

1. 新 bundle id(双平台同 id)、新 Firebase 项目(display name ≠ project id,别搞混)、
   `google-services.json` / `GoogleService-Info.plist`。
2. 新 AdMob 应用 + **新广告单元**(只建 Interstitial);买量前把 AdMob↔Firebase 关联。
3. IAP 三商品一权益照抄(终身/年/月,双商店同 id 前缀换新)。
4. R2:一个内容 bucket + 自定义域(路径版本化 `/v1/`);Cloudflare Access service
   token 若要内联进客户端,**必须 Non-expiring**(会过期的 token 在不能热更的客户端
   面前 = 定时事故,母项目吃过这个思考)。
5. EAS 项目:`appVersionSource: "remote"` + autoIncrement。
6. ATT 文案、Play 数据安全表、SAW 答辩词(§3.4)提前备好。
7. i18n 从第一天就上 sourceCatalog + audit 脚本——事后补七语是数量级的痛。

---

*生成于 2026-08-16,基于 HerBibleApp 主分支当日状态。有冲突时以 dev-guide 和源码为准。*
