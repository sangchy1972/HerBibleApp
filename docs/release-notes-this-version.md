# Release Notes — v1.4.1（7 语种 · 每条 ≤500 字符）

> **1.4.0 (26) 上传过但从未发布给用户**，1.4.1 直接顶替它上线，所以这份文案原样归
> 1.4.1 用。1.4.1 相对 26 号包额外带了：WhatsApp/Instagram 分享修复、分享后主界面
> 点不动的修复、首广告价值剔除（买量侧）、崩溃报告的 last_screen 归因。各语种正文
> 已顶着 500 字符上限，没有空间再加一条 bullet——「点了没反应」那条修复已覆盖分享
> 回来点不动的场景，语义不算撒谎。

> 面向用户、商店「新功能/更新说明」字段用。App Store 与 Google Play 通用。
> 不提广告/ATT/追踪等技术项——只说用户看得见的改进。
>
> **Google Play 用最下面「Play Console 粘贴版」那一段**，它已经带好 `<lang>` 标签。
> App Store Connect 按语言分栏填，直接用本段正文。
>
> ⚠️ **v1.3.0 已上线**，搜索、题库翻倍、祷告结束页在那一版已经宣传过，本版不重复。
> 这一版的主角是**圣经页的首访引导**、**人声朗读改为按需**、**祷告后的提醒时间选择**。
> 1.3.0 的文案在 git 历史里（`9742790`）。
>
> 语气沿用前几版：第二人称、温和、不用营销词。中文用「妳」。
>
> **点名按钮时必须用该语言界面上真实的标签**（「查看结果」= `quiz.action.seeResults`）。
> 朗读按钮是**纯图标、没有文字标签**，所以各语言都只能描述它，不能加引号当标签引用。

---

## 🇺🇸 English (U.S.)
```
The Bible tab now shows you around.

• Your first time in the Bible: a walk through search, bookmarks, text size, switching books, listening, and marking a chapter read
• Narration now waits for you — tap the read-aloud button when you want a voice, and the music keeps playing underneath
• Set your reminder time right after you pray, on one full screen
• Fixed: home-screen cards that sometimes didn't answer a tap
• Fixed: "See results" on the quiz card

Thank you for walking with Her Bible.
```

## 🇨🇳 简体中文
```
圣经页会带妳走一遍。

• 第一次打开圣经：五步认识搜索、书签、字号、切换书卷、朗读，以及读完怎么标记
• 人声朗读不再自动开始——想听的时候点朗读按钮，背景音乐照旧陪着妳
• 祷告之后，在一整屏上直接选好妳的提醒时间
• 修复：主界面的卡片有时点了没有反应
• 修复：问答卡片上的「查看结果」点不动

感谢妳与 Her Bible 同行。
```

## 🇭🇰 繁體中文
```
聖經頁會帶妳走一遍。

• 第一次打開聖經：五步認識搜尋、書籤、字級、切換書卷、朗讀，以及讀完怎麼標記
• 人聲朗讀不再自動開始——想聽的時候點朗讀按鈕，背景音樂照舊陪著妳
• 禱告之後，在一整屏上直接選好妳的提醒時間
• 修復：主介面的卡片有時點了沒有反應
• 修復：問答卡片上的「查看結果」點不動

感謝妳與 Her Bible 同行。
```

## 🇩🇪 Deutsch
```
Der Bibel-Tab führt dich jetzt herum.

• Beim ersten Öffnen der Bibel: ein Weg durch Suche, Lesezeichen, Schriftgröße, Buchwechsel, Vorlesen und „als gelesen markieren“
• Das Vorlesen wartet jetzt auf dich — tippe die Taste, wenn du eine Stimme möchtest; die Musik läuft weiter
• Erinnerungszeit direkt nach dem Gebet, auf ganzem Bildschirm
• Behoben: Karten auf dem Startbildschirm, die manchmal nicht reagierten
• Behoben: „Ergebnis ansehen“ auf der Quiz-Karte

Danke, dass du mit Her Bible gehst.
```

## 🇫🇷 Français
```
L'onglet Bible te fait visiter.

• À ta première ouverture de la Bible : recherche, marque-pages, taille du texte, changement de livre, lecture à voix haute et « marquer comme lu »
• La lecture à voix haute t'attend — touche le bouton quand tu veux une voix, la musique continue
• Choisis l'heure de ton rappel juste après la prière, en plein écran
• Corrigé : des cartes de l'accueil qui ne répondaient pas
• Corrigé : « Voir les résultats » sur la carte du quiz

Merci de marcher avec Her Bible.
```

## 🇪🇸 Español
```
La pestaña Biblia ahora te da un recorrido.

• La primera vez que la abres: búsqueda, marcadores, tamaño del texto, cambiar de libro, escuchar y marcar como leído
• La lectura en voz alta ahora te espera: tócala cuando quieras una voz; la música sigue debajo
• Elige la hora de tu recordatorio justo después de orar, a pantalla completa
• Corregido: tarjetas del inicio que a veces no respondían
• Corregido: «Ver resultados» en la tarjeta del desafío

Gracias por caminar con Her Bible.
```

## 🇧🇷 Português (Brasil)
```
A aba Bíblia agora te mostra tudo.

• Na primeira vez que você abre: um passeio pela busca, marcadores, tamanho do texto, troca de livro, narração e marcar como lido
• A narração agora espera por você: toque quando quiser uma voz; a música continua embaixo
• Escolha o horário do seu lembrete logo depois de orar, em tela cheia
• Corrigido: cartões da tela inicial que às vezes não respondiam
• Corrigido: "Ver resultados" no cartão do desafio

Obrigada por caminhar com a Her Bible.
```

---

## Play Console 粘贴版

Play 的「新功能」字段一次只收**该发布所选语言**的标签块。界面里显示的是哪几个标签
就用哪几个，标签必须**逐字一致**，正文从上面对应语种直接复制。

```
<en-US>
The Bible tab now shows you around.

• Your first time in the Bible: a walk through search, bookmarks, text size, switching books, listening, and marking a chapter read
• Narration now waits for you — tap the read-aloud button when you want a voice, and the music keeps playing underneath
• Set your reminder time right after you pray, on one full screen
• Fixed: home-screen cards that sometimes didn't answer a tap
• Fixed: "See results" on the quiz card
</en-US>
<zh-CN>
圣经页会带妳走一遍。

• 第一次打开圣经：五步认识搜索、书签、字号、切换书卷、朗读，以及读完怎么标记
• 人声朗读不再自动开始——想听的时候点朗读按钮，背景音乐照旧陪着妳
• 祷告之后，在一整屏上直接选好妳的提醒时间
• 修复：主界面的卡片有时点了没有反应
• 修复：问答卡片上的「查看结果」点不动
</zh-CN>
<pt-BR>
A aba Bíblia agora te mostra tudo.

• Na primeira vez que você abre: um passeio pela busca, marcadores, tamanho do texto, troca de livro, narração e marcar como lido
• A narração agora espera por você: toque quando quiser uma voz; a música continua embaixo
• Escolha o horário do seu lembrete logo depois de orar, em tela cheia
• Corrigido: cartões da tela inicial que às vezes não respondiam
• Corrigido: "Ver resultados" no cartão do desafio
</pt-BR>
```

> **第三种语言未必是 pt-BR。** Play 界面里显示的是哪三个标签就用哪三个（可能是
> `<zh-TW>`、`<fr-FR>`、`<de-DE>`、`<es-ES>`）。标签必须逐字一致。

---

## 这一版实际做了什么（内部记录，不要贴进商店）

**商店里说了的：**

- **圣经阅读器首访引导**（新功能）—— 一生一次，在她**第一次进入 Bible 页**时触发，
  不管那是第 0 天还是第 30 天（无天数门槛，业主明确要求）。5 步：右上三工具 →
  左上书卷菜单 → 朗读悬浮键 → 真实的经文操作条（在第 1 节上替她打开）→
  滚到底的 Mark as Complete。第 2 步的**高亮洞可点**，她可以真的开抽屉换书，
  关掉抽屉就是这一步完成、直接进第 3 步。见 `dev-guide.md` §7。
- **人声朗读改为按需** —— 进入祷告只有背景音乐；朗读要她自己点。配一个一生两次的
  引导（首次流程 / 连续 4 次没用过），播过一次就永久退休。
- **祷告后的全屏提醒时间选择器** —— 三滚轮 + 早晚各自的时段窗口，设完**一定**去要
  通知权限；她拒绝就进第二层劝说页（带我们自己的 logo 和一个动画开关）。
- **修复：主界面卡片有时点不动** —— 见下，且**未证明已彻底解决**。
- **修复：问答卡片「查看结果」点不动**、**「Add widget」不拉起系统弹窗**、
  **祷告结束页「Maybe later」摸不到**、问答重试页排版。

**商店里没说、但确实做了的：**

- **`nav_churn` 插页触发**（业主 2026-08-09）—— 切换页面 >5 次且距上次广告 ≥60s。
  `nav` 会把连续 tab 切换整段折叠成 +1，所以纯 tab 闲逛一直没变现，这一条补的是那个口子。
  规则在纯函数 `reduceNavigation()` 里，16 个用例。
- **`interstitialVisibility` 新增共享的「上次广告真正呈现时间」** —— 三条展示路径共同盖章。
  **再加第四条展示路径必须也调 `noteInterstitialShown()`**，否则依赖它的触发会以为从没展示过。
- **placement 联合类型收进 `constants/adPacing.ts`** —— 原本在三个文件各抄一份。
- **协调器的路由门改为按请求生效**（`surfaceRoutes`）—— `'bible'` 依然对所有其他弹窗
  关闭（不许埋伏正在读经的用户），只有圣经引导声明了它。否则整个引导拿不到 slot、
  是死代码，而 tsc 和 jest 都是绿的。
- **`SpotlightCoach` 新增 `interactiveHole`** —— 全屏盾换成围着洞的四条带。
- **`useTabFocusEntrance` 的布局基线不再在 re-focus 时清空** —— 见下。
- 背景音乐从 hash 选曲改为按日顺序轮换（hash 在短列表上会重复播某几首）。

⚠️ **仍未处理 / 未证明：**

- **主界面点不动没有结案。** 这一版修掉了一个**可证的**缺陷：入场动画每次 re-focus 都把
  布局基线清空，导致"内容位移→提前脱手"这条唯一可靠的补救在第一次之后永久失效
  （`entranceSettle.ts` + 8 个用例，其中一个复现了这次漏掉）。**但无法证明它是全部原因。**
  为此这一版带了 `home_nav_tap` 埋点：DebugView 里有 `home_nav_tap` 没有 `screen_view`
  = 触摸到了但导航被丢；完全没有 `home_nav_tap` = 触摸没到达。**上线后先看这个。**
- **Play 上仍有 10 次 ANR 没有堆栈**，以及 `android.os.Bundle.<init>` 未归因 —— 要 Crashlytics。
- **SYSTEM_ALERT_WINDOW 是否需要 Play 声明表**，我无法核实，需要人工确认。
- **只有真机能验的三件事**：`interactiveHole` 四条带的边界、分组后表头工具的高亮框对齐、
  引导里 450ms/600ms 的滚动沉降在慢机上够不够。
- **大屏横屏**（Android 16 起忽略 `screenOrientation="PORTRAIT"`）、**R8 full mode / AGP 9**
  —— 两项都还是产品级项目，不是勾选项。见 `dev-guide.md` §12。
