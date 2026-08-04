# 悬浮窗每日经文 — 实现方案

> 状态：**方案待定，未开工。** 本文档要解决的是「动手之前必须拍板的事」，不是施工图。
> 写于 2026-08-04。技术约束部分标注了哪些是查证过的、哪些是需要原型验证的。

---

## 0. 一句话需求

在手机上弹出一个悬浮窗显示当日经文，布局参考现有的桌面 widget，Amen 按钮比 widget 里的更大。
面向的人群：**没有开启通知权限的用户**。

---

## 1. 动手前必须先定的三件事

### 决策 1：「主界面」指的是哪个？（**这一条决定工作量差 20 倍**）

原话是「在主界面上弹出一个悬浮窗」，同一句里又说「跟我们在桌面上添加的 widget 类似」。两种读法：

| | A. 手机桌面 / 盖在别的 app 上 | B. 我们 app 自己的首页 |
| --- | --- | --- |
| 需要 `SYSTEM_ALERT_WINDOW` | **要** | 不要 |
| 需要原生模块 | **要** | 不要 |
| 需要前台服务 | **要**（见 §2.2） | 不要 |
| Play 政策敞口 | 有（见 §5） | 无 |
| 工作量 | **2–3 周**，含真机矩阵调试 | **1–2 天**，纯 React |
| 能否进 1.1.0 | 否 | 可以 |

**B 其实已经有现成的壳了**：这一轮刚做的 `PermissionCoachOverlay` 就是我们 app 内的浮层，
换掉内容就是经文卡。如果你要的是 B，后面整份文档都不用看。

⚠️ 我倾向于你说的是 A（否则不会牵扯到悬浮窗权限），但这一条**必须你确认**，
因为按 A 开工意味着引入这个仓库的第一个自研原生模块。

以下内容全部假设 **A**。

### 决策 2：Amen 按钮点下去做什么？

现有 widget 里的 Amen 是个**假按钮**——`VerseOfDayWidget.tsx` 第 31 行的注释写得很明白：
整个 widget 的点击行为是 `OPEN_APP`，Amen 只是个诱饵 CTA，点哪里都是打开 app。

悬浮窗里把它放大，就产生了一个 widget 里不存在的期待：**它看起来像是能直接按的**。
三种做法，代价完全不同：

- **(a) 同 widget，点了打开 app。** 最省事，但放大一个假按钮 = 放大了那个落差。
- **(b) 就地记录祷告，悬浮窗关闭，不打开 app。** 这才是用户看到大按钮时的预期。
  但它要求悬浮窗进程能写 `prayer:records:v1`（AsyncStorage → SharedPreferences），
  而这时 RN 层可能根本没起来。需要原生侧直接读写，以及一套和 JS 侧的一致性约定。
- **(c) 就地记录 + 一个「已记录」的确认态，然后自动消失。** (b) 再加一个动效。

**建议 (b) 或 (c)。** 做了 (a) 等于花两周做一个更大的诱饵。

### 决策 3：什么时候弹？多久一次？

文档暂缺这块，因为它同时是产品决定和政策风险点（§5）。至少要定：
每天几次、什么时刻、用户能不能关、关了之后还弹不弹、以及**在别的 app 全屏前台时弹不弹**
（最后这条是投诉率最高的一项）。

---

## 2. 技术约束（已查证）

### 2.1 权限本身不需要 Play 预审

`SYSTEM_ALERT_WINDOW` **不在** Play 的 restricted permissions 名单里，不需要填申报表。
它属于「敏感但不预审」，风险后置在 Device and Network Abuse / Disruptive Ads 两条政策上。

### 2.2 Android 15 的先有鸡还是先有蛋

这一条是整个方案里最容易踩空的地方：

> 面向 Android 15 的 app，持有 `SYSTEM_ALERT_WINDOW` 时，
> **必须先有一个可见的 `TYPE_APPLICATION_OVERLAY` 窗口**，才允许从后台启动前台服务。
> 否则抛 `ForegroundServiceStartNotAllowedException`。

而悬浮窗要长期存活又必须挂在前台服务上（Activity 一退后台窗口就没了）。
所以顺序是**反直觉的**：

```
闹钟/广播触发
  → 先 WindowManager.addView() 把悬浮窗显示出来   ← 先有窗
  → 再 startForegroundService()                  ← 后有服务
```

写反了在 Android 15 上直接崩。

### 2.3 Android 14 起前台服务必须声明类型，而我们没有合适的类型

Android 14+ 每个前台服务必须在 manifest 里声明 `foregroundServiceType`，否则
`MissingForegroundServiceTypeException` 崩溃。

现有类型里**没有一个匹配「显示经文浮窗」**。只能用 `specialUse`，
而 **`FOREGROUND_SERVICE_SPECIAL_USE` 需要在 Play Console 提交用途说明并接受审核**。

> 🔴 **这是本方案里唯一真正的 Play 审核闸口。**
> 权限本身不预审（§2.1），但服务类型要预审。之前我说「没有审核闸口」是不完整的，这里更正。

### 2.4 设置页盖不住

Android 12 起系统给敏感界面加了 `SYSTEM_FLAG_HIDE_NON_SYSTEM_OVERLAY_WINDOWS`，
并默认丢弃来自非可信 overlay 的触摸事件。**设置页是重点保护对象。**

所以竞品截图里那个「盖在 Appear on top 设置页上的引导卡」，
在现代 Android 上用标准悬浮窗做不出来。**机制仍未查明**（见 §4）。

---

## 3. 实现路线（假设决策 1 = A）

### 3.1 模块清单

| # | 产出 | 说明 |
| --- | --- | --- |
| 1 | `plugins/withOverlayPermission.js` | Expo config plugin：注入 `SYSTEM_ALERT_WINDOW`、`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_SPECIAL_USE`，注册 Service |
| 2 | `VerseOverlayService.kt` | 前台服务 + `WindowManager.addView` 生命周期 |
| 3 | `VerseOverlayModule.kt` | RN bridge：`canDrawOverlays()` / `requestPermission()` / `show()` / `hide()` |
| 4 | 悬浮窗 UI | 见 §3.2 |
| 5 | `src/services/verseOverlay.ts` | JS 侧封装，**必须走 guarded require**（老 dev client 降级为 no-op，见 CLAUDE.md） |
| 6 | 调度 + 频控纯逻辑 | 放 `src/state/`，可单测，模式同 `adFrequency.ts` |
| 7 | Profile 里的开关 | 用户必须能关掉。没有这个，投诉直接变卸载 |

### 3.2 UI 复用：能蹭现有 widget 的渲染管线吗

**可以，而且这是省时间的关键。** `react-native-android-widget` 把 JSX 编译成 **RemoteViews**，
而 RemoteViews 可以 `.apply(context, parent)` 出一个真实 `View`，直接喂给 `WindowManager.addView`。

也就是说 `widgets/VerseOfDayWidget.tsx` 那套布局理论上能复用，Amen 尺寸调大即可。

⚠️ **但这条是推断，没验证过。** 两个已知的坎：
- RemoteViews 的点击只能走 `PendingIntent`，做不了决策 2 的 (b)/(c) 那种就地反馈动画
- `SvgWidget` 在 `.apply()` 出来的 View 里能不能正常渲染，未知

**必须先做 §6 的原型 P2 才能定。** 如果走不通，UI 得用原生 XML 重写一遍，
那是 +3～5 天，而且从此有两套布局要同步维护。

### 3.3 数据来源

经文和 widget 同源（`WidgetSync.tsx` 已经在往原生侧同步了），这块基本是白拿。
背景图走 `covers.everlandapps.com`，注意悬浮窗进程里要有兜底的本地图——
和 widget 一样，不能出现空白窗。

---

## 4. 未查明的事

**竞品那张盖在系统设置页上的引导卡，机制不明。**

我先前断言「不可能」是错的（owner 有实测），但我至今给不出确定解释。可能是：
自建 Activity 仿设置页 / 非标准窗口类型 / 三星特定行为 / 该 app 早已持有权限而截图是后来关的。

**这条不影响本方案的主体**（我们的悬浮窗是盖在桌面和普通 app 上，不是盖在设置页上），
但它决定了「引导用户开权限」那一步能做到多顺。

最快的测法：把竞品卸载重装，确保权限是干净的 OFF，再走一次那个流程。

---

## 5. 风险登记

| 风险 | 严重度 | 说明 |
| --- | --- | --- |
| `specialUse` 前台服务的 Play 用途审核 | **高** | §2.3。被拒则整个方案作废，**建议第一步就去试提交** |
| 与现有 `app_open` 插屏的叠加效应 | **高** | CLAUDE.md 记载 owner 已知情接受插屏的 Disruptive Ads 风险。**悬浮窗 + 广告变现是那条政策的典型画像**，两者叠加会改变整体性质。悬浮窗内绝不能出现广告 |
| 用户投诉 / 卸载 | 中 | 目标人群是**主动拒绝过通知**的人，改用打扰度更高的形式触达。Profile 开关（§3.1 #7）是必须项 |
| 机型碎片化 | 中 | 小米/华为/OPPO 的悬浮窗权限各有私有开关，标准 API 查不到真实状态 |
| 仓库第一个自研原生模块 | 中 | 之后每次 Expo SDK 升级都要跟着维护 |

---

## 6. 建议的推进顺序

**不要一上来写代码。** 前两步是「花两天验证要不要花两周」：

| 阶段 | 内容 | 时长 | 通不过就停 |
| --- | --- | --- | --- |
| **P0** | 向 Play 提交 `specialUse` 用途说明，探审核口径 | 提交 0.5 天，等结果 | ✅ 被拒 → 方案作废 |
| **P1** | 复测竞品（§4），搞清机制 | 0.5 天 | — |
| **P2** | 原型：RemoteViews `.apply()` 能否喂给 `WindowManager`（§3.2） | 1–2 天 | ⚠️ 不行 → +3~5 天，重新评估 |
| **P3** | 原生模块 + 服务 + 权限引导 | 5–7 天 | |
| **P4** | 调度/频控纯逻辑 + 单测 + Profile 开关 | 2–3 天 | |
| **P5** | 真机矩阵（三星/小米/Pixel × Android 12/13/14/15） | 3–5 天 | |

**合计 2–3 周**，且 P0 有归零风险。

**明确建议：不进 1.1.0。** 1.1.0 手上已有的东西（quiz 板块、字号统一、
引导语修正、通知权限引导）足够发一版，先出包验证市场反馈。

---

## 附：相关文件

- `widgets/VerseOfDayWidget.tsx` — 布局来源，Amen 假按钮在第 187–210 行
- `src/components/WidgetSync.tsx` — 经文往原生侧同步
- `src/components/PermissionCoachOverlay.tsx` — 权限引导卡，可直接复用于悬浮窗权限
- `src/services/adFrequency.ts` — 频控纯逻辑的写法参考
- `CLAUDE.md` → Settled decisions — 插屏相关的既定决策，不要重开
