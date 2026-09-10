# Trigger Chain

Trigger Chain 以稳定 sourceSkillId、触发事件、条件和递归深度策略连接技能，不依赖技能显示名。

当前火焰冲击联动由燃晶火药同一次触发产生：FC8 为额外+25%，FC10为额外+37.5%，两者都是 extraDamage 段。基础 normalAttackDamageIncrease +4%/+6%保持独立，不能把6%、50%、37.5%合成全局93.5%。

本页记录历史/未来扩展框架。extraAttack 与 extraDamage 在底层类型中仍严格分离；当前正式熊模型不执行 Trigger Chain 或 AttackEvent，连射只在正式适配层映射为10%期望 extraDamage。

pending/unsupported 效果不会进入 Trigger Chain，只会进入跳过报告。当前 ENGINE_GAP 为0；剩余问题是具体真实规则或数据来源缺失。
