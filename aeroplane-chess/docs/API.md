# 极简飞行棋服务器 API 文档

## 查询接口

服务器启动后，提供以下 HTTP GET 接口用于查询服务器状态（部署后建议通过反向代理映射为 https://your-domain/api/...）。

### 1. 查询所有房间信息

**接口地址：** `GET /api/rooms`

**功能：** 查看当前服务器上所有房间的详细信息

**返回数据示例：**
```json
{
  "success": true,
  "timestamp": "2025-01-13T10:30:00.000Z",
  "totalRooms": 2,
  "rooms": [
    {
      "roomCode": "ABCD",
      "gameState": "waiting",
      "hostId": "player_xyz1",
      "playerCount": 2,
      "maxPlayers": 4,
      "players": [
        {
          "id": "player_xyz1",
          "nickname": "玩家1",
          "emoji": "smile",
          "playerNumber": 1,
          "isHost": true,
          "isConnected": true,
          "isAI": false
        },
        {
          "id": "player_xyz2",
          "nickname": "玩家2",
          "emoji": "cool",
          "playerNumber": 2,
          "isHost": false,
          "isConnected": true,
          "isAI": false
        }
      ],
      "pieceCount": 4,
      "skillMode": false,
      "createdAt": "2025-01-13T10:25:00.000Z"
    }
  ]
}
```

**字段说明：**
- `roomCode`: 房间号（4位字母）
- `gameState`: 房间状态（"waiting" 等待中, "playing" 游戏中）
- `hostId`: 房主玩家ID
- `playerCount`: 当前玩家数量
- `players`: 玩家列表
  - `id`: 玩家ID
  - `nickname`: 昵称
  - `emoji`: 表情
  - `playerNumber`: 玩家编号（1-4），等于颜色编号
  - `isHost`: 是否为房主
  - `isConnected`: 是否在线
  - `isAI`: 是否AI
- `pieceCount`: 棋子数量（1-4）
- `skillMode`: 是否启用道具模式
- `createdAt`: 房间创建时间戳

---

### 2. 查询所有游戏会话信息

**接口地址：** `GET /api/sessions`

**功能：** 查看当前服务器上所有正在进行的游戏会话

**返回数据示例：**
```json
{
  "success": true,
  "timestamp": "2025-01-13T10:30:00.000Z",
  "totalSessions": 1,
  "sessions": [
    {
      "sessionId": "game_abcd",
      "roomCode": "ABCD",
      "hostId": "player_xyz1",
      "playerCount": 3,
      "players": [
        {
          "id": "player_xyz1",
          "nickname": "玩家1",
          "emoji": "smile",
          "playerNumber": 1,
          "isConnected": true,
          "isAI": false,
          "isHost": true
        },
        {
          "id": "player_xyz2",
          "nickname": "玩家2",
          "emoji": "cool",
          "playerNumber": 2,
          "isConnected": true,
          "isAI": false,
          "isHost": false
        },
        {
          "id": "ai_3",
          "nickname": "Bot-1",
          "emoji": "robot",
          "playerNumber": 3,
          "isConnected": true,
          "isAI": true,
          "isHost": false
        }
      ],
      "pieceCount": 4,
      "skillMode": false,
      "gameState": {
        "currentPlayer": 2,
        "gamePhase": "rolling",
        "diceValue": 0,
        "winner": null
      },
      "createdAt": 1736758020000
    }
  ]
}
```

**字段说明：**
- `sessionId`: 游戏会话ID（如 `game_x1y2`）
- `roomCode`: 关联的房间号
- `hostId`: 房主玩家ID
- `playerCount`: 玩家数量
- `players`: 玩家数组，含 `isHost` 标识
- `pieceCount`: 棋子数量（1-4）
- `skillMode`: 是否启用道具模式
- `gameState`: 当前游戏状态
  - `currentPlayer`: 当前回合玩家编号（1-4）
  - `gamePhase`: 游戏阶段（"rolling"、"moving"、"selecting" 等）
  - `diceValue`: 骰子点数
  - `winner`: 获胜玩家编号，未结束为 null
- `createdAt`: 会话创建时间戳（毫秒）

---

### 3. 查询实时在线用户

**接口地址：** `GET /api/online-users`

**功能：** 获取当前所有活跃 WebSocket 连接的玩家及其状态

**返回数据示例：**
```json
{
  "success": true,
  "timestamp": "2025-01-13T10:30:00.000Z",
  "totalOnline": 3,
  "users": [
    {
      "playerId": "player_xyz1",
      "nickname": "玩家_abcd",
      "status": "playing",
      "roomCode": "ABCD",
      "gameSessionId": "game_1234"
    },
    {
      "playerId": "player_xyz2",
      "nickname": "玩家_efgh",
      "status": "in_room",
      "roomCode": "WXYZ",
      "gameSessionId": null
    },
    {
      "playerId": "player_xyz3",
      "nickname": "玩家_ijkl",
      "status": "idle",
      "roomCode": null,
      "gameSessionId": null
    }
  ]
}
```

**字段说明：**
- `totalOnline`: 当前活跃的 WebSocket 连接总数
- `users`: 用户列表
  - `playerId`: 玩家唯一标识
  - `nickname`: 玩家当前昵称
  - `status`: 玩家状态（"idle" 空闲/首页, "in_room" 房间中, "playing" 游戏中, "spectating" 观战中）
  - `roomCode`: 当前关联的房间号（如果有）
  - `gameSessionId`: 当前关联的游戏会话ID（如果有）

---

### 4. 查询服务器统计信息

**接口地址：** `GET /api/stats`

**功能：** 查看服务器整体运行统计数据

**返回数据示例：**
```json
{
  "success": true,
  "timestamp": "2025-01-13T10:30:00.000Z",
  "stats": {
    "rooms": {
      "total": 4,
      "waiting": 2,
      "playing": 1,
      "finished": 1
    },
    "sessions": {
      "total": 1
    },
    "players": {
      "totalConnections": 8,
      "inRooms": 6,
      "inSessions": 3
    },
    "timers": {
      "roomDestroyTimers": 0,
      "disconnectTimers": 1
    }
  }
}
```

**字段说明：**
- `rooms`: 房间统计
  - `total`: 总房间数
  - `waiting`: 等待中的房间数
  - `playing`: 游戏中的房间数
  - `finished`: 已结束但尚未清理的房间数
- `sessions`: 游戏会话统计总数
- `players`: 玩家连接相关统计
  - `totalConnections`: 活跃的 WebSocket 连接数
  - `inRooms`: 当前在房间内且在线的人类玩家数量
  - `inSessions`: 当前在游戏会话内且在线的人类玩家数量
- `timers`: 定时器统计
  - `roomDestroyTimers`: 房间延迟销毁定时器数量
  - `disconnectTimers`: 断线延迟处理定时器数量

---

### 5. 手动清理孤立资源

**接口地址：** `POST /api/cleanup`

**功能：** 手动清理孤立的游戏会话和已结束的空房间

**清理规则：**
- 清理孤立的游戏会话（对应房间不存在或已结束）
- 清理状态为 `finished` 的房间
- 清理相关的玩家映射关系
- 清理关联的房间销毁定时器

**返回数据示例：**
```json
{
  "success": true,
  "timestamp": "2025-01-13T10:30:00.000Z",
  "cleaned": {
    "sessions": 8,
    "rooms": 1,
    "connections": 2
  },
  "message": "清理完成: 8个孤立会话, 1个已结束房间, 2个死连接"
}
```

---

### 6. 访问地址

部署成功后，访问地址：
- **游戏主页**：`https://chess.example.com/`
- **管理面板**：`https://chess.example.com/admin.html`
- **API 接口**：
  - 房间列表：`https://chess.example.com/api/rooms`
  - 游戏会话：`https://chess.example.com/api/sessions`
  - 在线用户：`https://chess.example.com/api/online-users`
  - 服务器统计：`https://chess.example.com/api/stats`
  - 手动清理：`https://chess.example.com/api/cleanup` (POST)
