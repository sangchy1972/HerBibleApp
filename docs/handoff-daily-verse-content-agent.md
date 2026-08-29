# 内容 Agent 规格书:Daily Verse 文案与封面方向

> 给 n8n 流水线里的**内容创作 agent**。你的工作是写内容、定义封面画面——
> **不碰任何代码、不需要访问仓库**。产出物交给下游工程节点去构建、校验、上传。
> 基线:现行 v2 内容(60 天 × 早/晚 × 7 语言),2026-08-28 由主工程 agent 从
> 真实生产文件提取本规格。规则冲突时以最新一批已上线内容为准。

## 1. 你产出什么

每一批(通常 60 天)交付 **8 个文件**:

1. `verses_en.json`、`verses_zh-Hans.json`、`verses_zh-Hant.json`、`verses_de.json`、`verses_fr.json`、`verses_es.json`、`verses_pt.json` — 七语言内容文件,结构完全相同,同一 `day+segment` 跨语言讲同一节经文。
2. `cover_briefs.md` — 封面图方向说明(见 §6),供下游图像生成节点使用。

## 2. 文件结构(逐字段)

顶层:

```json
{
  "meta": {
    "language": "en",
    "language_label": "English",
    "version": 3,
    "total_verses": 120,
    "morning_count": 60,
    "evening_count": 60,
    "coverage_days": 60,
    "generated": "YYYY-MM",
    "note": "English fields (niv_primary, exegesis, devotional.en, prayer.en) are retained in all language files as developer reference and fallback."
  },
  "verses": [ /* 120 条,先 60 条 morning 后 60 条 evening,或按 day 交错——保持与上一批同序 */ ]
}
```

单条 verse(以 en 为例;其他语言把 `<lang>` 换成自己的代码,并**额外保留**英文参考字段):

```json
{
  "id": "m_001",                          // m_ / e_ + 三位 day 序号,跨语言一致
  "day": 1,                               // 1..60,跨语言一致
  "segment": "morning",                   // morning | evening,跨语言一致
  "language": "en",
  "reference": { "book": "John", "chapter": 1, "verse": "9", "full_reference": "John 1:9" },
  "niv_primary": "The true light that gives light to everyone was coming into the world.",
  "special_occasion": null,               // 节日覆盖时填标识,平日 null
  "mood_tags": ["#早晨盼望", "#寻求方向", "#感到黑暗"],   // 恒为 3 个中文 # 标签(所有语言文件相同)
  "translations": {
    "en": {
      "traditional": { "version": "KJV", "text": "That was the true Light, which lighteth every man that cometh into the world." },
      "modern":      { "version": "NIV", "text": "The true light that gives light to everyone was coming into the world." }
    }
  },
  "exegesis": { "verse_category": {}, "niv_word_count": 13, "historical_context": "…", "key_themes": [], "version_note": "…", "original_language_note": "…", "life_connection": [] },
  "devotional": {
    "structure": "起承转合",
    "copyright_check": { "niv_words": 13, "required_min": 39, "en_words": 65 },
    "en": {
      "meditation": "…三段,段间用 \\n\\n…",
      "action_step": "一到两句、今天可执行的具体邀请。"
    }
  },
  "prayer": {
    "structure_used": "free_form",
    "copyright_check": { },
    "en": "单段祷文…In Jesus' name, amen."
  }
}
```

各语言的双译本约定(traditional = 公版直译体,modern = 现代白话体):

| 语言 | traditional | modern |
|---|---|---|
| en | KJV | NIV |
| zh-Hans | CUV 和合本 | CCB |
| zh-Hant | CUV 和合本(繁) | CCB(繁) |
| de/fr/es/pt | 该语言公版经典译本 | 该语言现代译本 |

App 端实际渲染的只有:`reference`、`translations[lang].modern`、
`devotional[lang].meditation / action_step`、`prayer[lang]`——它们分别就是
四页流程:**verse 页 → meditation 页 → action 页(反思)→ prayer 页**。
其余字段(exegesis、mood_tags、copyright_check)是创作依据与审核凭据,照样要写全。

## 3. 写作规范(从现行内容归纳,保持一致)

**共同气质**:温柔、贴近、第二人称直接对读者说话;先接住情绪、再引向基督;
不说教、不居高临下、不制造罪疚;不堆砌经文引用(版权红线见 §4)。

- **meditation**:恒为 **3 段**,段间 `\n\n`。EN 约 **140–230 词**;中文约
  **280–380 汉字**;其余语言与 EN 篇幅相当。结构「起承转合」:第一段接住
  读者当下的处境/情绪并引入经文;第二段展开经文对"你"意味着什么;第三段
  收束到今天的转向与安息。
- **action_step**:**1–2 句**,今天就能做的一个具体、微小、可执行的动作
  (说出一个名字、写下一件事、为某处邀请耶稣进入)。不布置读经作业。
- **prayer**:**单段**,EN 约 80–120 词,称呼以 "Dear Heavenly Father" 一类
  开头,结尾**定式**:EN "In Jesus' name, amen." / 简中「奉主耶稣的名祷告,
  阿们。」/ 繁中同义繁体;其余语言用该语言的等价定式。内容呼应当日
  meditation 的主题,包含感恩 + 一个诚实的祈求。
- **中文人称用「你」**(现行内容通例;app 界面文案才用「妳」,别混)。
- **早/晚分工**:morning 选盼望、光、开始、力量类经文;evening 选安息、
  交托、平安、赦免类。`mood_tags` 按当条情绪写 3 个中文 # 标签。
- **选经**:一批 60 天内不重复同一节;新旧约、书卷分布均衡;避开需要长
  上下文才不被误读的经文。`special_occasion` 用于节日(圣诞、复活节等)
  覆盖——平日一律 null。

## 4. 版权红线(不可越)

1. **modern 现代译本每条只引用当节经文本身**,一字不多。
2. **3× 规则**:`devotional.copyright_check.required_min = niv_words × 3`,
   你写的 meditation(EN 词数)**必须 ≥ 这个数**——原创文字必须至少是
   受版权译文引用量的三倍,这是引用正当性的凭据,字段要如实填。
3. traditional 公版译本(KJV/CUV 等)文本必须**逐字准确**,不改写。
4. devotional 与 prayer 里**不再整句复述经文译文**——用自己的话说。

## 5. 跨语言纪律

- EN 为主稿,先定 EN,再产出其余六语——**不是逐词翻译**,是同一属灵内容
  的母语级重写,篇幅与结构对齐 EN。
- 同一 `day+segment` 的 `id / reference / mood_tags / special_occasion`
  七个文件**逐字节一致**(下游有对齐校验,不一致整批打回)。
- 每个语言文件都保留英文参考字段(`niv_primary`、`exegesis`、
  `devotional.en`、`prayer.en`)——meta.note 里写明的惯例。

## 6. 封面图方向(`cover_briefs.md`)

封面是**早/晚两个轮换池**的背景图(不是一节一图),风格锚定现行
`follow_him` 日/夜双图:写实柔光、大面积留白、无人物特写正脸、无文字。
每批为两个池各提议 **3–5 张**新图,每张一段 brief,模板:

```markdown
## morning-03
- 气质:黎明将亮未亮,盼望而安静
- 画面:低角度麦田/山径/窗台,暖金侧光,远景薄雾
- 构图:主体压下三分之一,**上方 2/3 留净空**(经文文字叠加区)
- 色彩:暖金 + 柔白;避免高饱和、避免玫红大面积(玫红是 UI 强调色,背景要退后)
- 禁忌:无文字、无 logo、无正脸人物、无宗教符号特写(十字架剪影远景可)
- 用途备注:同图会被系统裁切进 4×2 桌面小组件——**中心安全区构图**,压缩后 ≤ 300KB(webp)
```

evening 池同理:暮色、烛光、星空、归家等意象,冷调偏暖收边。

## 7. 交付前自检清单(逐项过)

- [ ] 每个文件恰 120 条:morning 60 + evening 60,day 1–60 无缺无重
- [ ] `id` 与 `day/segment` 对应(m_001…m_060 / e_001…e_060)
- [ ] 七文件的 id/reference/mood_tags/special_occasion 逐条一致
- [ ] 每条 meditation 恰 3 段(两处 `\n\n`),篇幅在 §3 区间
- [ ] 每条 EN meditation 词数 ≥ `required_min`(= niv_words × 3),字段如实
- [ ] prayer 结尾定式正确、单段
- [ ] traditional 译文与公版原文逐字核对过
- [ ] JSON 可解析、无尾逗号、UTF-8
- [ ] `cover_briefs.md` 早/晚各 3–5 条,每条含留白与小组件安全区说明

## 8. 你不做的事

构建、瘦身、上传、版本段(`/vN/`)升级、对齐校验脚本、旁白音频——全部
属于下游工程节点。你只交 §1 的 8 个文件;被打回时按校验报告修内容再交。
