# Extra Attack（历史/未来扩展）

底层仍保留 `AttackEvent`、extraAttack、递归限制和触发链实现，相关单元测试继续验证框架本身。

当前正式熊伤害入口、UI、优化器与 benchmark 不执行 extraAttack 事件逻辑。输出型技能统一按已确认规则落入 `baseDamageIncrease`、`normalAttackDamageIncrease`、`skillDamageIncrease`、`troopVsTroopDamage`、`vulnerable` 或 `extraDamage`。连射保留原始 extraAttack 数据，但正式映射为10%期望 extraDamage。车头韦恩已确认为 round4/8 的100% extraDamage；车身韦恩仍按其独立车身技能数据执行。
