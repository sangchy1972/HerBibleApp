# 广告路由总览 — 哪个用户拿到哪个单元

> 现状记录，不是设计提案。写于 2026-08-05，对照代码逐行核对过。
> 姊妹文档：`ad-unit-ids.md`（ID 注册表）· `ad-waterfall-US.md`（美国阶梯的内部机制）
>
> ⚠️ **2026-08-05 晚间更新：Android 已整体切换到「广告请求逻辑交付规格 v1.0」引擎**
> （`services/adEngine.ts` + `adLadders.ts` + `adValueStore.ts`）。下文 §1–§2 的
> 路由描述从此**仅适用于 iOS**；Android 的现行逻辑见文末 **§7**。
> 展示触发层（§3）对两端仍然有效，未改动。
>
> **这份文档存在的理由**：「美国 / 非美」这条分叉只切在**一处**，不是切在整条链路上。
> 三条广告路径里只有一条分地区，另外两条全球统一——这是最容易搞混的地方。

---

## 1. 三条独立的路径

它们**互不相干**，各自有各自的单元、各自的加载时机、各自的展示入口。

| # | 路径 | 分地区？ | Android 单元 | iOS 单元 | 定义处 |
| --- | --- | --- | --- | --- | --- |
| ① | **首开 onboarding 插屏** | ❌ **全球同一套** | `…/5004598985` | `…/7247618944` | `ads.ts` → `REAL_ONBOARDING_UNIT_ID` |
| ② | **主插屏 · 美国** | ✅ | `HB_int_splash_*` × 26 | `HB_ios_splash_*` × 26 | `usInterstitial.ts` → `ANDROID_SUFFIX` / `IOS_SUFFIX` |
| ③ | **主插屏 · 其他所有地区** | ✅ | `…/5238876625` | `…/8692353122` | `ads.ts` → `REAL_INTERSTITIAL_UNIT_ID` |

Publisher 一律 `ca-app-pub-4656643588243987`。

**② 和 ③ 是二选一**，同一个用户只会走其中一条；**① 和它们并行**，是第三个独立请求。

### ① 为什么不分地区 — 这是遗留状态，不是设计

首开插屏在 `initAds()` 里**先于**路由判定就发出去了（`preloadOnboarding()`，`ads.ts:318`），
理由是它要抢首开那几秒的加载窗口。代价是：**美国用户人生中第一条曝光不进阶梯**，
所以那次曝光的 paid 回传也不参与阶梯的价值发现（阶梯只能靠自己的第一次展示建窗口）。

### ③ 为什么是专用单元

注释（`ads.ts:80-86`）写明：Android 的全球流量原先跟美国阶梯的 `unit0`（`3482477831`）
共用一个单元，导致 AdMob 后台里美国阶梯的兜底层统计被全球流量污染。现在各走各的。

---

## 2. 路由判定

`ads.ts:319-320`，`initAds()` 内，**每次冷启动算一次**：

```ts
const region = deviceRegion();
const useController =
     region === 'US'
  && (Platform.OS === 'ios' || Platform.OS === 'android')
  && !!InterstitialAdCls          // 原生模块在
  && !__DEV__;                    // 生产包
```

| 用户情形 | 走哪条 | 用的单元 |
| --- | --- | --- |
| 美国 + 生产包 | ② 26 层阶梯 | 真实阶梯单元 |
| 美国 + **dev 包** | ③ 单单元 | ⚠️ **Google 测试单元** |
| 非美 | ③ 单单元 | 真实全球单元 |
| **地区读不出来（`null`）** | ③ 单单元 | 真实全球单元 |
| 原生模块缺失（Expo Go 等） | 不发广告 | — |

埋点：`logEvent('ads_route', { region, path: 'us_controller' | 'preload' })` — 冷启动各发一次，
可以直接用它统计真实分流比例。

### ⚠️ 阶梯在 dev 里永远跑不到

阶梯那 26 个 ID 是**活单元，没有 test 对应物**。dev 包里跑它 = 自己给自己的广告刷曝光 =
AdMob 封号风险。所以 `!__DEV__` 是硬闸门。

**要验证阶梯，只能**：release / internal testing / TestFlight 包，
或者把设备注册成 AdMob 测试设备。

### 地区判定 = 设备 locale，不是 IP

`services/deviceRegion.ts`，三级降级：

1. `Intl.DateTimeFormat().resolvedOptions().locale` — **新架构（bridgeless）下唯一可靠的源**
2. `NativeModules.SettingsManager` / `I18nManager.localeIdentifier` — 旧架构兜底
3. 都失败 → `null` → 走 ③

> 注释里记着一次真实事故：新架构下 `SettingsManager` 在 iOS 上是 `undefined`，
> 曾经**把所有用户静默地踢出了美国阶梯**。Intl 那条是修复。

**它是 AdMob 实际投放国家（按 IP 判定）的客户端代理，两者会不一致。**
一个人在美国、手机 locale 设成 `zh-CN` → 我们判非美走 ③，但 AdMob 按美国 IP 投放。
反之亦然。要换真实 geo 信号，只需替换 `deviceRegion()` 这一个函数。

---

## 3. 展示触发 — 这一层全球统一，不分地区

实现：`services/adFrequency.ts` 决定「何时」，`ads.ts` / `usInterstitial.ts` 执行「展示」。

| placement | 触发点 | 哪些用户 | 调用处 |
| --- | --- | --- | --- |
| `prayer_end` | 祷告流程结束 | 全部 | `PrayerFlow.tsx` |
| `plan_end` | 计划当日结束 | 全部 | `PlanDayWalk.tsx` |
| `gospel_end` | Gospel & Psalm 读完 | 全部 | `GospelPsalmReader.tsx` |
| `quiz_retry` | 点「Try those again」（延时 400ms） | 全部 | `QuizChallengeScreen.tsx` |
| `nav` | 每 3 次合格跳转 | **仅 day ≥ 3** | `adFrequency.ts` |
| `app_open` | 退后台 ≥15s 回前台 | **全部用户(day 0 起)** | `adFrequency.ts` |

- 天数 = 距首次启动的自然日（安装当天 = day0），常量 `AGGRESSIVE_FROM_DAY = 3`
  —— **现在只管 `nav` 一个触发**；`app_open` 自 2026-08-08 起对所有用户开放（业主决定）。
- `NAV_EVERY = 3`。「一次跳转」的计数细则见 `ad-waterfall-US.md` §8.5。
- `quiz_retry` **无每日/每次上限**，且这是**既定决策**（CLAUDE.md → Settled decisions），
  审查会反复标记它，不要再加 cap。那 400ms 延时不是频控，是防双击落到创意上（无效流量风险）。
- `app_open` 热启动插屏同样是**既定决策**，Play 的 Disruptive Ads 风险已知并接受。
  2026-08-08 起覆盖**全部用户**（原为 day ≥ 3）——触达面变了，频次约束没变：
  60s 全局间隔、前台判断、去广告开关、商店评价回程豁免全部照旧。

`maybeShowInterstitial()` 内部再分流（`ads.ts:432`）：
美国走 `usOnShowOpportunity(placement)`，非美走本地 `interstitial.show()`。

---

## 4. 🔴 两个同名常量

| 位置 | 值 | 管谁 |
| --- | --- | --- |
| `usInterstitial.ts:122` `MIN_INTERVAL_MS` | 60s | ② 美国阶梯 |
| `ads.ts:181` `MIN_INTERVAL_MS` | 60s | ③ 非美单单元 |

**当前两个值相同，但它们是两个互不相干的常量。**
改一个，另一条路径纹丝不动，而且改的人多半以为自己改的是全局——
这是个安静的坑，不是笔误。真要统一，抽一个共享常量出来。

> 📌 `ad-waterfall-US.md` §10 曾写 `MIN_INTERVAL_MS=90s`，**是过期的**；
> 代码里两处都是 60s。已在该文档中更正。

---

## 5. 现状里三件该知道的事

**① 非美地区从来没做过。**
`ad-waterfall-US.md` 开头第 4 行原话：「其他国家走 `ads.ts` 的简单单单元路径，**后续单独实现**」。
这个「后续」至今没发生。非美用户 = 一个无底价单元，没有价值路由、没有阶梯、没有兜底网、
没有按昨日均值定起点。所有那些机制都只服务美国。

**② 首开曝光不进阶梯。** 见 §1 ①。

**③ 自建瀑布流的政策风险是已知且已接受的。**
AdMob 行为政策禁止「通过发布商自建系统按实时价格信息程序化分配广告请求」。
决策记录在 `ad-waterfall-US.md` §11：保留瀑布流 + 工程加固，接受残留风险。
**把阶梯复制到更多地区 = 按比例放大这个风险敞口**，不是零成本扩张。

---

## 6. 相关文件索引

| 文件 | 职责 |
| --- | --- |
| `src/services/ads.ts` | SDK 初始化、地区路由、非美单单元路径、onboarding 单元、`maybeShowInterstitial` |
| `src/services/usInterstitial.ts` | 美国 26 层阶梯状态机 |
| `src/services/deviceRegion.ts` | 地区判定（三级降级） |
| `src/services/adFrequency.ts` | 何时展示（day 分档、nav 计数、热启动） |
| `src/services/adRevenue.ts` | 收入漏斗 / 阈值，按 `deviceRegion()` 取阈值 |
| `src/services/adRevenueConfig.ts` | 远程配置 |
| `plugins/withAdMobMediation.js` | 中介适配器开关（Liftoff+Meta 开，Pangle/InMobi 关） |
| `src/services/adEngine.ts` | **Android 请求引擎**（缓存、节奏、熔断、展示） |
| `src/services/adLadders.ts` | 引擎的纯逻辑：三条阶梯、地区分组、选层选档 |
| `src/services/adValueStore.ts` | paid 事件的原子写回（值窗口 / 计数 / LTV） |
| `docs/ad-unit-ids.md` | 单元 / placement ID 注册表 |
| `docs/ad-waterfall-US.md` | 美国阶梯的内部机制（底价、窗口移动、退避） |

---

## 7. Android 现行逻辑 — 请求引擎（spec v1.0，2026-08-05 上线）

规格源文件：`~/Downloads/her_bible_ad_request_spec.html`；业主 Q&A 的修订全部并入下表。

### 分层（每次发请求前重新判定，绝不缓存判定结果）

| 状态 | 条件 | 请求层 | 安全网 |
| --- | --- | --- | --- |
| 纯新用户 | imps < 2 | newbie(5s) + 探测层(20s，3 次真实 no-fill 当日熔断) | US/T2→`splash_0`、WW→`ww_0`，**常驻** 3s |
| 混合期 | imps ≥ 2 且 day ≤ 2 | newbie(5s) + 主层(30s/6 次) + 副层(3s，主层首发后 3s 起) | US→`splash_0`、T2/WW→`ww_0`，**仅缓存=0** 3s |
| 老用户 | day ≥ 3 且 imps ≥ 2 | 主层 + 副层（同上） | 同混合期 |

- newbie = `HB_newbie_splash_text_00`(5004598985)，退出条件 **day≥3 且 imps≥2**；
  "onboarding 只展示一次"的旧锁已废除，它在整个新用户期反复供给缓存池。
- 探测层：US `splash_1`($300) / T2 `splash_26`($100) / WW `ww_1`($80)。
- 主层：`target_eCPM = avg(最近2次原始USD) × 1000 × 1.3` → 本区阶梯底价 ≥ target 的最低档；
  低于本区最低档 → 最低档 + 本区无底价层；超本区封顶 → **借美国阶梯**；> $500 封 `splash_25`。
- 副层：最近 1 次值所在档下移一档；触底 → 本区无底价层。**跨区借用只发生在主层。**
- T2 安全网**新老不对称是业主定案**：新用户=`splash_0`，老用户=`ww_0`。
- 三条阶梯：US splash_2-25($40-500/步20)、T2 splash_27-50($15-130/步5)、WW ww_2-25($8-54/步2)。

### 硬规则

- **存储全为原始单次 USD 收入**（`adEngine:value:v1`：last3/imps/max/ltv/全量样本≤1000），
  eCPM 只在比较瞬间 ×1000 —— 不存 eCPM。
- **网络错误不计熔断**（业主确认）：退避重试同一单元；只有真实 no-fill 计 3/6 振。
  熔断按单元记录、当日有效、同日重启恢复（`adEngine:day:v1`）、本地自然日清零。
- 缓存池全局 2 条；满 → 最低优先级在途标记废弃（结果到达即丢，RN 库无取消 API）。
  **优先级 = 底价高者先，newbie 介于实底价与无底价之间，无底价永远最后**（展示与保留同序）。
- 展示时机层不变：adFrequency 的 placement / day 分档 / 60s 全局间隔照旧；
  onboarding 那次展示绕过 60s 但启动间隔时钟。
- **全 live 单元，dev 包也是**（业主定案 2026-08-05）——调试机必须在 AdMob 注册为测试设备。
- UMP 在 Android 上与 SDK init **并行、绝不阻塞**（最前面的展示可能非个性化，已接受）。

### 埋点变化（仅 Android）

- `ad_impression_custom` **改在 paid 回调发**，带真实 `value`(USD 原始值) + `unit` + `floor` +
  placement + currency + precision —— 买量侧直接用。iOS 仍在 show 时发、无 value。
- 新增 `ad_request`（仅探测/主/副层，慢节奏）、`ad_breaker`（熔断触发）。
- `ads_route` 的 Android path 值 = `engine`。

### iOS

完全未动：US → 旧 26 层状态机（`usInterstitial.ts`），非美 → 单单元 preload。
等业主给 iOS 的新单元集后再切。
