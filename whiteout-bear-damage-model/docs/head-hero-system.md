# 车头英雄系统

车头每个兵种一个槽位，英雄兵种必须与槽位匹配；车头读取该英雄全部远征技能，车身只读取 bodySkill。两类技能最终进入同一个 SkillResolver 和十回合概率引擎，同乘区仍加算。

英雄远征技能统一采用 5 级数据。单个车头可同时包含 supported、pending 和 notApplicable 技能：supported 参与计算，pending 跳过并报告原因，notApplicable 只保留说明。

## 当前车头

- 盾：尼莫（1代）、弗林特（2代）、赫克托（5代）。弗林特的三个5级常驻远征技能均正式生效：野火燎原仅提供盾兵伤害+100%，燃烧意志提供全军攻击+25%，无尽烈火提供全军穿透+25%。尼莫的三个5级远征技能均正式生效：战前宣言常驻全军穿透+25%，剑术指导常驻全军攻击+25%，精湛剑术在 round5/6/9/10 提供全军基础增伤+30%。尼莫可手动选择并进入自动优化。三断斩、剑气、孤傲只存在于 explorationSkills，不进入打熊 SkillResolver。
- 矛：米娅（3代）。
- 射：津曼(S1)、阿隆索(S2)、格雷格(S3)、琳恩(S4)、格温(S5)、韦恩(S6)、布拉德利(S7)、亨德里克(S8)、修拉(S9)、布兰琪(S10)、鲁弗斯(S11)、丽姬娅(S12)、乌尔卡努丝(S13)、卡拉(S14)、维薇卡(S15)、艾诗琳(S16)。

车头下拉只显示“英雄名（S代数）”；技能名称、5级数值、触发与适用范围统一在下方详情区域展示。当前所有正式车头均已记录代数。

概率与计数语义保持数据驱动：韦恩暴击和维薇卡额外伤害使用 `independentTroopTargets` 生成盾/矛/射三个独立 Bernoulli 事件；琳恩使用既有周期叠层状态；修拉/丽姬娅用 `normalAttackCounter` 保存计数来源，丽姬娅两技能共享同一 `counterId`；乌尔卡努丝与格温通过同一构造器复用第6次额伤和第7回合易伤覆盖规则。

鲁弗斯统一显示名为“鲁弗斯”，稳定 ID 暂保留 hero.head.lufusi 以兼容已有存档。米娅的槽位为 lancer。专武类型由 exclusiveWeaponBuffType 数据驱动，不按英雄名判断。

普通 vulnerable 默认下一回合生效。格温第6次普通攻击附加100% extraDamage，不产生 extraAttack 或新的 AttackEvent；随后在 round7 使用15% vulnerable replace，覆盖当回合其他易伤；下一回合恢复正常状态演化。格温没有 pending 远征技能。

## v0.4 战报英雄与实际车头

战报英雄只提供生成战报时的静态攻击与专武穿透基准，不触发任何技能，也不替代实际车头。战报模式由 `resolveBattleReportEffectiveAttributes()` 统一计算静态差值；集结模式不应用该差值。静态档案和下拉数据见 `src/game-data/heroes/reportHeroProfiles.ts`，完整规则见 `docs/report-hero-system.md`。
