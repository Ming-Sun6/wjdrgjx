# 兵种技能系统

兵种技能以 troopTierSkill 保存，与 fireCrystalSkill 分开。

## 射手

- 远程打击：对盾 +10%，属于 skill.troopVsTroopDamage。巨熊固定盾兵，因此自动生效。
- 连射：T7 解锁，所有更高阶段保留。原始资料语义仍保存为10%概率 extraAttack；当前正式熊模型通过 `rawMechanicType=extraAttack`、`bearModelType=extraDamageExpected` 映射为10%期望 extraDamage，不创建 AttackEvent。

远程打击 +10% 与布拉德利对盾 +25% 在 troopVsTroopDamage 内加算为1.35。

## 矛兵

- T12技能：配置等级 L0–24，每级 baseDamageIncrease +1%；仅 round1–5 生效，L24为+24%。承伤降低部分不适用于对熊输出。
- 炎晶战矛：FC3 10%、FC5起15%概率；触发时当前攻击总伤害×2，对应 +100% extraDamage，不产生 extraAttack、不增加攻击次数且不递归。
