# 第九步：十回合状态与触发框架

## 固定输入与动态状态

固定的兵数、等级、战报属性和车身仍由已有输入类型表达。`BearBattleContext` 保留固定 10 回合、敌方全盾、无限血量和固定基础防御。

`BattleState` 仅保存当前回合、总回合数、ready/completed 状态和 `ActiveEffect[]`。ready 状态从 1 推进至 10，第 10 回合结算后保持 currentRound=10 并标记 completed；不会提前结束或创建第 11 回合。

`ActiveEffect` 复用已有 `SkillEffect`，以 `sourceId + sourceSkillId + effectId` 表达稳定身份，并保存适用兵种、remainingRounds、valuePerStack、stackCount、applicationCount，以及可选的 durationRounds、refreshMode、maxStacks、atMaxStacks、decayRate、maxApplications。相同技能的不同来源可以独立存在，实例 ID 必须唯一。

`Skill.lifecycle` 和 `SkillEffect.lifecycle` 使用共同的 `EffectLifecycle` 类型。它们只声明配置；若两层同时配置，优先级和合并规则尚未定义。创建运行状态时由未来解析策略明确提供字段，不隐式合并。

## 触发类型

在原有 SkillTrigger 联合类型上扩展，包含 always、probability、everyNRounds、beforeAttack、afterAttack、onSkillTrigger，保留旧 stacking 预留类型以兼容现有配置。

`resolveSkillTrigger(trigger, context)` 对always返回active，也能在明确sourceSkillId时对onSkillTrigger返回active/inactive；其余触发仍返回unimplemented诊断。正式 `resolveSkillEffects()` 仍只直接接受always，onSkillTrigger由事件链解析后才把效果交给伤害引擎；即使trigger=always，只要配置生命周期，也会抛出UnsupportedSkillLifecycleError，避免误当永久增益。

原有 probability.durationRounds 继续兼容保存，并未转成新的正式计算规则。

## 回合解析

`resolveRound(context, state, dependencies)` 编排以下软件步骤：

```text
roundStart → readActiveEffects → resolveSkills
→ calculateDamage → updateState → roundEnd
```

`calculateDamage` 接收固定上下文、当前 BattleState 和 RoundState，返回现有 BattleDamageResult。`effectStatePolicy.updateEffects` 是可选策略接口；没有显式策略时，动态状态会明确报错。上述步骤不表示已经确认盾/矛/射攻击或复杂技能的事件顺序。

当前 `calculateBearBattleTotalDamage()` 仍只调用一次原单回合计算器，随后将已确认的常驻结果交给 resolveRound，推进并汇总 10 次。常驻效果的 ActiveEffect 实例仅用于状态与解释，不再次应用乘区，也不按回合递增层数/应用次数。

每回合保留原有伤害、activeEffects、乘区解释，并补充：

- activeEffects.instances：本回合有效的状态实例；
- stateBefore / stateAfter：回合推进前后的只读快照；
- phases：软件阶段记录。

整场补充 finalState。为兼容原有注入式计算器，这些新增结果字段采用可选字段；当前正式整场入口会提供它们。

## 持续、叠层和衰减

状态辅助函数是显式、返回新对象的操作，不会修改旧状态。资料完整的合成场景现已支持duration的immediate/nextRound与refresh/replace、everyNRounds的显式首次回合、线性stack、概率stack，以及独立的decay值和maxApplications计算。真实技能仍必须提供时序与重复触发规则后才能启用。

测试中的显式持续时间策略仅为框架测试数据，不对应任何英雄的游戏机制。

## 额外伤害与额外攻击

extraAttack 仍作为未来扩展的独立 EffectType 保留。当前正式熊模型只结算 extraDamage，并通过 `calculateSimplifiedBearRoundDamage()` 直接逐兵种解析，不创建 AttackEvent；旧 deferredExtraAttackEffects/AttackEvent 流程只用于历史框架测试。详见 `extra-damage.md` 与 `extra-attack.md`。

## 数值兼容性

基础伤害公式、等级常数、减防 resolver、三个优化器及评分目标均保持原样。十回合伤害保留原来的从第 1 至第 10 回合累加顺序，不改成另一种浮点计算方式。第八步数值样例、全部 supported 车身及四个重复车身由回归测试覆盖。

详细待确认问题见 [unverified-mechanics.md](./unverified-mechanics.md)。
