# 默认时间轴宽度增加 20% 设计

## 目标

将电脑端默认连续时间轴的每日列宽在当前 `112px` 基础上增加 20%，调整为 `134.4px`。

## 范围

- 修改 `public/function/calendar-gantt.css` 中桌面基础规则 `.calendar-continuous-timeline` 的 `--timeline-day-width`。
- 保留手机触摸设备媒体查询中的容器宽度计算公式，继续保证一屏显示完整 7 天。
- 更新 `public/function/calendar.html` 的 CSS 缓存版本。
- 更新 UI 回归测试，明确验证桌面列宽为 `134.4px`，手机端仍使用七等分公式。

## 验收

- 电脑端时间轴每个日期列比当前宽 20%。
- 默认 56 天时间轴和横向滑动行为不变。
- 手机端七日一屏行为不变。
- 日历相关测试全部通过。
