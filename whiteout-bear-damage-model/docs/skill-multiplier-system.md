# 技能乘区系统（阶段 3）

## 范围

技能乘区系统负责单次攻击内的通用技能效果、`always`效果解析和乘区聚合。整场10回合及概率、周期、持续、叠层、extraDamage、extraAttack和触发链由更高层模块编排，最终仍复用本乘区系统。

## 效果值单位

`SkillEffect.value` 使用小数：

```text
0.25 = +25%
```

`targetTroop` 可设为 `shield`、`lancer`、`marksman` 或 `all`，省略时默认为 `all`。`shieldDamage`、`lancerDamage`、`marksmanDamage` 自带对应的兵种限制。

## 聚合规则

同一个乘区先加算：

```text
M_zone = 1 + sum(x_i)
```

不同乘区再相乘：

```text
M_total = M_attack × M_penetration × M_defRed × ...
```

技能攻击和技能穿透位于战报属性之外。例如战报攻击倍率为 `1 + A`，技能攻击乘区为 `1 + sum(x_i)`，最终相关部分为：

```text
(1 + A) × (1 + sum(x_i))
```

## 已确认的减防规则

打熊减防乘区使用：

```text
M_defRed = 1 + sum(r_i)
```

例如减防 25% 与 10% 同时存在时，减防乘区为 `1.35`。减防仍保留独立 resolver，便于独立维护；旧的除法模型已完全移除。

## 正式打熊伤害分支

设基础公式伤害为 B，共同乘区包含 attack、penetration、defenseReduction、baseDamageIncrease、troopVsTroopDamage、vulnerable、Buff 与专家乘区。正式结构为：

```text
D = B × commonMultipliers ×
    (normalAttackMultiplier + extraDamageRate × skillDamageMultiplier)
```

- `baseDamageIncrease` 作用于整个伤害结构。
- `normalAttackDamageIncrease` 只放大普通伤害分支。
- `skillDamageIncrease` 只放大 extraDamage 技能伤害分支。
- `extraDamage` 保存附加伤害 rate；同回合所有来源相加，不彼此相乘。

`damageIncrease`、`normalAttackDamage`、`skillDamage` 仅作为旧配置兼容别名，正式真实数据使用新的 Increase 字段。历史 extraAttack/AttackEvent 执行器保留用于兼容测试和未来扩展，不属于当前正式熊计算链路。

## 暂缓结算的效果

资料不完整的效果不会进入正式结算。格温第6次普通攻击的100% extraDamage已完整确认并进入正式结算；它不产生 extraAttack 或新的 AttackEvent。

## 触发方式

底层 `resolveSkillEffects()` 只直接解析 `always`。以下触发不能脱离事件/状态上下文直接传入它，否则会抛出 `UnsupportedSkillTriggerError`：

- `probability`
- `everyNRounds`
- `beforeAttack`
- `afterAttack`
- `onSkillTrigger`
- `stacking`

未知效果乘区会抛出 `UnknownEffectTypeError`，不会静默忽略。

`resolveSkillTrigger()`已能对来源明确的onSkillTrigger返回active/inactive；概率、周期和生命周期由各自高层执行器处理。正式普通入口依旧只接受不含生命周期配置的always技能；生命周期规则尚未确认时会抛出`UnsupportedSkillLifecycleError`。相关状态工具和时序限制见 [round-state-framework.md](./round-state-framework.md) 与 [skill-trigger-chain.md](./skill-trigger-chain.md)。
