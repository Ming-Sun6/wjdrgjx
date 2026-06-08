require('dotenv').config();

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const ROOM_CHAT_MAX_MESSAGES = 50;

// 中间件
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

let bannedWordRegexes = [];

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadBannedWords() {
  try {
    const dictPath = path.resolve(__dirname, '../frontend/assets/违规词库.txt');
    const raw = fs.readFileSync(dictPath, 'utf8');
    const words = Array.from(
      new Set(
        raw
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => b.length - a.length);

    bannedWordRegexes = words.map(word => new RegExp(escapeRegex(word), 'gi'));
    console.log(`[内容过滤] 已加载违规词 ${bannedWordRegexes.length} 条`);
  } catch (error) {
    bannedWordRegexes = [];
    console.warn('[内容过滤] 违规词库加载失败，将跳过文本过滤:', error.message);
  }
}

function sanitizeText(input) {
  if (input == null) return '';
  let text = String(input);
  if (!text || bannedWordRegexes.length === 0) return text;

  for (const regex of bannedWordRegexes) {
    text = text.replace(regex, match => '*'.repeat(match.length));
  }
  return text;
}

loadBannedWords();

// -------------------------- 工具函数（抽离通用逻辑）--------------------------
/**
 * 生成默认昵称（统一处理，避免重复）
 * @param {string} playerId - 玩家ID
 * @returns {string} 默认昵称
 */
function getDefaultNickname(playerId) {
  return `玩家_${playerId.slice(-4)}`;
}

/**
 * 获取广播目标（优先游戏会话，其次房间，避免重复判断）
 * @param {string} playerId - 玩家ID
 * @returns {GameSession|Room|null} 广播目标
 */
function getBroadcastTarget(playerId) {
  // 优先查找游戏会话
  const gameSession = roomManager.getPlayerGameSession(playerId);
  if (gameSession) return gameSession;
  // 其次查找房间
  return roomManager.getPlayerRoom(playerId) || null;
}

// -------------------------- 房间管理类 --------------------------
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> Room
    this.playerRooms = new Map(); // playerId -> roomCode
    this.gameSessions = new Map(); // gameSessionId -> GameSession
    this.playerSessions = new Map(); // playerId -> gameSessionId
    this.playerSpectatingRooms = new Map(); // playerId -> roomCode
    this.playerConnections = new Map(); // playerId -> WebSocket

    this.roomDestroyTimers = new Map(); // roomCode -> Timer（延迟销毁房间）
    this.disconnectTimers = new Map(); // playerId -> Timer（延迟处理断开）
    this.disconnectDebounceTimers = new Map();
  }

  // 生成4位字母房间号
  generateRoomCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code;
    do {
      code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  // 生成4位游戏会话ID（字母+数字）
  generateGameSessionId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let sessionId;
    do {
      const randomStr = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      sessionId = `game_${randomStr}`;
    } while (this.gameSessions.has(sessionId));
    return sessionId;
  }

  // 创建房间
  createRoom(hostPlayer, roomName = '') {
    const roomCode = this.generateRoomCode();
    const room = new Room(roomCode, hostPlayer, roomName);
    this.rooms.set(roomCode, room);
    this.playerRooms.set(hostPlayer.id, roomCode);
    return room;
  }

  // 加入房间
  joinRoom(roomCode, player) {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('房间不存在');

    // 重连逻辑
    const existingPlayer = Array.from(room.players.values()).find(p => p.id === player.id);
    if (existingPlayer) {
      existingPlayer.ws = player.ws;
      existingPlayer.isConnected = true;
      existingPlayer.nickname = player.nickname || existingPlayer.nickname;
      existingPlayer.emoji = player.emoji || existingPlayer.emoji;
      this.playerRooms.set(player.id, roomCode);
      this.setPlayerConnection(player.id, player.ws);

      // 检查房间是否恢复（人类玩家重连）
      room.checkEmptyRoom();

      return room;
    }

    // 游戏中无法加入
    if (room.gameState === 'playing') throw new Error('游戏正在进行中，无法加入新玩家');
    // 房间满员：计算已占用席位 = 真实玩家 + AI 玩家
    const aiCount = room.settings?.aiPlayers ? room.settings.aiPlayers.length : 0;
    const totalPlayerCount = room.players.size + aiCount;
    if (totalPlayerCount >= 4) throw new Error('房间已满');
    // 取消房间销毁定时器
    if (this.roomDestroyTimers.has(roomCode)) {
      clearTimeout(this.roomDestroyTimers.get(roomCode));
      this.roomDestroyTimers.delete(roomCode);
      console.log(`房间 ${roomCode} 取消延迟销毁`);
    }

    // 如果房间状态为finished，重置为waiting
    if (room.gameState === 'finished') {
      room.gameState = 'waiting';
      room.gameSessionId = null;
      room.playerReadyStatus = new Map();
      room.postGameHostId = null;
      console.log(`房间 ${roomCode} 游戏已结束，重置为等待状态`);
    }

    // 空房间新玩家成为房主
    if (room.players.size === 0) {
      room.host = player;
      player.isHost = true;
      console.log(`玩家 ${player.id} (${player.nickname}) 成为空房间 ${roomCode} 房主`);
    }

    room.addPlayer(player);
    // 设置新玩家的准备状态（非房主默认为未准备）
    room.playerReadyStatus.set(player.id, !!player.isHost);
    this.playerRooms.set(player.id, roomCode);
    return room;
  }

  // 获取可加入的公开房间摘要列表
  listPublicRooms() {
    const summaries = [];
    for (const room of this.rooms.values()) {
      // 仅展示可加入的房间（公开房间不做权限控制）
      if (room.isPrivate) continue;

      // 使用总席位数（真实玩家 + AI 玩家）判断是否已满
      const aiCount = room.settings?.aiPlayers ? room.settings.aiPlayers.length : 0;
      const totalPlayerCount = room.players.size + aiCount;
      if (totalPlayerCount === 0) continue;
      if (totalPlayerCount >= 4 && room.gameState !== 'playing') continue;

      summaries.push({
        code: room.code,
        name: room.name,
        pieceCount: room.settings?.pieceCount ?? 4,
        skillMode: !!(room.settings?.skillMode),
        playerCount: totalPlayerCount, // 包含AI玩家的总人数
        maxPlayers: 4,
        gameState: room.gameState,
        createdAt: room.createdAt
      });
    }

    // 新房间优先
    summaries.sort((a, b) => b.createdAt - a.createdAt);
    return summaries;
  }

  // -------------------------- 统一房间延迟销毁逻辑（避免重复）--------------------------
  scheduleRoomDestroy(roomCode) {
    console.log(`房间 ${roomCode} 已空，启动5分钟延迟销毁`);
    // 清除已有定时器
    if (this.roomDestroyTimers.has(roomCode)) {
      clearTimeout(this.roomDestroyTimers.get(roomCode));
    }
    // 新建定时器
    const timer = setTimeout(() => {
      const room = this.rooms.get(roomCode);
      if (room && room.players.size === 0) {
        console.log(`房间 ${roomCode} 5分钟内无人加入，销毁`);

        // 删除游戏会话（如果存在）
        if (room.gameSessionId) {
          this.removeGameSession(room.gameSessionId);
          room.gameSessionId = null;
          console.log(`同时删除了关联的游戏会话`);
        }

        this.rooms.delete(roomCode);
      } else {
        console.log(`房间 ${roomCode} 延迟期间有玩家加入，取消销毁`);
      }
      this.roomDestroyTimers.delete(roomCode);
    }, 5 * 60 * 1000); // 5分钟

    this.roomDestroyTimers.set(roomCode, timer);
    console.log(`房间 ${roomCode} 空置计时器已启动（5分钟）`);
  }

  immediateDestroyRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    if (room.gameSessionId) {
      this.removeGameSession(room.gameSessionId);
      room.gameSessionId = null;
    }

    if (this.roomDestroyTimers.has(roomCode)) {
      clearTimeout(this.roomDestroyTimers.get(roomCode));
      this.roomDestroyTimers.delete(roomCode);
    }

    this.rooms.delete(roomCode);
  }

  // 获取房间
  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  // 获取玩家所在房间
  getPlayerRoom(playerId) {
    const roomCode = this.playerRooms.get(playerId);
    return roomCode ? this.rooms.get(roomCode) : null;
  }

  // 创建游戏会话
  createGameSession(gameSessionId, players, pieceCount = 4, roomCode = null, hostId = null, skillMode = false) {
    console.log(`创建游戏会话: ${gameSessionId}, 玩家数: ${players.length}, 棋子数: ${pieceCount}`);
    const gameSession = new GameSession(gameSessionId, players, pieceCount, roomCode, hostId, skillMode);
    this.gameSessions.set(gameSessionId, gameSession);
    // 建立玩家-会话映射
    players.forEach(player => {
      if (!player.isAI) {
        this.playerSessions.set(player.id, gameSessionId);
      }
    });
    return gameSession;
  }

  // 获取游戏会话
  getGameSession(gameSessionId) {
    console.log(`查找游戏会话: ${gameSessionId}`);
    return this.gameSessions.get(gameSessionId);
  }

  // 获取玩家所在游戏会话
  getPlayerGameSession(playerId) {
    const gameSessionId = this.playerSessions.get(playerId);
    return gameSessionId ? this.getGameSession(gameSessionId) : null;
  }

  // 删除游戏会话
  removeGameSession(gameSessionId) {
    const gameSession = this.gameSessions.get(gameSessionId);
    if (!gameSession) {
      console.log(`游戏会话 ${gameSessionId} 不存在，无需删除`);
      return;
    }

    console.log(`删除游戏会话: ${gameSessionId}`);

    // 删除所有玩家的会话映射
    gameSession.players.forEach((player, playerId) => {
      this.playerSessions.delete(playerId);
    });

    // 删除游戏会话
    this.gameSessions.delete(gameSessionId);

    console.log(`游戏会话 ${gameSessionId} 已删除`);
  }

  // 设置玩家连接
  setPlayerConnection(playerId, ws) {
    this.playerConnections.set(playerId, ws);
  }

  // 获取玩家连接
  getPlayerConnection(playerId) {
    return this.playerConnections.get(playerId);
  }
}

// -------------------------- 游戏会话类（逻辑保持，优化日志）--------------------------
class GameSession {
  constructor(gameSessionId, players, pieceCount = 4, roomCode = null, hostId = null, skillMode = false) {
    this.gameSessionId = gameSessionId;
    // AI玩家不需要连接状态，只有真实玩家才设置为isConnected: true
    this.players = new Map(players.map(p => [p.id, { ...p, isConnected: p.isAI ? false : true, ws: null }]));
    this.gameState = 'playing';
    this.createdAt = Date.now();
    this.pieceCount = pieceCount;
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.skillMode = skillMode;
    this.audioLoadedPlayers = new Set(); // 统一管理音频加载状态
    this.aiTakeoverPlayers = new Set();
    this.spectators = new Set(); // 观战者集合

    // 初始化游戏数据
    this.gameData = {
      gameSessionId: gameSessionId, // 添加gameSessionId以支持重连
      gameStartTime: Date.now(),
      currentPlayer: null,
      gamePhase: 'rolling',
      diceValue: 0,
      winner: null,
      playerChess: {},
      defeatCounts: {},
      energyStates: {}, // 道具模式：玩家积分状态
      pieceCount,
      // 连投奖励相关状态
      canReroll: false,
      consecutiveSixes: 0,
      justRolledSix: false,
      // 数据分析相关（用于重连恢复）
      diceStatistics: {}, // 骰子投掷统计
      progressHistory: [], // 完成度历史记录
      currentRound: 0, // 当前回合数
      // 思考时间相关（用于重连恢复进度条）
      thinkingStartTime: null, // 思考开始时间戳
      gameOfficiallyStarted: false // 游戏是否正式开始
    };

    // 初始化棋子状态
    players.forEach(player => {
      this.gameData.playerChess[player.color] = Array.from({ length: pieceCount }, () => ({
        position: -1,
        finished: false
      }));
      // 初始化击败计数
      this.gameData.defeatCounts[player.color] = Object.fromEntries(
        players.filter(p => p.color !== player.color).map(p => [p.color, 0])
      );
      // 初始化积分状态
      this.gameData.energyStates[player.color] = 0;
      // 初始化骰子投掷统计
      this.gameData.diceStatistics[player.color] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    });
  }

  // 广播消息
  broadcast(message) {
    let sentCount = 0;
    this.players.forEach(player => {
      if (player && !player.isAI) {
        const mappedSessionId = roomManager.playerSessions.get(player.id);
        // 只有在映射存在且明确指向其他会话时才跳过。
        if (mappedSessionId && mappedSessionId !== this.gameSessionId) {
          return;
        }
      }
      const ws = roomManager.getPlayerConnection(player.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        sentCount++;
      }
    });

    // 广播给观战者
    if (this.spectators) {
      this.spectators.forEach(spectatorId => {
        const ws = roomManager.getPlayerConnection(spectatorId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
          sentCount++;
        }
      });
    }

    // 只对playerTurnChange消息打印调试日志
    if (message.type === 'playerTurnChange') {
      console.log(`[broadcast] playerTurnChange消息已发送给${sentCount}个玩家`);
    }

    if (message.type === 'forceSettlement' || message.type === 'gameEnd') {
      console.log(`[broadcast] ${message.type}消息已发送给${sentCount}个玩家`);
    }
  }

  // 序列化
  toJSON() {
    return {
      gameSessionId: this.gameSessionId,
      players: Array.from(this.players.values()).map(p => ({
        ...p,
        isHost: p.isHost || false  // 确保包含isHost字段
      })),
      gameState: this.gameState,
      createdAt: this.createdAt,
      gameData: this.gameData
    };
  }
}

// -------------------------- 房间类（逻辑保持，优化玩家添加）--------------------------
class Room {
  constructor(code, hostPlayer, name = '') {
    this.code = code;
    this.name = name || `${hostPlayer.nickname}的房间`;
    this.isPrivate = false;
    this.host = hostPlayer;
    hostPlayer.isHost = true;
    this.players = new Map();
    this.playerReadyStatus = new Map(); // playerId -> isReady 准备状态
    this.gameState = 'waiting';
    this.gameSessionId = null;
    this.postGameHostId = null; // 游戏结束后，首次返回房间的玩家ID（用于锁定房主）
    this.settings = { pieceCount: 4, aiPlayers: [], skillMode: false };
    this.spectators = new Set(); // 观战者ID集合
    this.roomChatHistory = []; // 房间聊天历史（最多50条）
    this.createdAt = Date.now(); // 房间创建时间
    this.addPlayer(hostPlayer);
    // 房主自动准备
    this.playerReadyStatus.set(hostPlayer.id, true);
    // 房间空置相关
    this.emptyRoomTimer = null; // 房间空置计时器
    this.emptyRoomStartTime = null; // 房间空置开始时间
  }

  // 添加玩家（优化颜色分配逻辑）
  addPlayer(player) {
    // 获取已被真实玩家和AI玩家占用的颜色
    const usedColors = [
      ...Array.from(this.players.values()).map(p => p.color),
      ...this.settings.aiPlayers.map(ai => ai.color)
    ];
    const availableColors = [1, 2, 3, 4].filter(c => !usedColors.includes(c));
    if (availableColors.length === 0) throw new Error('房间已满');

    // 房主默认颜色1（如果可用）
    player.color = player.isHost && availableColors.includes(1) ? 1 : availableColors[0];
    this.players.set(player.id, player);

    // 初始化准备状态：房主自动准备，非房主默认未准备
    if (player.isHost) {
      this.playerReadyStatus.set(player.id, true);
    } else {
      this.playerReadyStatus.set(player.id, false);
    }
  }

  // 移除玩家
  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return { wasHost: false, newHost: this.host };

    const wasHost = this.host.id === playerId;
    if (wasHost) player.isHost = false;

    this.players.delete(playerId);
    // 清理准备状态
    this.playerReadyStatus.delete(playerId);

    // 转移房主权限
    let newHost = this.host;
    if (wasHost && this.players.size > 0) {
      newHost = Array.from(this.players.values())[0];
      newHost.isHost = true;
      this.host = newHost;
      // 新房主自动准备
      this.playerReadyStatus.set(newHost.id, true);
      console.log(`房主权限从 ${playerId} 转移到 ${newHost.id} (${newHost.nickname})`);
      // 广播房主转移
      this.broadcast({
        type: 'hostTransferred',
        newHostId: newHost.id,
        newHostNickname: newHost.nickname,
        room: this.toJSON()
      });

      console.log(`新房主: ${newHost.id} (${newHost.nickname})`);
    }

    // 检查房间是否已没有人类玩家
    this.checkEmptyRoom();

    return { wasHost, newHost };
  }

  // 检查房间是否没有人类玩家在线
  hasHumanPlayers() {
    // 遍历所有玩家，只检查非AI玩家是否在线
    for (const player of this.players.values()) {
      // 排除AI玩家，只检查人类玩家
      if (!player.isAI && player.isConnected) {
        return true;
      }
    }
    return false;
  }

  // 检查并处理空房间（没有人类玩家）
  checkEmptyRoom() {
    if (!this.hasHumanPlayers()) {
      // 没有人类玩家了
      console.log(`房间 ${this.code} 已没有人类玩家在线`);

      // 如果是游戏中，暂停游戏并启动销毁计时器
      if (this.gameState === 'playing') {
        console.log(`房间 ${this.code} 游戏已暂停，5分钟后若无人类玩家重连将销毁`);
        this.startEmptyRoomTimer();

        // 广播游戏暂停消息
        this.broadcast({
          type: 'gameAutoPaused',
          reason: 'no_human_players',
          message: '所有人类玩家已离线，游戏已暂停。5分钟内重连可继续游戏。',
          timestamp: Date.now()
        });
      } else {
        // 如果是等待中或已结束，直接走立即销毁逻辑
        console.log(`房间 ${this.code} (状态: ${this.gameState}) 无人类玩家，准备立即销毁`);
        roomManager.immediateDestroyRoom(this.code);
      }
    } else {
      // 还有人类玩家，取消销毁计时器
      this.cancelEmptyRoomTimer();
    }
  }

  // 启动空房间计时器
  startEmptyRoomTimer() {
    // 如果已有计时器，先清除
    if (this.emptyRoomTimer) {
      clearTimeout(this.emptyRoomTimer);
      roomManager.roomDestroyTimers.delete(this.code);
    }

    this.emptyRoomStartTime = Date.now();

    // 5分钟后销毁房间
    this.emptyRoomTimer = setTimeout(() => {
      console.log(`房间 ${this.code} 5分钟内无人类玩家重连，准备销毁`);

      // 广播房间即将销毁的消息
      this.broadcast({
        type: 'roomDestroying',
        reason: 'no_human_players_timeout',
        message: '5分钟内无人类玩家重连，房间即将销毁',
        timestamp: Date.now()
      });

      // 删除游戏会话（如果存在）
      const gameSessionId = this.gameSessionId;
      if (gameSessionId) {
        roomManager.gameSessions.delete(gameSessionId);
        // 删除所有玩家的会话映射
        this.players.forEach((player) => {
          roomManager.playerSessions.delete(player.id);
        });
        console.log(`已删除游戏会话: ${gameSessionId}`);
      }

      // 删除房间本身
      roomManager.rooms.delete(this.code);
      // 删除所有玩家的房间映射
      this.players.forEach((player) => {
        roomManager.playerRooms.delete(player.id);
      });
      console.log(`已删除房间: ${this.code}`);

      // 清理定时器记录
      roomManager.roomDestroyTimers.delete(this.code);
      this.emptyRoomTimer = null;
      this.emptyRoomStartTime = null;
    }, 5 * 60 * 1000); // 5分钟

    // 添加到roomManager的定时器映射中以便统计
    roomManager.roomDestroyTimers.set(this.code, this.emptyRoomTimer);
    console.log(`房间 ${this.code} 空置计时器已启动（5分钟）`);
  }

  // 取消空房间计时器
  cancelEmptyRoomTimer() {
    if (this.emptyRoomTimer) {
      clearTimeout(this.emptyRoomTimer);
      roomManager.roomDestroyTimers.delete(this.code);
      this.emptyRoomTimer = null;
      this.emptyRoomStartTime = null;
      console.log(`房间 ${this.code} 空置计时器已取消`);

    }
  }

  // 更新设置
  updateSettings(settings) {
    console.log('[房间配置] 更新设置:', {
      旧设置: this.settings,
      新设置: settings,
      房间号: this.code
    });
    this.settings = { ...this.settings, ...settings };
    console.log('[房间配置] 更新后的设置:', this.settings);
  }

  appendRoomChatMessage(chatItem) {
    if (!chatItem || typeof chatItem !== 'object') return;
    this.roomChatHistory.push(chatItem);
    if (this.roomChatHistory.length > ROOM_CHAT_MAX_MESSAGES) {
      this.roomChatHistory = this.roomChatHistory.slice(-ROOM_CHAT_MAX_MESSAGES);
    }
  }

  // 广播消息
  broadcast(message, excludePlayerId = null) {
    this.players.forEach(player => {
      if (player.id !== excludePlayerId && player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(message));
      }
    });
    // 广播给观战者
    if (this.spectators) {
      this.spectators.forEach(spectatorId => {
        const ws = roomManager.getPlayerConnection(spectatorId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      });
    }
  }

  // 序列化
  toJSON() {
    const displayState = (!this.hasHumanPlayers() && (this.gameState === 'playing' || this.gameState === 'waiting')) ? 'cleanup' : this.gameState;

    // 尝试获取关联的游戏会话数据
    let sessionData = null;
    if (this.gameSessionId) {
      const session = roomManager.getGameSession(this.gameSessionId);
      if (session) {
        sessionData = session.toJSON();
      }
    }

    return {
      code: this.code,
      name: this.name,
      isPrivate: !!this.isPrivate,
      host: this.host.id,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        color: p.color,
        playerNumber: p.color,
        emoji: p.emoji,
        isHost: p.id === this.host.id,
        isAI: !!p.isAI,
        isReady: this.playerReadyStatus.get(p.id) || false,
        isConnected: !!p.isConnected
      })),
      gameState: this.gameState,
      displayState: displayState,
      gameSession: sessionData,
      playerReadyStatus: Object.fromEntries(this.playerReadyStatus),
      settings: this.settings,
      roomChatHistory: this.roomChatHistory
    };
  }
}

// -------------------------- 玩家类（统一默认昵称）--------------------------
class Player {
  constructor(id, ws, nickname = '', emoji = 'smile') {
    this.id = id;
    this.ws = ws;
    const normalizedNickname = String(nickname == null ? '' : nickname).trim();
    this.nickname = normalizedNickname || getDefaultNickname(id); // 统一默认昵称
    this.emoji = emoji;
    this.color = null;
    this.isHost = false;
    this.isConnected = true;
    this.disconnectedAt = null; // 断开时间戳
  }
}

// -------------------------- 全局实例与中间件 --------------------------
const roomManager = new RoomManager();

/**
 * 房间验证中间件（统一权限校验）
 * @param {Function} handler - 业务处理函数
 * @param {boolean} requireHost - 是否需要房主权限
 * @returns {Function} 包装后的处理函数
 */
function withRoomValidation(handler, requireHost = false) {
  return (ws, playerId, message) => {
    const room = roomManager.getPlayerRoom(playerId);
    if (!room) throw new Error('玩家不在任何房间中');

    const player = room.players.get(playerId);
    if (!player) throw new Error('玩家不存在');

    if (requireHost && room.host.id !== playerId) throw new Error('只有房主可以执行此操作');

    return handler(ws, playerId, message, room, player);
  };
}

/**
 * 游戏会话验证中间件（统一校验）
 * @param {Function} handler - 业务处理函数
 * @returns {Function} 包装后的处理函数
 */
function withGameSessionValidation(handler) {
  return (ws, playerId, message) => {
    const gameSession = roomManager.getPlayerGameSession(playerId);
    if (!gameSession) throw new Error('玩家不在任何游戏会话中');

    const player = gameSession.players.get(playerId);
    if (!player) throw new Error('玩家不存在于游戏会话中');

    return handler(ws, playerId, message, gameSession, player);
  };
}

// -------------------------- 断开连接处理（优化冗余逻辑）--------------------------
function handlePlayerDisconnect(playerId) {
  console.log(`处理玩家 ${playerId} 断开连接`);

  // 清理玩家连接映射
  roomManager.playerConnections.delete(playerId);

  // 1. 游戏会话中处理
  let handledInSession = false;
  for (const gameSession of roomManager.gameSessions.values()) {
    if (!gameSession.players.has(playerId)) continue;

    handledInSession = true;
    const player = gameSession.players.get(playerId);
    if (player) {
      const wasHost = player.isHost || false;

      // 检查是否已经发送过退出消息，避免重复
      const alreadyLeft = !player.isConnected && !!player.disconnectedAt;

      player.isConnected = false;
      player.ws = null;
      player.disconnectedAt = player.disconnectedAt || Date.now();

      // 房主转移逻辑
      if (wasHost) {
        const doTransfer = () => {
          // 重新检查当前房主是否仍不在线（可能已经重连了）
          const currentHost = gameSession.players.get(playerId);
          const currentWs = roomManager.getPlayerConnection(playerId);
          const isCurrentWsOpen = currentWs && currentWs.readyState === 1;
          
          if (currentHost && currentHost.isConnected && isCurrentWsOpen) {
            console.log(`房主 ${playerId} 已在线，取消房主转移`);
            return;
          }

          // 如果在等待期间，有其他人通过重连已经接管了房主，也不需要再转移了
          const actualCurrentHost = Array.from(gameSession.players.values()).find(p => p.isHost);
          if (actualCurrentHost && actualCurrentHost.id !== playerId && actualCurrentHost.isConnected) {
             console.log(`房主已变更为 ${actualCurrentHost.id}，取消转移`);
             return;
          }

          // 找到第一个在线且WebSocket真实打开的真实玩家作为新房主
          let newHost = null;
          for (const [pId, p] of gameSession.players) {
            const pWs = roomManager.getPlayerConnection(pId);
            const isWsOpen = pWs && pWs.readyState === 1;
            if (pId !== playerId && p.isConnected && isWsOpen && !p.isAI) {
              newHost = p;
              break;
            }
          }

          if (newHost) {
            console.log(`房主 ${playerId} 离线，转移房主给 ${newHost.id}`);
            for (const [pId, p] of gameSession.players) {
              if (p) p.isHost = (pId === newHost.id);
            }
            gameSession.hostId = newHost.id;

            // 同步更新Room中的房主（如果房间存在）
            if (gameSession.roomCode) {
              const room = roomManager.getRoom(gameSession.roomCode);
              if (room) {
                const roomNewHost = room.players.get(newHost.id);
                if (roomNewHost) {
                  room.host = roomNewHost;
                  for (const p of room.players.values()) {
                    if (p) p.isHost = (p.id === roomNewHost.id);
                  }
                  console.log(`房间 ${room.code} 房主已同步更新为 ${newHost.id}`);
                }
              }
            }

            // 广播房主变更消息
            gameSession.broadcast({
              type: 'hostChanged',
              oldHostId: playerId,
              newHostId: newHost.id,
              newHostNickname: newHost.nickname,
              gameSession: gameSession.toJSON(),
              timestamp: Date.now()
            });

            console.log(`新房主: ${newHost.id} (${newHost.nickname})`);
          } else {
            console.log(`房主 ${playerId} 断开连接，但没有其他在线玩家可以接管`);
          }
        };

        const timeSinceStart = Date.now() - (gameSession.createdAt || 0);
        const isInitialLoading = timeSinceStart < 15000;

        if (isInitialLoading) {
          console.log(`游戏刚开始（加载中），延迟 10 秒后检查是否需要转移房主`);
          setTimeout(doTransfer, 10000);
        } else {
          doTransfer();
        }
      }

      // 广播离线消息
      gameSession.broadcast({
        type: 'chatMessage',
        message: `${player.nickname}退出游戏`,
        playerNumber: null,
        playerName: null,
        isSystemMessage: true,
        timestamp: Date.now()
      });
      // 广播断开状态
      gameSession.broadcast({
        type: 'playerDisconnected',
        playerId,
        gameSession: gameSession.toJSON()
      });

      // 如果是当前玩家断线
      if (gameSession.gameData && player.color === gameSession.gameData.currentPlayer) {
        // 如果游戏尚未正式开始（首发玩家还没投骰子就跑了）
        if (!gameSession.gameData.gameOfficiallyStarted) {
          // 找到下一个在线的人类玩家
          const allPlayers = Array.from(gameSession.players.values());
          const humanPlayers = allPlayers.filter(p => !p.isAI && p.id !== playerId && p.isConnected);
          
          if (humanPlayers.length > 0) {
            // 按照颜色顺序找下一个
            const sortedHumans = humanPlayers.sort((a, b) => a.color - b.color);
            // 找比当前颜色大的最小颜色，如果没有就找最小的
            let nextHuman = sortedHumans.find(p => p.color > player.color);
            if (!nextHuman) nextHuman = sortedHumans[0];
            // 执行转移
            gameSession.gameData.currentPlayer = nextHuman.color;
            gameSession.gameData.thinkingStartTime = Date.now(); // 重置思考时间
            
            // 广播转移消息
            gameSession.broadcast({
              type: 'chatMessage',
              message: `首发玩家离线，首发权转移给 ${nextHuman.nickname}`,
              playerNumber: null,
              playerName: null,
              isSystemMessage: true,
              timestamp: Date.now()
            });
            
            gameSession.broadcast({
              type: 'playerTurnChange',
              newPlayer: nextHuman.color,
              timestamp: Date.now(),
              reason: 'first_player_disconnect'
            });
          } else {
            console.log(`[开局优化] 没有其他在线人类玩家可以接管首发权，保持原样（将由AI接管）`);
          }
        } else {
          console.log(`当前玩家${player.color}断线（游戏阶段：${gameSession.gameData.gamePhase}），等待超时自动接管`);
        }
      }

      // 同步更新房间中的玩家状态（如果房间存在）
      if (gameSession.roomCode) {
        const room = roomManager.getRoom(gameSession.roomCode);
        if (room) {
          const roomPlayer = room.players.get(playerId);
          if (roomPlayer) {
            roomPlayer.isConnected = false;
            roomPlayer.ws = null;
            roomPlayer.disconnectedAt = Date.now();
          }
          // 检查房间是否已没有人类玩家
          room.checkEmptyRoom();
        }
      }
    }
  }

  // 如果在游戏会话中处理过，就结束
  if (handledInSession) {
    return;
  }

  // 1.5 观战者处理
  const spectatingRoomCode = roomManager.playerSpectatingRooms.get(playerId);
  if (spectatingRoomCode) {
    const room = roomManager.getRoom(spectatingRoomCode);
    if (room) {
      room.spectators.delete(playerId);
      if (room.gameSessionId) {
        const gameSession = roomManager.getGameSession(room.gameSessionId);
        if (gameSession) {
          gameSession.spectators.delete(playerId);
        }
      }
    }
    roomManager.playerSpectatingRooms.delete(playerId);
    return;
  }

  // 2. 房间中处理（非游戏状态）
  const roomCode = roomManager.playerRooms.get(playerId);
  if (!roomCode) return;

  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  // 游戏中保留位置
  if (room.gameState === 'playing') {
    const player = room.players.get(playerId);
    if (player) {
      player.isConnected = false;
      player.ws = null;
      player.disconnectedAt = Date.now();
      // 广播离线消息
      room.broadcast({
        type: 'chatMessage',
        message: `${player.nickname}退出游戏`,
        playerNumber: null,
        playerName: null,
        isSystemMessage: true,
        timestamp: Date.now()
      });
      // 广播断开状态
      room.broadcast({
        type: 'playerDisconnected',
        playerId,
        room: room.toJSON()
      });
    }
    return;
  }

  // 3. 非游戏状态：30秒后移除玩家
  const player = room.players.get(playerId);
  if (player) {
    player.isConnected = false;
    player.ws = null;
    player.disconnectedAt = Date.now();

    // 检查房间是否已没有人类玩家
    room.checkEmptyRoom();

    room.broadcast({
      type: 'playerDisconnected',
      playerId,
      room: room.toJSON()
    });

    const timer = setTimeout(() => {
      console.log(`玩家 ${playerId} 重连超时，执行移除`);
      const currentPlayer = room.players.get(playerId);
      if (currentPlayer && !currentPlayer.isConnected) {
        room.removePlayer(playerId);
        roomManager.playerRooms.delete(playerId);

        if (room.players.size > 0) {
          // 如果房间中已经没有任何人类玩家（只剩AI），直接走房间销毁流程
          if (!room.hasHumanPlayers()) {
            console.log(`房间 ${roomCode} 仅剩AI玩家，立即销毁`);
            roomManager.immediateDestroyRoom(roomCode);
          } else {
            room.broadcast({
              type: 'playerLeft',
              playerId,
              room: room.toJSON()
            });
          }
        } else {
          console.log(`房间 ${roomCode} 已无玩家，立即销毁`);
          roomManager.immediateDestroyRoom(roomCode);
        }
      }
      roomManager.disconnectTimers.delete(playerId);
    }, 30000);
    roomManager.disconnectTimers.set(playerId, timer);
    return;
  }

  handlePlayerDisconnect(playerId);
}

function forceDetachPlayerFromExistingContexts(playerId, nextRoomCode = null, isSilentMigration = false) {
  const currentRoomCode = roomManager.playerRooms.get(playerId);
  const currentSessionId = roomManager.playerSessions.get(playerId);

  if (currentRoomCode && nextRoomCode && currentRoomCode === nextRoomCode) {
    return;
  }

  if (currentSessionId) {
    const gs = roomManager.getGameSession(currentSessionId);
    if (gs && gs.players && gs.players.has(playerId)) {
      const p = gs.players.get(playerId);
      if (p) {
        p.isConnected = false;
        p.ws = null;
        p.disconnectedAt = Date.now();
      }

      // 如果玩家是主动切换到其他房间/会话：
      // 1. 如果游戏已结束或未开始，彻底移除
      // 2. 如果游戏进行中，保留玩家数据（转为离线/被托管），仅删除 Session 映射
      if (gs.gameState !== 'playing') {
        gs.players.delete(playerId);
        // 显式清理音频加载状态等残留标记
        if (gs.audioLoadedPlayers) gs.audioLoadedPlayers.delete(playerId);
        if (gs.aiTakeoverPlayers) gs.aiTakeoverPlayers.delete(playerId);
      } else {
        console.log(`[迁移] 玩家 ${playerId} 正在游戏中迁移，保留会话内数据以供观战/托管`);
        // 确保被标记为托管（如果之前没托管的话）
        if (gs.aiTakeoverPlayers) gs.aiTakeoverPlayers.add(playerId);
      }

      // 如果是静默迁移，严禁发送任何广播
      if (!isSilentMigration) {
        try {
          gs.broadcast({
            type: 'chatMessage',
            message: `${p?.nickname || playerId}退出游戏`,
            playerNumber: null,
            playerName: null,
            isSystemMessage: true,
            timestamp: Date.now()
          });
          gs.broadcast({
            type: 'playerDisconnected',
            playerId,
            gameSession: gs.toJSON()
          });
        } catch (e) {
          console.error('forceDetachPlayerFromExistingContexts 游戏会话广播失败:', e);
        }
      } else {
        console.log(`[迁移] 玩家 ${playerId} 静默脱离旧游戏会话 ${currentSessionId}`);
      }
    }
    roomManager.playerSessions.delete(playerId);
  }

  if (currentRoomCode) {
    const room = roomManager.getRoom(currentRoomCode);
    if (room && room.players && room.players.has(playerId)) {
      const rp = room.players.get(playerId);
      if (rp) {
        rp.isConnected = false;
        rp.ws = null;
        rp.disconnectedAt = Date.now();
      }

      // 玩家已切换房间：从旧房间彻底移除
      room.removePlayer(playerId);

      // 如果是静默迁移，严禁发送任何广播
      if (!isSilentMigration) {
        try {
          room.broadcast({
            type: 'playerDisconnected',
            playerId,
            room: room.toJSON()
          });
        } catch (e) {
          console.error('forceDetachPlayerFromExistingContexts 房间广播失败:', e);
        }
      } else {
        console.log(`[迁移] 玩家 ${playerId} 静默脱离旧房间 ${currentRoomCode}`);
      }
    }
    roomManager.playerRooms.delete(playerId);
  }
}

wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      // 初始化玩家ID
      if (!playerId) {
        playerId = message.playerId?.startsWith('player_') ? message.playerId : generatePlayerId();
        console.log(`玩家 ${playerId} 连接`);
        // 发送连接确认
        ws.send(JSON.stringify({ type: 'connected', playerId }));
      }

      // 重连：取消断开定时器
      if (roomManager.disconnectTimers.has(playerId)) {
        clearTimeout(roomManager.disconnectTimers.get(playerId));
        roomManager.disconnectTimers.delete(playerId);
      }

      if (roomManager.disconnectDebounceTimers.has(playerId)) {
        clearTimeout(roomManager.disconnectDebounceTimers.get(playerId));
        roomManager.disconnectDebounceTimers.delete(playerId);
      }

      // 不要把 identify/getReconnectInfo 当成“重连回来了”。
      // 只有在收到明确的回房间/回会话指令时才恢复isConnected并广播。
      const isExplicitRejoin = message.type === 'rejoinGameSession' || message.type === 'rejoinRoom' || message.type === 'join_room';

      if (isExplicitRejoin) {
        if (message.type === 'rejoinGameSession') {
          // 仅更新连接引用，状态恢复由 handleRejoinGameSession 显式触发，
          // 以便正确检测 wasDisconnected 并发送归来广播。
          const gameSession = roomManager.getPlayerGameSession(playerId);
          if (gameSession) {
            const player = gameSession.players.get(playerId);
            if (player) {
              player.ws = ws;
            }
          }

          roomManager.setPlayerConnection(playerId, ws);
          handleMessage(ws, playerId, message);
          return;
        }

        const gameSession = roomManager.getPlayerGameSession(playerId);
        if (gameSession) {
          const player = gameSession.players.get(playerId);
          if (player) {
            player.ws = ws;
            // 不要在这里设置 isConnected = true，交给业务处理器处理
            roomManager.setPlayerConnection(playerId, ws);
          }
        } else {
          const room = roomManager.getPlayerRoom(playerId);
          if (room) {
            const player = room.players.get(playerId);
            if (player) {
              player.ws = ws;
              // 不要在这里设置 isConnected = true，交给业务处理器处理
              roomManager.setPlayerConnection(playerId, ws);
              console.log(`玩家 ${playerId} WebSocket 已连接，等待业务重连确认...`);
            }
          } else {
            roomManager.setPlayerConnection(playerId, ws);
          }
        }
      } else {
        // 非重连场景：不要覆盖“房间/会话广播连接”。
        // 否则会出现：玩家从游戏页/房间页回到主页时建立了新WS，旧WS close 会被误判为“已切换连接”从而跳过断线处理。
        // 只有当玩家不在任何房间或游戏会话中时，才将该WS写入 playerConnections。
        const inGameSession = !!roomManager.getPlayerGameSession(playerId);
        const inRoom = !!roomManager.getPlayerRoom(playerId);
        if (!inGameSession && !inRoom) {
          roomManager.setPlayerConnection(playerId, ws);
        }
      }

      handleMessage(ws, playerId, message);
    } catch (error) {
      console.error('消息解析错误:', error);
      ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
    }
  });

  ws.on('close', () => {
    console.log(`玩家 ${playerId} 断开连接`);

    if (!playerId) return;

    if (roomManager.disconnectDebounceTimers.has(playerId)) {
      clearTimeout(roomManager.disconnectDebounceTimers.get(playerId));
      roomManager.disconnectDebounceTimers.delete(playerId);
    }

    // 连接切换去抖：页面跳转/短暂网络抖动时，客户端可能会迅速建立新连接。
    const debounceMs = 1500;
    const debounceTimer = setTimeout(() => {
      roomManager.disconnectDebounceTimers.delete(playerId);

      const currentWs = roomManager.getPlayerConnection(playerId);
      const switchedConnection = !!(currentWs && currentWs !== ws);

      if (!switchedConnection) {
        roomManager.playerConnections.delete(playerId);
      }

      if (roomManager.disconnectTimers.has(playerId)) {
        clearTimeout(roomManager.disconnectTimers.get(playerId));
        roomManager.disconnectTimers.delete(playerId);
      }

      // 如果玩家已经有了新的WebSocket连接（例如从房间页跳转到游戏页），
      if (switchedConnection) {
        console.log(`玩家 ${playerId} WebSocket 连接已切换到新连接，跳过断线处理`);
        return;
      }

      const roomCode = roomManager.playerRooms.get(playerId);
      const room = roomCode ? roomManager.getRoom(roomCode) : null;
      const gameSession = roomManager.getPlayerGameSession(playerId);

      if (room && room.gameState !== 'playing' && !gameSession) {
        const disconnectTimeout = 10000;
        console.log(`玩家 ${playerId} 在房间配置阶段断开，标记为离线，${disconnectTimeout / 1000}秒后移除`);

        const player = room.players.get(playerId);
        if (player) {
          player.isConnected = false;
          player.disconnectedAt = Date.now();
        }

        room.broadcast({
          type: 'playerDisconnected',
          playerId,
          room: room.toJSON()
        });

        const timer = setTimeout(() => {
          console.log(`玩家 ${playerId} 重连超时，执行移除`);
          const currentPlayer = room.players.get(playerId);
          if (currentPlayer && !currentPlayer.isConnected) {
            room.removePlayer(playerId);
            roomManager.playerRooms.delete(playerId);

            if (room.players.size > 0) {
              // 如果房间中已经没有任何人类玩家（只剩AI），直接走房间销毁流程
              if (!room.hasHumanPlayers()) {
                console.log(`房间 ${roomCode} 仅剩AI玩家，立即销毁`);
                roomManager.immediateDestroyRoom(roomCode);
              } else {
                room.broadcast({
                  type: 'playerLeft',
                  playerId,
                  room: room.toJSON()
                });
              }
            } else {
              console.log(`房间 ${roomCode} 已无玩家，立即销毁`);
              roomManager.immediateDestroyRoom(roomCode);
            }
          }
          roomManager.disconnectTimers.delete(playerId);
        }, disconnectTimeout);
        roomManager.disconnectTimers.set(playerId, timer);
        return;
      }

      handlePlayerDisconnect(playerId);
    }, debounceMs);

    roomManager.disconnectDebounceTimers.set(playerId, debounceTimer);
  });
});

function handleMessage(ws, playerId, message) {
  console.log(`处理消息类型: ${message.type}, 玩家: ${playerId}`);
  try {
    switch (message.type) {
      // ... (rest of the code remains the same)
      case 'ping':
        try {
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
            playerId
          }));
        } catch (e) {
          // ignore
        }
        break;
      case 'pong':
        // 客户端可能会主动回传pong，服务器无需处理
        break;
      case 'identify':
        console.log(`玩家 ${playerId} 身份确认`);
        break;
      case 'getReconnectInfo':
        handleGetReconnectInfo(ws, playerId);
        break;
      case 'createRoom':
        handleCreateRoom(ws, playerId, message);
        break;
      case 'join_room':
        handleJoinRoom(ws, playerId, message);
        break;
      case 'spectate_room':
        handleSpectateRoom(ws, playerId, message);
        break;
      case 'listRooms':
        handleListRooms(ws);
        break;
      case 'leaveRoom':
      case 'leave_room':
        handleLeaveRoom(ws, playerId, message);
        break;
      case 'select_color':
        handleSelectColor(ws, playerId, message);
        break;
      case 'update_nickname':
        handleUpdateNickname(ws, playerId, message);
        break;
      case 'update_emoji':
        handleUpdateEmoji(ws, playerId, message);
        break;
      case 'diceRoll':
        handleDiceRoll(ws, playerId, message);
        break;
      case 'diceDisplay':
        handleDiceDisplay(ws, playerId, message);
        break;
      case 'teleportIcon':
        handleTeleportIcon(ws, playerId, message);
        break;
      case 'polyhedralDice':
        handlePolyhedralDice(ws, playerId, message);
        break;
      case 'mysteryBoxIcon':
        handleMysteryBoxIcon(ws, playerId, message);
        break;
      case 'removeMysteryBoxIcon':
        handleRemoveMysteryBoxIcon(ws, playerId, message);
        break;
      case 'energyGainAnimation':
        handleEnergyGainAnimation(ws, playerId, message);
        break;
      case 'diceAnimationStart':
        handleDiceAnimationStart(ws, playerId, message);
        break;
      case 'chessMove':
        handleChessMove(ws, playerId, message);
        break;
      case 'progressBarStart':
        handleProgressBarStart(ws, playerId, message);
        break;
      case 'diceReset':
        handleDiceReset(ws, playerId, message);
        break;
      case 'pieceMove':
        handlePieceMove(ws, playerId, message);
        break;
      case 'rejoinRoom':
        handleRejoinRoom(ws, playerId, message);
        break;
      case 'rejoinGameSession':
        handleRejoinGameSession(ws, playerId, message);
        break;
      case 'updatePlayer':
        handleUpdatePlayer(ws, playerId, message);
        break;
      case 'updateSettings':
        handleUpdateSettings(ws, playerId, message);
        break;
      case 'update_room_name':
        handleUpdateRoomName(ws, playerId, message);
        break;
      case 'update_room_privacy':
        handleUpdateRoomPrivacy(ws, playerId, message);
        break;
      case 'returnToRoom':
        handleReturnToRoom(ws, playerId, message);
        break;
      case 'toggle_ready':
        handleToggleReady(ws, playerId, message);
        break;
      case 'start_game':
      case 'startGame':
        handleStartGame(ws, playerId);
        break;
      case 'add_ai_player':
        handleAddAIPlayer(ws, playerId, message);
        break;
      case 'remove_ai_player':
        handleRemoveAIPlayer(ws, playerId, message);
        break;
      case 'update_ai_difficulty':
        handleUpdateAIDifficulty(ws, playerId, message);
        break;
      case 'kickPlayer':
        handleKickPlayer(ws, playerId, message);
        break;
      case 'configure_piece_count':
        handleConfigurePieceCount(ws, playerId, message);
        break;
      case 'playerTurnChange':
        handlePlayerTurnChange(ws, playerId, message);
        break;
      case 'noMovableChess':
        handleNoMovableChess(ws, playerId, message);
        break;
      case 'aiTakeoverChange':
        handleAITakeoverChange(ws, playerId, message);
        break;
      case 'nicknameChange':
        handleNicknameChange(ws, playerId, message);
        break;
      case 'jumpAnimation':
        handleJumpAnimation(ws, playerId, message);
        break;
      case 'flyAnimation':
        handleFlyAnimation(ws, playerId, message);
        break;
      case 'moveChessToStart':
        handleMoveChessToStart(ws, playerId, message);
        break;
      case 'moveChessToFinish':
        handleMoveChessToFinish(ws, playerId, message);
        break;
      case 'stackCollision':
        handleStackCollision(ws, playerId, message);
        break;
      case 'stackBounce':
        handleStackBounce(ws, playerId, message);
        break;
      case 'endpointBounce':
        handleEndpointBounce(ws, playerId, message);
        break;
      case 'energyChange':
        handleEnergyChange(ws, playerId, message);
        break;
      case 'defeatCountChange':
        handleDefeatCountChange(ws, playerId, message);
        break;
      case 'gameEnd':
        handleGameEnd(ws, playerId, message);
        break;
      case 'newGame':
        handleNewGame(ws, playerId, message);
        break;
      case 'forceSettlement':
        handleForceSettlement(ws, playerId, message);
        break;
      case 'gamePause':
        handleGamePause(ws, playerId, message);
        break;
      case 'gameResume':
        handleGameResume(ws, playerId, message);
        break;
      case 'gameInfo':
        handleGameInfo(ws, playerId, message);
        break;
      case 'audioLoaded':
        handleAudioLoaded(ws, playerId, message);
        break;
      case 'loadAudio':
        handleLoadAudio(ws, playerId, message);
        break;
      case 'chatMessage':
        handleChatMessage(ws, playerId, message);
        break;
      case 'pauseGame':
        handlePauseGame(ws, playerId, message);
        break;
      case 'resumeGame':
        handleResumeGame(ws, playerId, message);
        break;
      case 'settleGame':
        handleSettleGame(ws, playerId, message);
        break;
      case 'progressHistorySync':
        handleProgressHistorySync(ws, playerId, message);
        break;
      case 'diceStatisticsSync':
        handleDiceStatisticsSync(ws, playerId, message);
        break;
      default:
        console.log(`未知消息类型: ${message.type}`);
        ws.send(JSON.stringify({ type: 'error', message: `未知消息类型: ${message.type}` }));
    }
  } catch (error) {
    console.error('处理消息错误:', error);
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
  }
}

// ...

function handleGetReconnectInfo(ws, playerId) {
  try {
    // 优先：游戏会话（游戏进行中断线）
    const gameSession = roomManager.getPlayerGameSession(playerId);
    if (gameSession && gameSession.roomCode) {
      const room = roomManager.getRoom(gameSession.roomCode);
      const sessionPlayer = gameSession.players ? gameSession.players.get(playerId) : null;
      
      // 只有当玩家被标记为离线（isConnected === false）且确实在玩家列表中时，才允许重连
      // 这里的 sessionPlayer 是从 gameSession.players 获取的，如果玩家已被 delete，则 canReconnect 为 false
      const canReconnect = !!(
        room && 
        sessionPlayer && 
        sessionPlayer.isConnected === false &&
        gameSession.players.has(playerId)
      );
      
      ws.send(JSON.stringify({
        type: 'reconnectInfo',
        canReconnect,
        roomCode: canReconnect ? gameSession.roomCode : null,
        source: 'gameSession'
      }));
      return;
    }

    // 其次：房间配置阶段断线
    const room = roomManager.getPlayerRoom(playerId);
    if (room) {
      const roomPlayer = room.players ? room.players.get(playerId) : null;
      
      // 房间重连也需要玩家在房间中且处于离线状态
      const canReconnect = !!(
        roomPlayer && 
        roomPlayer.isConnected === false &&
        room.players.has(playerId)
      );
      
      ws.send(JSON.stringify({
        type: 'reconnectInfo',
        canReconnect,
        roomCode: canReconnect ? room.code : null,
        source: 'room'
      }));
      return;
    }

    ws.send(JSON.stringify({ type: 'reconnectInfo', canReconnect: false, roomCode: null }));
  } catch (error) {
    console.error('获取重连信息失败:', error);
    ws.send(JSON.stringify({ type: 'reconnectInfo', canReconnect: false, roomCode: null }));
  }
}

function handleListRooms(ws) {
  try {
    const rooms = roomManager.listPublicRooms();
    ws.send(JSON.stringify({ type: 'roomsList', rooms }));
  } catch (error) {
    console.error('获取房间列表失败:', error);
    ws.send(JSON.stringify({ type: 'error', message: '获取房间列表失败' }));
  }
}

function handleCreateRoom(ws, playerId, message) {
  // 检查玩家是否在其他房间中
  const existingRoom = roomManager.getPlayerRoom(playerId);
  if (existingRoom) {
    console.log(`[迁移] 玩家 ${playerId} 已在房间 ${existingRoom.code} 中，执行静默物理分离以创建新房间`);
    
    // 直接执行底层静默清理
    forceDetachPlayerFromExistingContexts(playerId, null, true);
  }

  // 确保没有任何残留上下文
  forceDetachPlayerFromExistingContexts(playerId, null, true);

  const emoji = message.data?.emoji || message.emoji;
  const player = new Player(playerId, ws, message.data?.nickname, emoji);
  const room = roomManager.createRoom(player);
  ws.send(JSON.stringify({ type: 'roomCreated', room: room.toJSON() }));
}

function handleJoinRoom(ws, playerId, message) {
  const roomCode = message.data.roomCode;
  const room = roomManager.getRoom(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: '房间不存在或已被销毁' }));
    return;
  }

  // 检查玩家是否已经在该房间中，或者在当前房间的游戏会话中（硬离开后尝试回来）
  const gameSession = roomManager.getPlayerGameSession(playerId);
  const isInSession = !!(gameSession && gameSession.roomCode === roomCode && gameSession.players.has(playerId));

  if (room.players.has(playerId) || isInSession) {
    // 如果不在房间但在会话中，说明是之前“硬离开”后又想重连，需先恢复房间成员身份
    if (!room.players.has(playerId) && isInSession) {
      console.log(`玩家 ${playerId} 正在重回游戏中房间 ${roomCode} (从游戏会话恢复)`);
      const sessionPlayer = gameSession.players.get(playerId);
      const player = new Player(playerId, ws, sessionPlayer.nickname, sessionPlayer.emoji);
      player.color = sessionPlayer.color;
      player.isHost = sessionPlayer.isHost;

      // 重新加入房间映射
      room.players.set(playerId, player);
      roomManager.playerRooms.set(playerId, roomCode);
    }

    const existingPlayer = room.players.get(playerId);

    // 清除断开连接定时器（如果有）
    if (roomManager.disconnectTimers.has(playerId)) {
      clearTimeout(roomManager.disconnectTimers.get(playerId));
      roomManager.disconnectTimers.delete(playerId);
      console.log(`玩家 ${playerId} 重新加入房间 ${roomCode}，清除断开定时器`);
    }

    // 恢复连接
    existingPlayer.ws = ws;
    existingPlayer.isConnected = true;
    existingPlayer.disconnectedAt = null;

    // 重新关联房间/连接映射
    roomManager.playerRooms.set(playerId, roomCode);
    roomManager.setPlayerConnection(playerId, ws);

    // 只有客户端显式传了 nickname/emoji 才更新（避免用 undefined/空值覆盖）
    if (message.data && Object.prototype.hasOwnProperty.call(message.data, 'nickname')) {
      const nicknameStr = (message.data.nickname == null ? '' : String(message.data.nickname));
      const trimmed = nicknameStr.trim();
      if (trimmed) {
        existingPlayer.nickname = trimmed;
      }
    }
    if (message.data && Object.prototype.hasOwnProperty.call(message.data, 'emoji')) {
      if (message.data.emoji != null) {
        existingPlayer.emoji = message.data.emoji;
      }
    }

    // 发送加入成功消息（如果游戏正在进行，补齐gameData以支持重连跳转）
    const response = { type: 'roomJoined', room: room.toJSON() };
    if (room.gameState === 'playing' && room.gameSessionId) {
      const gameSession = roomManager.getGameSession(room.gameSessionId);
      if (gameSession && gameSession.gameData) {
        response.gameData = gameSession.gameData;
      } else {
        response.gameData = { gameSessionId: room.gameSessionId };
      }
    }
    ws.send(JSON.stringify(response));
    return;
  }
  // 房间满员：计算已占用席位 = 真实玩家 + AI 玩家
  const aiCount = room.settings?.aiPlayers ? room.settings.aiPlayers.length : 0;
  const totalPlayerCount = room.players.size + aiCount;
  if (totalPlayerCount >= 4) {
    ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
    return;
  }

  // 检查玩家是否在其他房间中（非当前要加入的房间）
  const existingRoom = roomManager.getPlayerRoom(playerId);
  if (existingRoom && existingRoom.code !== roomCode) {
    console.log(`[迁移] 玩家 ${playerId} 已在房间 ${existingRoom.code} 中，执行静默物理分离以加入 ${roomCode}`);
    
    // 直接执行底层静默清理
    forceDetachPlayerFromExistingContexts(playerId, roomCode, true);
  }

  // 再次确保没有任何残留上下文（针对可能存在的残留 Session）
  forceDetachPlayerFromExistingContexts(playerId, roomCode, true);

  const player = new Player(playerId, ws, message.data?.nickname, message.data?.emoji);
  roomManager.joinRoom(roomCode, player);

  // 发送加入成功消息
  const response = { type: 'roomJoined', room: room.toJSON() };
  if (room.gameState === 'playing' && room.gameSessionId) {
    // 如果游戏正在进行，发送完整的游戏会话数据（包括defeatCounts等）
    const gameSession = roomManager.getGameSession(room.gameSessionId);
    if (gameSession && gameSession.gameData) {
      response.gameData = gameSession.gameData;
      console.log(`发送游戏数据给重连玩家 ${playerId}，包含击败计数:`, gameSession.gameData.defeatCounts);
    } else {
      // 后备方案：只发送gameSessionId
      response.gameData = { gameSessionId: room.gameSessionId };
    }
  }
  ws.send(JSON.stringify(response));

  // 广播玩家加入
  room.broadcast({
    type: 'playerJoined',
    player: { id: player.id, nickname: player.nickname, color: player.color, emoji: player.emoji },
    room: room.toJSON()
  }, playerId); // 排除当前玩家
}

function handleSpectateRoom(ws, playerId, message) {
  const roomCode = message.data?.roomCode || message.roomCode;
  const room = roomManager.getRoom(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: '房间不存在或已被销毁' }));
    return;
  }

  // 记录观战连接
  // 检查观战人数限制（防止恶意挤占带宽）
    const MAX_SPECTATORS = 5;
    if (room.spectators.size >= MAX_SPECTATORS) {
    ws.send(JSON.stringify({ type: 'error', message: '观战人数已满' }));
    return;
  }

  roomManager.setPlayerConnection(playerId, ws);
  roomManager.playerSpectatingRooms.set(playerId, roomCode);
  room.spectators.add(playerId);

  if (room.gameSessionId) {
    const gameSession = roomManager.getGameSession(room.gameSessionId);
    if (gameSession) {
      gameSession.spectators.add(playerId);
    }
  }

  // 发送加入观战成功消息
  const response = { type: 'spectateJoined', room: room.toJSON() };
  if (room.gameState === 'playing' && room.gameSessionId) {
    const gameSession = roomManager.getGameSession(room.gameSessionId);
    if (gameSession && gameSession.gameData) {
      response.gameData = gameSession.gameData;
      response.gameSessionId = room.gameSessionId;
      response.gameSession = gameSession.toJSON();
    }
  }
  ws.send(JSON.stringify(response));
  console.log(`玩家 ${playerId} 开始观战房间 ${roomCode}`);
}

// 选择颜色（使用中间件）
const handleSelectColor = withRoomValidation((ws, playerId, message, room, player) => {
  const colorIndex = message.data.colorIndex;
  // 检查真实玩家和AI玩家占用的颜色
  const usedColors = [
    ...Array.from(room.players.values()).filter(p => p.id !== playerId).map(p => p.color),
    ...room.settings.aiPlayers.map(ai => ai.color)
  ];
  if (!usedColors.includes(colorIndex)) {
    player.color = colorIndex;
    // 广播更新
    room.broadcast({
      type: 'playerUpdated',
      player: { id: player.id, nickname: player.nickname, color: player.color, emoji: player.emoji },
      room: room.toJSON()
    });
  } else {
    // 发送错误消息给客户端
    ws.send(JSON.stringify({
      type: 'error',
      message: '该颜色已被占用'
    }));
  }
});

// 更新昵称（不使用房间验证中间件，允许玩家在房间外更新）
function handleUpdateNickname(ws, playerId, message) {
  try {
    const nickname = message.data?.nickname || message.nickname;
    const manualInput = message.data?.manualInput === true || message.manualInput === true;
    // 确保nickname是字符串，如果为null/undefined则设置为空字符串
    const nicknameStr = (nickname == null ? '' : String(nickname));
    const nextNickname = manualInput ? sanitizeText(nicknameStr) : nicknameStr;
    const newNickname = nextNickname.trim() || getDefaultNickname(playerId);

    // 先尝试在游戏会话中查找玩家
    const gameSession = roomManager.getPlayerGameSession(playerId);
    if (gameSession && gameSession.players.has(playerId)) {
      const player = gameSession.players.get(playerId);
      player.nickname = newNickname;
      // 广播更新到游戏会话
      gameSession.broadcast({
        type: 'playerUpdated',
        player: { id: player.id, nickname: player.nickname, color: player.color, emoji: player.emoji }
      });
      return;
    }

    // 再尝试在房间中查找玩家
    const room = roomManager.getPlayerRoom(playerId);
    if (room) {
      const player = room.players.get(playerId);
      if (player) {
        const oldNickname = player.nickname;
        const oldDefaultRoomName = `${oldNickname}的房间`;
        player.nickname = newNickname;

        // 同步更新房间名（仅房主）
        if (room.host && room.host.id === playerId) {
          // 只有当房间名仍为默认格式时才跟随昵称更新，避免覆盖自定义房间名
          if (room.name === oldDefaultRoomName || !room.name) {
            room.name = `${player.nickname}的房间`;
          }
        }

        // 广播更新到房间
        room.broadcast({
          type: 'playerUpdated',
          player: { id: player.id, nickname: player.nickname, color: player.color, emoji: player.emoji },
          room: room.toJSON()
        });
      }
      return;
    }

    // 玩家不在任何房间或游戏会话中，只更新连接映射中的玩家信息
    // 注意：这种情况下无法广播更新，因为玩家不在任何房间中
    console.log(`玩家 ${playerId} 更新昵称为 ${newNickname}（不在房间中）`);
  } catch (error) {
    console.error('更新昵称失败:', error);
    ws.send(JSON.stringify({ type: 'error', message: '更新昵称失败' }));
  }
}

function handleUpdateEmoji(ws, playerId, message) {
  try {
    const emoji = message.data?.emoji ?? message.emoji;

    const gameSession = roomManager.getPlayerGameSession(playerId);
    if (gameSession && gameSession.players.has(playerId)) {
      const player = gameSession.players.get(playerId);
      player.emoji = emoji;
      gameSession.broadcast({
        type: 'playerUpdated',
        player: { id: player.id, nickname: player.nickname, color: player.color, emoji: player.emoji }
      });
      return;
    }

    const room = roomManager.getPlayerRoom(playerId);
    if (room) {
      const player = room.players.get(playerId);
      if (player) {
        player.emoji = emoji;
        room.broadcast({
          type: 'playerUpdated',
          player: { id: player.id, nickname: player.nickname, color: player.color, emoji: player.emoji },
          room: room.toJSON()
        });
      }
      return;
    }

    console.log(`玩家 ${playerId} 更新emoji为 ${emoji}（不在房间中）`);
  } catch (error) {
    console.error('更新表情失败:', error);
    ws.send(JSON.stringify({ type: 'error', message: '更新表情失败' }));
  }
}

const handleUpdateRoomName = withRoomValidation((ws, playerId, message, room) => {
  const name = message.data?.name ?? message.name;
  const nameStr = (name == null ? '' : String(name));
  const newName = nameStr.trim();

  room.name = newName;

  room.broadcast({
    type: 'roomNameUpdated',
    name: room.name,
    room: room.toJSON()
  });
}, true);

const handleUpdateRoomPrivacy = withRoomValidation((ws, playerId, message, room) => {
  const isPrivate = !!(message.data?.isPrivate ?? message.isPrivate);
  room.isPrivate = isPrivate;
  room.broadcast({ type: 'roomPrivacyUpdated', isPrivate, room: room.toJSON() });
}, true);

const handleReturnToRoom = withRoomValidation((ws, playerId, message, room, player) => {
  // 游戏结束后：首次返回房间的玩家成为房主且自动准备；后续返回者不允许覆盖房主
  if (room.postGameHostId && room.postGameHostId !== playerId) {
    room.broadcast({
      type: 'roomReset',
      room: room.toJSON()
    });
    return;
  }

  room.gameState = 'waiting';
  room.gameSessionId = null;

  // 锁定首次返回房间的房主
  room.postGameHostId = playerId;

  // 切换房主为触发者
  room.host = player;
  for (const p of room.players.values()) {
    p.isHost = (p.id === playerId);
  }

  // 重置准备状态：新房主已准备，其余未准备
  room.playerReadyStatus = new Map();
  for (const p of room.players.values()) {
    room.playerReadyStatus.set(p.id, p.id === playerId);
  }

  room.broadcast({
    type: 'roomReset',
    room: room.toJSON()
  });
}, true);

// 踢出玩家（需要房主权限）
const handleKickPlayer = withRoomValidation((ws, playerId, message, room) => {
  const targetId = message.data?.playerId || message.playerId;
  if (!targetId) throw new Error('缺少目标玩家ID');
  if (targetId === playerId) throw new Error('不能踢出自己');

  const targetPlayer = room.players.get(targetId);
  if (!targetPlayer) throw new Error('目标玩家不存在');

  if (room.gameState === 'playing') {
    throw new Error('游戏进行中，无法踢出玩家');
  }

  console.log(`[踢人] 房主 ${playerId} 准备踢出玩家 ${targetId} (${targetPlayer.nickname})`);

  // 向被踢玩家发送通知
  const targetWs = roomManager.getPlayerConnection(targetId);
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify({
      type: 'kicked',
      reason: 'host_kicked',
      message: '你已被房主踢出房间'
    }));
  }

  // 从房间移除玩家
  room.removePlayer(targetId);
  roomManager.playerRooms.delete(targetId);

  // 广播玩家被踢出的消息
  room.broadcast({
    type: 'playerLeft',
    playerId: targetId,
    reason: 'kicked',
    room: room.toJSON()
  });

  console.log(`[踢人] 房主 ${playerId} 已踢出玩家 ${targetId}`);
}, true);

function handleLeaveRoom(ws, playerId, message = {}, isSilentMigration = false) {
  // 处理观战者离开
  const spectatingRoomCode = roomManager.playerSpectatingRooms.get(playerId);
  if (spectatingRoomCode) {
    const room = roomManager.getRoom(spectatingRoomCode);
    if (room) {
      room.spectators.delete(playerId);
      if (room.gameSessionId) {
        const gameSession = roomManager.getGameSession(room.gameSessionId);
        if (gameSession) {
          gameSession.spectators.delete(playerId);
        }
      }
    }
    roomManager.playerSpectatingRooms.delete(playerId);
    return;
  }

  const roomCode = roomManager.playerRooms.get(playerId);
  if (!roomCode) return;

  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  // 如果是静默迁移（加入新房间时），跳过所有广播逻辑，仅清理映射
  if (isSilentMigration) {
    console.log(`[迁移] 玩家 ${playerId} 正在从旧房间 ${roomCode} 静默迁移到新房间，彻底拦截广播`);
    
    // 清除断线延迟定时器
    if (roomManager.disconnectTimers.has(playerId)) {
      clearTimeout(roomManager.disconnectTimers.get(playerId));
      roomManager.disconnectTimers.delete(playerId);
    }

    // 从房间数据结构中彻底移除，不走任何广播逻辑
    room.removePlayer(playerId);
    roomManager.playerRooms.delete(playerId);
    
    // 如果玩家在游戏会话中，也仅做映射清理，不触发 handlePlayerDisconnect
    const gameSessionId = roomManager.playerSessions.get(playerId);
    if (gameSessionId) {
      const gameSession = roomManager.getGameSession(gameSessionId);
      if (gameSession && gameSession.players.has(playerId)) {
        const player = gameSession.players.get(playerId);
        player.isConnected = false;
        player.ws = null;
        player.disconnectedAt = player.disconnectedAt || Date.now();
        // 关键：不要在这里调用 gameSession.broadcast 或 handlePlayerDisconnect
      }
      roomManager.playerSessions.delete(playerId);
    }

    // 如果旧房间空了且没在游戏中，销毁
    if (room.players.size === 0 && room.gameState !== 'playing') {
      roomManager.rooms.delete(roomCode);
    }
    return;
  }

  // 检查是否是游戏结束后离开
  const isGameEnded = message.data?.reason === 'game_ended' || message.reason === 'game_ended';

  const leaveReason = message.data?.reason || message.reason;
  const isHardLeave = leaveReason === 'return_home' || leaveReason === 'quit_game' || leaveReason === 'user_quit_game';

  // 游戏进行中：leave_room 视为“软掉线/可重连离开”，不移除玩家、不销毁会话
  // 典型场景：玩家从游戏页返回主页/联机面板、刷新页面等
  if (room.gameState === 'playing' && !isGameEnded && !isHardLeave) {
    console.log(`玩家 ${playerId} 在游戏中发送leave_room，按掉线处理（保留重连资格）`);
    try {
      handlePlayerDisconnect(playerId);
    } catch (e) {
      console.error('处理游戏中leave_room为断线时出错:', e);
    }

    // 尝试给客户端一个确认（连接可能即将关闭，失败可忽略）
    try {
      ws.send(JSON.stringify({ type: 'roomLeft', soft: true }));
    } catch (err) {
      // ignore
    }
    return;
  }

  if (room.gameState === 'playing' && !isGameEnded && isHardLeave) {
    console.log(`玩家 ${playerId} 在游戏中发送leave_room(${leaveReason})，按主动退出处理（不保留重连资格）`);

    // 清除断线延迟定时器（玩家主动离开，无需等待）
    if (roomManager.disconnectTimers.has(playerId)) {
      clearTimeout(roomManager.disconnectTimers.get(playerId));
      roomManager.disconnectTimers.delete(playerId);
    }

    const gameSessionId = roomManager.playerSessions.get(playerId);
    const gameSession = gameSessionId ? roomManager.getGameSession(gameSessionId) : null;
    const leavingFromSession = !!(gameSession && gameSession.players && gameSession.players.has(playerId));

    let leavingPlayerSnapshot = null;
    if (leavingFromSession) {
      leavingPlayerSnapshot = gameSession.players.get(playerId);
    }

    // 从房间移除
    room.removePlayer(playerId);
    roomManager.playerRooms.delete(playerId);

    // 清理连接映射
    roomManager.playerConnections.delete(playerId);

    // 从会话处理
    if (leavingFromSession) {
      const wasHost = !!(leavingPlayerSnapshot && leavingPlayerSnapshot.isHost);
      const leavingColor = leavingPlayerSnapshot ? leavingPlayerSnapshot.color : null;

      // 不要从游戏会话中删除主动退出的玩家，而是将他们保留，仅标记为离线
      const sessionPlayer = gameSession.players.get(playerId);
      if (sessionPlayer) {
        sessionPlayer.isConnected = false;
        sessionPlayer.isHost = false;
        console.log(`玩家${playerId}主动退出游戏`);
      }

      // 房主转移
      if (wasHost) {
        let newHost = null;
        for (const [pId, p] of gameSession.players) {
          if (p && !p.isAI && p.isConnected) {
            newHost = p;
            break;
          }
        }

        if (!newHost) {
          for (const [pId, p] of gameSession.players) {
            if (p && !p.isAI) {
              newHost = p;
              break;
            }
          }
        }

        if (newHost) {
          for (const [pId, p] of gameSession.players) {
            if (p) p.isHost = (pId === newHost.id);
          }
          gameSession.hostId = newHost.id;

          const roomNewHost = room.players.get(newHost.id);
          if (roomNewHost) {
            room.host = roomNewHost;
            for (const p of room.players.values()) {
              if (p) p.isHost = (p.id === roomNewHost.id);
            }
          }

          gameSession.broadcast({
            type: 'hostChanged',
            oldHostId: playerId,
            newHostId: newHost.id,
            newHostNickname: newHost.nickname,
            gameSession: gameSession.toJSON(),
            timestamp: Date.now()
          });
        }
      }

      // 广播状态更新，前端会据此更新为AI状态
      gameSession.broadcast({
        type: 'playerUpdated',
        players: Array.from(gameSession.players.values()),
        timestamp: Date.now()
      });

      // 触发断开连接消息，确保前端UI表现一致（断开线标志等）
      gameSession.broadcast({
        type: 'playerDisconnected',
        playerId,
        gameSession: gameSession.toJSON()
      });
    }

    // 广播房间更新
    if (room.hasHumanPlayers()) {
      room.broadcast({ type: 'playerLeft', playerId, room: room.toJSON() });
    } else {
      console.log(`房间 ${roomCode} 已无人类玩家，立即销毁`);
      if (room.gameSessionId) {
        roomManager.removeGameSession(room.gameSessionId);
        room.gameSessionId = null;
      }
      if (roomManager.roomDestroyTimers.has(roomCode)) {
        clearTimeout(roomManager.roomDestroyTimers.get(roomCode));
        roomManager.roomDestroyTimers.delete(roomCode);
      }
      roomManager.rooms.delete(roomCode);
    }

    try {
      ws.send(JSON.stringify({ type: 'roomLeft' }));
    } catch (err) {
      // ignore
    }
    return;
  }

  // 清除断线延迟定时器（玩家主动离开，无需等待）
  if (roomManager.disconnectTimers.has(playerId)) {
    clearTimeout(roomManager.disconnectTimers.get(playerId));
    roomManager.disconnectTimers.delete(playerId);
  }

  // 执行离开逻辑
  room.removePlayer(playerId);
  roomManager.playerRooms.delete(playerId);

  // 如果是游戏结束后离开，且房间已空，标记为已结算
  if (isGameEnded && room.players.size === 0 && room.gameState === 'playing') {
    console.log(`房间 ${roomCode} 游戏已结束，所有玩家已离开，标记为已结算`);
    room.gameState = 'finished';
  }

  // 立即广播离开消息（在发送确认之前，确保其他玩家立即收到）
  if (room.hasHumanPlayers()) {
    room.broadcast({ type: 'playerLeft', playerId, room: room.toJSON() });
  } else {
    // 如果没有人类玩家了（只剩AI或全空），立即销毁
    console.log(`房间 ${roomCode} 已无人类玩家，立即销毁`);

    // 删除游戏会话（如果存在）
    if (room.gameSessionId) {
      roomManager.removeGameSession(room.gameSessionId);
      room.gameSessionId = null;
      console.log(`同时删除了关联的游戏会话`);
    }

    // 清除延迟销毁定时器（如果有）
    if (roomManager.roomDestroyTimers.has(roomCode)) {
      clearTimeout(roomManager.roomDestroyTimers.get(roomCode));
      roomManager.roomDestroyTimers.delete(roomCode);
    }

    // 从房间列表中删除
    roomManager.rooms.delete(roomCode);
  }

  // 发送离开确认（在广播之后）
  try {
    ws.send(JSON.stringify({ type: 'roomLeft' }));
  } catch (err) {
    console.log(`发送离开确认失败（连接可能已关闭）: ${err.message}`);
  }
}

function handleUpdatePlayer(ws, playerId, message) {
  const room = roomManager.getPlayerRoom(playerId);
  if (!room) throw new Error('玩家不在任何房间中');

  const player = room.players.get(playerId);
  if (!player) throw new Error('玩家不存在');

  // 更新玩家信息
  if (message.nickname !== undefined) {
    // 确保nickname是字符串，如果为null/undefined则设置为空字符串
    const nicknameStr = (message.nickname == null ? '' : String(message.nickname));
    player.nickname = nicknameStr.trim() || getDefaultNickname(playerId);
  }
  if (message.emoji !== undefined) {
    player.emoji = message.emoji;
  }
  if (message.color !== undefined) {
    player.color = message.color;
  }

  // 广播更新
  room.broadcast({
    type: 'playerUpdated',
    player: { id: player.id, nickname: player.nickname, color: player.color, emoji: player.emoji },
    room: room.toJSON()
  });
}

// 更新房间设置（需要房主权限）
const handleUpdateSettings = withRoomValidation((ws, playerId, message, room) => {
  room.updateSettings(message.data.settings || message.settings); // 兼容两种格式
  room.broadcast({ type: 'settingsUpdated', settings: room.settings, room: room.toJSON() });
}, true);

// 切换玩家准备状态
function handleToggleReady(ws, playerId, message) {
  try {
    const room = roomManager.getPlayerRoom(playerId);
    if (!room) throw new Error('玩家不在任何房间中');

    const player = room.players.get(playerId);
    if (!player) throw new Error('玩家不在房间中');

    // 房主自动准备，不需要手动切换
    if (player.isHost) {
      return;
    }

    // 更新准备状态
    const isReady = message.data?.isReady ?? false;
    room.playerReadyStatus.set(playerId, isReady);

    console.log(`玩家 ${playerId} 准备状态更新为: ${isReady}`);

    // 广播准备状态变化
    room.broadcast({
      type: 'playerReadyStatusChanged',
      playerId: playerId,
      isReady: isReady
    });
  } catch (error) {
    console.error('切换准备状态失败:', error);
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
  }
}

function handleStartGame(ws, playerId) {
  const room = roomManager.getPlayerRoom(playerId);
  if (!room) throw new Error('玩家不在任何房间中');
  if (room.players.size < 2) throw new Error('至少需要2名玩家才能开始游戏');

  // 开始新一局时，清除结算返回房主锁定
  room.postGameHostId = null;

  // 开始新一局时，重置所有真实玩家的AI托管状态（避免上一局/异常超时遗留导致开局即托管）
  for (const p of room.players.values()) {
    if (p && !p.isAI) {
      p.isAITakeover = false;
    }
  }

  // 检查所有非房主玩家是否都准备
  for (const [pId, player] of room.players.entries()) {
    if (!player.isHost) {
      const isReady = room.playerReadyStatus.get(pId) || false;
      if (!isReady) {
        throw new Error('请等待所有玩家准备');
      }
    }
  }

  // 更新房间状态
  if (room.gameSessionId) {
    console.log(`房间 ${room.code} 开启新游戏，立即清理旧会话: ${room.gameSessionId}`);
    roomManager.removeGameSession(room.gameSessionId);
  }

  room.gameState = 'playing';
  const gameSessionId = roomManager.generateGameSessionId();
  room.gameSessionId = gameSessionId;

  // 收集玩家（真实+AI），设置房主标志
  const realPlayers = Array.from(room.players.values()).map(p => ({
    id: p.id,
    color: p.color,
    playerNumber: p.color,  // 玩家编号等于颜色编号（1-4）
    nickname: p.nickname,
    emoji: p.emoji,
    isAI: false,
    isAITakeover: false,
    isHost: p.id === room.host.id  // 设置房主标志
  }));
  const aiPlayers = room.settings.aiPlayers.map(ai => ({
    id: ai.color,
    color: ai.color,
    playerNumber: ai.color,  // 玩家编号等于颜色编号（1-4）
    nickname: ai.nickname,
    emoji: ai.emoji || 'bot',
    isAI: true,
    difficulty: ai.difficulty || 'easy',
    isHost: false  // AI玩家不是房主
  }));
  const allPlayers = [...realPlayers, ...aiPlayers];

  // 创建游戏会话
  const hostPlayer = realPlayers.find(p => p.isHost);
  const gameSession = roomManager.createGameSession(
    gameSessionId,
    allPlayers,
    room.settings.pieceCount,
    room.code,
    hostPlayer ? hostPlayer.id : null,
    room.settings.skillMode
  );

  // 继承房间内的观战者
  if (room.spectators) {
    room.spectators.forEach(s => gameSession.spectators.add(s));
  }

  console.log('游戏会话创建完成，房主:', realPlayers.find(p => p.isHost)?.id);

  // 设置初始当前玩家（颜色最小的玩家）
  const sortedPlayers = allPlayers.sort((a, b) => a.color - b.color);
  const firstPlayer = sortedPlayers[0].color;
  gameSession.gameData.currentPlayer = firstPlayer;
  gameSession.gameData.gamePhase = 'rolling';
  console.log(`游戏开始，设置初始当前玩家: ${firstPlayer}`);

  // 建立连接映射
  realPlayers.forEach(player => {
    roomManager.setPlayerConnection(player.id, roomManager.getPlayerConnection(player.id) || ws);
  });

  // 设置强制加载超时，防止有人掉线导致全部卡在加载页
  setTimeout(() => {
    const currentSession = roomManager.getGameSession(gameSessionId);
    if (currentSession) {
      const realCount = Array.from(currentSession.players.values()).filter(p => !p.isAI).length;
      if (currentSession.audioLoadedPlayers.size < realCount) {
        console.log(`[音频加载] 游戏会话 ${gameSessionId} 强制超时，发送 allAudioLoaded`);
        // 补充所有真实玩家到已加载列表，避免后续重连判定出错
        for (const [pId, p] of currentSession.players) {
          if (!p.isAI) currentSession.audioLoadedPlayers.add(pId);
        }
        currentSession.broadcast({ type: 'allAudioLoaded', gameSessionId });
      }
    }
  }, 15000);

  // 广播游戏开始
  room.broadcast({
    type: 'gameStarted',
    gameSessionId,
    pieceCount: room.settings.pieceCount,
    skillMode: room.settings.skillMode || false, // 添加道具模式配置
    room: room.toJSON()
  });
}

// 添加AI玩家（需要房主权限）
const handleAddAIPlayer = withRoomValidation((ws, playerId, message, room) => {
  const { colorIndex, difficulty } = message.data;
  const usedColors = [...Array.from(room.players.values()).map(p => p.color), ...room.settings.aiPlayers.map(ai => ai.color)];
  if (usedColors.includes(colorIndex)) throw new Error('该颜色已被占用');

  // 生成AI玩家名称（与前端逻辑一致）
  const easyBots = [];
  const hardBots = [];

  // 包含当前要添加的AI玩家
  const allAIPlayers = [...room.settings.aiPlayers, { color: colorIndex, difficulty: difficulty || 'easy' }];

  allAIPlayers.forEach(ai => {
    if (ai.difficulty === 'hard') {
      hardBots.push(ai.color);
    } else {
      easyBots.push(ai.color);
    }
  });

  easyBots.sort((a, b) => a - b);
  hardBots.sort((a, b) => a - b);

  let botName;
  const aiDifficulty = difficulty || 'easy';

  if (aiDifficulty === 'hard') {
    const indexInHard = hardBots.indexOf(colorIndex) + 1;
    botName = `AI-${indexInHard}`;
  } else {
    const indexInEasy = easyBots.indexOf(colorIndex) + 1;
    botName = `Bot-${indexInEasy}`;
  }

  const aiPlayer = {
    color: colorIndex,
    difficulty: aiDifficulty,
    nickname: botName,
    emoji: 'bot'
  };
  room.settings.aiPlayers.push(aiPlayer);

  // 广播AI添加
  room.broadcast({ type: 'aiPlayerAdded', aiPlayer, room: room.toJSON() });
}, true);

// 移除AI玩家（需要房主权限）
const handleRemoveAIPlayer = withRoomValidation((ws, playerId, message, room) => {
  const { colorIndex } = message.data;
  const aiIndex = room.settings.aiPlayers.findIndex(ai => ai.color === colorIndex);
  if (aiIndex === -1) throw new Error('AI玩家不存在');

  room.settings.aiPlayers.splice(aiIndex, 1);
  // 广播AI移除
  room.broadcast({ type: 'aiPlayerRemoved', colorIndex, room: room.toJSON() });
}, true);

// 更新AI难度（需要房主权限）
const handleUpdateAIDifficulty = withRoomValidation((ws, playerId, message, room) => {
  const { colorIndex, difficulty } = message.data;
  const aiPlayer = room.settings.aiPlayers.find(ai => ai.color === colorIndex);
  if (!aiPlayer) throw new Error('AI玩家不存在');

  // 更新难度
  aiPlayer.difficulty = difficulty;

  // 按难度分类所有AI玩家
  const easyBots = [];
  const hardBots = [];

  room.settings.aiPlayers.forEach(ai => {
    if (ai.difficulty === 'hard') {
      hardBots.push(ai.color);
    } else {
      easyBots.push(ai.color);
    }
  });

  // 按颜色排序
  easyBots.sort((a, b) => a - b);
  hardBots.sort((a, b) => a - b);

  // 重新计算所有AI玩家的昵称
  room.settings.aiPlayers.forEach(ai => {
    if (ai.difficulty === 'hard') {
      const indexInHard = hardBots.indexOf(ai.color) + 1;
      ai.nickname = `AI-${indexInHard}`;
    } else {
      const indexInEasy = easyBots.indexOf(ai.color) + 1;
      ai.nickname = `Bot-${indexInEasy}`;
    }
  });

  console.log(`所有AI玩家昵称已更新:`, room.settings.aiPlayers.map(ai => `${ai.nickname}(颜色${ai.color},难度${ai.difficulty})`));

  // 广播难度更新（包含所有AI玩家的最新数据）
  room.broadcast({ type: 'aiDifficultyUpdated', colorIndex, difficulty, room: room.toJSON() });
}, true);

// 掷骰子（使用通用广播目标）
function handleDiceRoll(ws, playerId, message) {
  // 优先获取GameSession
  const gameSession = roomManager.getPlayerGameSession(playerId);
  const target = gameSession || getBroadcastTarget(playerId);

  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  // 更新游戏状态（仅游戏会话）
  if (gameSession && gameSession.gameData) {
    // 防串号：只允许当前回合玩家掷骰。客户端不同步时忽略非法掷骰，避免污染连投计数。
    if (message.player !== undefined && gameSession.gameData.currentPlayer != null && message.player !== gameSession.gameData.currentPlayer) {
      console.warn(`[diceRoll] 忽略非当前玩家掷骰: msg.player=${message.player}, currentPlayer=${gameSession.gameData.currentPlayer}, playerId=${playerId}`);
      return;
    }

    gameSession.gameData.diceValue = message.diceValue;
    gameSession.gameData.gamePhase = 'moving';
    
    // 首个操作后，标记游戏正式开始
    if (!gameSession.gameData.gameOfficiallyStarted) {
      gameSession.gameData.gameOfficiallyStarted = true;
      console.log(`[diceRoll] 首发玩家 ${message.player} 已操作，游戏正式开始`);
    }

    // 处理连投奖励逻辑
    if (message.diceValue === 6) {
      gameSession.gameData.consecutiveSixes = (gameSession.gameData.consecutiveSixes || 0) + 1;
      console.log(`玩家连续骰到${gameSession.gameData.consecutiveSixes}次6`);

      // 检查是否连续骰到3次6
      if (gameSession.gameData.consecutiveSixes >= 3) {
        console.log('连续骰到3次6，所有棋子返回起点！');
        gameSession.gameData.canReroll = false;
        gameSession.gameData.justRolledSix = false;
        // 重置连续6的计数
        gameSession.gameData.consecutiveSixes = 0;

        // 广播三次6惩罚消息
        gameSession.broadcast({
          type: 'threeSixesPenalty',
          player: message.player,
          timestamp: Date.now()
        });

        // 延迟切换到下一个玩家
        setTimeout(() => {
          // 获取所有在线玩家
          const onlinePlayers = Array.from(gameSession.players.values())
            .map(p => p.color)
            .sort((a, b) => a - b);

          console.log(`在线玩家列表: [${onlinePlayers.join(', ')}]`);

          if (onlinePlayers.length > 0) {
            // 找到当前玩家在列表中的索引
            let currentIndex = onlinePlayers.indexOf(message.player);

            // 如果当前玩家不在在线列表中（已断线），从第一个在线玩家开始
            if (currentIndex === -1) {
              currentIndex = -1; // 下一个索引将是0
            }

            // 计算下一个玩家
            const nextIndex = (currentIndex + 1) % onlinePlayers.length;
            const nextPlayer = onlinePlayers[nextIndex];

            console.log(`切换到玩家${nextPlayer}，重置游戏阶段为rolling`);

            // 更新游戏状态
            gameSession.gameData.currentPlayer = nextPlayer;
            gameSession.gameData.gamePhase = 'rolling';
            gameSession.gameData.diceValue = 0;
            gameSession.gameData.canReroll = false;
            gameSession.gameData.justRolledSix = false;
            gameSession.gameData.consecutiveSixes = 0;

            // 广播玩家切换消息
            gameSession.broadcast({
              type: 'playerTurnChange',
              newPlayer: nextPlayer,
              gamePhase: 'rolling',
              reason: 'player_disconnected',
              timestamp: Date.now()
            });

            console.log(`回合切换完成：玩家${nextPlayer}，阶段：rolling`);
          } else {
            console.log(`[警告] 没有在线玩家，无法切换`);
          }
        }, 1000);
      } else {
        // 骰到6但未达到3次，可以重新投骰
        gameSession.gameData.canReroll = true;
        gameSession.gameData.justRolledSix = true;
      }
    } else {
      // 没有骰到6，重置连续6的计数
      gameSession.gameData.consecutiveSixes = 0;
      gameSession.gameData.canReroll = false;
      gameSession.gameData.justRolledSix = false;
    }

    console.log(`更新游戏状态: 骰子值=${message.diceValue}, canReroll=${gameSession.gameData.canReroll}, consecutiveSixes=${gameSession.gameData.consecutiveSixes}`);
  }

  // 广播结果（保留player字段用于显示正确的玩家昵称）
  target.broadcast({
    type: 'diceRoll',
    playerId,
    player: message.player, // 传递玩家编号，确保显示正确的昵称
    diceValue: message.diceValue,
    consecutiveSixes: gameSession?.gameData?.consecutiveSixes || 0, //同步计数状态，避免前端重复计数
    canReroll: gameSession?.gameData?.canReroll || false, //同步是否可以重投的状态
    justRolledSix: gameSession?.gameData?.justRolledSix || false, //同步是否刚投出6的状态
    timestamp: message.timestamp
  });
}

// 骰子动画开始（使用通用广播目标）
// 处理遥控骰子的骰子显示同步
function handleDiceDisplay(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'diceDisplay',
    playerId,
    diceValue: message.diceValue,
    timestamp: message.timestamp
  });
}

// 处理传送门图标显示同步
function handleTeleportIcon(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'teleportIcon',
    playerId,
    show: message.show,
    timestamp: message.timestamp
  });
}

// 处理多面骰子显示同步
function handlePolyhedralDice(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'polyhedralDice',
    playerId,
    diceValue: message.diceValue,
    timestamp: message.timestamp
  });
}

// 处理盲盒图标显示同步
function handleMysteryBoxIcon(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'mysteryBoxIcon',
    playerId,
    energyGain: message.energyGain,
    playerNumber: message.playerNumber,
    timestamp: message.timestamp
  });
}

// 处理移除盲盒图标同步
function handleRemoveMysteryBoxIcon(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'removeMysteryBoxIcon',
    playerId,
    timestamp: message.timestamp
  });
}

// 处理积分获得数值动画同步
function handleEnergyGainAnimation(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'energyGainAnimation',
    playerId,
    energyGain: message.energyGain,
    timestamp: message.timestamp
  });
}

function handleDiceAnimationStart(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'diceAnimationStart',
    playerId: message.triggerPlayerId || playerId,
    timestamp: message.timestamp
  });
}

// 进度条开始（使用通用广播目标）
function handleProgressBarStart(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  // 保存思考开始时间到游戏数据（用于重连恢复）
  const gameSession = roomManager.getPlayerGameSession(playerId);
  if (gameSession && gameSession.gameData) {
    gameSession.gameData.thinkingStartTime = message.timestamp || Date.now();
    console.log(`[进度条] 保存思考开始时间: ${gameSession.gameData.thinkingStartTime}`);
  }

  target.broadcast({
    type: 'progressBarStart',
    playerId,
    timestamp: message.timestamp
  });
}

// 骰子重置（使用通用广播目标）
function handleDiceReset(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'diceReset',
    playerId,
    timestamp: message.timestamp
  });
}

function handleRejoinRoom(ws, playerId, message) {
  const roomCode = message.data?.roomCode || message.roomCode;
  const isReady = message.data?.isReady ?? message.isReady;

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
    return;
  }

  // 检查玩家是否在房间中，如果不在但在游戏会话中，执行自动恢复
  let player = room.players.get(playerId);
  if (!player) {
    const gameSession = roomManager.getPlayerGameSession(playerId);
    if (gameSession && gameSession.roomCode === roomCode && gameSession.players.has(playerId)) {
      console.log(`玩家 ${playerId} 正在重回房间 ${roomCode} (通过 rejoinRoom 从会话恢复)`);
      const sessionPlayer = gameSession.players.get(playerId);
      player = new Player(playerId, ws, sessionPlayer.nickname, sessionPlayer.emoji);
      player.color = sessionPlayer.color;
      player.isHost = sessionPlayer.isHost;

      room.players.set(playerId, player);
      roomManager.playerRooms.set(playerId, roomCode);
    } else {
      ws.send(JSON.stringify({ type: 'error', message: '您不在该房间中' }));
      return;
    }
  }

  // 清除断开连接定时器（如果有）
  if (roomManager.disconnectTimers.has(playerId)) {
    clearTimeout(roomManager.disconnectTimers.get(playerId));
    roomManager.disconnectTimers.delete(playerId);
    console.log(`玩家 ${playerId} 重连，清除断开定时器`);
  }

  // 恢复玩家在线状态
  const wasDisconnected = !player.isConnected;
  player.isConnected = true;
  player.ws = ws;
  player.disconnectedAt = null;

  // 重新关联房间
  roomManager.playerRooms.set(playerId, roomCode);
  roomManager.setPlayerConnection(playerId, ws);

  // 更新准备状态（如果客户端提供了）
  if (typeof isReady === 'boolean') {
    room.playerReadyStatus.set(playerId, isReady);
  }

  // 发送重连成功消息给当前玩家
  ws.send(JSON.stringify({
    type: 'roomRejoined',
    playerId,
    roomCode,
    room: room.toJSON()
  }));

  // 如果之前是离线状态，广播重连消息给房间内其他玩家
  if (wasDisconnected) {
    console.log(`玩家 ${playerId} 重连成功，广播给房间内其他玩家`);
    room.broadcast({
      type: 'playerReconnected',
      playerId,
      room: room.toJSON()
    }, playerId); // 排除当前玩家

    // 广播“回来了”系统消息
    room.broadcast({
      type: 'chatMessage',
      message: `${player.nickname}回来了`,
      playerNumber: null,
      playerName: null,
      isSystemMessage: true,
      timestamp: Date.now()
    }, playerId);
  }
}

function handleRejoinGameSession(ws, playerId, message) {
  const gameSessionId = message.gameSessionId;
  const gameSession = roomManager.getGameSession(gameSessionId);
  if (!gameSession) {
    ws.send(JSON.stringify({ type: 'error', message: '游戏会话不存在' }));
    return;
  }

  if (!gameSession.players.has(playerId)) {
    ws.send(JSON.stringify({ type: 'error', message: '您不在该游戏会话中' }));
    return;
  }

  // 重新关联会话
  roomManager.playerSessions.set(playerId, gameSessionId);
  roomManager.setPlayerConnection(playerId, ws);

  const player = gameSession.players.get(playerId);
  let wasDisconnected = false;
  let disconnectDuration = 0;

  if (player) {
    // 在发送 gameSessionConnected 之前先恢复状态
    // 这样 toJSON() 返回的数据中 isConnected 就是正确的 true，解决“加载不出数据”的问题
    wasDisconnected = !player.isConnected || !!player.disconnectedAt;
    disconnectDuration = player.disconnectedAt ? Date.now() - player.disconnectedAt : 0;

    player.isConnected = true;
    player.ws = ws;
    player.disconnectedAt = null;

    // 同步更新房间引用
    if (gameSession.roomCode) {
      const room = roomManager.getRoom(gameSession.roomCode);
      if (room) {
        const roomPlayer = room.players.get(playerId);
        if (roomPlayer) {
          roomPlayer.isConnected = true;
          roomPlayer.ws = ws;
          delete roomPlayer.disconnectedAt;
        }
        room.checkEmptyRoom();
      }
    }
  }

  // 更新其他玩家的连接状态（仅连接状态，不要修改音频加载状态）
  // 音频加载状态必须只由客户端显式发送 audioLoaded 来驱动，否则会导致 allAudioLoaded 被提前广播。
  gameSession.players.forEach((p, id) => {
    if (id !== playerId) {
      const otherWs = roomManager.getPlayerConnection(id);
      if (otherWs?.readyState === WebSocket.OPEN) {
        // 同时更新其他玩家的isConnected状态
        if (!p.isAI && !p.isConnected) {
          p.isConnected = true;
          console.log(`[重连] 更新玩家${id}的isConnected状态为true`);
        }
      }
    }
  });

  // 发送重连确认
  console.log(`[重连] 发送gameSessionConnected给玩家${playerId}，currentPlayer=${gameSession.gameData.currentPlayer}`);
  ws.send(JSON.stringify({
    type: 'gameSessionConnected',
    playerId,
    gameSessionId,
    gameSession: gameSession.toJSON(),
    audioLoadedPlayers: Array.from(gameSession.audioLoadedPlayers) // 同步已加载玩家列表
  }));

  // 如果所有人（包括重连者之前记录的状态）都已经加载完音频，
  // 补发一个 allAudioLoaded 信号给重连玩家，确保其 UI 能正常关闭
  const realPlayerCount = Array.from(gameSession.players.values()).filter(p => !p.isAI).length;
  console.log(`[重连] 检查音频加载状态: ${gameSession.audioLoadedPlayers.size}/${realPlayerCount}`);
  if (gameSession.audioLoadedPlayers.size === realPlayerCount) {
    console.log(`[重连] 所有玩家已加载，补发 allAudioLoaded 给玩家 ${playerId}`);
    ws.send(JSON.stringify({
      type: 'allAudioLoaded',
      gameSessionId: gameSession.gameSessionId,
      isResync: true
    }));
  }

  // 广播重连
  console.log(`[重连] 玩家${playerId}重连成功，广播playerReconnected给其他玩家`);

  for (const [otherPlayerId] of gameSession.players) {
    if (otherPlayerId === playerId) continue;
    const otherWs = roomManager.getPlayerConnection(otherPlayerId);
    if (otherWs && otherWs.readyState === WebSocket.OPEN) {
      otherWs.send(JSON.stringify({
        type: 'playerReconnected',
        playerId,
        gameSession: gameSession.toJSON()
      }));
    }
  }

  // 如果重连的玩家是当前玩家，重置进度条并广播给所有玩家
  // 但如果游戏处于暂停状态，就不应该重置和广播进度条
  if (wasDisconnected && gameSession.gameData && player && player.color === gameSession.gameData.currentPlayer && !gameSession.gameData.isPaused) {
    const newThinkingStartTime = Date.now();
    gameSession.gameData.thinkingStartTime = newThinkingStartTime;
    console.log(`[重连] 当前玩家${player.color}重连，重置进度条时间: ${newThinkingStartTime}`);

    // 广播进度条重置消息给所有玩家
    gameSession.broadcast({
      type: 'progressBarReset',
      playerId,
      playerColor: player.color,
      thinkingStartTime: newThinkingStartTime,
      timestamp: Date.now()
    });
  }

  // 发送重连消息
  if (wasDisconnected && player) {
    console.log(`[重连] 玩家${playerId}断开时长${disconnectDuration}ms，广播“回来了”系统消息`);

    for (const [otherPlayerId] of gameSession.players) {
      if (otherPlayerId === playerId) continue;
      const otherWs = roomManager.getPlayerConnection(otherPlayerId);
      if (otherWs && otherWs.readyState === WebSocket.OPEN) {
        otherWs.send(JSON.stringify({
          type: 'chatMessage',
          message: `${player.nickname}回来了`,
          playerNumber: null,
          playerName: null,
          isSystemMessage: true,
          timestamp: Date.now()
        }));
      }
    }
  }

  // 检查当前房主是否在线，如果不在线且当前重连的是真实玩家，则接管房主
  // 仅在游戏稳定期（开始15秒后）才允许重连者主动接管，防止开局加载时的竞争
  const timeSinceStart = Date.now() - (gameSession.createdAt || 0);
  if (timeSinceStart >= 15000 && player && !player.isAI) {
    const currentHost = Array.from(gameSession.players.values()).find(p => p.isHost);
    
    // 如果重连的人自己就是房主，并且他成功连上了，那他理所当然保留房主，无需接管逻辑
    if (currentHost && currentHost.id === playerId) {
      console.log(`[重连] 房主 ${playerId} 成功归来，继续担任房主`);
    } else {
      const hostWs = currentHost ? roomManager.getPlayerConnection(currentHost.id) : null;
      const isHostOnline = currentHost && currentHost.isConnected && hostWs && hostWs.readyState === 1;

      if (!isHostOnline) {
        console.log(`[重连] 房主 ${currentHost ? currentHost.id : '无'} 不在线，玩家 ${playerId} 接管房主`);
        
        for (const [pId, p] of gameSession.players) {
          if (p) p.isHost = (pId === playerId);
        }
        gameSession.hostId = playerId;

        if (gameSession.roomCode) {
          const room = roomManager.getRoom(gameSession.roomCode);
          if (room) {
            const roomNewHost = room.players.get(playerId);
            if (roomNewHost) {
              room.host = roomNewHost;
              for (const p of room.players.values()) {
                if (p) p.isHost = (p.id === playerId);
              }
            }
          }
        }

        gameSession.broadcast({
          type: 'hostChanged',
          oldHostId: currentHost ? currentHost.id : null,
          newHostId: playerId,
          newHostNickname: player.nickname,
          gameSession: gameSession.toJSON(),
          timestamp: Date.now()
        });
      }
    }
  }
}

function handleRoomPanelMessage(ws, playerId, message) {
  const roomCode = roomManager.playerRooms.get(playerId);
  if (!roomCode) throw new Error('玩家不在任何房间中');

  const room = roomManager.getRoom(roomCode);
  if (!room) throw new Error('房间不存在');

  room.broadcast({
    type: 'roomPanelMessage',
    playerId,
    message: sanitizeText(message.data?.message || message.message),
    timestamp: Date.now()
  });
}

// 配置棋子数量（需要房主权限）
const handleConfigurePieceCount = withRoomValidation((ws, playerId, message, room) => {
  const { pieceCount } = message.data;
  if (![1, 2, 3, 4].includes(pieceCount)) throw new Error('无效的棋子数量');

  room.settings.pieceCount = pieceCount;
  // 广播配置结果
  room.broadcast({ type: 'pieceCountConfigured', pieceCount, room: room.toJSON() });
}, true);

// 玩家回合切换（使用通用广播目标）
function handlePlayerTurnChange(ws, playerId, message) {
  let newPlayer = message.newPlayer ?? (message.data?.newPlayer ?? undefined);
  const timestamp = message.timestamp ?? (message.data?.timestamp ?? Date.now());
  const forceEndTurn = !!(message.forceEndTurn ?? message.data?.forceEndTurn);
  const reason = message.reason ?? message.data?.reason;
  if (newPlayer === undefined) throw new Error('缺少newPlayer属性');

  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  // 更新游戏状态（仅游戏会话）
  if (target instanceof GameSession && target.gameData) {
    // 检查是否有连投奖励
    if (!forceEndTurn && target.gameData.canReroll && target.gameData.justRolledSix) {
      // 如果有连投奖励，保持当前玩家不变
      console.log(`玩家${target.gameData.currentPlayer}骰到6点，获得连投奖励，保持回合`);
      target.gameData.gamePhase = 'rolling';
      target.gameData.diceValue = 0;
      target.gameData.justRolledSix = false; // 重置justRolledSix状态
    } else {
      // 正常切换到下一个玩家（不跳过离线玩家，由AI托管处理）
      target.gameData.currentPlayer = newPlayer;
      target.gameData.gamePhase = 'rolling';
      target.gameData.diceValue = 0;
      // 重置连投奖励状态
      target.gameData.canReroll = false;
      target.gameData.justRolledSix = false;
      // 关键：回合交接时必须清空连6计数，避免串到下一个玩家（例如道具结束回合直接切人）
      target.gameData.consecutiveSixes = 0;
      console.log(`更新游戏状态: 当前玩家=${newPlayer}${forceEndTurn ? `, forceEndTurn=true, reason=${reason}` : ''}`);
    }
  }

  // 广播回合切换
  target.broadcast({ type: 'playerTurnChange', newPlayer, timestamp });
}

// 处理无法移动状态同步
function handleNoMovableChess(ws, playerId, message) {
  const player = message.player ?? (message.data?.player ?? undefined);
  const diceValue = message.diceValue ?? (message.data?.diceValue ?? undefined);
  const timestamp = message.timestamp ?? (message.data?.timestamp ?? Date.now());

  if (player === undefined) throw new Error('缺少player属性');
  if (diceValue === undefined) throw new Error('缺少diceValue属性');

  // 优先获取GameSession（确保使用正确的玩家列表）
  const gameSession = roomManager.getPlayerGameSession(playerId);
  const target = gameSession || getBroadcastTarget(playerId);

  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  console.log(`玩家${player}无法移动，骰子点数${diceValue}, target类型: ${gameSession ? 'GameSession' : 'Room'}`);


  // 广播无法移动消息
  target.broadcast({ type: 'noMovableChess', player, diceValue, timestamp, playerId });

  // 只有GameSession才有完整的玩家列表（包括AI bot）
  if (gameSession && gameSession.gameData) {
    // 获取所有在线玩家的color列表并排序（包括AI和在线的人类玩家）
    const allPlayers = Array.from(gameSession.players.values());
    console.log(`[调试] 所有玩家:`, allPlayers.map(p => ({ id: p.id, color: p.color, isAI: p.isAI, isConnected: p.isConnected })));

    const onlinePlayers = allPlayers
      .map(p => p.color)
      .sort((a, b) => a - b);

    console.log(`玩家${player}无法移动，在线玩家列表: [${onlinePlayers.join(', ')}]`);

    // 如果没有在线玩家，不切换
    if (onlinePlayers.length === 0) {
      console.log(`[警告] 没有在线玩家，无法切换`);
      return;
    }

    // 找到当前玩家在列表中的索引
    let currentIndex = onlinePlayers.indexOf(player);

    // 如果当前玩家不在在线列表中（已断线），从第一个在线玩家开始
    if (currentIndex === -1) {
      console.log(`当前玩家${player}已离线，从第一个在线玩家开始`);
      currentIndex = -1; // 下一个索引将是0
    }

    // 计算下一个玩家（循环到列表中的下一个）
    const nextIndex = (currentIndex + 1) % onlinePlayers.length;
    const nextPlayer = onlinePlayers[nextIndex];

    console.log(`玩家${player}无法移动，自动切换到玩家${nextPlayer}`);

    // 更新游戏状态
    gameSession.gameData.currentPlayer = nextPlayer;
    gameSession.gameData.gamePhase = 'rolling';
    gameSession.gameData.diceValue = 0;
    gameSession.gameData.canReroll = false;
    gameSession.gameData.justRolledSix = false;
    gameSession.gameData.consecutiveSixes = 0;

    // 延迟广播玩家切换消息，等待骰子震动动画结束（0.5秒）
    setTimeout(() => {
      console.log(`[延迟广播] 发送playerTurnChange消息，newPlayer=${nextPlayer}`);
      gameSession.broadcast({
        type: 'playerTurnChange',
        newPlayer: nextPlayer,
        timestamp: Date.now()
      });
      console.log(`[延迟广播] playerTurnChange消息已发送`);
    }, 600);
  } else {
    console.log(`[警告] 无法自动切换玩家: 没有GameSession或gameData`);
  }
}

// 棋子移动（使用游戏会话中间件）
const handlePieceMove = withGameSessionValidation((ws, playerId, message, gameSession) => {
  const { pieceId, fromPosition, toPosition, timestamp } = message;
  // 解析玩家颜色和棋子索引
  const playerColor = Math.floor(pieceId / 4) + 1;
  const chessIndex = pieceId % 4;

  // 更新棋子状态
  if (gameSession.gameData.playerChess[playerColor]?.[chessIndex]) {
    gameSession.gameData.playerChess[playerColor][chessIndex].position = toPosition;
    // 终点/起点状态更新
    if (toPosition === 56) {
      gameSession.gameData.playerChess[playerColor][chessIndex].finished = true;
    } else if (toPosition === -1) {
      gameSession.gameData.playerChess[playerColor][chessIndex].finished = false;
    }
    console.log(`更新棋子状态: 玩家${playerColor}棋子${chessIndex} 从${fromPosition}到${toPosition}`);
  }

  // 广播移动结果
  gameSession.broadcast({
    type: 'pieceMove',
    playerId,
    fromPosition,
    toPosition,
    pieceId,
    timestamp
  });
});

// AI托管切换（使用通用广播目标）
function handleAITakeoverChange(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  // 这里的 message.playerId 才是被托管的玩家ID，playerId 是发送请求的玩家ID（通常是房主代理发送的）
  const targetPlayerId = message.playerId || playerId;

  // 更新服务器端的玩家AI托管状态
  if (target.players && target.players.has(targetPlayerId)) {
    const player = target.players.get(targetPlayerId);
    player.isAITakeover = message.isActive;
    console.log(`更新玩家 ${targetPlayerId} 的AI托管状态: ${message.isActive}`);
  }

  target.broadcast({
    type: 'aiTakeoverChange',
    playerId: targetPlayerId,
    isActive: message.isActive,
    auto: message.auto,
    reason: message.reason,
    timestamp: message.timestamp
  });

  // 冗余消息清理：如果是因为思考超时自动开启的托管，广播一条统一格式的系统消息
  if (message.isActive && message.auto && message.reason === 'thinking_timeout') {
    const player = target.players?.get(targetPlayerId);
    if (player) {
      target.broadcast({
        type: 'chatMessage',
        message: `${player.nickname} 思考时间到，开启AI托管`,
        playerNumber: null,
        playerName: null,
        isSystemMessage: true,
        timestamp: Date.now()
      });
    }
  }
}

// 昵称切换（使用通用广播目标）
function handleNicknameChange(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  // 支持代理修改昵称
  const targetPlayerId = message.playerId || playerId;
  const manualInput = message.data?.manualInput === true || message.manualInput === true;
  const rawNickname = message.nickname == null ? '' : String(message.nickname);
  const nextNickname = manualInput ? sanitizeText(rawNickname) : rawNickname;

  target.broadcast({
    type: 'nicknameChange',
    playerId: targetPlayerId,
    nickname: nextNickname,
    timestamp: message.timestamp
  });
}

// 棋子移动（游戏内）
const handleChessMove = withGameSessionValidation((ws, playerId, message, gameSession) => {
  const { player, chessIndex, position, timestamp } = message;
  // 更新棋子状态
  if (gameSession.gameData.playerChess[player]?.[chessIndex]) {
    gameSession.gameData.playerChess[player][chessIndex].position = position;
    if (position === 56) {
      gameSession.gameData.playerChess[player][chessIndex].finished = true;
    }
    console.log(`更新棋子状态: 玩家${player}棋子${chessIndex} 到${position}`);
  }

  // 广播移动结果
  gameSession.broadcast({
    type: 'chessMove',
    playerId,
    player,
    chessIndex,
    position,
    gameSessionId: gameSession.gameSessionId,
    timestamp
  });
});

// 跳子动画（使用通用广播目标）
function handleJumpAnimation(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'jumpAnimation',
    playerId,
    player: message.player,
    chessIndex: message.chessIndex,
    startPosition: message.startPosition,
    targetPosition: message.targetPosition,
    timestamp: message.timestamp
  });
}

// 飞棋动画（使用通用广播目标）
function handleFlyAnimation(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'flyAnimation',
    playerId,
    player: message.player,
    chessIndex: message.chessIndex,
    startPosition: message.startPosition,
    targetPosition: message.targetPosition,
    timestamp: message.timestamp
  });
}

// 游戏信息同步（使用通用广播目标，避免回显给发送者）
function handleGameInfo(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  const broadcastMsg = JSON.stringify({
    type: 'gameInfo',
    playerId,
    messageData: message.messageData,
    timestamp: message.timestamp
  });

  // 广播给其他玩家，但不包括发送者自己（避免重复显示）
  if (target instanceof GameSession) {
    target.players.forEach(player => {
      // 跳过发送者自己
      if (player.id === playerId) return;

      const playerWs = roomManager.getPlayerConnection(player.id);
      if (playerWs && playerWs.readyState === WebSocket.OPEN) {
        playerWs.send(broadcastMsg);
      }
    });
    // 广播给观战者
    if (target.spectators) {
      target.spectators.forEach(spectatorId => {
        const spectatorWs = roomManager.getPlayerConnection(spectatorId);
        if (spectatorWs && spectatorWs.readyState === WebSocket.OPEN) {
          spectatorWs.send(broadcastMsg);
        }
      });
    }
  } else if (target instanceof Room) {
    target.players.forEach(player => {
      // 跳过发送者自己
      if (player.id === playerId) return;

      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(broadcastMsg);
      }
    });
    // 广播给观战者
    if (target.spectators) {
      target.spectators.forEach(spectatorId => {
        const spectatorWs = roomManager.getPlayerConnection(spectatorId);
        if (spectatorWs && spectatorWs.readyState === WebSocket.OPEN) {
          spectatorWs.send(broadcastMsg);
        }
      });
    }
  }
}

// 游戏暂停（使用通用广播目标）
function handleGamePause(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  if (target instanceof GameSession && target.gameData) {
    target.gameData.isPaused = true;
    target.gameData.gamePhaseBeforePause = target.gameData.gamePhase;
    target.gameData.gamePhase = 'paused';
  }

  target.broadcast({
    type: 'gamePaused',
    playerId,
    timestamp: message.timestamp
  });
}

// 游戏继续（使用通用广播目标）
function handleGameResume(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  if (target instanceof GameSession && target.gameData) {
    target.gameData.isPaused = false;
    if (target.gameData.gamePhase === 'paused') {
      target.gameData.gamePhase = target.gameData.gamePhaseBeforePause || 'rolling';
    }
  }

  target.broadcast({
    type: 'gameResumed',
    playerId,
    timestamp: message.timestamp
  });
}

// 棋子回归起点（使用游戏会话中间件）
const handleMoveChessToStart = withGameSessionValidation((ws, playerId, message, gameSession) => {
  const { player, chessIndex, reason, timestamp } = message;
  // 更新棋子状态
  if (gameSession.gameData.playerChess[player]?.[chessIndex]) {
    gameSession.gameData.playerChess[player][chessIndex].position = -1;
    gameSession.gameData.playerChess[player][chessIndex].finished = false;
    console.log(`更新棋子状态: 玩家${player}棋子${chessIndex} 回归起点`);
  }

  // 广播结果
  gameSession.broadcast({
    type: 'moveChessToStart',
    playerId,
    player,
    chessIndex,
    reason,
    timestamp
  });
});

// 棋子到达终点（使用游戏会话中间件）
const handleMoveChessToFinish = withGameSessionValidation((ws, playerId, message, gameSession) => {
  const { player, chessIndex, timestamp } = message;
  // 更新棋子状态
  if (gameSession.gameData.playerChess[player]?.[chessIndex]) {
    gameSession.gameData.playerChess[player][chessIndex].position = 56;
    gameSession.gameData.playerChess[player][chessIndex].finished = true;
    console.log(`更新棋子状态: 玩家${player}棋子${chessIndex} 到达终点`);
  }

  // 广播结果
  gameSession.broadcast({
    type: 'moveChessToFinish',
    playerId,
    player,
    chessIndex,
    timestamp
  });
});

// 叠子碰撞（使用通用广播目标）
function handleStackCollision(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'stackCollision',
    playerId,
    player: message.player,
    targetPlayer: message.targetPlayer,
    stackedChesses: message.stackedChesses,
    collisionPosition: message.collisionPosition,
    timestamp: message.timestamp
  });
}

// 叠子反弹（使用通用广播目标）
function handleStackBounce(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'stackBounce',
    playerId,
    player: message.player,
    chessIndex: message.chessIndex,
    startPosition: message.startPosition,
    endPosition: message.endPosition,
    bounceSteps: message.bounceSteps,
    timestamp: message.timestamp
  });
}

// 终点反弹（使用通用广播目标）
function handleEndpointBounce(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  target.broadcast({
    type: 'endpointBounce',
    playerId,
    player: message.player,
    chessIndex: message.chessIndex,
    startPosition: message.startPosition,
    endPosition: message.endPosition,
    bounceSteps: message.bounceSteps,
    timestamp: message.timestamp
  });
}

/**
 * 处理积分变化（道具模式）
 */
function handleEnergyChange(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  const player = message.player;
  const energy = message.energy;
  const delta = message.delta || 0;

  if (player === undefined) throw new Error('缺少player属性');
  if (energy === undefined) throw new Error('缺少energy属性');

  console.log(`[积分同步] 玩家${player}积分变化: ${energy} (${delta > 0 ? '+' : ''}${delta})`);

  // 如果是游戏会话，更新gameData中的积分状态
  const gameSession = roomManager.getPlayerGameSession(playerId);
  if (gameSession && gameSession.gameData && gameSession.gameData.energyStates) {
    gameSession.gameData.energyStates[player] = energy;
    console.log(`[积分状态] 已保存玩家${player}的积分: ${energy}`);
  }

  // 广播积分变化消息
  target.broadcast({
    type: 'energyChange',
    playerId,
    player,
    energy,
    delta,
    source: message.source,
    targetPlayer: message.targetPlayer,
    targetChessIndex: message.targetChessIndex,
    timestamp: message.timestamp || Date.now()
  });
}

/**
 * 处理击败计数变化
 */
function handleDefeatCountChange(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  const attackerPlayer = message.attackerPlayer;
  const defeatedPlayer = message.defeatedPlayer;
  const count = message.count;

  if (attackerPlayer === undefined) throw new Error('缺少attackerPlayer属性');
  if (defeatedPlayer === undefined) throw new Error('缺少defeatedPlayer属性');
  if (count === undefined) throw new Error('缺少count属性');

  console.log(`[击败计数同步] 玩家${attackerPlayer}击败玩家${defeatedPlayer}，计数: ${count}`);

  // 如果是游戏会话，更新gameData中的击败计数
  const gameSession = roomManager.getPlayerGameSession(playerId);
  if (gameSession && gameSession.gameData && gameSession.gameData.defeatCounts) {
    if (!gameSession.gameData.defeatCounts[attackerPlayer]) {
      gameSession.gameData.defeatCounts[attackerPlayer] = {};
    }
    gameSession.gameData.defeatCounts[attackerPlayer][defeatedPlayer] = count;
    console.log(`[击败计数状态] 已保存玩家${attackerPlayer}对玩家${defeatedPlayer}的击败计数: ${count}`);
  }

  // 广播击败计数变化消息
  target.broadcast({
    type: 'defeatCountChange',
    playerId,
    attackerPlayer,
    defeatedPlayer,
    count,
    timestamp: message.timestamp || Date.now()
  });
}

/**
 * 处理骰子统计数据同步
 */
function handleDiceStatisticsSync(ws, playerId, message) {
  const gameSession = roomManager.getPlayerGameSession(playerId);
  if (!gameSession) {
    console.log(`[骰子统计同步] 玩家${playerId}不在游戏会话中，忽略`);
    return;
  }

  const { player, diceValue, count } = message;

  if (player === undefined || diceValue === undefined || count === undefined) {
    console.log(`[骰子统计同步] 缺少必要参数: player=${player}, diceValue=${diceValue}, count=${count}`);
    return;
  }

  // 更新服务器端的骰子统计数据
  if (!gameSession.gameData.diceStatistics[player]) {
    gameSession.gameData.diceStatistics[player] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  }
  gameSession.gameData.diceStatistics[player][diceValue] = count;

  console.log(`[骰子统计同步] 玩家${player}骰子${diceValue}点计数更新为${count}`);
}

/**
 * 处理完成度历史记录同步
 */
function handleProgressHistorySync(ws, playerId, message) {
  const gameSession = roomManager.getPlayerGameSession(playerId);
  if (!gameSession) {
    console.log(`[完成度历史同步] 玩家${playerId}不在游戏会话中，忽略`);
    return;
  }

  const { snapshot, currentRound } = message;

  if (!snapshot) {
    console.log(`[完成度历史同步] 缺少snapshot参数`);
    return;
  }

  // 检查是否已经存在相同回合的快照（防止重复记录）
  const existingIndex = gameSession.gameData.progressHistory.findIndex(s => s.round === snapshot.round);
  if (existingIndex !== -1) {
    console.log(`[完成度历史同步] 回合${snapshot.round}的快照已存在，跳过重复记录`);
    return;
  }

  // 更新服务器端的完成度历史记录
  gameSession.gameData.progressHistory.push(snapshot);

  // 限制历史记录数量，防止内存溢出（与前端保持一致，最多500条）
  if (gameSession.gameData.progressHistory.length > 500) {
    gameSession.gameData.progressHistory.shift();
  }

  // 更新当前回合数
  if (currentRound !== undefined) {
    gameSession.gameData.currentRound = currentRound;
  }

  console.log(`[完成度历史同步] 保存第${currentRound}回合快照，总计${gameSession.gameData.progressHistory.length}条`);
}

// 游戏结束（使用通用广播目标）
function handleGameEnd(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  // 重要：先广播，再清理会话映射。
  // 否则 removeGameSession 会清空 playerSessions，导致 GameSession.broadcast 由于映射校验而不发送给任何人。
  try {
    if (target && target.players && typeof target.players.forEach === 'function') {
      const connectionSnapshot = [];
      target.players.forEach(p => {
        const conn = roomManager.getPlayerConnection(p.id);
        connectionSnapshot.push({
          playerId: p.id,
          isAI: !!p.isAI,
          wsOpen: !!(conn && conn.readyState === WebSocket.OPEN)
        });
      });
      console.log(`[gameEnd] broadcast snapshot:`, connectionSnapshot);
    }
  } catch (e) {
    // ignore
  }
  target.broadcast({
    type: 'gameEnd',
    playerId,
    winnerPlayer: message.winnerPlayer,
    gameStartTime: target && target.gameData ? target.gameData.gameStartTime : undefined,
    progressHistory: target && target.gameData ? target.gameData.progressHistory : undefined,
    currentRound: target && target.gameData ? target.gameData.currentRound : undefined,
    timestamp: message.timestamp
  });

  // 获取房间并将状态改为已结算
  const room = roomManager.getPlayerRoom(playerId);
  if (room && room.gameState === 'playing') {
    console.log(`房间 ${room.code} 游戏正常结束，状态改为 finished`);
    room.gameState = 'finished';

    // 删除游戏会话
    if (room.gameSessionId) {
      roomManager.removeGameSession(room.gameSessionId);
      room.gameSessionId = null;
    }

    // 清理已掉线玩家，避免游戏结束后留下僵尸玩家/僵尸房间
    try {
      const offlinePlayerIds = [];
      for (const [pid, p] of room.players) {
        if (p && p.isConnected === false) {
          offlinePlayerIds.push(pid);
        }
      }

      if (offlinePlayerIds.length > 0) {
        console.log(`房间 ${room.code} 游戏结束后清理已掉线玩家:`, offlinePlayerIds);
        for (const offlineId of offlinePlayerIds) {
          room.removePlayer(offlineId);
          roomManager.playerRooms.delete(offlineId);
        }

        // 广播一次最新房间状态（仍在线的玩家需要看到头像/人数更新）
        if (room.players.size > 0) {
          room.broadcast({ type: 'roomUpdated', room: room.toJSON() });
        }
      }
    } catch (e) {
      console.error('游戏结束后清理离线玩家时出错:', e);
    }

    // 如果房间已空（所有玩家已离线），立即进入清理队列
    if (room.players.size === 0) {
      console.log(`房间 ${room.code} 游戏结束且无玩家，加入清理队列`);
      roomManager.scheduleRoomDestroy(room.code);
    }
  }
}

// 强制结算（使用通用广播目标）
function handleForceSettlement(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  // 重要：先广播，再清理会话映射。
  // 否则 removeGameSession 会清空 playerSessions，导致 GameSession.broadcast 由于映射校验而不发送给任何人。
  try {
    if (target && target.players && typeof target.players.forEach === 'function') {
      const connectionSnapshot = [];
      target.players.forEach(p => {
        const conn = roomManager.getPlayerConnection(p.id);
        connectionSnapshot.push({
          playerId: p.id,
          isAI: !!p.isAI,
          wsOpen: !!(conn && conn.readyState === WebSocket.OPEN)
        });
      });
      console.log(`[forceSettlement] broadcast snapshot:`, connectionSnapshot);
    }
  } catch (e) {
    // ignore
  }
  target.broadcast({
    type: 'forceSettlement',
    playerId,
    rankings: message.rankings,
    gameStartTime: target && target.gameData ? target.gameData.gameStartTime : undefined,
    progressHistory: target && target.gameData ? target.gameData.progressHistory : undefined,
    currentRound: target && target.gameData ? target.gameData.currentRound : undefined,
    timestamp: message.timestamp
  });

  // 获取房间并将状态改为已结算
  const room = roomManager.getPlayerRoom(playerId);
  if (room && room.gameState === 'playing') {
    console.log(`房间 ${room.code} 被房主强制结算，状态改为 finished`);
    room.gameState = 'finished';

    // 删除游戏会话
    if (room.gameSessionId) {
      roomManager.removeGameSession(room.gameSessionId);
      room.gameSessionId = null;
    }

    // 清理已掉线玩家，避免强制结算后留下僵尸玩家/僵尸房间
    try {
      const offlinePlayerIds = [];
      for (const [pid, p] of room.players) {
        if (p && p.isConnected === false) {
          offlinePlayerIds.push(pid);
        }
      }

      if (offlinePlayerIds.length > 0) {
        console.log(`房间 ${room.code} 强制结算后清理已掉线玩家:`, offlinePlayerIds);
        for (const offlineId of offlinePlayerIds) {
          room.removePlayer(offlineId);
          roomManager.playerRooms.delete(offlineId);
        }

        if (room.players.size > 0) {
          room.broadcast({ type: 'roomUpdated', room: room.toJSON() });
        }
      }
    } catch (e) {
      console.error('强制结算后清理离线玩家时出错:', e);
    }

    // 如果房间已空（所有玩家已离线），立即进入清理队列
    if (room.players.size === 0) {
      console.log(`房间 ${room.code} 强制结算后无玩家，加入清理队列`);
      roomManager.scheduleRoomDestroy(room.code);
    }
  }
}

// 处理聊天消息
function handleChatMessage(ws, playerId, message) {
  const target = getBroadcastTarget(playerId);
  if (!target) throw new Error('玩家不在任何房间或游戏会话中');

  // 获取玩家信息
  const player = target.players.get(playerId);
  if (!player) throw new Error('找不到玩家信息');

  const rawMessage = message?.data?.message ?? message?.message ?? '';
  const sanitizedMessage = sanitizeText(rawMessage);
  if (!String(sanitizedMessage).trim()) {
    return;
  }

  const chatPayload = {
    type: 'chatMessage',
    playerId,
    playerNumber: player.color, // 统一用color（1-4）
    playerName: sanitizeText(player.nickname),
    message: sanitizedMessage,
    timestamp: message?.data?.timestamp || message?.timestamp || Date.now()
  };

  // 在房间阶段写入房间聊天历史（保留最近50条）
  if (target instanceof Room) {
    target.appendRoomChatMessage({
      playerId: chatPayload.playerId,
      playerNumber: chatPayload.playerNumber,
      playerName: chatPayload.playerName,
      message: chatPayload.message,
      timestamp: chatPayload.timestamp,
      isSystemMessage: false
    });
  }

  // 广播聊天消息
  target.broadcast(chatPayload);
}

// 音频加载完成（使用游戏会话中间件）
const handleAudioLoaded = withGameSessionValidation((ws, playerId, message, gameSession) => {
  // 记录音频加载状态
  gameSession.audioLoadedPlayers.add(playerId);
  // 计算真实玩家数量（排除AI）
  const realPlayerCount = Array.from(gameSession.players.values()).filter(p => !p.isAI).length;
  console.log(`[音频加载] 玩家 ${playerId} 加载完成. 会话: ${gameSession.gameSessionId}, 当前已加载: ${gameSession.audioLoadedPlayers.size}/${realPlayerCount}. 列表:`, Array.from(gameSession.audioLoadedPlayers));

  // 广播加载状态
  gameSession.broadcast({
    type: 'audioLoaded',
    playerId,
    loadedCount: gameSession.audioLoadedPlayers.size,
    totalCount: realPlayerCount,
    allLoaded: gameSession.audioLoadedPlayers.size === realPlayerCount
  });

  // 所有真实玩家加载完成
  if (gameSession.audioLoadedPlayers.size === realPlayerCount) {
    console.log(`[音频加载] 游戏会话 ${gameSession.gameSessionId} 所有玩家已加载，发送 allAudioLoaded`);
    gameSession.broadcast({ type: 'allAudioLoaded', gameSessionId: gameSession.gameSessionId });
  }
});

// 生成玩家ID
function generatePlayerId() {
  return `player_${Math.random().toString(36).substr(2, 4)}`;
}

/**
 * 查询所有房间信息
 * GET /api/rooms
 */
app.get('/api/rooms', (req, res) => {
  try {
    const roomsInfo = Array.from(roomManager.rooms.values()).map(room => room.toJSON());

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalRooms: roomsInfo.length,
      rooms: roomsInfo
    });
  } catch (error) {
    console.error('获取房间信息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 查询所有游戏会话信息
 * GET /api/sessions
 */
app.get('/api/sessions', (req, res) => {
  try {
    const sessionsInfo = [];

    for (const [sessionId, session] of roomManager.gameSessions.entries()) {
      const players = Array.from(session.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        emoji: p.emoji,
        playerNumber: p.color,
        isConnected: p.isConnected,
        isAI: p.isAI,
        isHost: p.id === session.hostId // 添加房主标志
      }));

      sessionsInfo.push({
        sessionId,
        roomCode: session.roomCode,
        hostId: session.hostId,
        playerCount: session.players.size,
        players,
        pieceCount: session.pieceCount,
        skillMode: session.skillMode,
        gameState: session.gameData ? {
          currentPlayer: session.gameData.currentPlayer,
          gamePhase: session.gameData.gamePhase,
          diceValue: session.gameData.diceValue,
          winner: session.gameData.winner
        } : null,
        createdAt: session.createdAt
      });
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalSessions: sessionsInfo.length,
      sessions: sessionsInfo
    });
  } catch (error) {
    console.error('获取游戏会话信息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取在线用户列表及其详细状态
 * GET /api/online-users
 */
app.get('/api/online-users', (req, res) => {
  try {
    const users = [];

    // 遍历所有活跃的 WebSocket 连接
    for (const [playerId, ws] of roomManager.playerConnections.entries()) {
      if (ws.readyState !== WebSocket.OPEN) {
        roomManager.playerConnections.delete(playerId);
        continue;
      }

      let status = 'idle'; // 默认：首页/空闲
      let roomCode = null;
      let gameSessionId = null;
      let nickname = `玩家_${playerId.slice(-4)}`;

      // 1. 检查是否在游戏中
      const gameSession = roomManager.getPlayerGameSession(playerId);
      if (gameSession) {
        status = 'playing';
        gameSessionId = gameSession.gameSessionId;
        roomCode = gameSession.roomCode;
        const p = gameSession.players.get(playerId);
        if (p) nickname = p.nickname;
      }
      // 2. 检查是否在观战中
      else if (roomManager.playerSpectatingRooms.has(playerId)) {
        status = 'spectating';
        roomCode = roomManager.playerSpectatingRooms.get(playerId);
        // 观战者通常没有存储在房间的 players Map 里，使用默认昵称或尝试从之前的连接中寻找
      }
      // 3. 检查是否在房间中
      else {
        const room = roomManager.getPlayerRoom(playerId);
        if (room) {
          status = 'in_room';
          roomCode = room.code;
          const p = room.players.get(playerId);
          if (p) nickname = p.nickname;
        }
      }

      users.push({
        playerId,
        nickname,
        status,
        roomCode,
        gameSessionId
      });
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalOnline: users.length,
      users
    });
  } catch (error) {
    console.error('获取在线用户列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 查询服务器统计信息
 * GET /api/stats
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      rooms: {
        total: roomManager.rooms.size,
        waiting: 0,
        playing: 0
      },
      sessions: {
        total: roomManager.gameSessions.size
      },
      players: {
        totalConnections: 0,
        inRooms: 0, // 仅统计在线
        inSessions: 0 // 仅统计在线
      },
      timers: {
        roomDestroyTimers: roomManager.roomDestroyTimers.size,
        disconnectTimers: roomManager.disconnectTimers.size
      }
    };

    // 统计在线玩家分布
    for (const [playerId, ws] of roomManager.playerConnections.entries()) {
      if (ws.readyState !== WebSocket.OPEN) {
        roomManager.playerConnections.delete(playerId);
        continue;
      }
      
      stats.players.totalConnections++;
      
      if (roomManager.playerSessions.has(playerId)) {
        stats.players.inSessions++;
      } else if (roomManager.playerRooms.has(playerId)) {
        stats.players.inRooms++;
      }
    }

    // 统计房间状态
    let cleanupRoomsCount = 0;
    for (const room of roomManager.rooms.values()) {
      if (room.gameState === 'waiting') {
        stats.rooms.waiting++;
      } else if (room.gameState === 'playing') {
        stats.rooms.playing++;
      } else if (room.gameState === 'finished') {
        stats.rooms.finished = (stats.rooms.finished || 0) + 1;
      }
      
      // 如果没有人类玩家且状态是游戏中或等待中，逻辑上属于待清理状态
      // 或者是没有任何玩家（连AI都没有）的空房间
      const noHumanPlayers = !room.hasHumanPlayers();
      const isEmpty = room.players.size === 0;
      
      const isCleanupState = 
        (noHumanPlayers && (room.gameState === 'playing' || room.gameState === 'waiting')) || 
        (isEmpty && room.gameState === 'finished');
        
      if (isCleanupState) {
        cleanupRoomsCount++;
      }
    }
    stats.rooms.cleanup = cleanupRoomsCount;

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 手动清理孤立资源
 * POST /api/cleanup
 */
app.post('/api/cleanup', (req, res) => {
  try {
    const result = cleanupOrphanedResources();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      cleaned: result,
      message: `清理完成: ${result.sessions}个孤立会话, ${result.rooms}个已结束房间, ${result.connections}个死连接`
    });
  } catch (error) {
    console.error('清理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 清理孤立资源的核心函数
 * @returns {Object} 清理结果 { sessions: 清理的会话数, rooms: 清理的房间数 }
 */
function cleanupOrphanedResources() {
  console.log('\n===== 开始清理孤立资源 =====');
  let cleanedSessions = 0;
  let cleanedRooms = 0;
  let cleanedConnections = 0;
  for (const [playerId, ws] of roomManager.playerConnections.entries()) {
    if (ws.readyState !== WebSocket.OPEN) {
      roomManager.playerConnections.delete(playerId);
      cleanedConnections++;
    }
  }

  // 1. 清理孤立的游戏会话（对应房间不存在或已finished）
  const orphanedSessions = [];
  for (const [sessionId, session] of roomManager.gameSessions.entries()) {
    const room = session.roomCode ? roomManager.getRoom(session.roomCode) : null;

    // 会话孤立的条件：
    // - 没有关联房间
    // - 关联的房间不存在
    // - 关联的房间状态为finished
    if (!session.roomCode || !room || room.gameState === 'finished') {
      orphanedSessions.push(sessionId);
      console.log(`  发现孤立会话: ${sessionId} (房间: ${session.roomCode || '无'}, 房间状态: ${room ? room.gameState : '不存在'})`);
    }
  }

  // 删除孤立会话
  for (const sessionId of orphanedSessions) {
    roomManager.removeGameSession(sessionId);
    cleanedSessions++;
  }

  // 2. 清理非游戏进行中且无人类玩家的房间，以及空置超时的游戏房间
  const emptyRoomsToClean = [];
  const NOW = Date.now();
  for (const [roomCode, room] of roomManager.rooms.entries()) {
    if (!room.hasHumanPlayers()) {
      if (room.gameState !== 'playing') {
        emptyRoomsToClean.push(roomCode);
        console.log(`  发现无人类玩家的僵尸房间 (${room.gameState}): ${roomCode}`);
      } else {
        // 如果是游戏中，但空置时间超过了 6 分钟（5分钟正常定时器+1分钟宽限），作为兜底清理
        if (room.emptyRoomStartTime && (NOW - room.emptyRoomStartTime > 6 * 60 * 1000)) {
          emptyRoomsToClean.push(roomCode);
          console.log(`  发现空置超时的僵尸游戏房间 (${room.gameState}): ${roomCode}`);
        }
      }
    } else if (room.gameState === 'finished') {
      // 如果房间是finished且没有人类玩家（上面已处理），或者是全空的
      if (room.players.size === 0) {
        emptyRoomsToClean.push(roomCode);
        console.log(`  发现已结束空房间: ${roomCode}`);
      }
    }
  }

  // 删除这些房间
  for (const roomCode of emptyRoomsToClean) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) continue;

    // 清理房间销毁定时器
    if (roomManager.roomDestroyTimers.has(roomCode)) {
      clearTimeout(roomManager.roomDestroyTimers.get(roomCode));
      roomManager.roomDestroyTimers.delete(roomCode);
    }

    // 删除游戏会话（如果还存在）
    if (room.gameSessionId) {
      roomManager.removeGameSession(room.gameSessionId);
    }

    // 清理玩家映射（虽然玩家已经为0，但确保清理干净）
    room.players.forEach(player => {
      roomManager.playerRooms.delete(player.id);
    });

    // 删除房间
    roomManager.rooms.delete(roomCode);
    cleanedRooms++;
  }

  console.log(`===== 清理完成: ${cleanedSessions}个会话, ${cleanedRooms}个房间, ${cleanedConnections}个死连接 =====\n`);

  return {
    sessions: cleanedSessions,
    rooms: cleanedRooms,
    connections: cleanedConnections
  };
}

// 静态文件服务
app.use(express.static('.'));

// -------------------------- 定时清理任务 --------------------------
/**
 * 每10分钟自动清理孤立资源
 */
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10分钟

function startAutoCleanup() {
  console.log('启动自动清理任务（每10分钟执行一次）');

  // 立即执行一次清理
  cleanupOrphanedResources();

  // 设置定时清理
  setInterval(() => {
    console.log('\n[定时任务] 执行自动清理');
    cleanupOrphanedResources();
  }, CLEANUP_INTERVAL);
}

// -------------------------- 启动服务器 --------------------------
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`WebSocket服务器运行在 ws://localhost:${PORT}`);
  console.log(`\n管理面板: http://localhost:${PORT}/frontend/admin.html`);
  console.log(`\n查询接口:`);
  console.log(`  - 房间列表: http://localhost:${PORT}/api/rooms`);
  console.log(`  - 游戏会话: http://localhost:${PORT}/api/sessions`);
  console.log(`  - 服务器统计: http://localhost:${PORT}/api/stats`);
  console.log(`  - 手动清理: http://localhost:${PORT}/api/cleanup (POST)`);

  // 启动自动清理任务
  startAutoCleanup();
});
