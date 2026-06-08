import { playerIdManager } from './playerIdManager.js';

/**
 * 断线重连管理器
 * 负责处理玩家身份识别、游戏状态恢复和重连逻辑
 */
class ReconnectManager {
    constructor() {
        this.gameSessionId = null;
        this.roomCode = null;
        this.playerNickname = null;
        this.playerEmoji = null;
        this.playerColor = null;
        this.isHost = false;
        
        // 初始化时尝试从存储中恢复玩家身份
        this.loadPlayerIdentity();
    }

    /**
     * 获取当前玩家ID（从 PlayerIdManager 获取）
     */
    get playerId() {
        return playerIdManager.getPlayerId();
    }

    /**
     * 保存玩家身份信息到本地存储
     */
    savePlayerIdentity(playerData) {
        // playerId 现在由 PlayerIdManager 管理，不需要在这里保存
        this.gameSessionId = playerData.gameSessionId;
        this.roomCode = playerData.roomCode;
        this.playerNickname = playerData.nickname;
        this.playerEmoji = playerData.emoji;
        this.playerColor = playerData.color;
        this.isHost = playerData.isHost || false;

        // 保存到localStorage（持久化）
        localStorage.setItem('aeroplaneChess_playerNickname', this.playerNickname);
        localStorage.setItem('aeroplaneChess_playerEmoji', this.playerEmoji);
        localStorage.setItem('aeroplaneChess_playerColor', this.playerColor);
        localStorage.setItem('aeroplaneChess_isHost', this.isHost.toString());

        // 保存到sessionStorage（会话级别）
        if (this.gameSessionId) {
            sessionStorage.setItem('aeroplaneChess_gameSessionId', this.gameSessionId);
        }
        if (this.roomCode) {
            sessionStorage.setItem('aeroplaneChess_roomCode', this.roomCode);
        }
    }

    /**
     * 从本地存储加载玩家身份信息
     */
    loadPlayerIdentity() {
        // playerId 现在由 PlayerIdManager 管理，不需要在这里加载
        // 从localStorage加载持久化信息
        this.playerNickname = localStorage.getItem('aeroplaneChess_playerNickname');
        this.playerEmoji = localStorage.getItem('aeroplaneChess_playerEmoji');
        this.playerColor = localStorage.getItem('aeroplaneChess_playerColor');
        this.isHost = localStorage.getItem('aeroplaneChess_isHost') === 'true';

        // 从sessionStorage加载会话信息
        this.gameSessionId = sessionStorage.getItem('aeroplaneChess_gameSessionId');
        this.roomCode = sessionStorage.getItem('aeroplaneChess_roomCode');
    }

    /**
     * 清除玩家身份信息
     */
    clearPlayerIdentity() {
        this.gameSessionId = null;
        this.roomCode = null;
        this.playerNickname = null;
        this.playerEmoji = null;
        this.playerColor = null;
        this.isHost = false;

        // 清除localStorage
        localStorage.removeItem('aeroplaneChess_playerNickname');
        localStorage.removeItem('aeroplaneChess_playerEmoji');
        localStorage.removeItem('aeroplaneChess_playerColor');
        localStorage.removeItem('aeroplaneChess_isHost');

        // 清除sessionStorage
        sessionStorage.removeItem('aeroplaneChess_gameSessionId');
        sessionStorage.removeItem('aeroplaneChess_roomCode');
    }

    /**
     * 检查是否有有效的重连信息
     */
    hasReconnectInfo() {
        return !!(this.playerId && (this.gameSessionId || this.roomCode));
    }

    /**
     * 获取重连信息
     */
    getReconnectInfo() {
        return {
            playerId: this.playerId,
            gameSessionId: this.gameSessionId,
            roomCode: this.roomCode,
            nickname: this.playerNickname,
            emoji: this.playerEmoji,
            color: this.playerColor,
            isHost: this.isHost
        };
    }

    /**
     * 更新游戏会话ID
     */
    updateGameSessionId(gameSessionId) {
        this.gameSessionId = gameSessionId;
        if (gameSessionId) {
            sessionStorage.setItem('aeroplaneChess_gameSessionId', gameSessionId);
        } else {
            sessionStorage.removeItem('aeroplaneChess_gameSessionId');
        }
        console.log('游戏会话ID已更新:', gameSessionId);
    }

    /**
     * 更新房间号
     */
    updateRoomCode(roomCode) {
        this.roomCode = roomCode;
        if (roomCode) {
            sessionStorage.setItem('aeroplaneChess_roomCode', roomCode);
        } else {
            sessionStorage.removeItem('aeroplaneChess_roomCode');
        }
        console.log('房间号已更新:', roomCode);
    }

    /**
     * 检查是否应该尝试重连
     */
    shouldAttemptReconnect() {
        const playerId = this.playerId;
        
        // 优先检查游戏会话重连
        if (this.gameSessionId && playerId) {
            return {
                type: 'game',
                gameSessionId: this.gameSessionId,
                playerId: playerId
            };
        }
        
        // 其次检查房间重连
        if (this.roomCode && playerId) {
            return {
                type: 'room',
                roomCode: this.roomCode,
                playerId: playerId
            };
        }
        
        return null;
    }
}

// 创建全局实例
const reconnectManager = new ReconnectManager();
window.reconnectManager = reconnectManager;

export { reconnectManager, ReconnectManager };