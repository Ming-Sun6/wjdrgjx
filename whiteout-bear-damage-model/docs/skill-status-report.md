# 技能状态报告

本报告由当前真实 body、head、troopTierSkill 与 fireCrystalSkill catalog 的验收口径整理。

| 状态 | 技能数 | 效果数 |
|---|---:|---:|
| supported | 76 | 80 |
| pending | 4 | 0 |
| unsupported | 0 | 0 |

pending 分类：RULE_UNKNOWN 0、ENGINE_GAP 0、DATA_SOURCE_UNCERTAIN 4。

DATA_SOURCE_UNCERTAIN：丽娅拉、艾丝蒂拉、埃莉诺、弗洛拉的车身技能资料占位。它们不进入正常 UI 或优化器。

尼莫的战前宣言、剑术指导、精湛剑术均为 supported，尼莫 pending 数量为 0。精湛剑术在 round5/6/9/10 提供全军基础增伤+30%。

格温三个车头运行时技能记录均为 supported：常规易伤从 round2 起生效；第6次普通攻击附加100% extraDamage；round7以15% vulnerable replace其他易伤。格温 pending 数量为 0。

射手五项远程打击、连射、燃晶火药、火焰冲击、炽火燧星（射T12技能）均为 supported。v0.4 车头目录没有 pending。尼莫三断斩、剑气、孤傲已确认是 exploration，不计为 pending。只影响我方承伤或敌方输出的技能使用 notApplicableToBearOutgoingDamage，不计为 pending。
