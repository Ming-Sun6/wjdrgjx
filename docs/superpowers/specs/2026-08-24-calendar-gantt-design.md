# 活动日历甘特图改造设计

## 目标

将已隐藏的活动日历改造成淡暖色、圆角风格的甘特日程表，并在后台提供单日、连续和定期日程管理能力。前台只保留周视图与月视图。

## 前台布局

### 周视图

- 时间轴固定为星期一至星期日，共七列。
- 日期时间轴最左侧增加固定的“活动分类”列，横向滚动时保持可见。
- 同一分类占用多行时分类单元格纵向合并并居中显示；分类列不承担普通日程名称展示。
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

## 活动分类

- 分类由后台配置。系统先于旧日程迁移幂等预置五个具有不可变内部编码的分类：`regular=常规`、`kingdom=王国活动`、`leaderboard=小榜`、`cross-server=跨服活动`、`limited=限定活动`。重复启动按编码补齐缺失项，不重复插入。
- 后台支持新增分类、改名、设置淡暖色、拖动排序、停用和重新启用。
- 每个日程必须选择分类。旧数据迁移和旧 POST/PATCH 未提供 `categoryId` 时，按不可变编码 `regular` 定位默认分类，即使显示名称已被管理员修改。
- 分类停用只禁止新建日程选择和把其他日程改入该分类，不隐藏已有启用日程；管理员仍可编辑其非分类字段，也可保留原停用分类。
- 日程颜色为空时动态继承分类当前颜色；子任务颜色为空时依次继承主日程颜色、分类颜色。修改分类颜色会立即影响所有未单独覆盖颜色的现有日程。
- 新建 `calendar_categories` 表：`id`、`code`、`name`、`color`、`sort_order`、`enabled`、`created_at`、`updated_at`；`code` 和 `name` 均跨启用/停用全部记录唯一，停用后不得创建同名分类。
- 五个预置分类使用固定编码；后台新增自定义分类时不要求管理员填写编码，服务端生成 `custom-<26位小写ULID>`，依赖数据库唯一索引兜底，冲突时重新生成，连续5次冲突返回 `500 CATEGORY_CODE_GENERATION_FAILED`。分类改名、改色、排序、停用和重新启用均不得改变 `code`。
- 旧日程迁移时统一归入编码为 `regular` 的分类。

## 日程类型

后台管理新增“日程管理”，支持：

1. 单日日程：一个日期。
2. 连续日程：开始日期至结束日期，包含首尾日期。
3. 定期日程：
   - 每隔 N 天；
   - 每隔 N 周，并选择星期几；
   - 每隔 N 月，并选择每月几号。
4. 组合日程：一个主活动包含多条子任务。主活动设置分类、名称、说明/奖励、起止日期和循环规则；子任务设置名称、说明、颜色、排序、时间以及适用日期规则。

定期日程结束条件：

- 永不结束；
- 指定结束日期；
- 指定循环次数。

公共字段包括活动分类、名称、开始时间、结束时间、颜色、说明、启用状态。后台支持新增、编辑、复制、停用和删除。

组合日程显示规则：

- 主活动标题区域纵向合并，占据全部子任务行高度，并显示主活动名称及说明/奖励。
- 子任务在日期区域内分行显示，不同子任务可使用不同颜色。
- 子任务适用日期支持主活动全部日期、指定日期列表或独立循环规则。
- 组合日程跨周时按周裁切；片段标记“接上周”或“续下周”，点击任一片段均打开同一主活动详情。
- 普通日程继续使用紧凑甘特条，不增加左侧日程名称列。

## 数据模型与兼容

- 新建 `calendar_schedule_definitions` 作为唯一规范数据源，MySQL 与 PostgreSQL 均创建相同语义的字段：`id`、`legacy_original_id`、`category_id`、`name`、`schedule_type`、`start_date`、`end_date`、`legacy_dates_json`、`start_time`、`end_time`、`color`、`description`、`enabled`、`recurrence_unit`、`recurrence_interval`、`weekdays_json`、`month_day`、`recurrence_end_type`、`recurrence_until`、`recurrence_count`、`created_by`、`created_at`、`updated_at`。
- `schedule_type` 支持 `single`、`continuous`、`recurring`、`composite` 和仅供旧数据兼容的 `date-list`。后台新建时提供前四种。
- 新建 `calendar_schedule_items` 保存组合日程子任务：`id`、`schedule_id`、`name`、`description`、`color`、`sort_order`、`enabled`、`date_mode`、`start_offset_days`、`end_offset_days`、`selected_offsets_json`、`duration_days`、`start_time`、`end_time`、`recurrence_unit`、`recurrence_interval`、`weekdays_json`、`month_day`、`recurrence_end_type`、`recurrence_until_offset`、`recurrence_count`、`created_at`、`updated_at`。子任务随主活动事务性新增、更新、复制和删除。
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
- `composite`：主定义要求 `category_id`、`start_date/end_date` 和至少一个启用子任务；主活动可使用与 `recurring` 相同的循环字段。子任务日期不得超出单次主活动持续范围，独立循环也只在主活动发生窗口内展开。

组合子任务 `date_mode` 规则：

- `all-span`：子任务覆盖每次主活动发生的完整日期范围；`start_offset_days`、`end_offset_days`、`selected_offsets_json`、`duration_days` 和全部子循环字段必须为空。
- `relative-range`：必须填写从0开始的 `start_offset_days/end_offset_days`，要求 `0 <= start <= end < 主活动持续天数`，形成一个连续片段；`selected_offsets_json`、`duration_days` 和全部子循环字段必须为空。
- `selected-days`：必须填写非空的 `selected_offsets_json`，保存去重升序的从0开始日偏移，每个偏移都必须满足 `0 <= offset < 主活动持续天数`；连续偏移合并成片段，不连续偏移拆分成多个片段；范围偏移、`duration_days` 和全部子循环字段必须为空。
- `recurring`：范围偏移和 `selected_offsets_json` 必须为空；必须填写 `duration_days>=1`、循环单位、正整数间隔和结束方式，周/月字段约束与主日程相同。`never` 要求 `recurrence_until_offset` 与 `recurrence_count` 均为空；`until` 要求 `recurrence_until_offset` 为包含边界的开始日偏移且满足 `0 <= offset < 主活动持续天数`，`recurrence_count` 为空；`count` 要求正整数 `recurrence_count`，`recurrence_until_offset` 为空。无论主组合本身是否循环，这套子规则都针对每一次主活动发生窗口从偏移0重新计算；仅产生开始日落在窗口和可选 `until` 边界内，且完整结束日不超过主活动结束日的子任务，超界发生跳过而不裁切。
- 子任务日期全部相对每一次主活动发生计算，不保存绝对日期。主活动循环后，每次发生均复用同一套偏移/循环模板。
- 主活动发生允许因持续时长大于循环间隔而互相重叠，每次仍使用独立发生 ID 并独立排布。
- 子任务次数表示每个主活动发生窗口内的发生次数；主活动结束边界始终优先，达到任一条件即停止。
- 单次公开请求的2000实例限制按“主活动发生 + 普通日程发生 + 组合子任务发生”总数计算。

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

1. 每个周区块先按分类 `sortOrder`、分类名称排序；不同分类独立排布，不跨分类共用行。
2. 普通日程转换为周内 `[开始日, 结束日]` 片段，并按开始日期、结束日期和稳定 ID 排序。
3. 普通日程逐个放入该分类第一条不发生日期重叠的行；日期相邻但不重叠可共用一行。
4. 组合日程在分类内预留独立行组，不与普通日程或其他组合日程共享子任务行。组合行组按主发生开始日、结束日、稳定发生 ID 排序；子任务按 `sortOrder`、子任务 ID 排序。单个循环子任务若在同一周产生日期重叠的多个实例，则在该子任务内部按开始日、结束日、稳定发生 ID 使用“第一条无重叠泳道”算法继续分行；不重叠实例仍共用一条泳道。
5. 组合日程的主标题不新增第二个固定列，而是在最左侧“活动分类”单元格内与分类标签共同显示，并纵向跨越该组合全部子任务行。
6. 同分类相邻普通行可纵向合并分类单元格；组合行组会打断合并，并显示“分类名称 + 主活动名称 + 说明/奖励”。
7. 月视图每个自然周区块都独立执行分类排序、片段裁切和行排布；跨周组合在每周重复分类/标题结构并显示接续标识。

## 接口与权限

- `GET /api/calendar/schedules?from=YYYY-MM-DD&to=YYYY-MM-DD` 使用包含首尾的日期范围，只返回已启用日程的完整发生实例；响应为 `{ from, to, schedules: Occurrence[] }`。
- `Occurrence` 至少包含 `id`、`scheduleId`、`originalId`、`name`、`startDate`、`endDate`、`startTime`、`endTime`、`color`、`description` 和 `scheduleType`。发生 ID 固定为 `<scheduleId>:<occurrenceStartDate>`，服务端不进行按周裁切。
- 公开发生实例同时返回 `category: { id, code, name, color, sortOrder }`；组合日程只展开已启用子任务并返回请求范围内的 `items`。子任务发生字段为 `id`、`itemId`、`parentOccurrenceId`、`name`、`startDate`、`endDate`、`startTime`、`endTime`、`color`、`description`、`sortOrder`；稳定 ID 为 `<parentOccurrenceId>:item:<itemId>:<childStartDate>`。
- 前端将完整发生实例裁切为周内 `Fragment`；片段包含 `fragmentId=<occurrenceId>:<weekStartDate>`、原始发生 ID、裁切后的 `startDate/endDate`。周/月甘特排布只使用片段。
- 旧调用未提供 `from/to` 时保留旧响应形状：使用“今天前31天至今天后334天”（包含首尾共366天）的兼容窗口，将每个发生实例展开成逐日记录，字段继续包含 `date` 与 `originalId`，并返回 `rangeDefaulted: true`。所有现有旧页面无需立即迁移。
- `GET /api/admin/calendar/schedules` 返回完整规则定义并包含停用日程；组合定义嵌套返回全部子任务（包括停用项）及其完整日期、循环和显示字段，供重新启用和可靠编辑。
- 分类管理接口：`GET /api/admin/calendar/categories`；`POST /api/admin/calendar/categories` 接受 `{ name, color }`；`PATCH /api/admin/calendar/categories/:id` 接受 `{ name?, color? }`；`POST /api/admin/calendar/categories/reorder` 接受 `{ ids: number[] }`；`POST /api/admin/calendar/categories/:id/status` 接受 `{ enabled: boolean }`。响应返回规范分类对象；重复名称返回 `409 CATEGORY_NAME_EXISTS`，无效颜色返回 `400 BAD_COLOR`。
- 管理接口：`POST /api/admin/calendar/schedules` 新增；`PATCH /api/admin/calendar/schedules/:id` 编辑；`POST /api/admin/calendar/schedules/:id/copy` 复制为新 ID 并在名称后加“副本”；`POST /api/admin/calendar/schedules/:id/status` 设置启用状态；`DELETE /api/admin/calendar/schedules/:id` 删除。
- 组合日程新增/更新请求在普通字段和主循环字段外包含完整 `items` 数组，每项使用上述完整子任务字段。POST 中每项省略 `id`，服务端创建新子任务；PATCH 采用全量替换语义：带有属于当前主活动的既有 `id` 的项目就地更新，不带 `id` 的项目新增，数据库中原有但未出现在数组内的项目删除；需要保留但暂不展示的项目必须显式提交并设置 `enabled=false`。未知 `id` 或属于其他主活动的 `id` 返回 `400 BAD_ITEM_ID`，整个主定义与子任务变更在同一事务内回滚。提交后仍要求至少一个启用子任务；非法偏移返回 `400 BAD_ITEM_OFFSET`，无启用子任务返回 `400 ITEMS_REQUIRED`，无效循环返回 `400 BAD_RECURRENCE`，停用分类被新选择时返回 `409 CATEGORY_DISABLED`。
- 复制组合日程时在同一事务中复制全部子任务和分类关系，生成新日程/子任务 ID，名称追加“副本”，复制结果默认停用，防止与原日程同时展示。
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
- 左侧分类列固定、同分类多行合并、分类排序/停用和默认颜色继承。
- 单日、连续、每日/每周/每月循环规则。
- 组合日程主标题纵向合并、子任务排序/颜色/日期规则及跨周标识。
- 三种结束条件与永不结束范围限制。
- 旧日程兼容、管理员权限、接口验证和审计。
- 桌面与手机布局、圆角和淡暖色主题。
