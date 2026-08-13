# 路径分析 / 流失分析 — 怎么做，用什么

结论先给：**不需要自己的服务器。** 一行后端代码都不用写。

---

## 0. 先看你现在那张图说了什么

```
session_start 488 → screen_view 470 → ads_adapters 44
                                     → onboarding_start 35
                                     → notification_tap 21
                                     → ad_config_fetch 9
                                     → ads_init_timeout 3
                                     → quiz_bank_fetch 3
```

第三列里 **6 个里有 4 个是基础设施事件**（`ads_adapters`、`ad_config_fetch`、
`ads_init_timeout`、`quiz_bank_fetch`）。它们跟用户干了什么**毫无关系**——是广告 SDK
初始化和题库拉取在后台自己跑。

而它们的频次远高于真实行为事件，所以**它们把路径图淹了**。你现在看不到
`prayer_complete`、`quiz_set_start`、`plan_day_complete` 这些，不是因为没人做，是因为
它们被基础设施噪声挤出了 Top N。

**换任何工具之前先做这件事**，否则在 BigQuery 里也是同样一张图。

### 82 个事件里，23 个是管道，59 个是行为

管道类（路径分析里全部排除）：

```
AdLTV_OneDay_Top10Percent   AdLTV_OneDay_Top20Percent   AdLTV_OneDay_Top30Percent
AdLTV_OneDay_Top50Percent   Total_Ads_Revenue_001       ad_breaker
ad_config_fetch             ad_impression               ad_impression_custom
ad_paid                     ad_request                  ad_revenue_step_overflow
ads_adapters                ads_init_timeout            ads_route
iap_entitlement_lapsed      iap_error                   iap_pending
iap_timeout                 iap_unhandled_state         quiz_bank_fetch
quiz_session_dropped_bank_drift                         us_ad_request
```

> `iap_purchase` / `iap_restore` **不在**排除列表里——那是用户真的做了动作。
> 报错类的才排除。

---

## 1. 三条路，按成本从低到高

| 方案 | 成本 | 适合 | 局限 |
| --- | --- | --- | --- |
| **A. GA4 探索报告** | 0，已经能用 | 现在就该先做的 | 保留 14 个月；基数上限会把长尾归到 `(other)`；节点数有限 |
| **B. BigQuery + Looker Studio** | 基本免费 | 要自定义、要长期留存 | 需要先开导出，**不回溯** |
| **C. BigQuery + Python/Notebook** | 免费 | 一次性深挖 | 不是给别人看的看板 |

**自建服务器：任何一条都不需要。** Looker Studio 是 Google 托管的，直连 BigQuery。

---

## 2. 方案 A —— 先把现有的探索报告修对（10 分钟）

GA4 → **探索** → **路径探索**：

1. 右上角 **重新开始**（清掉默认配置）
2. **起点** 选 `session_view` 或某个具体事件，不要用 `session_start` 当起点——
   那一层什么信息都没有
3. 关键一步：在 **筛选器** 里加 `事件名称` → **不包含** → 逐条排掉上面那 23 个
   （GA4 的 UI 只能一条条加，忍一下，一次配好能存下来）
4. 起点建议按你要回答的问题选：
   - 新用户流失 → 起点 `onboarding_start`，看多少人走到 `onboarding_complete`
   - 祷告流失 → 起点 `screen_view`（页面=PrayerFlow），终点 `prayer_complete`
   - Quiz 流失 → 起点 `quiz_set_start`，看 `quiz_set_complete` vs `quiz_retry_round`

做完这一步，大概率你要的答案已经出来了，不用碰 BigQuery。

---

## 3. 方案 B —— BigQuery

### 3.1 导出已经开好了（2026-08-12 确认）

| 项 | 现状 |
| --- | --- |
| 数据集 | **`analytics_540179646`** |
| 区域 | US |
| 导出频率 | 每日 ✅（串流需要升级到 Blaze，现在是 Spark） |
| 导出应用 | 2 / 2 |
| Crashlytics 导出 | 已开，但 **Dataset not created**——下个周期才会有数据 |
| **数据集 TTL** | ⚠️ **60 天** |

表是 `events_YYYYMMDD`（每日）。没有串流，所以**当天的数据要等到次日**才进 BigQuery。

### 3.1a ⚠️ 60 天 TTL —— 数据会被自动删掉

这是 **BigQuery sandbox（没绑结算账号）的默认值**，不是可以忽略的提示：
**超过 60 天的表会被自动删除。**

两个要命的细节：

1. **改数据集默认值不会回填。** 已经建好的表仍然带着它们各自的 60 天到期时间——
   只有之后新建的表才用新设置。
2. **sandbox 模式下这个上限拿不掉**，需要给 GCP 项目**绑一个结算账号**才能改成
   「永不过期」。

> 绑结算账号 **不等于要付钱**。BigQuery 每月 1TB 查询 + 10GB 存储的免费额度仍然有效，
> 你这个数据量（月活 20 台，一个月几 MB）实际账单是 0。绑卡只是解除 sandbox 的限制。

**怎么改**：Google Cloud Console → BigQuery → 找到 `analytics_540179646`
→ **编辑详细信息** → 取消勾选 **启用表格过期时间** → 保存。

每拖一天，就多一天的数据挂在 60 天的倒计时上。

### 3.2 费用

BigQuery 免费额度是**每月 1TB 查询 + 10GB 存储**。你现在月活 20 台设备，一个月的事件
量大概几 MB。**实际花费是 0。** 只要别写 `SELECT *` 扫全表不加日期过滤。

日期过滤靠 `_TABLE_SUFFIX`，这是省钱的关键：

```sql
WHERE _TABLE_SUFFIX BETWEEN '20260701' AND '20260812'
```

### 3.2a ⚠️ 列别名必须是 ASCII

BigQuery **不接受非 ASCII 的标识符**（除非整个用反引号包起来）。写 `AS 完成率` 会得到：

```
Syntax error: Illegal input character "\347" at [17:28]
```

`\347` 是那个中文字的第一个字节。本文档里的别名一律用 ASCII —— 这条踩过。

### 3.3 表结构要知道的三件事

1. **一行一个事件**，`event_name` 是事件名
2. **参数在 `event_params` 里，是 REPEATED RECORD**，取值要 `UNNEST`，而且值分散在
   `value.string_value` / `value.int_value` / `value.double_value` 三个字段
3. **会话 = `user_pseudo_id` + `ga_session_id`**（后者藏在 `event_params` 里）

---

## 4. 可以直接跑的 SQL

把 `YOUR_PROJECT` 和 `analytics_XXXXXXXXX` 换成你自己的。

### 4.1 基础视图：干净的事件流

```sql
CREATE OR REPLACE VIEW `YOUR_PROJECT.analytics_views.clean_events` AS
WITH raw AS (
  SELECT
    user_pseudo_id,
    (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'firebase_screen') AS screen,
    event_timestamp,
    event_name,
    platform,
    app_info.version AS app_version,
    geo.country AS country,
    (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'app_language') AS app_language
  FROM `YOUR_PROJECT.analytics_XXXXXXXXX.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '20260701' AND '20260812'
)
SELECT * FROM raw
WHERE session_id IS NOT NULL
  -- 管道事件不是用户行为，留着会把路径图淹掉
  AND event_name NOT IN (
    'AdLTV_OneDay_Top10Percent','AdLTV_OneDay_Top20Percent','AdLTV_OneDay_Top30Percent',
    'AdLTV_OneDay_Top50Percent','Total_Ads_Revenue_001','ad_breaker','ad_config_fetch',
    'ad_impression','ad_impression_custom','ad_paid','ad_request','ad_revenue_step_overflow',
    'ads_adapters','ads_init_timeout','ads_route','iap_entitlement_lapsed','iap_error',
    'iap_pending','iap_timeout','iap_unhandled_state','quiz_bank_fetch',
    'quiz_session_dropped_bank_drift','us_ad_request',
    -- 这几个是 Firebase 自动采集的，对路径分析也是噪声
    'user_engagement','session_start','first_open','app_update','os_update','app_remove'
  );
```

### 4.2 桑基图的数据：事件到事件的转移

这就是你截图那张图背后的数字。

```sql
WITH ordered AS (
  SELECT
    user_pseudo_id, session_id, event_name, event_timestamp,
    ROW_NUMBER() OVER (PARTITION BY user_pseudo_id, session_id ORDER BY event_timestamp) AS step,
    LEAD(event_name) OVER (PARTITION BY user_pseudo_id, session_id ORDER BY event_timestamp) AS next_event
  FROM `YOUR_PROJECT.analytics_views.clean_events`
)
SELECT
  step,
  event_name AS from_event,
  IFNULL(next_event, '(session_end)') AS to_event,
  COUNT(*) AS sessions
FROM ordered
WHERE step <= 6                      -- 只看前 6 步，再深就没样本了
GROUP BY step, from_event, to_event
HAVING sessions >= 3                 -- 砍掉噪声；样本大了再调高
ORDER BY step, sessions DESC;
```

`to_event = '(session_end)'` 那些行**就是流失点**。这一列排序下来，最上面的那个事件
就是最该看的地方。

### 4.3 漏斗：一步就能算的流失率

比路径图更直接。想问「多少人开始了引导却没走完」：

```sql
WITH s AS (
  SELECT user_pseudo_id, session_id,
    LOGICAL_OR(event_name = 'onboarding_start')    AS started,
    LOGICAL_OR(event_name = 'onboarding_complete') AS completed
  FROM `YOUR_PROJECT.analytics_views.clean_events`
  GROUP BY 1, 2
)
SELECT
  COUNTIF(started)               AS started,
  COUNTIF(started AND completed) AS completed,
  ROUND(SAFE_DIVIDE(COUNTIF(started AND completed), COUNTIF(started)) * 100, 1) AS completion_pct
FROM s;
```

想知道**死在第几步**，用 `onboarding_step_view` 的 `step_index` 参数：

```sql
SELECT
  (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'step_index') AS step_index,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'step_name') AS step_name,
  COUNT(DISTINCT user_pseudo_id) AS users
FROM `YOUR_PROJECT.analytics_XXXXXXXXX.events_*`
WHERE _TABLE_SUFFIX BETWEEN '20260701' AND '20260812'
  AND event_name = 'onboarding_step_view'
GROUP BY 1, 2
ORDER BY 1;
```

这个查询**比路径图有用得多**：一列数字直接告诉你从哪一步开始掉人。

同样的形状可以套在三套引导上（`bible_guide_*` / `streak_guide_*` / `plan_guide_*`），
它们的 `end` 事件都带 `how` 和 `at_step`，一句 GROUP BY 就出流失点。

---

## 5. 方案 B 的呈现层：Looker Studio

1. [lookerstudio.google.com](https://lookerstudio.google.com) → 建报表
2. 添加数据 → **BigQuery** → 选你的项目 → 可以直接贴**自定义查询**（把上面的 SQL
   粘进去）
3. 图表类型选 **桑基图**（社区可视化里有）或者更实用的**堆叠条形图**

**免费，Google 托管，不需要服务器。** 可以做定时刷新和分享链接。

> 说句实话：桑基图好看但不好读。**漏斗表 + 分步留存表**在这个数据量下信息密度高得多。

---

## 6. 一个必须说的现实

你现在 **月活设备 20 台**、图上一共 488 个会话。

路径分析在这个量级上**得不出统计结论**。第三步之后每条路径就剩个位数，随机波动
就能翻倍。上面 4.2 那个查询我写了 `HAVING sessions >= 3`，已经是在这个量级下能给的
最松的门槛了。

所以建议的顺序是：

1. **现在**：把 BigQuery 导出打开（不回溯，这是唯一有时间成本的一步）
2. **现在**：在 GA4 探索里把 23 个管道事件排掉，重看一次路径图
3. **现在**：跑 §4.3 那个 `onboarding_step_view` 的分步查询——**这个在小样本下也能看**，
   因为它是单点计数不是路径
4. **等量起来**（比如月活过千）再认真做路径/桑基

---

## 7. 顺带：现在的埋点答不了的两个流失问题

见 `docs/analytics-events.md` §9。简述：

- **没有 `prayer_start` / `plan_start`**，所以「进了祷告流/计划但没做完」算不出来。
  各补一行的事。
- **Quiz 没有单题事件**，所以看不出 650 道题里哪几道在劝退人。要动
  `quizSession` 的 reducer。

真要做流失分析，这两个补上比换工具重要。
