import { playerIdManager } from './playerIdManager.js';
import { PollingTransport, getPollingServerUrl } from './pollingTransport.js';

export class WebSocketClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.messageHandlers = new Map();
        this.roomCode = null;
        this.playerId = playerIdManager.getPlayerId();
        this.isHost = false;
        this.serverUrl = getPollingServerUrl();
    }

    get readyState() {
        return this.ws ? this.ws.readyState : PollingTransport.CLOSED;
    }

    refreshPlayerId() {
        this.playerId = playerIdManager.getPlayerId();
        return this.playerId;
    }

    connect(serverUrl = null) {
        return new Promise((resolve, reject) => {
            try {
                if (serverUrl && !String(serverUrl).startsWith('ws')) {
                    this.serverUrl = serverUrl;
                }

                this.ws = new PollingTransport({
                    apiBase: this.serverUrl || getPollingServerUrl(),
                    playerId: this.playerId,
                    roomCode: this.roomCode
                });

                this.ws.onopen = (event) => {
                    this.isConnected = true;
                    if (typeof this.onOpen === 'function') this.onOpen(event);
                    const handler = this.messageHandlers.get('connected');
                    if (handler) handler({ type: 'connected' });
                    resolve(true);
                };

                this.ws.onmessage = (event) => this.onMessage(event);
                this.ws.onclose = (event) => {
                    this.isConnected = false;
                    if (typeof this.onClose === 'function') this.onClose(event);
                    const handler = this.messageHandlers.get('disconnected');
                    if (handler) handler(event);
                };
                this.ws.onerror = (error) => {
                    if (typeof this.onError === 'function') this.onError(error);
                    const handler = this.messageHandlers.get('error');
                    if (handler) handler({ type: 'error', message: error?.message || '连接失败' });
                    reject(error);
                };

                this.ws.connect();
            } catch (error) {
                reject(error);
            }
        });
    }

    disconnect(code = 1000, reason = 'Client disconnect') {
        if (this.ws) {
            this.ws.close(code, reason);
            this.ws = null;
        }
        this.isConnected = false;
        this.roomCode = null;
        this.isHost = false;
    }

    close(code = 1000, reason = 'Client disconnect') {
        this.disconnect(code, reason);
    }

    sendMessage(type, data = {}) {
        if (this.ws && this.ws.readyState === PollingTransport.OPEN) {
            const message = {
                type,
                data,
                timestamp: Date.now(),
                playerId: this.playerId,
                roomCode: this.roomCode
            };
            this.ws.send(JSON.stringify(message));
            return;
        }
        console.warn('轮询连接未建立，无法发送消息:', type, data);
    }

    send(raw) {
        if (this.ws && this.ws.readyState === PollingTransport.OPEN) {
            this.ws.send(raw);
        }
    }

    onMessageType(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    offMessageType(type) {
        this.messageHandlers.delete(type);
    }

    createRoom(config = {}) {
        this.sendMessage('createRoom', config);
    }

    joinRoom(roomCode) {
        this.sendMessage('join_room', { roomCode });
    }

    listRooms() {
        this.sendMessage('listRooms');
    }

    spectateRoom(roomCode, options = {}) {
        this.sendMessage('spectate_room', { roomCode, ...options });
    }

    leaveRoom() {
        this.sendMessage('leave_room');
    }

    selectColor(colorIndex) {
        this.sendMessage('select_color', { colorIndex });
    }

    updateNickname(nickname, options = {}) {
        this.sendMessage('update_nickname', { nickname, manualInput: options.manualInput !== false });
    }

    updateEmoji(emoji) {
        this.sendMessage('update_emoji', { emoji });
    }

    configurePieceCount(pieceCount) {
        this.sendMessage('configure_piece_count', { pieceCount });
    }

    updateRoomPrivacy(isPrivate) {
        this.sendMessage('update_room_privacy', { isPrivate: !!isPrivate });
    }

    addAIPlayer(colorIndex, difficulty) {
        this.sendMessage('add_ai_player', { colorIndex, difficulty });
    }

    removeAIPlayer(colorIndex) {
        this.sendMessage('remove_ai_player', { colorIndex });
    }

    updateAIDifficulty(colorIndex, difficulty) {
        this.sendMessage('update_ai_difficulty', { colorIndex, difficulty });
    }

    toggleReady(isReady) {
        this.sendMessage('toggle_ready', { isReady });
    }

    startGame() {
        this.sendMessage('startGame');
    }

    onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'roomCreated') {
                this.roomCode = message.room?.code;
                this.isHost = true;
                if (this.ws) this.ws.roomCode = this.roomCode;
            } else if (message.type === 'roomJoined' || message.type === 'roomRejoined') {
                this.roomCode = message.room?.code;
                this.isHost = !!message.room?.players?.find((p) => p.id === this.playerId)?.isHost;
                if (this.ws) this.ws.roomCode = this.roomCode;
            } else if (message.gameSessionId && this.ws) {
                this.ws.gameSessionId = message.gameSessionId;
            }

            const handler = this.messageHandlers.get(message.type);
            if (handler) handler(message, message);
        } catch (error) {
            console.error('解析轮询消息失败:', error);
        }
    }

    onOpen(_event) {
        this.isConnected = true;
    }

    onClose(_event) {
        this.isConnected = false;
    }

    onError(error) {
        console.error('轮询连接错误:', error);
    }

    getConnectionState() {
        return {
            isConnected: this.isConnected,
            roomCode: this.roomCode,
            playerId: this.playerId,
            isHost: this.isHost,
            transport: 'polling'
        };
    }

    startHeartbeat() {}
    stopHeartbeat() {}
    attemptReconnect() {
        return this.connect();
    }
    checkConnection() {
        const handler = this.messageHandlers.get('connectionRestored');
        if (handler) handler();
    }
}

export const wsClient = new WebSocketClient();
