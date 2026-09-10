# 火晶技能系统

fireCrystalSkill 与 troopTierSkill 分开保存并按等级自动解锁。

## 射手火晶

- 燃晶火药：FC3 Lv1，20%概率；FC5起 Lv2，30%概率；触发产生 50% extraDamage。
- 火焰冲击：FC8 Lv1，normalAttackDamageIncrease +4%，燃晶火药触发时联动 extraDamage +25%；FC10 Lv2，分别为 +6% 与 +37.5%。联动通过同一概率来源的数据结构执行，不合并为全局 93.5%。
- 炽火燧星（射T12技能）：配置等级 L0–24，每级 +0.5%；round1–5 为0，round6–10一次性使用 0.005×L，L24为+12%，不在战斗中逐层增加。

## 自动等级

T10-FC1–FC10 全部保留；UI 使用 T11-FC5–FC10 和 T12-FC10。Ct 与 UI 展示分离：没有已确认 Ct 时拒绝计算，不插值或外推。
