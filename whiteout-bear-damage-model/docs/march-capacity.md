# 出征容量

容量流水线顺序已确认：

1. fixedAdjustedCapacity = baseMarchCapacity + expertFixedCapacity + petFixedCapacity + otherFixedCapacity
2. rawFinalMarchCapacity = fixedAdjustedCapacity × (1 + townMarchCapacityRate)
3. finalMarchCapacity = floor(rawFinalMarchCapacity)

UI 适配层中：

`baseMarchCapacity = shieldInputCount + lancerInputCount + marksmanInputCount`

这里三个数始终是玩家当前填写的原始阵容兵数，不是扩容后的 `finalAdjustedTroopCounts`。默认预设为 `1,824 + 1,823 + 178,723 = 182,370`；巨熊克星 L10 增加30,000、宠物出征 L10 增加15,000且城镇出征为0%时，最终容量为227,370。

宠物容量等级 0–10，每级固定 +1500，L10 为 +15000。城镇出征 none/small/large 为 0/10%/20%。

容量变化后保留当前盾/矛/射比例，再用 largest remainder method 分配整数兵数。结果稳定、无随机数，并严格满足三兵种之和等于 finalMarchCapacity。该 floor 只用于已确认的容量最终值，不代表游戏伤害过程的取整规则。

普通 UI 不提供“基础出征容量”或“其他固定容量”输入；前者由原始三兵种输入实时求和，后者固定传入 `otherFixedCapacity=0`，底层字段仅作为未来兼容扩展保留。优化结果写回表单时按原始总兵数应用比例，不能将最终扩容兵数写回并再次扩容。
