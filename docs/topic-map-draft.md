# 词表对齐草稿 v2:我们的 ~150 主题 ↔ Nave's/Torrey 库

> Agent 2 的起手映射表(v2,2026-08-29 业主驳回四条错误映射后按新规则
> 全表重审)。数据源:`j86schroeder/topical-bible-search` 的
> `dist/{nave,torrey}/topics.jsonl`(5,742 个主题 slug)。
> **候选 slug 全部实测存在于库中。**

## 映射的两条铁律(v2 新立,逐行按此审过)

1. **语义同心**:C 表的映射是「召回通道」——从库内该主题拉候选经文来
   给我们的主题打标。通道合格的标准:拉出来的经文**大多数**能正确打上
   我们这个标签。只是"有点关系"不算(教训:christmas≠incarnation、
   encouragement≠comfort——概念不同,通道也不干净)。
2. **不抢自有主题的道**:候选 slug 若是我们**另一个**主题的直配来源
   (如 trust、faithfulness、salvation、obedience 本身都在词表里),
   除非经文真的两题共属(如 Eph 6:11 同属 equipment 与
   spiritual-warfare),否则不得挪用——照搬会让两个主题页变成同一张脸
   (教训:dependence 照搬 trust)。拿不准 → 归 D。

## 对齐统计(v2)

| 类别 | 数量 | 说明 |
|---|---|---|
| A. 同名直配 | 109 | slug 完全一致 |
| B. 微差直配 | 6 | 仅单复数/冠词差 |
| C. 同义通道 | 33 | 语义同心、已按两条铁律复审 |
| D. 纯编辑 | 13 | 库内无合格通道;各给经文起点,不硬凑 |

## A. 同名直配(109 个)

我们词表里凡不在 B/C/D 三表中的,slug 在库里同名存在,直接用。

## B. 微差直配

| 我们 | 库内 slug |
|---|---|
| desires | desire |
| the-father | father |
| idols | idol |
| orphans | orphan |
| sacrifice | sacrifices |
| the-word | words |

## C. 同义通道(33 个;候选按相关度排序)

| 我们 | 库内候选 slug | 备注 |
|---|---|---|
| addiction | temperance, intemperance, drunkenness | 酒/节制族群,通道部分覆盖,现代成瘾语境编辑补 |
| almighty | omnipotence, power-of-god-the | |
| awe | reverence | 敬畏 |
| blameless | uprightness, integrity | holiness 是自有主题,不挪用 |
| calling | call-of-god-the, personal-call, call | |
| community | fellowship, communion-of-saints, unity | |
| easter | resurrection-of-christ-the, easter-a-v | Easter=复活节,复活经文即其内容,语义同心成立;easter-a-v 是徒 12:4 的 KJV 孤例,仅存参考 |
| equipment | armor, weapons | dailyverses 的 Equipment 即属灵军装;armor 与 spiritual-warfare 共用合法(经文两题共属) |
| following | disciple, discipleship | |
| goodness | goodness-of-god-the | 神的良善;人行善的一半编辑补 |
| healing | diseases | 从疾病叙事中筛医治应许/神迹;非全收 |
| jesus | jesus-the-christ, names-of-jesus, christ | 库内子主题多,按需展开 |
| judgement | judgment, judgment-the, judgment-seat | |
| kingdom | kingdom-of-heaven | |
| mediator | christ-the-mediator, mediation | |
| nearness | communion-with-god, access-to-god | 亲近神(雅 4:8) |
| planning | counsel, prudence, counsels-and-purposes-of-god-the | 箴 16:9 一族 |
| purify | purification, purity, cleansing, sanctification | |
| rebirth | regeneration, new-birth-the | regeneration 归此题独享(见 transformation 行) |
| receiving | gifts-from-god | 「祈求就得着」;与自有主题 prayer 的分界:这里只收"得着"应许 |
| relationships | brotherly-kindness | friendship/fellowship 分别是 friendship、community 的道,不挪;其余编辑补 |
| reliability | stability, steadfastness | faithfulness 是自有主题,不挪;神之可靠(磐石/锚)编辑补 |
| sadness | sorrow, grief, mourning | |
| safety | security, refuge | |
| savior | saviour-savior | salvation 是自有主题,不挪 |
| second-coming | second-coming-of-christ-the | |
| seeking | seeking-god | |
| serving | servant, servants | 侍奉视角;剔除奴仆制度类叙事节 |
| sexuality | chastity, adultery, fornication, lasciviousness | 从严;单独可读性高门槛 |
| spiritual-warfare | armor, satan, devil, kingdom-of-satan | temptation 是自有主题,不挪 |
| understanding | knowledge | 部分覆盖 |
| weakness | infirmity | 林后 12:9 |
| worry | anxiety, care | |

## D. 纯编辑(13 个;附经文起点,防止从零开始)

| 我们 | 说明与经文起点(KJV 编号) |
|---|---|
| acknowledge | 「认定神」,非认罪。Prov 3:6; Ps 100:3; Hos 6:3; 1 John 4:15 |
| christmas | 耶稣降生族群,库内无 nativity 槽(incarnation 是教义,已弃)。Luke 1:26-38; Luke 2:1-20; Matt 1:18-25; Isa 7:14; Isa 9:6; Micah 5:2; John 1:14 |
| dependence | 倚靠神;与自有主题 trust 刻意区分(trust=信靠的信心面,dependence=离了祂不能作什么)。John 15:5; Ps 62:1-2; Prov 3:5-6; 2 Cor 1:9; Ps 121:1-2 |
| encouragement | 鼓励/彼此建立,非安慰(comfort 语义不同,已弃)。1 Thess 5:11; Heb 10:24-25; Josh 1:9; Isa 41:10; Phil 4:13 |
| end-times | 库内无 end-times 槽;second-coming 归其本题。Matt 24; 2 Tim 3:1-5; 2 Pet 3:10-13; Rev 21:1-4 |
| fruitfulness | 结果子。John 15:1-8; Gal 5:22-23; Ps 1:3; Col 1:10(库内仅反义 barrenness,弃) |
| health | 身心安康。3 John 2; Prov 3:7-8; Prov 17:22; Jer 33:6; 1 Cor 6:19-20 |
| listening | 听神/快快地听;obedience 是自有主题,不挪。James 1:19; Prov 1:5; John 10:27; Rom 10:17; Luke 11:28 |
| mind | 心思意念。Rom 12:2; Phil 4:8; Col 3:2; Isa 26:3; 2 Tim 1:7(meditation 可作弱通道) |
| redeemer | 库内竟无 redeem* 槽(实测零命中)。Job 19:25; Isa 44:6; Isa 47:4; Gal 3:13; Titus 2:14; 1 Pet 1:18-19 |
| thoughts | 与 mind 相邻但独立(意念的内容/省察)。Ps 139:23; Ps 139:17; Isa 55:8-9; Jer 29:11; 2 Cor 10:5(meditation 可作弱通道;KJV 的 imagination 多为贬义,弃) |
| transformation | 生命更新;regeneration 已归 rebirth 独享。Rom 12:2; 2 Cor 3:18; 2 Cor 5:17; Ezek 36:26; conversion/sanctification/heart-character-of-the-renewed 可作弱通道 |
| valuable | 「你是宝贵的」——人的宝贵,非基督的宝贵(preciousness-of-christ 方向相反,已弃)。Isa 43:4; Ps 139:13-14; Matt 10:29-31; Luke 12:6-7; Eph 2:10 |

## 使用方式(写给 Agent 2)

1. 定稿词表时把本表过一遍:C 表逐行确认/替换,D 表的经文起点核进候选池;
2. 召回阶段:A/B/C 按映射从 `assertions.jsonl` 拉全部单节断言为候选池;
3. D 表主题与 C 表标了"部分覆盖/编辑补"的,逐卷通读(§5 工作流)时
   格外留神补标;
4. 反向 QA(每主题 ≥25 节保底)对 C/D 表主题重点检查;
5. 两条铁律适用于你后续的一切增补:新加通道先过「语义同心」与
   「不抢道」再入表。
