# 飞行棋联机小游戏设计

## 背景

当前项目是 CommonJS + Express 5 + 单页 `index.html` 的静态前端混合应用。登录态使用 `auth_token` HttpOnly Cookie 和服务端内存 session。现有聊天功能已经采用轮询模式，因此飞行棋联机对战也优先使用轮询同步，避免引入 WebSocket 运维复杂度。

## 目标

新增一个登录后可用的飞行棋小游戏，支持开房间、房间密码、2-4 名玩家对战、观战席、开局后中途观战、轮询同步、对局结束后写入历史战绩。

## 非目标

- 不引入 WebSocket。
- 不保存进行中的房间状态到数据库。
- 不实现 AI 玩家。
- 不实现排行榜和积分奖励，历史战绩只做基础记录。

## 用户体验

首页主标签新增“飞行棋”。未登录用户进入时显示登录提示；登录后可以进入房间大厅。

房间大厅展示所有等待中和进行中的房间：

- 房间号、房间名、房主昵称
- 状态：等待中、进行中、已结束
- 玩家席：例如 `3/4`
- 观战人数
- 起飞规则：`仅 6 起飞` 或 `2/4/6 起飞`
- 是否需要密码

用户可以创建房间，填写房间名、可选密码，并选择起飞规则：

- `six`: 仅 6 起飞，默认
- `even`: 2/4/6 起飞

用户加入房间时可选择“玩家席”或“观战席”：

- 玩家席最多 4 人。等待中可以加入玩家席；开局后不能再加入玩家席。
- 观战席不占玩家位。等待中和进行中都可以加入观战席。
- 等待中时，观战者可以切换到玩家席；开局后锁定为观战。

房间页包含玩家列表、观战人数、准备状态、当前规则、操作日志、棋盘、骰子和当前回合提示。只有当前玩家能掷骰和走棋；观战者只能查看。

开局条件：

- 房间必须有 2-4 名玩家。
- 所有玩家席用户都必须准备。
- 只有房主可以开始游戏。

离开规则：

- 等待中玩家可直接离开；房主离开时转移给最早加入的玩家。
- 等待中观战者可直接离开。
- 进行中观战者可直接离开。
- 进行中玩家主动离开视为认输，保留历史记录名次，剩余棋子从棋盘移除。

## 游戏规则

使用大众飞行棋模板，并做项目内可实现的简化：

- 每名玩家一个颜色，4 枚棋子。
- 房主可设置起飞规则：仅 6 起飞，或 2/4/6 起飞。
- 起飞规则只决定基地棋子能否进入起点。
- 掷到 6 可再掷一次，和起飞规则分开处理。
- 棋子按固定路线前进。
- 棋子走到有敌方棋子的格子时，敌方棋子回基地。
- 自己的多枚棋子允许停在同一格。
- 棋子进入终点后记为完成。
- 一个玩家 4 枚棋子全部完成后获得名次。
- 所有仍在场玩家都有名次，或只剩一名未完成玩家时结束对局。

## 架构

采用“内存实时房间 + 数据库历史战绩”。

新增 `ludo-game.js`，封装纯游戏逻辑和内存房间管理：

- 创建房间
- 加入玩家席或观战席
- 离开房间
- 准备和取消准备
- 开始游戏
- 掷骰
- 走棋
- 计算可移动棋子
- 撞子、完成、换回合
- 结束对局并生成历史记录快照

`server.js` 负责鉴权、路由挂载、历史战绩写库和响应 DTO。这个边界可以让核心规则用 `node:test` 直接测试，不依赖数据库或 Express。

## 内存模型

房间对象包含：

- `id`: 6 位房间号
- `name`: 房间名
- `passwordHash`: 可选密码哈希
- `hostUserId`
- `status`: `waiting`、`playing`、`finished`
- `takeoffMode`: `six` 或 `even`
- `players`: 最多 4 个玩家席
- `spectators`: 观战用户集合
- `game`: 开局后的棋局状态
- `createdAt`、`updatedAt`、`startedAt`、`finishedAt`
- `peakSpectatorCount`
- `log`: 最近操作日志，限制长度防止内存无限增长

玩家对象包含：

- `userId`
- `username`
- `seat`
- `color`
- `ready`
- `joinedAt`
- `rank`

棋局对象包含：

- `turnSeat`
- `dice`
- `awaitingMove`
- `consecutiveSixes`
- `round`
- `pieces`: 每个座位 4 枚棋子的状态
- `rankings`

棋子状态：

- `base`: 在基地
- `track`: 在公共路线，包含步数或路线索引
- `home`: 进入终点通道
- `finished`: 已完成

## API

所有写操作都需要登录。房间状态读取需要登录；观战也要求登录。
`GET /api/ludo/rooms/:id` 只向房间玩家或已加入观战席的用户返回完整棋局。其他登录用户需要先通过 `joinAs: "spectator"` 加入观战席，才能进入对局页并计入观战人数。

- `GET /api/ludo/rooms`: 房间列表，包含等待中和进行中房间。
- `POST /api/ludo/rooms`: 创建房间。参数：`name`、`password`、`takeoffMode`、`joinAs`。
- `POST /api/ludo/rooms/:id/join`: 加入房间。参数：`password`、`joinAs`。
- `POST /api/ludo/rooms/:id/seat`: 等待中切换玩家席/观战席。参数：`joinAs`。
- `POST /api/ludo/rooms/:id/ready`: 设置准备状态。参数：`ready`。
- `POST /api/ludo/rooms/:id/start`: 房主开始游戏。
- `GET /api/ludo/rooms/:id`: 获取房间完整状态。
- `POST /api/ludo/rooms/:id/roll`: 当前玩家掷骰。
- `POST /api/ludo/rooms/:id/move`: 当前玩家移动棋子。参数：`pieceIndex`。
- `POST /api/ludo/rooms/:id/leave`: 离开房间或观战席。
- `POST /api/ludo/rooms/:id/surrender`: 进行中玩家认输离开。
- `GET /api/ludo/history`: 当前用户历史战绩。

错误码遵循现有 API 风格，使用 JSON `{ error: '...' }`：

- `UNAUTHORIZED`
- `ROOM_NOT_FOUND`
- `BAD_PASSWORD`
- `ROOM_FULL`
- `GAME_ALREADY_STARTED`
- `NOT_PLAYER`
- `NOT_HOST`
- `NOT_READY`
- `NOT_YOUR_TURN`
- `ROLL_REQUIRED`
- `MOVE_REQUIRED`
- `INVALID_MOVE`
- `SPECTATOR_ONLY`
- `PLAYER_ALREADY_LEFT`

## 历史战绩

新增数据库表，只记录结束后的对局。

`ludo_match_history`：

- `id`
- `room_id`
- `room_name`
- `host_user_id`
- `takeoff_mode`
- `winner_user_id`
- `player_count`
- `peak_spectator_count`
- `round_count`
- `started_at`
- `finished_at`
- `duration_seconds`
- `created_at`

`ludo_match_players`：

- `id`
- `match_id`
- `user_id`
- `username`
- `seat`
- `color`
- `rank`
- `finished`
- `created_at`

PostgreSQL 和 MySQL 都需要建表兼容。历史接口按当前登录用户查询其参与过的对局，并返回玩家名次列表。

## 前端

`index.html` 中新增：

- 主标签按钮：`飞行棋`
- 飞行棋大厅区块
- 创建房间弹窗或面板
- 加入房间密码输入
- 房间/观战席状态区
- CSS 棋盘
- 骰子和操作按钮
- 历史战绩列表

轮询策略：

- 在房间页每 1500ms 拉取 `GET /api/ludo/rooms/:id`。
- 在大厅每 3000ms 拉取 `GET /api/ludo/rooms`。
- 切换到其他标签、离开房间、退出登录时停止对应轮询。
- 操作成功后立即刷新当前房间。

## 清理策略

为了避免内存增长：

- 等待中空房间超过 30 分钟清理。
- 已结束房间保留 10 分钟供玩家查看结果，然后从内存移除。
- 进行中但长时间无人操作的房间超过 2 小时自动结束或清理，历史可标记为异常结束；首版可以只清理不写历史。

## 测试计划

新增 `tests/ludo-game.test.js`：

- 创建房间默认使用仅 6 起飞。
- 创建房间可设置 2/4/6 起飞。
- 密码房间需要正确密码。
- 玩家席最多 4 人，观战席不占玩家位。
- 开局后玩家席锁定，但仍可加入观战席。
- 未准备不能开始，房主才能开始。
- 游戏中玩家离开会按认输处理，观战者离开不影响棋局。
- 仅 6 起飞规则下，基地棋子掷 2 不能起飞。
- 2/4/6 起飞规则下，基地棋子掷 2 可以起飞。
- 掷到 6 可以再掷。
- 撞到敌方棋子会让敌方回基地。
- 棋子完成后记录名次。
- 结束对局会生成历史快照。

新增结构测试：

- `server.js` 挂载 `/api/ludo` 路由。
- `index.html` 包含飞行棋入口和核心 DOM 节点。

## 风险

- 内存房间在服务重启后会丢失，这是本方案的已接受取舍。
- 轮询不是毫秒级实时，多个玩家可能看到 1-2 秒延迟。
- `index.html` 文件较大，新增前端逻辑需要保持局部化，避免影响论坛、聊天、商城现有逻辑。
- 飞行棋完整路径和终点逻辑需要测试覆盖，否则最容易出现走格 off-by-one 问题。
