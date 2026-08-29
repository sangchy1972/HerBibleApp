# 词表对齐草稿:我们的 ~150 主题 ↔ Nave's/Torrey 库

> Agent 2 的起手映射表(主 agent 2026-08-29 对真实数据三轮跑批产出)。
> 数据源:`j86schroeder/topical-bible-search` 的 `dist/{nave,torrey}/topics.jsonl`
> (合计 5,742 个主题 slug)。**每个候选 slug 都已验证真实存在于库中。**
> 这是召回辅助的起点,不是终稿——agent 定稿词表时逐行确认/增删,
> 多对一完全正常(一个我们的主题吃多个库内细颗粒主题)。

## 对齐统计

| 类别 | 数量 | 说明 |
|---|---|---|
| A. 同名直配 | 109 | slug 完全一致,零成本 |
| B. 微差直配 | 6 | 仅单复数/冠词差 |
| C. 同义映射 | ~43 | 19 世纪词汇差,下表给出人工筛过的候选 |
| D. 纯编辑 | ~3 | 库内无对应,召回全靠 agent 自判 |

## A. 同名直配(109 个,不列了)

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

## C. 同义映射(候选已验证存在;按相关度排序)

| 我们 | 库内候选 slug | 备注 |
|---|---|---|
| acknowledge | confession, confessing-christ, thankfulness | |
| addiction | temperance, intemperance, drunkenness | |
| almighty | omnipotence, power-of-god-the | |
| awe | reverence | |
| blameless | uprightness, integrity, holiness | |
| calling | call, personal-call, call-of-god-the | |
| christmas | incarnation | 耶稣降生族群 |
| community | fellowship, communion-of-saints, unity | |
| dependence | trust, confidence | |
| easter | easter-a-v, resurrection-of-christ-the, resurrection | |
| encouragement | comfort, consolation, affliction-consolation-under | |
| equipment | armor, weapons | 属灵军装 |
| following | disciple, discipleship | |
| fruitfulness | (barrenness 为反向参考) | 主要靠编辑 |
| goodness | goodness-of-god-the | |
| healing | diseases | 医治散在 diseases 与神迹族群 |
| health | diseases, physician | |
| jesus | jesus-the-christ, names-of-jesus, christ | 库内子主题极多,按需展开 |
| judgement | judgment, judgment-the, judgment-seat | |
| kingdom | kingdom-of-heaven | |
| listening | obedience, obedience-to-god | 部分覆盖 |
| mediator | christ-the-mediator, mediation | |
| nearness | communion-with-god, access-to-god | |
| planning | counsel, prudence, counsels-and-purposes-of-god-the | |
| purify | purification, purity, cleansing, sanctification | |
| rebirth | regeneration, new-birth-the | |
| receiving | gifts-from-god | |
| relationships | friendship, fellowship, brotherly-kindness | |
| reliability | faithfulness, stability, steadfastness | |
| sadness | sorrow, grief, mourning | |
| safety | security, refuge | |
| savior | saviour-savior, salvation, plan-of-salvation | |
| second-coming | second-coming-of-christ-the | |
| seeking | seeking-god | |
| serving | servant, servants | 侍奉视角,剔除奴仆制度节 |
| sexuality | chastity, adultery, fornication, lasciviousness | 从严,单独可读性高门槛 |
| spiritual-warfare | armor, satan, devil, kingdom-of-satan, temptation | |
| thoughts | meditation, imagination | |
| transformation | regeneration, sanctification, conversion, heart-character-of-the-renewed | |
| understanding | knowledge | 部分覆盖 |
| valuable | preciousness-of-christ, precious-stones | 「你是宝贵的」主要靠编辑 |
| weakness | infirmity | |
| worry | anxiety, care | |

## D. 纯编辑(库内无可用对应)

| 我们 | 说明 |
|---|---|
| end-times | 库内无 end-times/eschatology 槽;用 second-coming-of-christ-the + judgment-the 部分召回,其余编辑自判 |
| mind | 库内无 mind 槽;meditation/imagination 部分覆盖,心思意念类经文编辑自判 |
| redeemer | 库内竟无 redeem* 槽(实测零命中);经由 salvation/saviour 族群 + 编辑自判 |

## 使用方式(写给 Agent 2)

1. 定稿词表时把本表过一遍:确认/替换候选,补上你展开的库内子主题;
2. 召回阶段:按定稿映射,从 `assertions.jsonl` 里把映射到的库内主题的
   全部单节断言拉为候选池;
3. C/D 表的"部分覆盖/纯编辑"主题,候选池只是下限——逐卷通读时
   (§5 工作流)对这些主题格外留神补标;
4. 反向 QA(每主题 ≥25 节保底)对 C/D 表主题重点检查。
