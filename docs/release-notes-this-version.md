# Release Notes — v1.2.0（7 语种 · 每条 ≤500 字符）

> 面向用户、商店「新功能/更新说明」字段用。App Store 与 Google Play 通用。
> 不提广告/ATT/追踪等技术项——只说用户看得见的改进。
>
> **Google Play 用最下面「Play Console 粘贴版」那一段**，它已经带好 `<lang>` 标签。
> App Store Connect 按语言分栏填，直接用本段正文。
>
> ⚠️ **v1.1.0 已上线**，所以本版**不再重复宣传圣经问答本身**——用户已经见过它了。
> 只写这一版新增的改动。1.1.0 的文案在 git 历史里（`6bc6ee5`）。

---

## 🇺🇸 English (U.S.)
```
Small changes, made with care.

• Quiz: answer straight from the home card — no extra taps
• Quiz: the answer stays hidden until you choose, so there's no rush
• Quiz: a redesigned results screen shows the painting you're building
• Your mood check-in and new badges now unfold gently, a line at a time
• Clearer help when you turn on your daily reminders

Fixed: shared verse images keep their rounded corners, and the app now follows your phone's language.

Thank you for walking with Her Bible.
```

## 🇨🇳 简体中文
```
一些小小的改动，都是用心做的。

• 问答：直接在首页卡片上作答，不用多点几下
• 问答：答案在你选择之前不会出现，可以慢慢想
• 问答：结果页重新做过，能看到自己正在拼的那幅画
• 心情记录和新徽章现在会一行一行慢慢展开
• 开启每日提醒时，指引更清楚了

修复：分享的经文图片不再丢失圆角；应用现在会跟随手机的语言列表。

感谢你与 Her Bible 同行。
```

## 🇭🇰 繁體中文
```
一些小小的改動，都是用心做的。

• 問答：直接在首頁卡片上作答，不用多點幾下
• 問答：答案在妳選擇之前不會出現，可以慢慢想
• 問答：結果頁重新做過，能看到自己正在拼的那幅畫
• 心情記錄和新徽章現在會一行一行慢慢展開
• 開啟每日提醒時，指引更清楚了

修復：分享的經文圖片不再遺失圓角；應用現在會跟隨手機的語言清單。

感謝妳與 Her Bible 同行。
```

## 🇪🇸 Español (España)
```
Pequeños cambios, hechos con cuidado.

• Reto: responde desde la tarjeta de inicio, sin toques de más
• Reto: la respuesta no aparece hasta que eliges, así que sin prisa
• Reto: nueva pantalla de resultados con el cuadro que vas armando
• Tu registro de ánimo y las nuevas insignias se revelan poco a poco
• Ayuda más clara al activar tus recordatorios diarios

Corregido: las imágenes compartidas conservan sus esquinas redondeadas.

Gracias por caminar con Her Bible.
```

## 🇧🇷 Português (Brasil)
```
Pequenas mudanças, feitas com carinho.

• Desafio: responda direto pelo cartão inicial, sem toques extras
• Desafio: a resposta só aparece depois da sua escolha, sem pressa
• Desafio: nova tela de resultados com a pintura que você monta
• Seu registro de humor e as novas medalhas surgem aos poucos
• Ajuda mais clara ao ativar seus lembretes diários

Corrigido: as imagens compartilhadas mantêm os cantos arredondados.

Obrigada por caminhar com Her Bible.
```

## 🇫🇷 Français
```
De petits changements, faits avec soin.

• Défi : réponds depuis la carte d'accueil, sans détour
• Défi : la réponse reste cachée jusqu'à ton choix, rien ne presse
• Défi : un écran de résultats repensé montre ton tableau en cours
• Ton humeur du jour et tes nouveaux badges se dévoilent peu à peu
• Une aide plus claire pour activer tes rappels quotidiens

Corrigé : les images partagées gardent leurs coins arrondis.

Merci de cheminer avec Her Bible.
```

## 🇩🇪 Deutsch
```
Kleine Änderungen, mit Sorgfalt gemacht.

• Quiz: Antworte direkt auf der Startkarte, ohne Umwege
• Quiz: Die Lösung bleibt verborgen, bis du wählst — lass dir Zeit
• Quiz: Neue Ergebnisseite zeigt das Bild, das du zusammensetzt
• Stimmung und neue Abzeichen erscheinen nun Zeile für Zeile
• Klarere Hilfe beim Einschalten deiner täglichen Erinnerungen

Behoben: Geteilte Versbilder behalten ihre runden Ecken.

Danke, dass du mit Her Bible gehst.
```

---

## Play Console 粘贴版

Play 的 Release notes 框要带语言标签。**只填商店列表里实际启用的语言** —— 填了没启用的标签会报错。

```
<en-US>
Small changes, made with care.

• Quiz: answer straight from the home card — no extra taps
• Quiz: the answer stays hidden until you choose, so there's no rush
• Quiz: a redesigned results screen shows the painting you're piecing together
• Your mood check-in and new badges now unfold gently, a line at a time
• Clearer help when you turn on your daily reminders

Fixed: shared verse images keep their rounded corners, and the app now follows your phone's language list.
</en-US>
<es-ES>
Pequeños cambios, hechos con cuidado.

• Reto: responde desde la tarjeta de inicio, sin toques de más
• Reto: la respuesta no aparece hasta que eliges, así que sin prisa
• Reto: nueva pantalla de resultados con el cuadro que vas armando
• Tu registro de ánimo y las nuevas insignias se revelan poco a poco
• Ayuda más clara al activar tus recordatorios diarios

Corregido: las imágenes compartidas conservan sus esquinas redondeadas.
</es-ES>
<pt-BR>
Pequenas mudanças, feitas com carinho.

• Desafio: responda direto pelo cartão inicial, sem toques extras
• Desafio: a resposta só aparece depois da sua escolha, sem pressa
• Desafio: nova tela de resultados com a pintura que você monta
• Seu registro de humor e as novas medalhas surgem aos poucos
• Ajuda mais clara ao ativar seus lembretes diários

Corrigido: as imagens compartilhadas mantêm os cantos arredondados.
</pt-BR>
```

> **第三种语言未必是 pt-BR。** Play 界面里显示的是哪三个标签就用哪三个（可能是 `<zh-CN>`、`<zh-TW>`、`<fr-FR>`、`<de-DE>`）。正文从上面对应语种直接复制，标签必须逐字一致。

---

## 这一版实际做了什么（内部记录，不要贴进商店）

**商店里说了的：**

- **问答首页卡片可直接作答** —— 卡片本身就是题目，不用先进入问答页
- **答案不再提前泄露** —— 去掉 Next 按钮，改为按住揭示；选择之前看不到正确答案
- **问答结果页重做** —— 画作为主视觉、礼物条、单一 CTA
- **心情记录与徽章解锁改为分段揭示** —— 经文逐字打出、2s 分段、徽章解锁放慢一半
- **通知权限引导** —— 拒绝后弹引导卡（含演示手指）+ 直达通知设置页，回前台自动复检
- **分享图圆角不再导出成黑色**
- **跟随手机的语言列表**（而不是单一语言）—— 英文手机不会再拿到别的语言

**商店里没说、但确实做了的：**

- **Android 广告请求引擎整体重写**（spec v1.0）—— 三条地区阶梯、按用户价值选层、
  熔断与退避。见 `docs/ad-routing.md` §7。**iOS 未动**，仍是旧的 26 层状态机。
- 首次运行的 coach mark 全部文字 +8%，并**修正了连击天数的规则说明** ——
  原文写「每天完成一次祷告」，而实际规则是**早晚都要完成**。这是一句会教错人的错误文案，
  出现在唯一一个专门用来解释规则的地方。
- 一批排版统一：按钮文本字号合并到 17.5、计划行与 Gospel 行逐值对齐、
  周报页间距 / 卡片圆角 / 星期格子改圆角矩形
- 评分弹窗的商店跳转不再可能卡住用户，也不会占死一个 nudge 槽位
- 已授权通知的用户不再看到「为什么需要通知」的说明弹窗
- 修复：从系统设置返回时，不会再把用户在 Profile 里手动关掉的提醒重新打开

⚠️ **仍未处理，下一版必须做**：题库只有 327 题 = 66 组，而集齐 24 幅画需要 96 组、
40 张卡需要 120 组。收藏会永远停在 **16/24** 和 **22/40**。题库需扩到 **600 题**才能全部可达。
见 `__tests__/quizLifecycle.test.ts` 的 "records the gap the bank still has to close"。
