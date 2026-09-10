# 第二十步：10回合完整期望伤害模拟器

## 正式入口

`calculateBearBattleExpectedDamage(input, options)` 是完整十回合期望伤害入口，并保留 `calculateExpectedBattleDamage()` 作为兼容名称。两者调用同一实现：

```text
BattleInput + BearBattleContext
              ↓
WeightedBattleState（精确概率分支）
              ↓
每回合显式事件与ActiveEffect
              ↓
既有calculateBattleDamage()
              ↓
extraDamage；AttackEvent / extraAttack 仅为历史与未来扩展框架
              ↓
回合结束生命周期转换与状态合并
              ↓
Σ round 1..10 的期望伤害
```

没有重新实现 `0.0075577`、5000兵分段、兵种常数或技能乘区。

## 状态职责

- `BattleState`：只保存当前回合、战斗完成状态与会跨事件变化的 `ActiveEffect[]`。
- 固定兵数和属性：继续保存在 `BattleDamageInput`，不复制进动态状态。
- 概率：保存在 `WeightedBattleState.probability`，不污染普通确定性状态。
- 累计伤害：保存在 `WeightedBattleState.accumulatedDamage`。
- 叠层、应用次数和持续时间：由每个 `ActiveEffect` 的 `stackCount`、`applicationCount`、`remainingRounds` 保存。
- 周期调度：由明确的 `everyNRounds` 元数据和场景计划负责；未知的游戏冷却行为不猜测。

## 回合流程

每个回合按显式软件边界执行：创建回合计划、传播伤害前事件、调用现有伤害引擎、传播伤害后事件、执行已配置的生命周期转换、推进回合并合并未来等价状态。事件没有明确phase时不能进入正式模拟。

持续3回合且 `activationTiming=immediate` 的测试效果在第1回合加入后，会在第1、2、3回合参与伤害；统一的 `advanceDurationEffectsAfterRound()` 在回合后递减时长，第4回合前将其移除。真实技能必须明确duration、activationTiming和refreshMode后才能使用该路径。

## 概率与伤害

概率事件按Bernoulli状态精确分裂。每条分支都携带自己的ActiveEffect、叠层和累计伤害，然后重新调用既有伤害引擎。相同未来状态只在canonical key完全相同时合并；不会使用 `1 + p × buff`、Monte Carlo或相似状态近似。

extraDamage作为独立伤害组件输出并在同区加算。当前正式熊模型不创建extraAttack或AttackEvent；底层旧实现保留但不参与正式入口。

## 减防

已确认伤害等效倍率继续为：

```text
M_defRed = 1 + sum(r_i)
```

巨熊绝对防御到伤害的底层映射尚未确认。因此存在减防时，报告层只给出已确认的 `M_defRed`，`enemyEffectiveDefense` 返回 `null` 并标记为待验证，不再推导 `enemyBaseDefense / M_defRed`。伤害引擎只应用 `M_defRed` 一次；穿透仍是独立攻击方乘区。

## 逐回合输出

每个 `ExpectedRoundDamageResult` 现在包括：

- `expectedBaseDamage`
- `expectedSkillDamage`（`normalDamage - baseDamage`，只用于解释技能乘区增量）
- `expectedNormalDamage`、`expectedExtraDamage`、`expectedTotalDamage`
- `expectedPrimaryAttackDamage`、`expectedExtraAttackDamage`、`expectedAttackCount`
- 三兵种伤害明细与概率加权乘区
- 当前ActiveEffect的存在概率、期望层数/应用次数/剩余时长
- 敌方基础防御、各兵种期望有效防御和期望减防倍率
- 当前概率质量与状态数量

这些字段满足恒等式：

```text
expectedTotalDamage = expectedBaseDamage + expectedSkillDamage + expectedExtraDamage
```

`expectedSkillDamage`是聚合解释项，不声称能够唯一归因到单个技能；多技能相乘时的单技能边际贡献仍需另行定义归因方法。
