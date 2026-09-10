# 打熊战斗模型

## 已确认环境

- 固定 10 回合；巨熊全盾、无限生命，不减员且不会提前结束。
- 巨熊基础防御固定；当前不引入未经确认的绝对防御到伤害映射。
- 减防只通过已确认乘区结算一次：M_defRed = 1 + Σr。不使用 1/(1-r)，也不使用 enemyDefense/(1+r)。
- 计算过程保留完整浮点数；只有出征容量最终值按规则执行 floor。游戏伤害内部取整时点仍待验证。

## 单回合基础伤害

设整车总兵量为 N，当前兵种兵数为 n，k=0.0075577。

D = 0.0075577 × sqrt(min(N,5000)) × sqrt(n) × Cd × Ct × (1+P) × (1+A)

判断依据仅为整车总兵数 N；sqrt(n) 始终使用当前兵种实际数量。Cd 为盾/矛/射的 1/3/4；Ct 只读取已确认表。公式不存在除以 2，不修改 k，也不插值未知 Ct。

## 十回合伤害

基础公式只产生单回合伤害。正式结果由逐回合状态与精确概率分支得到：

E[D_battle] = Σ(r=1..10) E[D_r]

当前正式熊模型逐兵种直接结算普通伤害与同区加算的 extraDamage，不创建 AttackEvent。底层 AttackEvent/extraAttack 框架仅作为历史测试与未来扩展保留，不被正式十回合入口、UI、优化器或 benchmark 调用。

单回合在基础公式 B 之上使用：

```text
D = B × commonMultipliers ×
    (normalAttackMultiplier + extraDamageRate × skillDamageMultiplier)
```

基础增伤属于 common；普攻增伤只作用于普通分支；技能增伤只作用于 extraDamage 分支；易伤仍是下一回合生效的 common 乘区。
