# Daily Verse 第二批 — 程序对接指南

> 给工程侧。内容 agent 只交文件（规格书 §8），构建、校验、上传、版本段升级都在你这边。
> 本文说清楚：**怎么读这批文件、哪两件事会让它上线即出事、上线前按什么顺序做。**
>
> 配套阅读：`handoff-daily-verse-content-agent.md`（内容规格书）、
> `dev-guide.md` §11（内容与数据管线）。**本批与规格书 §2 有一处结构性偏离，见第 3 节 —— 先看那节再动手。**

---

## 0. 三十秒版本

| | |
| --- | --- |
| **内容** | 60 天 × 早/晚 × 7 语言 = **840 条** |
| **schema** | **3.2**（≠ 规格书 §2 写的结构，见第 3 节） |
| **文案规范** | v3.1 |
| **能直接上线吗** | ❌ **不能。** 两个阻塞项，见第 2 节 |
| **完整性自检** | `manifest.json` 里有每个文件的 bytes + sha256[:16] |

**两个阻塞项，一句话各说清：**

1. 🔴 **`translations.<lang>.modern.text` 七语言全空** —— 而 app 的 verse 页正是渲染这一栏。照现在上线，**840 条经文页全是空白**。
2. ⚠️ **schema 3.2 删掉了非英文文件里的英文字段** —— `scripts/verify_alignment.mjs` 若还在检查 `devotional.en` 等字段，**整批会被打回**；如果 app 有"该语言缺失就回退英文"的逻辑，**回退源也没了**。

---

## 1. 文件清单

```
daily-verse-batch2/
├── manifest.json              ← 先读这个：文件清单 + 字节数 + 校验和 + 阻塞项
├── verses_en.json             381 KB
├── verses_zh-Hans.json        284 KB
├── verses_zh-Hant.json        284 KB
├── verses_es.json             288 KB
├── verses_pt.json             292 KB
├── verses_fr.json             306 KB
├── verses_de.json             304 KB
├── cover_briefs.md            早/晚池各 6 张封面图 brief（给图像生成节点）
├── 第二批交付说明.md            英文稿：选经来源、120 条怎么凑的、三个可推翻的决定
├── 第一波多语言交付说明.md       中西葡：29 条本地版本差异怎么处理的
├── 第二波交付说明_法德.md        法德：27 条重写 + 诗篇编号位移（**最重要的一份**）
└── 风格配比修订说明.md          风格轮换比例的修订记录
```

`manifest.json` 刻意对齐 `quiz-bank/manifest.json` 的写法，字段含义相同：
`sha256` = 文件字节的 **完整 sha256 的前 16 个十六进制字符**（与 quiz 一致，已实测核对）。

---

## 2. 🔴 上线阻塞

### 2.1 `modern.text` 全空 —— 这一栏正是 app verse 页渲染的字段

规格书 §2 写明：

> App 端实际渲染的只有：`reference`、`translations[lang].modern`、`devotional[lang].meditation / action_step`、`prayer[lang]`

而这批文件里：

```json
"translations": {
  "de": {
    "traditional": { "version": "Lutherbibel 1912", "text": "Dein Wort ist meine Fußes Leuchte…" },   // ✅ 840/840 已填满
    "modern":      { "version": "HFA",              "text": "" }                                       // ❌ 840/840 全空
  }
}
```

**为什么空**：modern 是现代译本（NIV / 当代译本 / NVI / NVI-PT / BDS / HFA），**全部在版权期内**。规格书 §4b 只提供了 traditional 的公版语料通道，没有任何可合法取用现代译本的来源。凭记忆重建 840 条受版权译本进商业产品是法律风险，内容侧不做（规格书 §4 红线 1）。

每个文件的 `meta.pending` 里标记了：

```json
"pending": ["translations.de.modern.text — awaiting licensed source"]
```

**你有三条路，选一条：**

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A. 回填**（正解） | 取得七语言现代译本授权，按 `id` 批量写入 `modern.text` | 需要授权谈判，周期最长 |
| **B. 改渲染** | verse 页改渲染 `traditional.text` | 立刻可上线。用户看到的是公版老译本（KJV / 和合本 / Luther…），语感偏古；但**这一栏 840 条全部逐字取自语料库，且与用户点进整章看到的文本完全一致** |
| **C. 双栏择一** | `modern.text` 非空则用之，否则回退 `traditional.text` | 最稳。回填是渐进的，回填一条生效一条，不必等齐 |

**建议 C**，因为它让 A 可以慢慢做而不卡上线。参考实现见第 4 节。

### 2.2 schema 3.2 删掉了英文字段 —— 对齐校验器与运行时回退都要确认

业主在第二批开工时定的 v3.2 修订（原话：*"多语言的 verse json 里是不是就不用过度重复英文的部分了…程序有办法把多语言 map 起来"*）。所以**非英文文件里以下字段已全部移除**：

| 移除的字段 | 原本作用 | 现在去哪找 |
| --- | --- | --- |
| `niv_primary` | 英文 NIV 原文 | `verses_en.json` 同 `id` |
| `devotional.en` | 英文默想/行动 | `verses_en.json` 同 `id` |
| `prayer.en` | 英文祷文 | `verses_en.json` 同 `id` |
| `devotional.copyright_check` | 3× 版权审核凭据 | `verses_en.json` 同 `id`（本就只对 EN 计算） |
| `exegesis.key_themes` / `version_note` / `life_connection` | 内容侧创作笔记 | `verses_en.json` 同 `id` |
| `exegesis.historical_context` + `original_language_note` | 历史背景 + 原文注 | **已合并**为 `exegesis.context_note`，且**逐语言本地化**（见第 5 节） |

每个非英文文件的 `meta.note` 写明了这一点：

> English source fields, the copyright audit record and the internal exegesis notes live only in verses_en.json — map by verse id.

**这与规格书 §2/§5 的旧约定冲突**（旧约定要求各语言文件保留英文参考字段）。而规格书 §5 又写着「下游有对齐校验，不一致整批打回」。所以：

- [ ] **改 `scripts/verify_alignment.mjs`**：不要再要求非 EN 文件存在 `niv_primary` / `devotional.en` / `prayer.en` / `copyright_check`。仍应校验的是跨语言 byte 一致的那 9 个字段（第 6 节列出）。
- [ ] **确认运行时回退**：如果 app 有"`devotional[lang]` 缺失就回退 `devotional.en`"的逻辑，**这批文件里没有 en 块了**。要么改成从 `verses_en.json` 取，要么确认七语言都齐全（本批确实齐全，840/840 无空字段）——但**回退路径本身要有意识地保留或删除，不能默默 undefined**。

> 这两项是本批唯一需要改代码的地方。改完之后，后续批次都按 3.2 走，不再变。

---

## 3. 数据结构（schema 3.2 完整字段）

### 顶层

```jsonc
{
  "meta": {
    "language": "de",
    "language_label": "Deutsch",
    "version": 3,
    "schema": "3.2",
    "total_verses": 120,
    "morning_count": 60,
    "evening_count": 60,
    "coverage_days": 60,
    "generated": "2026-08-29",        // 完整日期（规格书 §2 写的 "YYYY-MM" 已按业主要求改为年月日）
    "note": "English source fields … map by verse id.",
    "pending": ["translations.de.modern.text — awaiting licensed source"]
  },
  "verses": [ /* 120 条：先 60 条 morning，后 60 条 evening */ ]
}
```

`verses` 数组顺序 = **60 条 morning 在前，60 条 evening 在后**，各按 `day` 1→60 升序。
七个文件顺序完全一致，可按下标直接对位。

> ⚠️ 规格书 §2 说「先 60 条 morning 后 60 条 evening，**或按 day 交错——保持与上一批同序**」。
> 本批用的是**分段顺序**。如果线上那批是 day 交错的，取数逻辑要么按 `id` 查表（推荐，与顺序无关），要么这批重排。**这是个待你确认的点。**

### 单条 verse

```jsonc
{
  "id": "e_052",                      // m_/e_ + 三位 day 序号；跨语言一致，是唯一的跨文件主键
  "day": 52,                          // 1..60
  "segment": "evening",               // morning | evening
  "language": "de",
  "reference": {
    "book": "Psalms", "chapter": 46, "verse": "10",
    "full_reference": "Psalms 46:10"  // 七语言 byte 一致，统一用 KJV 编号
  },
  "verse_local": "Psalms 46:11",      // ⚠️ 可选字段，仅 fr/de 各 5 条有，见第 5 节
  "special_occasion": null,           // 节日覆盖用；本批全为 null
  "mood_tags": ["#夜里不安", "#学习交托", "#想要掌控"],   // 恒 3 个中文标签，七语言 byte 一致
  "translations": {
    "de": {
      "traditional": { "version": "Lutherbibel 1912", "text": "Seid stille und erkennet…" },
      "modern":      { "version": "HFA", "text": "" }     // ❌ 见第 2.1 节
    }
  },
  "exegesis": {
    "verse_category":  { "testament": "OT", "genre": "psalm", "primary_theme": "peace" },
    "niv_word_count":  22,
    "context_note":    "Der Psalm spricht von einer bedrohten Stadt…"   // 本语言，30–70 词
  },
  "devotional": {
    "structure": "同行劝勉",           // 五种之一，七语言一致
    "de": { "meditation": "…\n\n…", "action_step": "…" }
  },
  "prayer": {
    "structure_used": "free_form",
    "de": "Lieber himmlischer Vater, … In Jesu Namen, Amen."
  }
}
```

`verses_en.json` 结构相同，但**额外**保留 `niv_primary`、`exegesis` 的全部内部字段、
`devotional.copyright_check`。英文文件是主稿，别的文件按 `id` 回查它。

---

## 4. 取数：四页流程怎么读

app 的四页是 **verse → meditation → action → prayer**。TypeScript 示意：

```ts
type Lang = 'en' | 'zh-Hans' | 'zh-Hant' | 'de' | 'fr' | 'es' | 'pt';

interface VerseEntry {
  id: string;
  day: number;
  segment: 'morning' | 'evening';
  language: Lang;
  reference: { book: string; chapter: number; verse: string; full_reference: string };
  verse_local?: string;                       // 仅 fr/de 各 5 条
  special_occasion: string | null;
  mood_tags: [string, string, string];
  translations: Record<Lang, {
    traditional: { version: string; text: string };
    modern:      { version: string; text: string };   // ⚠️ 本批 text 恒为 ''
  }>;
  exegesis: {
    verse_category: { testament: 'OT' | 'NT'; genre: string; primary_theme: string };
    niv_word_count: number;
    context_note: string;                     // 本语言，「!」图标点开显示
  };
  devotional: { structure: string } & Record<Lang, { meditation: string; action_step: string }>;
  prayer:     { structure_used: string }      & Record<Lang, string>;
}

// —— 第 2.1 节的方案 C：modern 有就用，没有回退 traditional ——
function verseText(e: VerseEntry, lang: Lang): { text: string; version: string } {
  const t = e.translations[lang];
  return t.modern.text.trim()
    ? { text: t.modern.text,      version: t.modern.version }
    : { text: t.traditional.text, version: t.traditional.version };   // 回填前的兜底
}

// 四页取值
const v = verseText(entry, lang);
//  ① verse 页        → entry.reference.full_reference + v.text（版本名显示 v.version）
//  ②   「!」图标      → entry.exegesis.context_note
//  ③ meditation 页   → entry.devotional[lang].meditation      // 段落用 \n\n 分隔，1–2 段
//  ④ action 页       → entry.devotional[lang].action_step
//  ⑤ prayer 页       → entry.prayer[lang]                     // 单段
```

**渲染注意：**

- `meditation` 用 `\n\n` 分段，**最多 2 段**。按 `\n\n` split 后逐段渲染即可，段内没有单个 `\n`。
- `prayer` **恒为单段**，不含换行。
- `mood_tags` 里的 `#` 是合法内容；但 `meditation` / `action_step` / `prayer` 三个字段**保证不含** `#`、`{`、`<`（规格书 §4 红线 3，已逐条校验，840/840 零命中）。
- `context_note` 是新字段（3.2 起），对应 UI 上经文旁的「!」小图标。**七语言各自本地化**，不是英文。

### 按 id 跨文件 map（3.2 的核心用法）

```ts
// 非英文文件不再带英文字段；需要英文时按 id 回查主稿
const enById = new Map(en.verses.map(v => [v.id, v]));
const enMeditation = enById.get(entry.id)?.devotional.en.meditation;
```

---

## 5. `verse_local`：法德两语 5 条诗篇的编号位移

**为什么有这个字段。** Louis Segond 1910 与 Lutherbibel 1912 把**长音乐题记**
（`Au chef des chantres… Sur alamoth` / `Ein Lied der Kinder Korah, vorzusingen`）
单独算作第 1 节，导致整篇节号后移一位。短题记（`Cantique de David` / `Ein Psalm Davids.`）
则并进第 1 节和正文一起，**不**位移 —— 所以只有 5 条中招，不是 16 条诗篇全中。

**受影响的条目（fr 与 de 完全相同的 5 条）：**

| `id` | `reference.full_reference` | `verse_local` |
| --- | --- | --- |
| `e_012` | Psalms 20:4 | Psalms 20:5 |
| `e_030` | Psalms 4:8 | Psalms 4:9 |
| `e_049` | Psalms 56:3 | Psalms 56:4 |
| `e_052` | Psalms 46:10 | Psalms 46:11 |
| `e_055` | Psalms 42:11 | Psalms 42:12 |

**设计意图**：`reference` 保持七语言 byte 一致（统一 KJV 编号），**对齐校验器照常通过**；
真实节号放在平级的可选字段 `verse_local` 里。

**你要做的：**

```ts
// 显示引用时优先用本地编号；跳转整章时也用它定位
const displayRef = entry.verse_local ?? entry.reference.full_reference;
```

⚠️ **跳转「读整章」功能必须用 `verse_local` 定位**，否则法德用户点诗篇 46:10 会跳到错的那一节
（Segond/Luther 的 46:10 是前一句）。`traditional.text` 里存的**已经是正确那一节的原文**，
只是它在本地圣经里的编号是 46:11。

---

## 6. 跨语言对齐：应当校验的 9 个字段

七个文件同一 `id` 下，以下字段**保证 byte 一致**，`verify_alignment.mjs` 应当校验这些：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `day` | 1..60 |
| `segment` | morning / evening |
| `reference`（整个对象） | 统一 KJV 编号 |
| `special_occasion` | 本批全 null |
| `mood_tags` | 3 个中文标签 |
| `devotional.structure` | 五种风格之一 |
| `exegesis.verse_category` | testament / genre / primary_theme |
| `exegesis.niv_word_count` | 英文 NIV 词数 |

**不应当**跨语言比对的：`language`、`translations`、`exegesis.context_note`、
`devotional[lang]`、`prayer[lang]`、`verse_local`（后者只有 fr/de 有）。

> 内容侧已用 `b2_verify_lang.py` 逐条核过这 9 个字段，七文件全部一致。
> 这些值在构建时是**直接从 `verses_en.json` 读出来写入**的，不是各语言各写一份，所以不会漂。

**`context_note` 要不要进对齐校验器？** 建议**不要按 byte 比**（它逐语言本地化，本来就不同），
但可以校验**非空且 30–70 词 / 50–120 字**。这是个待你定的点。

---

## 7. 上线前 checklist

```
□ 1. 完整性：逐文件核对 manifest.json 的 bytes 与 sha256[:16]
      node -e "…" 或复用 quiz-bank 现成的校验逻辑（算法完全相同）

□ 2. 🔴 决定 modern.text 方案（第 2.1 节 A / B / C），并落地
      —— 不做这一步，verse 页 840 条全空白

□ 3. ⚠️ 改 scripts/verify_alignment.mjs：去掉对非 EN 文件英文字段的要求
      改完跑：node scripts/verify_alignment.mjs

□ 4. ⚠️ 确认 devotional.en 运行时回退：改成查 verses_en.json，或明确移除该路径

□ 5. verse_local：显示与「读整章」跳转都接上（第 5 节）

□ 6. verses 数组顺序与线上那批是否一致（第 3 节末尾）；
      建议统一改成按 id 查表，从此与顺序解耦

□ 7. 上传 R2：按 dev-guide.md §11 —— **bump /vN/ 段，绝不 purge、绝不按文件打 SHA**
      自定义域前面挂着 Cloudflare 缓存，同 key 重切会长时间发旧内容

□ 8. context_note 是新字段（「!」图标）——确认 UI 已接，否则这一栏白写

□ 9. npx tsc --noEmit && npx jest && npx tsx scripts/i18n_audit.mjs
```

---

## 8. 转给 `pd-text-corpus` 的 2 处数据缺陷

不是本批文件的问题 —— 是**上游语料库存错了字**，内容侧按规格书 §4 红线 4 照抄不改。
**必须在语料库那一侧修**：改在内容侧会导致每日经文与用户点进整章看到的文本不一致。

| 语种 | 节 | 语料库存的 | 应为 |
| --- | --- | --- | --- |
| de | Psalms 119:105 | `Dein Wort ist **meine** Fußes Leuchte…` | `**meines** Fußes` —— 属格错 |
| de | Isaiah 25:1 | `**dein** Ratschlüsse von alters her…` | `**deine** Ratschlüsse` —— 复数前冠词未变格 |

两处均由独立 agent 重新 fetch 确认是语料库本身的问题，非转写错误。
内容侧已做规避：`m_017` 的默想绕开出问题的半句、`m_037` 全文不引用 `dein Ratschlüsse`，
所以**即使不修，正文也不会跟着错**，只是经文本身带着这个字。

修完记得按 `dev-guide.md` §11 的 `CORPUS_COMMIT` bump 流程走，并同步更新规格书 §4b 里锁定的
commit（当前锁在 `e9df0306d76c8b1bf66aae71fc6e93ed8622c8cc`）。

> 早前几批还报过 es/pt 共 7 处类似缺陷（含 es `2 Chronicles 7:14` 存成 `ni nombre`，
> 语义被否定；pt `1 Corinthians 15:57` 存成 `graça a Deus`，句子方向写反）。
> 清单在 `第一波多语言交付说明.md` 第四节，一并处理更省事。

---

## 9. 内容侧已做的校验（你不必重做）

- 每语言 14 项集中自检全过（长度档位、祷文定式、风格规则、结构分布、v3.2 去重）
- 840 条 traditional 全部逐字取自 §4b 语料库；另做**独立重取抽查 58 条，逐字符全对**
  （es/pt 各 15、fr/de 合计 28，含全部高危诗篇与全部已知缺陷条）
- 整句复述经文（连续 8 词照抄）：840 条零命中
- `#` `{` `<` 三字符：三个正文字段零命中
- 七文件 9 个共享字段 byte 一致
- 诗篇题记位移逐语言实测，另取 3 条未位移条目做负对照

---

## 10. 有疑问时找谁

- **内容问题**（措辞、选经、风格、某条为什么这么写）→ 回到内容 agent，附条目 `id`
- **结构问题**（字段、schema、对齐）→ 本文 + `handoff-daily-verse-content-agent.md` §2/§5
- **语料库问题**（经文本身错字）→ `pd-text-corpus` 仓库，见第 8 节
- **版权问题**（modern 授权）→ 业主决策，见第 2.1 节
