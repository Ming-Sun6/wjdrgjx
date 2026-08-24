# 活动日历甘特图改造设计

## 目标

将已隐藏的活动日历改造成淡暖色、圆角风格的甘特日程表，并在后台提供单日、连续和定期日程管理能力。前台只保留周视图与月视图。

## 前台布局

### 周视图

- 时间轴固定为星期一至星期日，共七列。
- 第一行显示星期与具体日期。
- 日期行下方直接显示甘特任务条，不设置左侧任务名称列。
- 任务名称显示在任务条内部。
- 单日日程占一天，连续日程横跨起止日期。
- 同一周内互不重叠的日程自动放入同一行；日期重叠的日程自动换行。
- 相邻但不重叠的日程可以共用一行，使用颜色、圆角与小间距区分。
- 支持上一周、今天、下一周。

### 月视图

- 月视图不是整月横向铺开，而是按自然周纵向排列。
- 每一周均包含独立的七列日期行和该周的甘特任务条。
- 显示覆盖当前月份的全部自然周。
- 跨周日程在每周区块中显示其落在当周的片段。
- 不属于当前月份的月初/月末日期使用弱化样式。
- 支持上一月、本月、下一月。

## 视觉规范

- 延续现有日历页面的整体视觉语言。
- 使用米白、浅杏、淡橙、雾粉、浅棕等低饱和暖色。
- 日期格、周区块、任务条、按钮和详情弹窗均使用圆角。
- 今天使用柔和但明确的高亮；周末使用轻微暖色底纹。
- 任务条文字应保持足够对比度，过短任务条可使用省略号，点击后查看完整信息。
- 桌面端优先完整展示七列；手机端允许横向滚动，但保持日期与任务条严格对齐。

## 日程类型

后台管理新增“日程管理”，支持：

1. 单日日程：一个日期。
2. 连续日程：开始日期至结束日期，包含首尾日期。
3. 定期日程：
   - 每隔 N 天；
   - 每隔 N 周，并选择星期几；
   - 每隔 N 月，并选择每月几号。

定期日程结束条件：

- 永不结束；
- 指定结束日期；
- 指定循环次数。

公共字段包括名称、开始时间、结束时间、颜色、说明、启用状态。后台支持新增、编辑、复制、停用和删除。

## 数据模型与兼容

- 新建 `calendar_schedule_definitions` 作为唯一规范数据源，MySQL 与 PostgreSQL 均创建相同语义的字段：`id`、`legacy_original_id`、`name`、`schedule_type`、`start_date`、`end_date`、`legacy_dates_json`、`start_time`、`end_time`、`color`、`description`、`enabled`、`recurrence_unit`、`recurrence_interval`、`weekdays_json`、`month_day`、`recurrence_end_type`、`recurrence_until`、`recurrence_count`、`created_by`、`created_at`、`updated_at`。
- `schedule_type` 支持 `single`、`continuous`、`recurring` 和仅供旧数据兼容的 `date-list`。后台新建时只提供前三种。
- 启动迁移按现有 `calendar_schedules.original_id` 分组，事务内幂等写入新表：单个日期转为 `single`；连续日期转为 `continuous`；不连续日期转为 `date-list` 并保存在 `legacy_dates_json`。迁移记录默认 `enabled=true`；`date-list.start_date/end_date` 分别保存日期列表最小值和最大值。保留旧表，不再作为新写入目标。
- `legacy_original_id` 建唯一索引，迁移重复执行不得重复生成定义；日期范围、启用状态和更新时间建立查询索引。
- 新增日程规则字段用于记录类型、起止日期、循环单位、循环间隔、星期选择、每月日期、结束方式、结束日期和循环次数。
- 定期日程只保存规则，不提前向数据库无限写入实例。
- 前台按当前周或月份的可见日期范围请求日程，由服务端在限定范围内展开循环实例。
- 永不结束规则也只展开请求范围内的数据，防止无限计算。
- 连续日程合并为一段；`date-list` 中连续日期合并，不连续日期拆成多段。定期日程的每次发生均保持独立，即使两次发生日期相邻也不合并。

各类型字段约束：

- `single`：要求 `start_date`，`end_date=start_date`；所有循环字段和 `legacy_dates_json` 必须为空。
- `continuous`：要求 `start_date/end_date` 且 `end_date>=start_date`；所有循环字段和 `legacy_dates_json` 必须为空。
- `date-list`：要求非空、去重、升序的 `legacy_dates_json`，`start_date/end_date` 为列表最小/最大日期；所有循环字段必须为空。
- `recurring`：要求 `start_date/end_date`、循环单位、正整数间隔和结束方式；`legacy_dates_json` 必须为空。周循环要求至少一个星期，月循环要求 `month_day=1..31`；结束日期模式要求 `recurrence_until`，次数模式要求正整数 `recurrence_count`，永不结束模式两者均为空。

## 循环规则语义

- 所有日期均按 `YYYY-MM-DD` 的 UTC 纯日期计算，不使用浏览器本地时区参与加减日。
- 每隔 N 天：以 `start_date` 为第一次发生日，每 N 天产生一次。
- 每隔 N 周：以 `start_date` 所在周的星期一为周锚点，每 N 周激活一次所选星期；只产生不早于 `start_date` 的发生日。
- 每隔 N 月：以 `start_date` 所在月份为月锚点，每 N 月在 `month_day` 发生；若某月不存在该日（例如2月30日），该月跳过，不顺延也不提前。
- 循环次数表示“发生次数”，不是周期数。每周选择多个星期时，每个发生日分别计一次。
- 指定结束日期按发生开始日判断并包含结束日；允许最后一次日程的结束日期超过循环结束日。
- 定期日程可设置发生持续天数：由模板 `start_date` 至 `end_date`（含首尾）决定，每次发生保持相同持续天数。
- 单日或持续一天的日程同时填写开始/结束时间时，结束时间必须晚于开始时间；跨多日持续日程允许末日结束时间早于首日开始时间。

## 甘特排布算法

1. 将当前视图范围内的日程转换为 `[开始日, 结束日]` 片段。
2. 按开始日期、结束日期和稳定 ID 排序。
3. 逐个放入第一条不发生日期重叠的行。
4. 日期相邻但不重叠的片段允许放在同一行。
5. 月视图对每个自然周分别裁切片段并重新排布。

## 接口与权限

- `GET /api/calendar/schedules?from=YYYY-MM-DD&to=YYYY-MM-DD` 使用包含首尾的日期范围，只返回已启用日程的完整发生实例；响应为 `{ from, to, schedules: Occurrence[] }`。
- `Occurrence` 至少包含 `id`、`scheduleId`、`originalId`、`name`、`startDate`、`endDate`、`startTime`、`endTime`、`color`、`description` 和 `scheduleType`。发生 ID 固定为 `<scheduleId>:<occurrenceStartDate>`，服务端不进行按周裁切。
- 前端将完整发生实例裁切为周内 `Fragment`；片段包含 `fragmentId=<occurrenceId>:<weekStartDate>`、原始发生 ID、裁切后的 `startDate/endDate`。周/月甘特排布只使用片段。
- 旧调用未提供 `from/to` 时保留旧响应形状：使用“今天前31天至今天后334天”（包含首尾共366天）的兼容窗口，将每个发生实例展开成逐日记录，字段继续包含 `date` 与 `originalId`，并返回 `rangeDefaulted: true`。所有现有旧页面无需立即迁移。
- `GET /api/admin/calendar/schedules` 返回完整规则定义并包含停用项目，供重新启用和编辑。
- 管理接口：`POST /api/admin/calendar/schedules` 新增；`PATCH /api/admin/calendar/schedules/:id` 编辑；`POST /api/admin/calendar/schedules/:id/copy` 复制为新 ID 并在名称后加“副本”；`POST /api/admin/calendar/schedules/:id/status` 设置启用状态；`DELETE /api/admin/calendar/schedules/:id` 删除。
- 旧的管理员写接口保持为 `POST /api/calendar/schedules`、`PATCH /api/calendar/schedules/:originalId`、`DELETE /api/calendar/schedules/:originalId`。旧 POST/PATCH 的 `dates` 数组先去重排序：一个日期映射为 `single`，连续日期映射为 `continuous`，不连续日期映射为 `date-list`；PATCH/DELETE 通过 `legacy_original_id` 或兼容 `originalId` 定位新定义，并在事务内执行。
- 新增、编辑、复制、停用和删除必须通过管理员权限校验。
- 对日期范围、循环间隔、循环次数、名称长度、颜色和时间格式进行服务端验证。
- 单次公开请求最多366天，超过返回 `400 RANGE_TOO_LARGE`；单次最多展开2000个发生实例，超过返回 `422 EXPANSION_LIMIT`，不得静默截断。
- 管理操作继续写入后台审计日志。

## 月视图边界

- 自然周固定为星期一至星期日。
- 月视图请求范围从包含当月1日的周一开始，到包含当月末日的周日结束，因此会包含相邻月份日期。
- 相邻月份日期仍参与日程查询和跨周片段裁切，但日期格使用弱化样式。

## 错误处理

- 前台接口失败时显示“日程加载失败”，保留日期框架和重试按钮。
- 无日程时显示空状态，不隐藏日期时间轴。
- 后台表单即时提示无效日期、结束日期早于开始日期、未选择星期、循环次数无效等问题。
- 旧数据缺少新字段时按单日日程兼容处理。

## 验证范围

- 周视图七列对齐、非重叠同行、重叠换行。
- 月视图按周纵向排列及跨周片段裁切。
- 单日、连续、每日/每周/每月循环规则。
- 三种结束条件与永不结束范围限制。
- 旧日程兼容、管理员权限、接口验证和审计。
- 桌面与手机布局、圆角和淡暖色主题。
