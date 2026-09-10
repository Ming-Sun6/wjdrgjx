# 持续效果

持续效果统一由 ActiveEffect 和生命周期引擎维护，技能数据声明 durationRounds、activationTiming 及 refresh/replace/stack。技能本身不维护倒计时。

当前真实规则：格雷格每回合20%触发 baseDamageIncrease+40%，当回合开始持续3回合，重复触发刷新 duration、不叠加；普通 vulnerable 默认 nextRound；米娅三次独立50%触发的易伤只影响下一回合且同回合不叠加；格温常规易伤从round2开始。

对 `nextRound + refresh`，若旧效果正在当前回合生效，新触发会保留当前回合效果并预约下一回合的完整 duration；不能在回合末把新预约一并删除。单个米娅因此在 round2～10 每回合都以 `1-(1-0.5)^3=0.875` 的概率存在 +50% 易伤；`m` 个米娅实例合并为 `1-(1-0.5)^(3m)` 的存在概率，幅度始终只有 +50%。鲁弗斯则在 round2～10 保持确定性的 +25% 易伤。

超过round10的持续状态自然截断。仍 pending 的持续规则只见 pending-skill-audit.md。
