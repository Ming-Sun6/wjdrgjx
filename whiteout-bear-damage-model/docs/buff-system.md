# Buff 系统

Buff 是独立于英雄 skill major zone 和专家增伤的 major zone。

战报输入 A/P 已经只在基础公式的 `(1+A)(1+P)` 中出现一次，不属于 Buff。城镇、宠物与专武是战斗准备阶段的额外来源，才进入 Buff。

当前小乘区为 buff.attack、buff.penetration、buff.defenseReduction、buff.capacity。同一 Buff 小乘区先加算，不同小乘区以及 Buff 与 Skill 之间相乘。例如 skill.attack +25% 与 buff.attack +20% 为 1.25 × 1.20。

城镇攻击、穿透、减防、出征分别可选 none=0、small=10%、large=20%；同类型小/大互斥。宠物攻击、穿透、减防等级 0–10 的数值为 0、2.5%、3%、3.5%、4%、5%、6%、7%、8%、9%、10%。

英雄专武 0–5 的数值为 0、5%、7.5%、10%、12.5%、15%。攻击型：尼莫、米娅、亨德里克、鲁弗斯；穿透型：阿隆索、格温、布兰琪；布拉德利为 none。映射存放在英雄数据的 exclusiveWeaponBuffType，不按名字判断。

Buff 减防继续使用已确认的等效倍率 1+Σr，不推导绝对 enemyDefense 公式。

例如宠物减防10%与两个亨德里克车身减防25%+25%分别得到 `buff.defenseReduction=1.10`、`skill.defenseReduction=1.50`，最终相乘为 `1.65`，不能先合并为 `1.60`。
