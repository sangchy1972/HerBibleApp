# 埋点清单 — 事件、参数、逻辑

从代码里逐条抽出来的，不是设计文档。统计口径：`src/**/*.ts(x)` + `App.tsx` 里所有
`logEvent(` 调用点。

**2026-08-12 实测：76 个固定名事件，102 处调用点，另有 3 个名字来自常量的广告收入事件。**

重新生成这份清单：

```bash
grep -rn "logEvent(" src/ App.tsx | grep -v "export function logEvent" | wc -l
```

---

## 0. 管道

`src/services/firebase.ts` 一共暴露五个口子，全部 **静默失败**（`try/catch` 吞掉）——
埋点永远不该让 App 崩。

| 函数 | 作用 |
| --- | --- |
| `logEvent(name, params?)` | 普通事件 |
| `logScreenView(screen)` | 屏幕浏览 |
| `setUserProps(props)` | 持久用户属性，之后每个事件都会自动带上 |
| `setAnalyticsUser(uid)` | 绑定 Firebase Auth UID；同时写进 Crashlytics |
| `recordError(err, ctx?)` | 非致命错误 → Crashlytics |

`analyticsMod` 是 guarded require，模块不在就整个变 no-op。老的 dev client 不会因此崩。

### screen_view 是集中式的，不是逐屏埋的

`App.tsx:146-152`，挂在 **导航状态变化** 上，用 `getCurrentRoute()?.name` 取最深的活跃
路由。所以加新页面**不需要**补埋点，自动就有。

同一个回调还顺手做两件事：喂 `setPromptRoute`（弹窗的 surface 闸门——只有在四个 tab
页上才允许弹阻断式弹窗）和 `noteNavigation`。

---

## 1. 冷启动 / 引导

| 事件 | 参数 | 逻辑 |
| --- | --- | --- |
| `onboarding_start` | `app_language`, `flow_version` | 进入引导流 |
| `onboarding_step_view` | `step_index`, `step_name`, `flow_version` | 每一步曝光 |
| `onboarding_answer` | `step_name`, `question`, `value`（语言步额外带 `was_default`；话题步带 `value_count`） | 每题作答，4 个变体 |
| `onboarding_notification_result` | `granted`, `source` | 系统通知授权结果 |
| `onboarding_paywall_buy_tap` | `plan`, `flow_version` | 引导内付费点击 |
| `onboarding_complete` | `method`, `flow_version`, `last_step_index`, `notifications_enabled`, `goal`, `age_range`, `bible_level`, `topics`, `topics_count`, `time_commitment` | 完成 |
| `tour_home_start` / `tour_home_step` / `tour_home_skip` / `tour_home_finish` | `step` | 首页新手引导 |

`flow_version` 是关键——改了引导流程一定要 bump 它，否则新旧漏斗混在一起没法比。

---

## 2. 三套「引导层」（guide）

三个独立的 spotlight 引导，事件形状**刻意做成一样的**，所以能用同一套查询比较完成率。

| 引导 | start | step | end |
| --- | --- | --- | --- |
| 圣经阅读器 | `bible_guide_start` | `bible_guide_step {step}` | `bible_guide_end {how, at_step}` |
| 连续天数 | `streak_guide_start {remaining}` | `streak_guide_step {step}` | `streak_guide_end {how, at_step}` |
| 计划发现 | `plan_guide_start {entry}` | `plan_guide_step {step}` | `plan_guide_end {how, at_step}` |

`how` 区分「走完」和「中途退出」，`at_step` 说明死在第几步——这两个字段合起来才是
引导的真实漏斗。另有 `bible_guide_books_used`（空参数）标记她真的用了书卷选择器。

---

## 3. 祷告 / 读经 / 计划

| 事件 | 参数 |
| --- | --- |
| `prayer_complete` | `slot`(morning/evening), `is_redo` |
| `prayer_audio_play` | `slot`, `lang`, `step`, `source` |
| `listen_guide_shown` / `listen_guide_ack` | `reason`, `slot` |
| `gospel_psalm_complete` | `slot`, `day`, `round` |
| `bible_audio_play` | `book`, `chapter`, `translation` |
| `plan_day_complete` | `slug`, `day` |
| `plan_complete` | `slug`, `total` |
| `home_nav_tap` | `target` |

`home_nav_tap` 有个特殊用途，`PrayerScreen.tsx:1052` 有注释：它和 `screen_view` 配对
用来**诊断触摸丢失**——

- `home_nav_tap` 之后有 `screen_view` → 点击和导航都正常
- `home_nav_tap` 之后**没有** `screen_view` → 触摸收到了，导航被吞了

这正是那批「隐形挡板」问题的观测手段。日志故意放在导航之前，DebugView 里读起来是
tap → screen_view。

---

## 4. Quiz / 奖励

| 事件 | 参数 |
| --- | --- |
| `quiz_set_start` | `set_index`（首页入口额外带 `source: 'home'`） |
| `quiz_retry_round` | `set_index`, `round` |
| `quiz_set_complete` | `set_index`, `first_pass_wrong`, `perfect` |
| `quiz_draw_earned` | `completed_sets` |
| `card_collect` | `card_id`, `card_theme` |
| `card_open` | `card_id`, `card_theme`, `source` |
| `card_like` | `card_id`, `card_theme`, `source` — **只记「点赞」，取消不发任何事件** |
| `quiz_promo_shown` / `quiz_promo_tap` | `completed_sets` |
| `quiz_bank_fetch` | `ok`, `lang`, `count` 或 `reason`（`bad_payload` / `http_<code>` / 异常名） |
| `quiz_session_dropped_bank_drift` | `set_index` |

两条运维用的：`quiz_bank_fetch` 是**排查 CDN 题库问题的唯一线索**——版本不符导致答题卡
静默消失时，它是唯一会响的东西。`quiz_session_dropped_bank_drift` 记录题库更新把进行中
的一组作废了。

`card_like` 只记正向：取消点赞**不该产生任何信号**。代价是生涯 `card_like` 数会大于
当前被赞的卡数——两个数衡量的是不同的东西，都对。

---

## 5. 账号 / 付费 / 成就

| 事件 | 参数 |
| --- | --- |
| `login` | `method` |
| `sign_up` | `method`, `prompt_source` |
| `login_prompt_shown` | `trigger` |
| `account_delete` | — |
| `iap_purchase` / `iap_pending` / `iap_restore` | `product_id` |
| `iap_error` | `code` |
| `iap_timeout` | `product_id` |
| `iap_unhandled_state` | `product_id`, `state` |
| `iap_entitlement_lapsed` | — |
| `unlock_achievement` | `achievement_id`, `rarity`, `category` |
| `remove_ads_prompt` | `active_days`, `repeat` |

---

## 6. 用 GA4 保留事件名的地方

这几个**故意**用 Google 的标准名，因为 GA4 对它们有内置报表和转化位：

`login` · `sign_up` · `search` · `select_item` · `select_content` · `share` ·
`unlock_achievement` · `ad_impression`

- `search` — `{search_term, content_type:'plan', lang, result_count}`
- `select_item` — `{item_list_name:'plan_search', item_id, search_term, rank, result_count}`
- `select_content` — `{content_type:'plan', item_id}`
- `share` — 四种内容共用一个事件，靠 `content_type` 区分：`verse` / `achievement` /
  `mystery_card`，`method` 区分系统分享面板 / 存相册 / 具体 app

另有三个搜索自定义事件：`plan_search_open {entry}`、`plan_search_no_results
{search_term, query_len, lang}`、`plan_search_suggestion_tap {topic}`。

---

## 7. 广告 —— 最复杂的一块

分两层：**投放诊断**（我们自己看的）和**收入回传**（Google Ads 拿去优化的）。

### 7.1 诊断事件

| 事件 | 参数 | 何时 |
| --- | --- | --- |
| `ads_route` | `region`, `path` | 决定走哪条广告路径 |
| `ads_init_timeout` | `step` | 初始化超时 |
| `ads_adapters` | `ready`, `total`, `detail` | 中介适配器就绪情况 |
| `ad_request` / `us_ad_request` | `unit`, `kind`, `floor`（US 路径带 `unit_idx`, `established`, `win_lo/hi`） | 发起请求 |
| `ad_breaker` | `unit`, `kind`, `strikes` | 某个单元连续无填充被熔断 |
| `ad_impression_custom` | `format`, `placement`, `unit`, `floor`, `value`, `currency` | 展示 |
| `ad_paid` | `value`, `ecpm`, `currency`, `unit_idx`, `precision` | 付费回调 |
| `ad_config_fetch` | `ok`, `v`, `ltv_currencies` 或 `reason` | 远程配置拉取 |

`ad_impression_custom` 和保留名 `ad_impression` **是两个不同的东西**，不要混。
量口径要用 `ad_impression_custom`＋`placement` 维度，不要数点击次数。

### 7.2 收入回传（`src/services/adRevenue.ts`）

事件名来自 `src/constants/adRevenueConfig.ts` 的常量，**Google Ads 按精确字符串匹配，
永远不要「整理」这些名字**：

| 常量 | 实际事件名 | 逻辑 |
| --- | --- | --- |
| `AD_IMPRESSION_EVENT` | `ad_impression` | 每次展示一条，**零收入也发**——展示确实发生了。参数键由 Firebase/Google Ads 固定 |
| `TOTAL_ADS_REVENUE_EVENT` | `Total_Ads_Revenue_001` | 收入按固定 step 切片，攒够一个 step 发一条，余数留在 `carry` 里 |
| `AD_LTV_EVENT_NAME[tier]` | `AdLTV_OneDay_Top50Percent` / `Top30` / `Top20` / `Top10` | 当日累计收入首次越过阈值时触发，**每档每天最多一次** |

三个细节，都是踩过坑写下来的：

1. **货币必须三处一致**——事件标签、step 查表、阈值查表。曾经事件标为 `HKD` 而阈值按
   `''` 查，结果 SDK 返回空币种时所有 AdLTV 档位静默失效。也**绝不能**默认 `USD`，
   那会把数值放大约 7.8 倍。
2. **`ad_revenue_step_overflow`** 是安全阀：配置错误导致 step 过小时，余数会在**之后
   每一次展示**都重新触发上限——那是全用户级别的无界事件洪水。触发时直接清空 `carry`
   并发这条事件留痕。
3. **浮点 epsilon**：`0.1+0.1+0.1 = 0.30000000000000004`，反向也会差一点点。阈值比较
   带 `1e-9` 的松弛，否则当天最后一次展示可能永久丢掉一个档位。

---

## 8. User properties（cohort 维度）

设一次，之后**每个事件**都自动带上。BigQuery 里做分群全靠这些。

| 属性 | 值 | 设置点 |
| --- | --- | --- |
| `app_language` | 界面语言 | `UILanguageContext`，语言变化时 |
| `is_signed_up` | `yes` | `AuthContext`，注册成功 |
| `ads_removed` | `on`/`off` | `ads.ts`，付费去广告的人群 |
| `notif_enabled` | `on`/`off` | 任一提醒开启即 on |
| `does_both_slots` | `yes`/`no` | 早晚祷告都做过 |
| `prayer_streak_bucket` | 分桶 | 连续天数区间 |
| `has_started_plan` | `yes`/`no` | 开过任意读经计划 |
| `prayer_audio_user` | `yes` | 用过祷告音频 |
| `bible_guide_seen` | `yes` | 看过圣经引导 |
| `ob_goal` / `ob_age_range` / `ob_bible_level` / `ob_time_commitment` / `ob_topics_count` / `ob_notifications` | 引导答案 | `OnboardingFlow` 完成时，**只写答过的项** |

Firebase 的硬限制：属性名 ≤24 字符，字符串值 ≤36 字符。

---

## 9. 已知缺口

不是 bug，是当前埋点覆盖不到的问题——想回答这些问题需要先补埋点。

- **祷告流内部的流失看不到。** 有 `prayer_complete`，没有 `prayer_start`，所以算不出
  「进了祷告流但没做完」的比例。
- **读经计划同理**，有 `plan_day_complete` / `plan_complete`，没有 `plan_start`。
- **Quiz 没有单题事件。** 只有整组的 start/complete/retry，所以看不出**哪几道题**特别难、
  哪些选项在误导人。650 道题里有没有烂题，现在的数据答不了。
- **`quiz_retry_round` 不带答错了哪几题**，只有 `round`。
- 若干事件参数为空：`account_delete`、`iap_restore`、`iap_entitlement_lapsed`、
  `verse_save`、`tour_home_start/finish`、`bible_guide_books_used`。发生了但没有上下文。
