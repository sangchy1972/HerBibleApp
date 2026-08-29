# HerBibleApp 上线前代码审计汇总报告

> 10 个并行审计 agent 对全代码库做的只读静态审计,按严重级别合并去重。
> 严重级别:**P0 = 发布阻断**(崩溃/卡死/零收入/无数据/不可恢复) · **P1 = 必修**(功能错误/大规模体验或数据问题) · **P2 = 应修**(边界/降级/误导) · **P3 = 优化**。
> 生成日期:2026-06(测试阶段)。代码量:src/ 135 个 ts/tsx。

---

## 一、P0 — 发布阻断(上线前必须关闭)

| # | 领域 | 文件 | 问题 | 修复方向 | 谁来做 |
|---|---|---|---|---|---|
| P0-1 | 网络/弱网 | services/bibleService.ts 等**全仓** | 所有 `fetch` 无超时,RN 不会自动超时。弱网"连接挂起不断开"时,章节阅读 / Gospel&Psalm 的 spinner **无限旋转**,`.catch/.finally` 永不执行 | 封装统一 `fetchWithTimeout`(AbortController,8s),所有网络读取走它;UI 超时即视为 error | 我可改 |
| P0-2 | Firebase 埋点 | services/firebase.ts + 全 src | `logEvent`/`logScreenView`/`recordError` 都实现了但**零调用点**。祷告完成、计划完成、登录、分享、广告展示全部未上报 → 3000万 DAU **完全没有转化/留存/崩溃数据** | 在各转化点补 `logEvent`;导航 focus 接 `logScreenView`;catch 里补 `recordError` | 我可改 |
| P0-3 | 广告收入 | app.json:140-141 / services/ads.ts | 用的是 Google **公共测试** App ID + `TestIds.INTERSTITIAL`。上线=**零广告收入**,且测试单元进正式包违反 AdMob 政策(封号风险) | 换成你真实 AdMob App ID + 正式 interstitial unit;用 `__DEV__` 区分测试/正式 | **需你提供 ID** |
| P0-4 | 内购/付费墙 | screens/RemoveAdsScreen.tsx | "移除广告"是纯 mock:IAP 未接、`setAdsRemoved(true)` 全仓无人调用、法律链接是 `example.com`。付费墙**无法成交**,有商店合规/下架风险 | 接 IAP 并在购买/恢复成功回调里 `setAdsRemoved(true)`;或暂时下线该入口;换掉占位法律链接 | **需你决策** |
| P0-5 | FB 登录 | app.json:58,61 | `react-native-fbsdk-next` 的 `appID`/`clientToken`/`scheme` 仍是 `REPLACE_FB_APP_ID`,而 FB 按钮无条件显示 → 用户点了**必失败** | 填真实 FB App ID/clientToken/scheme(`fb<APPID>`);或未配置时隐藏 FB 按钮 | **需你提供**(FB 账号恢复后) |
| P0-6 | 构建/R8 | app.json:150-151 + proguard-rules.pro | **首次开启 R8 但 keep 规则严重不足**(无 fbsdk/firebase/google-signin/admob)。release 包极易裁掉反射类 → 登录/崩溃上报/广告**仅在正式包静默失效**,debug 不复现 | 补各 SDK 官方 keep 规则;打**正式包真机**全链路回归;灰度放量 | 我可改规则,**你需真机验** |
| P0-7 | 启动 | App.tsx:88 | `useFonts` 只取了 `[fontsLoaded]`,忽略 `error`。字体加载失败时永远 `return null` = **永久白屏不可恢复**(只能重装) | 解构 `[loaded, error]`,error 时降级系统字体继续渲染 + 上报 | 我可改 |

> 说明:P0-3/4/5 需要你的真实密钥或商业决策,我无法代填;P0-1/2/6/7 我可以直接改代码。

---

## 二、P1 — 必修

| # | 领域 | 文件 | 问题 | 修复方向 |
|---|---|---|---|---|
| P1-1 | 祷告/跨午夜 | state/PrayerContext.tsx | 不消费 `useCurrentDayYmd`,App 开着跨午夜后 `mDone/eDone/today` 仍指昨天,`markDone` 会写进**昨天的 key** | Provider 消费当日 YMD 并作为 useMemo 依赖 + 派生 today |
| P1-2 | 祷告/竞态 | state/PrayerContext.tsx:116 | `markDone` 用过期 `records` 闭包持久化,早晚并发存在**丢失更新**;AsyncStorage 后写覆盖先写 | 改 `setRecords(prev => …)` 函数式更新,持久化绑到记录变更 |
| P1-3 | 通知/首启 | state/ReminderInterstitialContext.tsx | first-launch-date 跨 Provider 并行读写 + fire-and-forget 写入,写失败则通知 opt-in **永久丢失** | 兜底主动写入,不假定 DailyVerses 先写好 |
| P1-4 | 新功能/音频 | screens/GospelPsalmReader.tsx:67 | `audioFor(slot)` 每次返回**新对象**,喂给 `useAudioPlayer` 致播放器反复重建,音乐卡顿/重播/泄漏 | `useMemo` 稳定 audioSource,或 audioFor 返回稳定引用 |
| P1-5 | CDN/崩溃 | state/PrayerBackgroundsContext.tsx:198 | `manifest.images[slot]` 未做存在性校验,一次格式不严谨的 manifest 发布会让 `pickByDate` 渲染期抛错 → **全量设备祷告流崩溃** | `manifest.images?.[slot] ?? []` + setManifest 前 schema 校验 |
| P1-6 | Streak/视觉 | screens/StreakScreen.tsx:196 | DayCircle `morning` 写死 `true`,今日空环晚间也永远显示玫红、从不薰衣草 | 从 context 取 morning 或按小时推导 |
| P1-7 | Streak/里程碑 | screens/StreakScreen.tsx | `totalComplete ≥ 30` 后里程碑永久卡"还差 0 天",进度条停 100%——正好打击高留存用户 | 增加 30+ 档位或满级切"已达最高档"文案 |
| P1-8 | Streak/口径 | screens/ProfileScreen.tsx:362 | Profile"首次祷告日期"误用 `activityDates`(含纯打开 App),与 StreakScreen 的 `firstPrayedDate` 不一致且偏早 | 改用 `firstPrayedDate` 统一 |
| P1-9 | 通知/Amen | navigation/DeepLinkHandler.tsx:86 | 通知上的"Amen"快捷按钮被当普通点按,直接拽进整段祷告流(`actionIdentifier` 从未读) | 区分 `actionIdentifier==='amen'`,只记录不导航 |
| P1-10 | 通知 | state/NotificationsContext.tsx:284 | FollowHim 的 Continue 在永久拒绝时静默失败,用户以为已开启实则什么都没发生 | 永久拒绝走 openSettings 引导或让横幅可见 |
| P1-11 | 认证/构建 | app.json plugins | `@react-native-firebase/auth` 缺 config plugin(只有 app+crashlytics),prebuild 后 auth 原生可能未正确接入 | plugins 加入 `@react-native-firebase/auth`(需验证) |
| P1-12 | 性能 | screens/BibleScreen.tsx / AchievementScreen.tsx | 诗篇119(176节)、72枚徽章在单个 ScrollView **全量渲染** → 低端机卡顿/OOM/ANR | 改 FlatList;BadgeIcon/PlanCover 补 React.memo |
| P1-13 | 音频会话 | screens/PrayerFlow.tsx:387 | ~~全局粘性、从不复位~~ **2026-08-24 已按设计解决**:音频模式集中到 services/audioSession.ts(MIX 默认 / 朗读会话 doNotMix,出口复位);跨 Tab 续播与后台续播自此是特性(锁屏媒体控件随行),不是缺陷 — 勿以旧口径重立此案 | — |
| P1-14 | CDN/弱网 | services/bibleService.ts:114 | commentary 回退链 `await res.json()` 解析失败(弱网半截/200 HTML)会**逃逸 404 兜底**,不再回退 en | `try{json}catch{ continue }` 视同该 variant 不可用 |

---

## 三、P2 — 应修(节选,完整见各 agent 原始发现)

- **新功能内容缺陷**:`gospelsPsalmsPlan.ts` 第 76–85 天的晚间诗篇**全是诗篇1**(排程脚本填充残留),最后阶段连续 10 晚同一篇 → 已知,需重排(我引入的,会修)。
- **GospelPsalmReader 失败态无重试按钮**:CDN 抖动后用户被困在死屏,只能退出重进。
- **两个"This Week"口径相反**:WeeklyProgressView 用"早或晚任一即算",StreakScreen 用"早晚都要",都叫 This Week 无区分标签 → 用户困惑数据出错。
- **通知确认推送可堆叠**:快速反复 toggle 会 2 秒后收到多条"已设置"。
- **day/night 时段切点**在 ReminderInterstitial 与 FollowHimScreen **重复硬编码**靠注释手工同步,有漂移风险。
- **cancel-then-schedule 非原子窗口** + 多个 AppState 监听前台重排抖动。
- **badge 下载 HEAD→GET 之间 TOCTOU**,GET 失败可能把错误正文写入缓存。
- **HeroCover(计划详情大图)原图也失败时纯空白**(无渐变兜底)。
- **庆祝动画首个完成日不 punch**(prev>0 条件);**裸 setTimeout 卸载后 setState** 告警(PrayerScreen/PrayerFlow)。
- **R8 + FBSDK 拒授 email 权限**未处理;Apple 登录走 legacy 本地路径,uid 不关联 Analytics。

## 四、P3 — 优化(节选)

- 旧 corpus 缓存随 commit bump 失效但**从不清理**,AsyncStorage 长期膨胀。
- earlyBird 成就用本地 `getHours()`,跨时区/DST 抖动;闰日(2/29)注册者周年徽章永不触发。
- `interpolate` 缺参静默保留 `{token}` 字面量;建议 `__DEV__` warn。
- 孤儿 key `notif.section.quiz` 残留 6 语言块(无功能影响)。
- Provider 嵌套 26 层、档位阈值三处重复定义等可维护性项。

---

## 五、结论与发布门禁建议

**整体工程质量高**:离线兜底、清理纪律(AppState/timer/fetch cancelled)、祷告计数幂等、i18n 覆盖(7 语言 0 缺键)、89 天数据结构(经文引用全部合法)都做得专业。**没有发现会大规模丢数据或误发的灾难性 P0 逻辑 bug。**

**但有一组发布阻断项必须在全量上线前关闭**,且分两类:
1. **我能直接改代码的**:网络超时(P0-1)、Firebase 埋点补全(P0-2)、R8 keep 规则(P0-6)、字体失败降级(P0-7),以及 P1 里绝大多数。
2. **只有你能提供/决策的**:真实 AdMob ID(P0-3)、FB App ID/clientToken(P0-5,等账号恢复)、内购接入与否(P0-4)。

**强烈建议**:先修完可改项 → 打**正式包(release)真机**全链路冒烟(R8 首开必须真机验)→ Play Console **内部测试轨道**或**分阶段放量 5–10%** 验证一轮 → 再全量。3000 万 DAU 经不起一次性翻车。
