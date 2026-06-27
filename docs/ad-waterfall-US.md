# 美国用户 · 插页广告请求机制（线上规则 · 定稿）

> 实现文件：`src/services/usInterstitial.ts`（状态机）+ `src/services/ads.ts`（地区判定与分流）
> 适用范围：**仅美国用户**。其他国家走 `ads.ts` 的简单单单元路径，后续单独实现。
> 库：`react-native-google-mobile-ads` v15。Publisher：`ca-app-pub-4656643588243987`。

本文件是给后续接手的程序 / 同事看的"当前真实规则"。分三部分：① 业务规则（瀑布流逻辑）；② 工程加固（退避、防崩溃、防泄漏）；③ 单元映射与事件埋点。

---

## 0. 一句话总览

用一个**两层宽的窗口**在 `$40–$500` 的手动底价阶梯上滑动：**有 fill 就向上追价值天花板，两层都"真·连续 3 次 no-fill"才向下退**；`unit0`（无底价）在缓存见底时兜底，保证始终有广告可展示；每天用**昨日前 3 次**展示价值的均值定起点。所有请求由 **1 秒 ticker 统一驱动 + 每单元退避闸门**，没有零延迟重发、没有忙循环。

---

## 1. 单元角色与底价

| 单元 | 角色 | 底价(eCPM) |
|---|---|---|
| `unit0` (HB_int_splash_0) | 安全网 · 无底价兜底 | 无 |
| `unit1` (HB_int_splash_1) | 新用户顶端试探 | $300 |
| `unit2 … unit25` | 阶梯层 | `$20 × n`（unit2=$40 … unit25=$500） |

关键关系：**阶梯层单元号 n = 底价 ÷ 20**。`unit1` 是独立试探层，**不参与**价值路由（路由里的 $300 用 `unit15`）。

---

## 2. 价值路由（V → 起始窗口）

`V` = 第一次真正展示的广告的 impression-level 回传价值（paid 事件），或昨日前 3 次均值。

```
lo = clamp( floor(V / 20) + 1 , 2 , 25 )
窗口 = { lo, hi = lo + 1 }          // lo=25 时 hi 收起，只发主层（封顶 $500）
```

| V 区间 | 主层(先发) | 副层(后发) |
|---|---|---|
| $0–39.99 | unit2 ($40) | unit3 ($60) |
| $80–99.99 | unit5 ($100) | unit6 ($120) |
| $180–199.99 | unit10 ($200) | unit11 ($220) |
| $200–219.99 | unit11 ($220) | unit12 ($240) |
| ≥ $480 | unit25 ($500) | —（封顶，仅主层）|

**首次发送**：先发主层，间隔 **500ms** 再发副层（不同时发）。
**展示顺序**：与请求相反——缓存里**底价最高**的先展示。

> ⚠️ 口径换算：AdMob paid 事件的 `value` 是"每次展示的美元"（`1e-6 × valueMicros`）。底价是 eCPM（每千次），所以路由时 **V_eCPM = value × 1000**（常量 `ECPM_PER_IMPRESSION`，改一处即可）。

---

## 3. 窗口移动

- **向上 climb**：副层(hi) fill → 用户价值更高 → 窗口整体上移一层 `{hi, hi+1}`，继续追到 `$500` 封顶。
- **向下 descend（两层都挂）**：主层与副层**都**"真·连续 3 次 no-fill" → 窗口降到下面两层 `{lo-2, lo-1}`（如 $220/$240 都挂 → $180/$200）。
- **顶失底中**：副层探不到、但主层已 fill → 窗口下移一层 `{lo-1, lo}`，把第 2 个缓存位补满。
- **计数清零**：每层"连续 no-fill"计数，任意一次 fill 即归零重计。
- **封顶/触底**：`$500` 封顶只发主层；降到 `$40` 触底后仍无填充则进入 **8 秒冷却**，避免在底价空跑忙循环。

---

## 4. 新用户 / 每日重置

- **全新用户（无任何历史）**：Phase 0 —— 同时请求 `unit0` + `unit1`。展示优先级 `unit1 > unit0`（默认 `unit0`）。第一条真正展示出去的广告，其价值 `V` 用于建立起始窗口。
- **`unit1` 当日熔断**：`unit1` **真·连续 3 次 no-fill** → 当日停止对该用户请求 `unit1`，次日重置。（网络错误不计入熔断，见 §5）
- **每日起点**：用**昨日前 3 次**展示价值的均值定窗口（不足 3 次取全部；完全无历史 → Phase 0）。例：昨日 `[180,160,140,110,100,90]` → 前三均值 160 → 次日从 `$180/$200` 起。（与昨日最后一次无关。）

---

## 5. ⭐ no-fill 退避策略（线上加固重点）

**关键：拿不到广告分两种原因，必须分开处理。**

| 情形 | 判定 | 行为 |
|---|---|---|
| **真·没库存 / 底价太高** | 网络正常，Google 返回 no-fill | 计入该层"连续 no-fill"计数；同层最多试 3 次（间隔 ~2s / ~4s），3 次后按 §3 移动窗口 |
| **网络错误 / 超时** | 错误码/信息含 `network`/`timeout` | **不计入那 3 次、不移动窗口**；同单元**指数退避**重试：5s → 10s → 20s → 40s → 封顶 60s（±20% 抖动），**只拉长间隔、不限次数**，网络一恢复即重置 |
| **unit0 兜底** | 缓存空 ≥ 3s 触发 | 指数退避 3s → 6s → 封顶 **10s**（±20% 抖动），由 ticker 驱动，**绝不零延迟循环** |

设计理由：
- Google 官方明确"**强烈不建议**"在加载失败回调里立即无退避重发；无限零延迟循环是触发 **"Ad serving limited（限制投放）"** 的典型信号。
- 网络错误"只封顶间隔、不限次数"：差网用户最多每 60 秒发一次（可忽略，绝非 spam），一旦网络恢复就能拿到广告；若设硬上限，用户网络恢复后反而永远没广告。

---

## 6. 缓存与兜底

- 缓存目标 **2 条**；填满即停止补量，展示掉一条后再补。
- **过期淘汰**：AdMob 插页约 1 小时过期。缓存里每条广告打 `loadedAt` 时间戳，**50 分钟**即淘汰并清理监听；展示前与每次 tick 都检查。放置一小时后回到 app，缓存会自愈（兜底网补上）。
- **unit0 安全网**：缓存空且持续 ≥ 3 秒 → 启动 `unit0`（与双层目标并跑，冷启动可同时请求 3 个单元），有任何缓存即不再主动发 `unit0`。

---

## 7. 工程加固（防崩溃 / 防泄漏 / 防脏数据）

| 编号 | 问题 | 处理 |
|---|---|---|
| C1 | `show()` 的 Promise rejection 变未捕获异常 → 崩溃 + 缓存卡死 | 给 `show()` 挂 `.catch()`；失败即清理 + 重新补量；`lastShownAt` 在 **OPENED**（真实展示）时才置位，失败不消耗 90s 冷却 |
| C2 | 缓存里的广告过期变"死广告" | 50 分钟过期淘汰（见 §6） |
| H1 | 被丢弃的广告实例泄漏原生监听 | 跨天 / resume / 过期 / 停服时对每条缓存与在途广告调 `__cleanup()` 并置空，交给 GC |
| H2 | 跨天后旧的 load 回调污染新一天状态 | `epoch` 计数器：每次重置 +1，回调若 epoch 已变则直接忽略 |
| H3 | 新用户首条曝光 PAID 未回传 → 永远卡 Phase 0 | 广告 **CLOSED** 时若仍未建立窗口，用展示单元的底价兜底建立（unit1→$300 起，unit0→最低 $40 起让 climb 去探） |
| H4 | `unit0` 忙循环 | 并入 ticker + 退避模型（见 §5） |
| M3 | 持久化的窗口被污染 → 越界崩溃 | resume 时用 `makeWindow(clamp(lo,2,25))` 重建；请求前校验 `UNIT_IDS[idx]` 存在 |
| M4/M5 | 买了去广告后 ticker 仍在跑 / 无法停 | `stopUsController()`：清 ticker、清理所有缓存与在途广告；`setAdsRemoved(true)` 时调用 |

**请求引擎**：所有请求由 1 秒 `ticker → pump()` 统一驱动；`pump()` 幂等且每单元用 `nextAt[idx]` 闸门，可安全地从任何事件触发，无 setTimeout 竞态、无内联即时重发。

---

## 8. 地区判定

`ads.ts` 的 `isUsUser()` 读取**设备区域**（RN 内置 locale，无新依赖）。这是 AdMob 实际投放国家（由 IP 决定）的**客户端代理**，用于美国先行足够；将来要换真实 geo/IP 信号，替换这一个函数即可。

---

## 8.5 展示触发与频率（何时弹插页）

实现文件：`src/services/adFrequency.ts`（决定"何时"）+ `ads.ts` / `usInterstitial.ts`（执行展示）。

**两档频率（按用户使用天数分）：**
- **Day 0–3（新用户,温和）**：只在自然断点弹 —— `prayer_end`(祈祷结束) + `plan_end`(计划当日结束)。
- **Day ≥ 4(老用户,激进)**：在温和基础上**额外**加两个触发:
  - **页面跳转**：每 **3** 次合格跳转弹一次(`placement='nav'`)。
  - **热启动**：app 退后台 **≥15 秒**再回前台弹一次(`placement='app_open'`)。

> 天数 = 距首次启动的自然日(安装当天=day0),常量 `AGGRESSIVE_FROM_DAY=4`。首启日期存 `ads:firstLaunchYmd`。

**"一次跳转"如何计数：**
- **底部 4 个 tab(prayer/bible/plan/profile)之间连续互跳** → 整段只计 **+1**(不管点多少次),直到跳到非 tab 页面打断该段。
- **任何涉及非 tab "浏览页"的跳转**(Streak/Achievement/Reflections/PastVerses/FeaturedPlanDetail/PlanCategory/MoodCalendar 的进/出) → 正常 **+1**。
- **流程页与功能页全程不计数、不打断**:`PrayerFlow / GospelPsalm / MoodFlow / PlanDayWalk / PlanVerseRead / PlanDayDone`(流程结尾已各弹一次)、`RemoveAds / HelpCenter / HelpAnswer / AboutUs / Policy / Notifications / AddWidget`。

**硬性闸门(对所有触发统一生效)：**
- **冷却 60 秒**：任意两条插页间隔 ≥ `MIN_INTERVAL_MS=60s`(即"每 3 次跳转 **且** 距上次 ≥60s")。
- **必须在前台**：`AppState.currentState==='active'` 才展示,否则跳过(防止切走瞬间浪费曝光 / 渲染异常)。
- 缓存为空则不弹(由瀑布流补量,见 §6)。

> ⚠️ 政策提示:"热启动弹插页 + 每 3 次跳转弹"属于高频实现,AdMob 对"开屏/每次切屏弹插页"有 disallowed interstitial 风险。已用"仅 day≥4 + 60s 冷却 + 前台 + 排除流程页"四重约束收敛;Google 对开屏场景的官方推荐格式是 App Open Ad,此处按产品决策仍用插页。

---

## 9. 事件埋点（供 BigQuery 分析）

| 事件 | 触发 | 字段 |
|---|---|---|
| `ad_impression_custom` | 广告真实展示（OPENED） | `format='interstitial'`, `placement`('prayer_end'/'plan_end'/'nav'/'app_open'), `unit_idx`, `floor` |
| `ad_paid` | paid 价值回传 | `value`（$/次）, `ecpm`（$×1000）, `currency`('USD'), `unit_idx`, `precision` |

> 不用 `ad_impression`（那是 Firebase 自动采集的保留事件）。

---

## 10. 关键常量（`usInterstitial.ts`）

```
MIN_IDX=2  MAX_IDX=25  CACHE_TARGET=2  NOFILL_LIMIT=3
STAGGER_MS=500  UNIT0_EMPTY_DELAY_MS=3000  TICK_MS=1000
EXPIRY_MS=50min  FLOOR_COOLDOWN_MS=8s  MIN_INTERVAL_MS=90s  ECPM_PER_IMPRESSION=1000
退避：netBackoffBase 5/10/20/40…cap60s · unit0BackoffBase 3/6…cap10s · ladderRetryBase 2s/4s（均带 ±20% 抖动）
```

---

## 11. ⚠️ 已知政策风险（决策记录）

经专项审查，这套"客户端自建瀑布流"存在 AdMob **账号政策风险**（HIGH）：行为政策禁止"通过发布商自建系统、按实时价格信息程序化分配广告请求"。当前决策为 **保留瀑布流并完成工程加固（方案 B）**，已知并接受残留政策风险。若日后单元上挂载 bidding 广告源，风险显著升高。Google 推荐路径是 **bidding + mediation group**（账号风险最低、长期更优），作为后续可选演进方向记录在此。

来源：AdMob Behavioral policies (support.google.com/admob/answer/2753860)、Interstitial best practices (developers.google.com/admob/android/interstitial)、eCPM floors (support.google.com/admob/answer/3418058)、Ad serving limits (support.google.com/admob/answer/9493252)。
