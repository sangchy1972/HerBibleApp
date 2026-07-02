# IAP 商店后台配置清单（Remove Ads）

> 代码侧已接好（expo-iap 4.x，`src/services/iap.ts`）。商品 ID 是代码里的**占位 ID**，
> 后台建商品时必须用一模一样的 ID，否则拉不到价格、买不了。
> 建完商品**不需要改代码**，价格由商店返回（本地化货币自动处理）。

## 商品 ID（两个商店保持一致）

| 档位 | 商品 ID | 类型 |
|---|---|---|
| Lifetime | `herbible_remove_ads_lifetime` | 非消耗型一次性商品 |
| Annual | `herbible_premium_annual` | 自动续订订阅（1 年） |
| Monthly | `herbible_premium_monthly` | 自动续订订阅（1 个月） |

> 如果你想改 ID / 定价结构，改 `src/services/iap.ts` 里的 `IAP_SKUS` 即可（一处）。

---

## Google Play Console

前提：app 已提交过一个包含 `expo-iap` 原生模块的 AAB 到任意轨道（内测即可），Play 才允许建内购。

1. **Monetize with Play → Products → In-app products → Create product**
   - Product ID: `herbible_remove_ads_lifetime`
   - 名称/描述随意（用户可见），定价按你定（参考 NT$670 ≈ US$20.99）
   - 保存后 **Activate**
2. **Monetize with Play → Products → Subscriptions → Create subscription**
   - Product ID: `herbible_premium_annual` → 添加 Base plan：ID 建议 `annual`，
     Auto-renewing，Billing period = 1 year，定价（参考 NT$420 ≈ US$12.99/年）→ Activate
   - 再建 `herbible_premium_monthly` → Base plan `monthly`，1 month（参考 NT$84 ≈ US$2.99/月）→ Activate
3. **License testing**（Play Console 首页 → Settings → License testing）：把你的测试 Google 账号加进去，
   测试购买不会真扣款。
4. 测试：用 **internal testing 轨道装的包**（不是本地 dev build）走一遍购买 / 取消 / 恢复。

## App Store Connect

1. **My Apps → Her Bible → Monetization → In-App Purchases → “+”**
   - 类型 Non-Consumable，Product ID: `herbible_remove_ads_lifetime`
   - Reference Name 随意；填价格档；填一条本地化显示名/描述；上传审核截图（可以先用付费墙截图）
2. **Monetization → Subscriptions → 建一个 Subscription Group**（如 `Her Bible Premium`）
   - 组内建 `herbible_premium_annual`（时长 1 Year）和 `herbible_premium_monthly`（1 Month），各自填价格与本地化
   - 同组内两档会自动支持升降级
3. **Users and Access → Sandbox Testers**：建一个沙盒测试账号，用 TestFlight 包测试购买/恢复。
4. 首次提交审核时，把三个 IAP 与 app 版本**一起勾选提交**（IAP 单独提交会被卡）。

---

## 上架前自查（IAP 部分）

- [ ] 两个商店的商品 ID 与 `IAP_SKUS` 完全一致，且已 Activate / Ready to Submit
- [ ] 真机测试：购买成功 → 广告立即消失（含美国瀑布流），杀进程重开仍无广告
- [ ] 恢复购买：卸载重装 → Restore → 无广告
- [ ] 订阅取消后到期：目前**无后端校验**，依赖启动时 `restorePurchases()` 的
      `hasActiveSubscriptions` 结果重新授权；到期后下次启动会查不到有效订阅 →
      需要时再加"到期回收"逻辑（现在的实现不会自动收回 lifetime，订阅到期回收是 TODO）
- [ ] Paywall 显示的是商店返回的本地化价格（不是 NT$ 兜底价）
- [ ] `paywall.disclaimer` 订阅条款文案与商店政策一致（苹果要求页面能看到条款+隐私链接——已链接到 app 内 Policy 页）

## 已知限制（记录在案）

- **无服务端收据校验**：信任商店客户端（StoreKit 2 本身返回已验证交易；Android 走 acknowledge）。
  被越狱/破解绕过的风险接受为当前阶段成本；后续可接 IAPKit / 自建校验。
- **订阅到期不主动回收**：`ads:removed:v1` 持久化后，除非启动时恢复流程判定无有效购买，
  否则一直无广告。严格回收需在启动时对"仅订阅授权"的用户强制复查——已留 TODO。
