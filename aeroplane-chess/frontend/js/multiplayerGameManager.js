/**
 * 多人游戏通讯管理器 - 处理游戏内的WebSocket连接和消息同步
 */

import { reconnectManager } from './reconnectManager.js';
import { activePlayerManager } from './activePlayerManager.js';
import { PollingTransport, getPollingServerUrl } from './pollingTransport.js';

// 声明全局变量，这些变量在游戏运行时会被设置
let gameState, uiUpdater, gameInfo;

class MultiplayerGameManager {
    constructor() {
        this.wsClient = null;
        this.isHost = false;
        this.gameSessionId = null;
        this.playerId = null;
        this.players = new Map();
        this.aiTakeoverPlayers = new Set(); // 记录处于AI托管状态的玩家ID
        this.defeatedChessPositionCache = new Map(); // key: player-chessIndex，值: { x, y, timestamp }

        this.disableReconnect = false;
        this.gameInstance = null;
        this.isConnected = false;
        this.isOnlineMode = false; // 初始化为false，在init时设置为true
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;

        // 仅当“游戏内WebSocket确实断开过”才视为需要重连UI
        this._didDisconnectOnce = false;

        // 跟踪玩家连接状态，避免重复处理断开和重连事件
        this._playerConnectionStatus = new Map(); // playerId -> isConnected
    }

    stopDiceFlashing() {
        // 停止骰子闪烁动画（如果正在进行）
        if (this.currentFlashInterval) {
            clearInterval(this.currentFlashInterval);
            this.currentFlashInterval = null;
        }
        if (this._diceFlashSafetyTimer) {
            clearTimeout(this._diceFlashSafetyTimer);
            this._diceFlashSafetyTimer = null;
        }
        const diceDisplay = document.getElementById('diceDisplay');
        if (diceDisplay) {
            diceDisplay.classList.remove('dice-waiting', 'dice-flashing');
        }
    }

    _mergePlayerIntoMap(player) {
        if (!player?.id) return;
        const existing = this.players.get(player.id) || {};
        
        this.players.set(player.id, { ...existing, ...player });
    }

    _mergePlayersFromPayload(data) {
        if (!data) return;

        if (data.player) {
            this._mergePlayerIntoMap(data.player);
        }
        
        if (data.players && Array.isArray(data.players)) {
            for (const p of data.players) {
                this._mergePlayerIntoMap(p);
            }
        }

        if (data.room?.players && Array.isArray(data.room.players)) {
            for (const p of data.room.players) {
                this._mergePlayerIntoMap(p);
            }
        }

        if (data.gameSession?.players && Array.isArray(data.gameSession.players)) {
            for (const p of data.gameSession.players) {
                this._mergePlayerIntoMap(p);
            }
        }
    }

    _safeUpdateUI() {
        try {
            uiUpdater?.updateUI?.();
        } catch (e) {
            // ignore
        }
    }

    cacheDefeatedChessPosition(player, chessIndex) {
        const chess = this.gameInstance?.gameState?.playerChess?.[player]?.[chessIndex];
        const element = chess?.element;
        if (!element || typeof element.getBoundingClientRect !== 'function') {
            return;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }

        const cacheKey = `${player}-${chessIndex}`;
        this.defeatedChessPositionCache.set(cacheKey, {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            timestamp: Date.now()
        });
    }

    consumeDefeatedChessPosition(player, chessIndex) {
        const cacheKey = `${player}-${chessIndex}`;
        const cachedPosition = this.defeatedChessPositionCache.get(cacheKey);
        if (!cachedPosition) {
            return null;
        }

        this.defeatedChessPositionCache.delete(cacheKey);

        // 只使用很短时间内的缓存，避免旧坐标污染后续动画
        if (Date.now() - cachedPosition.timestamp > 3000) {
            return null;
        }

        return {
            x: cachedPosition.x,
            y: cachedPosition.y
        };
    }

    /**
     * 初始化多人游戏管理器
     */
    async init(multiplayerGameData, gameInstance) {
        this.gameInstance = gameInstance;
        this.isSpectator = multiplayerGameData.isSpectator || false;
        // 每次进入联机初始化前清理状态，避免跨局残留导致AI误判
        this.players.clear();
        this.aiTakeoverPlayers.clear();
        
        // 动态获取 WebSocketClient 如果没有提供
        if (!multiplayerGameData.wsClient && typeof window !== 'undefined' && window.WebSocketClient) {
            multiplayerGameData.wsClient = new window.WebSocketClient();
        }

        this.playerId = multiplayerGameData.isSpectator ? ('spectator_' + Date.now()) : multiplayerGameData.wsClient.playerId;
        this.serverUrl = multiplayerGameData.wsClient?.serverUrl || ''; // 保存服务器URL
        this.isOnlineMode = true; // 设置为联机模式
        this.hasPrintedGameStart = false; // 跟踪是否已经打印过游戏开始消息
        this.isFreshStart = !multiplayerGameData.isReconnecting; // 标记是否为全新正常开局

        // 无论是否观战，都设置全局变量引用
        this.setGlobalReferences();
        if (gameState?.setTakeoffRule) {
            gameState.setTakeoffRule(multiplayerGameData.takeoffRule || multiplayerGameData.gameData?.takeoffRule || 'even');
        }

        // 无论是否观战，都确保 audioManager 处于正确模式
        if (window.audioManager) {
            window.audioManager.setMultiplayerMode(true);
        }

        // 观战模式特殊处理
        if (this.isSpectator) {
            console.log('以观战模式初始化...');
            this.roomCode = multiplayerGameData.roomCode;
            try {
                await this.connectToServer(this.serverUrl);
                this.rejoinGameSession();
            } catch (e) {
                console.error('观战连接失败', e);
            }
            return;
        }

        // 检查是否是重连模式
        if (multiplayerGameData.isReconnecting) {
            console.log('检测到重连模式，等待游戏初始化完成...');
            this.isReconnecting = true;
            this.gameSessionId = multiplayerGameData.gameSessionId; // 使用gameSessionId而不是roomCode

            // 保存游戏会话ID到重连管理器
            reconnectManager.updateGameSessionId(this.gameSessionId);

            // 初始化音频加载状态跟踪（重连时也需要）
            this.audioLoadedPlayers = new Set();
            // 只计算真实玩家数量（排除AI），因为AI不需要加载音频
            this.totalPlayers = multiplayerGameData.players ? multiplayerGameData.players.filter(p => !p.isAI).length : 0;
            this.gameInitialized = false;

            // 初始化玩家数据（重连时也需要）
            for (const player of multiplayerGameData.players) {
                this.players.set(player.id, {
                    id: player.id,
                    color: player.color,
                    nickname: player.nickname,
                    emoji: player.emoji,
                    isAI: player.isAI,
                    isAITakeover: player.isAITakeover || false
                });
                
                // 如果断线前已经是AI托管，恢复状态
                if (player.isAITakeover || (player.isAI && this.gameInstance && !this.gameInstance.gameState.isBotPlayer(player.color))) {
                    this.aiTakeoverPlayers.add(player.id);
                }
            }

            // 等待游戏完全初始化后再设置全局变量引用和连接服务器
            await this.waitForGameInitialization();

            // 重新绑定棋子DOM元素（重连时可能需要重新绑定）
            this.rebindChessElements();

            // 建立WebSocket连接
            await this.connectToServer(this.serverUrl);

            // 重新加入游戏会话而不是等待roomJoined消息
            this.rejoinGameSession();
            return;
        }

        // 正常的游戏初始化流程
        this.isHost = multiplayerGameData.isHost;
        this.gameSessionId = multiplayerGameData.gameSessionId; // 使用gameSessionId替代roomCode

        // 保存游戏会话ID到重连管理器，用于断线重连
        reconnectManager.updateGameSessionId(this.gameSessionId);

        // 初始化音频加载状态跟踪
        this.audioLoadedPlayers = new Set(); // 已加载音频的玩家
        // 只计算真实玩家数量（排除AI），因为AI不需要加载音频
        this.totalPlayers = multiplayerGameData.players.filter(p => !p.isAI).length;
        this.gameInitialized = false; // 游戏是否已完成初始化

        // 初始化玩家数据 - 使用玩家ID作为键，而不是数字
        for (const player of multiplayerGameData.players) {
            // 确保使用字符串ID作为键，保持与服务器数据一致
            this.players.set(player.id, {
                id: player.id,
                color: player.color,
                nickname: player.nickname,
                emoji: player.emoji,
                isAI: player.isAI,
                isAITakeover: player.isAITakeover || false
            });
            
            // 如果断线前已经是AI托管，恢复状态
            if (player.isAITakeover || (player.isAI && this.gameInstance && !this.gameInstance.gameState.isBotPlayer(player.color))) {
                this.aiTakeoverPlayers.add(player.id);
            }
        }

        // 建立WebSocket连接
        await this.connectToServer(this.serverUrl);

        // 重新加入游戏会话
        this.rejoinGameSession();
    }

    // 重新绑定棋子DOM元素
    rebindChessElements() {
        if (!window.gameState || !window.gameState.playerChess) {
            console.error('gameState或playerChess未初始化');
            return;
        }

        const pieceCount = window.gameState.pieceCount || 4;
        let totalBoundElements = 0;

        // 重新绑定每个玩家的棋子
        for (let player = 1; player <= 4; player++) {
            if (window.gameState.playerChess[player]) {
                // 使用正确的CSS选择器获取棋子元素
                const chessElements = document.querySelectorAll(`#board-svg use[href="#chess"].player-${player}`);
                for (let chessIndex = 0; chessIndex < window.gameState.playerChess[player].length && chessIndex < chessElements.length; chessIndex++) {
                    const chess = window.gameState.playerChess[player][chessIndex];
                    const element = chessElements[chessIndex];

                    if (element) {
                        chess.element = element;
                        totalBoundElements++;
                    } else {
                        console.error(`找不到玩家${player}棋子${chessIndex}的DOM元素`);
                    }
                }
            }
        }
    }

    /**
     * 通知音频加载完成
     */
    notifyAudioLoaded() {
        if (this.isSpectator) return;
        console.log('[音频加载] 本地音频预加载完成，准备发送 notifyAudioLoaded');
        
        // 如果不在联机模式，直接返回
        if (!this.isOnlineMode) {
            console.log('[音频加载] 不在联机模式，跳过音频加载通知');
            return;
        }

        // 如果WebSocket未连接，加入待发送队列
        if (!this.isConnected) {
            console.log('[音频加载] WebSocket连接未就绪，audioLoaded 消息加入待发送队列');
            if (!this.pendingMessages) {
                this.pendingMessages = [];
            }
            this.pendingMessages.push({
                type: 'audioLoaded',
                data: {
                    playerId: this.playerId,
                    timestamp: Date.now()
                }
            });
            return;
        }

        console.log('[音频加载] 发送 audioLoaded 消息给服务器');
        this.sendMessage('audioLoaded', {
            playerId: this.playerId,
            timestamp: Date.now()
        });
    }

    /**
     * 处理音频加载完成消息
     */
    handleAudioLoaded(data) {
        if (!this.audioLoadedPlayers) {
            this.audioLoadedPlayers = new Set();
        }
        this.audioLoadedPlayers.add(data.playerId);

        const isLocalLoaded = window.audioManager && window.audioManager.isLoaded;
        const isAllLoaded = window.audioManager && window.audioManager.allPlayersAudioLoaded;

        // 只要本地加载完了且全员还没就位，就显示进度
        if (window.audioManager && isLocalLoaded && !isAllLoaded && this.totalPlayers > 0) {
            if (typeof window.audioManager.updateLoadingText === 'function') {
                window.audioManager.updateLoadingText(`等待其他玩家加载... ${this.audioLoadedPlayers.size}/${this.totalPlayers}`);
            }
        }
    }

    /**
     * 处理所有玩家音频加载完成
     */
    handleAllAudioLoaded(data) {
        if (this.isSpectator) {
            this.gameInitialized = true;
            if (this.gameInstance && this.gameInstance.gameState) {
                this.gameInstance.gameState.setGameOfficiallyStarted(true);
            }
            if (window.audioManager) {
                window.audioManager.onAllPlayersAudioLoaded();
            }
            return;
        }
        console.log('[音频加载] 收到全员加载完成信号 (allAudioLoaded):', data);
        
        // 标记游戏已完成初始化
        this.gameInitialized = true;
        
        // 全员加载后解禁暂停按钮，但托管按钮需等待首发玩家操作
        if (this.gameInstance && this.gameInstance.gameState) {
            
            // 主动触发一次按钮状态更新
            if (window.aiTakeoverManager && typeof window.aiTakeoverManager.updateToggleButton === 'function') {
                window.aiTakeoverManager.updateToggleButton();
            }
            if (window.eventHandler && typeof window.eventHandler.updatePauseButtonText === 'function') {
                window.eventHandler.updatePauseButtonText();
            }
        }

        // 通知audioManager所有玩家音频已加载完成
        if (window.audioManager) {
            window.audioManager.onAllPlayersAudioLoaded();
        }

        // 全员加载完成后，发送游戏开始信息
        if (this.gameInstance && this.gameInstance.gameInfo) {
            // 只在首次全新正常开局（非重连、非刷新）且尚未发送过提示时显示
            if (this.isFreshStart && !this.hasPrintedGameStart) {
                const currentPlayer = this.gameInstance.gameState.getCurrentPlayer();
                // 所有人都会收到allAudioLoaded信号并在本地输出，因此设置skipSync=true避免互相广播导致重复
                this.gameInstance.gameInfo.addGameStart(currentPlayer, true);
                this.hasPrintedGameStart = true;
            }
        }

        // 检查当前玩家是否为AI，如果是则触发AI操作
        if (this.gameInstance && this.gameInstance.gameState) {
            // 如果当前游戏处于暂停状态，不要触发任何进度条或AI操作
            if (this.gameInstance.gameState.getIsPaused()) {
                return;
            }
            const currentPlayer = this.gameInstance.gameState.getCurrentPlayer();
            const gamePhase = this.gameInstance.gameState.getGamePhase();
            // 检查当前玩家是否为AI或AI托管玩家，如果是则触发操作
            const isBotPlayer = this.gameInstance.gameState.isBotPlayer(currentPlayer);
            
            const currentPlayerId = this.getPlayerIdByPlayerNumber(currentPlayer);
            const currentPlayerData = this.players?.get(currentPlayerId);
            const isCurrentPlayerAITakeover = (this.aiTakeoverPlayers && this.aiTakeoverPlayers.has(currentPlayerId)) ||
                currentPlayerData?.isAITakeover || 
                (currentPlayerData?.isAI && !isBotPlayer) || false;

            // 如果当前玩家是AI电脑或被AI接管，且当前客户端是房主，则触发AI操作
            if ((isBotPlayer || isCurrentPlayerAITakeover) && this.isHost) {
                setTimeout(() => {
                    if (window.botController) {
                        if (!window.botController.isEnabled) {
                            window.botController.setEnabled(true);
                        }
                        // 确保游戏阶段正确
                        if (gamePhase === 'waiting' || gamePhase === 'rolling') {
                            window.botController.handleBotTurn();
                        }
                    }
                }, 800);
            } else if (!isBotPlayer && !isCurrentPlayerAITakeover) {
                // 如果当前玩家是正常人类玩家，确保游戏阶段正确
                if (gamePhase === 'waiting') {
                    this.gameInstance.gameState.setGamePhase('rolling');
                    if (window.uiUpdater) {
                        window.uiUpdater.updateUI();
                    }
                }
            }
        }
    }

    /**
     * 等待游戏完全初始化
     */
    async waitForGameInitialization() {
        return new Promise((resolve) => {
            const checkInitialization = () => {
                if (window.gameState && window.uiUpdater && window.gameInfo) {
                    console.log('游戏初始化完成，设置全局变量引用');
                    this.setGlobalReferences();
                    resolve();
                } else {
                    console.log('等待游戏初始化...', {
                        gameState: !!window.gameState,
                        uiUpdater: !!window.uiUpdater,
                        gameInfo: !!window.gameInfo
                    });
                    setTimeout(checkInitialization, 100);
                }
            };
            checkInitialization();
        });
    }

    /**
     * 设置全局变量引用
     */
    setGlobalReferences() {
        gameState = window.gameState;
        uiUpdater = window.uiUpdater;
        gameInfo = window.gameInfo;
    }

    /**
     * 连接到服务器
     */
    async connectToServer(serverUrl) {
        return new Promise((resolve, reject) => {
            try {
                this.wsClient = new PollingTransport({
                    apiBase: getPollingServerUrl(),
                    playerId: this.playerId,
                    gameSessionId: this.gameSessionId,
                    roomCode: this.roomCode
                });

                this.wsClient.onopen = () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    // 发送待发送的消息队列
                    this.processPendingMessages();

                    resolve();
                };

                this.wsClient.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('解析WebSocket消息失败:', error);
                    }
                };

                this.wsClient.onclose = () => {
                    console.log('游戏内WebSocket连接已关闭');
                    this.isConnected = false;
                    if (!this.disableReconnect) {
                        this._didDisconnectOnce = true;
                        this.attemptReconnect();
                    }
                };

                this.wsClient.onerror = (error) => {
                    console.error('游戏内WebSocket连接错误:', error);
                    this.isConnected = false;
                    reject(error);
                };

                this.wsClient.connect().catch(reject);

            } catch (error) {
                console.error('创建WebSocket连接失败:', error);
                reject(error);
            }
        });
    }

    /**
     * 重新加入游戏会话
     */
    rejoinGameSession() {
        if (this.isSpectator) {
            if (this.isConnected && this.roomCode) {
                this.sendMessage('spectate_room', {
                    roomCode: this.roomCode
                });
            }
            return;
        }
        if (this.isConnected && this.gameSessionId && this.playerId) {
            this.sendMessage('rejoinGameSession', {
                gameSessionId: this.gameSessionId,
                playerId: this.playerId
            });
        } else {
            console.warn('重新加入游戏会话失败 - 缺少必要信息:', {
                isConnected: this.isConnected,
                gameSessionId: this.gameSessionId,
                playerId: this.playerId
            });
        }
    }

    /**
     * 尝试重新连接
     */
    async attemptReconnect() {
        if (this.disableReconnect) {
            return;
        }
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('达到最大重连次数，停止重连');
            this.showConnectionError('连接已断开，请刷新页面重试');
            return;
        }

        this.reconnectAttempts++;

        try {
            await this.connectToServer(this.serverUrl);
            if (this.isConnected) {
                this.reconnectAttempts = 0;
                this.rejoinGameSession(); // 重新加入游戏会话
            }
        } catch (error) {
            console.error('重新连接失败:', error);
            setTimeout(() => {
                this.attemptReconnect();
            }, this.reconnectDelay);
        }
    }

    /**
     * 发送消息
     */
    sendMessage(type, data = {}) {
        if (this.isConnected && this.wsClient) {
            const message = {
                type,
                playerId: this.playerId,
                gameSessionId: this.gameSessionId, // 使用gameSessionId替代roomCode
                ...data
            };

            this.wsClient.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket未连接，无法发送消息:', type, data);
        }
    }

    /**
     * 处理接收到的消息
     */
    handleMessage(data) {
        // 如果是观战加入成功
        if (data.type === 'spectateJoined') {
            console.log('加入观战成功:', data);
            
            this.isSpectator = true;
            this.players.clear();
            this.aiTakeoverPlayers.clear();
            
            let activePlayers = [];
            
            // 优先使用 gameSession.players（包含所有真实玩家和AI玩家）
            const playersList = (data.gameSession && data.gameSession.players) ? data.gameSession.players : (data.room && data.room.players ? data.room.players : []);
            
            if (playersList.length > 0) {
                for (const player of playersList) {
                    this.players.set(player.id, {
                        id: player.id,
                        color: player.color,
                        nickname: player.nickname,
                        emoji: player.emoji,
                        isAI: player.isAI || false,
                        isAITakeover: player.isAITakeover || false
                    });
                    
                    if (player.isAITakeover || player.isAI) {
                        this.aiTakeoverPlayers.add(player.id);
                    }
                    
                    if (player.color) {
                        activePlayers.push(player.color);
                        // 更新昵称和AI托管状态显示
                        this.updatePlayerNicknameDisplay(player.id, player.nickname);
                        this.updatePlayerAITakeoverDisplay(player.id, player.isAITakeover);
                        
                        // 更新表情显示
                        if (player.emoji && window.gameInstance && window.gameInstance.updatePlayerEmoji) {
                            window.gameInstance.updatePlayerEmoji(player.color, player.emoji);
                        }
                    }
                }
            }
            
            // 初始化音频加载状态跟踪，确保后续 handleAudioLoaded 能正常工作
            this.audioLoadedPlayers = new Set();
            this.totalPlayers = playersList.filter(player => !player.isAI).length;
            this.gameInitialized = true;
            
            // 检查是否是道具模式，如果是则初始化积分管理器
            const isSkillMode = data.room && data.room.settings && data.room.settings.skillMode === true;
            if (isSkillMode) {
                // 更新sessionStorage，让积分管理器能读取到正确的配置
                const configStr = sessionStorage.getItem('gameConfig');
                let config = configStr ? JSON.parse(configStr) : { mode: 'online_multiplayer' };
                config.skillMode = true;
                config.pieceCount = data.room.settings.pieceCount || 4;
                sessionStorage.setItem('gameConfig', JSON.stringify(config));
                
                // 重新初始化积分系统和道具管理器
                if (window.energyManager) {
                    window.energyManager.init();
                }
                if (window.skillManager) {
                    window.skillManager.init();
                }
                if (this.gameInstance && this.gameInstance.energyDisplay) {
                    this.gameInstance.energyDisplay.init();
                }
                
                // 更新页面标题
                if (this.gameInstance && typeof this.gameInstance.updatePageTitle === 'function') {
                    this.gameInstance.updatePageTitle(config);
                }
            }

            if (activePlayers.length > 0) {
                activePlayers.sort((a, b) => a - b);
                activePlayerManager.setActivePlayers(activePlayers);
            }
            
            if (data.gameData) {
                this.gameSessionId = data.gameSessionId || (data.room && data.room.gameSessionId);
                this.restoreGameState(data.gameData);
                
                // 确保触发全员就绪逻辑，让观战可以解除等待遮罩
                if (window.audioManager) {
                    window.audioManager.onAllPlayersAudioLoaded();
                }
            }
            return;
        }

        // 如果是重连模式且收到roomJoined消息，完成初始化
        if (this.isReconnecting && data.type === 'roomJoined') {
            console.log('重连成功，收到房间信息:', data.room);
            this.handleReconnectRoomJoined(data);
            return;
        }

        switch (data.type) {
            case 'connected':
                // 处理连接确认消息，通常不需要特殊处理
                break;
            case 'diceRoll':
                this.handleDiceRolled(data);
                break;
            case 'diceDisplay':
                this.handleDiceDisplay(data);
                break;
            case 'teleportIcon':
                this.handleTeleportIcon(data);
                break;
            case 'polyhedralDice':
                this.handlePolyhedralDice(data);
                break;
            case 'mysteryBoxIcon':
                this.handleMysteryBoxIcon(data);
                break;
            case 'removeMysteryBoxIcon':
                this.handleRemoveMysteryBoxIcon(data);
                break;
            case 'energyGainAnimation':
                this.handleEnergyGainAnimation(data);
                break;
            case 'diceAnimationStart':
                this.handleDiceAnimationStart(data);
                break;
            case 'chessMove':
                this.handleChessMove(data);
                break;
            case 'pieceMove':
                this.handlePieceMove(data);
                break;
            case 'boardState':
                this.handleBoardState(data);
                break;
            case 'gameStateSync':
                this.handleGameStateSync(data);
                break;
            case 'playerTurnChange':
                this.handlePlayerTurnChange(data);
                break;
            case 'noMovableChess':
                this.handleNoMovableChess(data);
                break;
            case 'aiTakeoverChange':
                this.handleAITakeoverChange(data);
                break;
            case 'nicknameChange':
                this.handleNicknameChange(data);
                break;
            case 'jumpAnimation':
                this.handleJumpAnimation(data);
                break;
            case 'flyAnimation':
                this.handleFlyAnimation(data);
                break;
            case 'moveChessToStart':
                this.handleMoveChessToStart(data);
                break;
            case 'moveChessToFinish':
                this.handleMoveChessToFinish(data);
                break;
            case 'energyChange':
                this.handleEnergyChange(data);
                break;
            case 'defeatCountChange':
                this.handleDefeatCountChange(data);
                break;
            case 'stackCollision':
                this.handleStackCollision(data);
                break;
            case 'stackBounce':
                this.handleStackBounce(data);
                break;
            case 'endpointBounce':
                this.handleEndpointBounce(data);
                break;
            case 'gameEnd':
                this.handleGameEnd(data);
                break;
            case 'forceSettlement':
                this.handleForceSettlement(data);
                break;
            case 'progressBarStart':
                this.handleProgressBarStart(data);
                break;
            case 'gamePause':
                this.handleGamePaused(data);
                break;
            case 'gamePaused':
                this.handleGamePaused(data);
                break;
            case 'gameResume':
                this.handleGameResumed(data);
                break;
            case 'gameResumed':
                this.handleGameResumed(data);
                break;
            case 'playerLeft':
                this.handlePlayerLeft(data);
                break;
            case 'hostTransferred':
                this.handleHostTransferred(data);
                break;
            case 'gameInfo':
                this.handleGameInfo(data);
                break;
            case 'gameSessionConnected':
                this.handleGameSessionConnected(data);
                break;
            case 'threeSixesPenalty':
                this.handleThreeSixesPenalty(data);
                break;
            case 'audioLoaded':
                this.handleAudioLoaded(data);
                break;
            case 'allAudioLoaded':
                this.handleAllAudioLoaded(data);
                break;
            case 'diceReset':
                this.handleDiceReset(data);
                break;
            case 'error':
                this.handleError(data);
                break;
            case 'chatMessage':
                // 调用eventHandler的showChatMessage方法显示消息
                // 传递服务器提供的playerName而不是依赖本地playerNameManager
                if (window.eventHandler) {
                    window.eventHandler.showChatMessage(data.message, data.playerNumber, data.playerName, data.isSystemMessage);
                } else {
                    console.warn('eventHandler 不存在，无法显示聊天消息');
                }

                // 同时添加到游戏信息
                if (window.gameInfo) {
                    window.gameInfo.addChatMessage(data.playerNumber, data.message, data.playerName, true);
                }
                break;
            case 'playerDisconnected':
                this.handlePlayerDisconnected(data);
                break;
            case 'playerReconnected':
                this.handlePlayerReconnected(data);
                break;
            case 'playerUpdated':
                this._mergePlayersFromPayload(data);
                this._safeUpdateUI();
                break;
            case 'playerJoined':
                this._mergePlayersFromPayload(data);
                this._safeUpdateUI();
                break;
            case 'progressBarReset':
                this.handleProgressBarReset(data);
                break;
            case 'gameAutoPaused':
                this.handleGameAutoPaused(data);
                break;
            case 'gameResumed':
                this.handleGameResumed(data);
                break;
            case 'roomDestroying':
                this.handleRoomDestroying(data);
                break;
            case 'hostChanged':
                this.handleHostChanged(data);
                break;
            case 'diceStatisticsSync':
                break;
            default:
                console.warn('未知的游戏消息类型:', data.type);
        }
    }

    /**
     * 处理重连时的roomJoined消息
     */
    handleReconnectRoomJoined(data) {
        console.log('处理重连的roomJoined消息:', data);

        // 设置基本信息
        this.isHost = data.room.players.find(p => p.id === this.playerId)?.isHost || false;
        this.gameSessionId = data.gameData?.gameSessionId;
        this.isReconnecting = false;

        // 更新暂停和结算按钮UI
        if (window.gameInstance && window.gameInstance.eventHandler) {
            window.gameInstance.eventHandler.updatePauseButtonText();
        }

        // 保存游戏会话ID到重连管理器
        if (this.gameSessionId) {
            reconnectManager.updateGameSessionId(this.gameSessionId);
        }

        // 初始化音频加载状态跟踪
        this.audioLoadedPlayers = new Set();
        this.totalPlayers = data.room.players.filter(player => !player.isAI).length;
        this.gameInitialized = false;

        // 设置全局变量引用
        gameState = window.gameState;
        uiUpdater = window.uiUpdater;
        gameInfo = window.gameInfo;

        // 设置audioManager为联机模式
        if (window.audioManager) {
            window.audioManager.setMultiplayerMode(true);
        }

        // 初始化玩家数据并恢复AI托管状态
        this.players.clear();
        this.aiTakeoverPlayers.clear(); // 清空AI托管列表

        for (const player of data.room.players) {
            this.players.set(player.id, {
                id: player.id,
                color: player.color,
                nickname: player.nickname,
                emoji: player.emoji,
                isAI: player.isAI || false, // 使用服务器返回的isAI标志，可能是真正的人机，也可能是断线转托管的
                isAITakeover: player.isAITakeover || false // 恢复AI托管状态
            });

            // 如果玩家处于AI托管状态（包括被服务器转为AI的情况），加入AI托管列表
            if (player.isAITakeover || (player.isAI && !this.gameInstance?.gameState?.isBotPlayer(player.color))) {
                this.aiTakeoverPlayers.add(player.id);
                console.log(`恢复AI托管状态: 玩家${player.id}处于AI托管中`);

                // 设置AI托管使用简单难度
                const playerNumber = player.color;
                if (playerNumber && window.botController) {
                    window.botController.botDifficulties[playerNumber] = 'easy';
                    console.log(`设置AI托管玩家${playerNumber}为简单难度`);
                }

                // 更新AI托管显示（对所有客户端，包括房主）
                setTimeout(() => {
                    this.updatePlayerAITakeoverDisplay(player.id, true);
                }, 200);

                // 如果是当前玩家，且不是观战模式，恢复本地AI托管状态
                if (player.id === this.playerId && !this.isSpectator) {
                    console.log('当前玩家处于AI托管状态，恢复本地UI');
                    // 异步恢复本地AI托管状态
                    setTimeout(async () => {
                        const { aiTakeoverManager } = await import('./aiTakeoverManager.js');
                        if (!aiTakeoverManager.isActive) {
                            // 直接设置状态，不触发同步
                            aiTakeoverManager.isActive = true;
                            // 确保使用window.gameState以避免undefined错误
                            if (window.gameState && typeof window.gameState.setAITakeover === 'function') {
                                window.gameState.setAITakeover(true);
                            }
                            aiTakeoverManager.showOverlay();
                            aiTakeoverManager.updateToggleButton();
                            // 恢复昵称标记（如果需要）
                            aiTakeoverManager.modifyHumanPlayerNames();
                            console.log('本地AI托管状态已恢复');
                        }
                    }, 100);
                }
            }
        }

        // 如果有游戏数据，说明游戏正在进行中，需要恢复游戏状态
        if (data.gameData) {
            this.restoreGameState(data.gameData);
        }

        // 重新加入游戏会话
        this.rejoinGameSession();
    }

    /**
     * 恢复游戏状态
     */
    restoreGameState(gameData) {
        // 如果是观战模式加入，不需要限制恢复频率
        if (!this.isSpectator) {
            // 防止短时间内重复恢复
            const now = Date.now();
            if (this._lastRestoreTime && now - this._lastRestoreTime < 1000) {
                return;
            }
            this._lastRestoreTime = now;
        }

        // 确保全局变量引用已设置
        if (!gameState) {
            this.setGlobalReferences();
        }

        // 再次检查gameState是否可用
        if (!gameState) {
            return;
        }

        // 确保设置在线多人模式标志（重连时可能被resetGameState重置）
        gameState.setIsOnlineMultiplayer(true);
        if (gameState.setTakeoffRule) {
            gameState.setTakeoffRule(gameData.takeoffRule || 'even');
        }

        // 首先检查并应用棋子个数配置
        if (gameData.pieceCount !== undefined && gameData.pieceCount !== gameState.pieceCount) {
            gameState.initializePlayerChess(gameData.pieceCount);

            // 重新设置棋子元素，确保DOM元素正确绑定
            if (this.gameInstance && this.gameInstance.setupChessElements) {
                this.gameInstance.setupChessElements();
            }
        }

        // 设置当前玩家（如果服务器返回null，使用fallback逻辑）
        if (gameData.currentPlayer !== undefined && gameData.currentPlayer !== null) {
            gameState.setCurrentPlayer(gameData.currentPlayer);
        } else {
            // 服务器返回null，使用fallback逻辑
            // 优先使用本地已有的currentPlayer（如果有效）
            const localCurrentPlayer = gameState.getCurrentPlayer();

            // 获取激活玩家列表（从服务器数据或本地）
            let activePlayers = [];
            if (gameData.playerChess) {
                // 从服务器的playerChess数据中获取激活玩家
                activePlayers = Object.keys(gameData.playerChess).map(k => parseInt(k)).sort((a, b) => a - b);
            }
            if (activePlayers.length === 0) {
                activePlayers = activePlayerManager.getActivePlayers() || [1];
            }

            // 检查本地currentPlayer是否在激活玩家列表中
            if (!localCurrentPlayer || !activePlayers.includes(localCurrentPlayer)) {
                // 本地值无效，使用第一个激活玩家
                const firstPlayer = activePlayers[0] || 1;
                gameState.setCurrentPlayer(firstPlayer);
            }
        }

        // 确保currentPlayer已设置（最终检查）
        if (!gameState.getCurrentPlayer()) {
            gameState.setCurrentPlayer(1);
        }

        // 设置游戏阶段
        if (gameData.gamePhase) {
            gameState.setState('gamePhase', gameData.gamePhase);
        }

        // 恢复暂停状态
        if (gameData.isPaused) {
            gameState.gamePhaseBeforePause = gameData.gamePhaseBeforePause || 'rolling';
            gameState.setIsPaused(true);
            if (window.eventHandler) {
                window.eventHandler.updatePauseButtonText();
            }
            if (this.gameInstance && typeof this.gameInstance.pauseGame === 'function') {
                this.gameInstance.pauseGame();
            }
        } else {
            gameState.setIsPaused(false);
        }

        // 恢复骰子值
        if (gameData.diceValue !== undefined) {
            gameState.setState('diceValue', gameData.diceValue);
        }

        // 重置isRolling防抖标志，确保重连后可以正常投骰子
        gameState.isRolling = false;

        // 恢复思考开始时间（用于进度条同步）
        if (gameData.thinkingStartTime) {
            gameState.thinkingStartTime = gameData.thinkingStartTime;
            gameState.pausedThinkingTime = 0;
        }

        // 同步游戏正式开始标志
        if (gameData.gameOfficiallyStarted !== undefined) {
            gameState.setGameOfficiallyStarted(gameData.gameOfficiallyStarted);
            console.log(`[重连] 同步游戏正式开始状态: ${gameData.gameOfficiallyStarted}`);
        } else {
            // 如果后端没有提供该标志，则通过棋子位置推断
            const isStarted = this.hasNonInitialChessPositions(gameData.playerChess);
            gameState.setGameOfficiallyStarted(isStarted);
            console.log(`[重连] 通过棋子位置推断游戏正式开始状态: ${isStarted}`);
        }

        // 恢复连投奖励状态
        if (gameData.canReroll !== undefined) {
            gameState.canReroll = gameData.canReroll;
        }
        if (gameData.consecutiveSixes !== undefined) {
            gameState.consecutiveSixes = gameData.consecutiveSixes;
        }
        if (gameData.justRolledSix !== undefined) {
            gameState.justRolledSix = gameData.justRolledSix;
        }


        // 特殊处理1：如果有连骰奖励状态（canReroll && justRolledSix），说明玩家已移动完成但还没发送回合切换消息
        // 这种情况下应该恢复为rolling阶段，让玩家继续投骰子
        if (gameData.canReroll && gameData.justRolledSix) {
            gameState.setState('gamePhase', 'rolling');
            gameState.setState('diceValue', 0);
            gameState.justRolledSix = false; // 重置justRolledSix，避免重复处理
        }
        // 特殊处理2：如果服务器端游戏阶段是moving但有骰子值，说明玩家已投掷但未移动
        // 客户端应该恢复为selecting阶段，让玩家选择棋子
        else if (gameData.gamePhase === 'moving' && gameData.diceValue > 0) {
            gameState.setState('gamePhase', 'selecting');
            // 检查是否有可移动的棋子
            const currentPlayer = gameData.currentPlayer || gameState.getCurrentPlayer();
            const playerChess = gameState.getPlayerChess();
            const canLaunch = gameState.canTakeoff(gameData.diceValue);

            const hasMovableChess = playerChess[currentPlayer].some(chess => {
                if (chess.finished) return false;
                if (chess.position === -1) return canLaunch;

                // 如果棋子在轨道上（位置0-50），可以移动并支持反弹
                if (chess.position >= 0 && chess.position <= 50) {
                    return true;
                }

                // 如果棋子在终点通道（位置51-56），支持反弹机制
                if (chess.position >= 51 && chess.position < 56) {
                    return true;
                }

                return false;
            });

            if (!hasMovableChess) {
                // 如果没有可移动的棋子，应该切换到下一个玩家
                // 但在恢复阶段我们不主动切换，让游戏逻辑自然处理
                gameState.setState('gamePhase', 'rolling');
                gameState.setState('diceValue', 0);
            }
        }

        // 确保骰子显示正确的状态（使用gameState的当前值，因为可能已被特殊处理修改）
        if (uiUpdater) {
            const currentDiceValue = gameState.getDiceValue();
            const currentGamePhase = gameState.getGamePhase();

            if (currentDiceValue > 0) {
                uiUpdater.updateDiceDisplay(currentDiceValue);
            } else if (currentGamePhase === 'rolling') {
                // 如果是rolling阶段且骰子值为0（如连骰奖励状态），重置骰子显示
                uiUpdater.updateDiceDisplay(0);
            }
        }

        // 恢复棋子位置和状态
        if (gameData.playerChess && gameState.getAllChessStates) {
            // 获取当前游戏状态中的棋子数据
            const currentChessStates = gameState.getAllChessStates();

            // 遍历每个玩家的棋子数据
            for (const [playerIndex, playerChessArray] of Object.entries(gameData.playerChess)) {
                const playerNum = parseInt(playerIndex);

                // 服务器发送的是直接的棋子数组，不是包含pieces属性的对象
                if (currentChessStates[playerNum] && Array.isArray(playerChessArray)) {
                    // 恢复每个棋子的位置
                    for (let chessIdx = 0; chessIdx < playerChessArray.length; chessIdx++) {
                        const chessData = playerChessArray[chessIdx];

                        if (currentChessStates[playerNum][chessIdx] && chessData) {
                            // 恢复棋子完成状态
                            currentChessStates[playerNum][chessIdx].finished = chessData.finished || false;

                            // 恢复棋子位置：已完成的棋子在前端应该保持位置-1
                            if (chessData.finished) {
                                currentChessStates[playerNum][chessIdx].position = -1;
                                console.log(`恢复已完成棋子: 玩家${playerNum}棋子${chessIdx} 位置设为-1`);
                            } else {
                                currentChessStates[playerNum][chessIdx].position = chessData.position;
                            }
                        }
                    }
                }
            }

            // 恢复击败计数（在循环外统一恢复）
            if (gameData.defeatCounts) {
                gameState.defeatCounts = gameData.defeatCounts;

                // 更新UI显示
                import('./defeatCountDisplay.js').then(({ defeatCountDisplay }) => {
                    defeatCountDisplay.updateAllDefeatCounts(gameData.defeatCounts);
                }).catch(err => {
                    console.error('更新击败计数显示失败:', err);
                });
            }

            // 恢复积分状态（道具模式）
            if (gameData.energyStates) {
                // 恢复积分管理器的状态
                import('./energyManager.js').then(({ energyManager }) => {
                    if (energyManager.isSkillModeEnabled()) {
                        for (const [player, energy] of Object.entries(gameData.energyStates)) {
                            const playerNum = parseInt(player);
                            if (playerNum >= 1 && playerNum <= 4) {
                                energyManager.setEnergy(playerNum, energy);
                            }
                        }
                    }
                }).catch(err => {
                    console.error('[道具系统] 恢复积分状态失败:', err);
                });
            }

            // 恢复骰子统计数据（用于数据分析）
            if (gameData.diceStatistics) {
                gameState.diceStatistics = gameData.diceStatistics;
            }

            // 恢复完成度历史记录（用于数据分析）
            if (gameData.progressHistory && gameData.progressHistory.length > 0) {
                // 如果本地已有数据，需要合并而不是直接覆盖
                if (gameState.progressHistory && gameState.progressHistory.length > 0) {
                    // 创建一个Map来去重，以round为key
                    const historyMap = new Map();

                    // 先添加服务器的数据（优先）
                    gameData.progressHistory.forEach(snapshot => {
                        historyMap.set(snapshot.round, snapshot);
                    });

                    // 再添加本地的数据（如果服务器没有的话）
                    gameState.progressHistory.forEach(snapshot => {
                        if (!historyMap.has(snapshot.round)) {
                            historyMap.set(snapshot.round, snapshot);
                        }
                    });

                    // 按回合数排序
                    const mergedHistory = Array.from(historyMap.values()).sort((a, b) => a.round - b.round);
                    gameState.progressHistory = mergedHistory;
                } else {
                    // 本地没有数据，直接使用服务器的数据
                    gameState.progressHistory = gameData.progressHistory;
                }
            }

            // 恢复当前回合数（使用服务器和本地的较大值，确保不会倒退）
            if (gameData.currentRound !== undefined) {
                const serverRound = gameData.currentRound;
                const localRound = gameState.currentRound || 0;
                const maxRound = Math.max(serverRound, localRound);

                // 如果有历史记录，确保currentRound不小于最大的历史回合数
                if (gameState.progressHistory && gameState.progressHistory.length > 0) {
                    const maxHistoryRound = Math.max(...gameState.progressHistory.map(s => s.round));
                    gameState.currentRound = Math.max(maxRound, maxHistoryRound);
                } else {
                    gameState.currentRound = maxRound;
                }
            }

            // 确保棋子DOM元素正确绑定
            this.rebindChessElements();

            // 强制更新棋盘显示 - 需要根据棋子位置调用不同的更新方法
            const pieceCount = gameState.pieceCount || 4;
            let restoredCount = 0;

            // 执行棋子视觉位置恢复
            for (let player = 1; player <= 4; player++) {
                for (let chessIdx = 0; chessIdx < pieceCount; chessIdx++) {
                    const chess = gameState.playerChess[player][chessIdx];

                    if (!chess || !chess.element) {
                        console.log(`跳过玩家${player}棋子${chessIdx}: 元素不存在`);
                        continue;
                    }

                    let restored = false;

                    if (chess.finished) {
                        // 棋子已完成 - 使用专门的恢复方法
                        if (window.animation && window.animation.restoreChessToFinish) {
                            restored = window.animation.restoreChessToFinish(player, chessIdx);
                        }
                    } else if (chess.position === -1) {
                        // 棋子在起始区域（基地）- 使用专门的恢复方法
                        if (window.animation && window.animation.restoreChessToStart) {
                            restored = window.animation.restoreChessToStart(player, chessIdx);
                        }
                    } else {
                        // 棋子在轨道上（包括位置0起飞点）- 使用专门的恢复方法
                        if (window.animation && window.animation.restoreChessToTrack) {
                            restored = window.animation.restoreChessToTrack(player, chessIdx);
                        }
                    }

                    if (restored) {
                        restoredCount++;
                    }
                }
            }
        }

        // 更新UI
        if (uiUpdater) {
            uiUpdater.updateUI();

            // 如果是selecting阶段，确保高亮可移动的棋子
            if (gameState.getGamePhase() === 'selecting') {
                console.log('恢复selecting阶段，高亮可移动棋子');
                uiUpdater.updateChessGlow();
                uiUpdater.highlightMovableChess();
            }
        }

        // 恢复完成后输出当前状态
        const finalChessStates = gameState.getAllChessStates ? gameState.getAllChessStates() : null;
        console.log('游戏状态恢复完成！当前棋子状态:', finalChessStates);
        console.log('游戏状态汇总:', {
            currentPlayer: gameState.getCurrentPlayer(),
            gamePhase: gameState.getGamePhase(),
            diceValue: gameState.getDiceValue(),
            winner: gameState.getWinner()
        });

        // 如果游戏处于暂停状态，不应启动重连进度条
        if (gameState.getIsPaused()) {
            console.log('[重连进度条] 跳过：当前游戏处于暂停状态，不启动进度条');
        }
        // 只有“真正断线重连”才启动重连进度条；正常进入游戏/首次同步不应触发
        else if (this.isReconnecting || this._didDisconnectOnce) {
            this.startProgressBarAfterReconnect();
        } else {
            console.log('[重连进度条] 跳过：当前为正常进入/首次同步，不启动重连进度条');
        }
    }

    /**
     * 重连后启动进度条
     * 根据当前游戏状态和玩家身份决定是否启动进度条
     * 注意：此方法会保留服务器恢复的thinkingStartTime，确保进度条与其他玩家同步
     */
    startProgressBarAfterReconnect() {
        const currentGamePhase = gameState.getGamePhase();
        let currentPlayer = gameState.getCurrentPlayer();

        console.log(`[重连进度条] 开始处理，当前阶段=${currentGamePhase}，当前玩家=${currentPlayer}`);

        // 如果currentPlayer为null，尝试从激活玩家列表获取
        if (!currentPlayer) {
            const activePlayers = activePlayerManager.getActivePlayers() || [1];
            currentPlayer = activePlayers[0] || 1;
            gameState.setCurrentPlayer(currentPlayer);
            console.log(`[重连进度条] currentPlayer为null，使用激活玩家: ${currentPlayer}`);
        }

        // 只有在rolling或selecting阶段才需要启动进度条
        if (currentGamePhase !== 'rolling' && currentGamePhase !== 'selecting') {
            console.log(`[重连进度条] 不启动：当前阶段为${currentGamePhase}`);
            return;
        }

        // 检查是否有恢复的思考开始时间
        const hasRestoredThinkingTime = gameState.thinkingStartTime !== null;

        // 获取本地玩家信息
        const localPlayerNumber = this.getPlayerNumberByPlayerId(this.playerId);
        const currentPlayerId = this.getPlayerIdByPlayerNumber(currentPlayer);
        const currentPlayerData = this.players.get(currentPlayerId);
        const isCurrentPlayerAI = currentPlayerData?.isAI || false;
        const isCurrentPlayerAITakeover = this.aiTakeoverPlayers?.has(currentPlayerId) || currentPlayerData?.isAITakeover || false;

        // 判断是否需要启动进度条（带超时回调）
        // 条件：当前玩家是本地玩家且不是AI，或者本地是房主且当前玩家不是AI（房主代理所有非AI玩家）
        const shouldStartWithCallback = (currentPlayer === localPlayerNumber && !isCurrentPlayerAI) ||
            (this.isHost && !isCurrentPlayerAI);

        // 显示进度条UI
        const progressContainer = document.getElementById('thinkingProgressContainer');
        const progressBar = document.getElementById('thinkingProgressBar');

        if (progressContainer && progressBar) {
            progressContainer.className = `thinking-progress-container active player-${currentPlayer}`;

            // 如果有恢复的思考开始时间，计算当前进度
            if (hasRestoredThinkingTime) {
                const elapsed = Date.now() - gameState.thinkingStartTime;
                const progress = Math.min(100, (elapsed / gameState.THINKING_TIME) * 100);
                progressBar.style.width = `${progress}%`;
                console.log(`[重连] 恢复进度条进度: ${progress.toFixed(1)}%`);

                // 计算剩余时间
                const remainingTime = Math.max(0, gameState.THINKING_TIME - elapsed);

                if (remainingTime <= 0) {
                    // 时间已经用完，立即触发超时
                    console.log('[重连] 思考时间已用完，触发超时');
                    if (shouldStartWithCallback && this.gameInstance?.dice?.handleThinkingTimeoutWrapper) {
                        this.gameInstance.dice.handleThinkingTimeoutWrapper();
                    }
                    return;
                }

                // 设置剩余时间的超时回调
                if (shouldStartWithCallback) {
                    console.log(`[重连] 设置剩余${remainingTime}ms的超时回调`);
                    gameState._thinkingTimerContext = {
                        startTime: gameState.thinkingStartTime,
                        player: currentPlayer,
                        phase: currentGamePhase
                    };
                    gameState.thinkingTimer = setTimeout(() => {
                        console.log(`重连后玩家${currentPlayer}思考时间到，自动切换到下一个玩家`);
                        if (this.gameInstance?.dice?.handleThinkingTimeoutWrapper) {
                            this.gameInstance.dice.handleThinkingTimeoutWrapper();
                        }
                    }, remainingTime);
                }
            } else {
                // 没有恢复的思考开始时间，从0%开始
                progressBar.style.width = '0%';
                gameState.thinkingStartTime = Date.now();
                gameState.pausedThinkingTime = 0;

                // 设置完整时间的超时回调
                if (shouldStartWithCallback) {
                    console.log(`[重连] 无恢复时间，设置完整${gameState.THINKING_TIME}ms的超时回调`);
                    gameState._thinkingTimerContext = {
                        startTime: gameState.thinkingStartTime,
                        player: currentPlayer,
                        phase: currentGamePhase
                    };
                    gameState.thinkingTimer = setTimeout(() => {
                        console.log(`重连后玩家${currentPlayer}思考时间到，自动切换到下一个玩家`);
                        if (this.gameInstance?.dice?.handleThinkingTimeoutWrapper) {
                            this.gameInstance.dice.handleThinkingTimeoutWrapper();
                        }
                    }, gameState.THINKING_TIME);
                }
            }

            // 启动进度条更新循环
            if (uiUpdater && uiUpdater.updateProgressBarLoop) {
                uiUpdater.updateProgressBarLoop();
            }
        }

        console.log(`重连后启动进度条：当前玩家${currentPlayer}，阶段${currentGamePhase}，本地玩家${localPlayerNumber}，有恢复时间=${hasRestoredThinkingTime}`);

        // 如果当前玩家是本地玩家且开启了AI托管，触发AI操作
        // 或者当前玩家是AI电脑玩家且本地是房主，触发AI操作
        const shouldTriggerAI = (currentPlayer === localPlayerNumber && isCurrentPlayerAITakeover) ||
            (isCurrentPlayerAI && this.isHost);

        if (shouldTriggerAI) {
            console.log(`[重连] 当前玩家需要AI操作，延迟触发botController`);
            setTimeout(() => {
                console.log(`[重连] 触发botController.handleBotTurn()`);
                if (window.botController && !window.botController.isProcessing) {
                    window.botController.handleBotTurn();
                }
            }, 800); // 延迟确保状态完全恢复
        }
    }

    /**
     * 同步骰子动画开始
     * @param {number} playerNumber - 触发玩家的编号（1-4）
     */
    syncDiceAnimationStart(playerNumber) {
        this.sendMessage('diceAnimationStart', {
            triggerPlayerNumber: playerNumber,
            timestamp: Date.now()
        });
    }

    /**
     * 处理骰子动画开始同步
     */
    handleDiceAnimationStart(data) {
        // 所有玩家都需要停止思考进度条
        if (this.gameInstance && this.gameInstance.uiUpdater) {
            this.gameInstance.uiUpdater.stopThinkingProgressBar();
        }

        // 获取触发动画的玩家编号（1-4）
        const triggerPlayerNumber = data.triggerPlayerNumber;

        if (window.audioManager) {
            window.audioManager.playRollingSound();
        }

        // 所有玩家都显示骰子动画
        const diceDisplay = document.getElementById('diceDisplay');
        if (diceDisplay) {
            // 使用 triggerPlayerNumber 作为玩家编号
            const playerNumber = triggerPlayerNumber;
            if (playerNumber !== null) {
                // 在开始动画前，根据当前游戏状态判断是否是第三次连续6的高危投掷，
                try {
                    const gs = window.gameState;
                    const consecutiveSixes = typeof gs?.getConsecutiveSixes === 'function' ? gs.getConsecutiveSixes() : gs?.consecutiveSixes;
                    const isThirdSixRisk = !!consecutiveSixes && consecutiveSixes >= 2;
                    if (isThirdSixRisk) {
                        diceDisplay.classList.remove('dice-penalty-warning');
                        diceDisplay.classList.add('dice-third-penalty');
                    }
                } catch (e) {
                    // ignore
                }

                // 清除之前的定时器（防止多次触发导致的动画残留）
                if (this.currentFlashInterval) {
                    clearInterval(this.currentFlashInterval);
                    this.currentFlashInterval = null;
                }

                // 清除之前的安全兜底定时器
                if (this._diceFlashSafetyTimer) {
                    clearTimeout(this._diceFlashSafetyTimer);
                    this._diceFlashSafetyTimer = null;
                }

                // 清除之前的玩家样式和状态
                diceDisplay.className = diceDisplay.className.replace(/player-\d+/g, '');
                diceDisplay.classList.remove('rolled', 'not-rolled');

                // 添加闪烁动画类，但不添加玩家颜色样式
                diceDisplay.classList.add('dice-flashing');

                // 闪烁过程中随机显示不同点数
                const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                const flashInterval = setInterval(() => {
                    const randomIndex = Math.floor(Math.random() * 6);
                    diceDisplay.textContent = DICE_SYMBOLS[randomIndex];
                }, 100);

                // 将flashInterval存储到实例变量中，以便在收到服务器结果时停止
                this.currentFlashInterval = flashInterval;
                this.currentDiceSymbols = DICE_SYMBOLS;

                // 安全兜底：极端网络波动下可能收到动画开始但收不到结果(diceRoll)，导致闪烁永久不结束。
                // 这里加超时强制停止，避免游戏被卡死。
                this._diceFlashSafetyTimer = setTimeout(() => {
                    if (!this.currentFlashInterval) return;
                    console.warn('[联机] 骰子动画超时未收到结果，强制停止闪烁并尝试恢复显示');
                    this.stopDiceFlashing();

                    // 尝试用当前本地状态刷新骰子显示（forceDiceValue会覆盖闪烁保护）
                    try {
                        const gs = this.gameInstance?.gameState || window.gameState;
                        const diceValue = gs?.diceValue || 0;
                        if (this.gameInstance?.uiUpdater?.updateDiceDisplay) {
                            this.gameInstance.uiUpdater.updateDiceDisplay(diceValue);
                        }

                        // 解除防抖，允许玩家继续操作（避免永远无法再次掷骰）
                        if (gs) {
                            gs.isRolling = false;
                        }
                    } catch (e) {
                        // ignore
                    }
                }, 8000);
            }
        }
    }
    /**
     * 同步骰子结果
     * @param {number} diceValue - 骰子点数
     * @param {number} player - 玩家编号
     * @param {boolean} isRemoteDice - 是否是遥控骰子（遥控骰子不计入统计）
     */
    syncDiceRoll(diceValue, player, isRemoteDice = false) {
        this.sendMessage('diceRoll', {
            diceValue,
            player: player, // 明确传递玩家编号，而不是playerId
            isRemoteDice: isRemoteDice, // 标记是否是遥控骰子
            timestamp: Date.now()
        });
    }

    /**
     * 同步骰子显示（遥控骰子道具）
     */
    syncDiceDisplay(diceValue) {
        this.sendMessage('diceDisplay', {
            diceValue,
            timestamp: Date.now()
        });
    }

    /**
     * 同步传送门图标显示
     */
    syncTeleportIcon(show) {
        this.sendMessage('teleportIcon', {
            show,
            timestamp: Date.now()
        });
    }

    /**
     * 同步多面骰子显示
     */
    syncPolyhedralDice(diceValue) {
        this.sendMessage('polyhedralDice', {
            diceValue,
            timestamp: Date.now()
        });
    }

    /**
     * 同步盲盒图标显示
     */
    syncMysteryBoxIcon(energyGain, playerNumber) {
        this.sendMessage('mysteryBoxIcon', {
            energyGain,
            playerNumber,
            timestamp: Date.now()
        });
    }

    /**
     * 同步移除盲盒图标
     */
    syncRemoveMysteryBoxIcon() {
        this.sendMessage('removeMysteryBoxIcon', {
            timestamp: Date.now()
        });
    }

    /**
     * 同步积分数值动画
     */
    syncEnergyGainAnimation(energyGain) {
        this.sendMessage('energyGainAnimation', {
            energyGain,
            timestamp: Date.now()
        });
    }

    /**
     * 处理骰子显示同步（遥控骰子道具）
     */
    handleDiceDisplay(data) {
        const diceDisplay = document.getElementById('diceDisplay');
        const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        if (diceDisplay && data.diceValue) {
            diceDisplay.textContent = DICE_SYMBOLS[data.diceValue - 1];
            // 添加遥控骰子红色发光特效（包括本地玩家）
            diceDisplay.classList.add('remote-dice');
        }
    }

    /**
     * 处理传送门图标显示同步
     */
    handleTeleportIcon(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        if (data.show) {
            console.log(`[同步] 玩家${this.getPlayerNumberByPlayerId(data.playerId)}开启传送门`);
        }

        if (this.gameInstance && this.gameInstance.skillManager) {
            if (data.show) {
                // 播放道具音效
                if (window.audioManager) {
                    window.audioManager.playSkillSound();
                }
                this.gameInstance.skillManager.showTeleportIcon();
            } else {
                this.gameInstance.skillManager.restoreDiceIcon();
            }
        }
    }

    /**
     * 处理多面骰子显示同步
     */
    handlePolyhedralDice(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        console.log(`[同步] 玩家${this.getPlayerNumberByPlayerId(data.playerId)}使用多面骰子: ${data.diceValue}`);

        // 播放道具音效
        if (window.audioManager) {
            window.audioManager.playSkillSound();
        }

        if (this.gameInstance && this.gameInstance.skillManager) {
            this.gameInstance.skillManager.showPolyhedralDice(data.diceValue);
        }
    }

    /**
     * 处理盲盒图标显示同步
     */
    handleMysteryBoxIcon(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        // 播放道具音效
        if (window.audioManager) {
            window.audioManager.playSkillSound();
        }

        if (this.gameInstance && this.gameInstance.skillManager) {
            const playerNumber = this.getPlayerNumberByPlayerId(data.playerId);
            this.gameInstance.skillManager.showMysteryBoxIcon(playerNumber);
        }
    }

    /**
     * 处理移除盲盒图标同步
     */
    handleRemoveMysteryBoxIcon(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        if (this.gameInstance && this.gameInstance.skillManager) {
            this.gameInstance.skillManager.removeMysteryBoxIcon();
        }
    }

    /**
     * 处理积分数值动画同步
     */
    handleEnergyGainAnimation(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        // 获取玩家编号
        const playerNumber = this.getPlayerNumberByPlayerId(data.playerId);

        if (this.gameInstance && this.gameInstance.skillManager) {
            this.gameInstance.skillManager.showEnergyGainAnimation(data.energyGain, playerNumber);
        }
    }

    /**
     * 处理骰子结果同步
     */
    handleDiceRolled(data) {
        this.stopDiceFlashing();

        // 收到任何掷骰子消息，说明游戏正式开始
        if (this.gameInstance && this.gameInstance.gameState && !this.gameInstance.gameState.getGameOfficiallyStarted()) {
            this.gameInstance.gameState.setGameOfficiallyStarted(true);
            console.log('[同步] 收到首个掷骰消息，标记游戏正式开始');
            
            // 更新按钮状态
            if (window.aiTakeoverManager && typeof window.aiTakeoverManager.updateToggleButton === 'function') {
                window.aiTakeoverManager.updateToggleButton();
            }
        }

        const diceDisplay = document.getElementById('diceDisplay');

        // 更新游戏状态 - 强制同步骰子值（必须在更新显示之前）
        if (this.gameInstance && this.gameInstance.gameState) {
            // 强制更新本地游戏状态的骰子值，确保与网络同步的值一致
            this.gameInstance.gameState.diceValue = data.diceValue;

            this.gameInstance.gameState.setGamePhase('selecting');

            if (data.consecutiveSixes !== undefined) {
                this.gameInstance.gameState.consecutiveSixes = data.consecutiveSixes;
            }

            // 记录骰子投掷（用于称号统计）
            const dicePlayerNumber = data.player !== undefined ? data.player : this.getPlayerNumberByPlayerId(data.playerId);
            if (dicePlayerNumber) {
                this.gameInstance.gameState.recordDiceRollForTitle(dicePlayerNumber, data.diceValue, data.isRemoteDice);
            }

            //同步canReroll和justRolledSix状态
            if (data.canReroll !== undefined) {
                this.gameInstance.gameState.canReroll = data.canReroll;
            }
            if (data.justRolledSix !== undefined) {
                this.gameInstance.gameState.justRolledSix = data.justRolledSix;
            }

            // 更新本地骰子统计（非遥控骰子时）- 保持数据一致性
            // 只有当消息不是自己发送的时候才更新（自己发送的已在dice.js中更新）
            if (data.playerId !== this.playerId && !data.isRemoteDice) {
                const dicePlayerNumber = data.player !== undefined ? data.player : this.getPlayerNumberByPlayerId(data.playerId);
                if (dicePlayerNumber && this.gameInstance.gameState.diceStatistics &&
                    this.gameInstance.gameState.diceStatistics[dicePlayerNumber]) {
                    this.gameInstance.gameState.diceStatistics[dicePlayerNumber][data.diceValue]++;
                }
            }
        }

        // 更新骰子显示 - 强制所有玩家显示相同的结果
        if (diceDisplay) {
            const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

            // 清除所有可能的等待状态样式和闪烁动画
            diceDisplay.classList.remove('dice-waiting', 'dice-flashing');

            // 强制更新骰子显示，确保所有玩家看到相同的结果
            diceDisplay.textContent = DICE_SYMBOLS[data.diceValue - 1];

            // 获取当前玩家编号 - 优先使用data.player，如果没有则从playerId推断
            const playerNumber = data.player !== undefined ? data.player : this.getPlayerNumberByPlayerId(data.playerId);
            if (playerNumber !== null) {
                // 清除之前的玩家样式
                diceDisplay.className = diceDisplay.className.replace(/player-\d+/g, '');
                // 添加基础类
                diceDisplay.classList.add('dice-icon');
                // 添加当前玩家的样式
                diceDisplay.classList.add(`player-${playerNumber}`);
                diceDisplay.classList.add('rolled');
                diceDisplay.classList.remove('dice-flashing'); // 确保结果展示时移除闪烁
                diceDisplay.classList.add('dice-glowing'); // 确保结果展示时有发光效果
            }
        } else {
            console.error('[调试] 找不到diceDisplay元素!');
        }

        // 忽略自己发送的消息（已经在本地处理过了，后续的游戏状态更新逻辑由发起者在本地完成）
        if (data.playerId === this.playerId) {
            return;
        }

        console.log(`[同步] 玩家${data.player}掷出了${data.diceValue}点`);

        // 获取本地玩家编号和掷骰子玩家编号
        const localPlayerNumber = this.getPlayerNumberByPlayerId(this.playerId);
        const dicePlayerNumber = data.player !== undefined ? data.player : this.getPlayerNumberByPlayerId(data.playerId);

        // 添加到游戏信息 - 优先使用data.player确保显示正确的玩家昵称
        // 只有非本地操作的骰子结果才需要添加（本地操作已在dice.js中添加）
        // 判断依据：检查消息的playerId是否是自己，而不是检查playerNumber
        // 因为房主可能代理AI玩家操作，此时playerNumber != localPlayerNumber，但消息是自己发的
        if (this.gameInstance && this.gameInstance.gameInfo && dicePlayerNumber !== null) {
            // 只有当消息不是自己发送的时候，才添加到游戏信息
            if (data.playerId !== this.playerId && !data.isRemoteDice) {
                // 使用skipSync=true避免重复同步
                this.gameInstance.gameInfo.addDiceRoll(dicePlayerNumber, data.diceValue, true);
            }
        }

        // 处理掷骰子结果 - 判断是否需要处理后续逻辑
        const isLocalPlayerTurn = data.player === localPlayerNumber;

        // 检查是否是AI托管玩家（房主需要代理处理）
        const dicePlayerId = this.getPlayerIdByPlayerNumber(data.player);
        const dicePlayerData = this.players.get(dicePlayerId);
        const isAIPlayer = dicePlayerData?.isAI || false;
        const isAITakeoverPlayer = this.aiTakeoverPlayers.has(dicePlayerId) || dicePlayerData?.isAITakeover || false;
        const shouldHostHandle = this.isHost && (isAIPlayer || isAITakeoverPlayer);

        // 本地玩家的回合，或者房主代理AI/托管玩家
        if (isLocalPlayerTurn || shouldHostHandle) {
            // 重置防抖标志，允许后续操作
            if (this.gameInstance && this.gameInstance.gameState) {
                this.gameInstance.gameState.isRolling = false;
            }
        }

        // 更新UI显示 - 但要确保骰子显示不被覆盖
        if (this.gameInstance && this.gameInstance.uiUpdater) {
            // 更新UI
            this.gameInstance.uiUpdater.updateUI();

            // 立即重新设置骰子显示，防止被updateUI覆盖
            if (diceDisplay) {
                const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                const correctContent = DICE_SYMBOLS[data.diceValue - 1];
                const playerNumber = data.player !== undefined ? data.player : this.getPlayerNumberByPlayerId(data.playerId);
                diceDisplay.textContent = correctContent;

                // 清除可能被updateUI添加的错误样式
                diceDisplay.classList.remove('dice-waiting', 'dice-flashing', 'not-rolled', 'dice-glowing');

                // 确保正确的样式
                if (playerNumber !== null) {
                    diceDisplay.classList.add('rolled', `player-${playerNumber}`);
                }
            }

            // 强制确保骰子显示正确的结果
            if (diceDisplay) {
                const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                const expectedContent = DICE_SYMBOLS[data.diceValue - 1];
                // 无论如何都重新设置正确的显示
                diceDisplay.textContent = expectedContent;

                // 确保样式正确 - 使用data.player而不是data.playerId
                const playerNumber = data.player !== undefined ? data.player : this.getPlayerNumberByPlayerId(data.playerId);
                if (playerNumber !== null) {
                    // 清除可能的等待状态
                    diceDisplay.classList.remove('dice-waiting', 'dice-flashing', 'not-rolled');
                    // 确保有正确的样式
                    diceDisplay.classList.add('rolled', `player-${playerNumber}`);
                }
            }
        }
    }

    /**
     * 同步棋子移动
     */
    syncPieceMove(fromPosition, toPosition, playerId, pieceId) {
        this.sendMessage('pieceMove', {
            fromPosition,
            toPosition,
            playerId,
            pieceId,
            timestamp: Date.now()
        });
    }

    /**
     * 处理棋子移动同步
     */
    handlePieceMove(data) {
        if (data.playerId !== this.playerId) {
            // 其他玩家的棋子移动，需要同步显示
            console.log(`玩家${data.playerId}移动棋子从${data.fromPosition}到${data.toPosition}`);

            // 播放棋子移动音效
            if (window.audioManager) {
                window.audioManager.playMoveSound();
            }

            // 这里需要调用游戏实例的棋子移动方法
            if (this.gameInstance && this.gameInstance.chessPiece) {
                // 同步移动棋子（不触发额外的网络消息）
                this.gameInstance.chessPiece.syncMoveFromNetwork(data);
            }
        }
    }

    /**
     * 同步棋子移动
     */
    syncChessMove(player, chessIndex, fromPositionOrTargetPosition, toPosition = null, moveType = 'normal') {
        if (this.wsClient && this.wsClient.readyState === PollingTransport.OPEN) {
            // 向后兼容：如果只传3个参数，认为第3个参数是targetPosition
            let finalFromPosition = null;
            let finalToPosition = fromPositionOrTargetPosition;
            let finalMoveType = 'normal';

            if (toPosition !== null) {
                // 新的调用方式：4或5个参数
                finalFromPosition = fromPositionOrTargetPosition;
                finalToPosition = toPosition;
                finalMoveType = moveType;
            }

            this.sendMessage('chessMove', {
                player: player,
                chessIndex: chessIndex,
                position: finalToPosition, // 保持向后兼容
                fromPosition: finalFromPosition,
                toPosition: finalToPosition,
                moveType: finalMoveType,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 处理棋子移动同步
     */
    handleChessMove(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        // 记录上一次同步移动的棋子，避免重复打印（因为逐格移动会发送多条消息）
        if (this._lastSyncedMove?.player !== data.player || this._lastSyncedMove?.chessIndex !== data.chessIndex) {
            
            // 将其他玩家的棋子移动添加到本地游戏信息日志中
            const isLaunch = data.fromPosition === -1 && data.position === 0;
            const isNormalMove = !isLaunch && data.moveType !== 'teleport';
            
            if (isLaunch) {
                console.log(`[同步] 玩家${data.player}的棋子${data.chessIndex}起飞`);
            } else if (isNormalMove) {
                console.log(`[同步] 玩家${data.player}选择了棋子${data.chessIndex}移动`);
            }
            
            this._lastSyncedMove = { player: data.player, chessIndex: data.chessIndex };
        }

        // 更新游戏状态中的棋子位置
        if (this.gameInstance && this.gameInstance.gameState) {
            const chess = this.gameInstance.gameState.playerChess[data.player]?.[data.chessIndex];
            const previousPosition = chess?.position;

            // 更新位置
            this.gameInstance.gameState.updateChessPosition(data.player, data.chessIndex, data.position);

            // 记录起飞尝试结果（用于称号统计）：成功
            this.gameInstance.gameState.recordTakeoffAttempt(data.player, true);

            // 记录距离统计
            if (previousPosition !== undefined) {
                // 起飞
                if (previousPosition === -1 && data.position === 0) {
                    this.gameInstance.gameState.incrementTotalDistance(data.player, 1);
                } 
                // 传送
                else if (data.moveType === 'teleport') {
                    if (data.position > previousPosition) {
                        this.gameInstance.gameState.incrementTotalDistance(data.player, data.position - previousPosition);
                    }
                }
                // 普通步进（由animateChessMovement循环发送）
                else if (data.position > previousPosition) {
                    this.gameInstance.gameState.incrementTotalDistance(data.player, data.position - previousPosition);
                }
            }

            // 播放音效
            if (previousPosition !== undefined && window.audioManager) {
                // 从基地起飞（-1到0）播放fly音效
                if (previousPosition === -1 && data.position === 0) {
                    window.audioManager.playFlySound();
                }
                // 普通移动（位置变化为1）播放move音效
                // 跳子和飞棋的音效由专门的handleJumpAnimation和handleFlyAnimation处理
                else if (previousPosition !== -1 && data.moveType !== 'teleport') {
                    const positionDiff = Math.abs(data.position - previousPosition);
                    if (positionDiff === 1) {
                        window.audioManager.playMoveSound();
                    }
                }
            }

            if (data.position === 56 && chess) {
                console.log(`棋子到达终点位置56，更新视觉位置后设置finished状态: 玩家${data.player}的棋子${data.chessIndex}`);
                // 先更新视觉位置到56，让其他玩家看到这一步
                if (this.gameInstance.chessPiece && this.gameInstance.chessPiece.animation) {
                    this.gameInstance.chessPiece.animation.bringToFront(data.player, data.chessIndex);
                    this.gameInstance.chessPiece.animation.updateChessPosition(data.player, data.chessIndex);
                }
                // 设置finished状态，但不立即return，让后续可能的反弹消息能正确处理
                chess.finished = true;
                return;
            } else if (data.position === -1 && chess) {
                // 如果位置是-1（起始区域），清除finished状态
                chess.finished = false;
                // 位置-1需要特殊处理，由 moveChessToStart 同步消息处理
                return;
            }

            // 如果是传送门移动，播放传送动画
            if (data.moveType === 'teleport' && chess && chess.element) {
                // 播放传送音效
                if (window.audioManager) {
                    window.audioManager.playFlySound();
                }

                const chessElement = chess.element;
                // 淡出效果
                chessElement.style.transition = 'opacity 0.2s ease-out';
                chessElement.style.opacity = '0';

                // 等待淡出完成后更新位置
                setTimeout(() => {
                    // 更新视觉位置前移到最顶层
                    if (this.gameInstance.chessPiece && this.gameInstance.chessPiece.animation) {
                        this.gameInstance.chessPiece.animation.bringToFront(data.player, data.chessIndex);
                        this.gameInstance.chessPiece.animation.updateChessPosition(data.player, data.chessIndex);
                    }

                    // 淡入效果
                    setTimeout(() => {
                        chessElement.style.opacity = '1';

                        // 动画完成后清除transition
                        setTimeout(() => {
                            chessElement.style.transition = '';
                        }, 200);
                    }, 50);
                }, 200);
            } else {
                // 普通移动，直接更新视觉位置（只对普通位置0-55）
                if (this.gameInstance.chessPiece && this.gameInstance.chessPiece.animation) {
                    // 远程移动前先将棋子移到最顶层
                    this.gameInstance.chessPiece.animation.bringToFront(data.player, data.chessIndex);
                    this.gameInstance.chessPiece.animation.updateChessPosition(data.player, data.chessIndex);
                }
            }
        }
    }

    /**
     * 同步棋盘状态
     */
    syncBoardState() {
        if (this.wsClient && this.wsClient.readyState === PollingTransport.OPEN && this.gameInstance) {
            const boardState = {
                playerChess: this.gameInstance.gameState.getAllChessStates(),
                currentPlayer: this.gameInstance.gameState.getCurrentPlayer(),
                gamePhase: this.gameInstance.gameState.getGamePhase(),
                diceValue: this.gameInstance.gameState.getDiceValue(),
                winner: this.gameInstance.gameState.getWinner(),
                defeatCounts: this.gameInstance.gameState.getAllDefeatCounts()
            };

            this.sendMessage('boardState', {
                boardState: boardState,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 处理棋盘状态同步
     */
    handleBoardState(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        console.log('同步棋盘状态:', data.boardState);

        if (this.gameInstance && this.gameInstance.gameState) {
            const boardState = data.boardState;

            // 更新棋子状态
            if (boardState.playerChess) {
                for (let player = 1; player <= 4; player++) {
                    if (boardState.playerChess[player]) {
                        for (let i = 0; i < boardState.playerChess[player].length; i++) {
                            const chessState = boardState.playerChess[player][i];
                            this.gameInstance.gameState.updateChessPosition(player, i, chessState.position);
                            this.gameInstance.gameState.setChessFinished(player, i, chessState.finished);
                        }
                    }
                }

                // 更新所有棋子的视觉位置
                if (this.gameInstance.chessPiece) {
                    this.gameInstance.chessPiece.updateAllChessPositions();
                }
            }

            // 更新游戏状态
            if (boardState.currentPlayer !== undefined) {
                this.gameInstance.gameState.setCurrentPlayer(boardState.currentPlayer);
            }
            if (boardState.gamePhase !== undefined) {
                this.gameInstance.gameState.setGamePhase(boardState.gamePhase);
            }
            if (boardState.diceValue !== undefined) {
                this.gameInstance.gameState.setDiceValue(boardState.diceValue);
            }
            if (boardState.winner !== undefined) {
                this.gameInstance.gameState.setWinner(boardState.winner);
            }

            // 更新击败次数统计
            if (boardState.defeatCounts) {
                this.gameInstance.gameState.defeatCounts = boardState.defeatCounts;
            }

            // 更新UI
            if (this.gameInstance.uiUpdater) {
                this.gameInstance.uiUpdater.updateUI();
            }
        }
    }

    /**
     * 同步积分变化
     * @param {number} player - 玩家编号
     * @param {number} energy - 新的积分值
     * @param {number} delta - 积分变化量
     * @param {string} source - 积分来源
     * @param {number} targetPlayer - 目标玩家
     * @param {number} targetChessIndex - 目标棋子
     */
    syncEnergyChange(player, energy, delta, source = null, targetPlayer = null, targetChessIndex = null) {
        if (this.wsClient && this.wsClient.readyState === PollingTransport.OPEN) {
            this.sendMessage('energyChange', {
                player: player,
                energy: energy,
                delta: delta,
                source: source,
                targetPlayer: targetPlayer,
                targetChessIndex: targetChessIndex,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 处理接收到的积分变化
     */
    async handleEnergyChange(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        // 导入积分管理器
        const { energyManager } = await import('./energyManager.js');

        if (energyManager.isSkillModeEnabled()) {
            // 如果是因为击杀获得积分，且有目标，播放粒子动画
            if (data.source === 'kill' && data.targetPlayer !== null && data.targetChessIndex !== null) {
                if (energyManager.energyDisplay) {
                    const startSource = this.consumeDefeatedChessPosition(data.targetPlayer, data.targetChessIndex) || data.targetPlayer;
                    energyManager.energyDisplay.playEnergyParticles(startSource, data.targetChessIndex, data.player, () => {
                        energyManager.setEnergy(data.player, data.energy, false);
                        energyManager.energyDisplay.showEnergyGainAnimation(data.player, data.delta);
                    }, data.delta);
                } else {
                    energyManager.setEnergy(data.player, data.energy, false);
                }
            } else if (data.source === 'mysteryBox' && data.delta > 0) {
                // 如果是盲盒获取积分，获取骰子元素作为起点
                if (energyManager.energyDisplay) {
                    const diceIcon = document.querySelector('.dice-icon');
                    if (diceIcon) {
                        energyManager.energyDisplay.playEnergyParticles(diceIcon, null, data.player, () => {
                            energyManager.setEnergy(data.player, data.energy, false);
                            energyManager.energyDisplay.showEnergyGainAnimation(data.player, data.delta);
                        }, data.delta);
                    } else {
                        energyManager.setEnergy(data.player, data.energy, false);
                        energyManager.energyDisplay.showEnergyGainAnimation(data.player, data.delta);
                    }
                } else {
                    energyManager.setEnergy(data.player, data.energy, false);
                }
            } else {
                // 直接设置积分值，不触发回调避免重复同步
                energyManager.setEnergy(data.player, data.energy, false);
                if (data.delta > 0 && energyManager.energyDisplay) {
                    energyManager.energyDisplay.showEnergyGainAnimation(data.player, data.delta);
                }
            }
        }
    }

    /**
     * 同步击败计数变化
     */
    syncDefeatCountChange(attackerPlayer, defeatedPlayer, count) {
        if (this.wsClient && this.wsClient.readyState === PollingTransport.OPEN) {
            this.sendMessage('defeatCountChange', {
                attackerPlayer: attackerPlayer,
                defeatedPlayer: defeatedPlayer,
                count: count,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 同步骰子统计数据到服务器
     * @param {number} player - 玩家编号
     * @param {number} diceValue - 骰子点数
     * @param {number} count - 该点数的投掷次数
     */
    syncDiceStatistics(player, diceValue, count) {
        if (this.isConnected) {
            this.sendMessage('diceStatisticsSync', {
                player: player,
                diceValue: diceValue,
                count: count,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 同步完成度历史记录到服务器
     * @param {Object} snapshot - 完成度快照
     * @param {number} currentRound - 当前回合数
     */
    syncProgressHistory(snapshot, currentRound) {
        if (this.isConnected) {
            this.sendMessage('progressHistorySync', {
                snapshot: snapshot,
                currentRound: currentRound,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 处理接收到的击败计数变化
     */
    async handleDefeatCountChange(data) {
        if (data.playerId === this.playerId) return; // 忽略自己的消息

        // 更新本地gameState中的击败计数
        if (window.gameState) {
            if (!window.gameState.defeatCounts[data.attackerPlayer]) {
                window.gameState.defeatCounts[data.attackerPlayer] = {};
            }
            window.gameState.defeatCounts[data.attackerPlayer][data.defeatedPlayer] = data.count;

            // 更新显示
            const { defeatCountDisplay } = await import('./defeatCountDisplay.js');
            defeatCountDisplay.updateDefeatCount(
                data.attackerPlayer,
                data.defeatedPlayer,
                data.count
            );
        }
    }

    /**
     * 同步游戏状态
     */
    syncGameState(gameState) {
        if (this.isHost) {
            this.sendMessage('gameStateSync', {
                gameState: {
                    currentPlayer: gameState.currentPlayer,
                    gamePhase: gameState.gamePhase,
                    diceValue: gameState.diceValue,
                    isPaused: gameState.isPaused,
                    winner: gameState.winner
                },
                timestamp: Date.now()
            });
        }
    }

    /**
     * 处理游戏状态同步
     */
    handleGameStateSync(data) {
        if (!this.isHost && this.gameInstance && this.gameInstance.gameState) {
            // 非房主接收房主的游戏状态同步
            const gameState = this.gameInstance.gameState;
            const syncData = data.gameState;

            console.log('同步游戏状态:', syncData);

            // 更新游戏状态
            if (syncData.currentPlayer !== undefined) {
                gameState.setCurrentPlayer(syncData.currentPlayer);
            }
            if (syncData.gamePhase !== undefined) {
                gameState.setState('gamePhase', syncData.gamePhase);
            }
            if (syncData.diceValue !== undefined) {
                gameState.diceValue = syncData.diceValue;
            }
            if (syncData.isPaused !== undefined) {
                gameState.setState('isPaused', syncData.isPaused);
            }
            if (syncData.winner !== undefined) {
                gameState.winner = syncData.winner;
            }

            // 更新UI
            if (this.gameInstance.uiUpdater) {
                this.gameInstance.uiUpdater.updateUI();
            }
        }
    }

    /**
     * 同步玩家回合变化
     */
    syncPlayerTurnChange(newPlayer, extra = null) {
        const payload = {
            newPlayer: newPlayer,
            timestamp: Date.now()
        };

        if (extra && typeof extra === 'object') {
            Object.assign(payload, extra);
        }

        this.sendMessage('playerTurnChange', payload);
    }

    /**
     * 同步无法移动状态
     */
    syncNoMovableChess(player, diceValue) {
        this.sendMessage('noMovableChess', {
            playerId: this.playerId,  // 添加发送者ID，用于过滤重复消息
            player: player,
            diceValue: diceValue,
            timestamp: Date.now()
        });
    }

    /**
     * 处理玩家回合变化
     */
    handlePlayerTurnChange(data) {
        // 检查data.newPlayer是否存在
        if (data.newPlayer !== undefined && data.newPlayer !== null) {
            // 清除传送门模式（如果存在）
            if (window.gameInstance) {
                window.gameInstance.isTeleportMode = false;
            }

            // 恢复骰子显示（清除传送门图标和遥控骰子特效）
            if (this.gameInstance && this.gameInstance.skillManager) {
                this.gameInstance.skillManager.restoreDiceIcon();
            }

            // 清除遥控骰子特效
            const diceDisplay = document.getElementById('diceDisplay');
            if (diceDisplay) {
                diceDisplay.classList.remove('remote-dice');
            }

            // 更新游戏状态
            if (this.gameInstance && this.gameInstance.gameState) {
                this.gameInstance.gameState.setCurrentPlayer(data.newPlayer);
                this.gameInstance.gameState.setGamePhase('rolling');
                this.gameInstance.gameState.setDiceValue(0);
                this.gameInstance.gameState.setSelectedChess(null);
                this.gameInstance.gameState.setConsecutiveSixes(0);
                this.gameInstance.gameState.setCanReroll(false);

                // 同步activePlayerManager的当前玩家状态
                activePlayerManager.setCurrentActivePlayer(data.newPlayer);

                // 更新UI（包括骰子权限状态）
                if (this.gameInstance.uiUpdater) {
                    // 先停止旧的进度条（无论是谁的回合）
                    if (this.gameInstance.uiUpdater.stopThinkingProgressBar) {
                        this.gameInstance.uiUpdater.stopThinkingProgressBar();
                    }

                    this.gameInstance.uiUpdater.updateUI();

                    // 检查新玩家是否是AI电脑玩家
                    const playerIdForProgressBar = this.getPlayerIdByPlayerNumber(data.newPlayer);
                    const playerDataForProgressBar = this.players.get(playerIdForProgressBar);
                    const isNewPlayerAI = playerDataForProgressBar?.isAI || false;
                    const isNewPlayerAITakeover = this.aiTakeoverPlayers.has(playerIdForProgressBar) || playerDataForProgressBar?.isAITakeover || false;

                    // 观战模式也启动倒计时，但没有超时回调
                    if (this.isSpectator) {
                        this.gameInstance.gameState.startThinkingTimer(null);
                        if (this.gameInstance.uiUpdater && this.gameInstance.uiUpdater.updateProgressBarLoop) {
                            this.gameInstance.uiUpdater.updateProgressBarLoop();
                        }
                    } else {
                        // 启动新玩家的思考时间计时器（掷骰子阶段）
                        // 条件：
                        // 1. 当前玩家是本地玩家且不是AI电脑玩家
                        // 2. 当前客户端是房主，且当前玩家不是AI电脑玩家（房主为其他玩家代理超时，包括正常玩家和AI托管玩家）
                        const localPlayerNumber = this.getPlayerNumberByPlayerId(this.playerId);
                        const shouldStartProgressBar = (data.newPlayer === localPlayerNumber && !isNewPlayerAI) ||
                            (this.isHost && !isNewPlayerAI);

                        if (shouldStartProgressBar) {
                            this.gameInstance.uiUpdater.startThinkingProgressBar(() => {
                                console.log(`[超时] 玩家${data.newPlayer}思考超时`);
                                if (this.gameInstance && this.gameInstance.dice && this.gameInstance.dice.handleThinkingTimeoutWrapper) {
                                    this.gameInstance.dice.handleThinkingTimeoutWrapper();
                                }
                            });
                        } else if (!isNewPlayerAI) {
                            // 非房主且非本地玩家：启动定时器（无超时回调），仅用于维持进度条运行
                            this.gameInstance.gameState.startThinkingTimer(null);
                            if (this.gameInstance.uiUpdater && this.gameInstance.uiUpdater.updateProgressBarLoop) {
                                this.gameInstance.uiUpdater.updateProgressBarLoop();
                            }
                        }
                    }
                }

                // 统一处理：AI电脑玩家和AI托管玩家都由房主代理
                const playerIdForCheck = this.getPlayerIdByPlayerNumber(data.newPlayer);
                const currentPlayerData = this.players.get(playerIdForCheck);
                const isAIPlayer = currentPlayerData?.isAI || false;
                const isPlayerAITakeover = this.aiTakeoverPlayers.has(playerIdForCheck) || currentPlayerData?.isAITakeover || false;

                // 判断当前玩家是否需要AI操作（AI电脑或AI托管）
                const needsAIOperation = isAIPlayer || isPlayerAITakeover;

                if (needsAIOperation && this.isHost && !this.isSpectator) {
                    // 房主代理：统一处理AI电脑玩家和AI托管玩家
                    setTimeout(() => {
                        if (window.botController && this.gameInstance?.gameState) {
                            // 确保botController已启用
                            if (!window.botController.isEnabled) {
                                window.botController.setEnabled(true);
                            }

                            const currentPhase = this.gameInstance.gameState.getGamePhase();
                            const currentPlayer = this.gameInstance.gameState.getCurrentPlayer();

                            // botController会根据游戏阶段自动执行掷骰子或选择棋子
                            if ((currentPhase === 'rolling' || currentPhase === 'selecting') && currentPlayer === data.newPlayer) {
                                window.botController.handleBotTurn();
                            }
                        }
                    }, 500); // 延迟确保状态更新完成
                }
            }
        } else {
            console.error('playerTurnChange消息中缺少newPlayer属性:', data);
            // 发送错误消息给服务器
            this.sendMessage('error', {
                message: 'playerTurnChange消息中缺少newPlayer属性'
            });
        }
    }

    /**
     * 处理无法移动状态同步
     */
    handleNoMovableChess(data) {
        // 忽略自己发送的消息（避免重复显示）
        if (data.playerId === this.playerId && !this.isSpectator) {
            return;
        }

        console.log(`[同步] 玩家${data.player}无法移动任何棋子`);

        // 防止重复消息：检查timestamp
        if (!this._lastNoMovableChessMessages) {
            this._lastNoMovableChessMessages = new Map();
        }

        const messageKey = `${data.player}-${data.diceValue}`;
        const lastTimestamp = this._lastNoMovableChessMessages.get(messageKey);

        // 如果在500ms内收到相同的消息，认为是重复消息
        if (lastTimestamp && data.timestamp - lastTimestamp < 500) {
            console.log(`忽略重复的无法移动消息 - player: ${data.player}, diceValue: ${data.diceValue}, 时间差: ${data.timestamp - lastTimestamp}ms`);
            return;
        }

        // 记录当前消息的timestamp
        this._lastNoMovableChessMessages.set(messageKey, data.timestamp);

        // 记录起飞尝试结果（用于称号统计）：失败
        if (this.gameInstance && this.gameInstance.gameState) {
            this.gameInstance.gameState.recordTakeoffAttempt(data.player, false);
        }

        // 清理旧的记录（保留最近1秒的）
        setTimeout(() => {
            this._lastNoMovableChessMessages.delete(messageKey);
        }, 1000);

        // 添加到游戏信息面板
        if (this.gameInstance && this.gameInstance.gameInfo) {
            // 使用skipSync=true避免重复同步
            this.gameInstance.gameInfo.addNoMovableChess(data.player, data.diceValue, true);
        }

        // 停止骰子闪烁动画（如果正在进行）
        if (this.currentFlashInterval) {
            clearInterval(this.currentFlashInterval);
            this.currentFlashInterval = null;
        }

        // 添加骰子震动效果
        const diceDisplay = document.getElementById('diceDisplay');
        if (diceDisplay) {
            // 清除闪烁动画类
            diceDisplay.classList.remove('dice-flashing');

            // 添加震动效果
            diceDisplay.classList.add('dice-shake');
            setTimeout(() => {
                diceDisplay.classList.remove('dice-shake');
            }, 500);
        }

        // 延迟播放震动音效，避免与rolling音效冲突
        setTimeout(() => {
            if (window.audioManager) {
                window.audioManager.playShakeSound();
            }
        }, 300);
    }

    /**
     * 同步跳子动画
     */
    syncJumpAnimation(player, chessIndex, startPosition, targetPosition) {
        this.sendMessage('jumpAnimation', {
            player: player,
            chessIndex: chessIndex,
            startPosition: startPosition,
            targetPosition: targetPosition,
            timestamp: Date.now()
        });
    }

    /**
     * 同步飞棋动画
     */
    syncFlyAnimation(player, chessIndex, startPosition, targetPosition) {
        this.sendMessage('flyAnimation', {
            player: player,
            chessIndex: chessIndex,
            startPosition: startPosition,
            targetPosition: targetPosition,
            timestamp: Date.now()
        });
    }

    /**
     * 同步棋子回归起点动画
     */
    syncMoveChessToStart(player, chessIndex, reason = 'beat') {
        this.sendMessage('moveChessToStart', {
            player: player,
            chessIndex: chessIndex,
            reason: reason, // 'beat', 'stack_collision', 'bounce', etc.
            timestamp: Date.now()
        });
    }

    /**
     * 同步棋子到达终点动画
     */
    syncMoveChessToFinish(player, chessIndex) {
        this.sendMessage('moveChessToFinish', {
            player: player,
            chessIndex: chessIndex,
            timestamp: Date.now()
        });
    }

    /**
     * 同步叠子碰撞事件
     */
    syncStackCollision(player, targetPlayer, stackedChesses, collisionPosition) {
        this.sendMessage('stackCollision', {
            player: player,
            targetPlayer: targetPlayer,
            stackedChesses: stackedChesses,
            collisionPosition: collisionPosition,
            timestamp: Date.now()
        });
    }

    /**
     * 同步叠子反弹事件
     */
    syncStackBounce(player, chessIndex, startPosition, endPosition, bounceSteps) {
        this.sendMessage('stackBounce', {
            player: player,
            chessIndex: chessIndex,
            startPosition: startPosition,
            endPosition: endPosition,
            bounceSteps: bounceSteps,
            timestamp: Date.now()
        });
    }

    /**
     * 同步终点反弹事件
     */
    syncEndpointBounce(player, chessIndex, startPosition, endPosition, bounceSteps) {
        this.sendMessage('endpointBounce', {
            player: player,
            chessIndex: chessIndex,
            startPosition: startPosition,
            endPosition: endPosition,
            bounceSteps: bounceSteps,
            timestamp: Date.now()
        });
    }

    /**
     * 同步游戏结束和结算
     */
    syncGameEnd(winnerPlayer) {
        this.sendMessage('gameEnd', {
            winnerPlayer: winnerPlayer,
            timestamp: Date.now()
        });
    }

    /**
     * 同步强制结算
     */
    syncForceSettlement(rankings) {
        this.sendMessage('forceSettlement', {
            rankings: rankings,
            timestamp: Date.now()
        });
    }

    /**
     * 处理跳子动画同步
     */
    handleJumpAnimation(data) {
        if (data.playerId === this.playerId && !this.isSpectator) return; // 忽略自己的消息

        console.log(`[同步] 玩家${data.player}的棋子${data.chessIndex}触发跳跃`);

        // 播放跳跃音效
        if (window.audioManager) {
            window.audioManager.playFlySound();
        }

        // 执行跳子动画
        if (this.gameInstance && this.gameInstance.chessPiece && this.gameInstance.chessPiece.animation) {
            // 更新前先移到最顶层
            this.gameInstance.chessPiece.animation.bringToFront(data.player, data.chessIndex);
            
            // 更新棋子位置到起跳点
            this.gameInstance.gameState.updateChessPosition(data.player, data.chessIndex, data.startPosition);
            this.gameInstance.chessPiece.animation.updateChessPosition(data.player, data.chessIndex);

            // 执行跳子动画（不触发额外的同步消息）
            setTimeout(() => {
                const chess = this.gameInstance.gameState.playerChess[data.player]?.[data.chessIndex];
                if (chess) {
                    const fromPos = chess.position;
                    chess.position = data.targetPosition;
                    if (window.gameInstance && window.gameInstance.chessPiece) {
                        chess.lastLandPos = window.gameInstance.chessPiece.generateUniqueLastLandPos(chess.position);
                    }
                    
                    // 记录距离统计
                    if (data.targetPosition > fromPos) {
                        this.gameInstance.gameState.incrementTotalDistance(data.player, data.targetPosition - fromPos);
                    }
                    
                    this.gameInstance.chessPiece.animation.updateChessPosition(data.player, data.chessIndex);
                }
            }, 200);
        }
    }

    /**
     * 处理飞棋动画同步
     */
    handleFlyAnimation(data) {
        if (data.playerId === this.playerId && !this.isSpectator) return; // 忽略自己的消息

        console.log(`[同步] 玩家${data.player}的棋子${data.chessIndex}触发飞行`);

        // 播放飞行音效
        if (window.audioManager) {
            window.audioManager.playFlySound();
        }

        // 执行飞棋动画
        if (this.gameInstance && this.gameInstance.chessPiece && this.gameInstance.chessPiece.animation) {
            // 更新前先移到最顶层
            this.gameInstance.chessPiece.animation.bringToFront(data.player, data.chessIndex);

            // 更新棋子位置到起飞点
            this.gameInstance.gameState.updateChessPosition(data.player, data.chessIndex, data.startPosition);
            this.gameInstance.chessPiece.animation.updateChessPosition(data.player, data.chessIndex);

            // 执行飞棋动画（延迟300ms模拟飞行效果）
            setTimeout(() => {
                const chess = this.gameInstance.gameState.playerChess[data.player]?.[data.chessIndex];
                if (chess) {
                    const fromPos = chess.position;
                    chess.position = data.targetPosition;
                    if (window.gameInstance && window.gameInstance.chessPiece) {
                        chess.lastLandPos = window.gameInstance.chessPiece.generateUniqueLastLandPos(chess.position);
                    }
                    
                    // 记录距离统计
                    if (data.targetPosition > fromPos) {
                        this.gameInstance.gameState.incrementTotalDistance(data.player, data.targetPosition - fromPos);
                    }
                    
                    this.gameInstance.chessPiece.animation.updateChessPosition(data.player, data.chessIndex);
                }

                // 注意：不在这里添加gameInfo，因为本地操作时已经添加过了，避免重复显示
            }, 300);
        }
    }

    /**
     * 处理棋子回归起点动画同步
     */
    handleMoveChessToStart(data) {
        if (data.playerId === this.playerId && !this.isSpectator) return; // 忽略自己的消息

        console.log(`[同步] 棋子回归起点: 玩家${data.player}的棋子${data.chessIndex}，原因：${data.reason}`);

        if (data.reason === 'beat') {
            this.cacheDefeatedChessPosition(data.player, data.chessIndex);
        }

        // 立即执行，不延迟，避免和其他操作冲突
        if (this.gameInstance && this.gameInstance.animation) {
            // 执行回归起点动画，跳过同步以防止无限循环
            this.gameInstance.animation.moveChessToStart(data.player, data.chessIndex, null, true);
        }
    }

    /**
     * 处理棋子到达终点动画同步
     */
    handleMoveChessToFinish(data) {
        if (data.playerId === this.playerId && !this.isSpectator) return; // 忽略自己的消息

        console.log(`同步棋子到达终点动画: 玩家${data.player}的棋子${data.chessIndex}`);

        if (this.gameInstance && this.gameInstance.gameState) {
            const chess = this.gameInstance.gameState.playerChess[data.player]?.[data.chessIndex];
            if (chess) {
                console.log(`🏁 设置棋子终点状态: 玩家${data.player}的棋子${data.chessIndex}`);
                chess.finished = true;
                chess.position = 56;
                if (window.gameInstance && window.gameInstance.chessPiece) {
                    chess.lastLandPos = window.gameInstance.chessPiece.generateUniqueLastLandPos(chess.position);
                }
            }
        }

        // 执行到达终点动画，跳过同步以防止无限循环
        if (this.gameInstance && this.gameInstance.animation) {
            this.gameInstance.animation.moveChessToFinish(data.player, data.chessIndex, true);
        }
    }

    /**
     * 处理叠子碰撞同步
     */
    handleStackCollision(data) {
        // 不再忽略自己发送的消息，因为本地调用addStackCollision时已经传入skipSync=true
        // 所有玩家（包括发送者）都需要通过网络消息来显示，确保一致性
        console.log(`处理叠子碰撞同步: 玩家${data.player}与玩家${data.targetPlayer}的叠子碰撞`);

        if (this.gameInstance && this.gameInstance.gameInfo) {
            // 添加beat信息（根据stackedChesses数组）
            if (data.stackedChesses && Array.isArray(data.stackedChesses)) {
                // 对于叠子中的每个棋子：碰撞玩家击败叠子玩家的棋子
                for (const stackedChess of data.stackedChesses) {
                    this.gameInstance.gameInfo.addChessBeat(data.player, stackedChess.player, stackedChess.chessIndex, true, false, true);
                }
                // 叠子玩家击败碰撞玩家
                this.gameInstance.gameInfo.addChessBeat(data.targetPlayer, data.player, null, true, false, true);
            }

            // 添加叠子碰撞信息（使用skipSync=true避免再次触发同步）
            this.gameInstance.gameInfo.addStackCollision(data.player, data.targetPlayer, true);

            // 播放音效
            if (this.gameInstance.audioManager) {
                this.gameInstance.audioManager.playBeatSound();
            }
        }
    }

    /**
     * 处理叠子反弹同步
     */
    async handleStackBounce(data) {
        if (data.playerId === this.playerId && !this.isSpectator) return; // 忽略自己的消息，因为本地已经执行了动画

        console.log(`处理叠子反弹同步: 玩家${data.player}的棋子${data.chessIndex}从位置${data.startPosition}反弹到${data.endPosition}`);

        if (!this.gameInstance) return;

        const gameState = this.gameInstance.gameState;
        const animation = this.gameInstance.animation;
        const audioManager = this.gameInstance.audioManager;

        // 获取棋子对象
        const chess = gameState.playerChess[data.player]?.[data.chessIndex];
        if (!chess) return;

        // 反弹前移到最顶层
        animation.bringToFront(data.player, data.chessIndex);

        // 先确保棋子位置在起始位置（叠子位置），如果不在，先移动到那里
        if (chess.position !== data.startPosition) {
            console.log(`[叠子反弹同步] 棋子位置不在起始位置，从${chess.position}移动到${data.startPosition}`);

            // 逐步移动到起始位置
            while (chess.position < data.startPosition) {
                await new Promise(resolve => setTimeout(resolve, 200));
                chess.position++;
                animation.updateChessPosition(data.player, data.chessIndex);

                // 播放移动音效
                if (audioManager) {
                    audioManager.playMoveSound();
                }
            }
        }

        // 执行反弹动画
        let currentPosition = data.startPosition;
        const bounceSteps = data.bounceSteps || (data.startPosition - data.endPosition);

        for (let step = 1; step <= bounceSteps; step++) {
            // 如果已经到达位置0（起飞点），停止反弹
            if (currentPosition <= 0) {
                console.log(`叠子反弹到达位置0，停止反弹`);
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            // 播放移动音效
            if (audioManager) {
                audioManager.playMoveSound();
            }

            currentPosition--;
            chess.position = currentPosition;
            if (window.gameInstance && window.gameInstance.chessPiece) {
                chess.lastLandPos = window.gameInstance.chessPiece.generateUniqueLastLandPos(chess.position);
            }
            animation.updateChessPosition(data.player, data.chessIndex);
        }
    }

    /**
     * 处理终点反弹同步
     */
    async handleEndpointBounce(data) {
        if (data.playerId === this.playerId && !this.isSpectator) {
            return; // 忽略自己的消息，因为本地已经执行了动画
        }

        console.log(`[终点反弹同步] 开始处理终点反弹: 玩家${data.player}的棋子${data.chessIndex}从终点反弹，从${data.startPosition}到${data.endPosition}`);

        if (!this.gameInstance) return;

        const gameState = this.gameInstance.gameState;
        const animation = this.gameInstance.animation;
        const audioManager = this.gameInstance.audioManager;

        // 获取棋子对象
        const chess = gameState.playerChess[data.player]?.[data.chessIndex];
        if (!chess) return;

        // 反弹前移到最顶层
        animation.bringToFront(data.player, data.chessIndex);

        // 重置finished状态，因为棋子要从终点反弹回来
        console.log(`[终点反弹同步] 重置棋子finished状态: 玩家${data.player}的棋子${data.chessIndex}，原finished=${chess.finished}`);
        chess.finished = false;

        // 先确保棋子位置在起始位置（56），如果不在，先移动到那里
        if (chess.position !== data.startPosition) {
            console.log(`[终点反弹同步] 棋子位置不在起始位置，从${chess.position}移动到${data.startPosition}`);

            // 逐步移动到起始位置
            while (chess.position < data.startPosition) {
                await new Promise(resolve => setTimeout(resolve, 200));
                chess.position++;
                animation.updateChessPosition(data.player, data.chessIndex);

                // 播放移动音效
                if (audioManager) {
                    audioManager.playMoveSound();
                }
            }
        }

        // 执行反弹动画
        let currentPosition = data.startPosition;
        const bounceSteps = data.bounceSteps || (data.startPosition - data.endPosition);

        for (let step = 1; step <= bounceSteps; step++) {
            // 终点反弹不需要检查位置0，因为终点通道是51-56
            await new Promise(resolve => setTimeout(resolve, 200));

            // 播放移动音效
            if (audioManager) {
                audioManager.playMoveSound();
            }

            currentPosition--;
            chess.position = currentPosition;
            if (window.gameInstance && window.gameInstance.chessPiece) {
                chess.lastLandPos = window.gameInstance.chessPiece.generateUniqueLastLandPos(chess.position);
            }
            animation.updateChessPosition(data.player, data.chessIndex);
        }

        // 添加终点反弹移动信息
        // 同理，不需要在联机模式下的其他客户端中再次展示这条普通的[移动]信息。
        if (this.gameInstance.gameInfo) {
            // 本地触发端已经在chessPiece.js中处理过，这里跳过
        }
    }

    /**
     * 处理三次6惩罚同步
     */
    async handleThreeSixesPenalty(data) {
        console.log(`处理三次6惩罚同步: 玩家${data.player}连续掷出3次6，所有棋子返回起点`);

        const diceDisplay = document.getElementById('diceDisplay');
        if (diceDisplay) {
            diceDisplay.classList.add('dice-shake');
            setTimeout(() => {
                diceDisplay.classList.remove('dice-shake');
            }, 500);
        }
        if (window.audioManager && window.audioManager.playShakeSound) {
            window.audioManager.playShakeSound();
        }

        // 添加三次6惩罚信息到游戏信息面板（skipSync=true避免重复同步）
        if (this.gameInstance && this.gameInstance.gameInfo) {
            this.gameInstance.gameInfo.addThreeSixesPenalty(data.player, true);
        }

        // 执行惩罚：所有棋子返回起点
        const pieceCount = window.gameState?.pieceCount || 4;
        const animation = window.gameInstance?.animation;

        for (let i = 0; i < pieceCount; i++) {
            const chess = window.gameState?.playerChess[data.player]?.[i];
            if (chess && chess.position >= 0 && !chess.finished) {
                chess.position = -1;
                if (window.gameInstance && window.gameInstance.chessPiece) {
                    chess.lastLandPos = window.gameInstance.chessPiece.generateUniqueLastLandPos(chess.position);
                }
                if (animation) {
                    animation.moveChessToStart(data.player, i, null, true);
                }
            }
        }

        // 重置连续6的计数
        if (window.gameState) {
            window.gameState.consecutiveSixes = 0;
            window.gameState.canReroll = false;
            window.gameState.justRolledSix = false;
        }

        // 更新UI
        if (window.uiUpdater) {
            window.uiUpdater.updateUI();
        }
    }

    /**
     * 处理游戏结束同步
     */
    handleGameEnd(data) {
        // 自己发送的消息也需要处理（用于同步服务器权威数据，如progressHistory/gameStartTime等），
        // 但要避免重复弹出结算模态框。
        const isSelfMessage = data.playerId === this.playerId;

        console.log(`处理游戏结束同步: 玩家${data.winnerPlayer}获胜`);

        if (this.gameInstance) {
            // 使用服务器权威的游戏开始时间，避免断线/重连/中途退出导致本地起点被重置
            try {
                if (data.gameStartTime) {
                    if (this.gameInstance.gameState) {
                        this.gameInstance.gameState.gameStartTime = data.gameStartTime;
                    }
                    if (window.gameState) {
                        window.gameState.gameStartTime = data.gameStartTime;
                    }
                }
            } catch (e) {
                // ignore
            }

            // 同步服务器权威的完成度历史（用于结算折线图）
            try {
                if (Array.isArray(data.progressHistory)) {
                    if (this.gameInstance.gameState) {
                        this.gameInstance.gameState.progressHistory = data.progressHistory;
                    }
                    if (window.gameState) {
                        window.gameState.progressHistory = data.progressHistory;
                    }
                }
                if (typeof data.currentRound === 'number') {
                    if (this.gameInstance.gameState) {
                        this.gameInstance.gameState.currentRound = data.currentRound;
                    }
                    if (window.gameState) {
                        window.gameState.currentRound = data.currentRound;
                    }
                }
            } catch (e) {
                // ignore
            }

            // 结束时也进入暂停态，确保所有客户端UI一致（显示暂停遮罩、隐藏骰子等）
            try {
                if (this.gameInstance.gameState && typeof this.gameInstance.gameState.setIsPaused === 'function') {
                    this.gameInstance.gameState.setIsPaused(true);
                } else if (window.gameState && typeof window.gameState.setIsPaused === 'function') {
                    window.gameState.setIsPaused(true);
                }
            } catch (e) {
                // ignore
            }

            try {
                if (typeof this.gameInstance.pauseGame === 'function') {
                    this.gameInstance.pauseGame();
                }
            } catch (e) {
                // ignore
            }

            // 设置游戏状态
            this.gameInstance.gameState.winner = data.winnerPlayer;
            this.gameInstance.gameState.gamePhase = 'finished';

            // 记录游戏结束时间
            try {
                if (data.timestamp) {
                    this.gameInstance.gameState.gameEndTime = data.timestamp;
                    if (window.gameState) {
                        window.gameState.gameEndTime = data.timestamp;
                    }
                } else {
                    this.gameInstance.gameState.recordGameEndTime();
                }
            } catch (e) {
                // ignore
            }

            // 显示结算模态框
            setTimeout(() => {
                if (isSelfMessage && !this.isSpectator) {
                    return;
                }
                if (this.gameInstance.settlementModal) {
                    this.gameInstance.settlementModal.show(data.winnerPlayer);
                }
            }, 1000); // 延迟1秒显示，让玩家看到胜利信息
        }
    }

    /**
     * 处理强制结算同步
     */
    handleForceSettlement(data) {
        // 自己发送的消息也需要处理（用于同步服务器权威数据，如progressHistory/gameStartTime等），
        // 但要避免重复弹出结算模态框。
        const isSelfMessage = data.playerId === this.playerId;

        console.log(`处理强制结算同步:`, data.rankings);

        if (this.gameInstance) {
            // 使用服务器权威的游戏开始时间，避免断线/重连/中途退出导致本地起点被重置
            try {
                if (data.gameStartTime) {
                    if (this.gameInstance.gameState) {
                        this.gameInstance.gameState.gameStartTime = data.gameStartTime;
                    }
                    if (window.gameState) {
                        window.gameState.gameStartTime = data.gameStartTime;
                    }
                }
            } catch (e) {
                // ignore
            }

            // 同步服务器权威的完成度历史（用于结算折线图）
            try {
                if (Array.isArray(data.progressHistory)) {
                    if (this.gameInstance.gameState) {
                        this.gameInstance.gameState.progressHistory = data.progressHistory;
                    }
                    if (window.gameState) {
                        window.gameState.progressHistory = data.progressHistory;
                    }
                }
                if (typeof data.currentRound === 'number') {
                    if (this.gameInstance.gameState) {
                        this.gameInstance.gameState.currentRound = data.currentRound;
                    }
                    if (window.gameState) {
                        window.gameState.currentRound = data.currentRound;
                    }
                }
            } catch (e) {
                // ignore
            }

            // 强制结算等同于暂停并结束：非房主也需要显示暂停遮罩
            try {
                if (this.gameInstance.gameState && typeof this.gameInstance.gameState.setIsPaused === 'function') {
                    this.gameInstance.gameState.setIsPaused(true);
                } else if (window.gameState && typeof window.gameState.setIsPaused === 'function') {
                    window.gameState.setIsPaused(true);
                }
            } catch (e) {
                // ignore
            }

            try {
                if (typeof this.gameInstance.pauseGame === 'function') {
                    this.gameInstance.pauseGame();
                }
            } catch (e) {
                // ignore
            }

            // 设置游戏状态为结束
            this.gameInstance.gameState.setState('gamePhase', 'finished');

            // 记录结束时间（用于结算耗时显示）
            try {
                if (data.timestamp) {
                    this.gameInstance.gameState.gameEndTime = data.timestamp;
                    if (window.gameState) {
                        window.gameState.gameEndTime = data.timestamp;
                    }
                } else if (typeof this.gameInstance.gameState.recordGameEndTime === 'function') {
                    this.gameInstance.gameState.recordGameEndTime();
                }
            } catch (e) {
                // ignore
            }

            // 显示结算模态框，传入排名信息
            if ((!isSelfMessage || this.isSpectator) && this.gameInstance.settlementModal) {
                this.gameInstance.settlementModal.showWithRankings(data.rankings);
            }
        }
    }

    /**
     * 同步进度条开始
     */
    syncProgressBarStart(playerId) {
        this.sendMessage('progressBarStart', {
            timestamp: Date.now()
        });
    }

    /**
     * 处理进度条开始同步
     */
    handleProgressBarStart(data) {
        // 所有玩家都需要同步显示进度条

        // 防止重复处理相同的进度条启动消息
        if (this._lastProgressBarStartData &&
            this._lastProgressBarStartData.playerId === data.playerId &&
            Math.abs(this._lastProgressBarStartData.timestamp - data.timestamp) < 500) {
            // 降低日志级别，避免重复刷屏
            // console.log('忽略重复的进度条启动消息');
            return;
        }
        this._lastProgressBarStartData = data;

        // 获取当前玩家编号
        const playerNumber = this.getPlayerNumberByPlayerId(data.playerId);
        if (playerNumber === null) {
            console.warn('无法获取玩家编号:', data.playerId);
            return;
        }

        // 同步显示进度条
        const progressContainer = document.getElementById('thinkingProgressContainer');
        const progressBar = document.getElementById('thinkingProgressBar');

        if (progressContainer && progressBar) {
            // 显示进度条并设置玩家颜色
            progressContainer.className = `thinking-progress-container active player-${playerNumber}`;
            // 进度条从0%开始，避免满进度跳变为空白的问题
            progressBar.style.width = '0%';

            // 同步思考开始时间，使用本地时间确保进度条正确计算

            if (this.gameInstance && this.gameInstance.gameState) {
                // 使用本地时间作为开始时间，避免时间差异导致的进度条倒退
                this.gameInstance.gameState.thinkingStartTime = Date.now();
                this.gameInstance.gameState.pausedThinkingTime = 0;

                // 启动进度条更新循环 - 所有玩家都需要看到进度条增长
                if (this.gameInstance.uiUpdater) {
                    // 获取当前玩家信息
                    const localPlayerId = this.getCurrentPlayerId();
                    const localPlayerNumber = this.getPlayerNumberByPlayerId(localPlayerId);

                    if (playerNumber !== localPlayerNumber) {
                        // 其他玩家：由房主启动定时器并处理超时
                        // 本地玩家已在 handlePlayerTurnChange → startThinkingProgressBar 中设置了定时器
                        const timeoutCallback = this.isHost ? () => {
                            if (this.gameInstance?.dice?.handleThinkingTimeoutWrapper) {
                                this.gameInstance.dice.handleThinkingTimeoutWrapper();
                            }
                        } : null;
                        this.gameInstance.gameState.startThinkingTimer(timeoutCallback);
                    }

                    // 所有玩家都启动进度条更新循环，确保视觉效果一致
                    this.gameInstance.uiUpdater.updateProgressBarLoop();
                }
            }
        }
    }


    /**
     * 同步游戏暂停
     */
    syncGamePause() {
        if (this.isHost) {
            const messageData = {
                type: 'gamePause',
                timestamp: Date.now()
            };

            // 只发送gamePause消息，不需要重复发送gameInfo
            this.sendMessage('gamePause', messageData);
        }
    }

    /**
     * 处理游戏暂停
     */
    handleGamePaused(data) {
        if (this.gameInstance) {
            // 调用gameState的setIsPaused方法来触发完整的暂停UI逻辑
            if (this.gameInstance.gameState) {
                this.gameInstance.gameState.setIsPaused(true);
            } else if (window.gameState) {
                window.gameState.setIsPaused(true);
            }
            // 同时调用gameInstance的pauseGame方法来设置游戏阶段
            this.gameInstance.pauseGame();
        }
    }

    /**
     * 同步游戏恢复
     */
    syncGameResume() {
        if (this.isHost) {
            const messageData = {
                type: 'gameResume',
                timestamp: Date.now()
            };

            // 只发送gameResume消息，不需要重复发送gameInfo
            this.sendMessage('gameResume', messageData);
        }
    }

    /**
     * 处理玩家离开
     */
    handlePlayerLeft(data) {
        console.log(`玩家${data.playerId}离开了游戏`);

        // 在删除玩家数据之前，先获取玩家编号（用于后续处理）
        const playerNumber = this.getPlayerNumberByPlayerId(data.playerId);

        // 如果游戏尚未开始或已经结束，才将其从激活玩家列表移除
        const gamePhase = this.gameInstance?.gameState?.getGamePhase();
        const isGameActive = gamePhase && gamePhase !== 'finished' && gamePhase !== 'waiting';
        
        if (!isGameActive) {
            try {
                if (playerNumber) {
                    const activePlayers = activePlayerManager.getActivePlayers();
                    const newActivePlayers = activePlayers.filter(p => p !== playerNumber);
                    if (newActivePlayers.length !== activePlayers.length) {
                        activePlayerManager.setActivePlayers(newActivePlayers);
                    }
                }
            } catch (e) {
                // ignore
            }
        } else {
            console.log(`游戏进行中，玩家${data.playerId}离线后交由AI托管，不跳过其回合`);
        }

        // 如果游戏已经正式开始且尚未结束，玩家退出时会由服务器转为AI接管，所以不要删除玩家数据
        const currentGamePhase = this.gameInstance?.gameState?.getGamePhase();
        if (currentGamePhase && currentGamePhase !== 'finished') {
            console.log(`游戏进行中，保留离线玩家 ${data.playerId} 的数据以供AI接管`);
        } else {
            // 删除玩家数据
            if (this.players) this.players.delete(data.playerId);
            if (this.aiTakeoverPlayers) this.aiTakeoverPlayers.delete(data.playerId);
        }
    }

    /**
     * 处理房主权限转移
     */
    handleHostTransferred(data) {
        console.log('房主权限已转移:', {
            newHostId: data.newHostId,
            newHostNickname: data.newHostNickname,
            currentPlayerId: this.playerId,
            wasHost: this.isHost
        });

        const wasHost = this.isHost;
        this.isHost = (data.newHostId === this.playerId);

        console.log(`房主转移: ${wasHost} -> ${this.isHost}`);

        // 更新暂停按钮UI
        if (window.gameInstance && window.gameInstance.eventHandler) {
            window.gameInstance.eventHandler.updatePauseButtonText();
        }

        if (!wasHost && this.isHost) {
            // 从普通玩家变成房主
            console.log('我成为了新房主，将接管AI电脑玩家的控制');

            // 显示提示消息
            if (window.gameInfo) {
                window.gameInfo.addChatMessage(null, `${data.newHostNickname} 成为了新房主`, null, true);
            }

            // 检查当前玩家是否是AI电脑玩家，如果是则立即触发操作
            if (this.gameInstance && this.gameInstance.gameState) {
                const currentPlayer = this.gameInstance.gameState.currentPlayer;
                const currentPlayerId = this.getPlayerIdByPlayerNumber(currentPlayer);
                const currentPlayerData = this.players?.get(currentPlayerId);

                if (currentPlayerData && currentPlayerData.isAI) {
                    console.log('🤖 当前玩家是AI电脑玩家，新房主立即接管');

                    // 延迟触发，确保状态更新完成
                    setTimeout(() => {
                        if (window.botController && window.botController.isCurrentPlayerBot()) {
                            console.log('触发AI电脑玩家操作');
                            window.botController.handleBotTurn();
                        }
                    }, 500);
                }
            }
        } else if (wasHost && !this.isHost) {
            // 从房主变成普通玩家（不应该发生，因为房主离线会被移除）
            console.log('⚠️ 我不再是房主');

            if (window.gameInfo) {
                window.gameInfo.addChatMessage(null, `${data.newHostNickname} 成为了新房主`, null, true);
            }
        }
    }

    /**
     * 处理错误
     */
    handleError(data) {
        console.error('游戏错误:', data.message);
        this.showError(data.message);
    }

    /**
     * 显示连接错误
     */
    showConnectionError() {
        const errorMessage = '与服务器的连接已断开，即将返回主页';
        this.showError(errorMessage);

        // 3秒后重定向回主页
        setTimeout(() => {
            window.location.replace('./');
        }, 3000);
    }

    /**
     * 显示错误信息
     */
    showError(message) {
        // 创建错误提示
        const errorDiv = document.createElement('div');
        errorDiv.className = 'multiplayer-error';
        errorDiv.textContent = message;

        document.body.appendChild(errorDiv);

        // 3秒后自动移除
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 3000);
    }

    /**
     * 处理待发送的消息队列
     */
    processPendingMessages() {
        if (this.pendingMessages && this.pendingMessages.length > 0) {
            for (const message of this.pendingMessages) {
                this.sendMessage(message.type, message.data);
            }

            // 清空待发送队列
            this.pendingMessages = [];
        }
    }

    /**
     * 检查是否为房主
     */
    isHostPlayer() {
        return this.isHost;
    }

    /**
     * 同步游戏信息
     */
    syncGameInfo(messageData) {

        if (!this.isOnlineMode) {
            console.log('❌ 不在联机模式');
            return;
        }

        if (!this.isConnected) {
            console.log('WebSocket连接未就绪，将消息加入待发送队列');
            // 将消息加入待发送队列，等连接建立后发送
            if (!this.pendingMessages) {
                this.pendingMessages = [];
            }
            this.pendingMessages.push({
                type: 'gameInfo',
                data: {
                    messageData: messageData,
                    playerId: this.playerId,
                    timestamp: Date.now()
                }
            });
            return;
        }

        this.sendMessage('gameInfo', {
            messageData: messageData,
            playerId: this.playerId,
            timestamp: Date.now()
        });
    }

    /**
     * 处理游戏信息同步
     */
    handleGameInfo(data) {
        // 如果是自己发送的消息，跳过处理，避免重复显示
        if (data.playerId === this.playerId) {
            return;
        }

        if (!this.gameInstance) {
            console.log('❌ gameInstance 不存在');
            return;
        }

        try {
            // 导入gameInfo模块并显示消息
            import('./gameInfo.js').then(module => {
                const gameInfo = module.gameInfo;

                if (gameInfo && gameInfo.infoContainer) {
                    // 使用skipSync=true参数调用addMessage，避免再次触发同步
                    gameInfo.addMessage(data.messageData, true);
                } else {
                    console.log('❌ gameInfo 或 infoContainer 不可用');
                }
            }).catch(error => {
                console.error('❌ 导入 gameInfo 模块失败:', error);
            });
        } catch (error) {
            console.error('❌ 处理游戏信息同步失败:', error);
        }
    }

    /**
     * 获取当前玩家ID
     */
    getCurrentPlayerId() {
        return this.playerId;
    }

    /**
     * 处理游戏会话连接消息
     */
    handleGameSessionConnected(data) {
        const isRealReconnect = !!(this.isReconnecting || this._didDisconnectOnce);

        // 同步已加载音频的玩家列表
        if (data.audioLoadedPlayers && Array.isArray(data.audioLoadedPlayers)) {
            data.audioLoadedPlayers.forEach(id => this.audioLoadedPlayers.add(id));
            const loadedCount = this.audioLoadedPlayers.size;
            
            // 如果发现服务器上所有人已经加载好了
            if (loadedCount >= this.totalPlayers && this.totalPlayers > 0) {
                if (window.audioManager) {
                    window.audioManager.allPlayersAudioLoaded = true;
                }
            }

            const isLocalLoaded = window.audioManager && window.audioManager.isLoaded;
            if (window.audioManager && isLocalLoaded && !window.audioManager.allPlayersAudioLoaded && this.totalPlayers > 0) {
                window.audioManager.updateLoadingText(`等待其他玩家加载... ${loadedCount}/${this.totalPlayers}`);
            }
        }
        
        // 确保游戏状态知道我们处于在线多人模式
        if (window.gameState && typeof window.gameState.setIsOnlineMultiplayer === 'function') {
            window.gameState.setIsOnlineMultiplayer(true);
        }
        
        try {
            // 更新游戏会话信息
            if (data.gameSessionId) {
                this.gameSessionId = data.gameSessionId;
            }

            // 更新玩家信息并恢复AI托管状态
            if (data.gameSession && data.gameSession.players) {
                // 重新计算真实玩家总数，确保与服务器逻辑一致
                const realPlayers = data.gameSession.players.filter(p => !p.isAI);
                this.totalPlayers = realPlayers.length;

                // 清空现有玩家信息和AI托管列表
                this.players.clear();
                this.aiTakeoverPlayers.clear();

                // 添加新的玩家信息
                for (const player of data.gameSession.players) {
                    this.players.set(player.id, {
                        id: player.id,
                        nickname: player.nickname,
                        color: player.color,
                        emoji: player.emoji,
                        isAI: player.isAI,
                        isAITakeover: player.isAITakeover || false // 恢复AI托管状态
                    });

                    // 如果玩家处于AI托管状态，加入AI托管列表（仅限真实玩家，不包括AI电脑玩家）
                    if (player.isAITakeover && !player.isAI) {
                        this.aiTakeoverPlayers.add(player.id);
                        console.log(`恢复AI托管状态: 玩家${player.id}处于AI托管中`);

                        // 设置AI托管使用简单难度
                        const playerNumber = player.color;
                        if (playerNumber && window.botController) {
                            window.botController.botDifficulties[playerNumber] = 'easy';
                            console.log(`设置AI托管玩家${playerNumber}为简单难度`);
                        }

                        // 更新AI托管显示（对所有客户端，包括房主）
                        setTimeout(() => {
                            this.updatePlayerAITakeoverDisplay(player.id, true);
                        }, 200);

                        // 如果是当前本地玩家，且游戏没有处于暂停状态，恢复本地AI托管状态
                        if (player.id === this.playerId && !data.gameData?.isPaused) {
                            // 异步恢复本地AI托管状态
                            setTimeout(async () => {
                                const { aiTakeoverManager } = await import('./aiTakeoverManager.js');
                                if (!aiTakeoverManager.isActive) {
                                    // 直接设置状态，不触发同步
                                    aiTakeoverManager.isActive = true;
                                    // 确保使用window.gameState以避免undefined错误
                                    if (window.gameState && typeof window.gameState.setAITakeover === 'function') {
                                        window.gameState.setAITakeover(true);
                                    }
                                    aiTakeoverManager.showOverlay();
                                    aiTakeoverManager.updateToggleButton();
                                    // 恢复昵称标记（如果需要）
                                    aiTakeoverManager.modifyHumanPlayerNames();

                                    // 启用botController以支持AI托管
                                    if (window.botController && !window.botController.isEnabled) {
                                        window.botController.setEnabled(true);
                                    }
                                }
                            }, 100);
                        } else if (player.id === this.playerId && data.gameData?.isPaused) {
                            console.log('游戏处于暂停状态，当前玩家暂不恢复本地托管UI，以防止影响暂停UI');
                        }
                    }
                }


                // 更新游戏中的玩家名称显示
                this.updateGamePlayerNames(data.gameSession.players);

                // 更新房主状态（重连时需要）
                const myPlayerData = data.gameSession.players.find(p => p.id === this.playerId);
                const wasHost = this.isHost;
                this.isHost = myPlayerData?.isHost || false;
                
                // 无论房主状态是否改变，只要连接/重连成功就更新一次暂停和结算按钮UI
                if (window.eventHandler) {
                    window.eventHandler.updatePauseButtonText();
                } else if (window.gameInstance && window.gameInstance.eventHandler) {
                    window.gameInstance.eventHandler.updatePauseButtonText();
                }

                if (isRealReconnect) {
                    console.log(`[重连] 更新房主状态: ${wasHost} -> ${this.isHost}`);
                }

                // 如果房主状态发生变化，处理AI托管代理逻辑
                if (wasHost !== this.isHost) {
                    // 更新暂停和结算按钮UI
                    if (window.gameInstance && window.gameInstance.eventHandler) {
                        window.gameInstance.eventHandler.updatePauseButtonText();
                    }
                    
                    if (this.isHost) {
                        // 成为新房主，需要接管AI托管玩家的操作
                        console.log('[重连] 成为房主，检查是否需要接管AI托管操作');
                        this.checkAndTakeoverAIOperations();
                    } else {
                        // 不再是房主，清除AI托管的超时回调
                        console.log('[重连] 不再是房主，清除AI托管超时回调');
                        if (gameState && gameState.thinkingTimer) {
                            // 只清除非本地玩家的超时回调
                            const currentPlayer = gameState.getCurrentPlayer();
                            const localPlayerNumber = this.getPlayerNumberByPlayerId(this.playerId);
                            if (currentPlayer !== localPlayerNumber) {
                                clearTimeout(gameState.thinkingTimer);
                                gameState.thinkingTimer = null;
                            }
                        }
                    }
                }

                // 初始化activePlayerManager（重连时需要）
                const activePlayers = data.gameSession.players
                    .filter(p => p.isConnected !== false || p.isAI) // 只包含在线玩家和AI玩家
                    .map(p => p.color)
                    .sort((a, b) => a - b);
                if (isRealReconnect) {
                    console.log('[重连] 初始化activePlayerManager:', activePlayers);
                }
                activePlayerManager.setActivePlayers(activePlayers);
            }

            // 恢复游戏状态数据（包括棋子位置）
            // 只有在游戏状态包含有意义的数据时才进行恢复
            if (data.gameSession && data.gameSession.gameData) {
                const gameData = data.gameSession.gameData;
                
                // 重连时的加载遮罩处理
                // 如果本地音频已经加载好了，且服务器同步过来的名单显示全员已就位
                const isAllAudioLoadedOnServer = this.audioLoadedPlayers.size >= this.totalPlayers;
                if (isRealReconnect && window.audioManager && window.audioManager.isLoaded && isAllAudioLoadedOnServer) {
                    console.log('[重连] 本地和服务器均显示加载完成，通知音频就绪');
                    window.audioManager.onAllPlayersAudioLoaded();
                }

                if (isRealReconnect) {
                    console.log('[重连] 收到gameData:', gameData);
                }

                // 检查是否需要恢复：有当前玩家或有棋子不在初始位置
                const needsRestore = gameData.currentPlayer !== null ||
                    this.hasNonInitialChessPositions(gameData.playerChess);
                if (isRealReconnect) {
                    console.log('[重连] needsRestore:', needsRestore, 'currentPlayer:', gameData.currentPlayer);
                }
                if (needsRestore) {
                    if (isRealReconnect) {
                        console.log('[重连] 开始调用restoreGameState');
                    }
                    this.restoreGameState(gameData);
                } else {
                    if (isRealReconnect) {
                        console.log('[重连] 跳过restoreGameState，条件不满足');
                    }
                }
            } else {
                if (isRealReconnect) {
                    console.log('[重连] 没有gameData，跳过恢复');
                }
            }

            // 如果游戏实例存在，通知游戏实例更新状态
            if (this.gameInstance && typeof this.gameInstance.updateMultiplayerState === 'function') {
                this.gameInstance.updateMultiplayerState({
                    players: data.gameSession.players,
                    gameSessionId: data.gameSessionId
                });
            }

        } catch (error) {
            console.error('处理游戏会话连接消息失败:', error);
        }
    }

    /**
     * 检查是否有棋子不在初始位置
     */
    hasNonInitialChessPositions(playerChess) {
        if (!playerChess) return false;

        for (const color in playerChess) {
            const chesses = playerChess[color];
            if (Array.isArray(chesses)) {
                for (const chess of chesses) {
                    // 如果棋子位置不是-1（起始区域）或者已完成，说明游戏已经开始
                    if (chess.position !== -1 || chess.finished === true) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * 更新游戏中的玩家名称显示
     */
    updateGamePlayerNames(players) {
        try {
            players.forEach(player => {
                const playerId = player.color || player.id;
                const playerName = player.nickname || `玩家${playerId}`;

                // 更新playerNameManager中的名称
                if (window.playerNameManager) {
                    window.playerNameManager.setPlayerName(playerId, playerName);
                }

                // 更新UI中的玩家名称显示
                const playerNameElements = document.querySelectorAll(`.player-${playerId}-info .player-name`);
                playerNameElements.forEach(element => {
                    element.textContent = playerName;
                });
            });
        } catch (error) {
            console.error('更新游戏玩家名称失败:', error);
        }
    }

    /**
     * 处理AI托管状态变化
     */
    async handleAITakeoverChange(data) {
        try {
            console.log('收到AI托管状态变化:', {
                ...data,
                isHost: this.isHost,
                当前aiTakeoverPlayers: Array.from(this.aiTakeoverPlayers)
            });

            // 检查当前状态是否与目标状态一致，避免重复处理
            const currentState = this.aiTakeoverPlayers.has(data.playerId);
            if (currentState === data.isActive) {
                console.log(`AI托管状态无需更新，当前状态: ${currentState}, 目标状态: ${data.isActive}`);
                return;
            }

            // 更新AI托管状态记录
            if (data.isActive) {
                this.aiTakeoverPlayers.add(data.playerId);
                console.log(`玩家${data.playerId}加入AI托管列表`, {
                    aiTakeoverPlayers: Array.from(this.aiTakeoverPlayers),
                    isHost: this.isHost
                });

                // 更新 players Map 中的 isAITakeover 状态
                const playerData = this.players.get(data.playerId);
                if (playerData) {
                    playerData.isAITakeover = true;
                    console.log(`已更新玩家${data.playerId}的isAITakeover状态为true`);
                }

                // 设置AI托管使用简单难度
                const playerNumber = this.getPlayerNumberByPlayerId(data.playerId);
                if (playerNumber && window.botController) {
                    window.botController.botDifficulties[playerNumber] = 'easy';
                    console.log(`AI托管：设置玩家${playerNumber}为简单难度`);
                }
            } else {
                this.aiTakeoverPlayers.delete(data.playerId);
                console.log(`玩家${data.playerId}退出AI托管列表`, {
                    aiTakeoverPlayers: Array.from(this.aiTakeoverPlayers),
                    isHost: this.isHost
                });

                // 更新 players Map 中的 isAITakeover 状态
                const playerData = this.players.get(data.playerId);
                if (playerData) {
                    playerData.isAITakeover = false;
                    console.log(`已更新玩家${data.playerId}的isAITakeover状态为false`);
                }

                // 移除AI托管难度设置
                const playerNumber = this.getPlayerNumberByPlayerId(data.playerId);
                if (playerNumber && window.botController) {
                    delete window.botController.botDifficulties[playerNumber];
                    console.log(`AI托管：移除玩家${playerNumber}的难度设置`);
                }
            }

            // 更新AI托管显示状态
            const localPlayerId = this.getCurrentPlayerId();
            if (data.playerId !== localPlayerId) {
                this.updatePlayerAITakeoverDisplay(data.playerId, data.isActive);
            } else {
                // 本地玩家的托管状态也需要更新（用于自动托管）
                this.updatePlayerAITakeoverDisplay(data.playerId, data.isActive);
            }

            // 如果是被托管的玩家本身，更新其本地UI（按钮状态、网页标题等）
            if (data.playerId === this.playerId) {
                if (window.aiTakeoverManager && typeof window.aiTakeoverManager.applyRemoteTakeoverState === 'function') {
                    window.aiTakeoverManager.applyRemoteTakeoverState(data.isActive);
                }
            }

            // 如果是自动托管，添加系统消息提示
            if (data.auto && window.gameInfo) {
                const player = this.getPlayerByPlayerId(data.playerId);
                const playerName = player?.nickname || '玩家';
                
                // 确定是离线托管还是超时托管
                const isTimeout = data.reason === 'thinking_timeout';
                const reasonText = isTimeout ? '思考时间到' : '离线';

                if (data.isActive) {
                    // 自动开启AI托管
                    window.gameInfo.addChatMessage(null, `${playerName} ${reasonText}，已自动开启AI托管`, null, true);
                    console.log(`${playerName} ${reasonText}，自动开启AI托管`);
                } else {
                    // 关闭自动托管
                    const resumeText = isTimeout ? '恢复操作' : '重连';
                    window.gameInfo.addChatMessage(null, `${playerName} ${resumeText}，已关闭自动托管`, null, true);
                    console.log(`${playerName} ${resumeText}，关闭自动托管`);
                }
            }

            // 如果当前回合就是这个被托管的玩家，且是房主客户端，立即触发AI操作
            if (data.isActive && this.isHost) {
                const currentPlayer = this.gameInstance.gameState.getCurrentPlayer();
                const playerNumber = this.getPlayerNumberByPlayerId(data.playerId);
                const currentPhase = this.gameInstance?.gameState?.getGamePhase();

                console.log('检查是否需要立即触发AI操作:', {
                    currentPlayer,
                    playerNumber,
                    playerId: data.playerId,
                    isMatch: currentPlayer === playerNumber,
                    gamePhase: currentPhase
                });

                // 如果当前回合正好是这个被托管的玩家，立即触发AI操作
                if (currentPlayer === playerNumber) {
                    const currentDiceValue = this.gameInstance?.gameState?.getDiceValue() || 0;

                    if (currentPhase === 'selecting' || currentPhase === 'rolling') {
                        console.log('当前回合是被托管玩家，房主立即触发AI操作');

                        setTimeout(() => {
                            if (window.botController && !window.botController.isProcessing) {
                                window.botController.handleBotTurn();
                            }
                        }, 300); // 短延迟确保状态更新完成
                    }
                }
            } else if (data.isActive && !this.isHost) {
                console.log('非房主收到AI托管消息，不触发操作');
            }
        } catch (error) {
            console.error('处理AI托管状态变化失败:', error);
        }
    }

    clearLocalAITakeoverForManualAction(reason = 'manual_action') {
        try {
            if (this.isSpectator || !this.playerId || !this.gameInstance?.gameState) {
                return false;
            }

            const currentPlayer = this.gameInstance.gameState.getCurrentPlayer();
            const localPlayerNumber = this.getPlayerNumberByPlayerId(this.playerId);
            if (!localPlayerNumber || currentPlayer !== localPlayerNumber) {
                return false;
            }

            const playerData = this.players.get(this.playerId);
            const isTakeoverActive = this.aiTakeoverPlayers.has(this.playerId) ||
                playerData?.isAITakeover ||
                this.gameInstance.gameState.getIsAITakeover?.();

            if (!isTakeoverActive) {
                return false;
            }

            this.aiTakeoverPlayers.delete(this.playerId);
            if (playerData) {
                playerData.isAITakeover = false;
            }
            this.updatePlayerAITakeoverDisplay(this.playerId, false);

            if (window.aiTakeoverManager && typeof window.aiTakeoverManager.applyRemoteTakeoverState === 'function') {
                window.aiTakeoverManager.applyRemoteTakeoverState(false);
            } else if (typeof this.gameInstance.gameState.setAITakeover === 'function') {
                this.gameInstance.gameState.setAITakeover(false);
            }

            if (this.isConnected && typeof this.sendMessage === 'function') {
                this.sendMessage('aiTakeoverChange', {
                    playerId: this.playerId,
                    isActive: false,
                    auto: true,
                    timestamp: Date.now(),
                    reason: reason || 'manual_action'
                });
            }

            console.log(`[AI托管] 本地玩家手动操作，关闭托管: ${reason || 'manual_action'}`);
            return true;
        } catch (error) {
            console.error('手动恢复本地玩家控制失败:', error);
            return false;
        }
    }

    /**
     * 处理昵称变化
     */
    async handleNicknameChange(data) {
        try {
            console.log('收到昵称变化:', data);
            console.log('当前本地玩家ID:', this.getCurrentPlayerId());

            // 更新玩家昵称显示
            const localPlayerId = this.getCurrentPlayerId();
            if (data.playerId !== localPlayerId) {
                this.updatePlayerNicknameDisplay(data.playerId, data.nickname);
            } else {
                // 本地玩家也需要更新显示，确保UI同步
                this.updatePlayerNicknameDisplay(data.playerId, data.nickname);
            }
        } catch (error) {
            console.error('处理昵称变化失败:', error);
        }
    }

    /**
     * 更新玩家昵称显示
     */
    updatePlayerNicknameDisplay(playerId, nickname) {
        try {
            const playerNumber = this.getPlayerNumberByPlayerId(playerId);
            console.log(`[联机] 更新昵称显示 - playerId: ${playerId}, playerNumber: ${playerNumber}, nickname: ${nickname}`);

            if (playerNumber !== null) {
                // 更新 playerNameManager 中的数据
                if (window.playerNameManager) {
                    window.playerNameManager.setPlayerName(playerNumber, nickname);
                    console.log(`[联机] 已更新 playerNameManager: 玩家${playerNumber} -> ${nickname}`);
                }

                // 更新所有相关的昵称显示元素（包括电脑端和手机端）
                const playerNameElements = document.querySelectorAll(`.player-${playerNumber}-info .player-name`);

                playerNameElements.forEach((element, index) => {
                    element.textContent = nickname;
                });

                // 额外确保移动端元素也被更新（防止选择器遗漏）
                const mobileTopElement = document.querySelector(`.players-top .player-${playerNumber}-info .player-name`);
                if (mobileTopElement) {
                    mobileTopElement.textContent = nickname;
                }

                const mobileBottomElement = document.querySelector(`.players-bottom .player-${playerNumber}-info .player-name`);
                if (mobileBottomElement) {
                    mobileBottomElement.textContent = nickname;
                }

                // 确保桌面端元素也被更新
                const desktopElement = document.querySelector(`.players-info .player-${playerNumber}-info .player-name`);
                if (desktopElement) {
                    desktopElement.textContent = nickname;
                }
            }
        } catch (error) {
            console.error('更新玩家昵称显示失败:', error);
        }
    }

    /**
     * 更新玩家AI托管显示状态
     */
    updatePlayerAITakeoverDisplay(playerId, isActive) {
        try {
            // 只更新指定玩家的AI托管状态，不影响其他玩家
            const playerNumber = this.getPlayerNumberByPlayerId(playerId);

            if (playerNumber !== null) {
                // 查找所有相关的玩家名称元素（桌面端和手机端）
                // 使用类名选择器，确保选中正确的玩家（不受DOM顺序影响）
                const selectors = [
                    `.players-info .player-${playerNumber}-info .player-name`,  // 桌面端
                    `.players-top .player-${playerNumber}-info .player-name`,  // 手机端顶部
                    `.players-bottom .player-${playerNumber}-info .player-name`  // 手机端底部
                ];

                let updated = false;
                selectors.forEach((selector, index) => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        const currentName = element.textContent;

                        if (isActive && !currentName.includes('【Bot】')) {
                            // 添加AI标记
                            element.textContent = currentName + '【Bot】';
                            updated = true;
                        } else if (!isActive && currentName.includes('【Bot】')) {
                            // 移除AI标记
                            element.textContent = currentName.replace('【Bot】', '');
                            updated = true;
                        }
                    });
                });

                if (!updated) {
                    // DOM 可能尚未渲染完成（尤其在重连/布局切换后），稍后重试一次
                    if (!this._aiTakeoverUiRetryTimers) {
                        this._aiTakeoverUiRetryTimers = new Map();
                    }

                    // 检查当前最新的状态是否与重试状态一致
                    const currentState = this.aiTakeoverPlayers.has(playerId);
                    if (currentState === isActive) {
                        // 状态一致，可以重试
                        if (!this._aiTakeoverUiRetryTimers.has(playerNumber)) {
                            const timer = setTimeout(() => {
                                try {
                                    this._aiTakeoverUiRetryTimers.delete(playerNumber);
                                    // 重试前再次检查状态一致性
                                    const latestState = this.aiTakeoverPlayers.has(playerId);
                                    if (latestState === isActive) {
                                        this.updatePlayerAITakeoverDisplay(playerId, isActive);
                                    } else {
                                        console.log(`重试取消：状态已变化，当前: ${latestState}, 重试目标: ${isActive}`);
                                    }
                                } catch (e) {
                                    // ignore
                                }
                            }, 120);
                            this._aiTakeoverUiRetryTimers.set(playerNumber, timer);
                        } else {
                            console.warn(`未找到玩家${playerNumber}的名称元素或名称无需更新`);
                        }
                    } else {
                        console.log(`重试取消：状态已变化，当前: ${currentState}, 重试目标: ${isActive}`);
                    }
                }
            } else {
                console.warn(`无法找到playerId ${playerId} 对应的玩家编号`);
            }
        } catch (error) {
            console.error('更新玩家AI托管显示状态失败:', error);
        }
    }

    /**
     * 根据playerId获取玩家编号
     */
    getPlayerNumberByPlayerId(playerId) {
        // 如果查询的是自己作为观战者的ID，不用打印警告直接返回null
        if (this.isSpectator && playerId === this.playerId) {
            return null;
        }

        // 减少日志输出，避免控制台刷屏
        for (const [id, player] of this.players) {
            if (id === playerId) {
                return player.color;
            }
        }

        // 如果在重连过程中找不到玩家，先返回null，避免频繁警告
        if (!this.gameInitialized && !this.isSpectator) {
            return null;
        }

        console.warn(`无法找到玩家 ${playerId} 的编号`);
        return null;
    }

    /**
     * 根据玩家编号获取玩家ID（与getPlayerNumberByPlayerId相反）
     */
    getPlayerIdByPlayerNumber(playerNumber) {
        for (const [id, player] of this.players) {
            if (player.color === playerNumber) {
                return id;
            }
        }
        return null;
    }

    /**
     * 根据playerId获取玩家对象
     */
    getPlayerByPlayerId(playerId) {
        if (this.isSpectator && playerId === this.playerId) {
            return null;
        }
        return this.players.get(playerId);
    }

    /**
     * 同步骰子重置
     */
    syncDiceReset() {
        if (!this.isOnlineMode || !this.isConnected) {
            return;
        }

        this.sendMessage('diceReset', {
            timestamp: Date.now()
        });
    }

    /**
     * 处理骰子重置同步
     */
    handleDiceReset(data) {
        // 忽略自己发送的消息
        if (data.playerId === this.playerId) {
            return;
        }

        // 停止骰子闪烁动画
        if (this.currentFlashInterval) {
            clearInterval(this.currentFlashInterval);
            this.currentFlashInterval = null;
        }

        const diceDisplay = document.getElementById('diceDisplay');
        if (diceDisplay) {
            diceDisplay.classList.remove('dice-flashing', 'dice-waiting');
        }

        if (this.gameInstance && this.gameInstance.uiUpdater) {
            this.gameInstance.uiUpdater.updateDiceDisplay(0);
        }
    }


    /**
     * 处理玩家断开连接消息
     */
    handlePlayerDisconnected(data) {
        console.log('玩家断开连接:', data);

        // 检查断线玩家是否开启了AI托管，如果是则关闭
        const playerId = data.playerId;
        const playerData = this.players.get(playerId);

        // 只处理真实玩家的AI托管（AI电脑玩家不应该有AI托管状态）
        if (playerData && playerData.isAI) {
            console.log(`玩家${playerId}是AI电脑玩家，跳过AI托管处理`);
            return;
        }

        // 检查玩家是否已经标记为断开连接，避免重复处理
        const currentStatus = this._playerConnectionStatus.get(playerId);
        if (currentStatus === false) {
            console.log(`玩家${playerId}已经标记为断开连接，跳过重复处理`);
            return;
        }

        // 更新玩家连接状态为断开
        this._playerConnectionStatus.set(playerId, false);

        // 注意：断线不应改变“AI托管开关”本身。
        // 玩家离线时，如果其AI托管此前已开启，应继续保持开启状态，
        // 否则会出现【Bot】标记被移除但本地仍处于托管（遮罩/按钮状态未变）的不同步问题。

        // 注意：服务器端已经发送了chatMessage系统消息，这里不需要重复显示
        // 只需要更新激活玩家列表
        const player = data.gameSession?.players?.find(p => p.id === playerId);
        if (player) {

            // 检查断线玩家是否是当前玩家
            const currentPlayer = this.gameInstance?.gameState?.getCurrentPlayer();
            if (player.color === currentPlayer) {
                console.log(`当前玩家${player.color}断线，检查是否需要接管处理`);

                // 如果当前客户端是房主，接管处理
                if (this.isHost) {
                    // 如果游戏尚未正式开始，不要启动超时接管。
                    // 此时服务器应该已经触发了首发权转移。
                    if (this.gameInstance && this.gameInstance.gameState && !this.gameInstance.gameState.getGameOfficiallyStarted()) {
                        console.log('[断线] 游戏尚未正式开始，房主跳过接管逻辑，等待服务器首发权转移');
                        return;
                    }

                    console.log(`房主接管断线玩家${player.color}的超时等待处理`);
                    // 获取当前进度条的剩余时间
                    const remainingTime = gameState.getRemainingThinkingTime();
                    console.log(`剩余思考时间: ${remainingTime}ms`);

                    if (remainingTime > 0) {
                        // 设置超时回调，等待自然结束，不提前接管
                        if (gameState.thinkingTimer) {
                            clearTimeout(gameState.thinkingTimer);
                        }
                        gameState._thinkingTimerContext = {
                            startTime: gameState.thinkingStartTime,
                            player: gameState.currentPlayer,
                            phase: gameState.gamePhase
                        };
                        gameState.thinkingTimer = setTimeout(() => {
                            if (window.audioManager && !window.audioManager.allPlayersAudioLoaded) {
                                return;
                            }
                            if (this.gameInstance?.dice?.handleThinkingTimeoutWrapper) {
                                this.gameInstance.dice.handleThinkingTimeoutWrapper();
                            }
                        }, remainingTime);
                    } else {
                        // 时间已用完，立即触发超时
                        if (this.gameInstance?.dice?.handleThinkingTimeoutWrapper) {
                            this.gameInstance.dice.handleThinkingTimeoutWrapper();
                        }
                    }
                }
            }
        }
    }

    /**
     * 处理玩家重连消息
     */
    handlePlayerReconnected(data) {
        // 检查玩家是否已经标记为连接，避免重复处理
        const playerId = data.playerId;
        const currentStatus = this._playerConnectionStatus.get(playerId);
        if (currentStatus === true) {
            return;
        }

        // 更新玩家连接状态为连接
        this._playerConnectionStatus.set(playerId, true);

        // 更新本地的房主状态（从服务器数据中获取）
        if (data.gameSession?.players) {
            const myPlayerData = data.gameSession.players.find(p => p.id === this.playerId);
            const wasHost = this.isHost;
            this.isHost = myPlayerData?.isHost || false;

            if (wasHost !== this.isHost) {
                console.log(`[玩家重连] 房主状态变化: ${wasHost} -> ${this.isHost}`);
                
                // 无论房主是否变化，只要收到玩家重连消息就同步一次暂停和结算按钮状态
                if (window.eventHandler) {
                    window.eventHandler.updatePauseButtonText();
                } else if (window.gameInstance && window.gameInstance.eventHandler) {
                    window.gameInstance.eventHandler.updatePauseButtonText();
                }

                // 如果不再是房主，清除AI托管的超时回调（除非是自己的回合）
                if (!this.isHost && wasHost) {
                    // 更新暂停和结算按钮UI
                    if (window.gameInstance && window.gameInstance.eventHandler) {
                        window.gameInstance.eventHandler.updatePauseButtonText();
                    }
                    
                    const currentPlayer = gameState?.getCurrentPlayer();
                    const localPlayerNumber = this.getPlayerNumberByPlayerId(this.playerId);
                    if (currentPlayer !== localPlayerNumber && gameState?.thinkingTimer) {
                        console.log('[玩家重连] 不再是房主，清除非本地玩家的超时回调');
                        clearTimeout(gameState.thinkingTimer);
                        gameState.thinkingTimer = null;
                    }
                }
            }
        }

        // 更新玩家信息
        if (data.gameSession?.players) {
            for (const player of data.gameSession.players) {
                const existingPlayer = this.players.get(player.id);
                if (existingPlayer) {
                    existingPlayer.isConnected = player.isConnected;
                    existingPlayer.isHost = player.isHost;
                    existingPlayer.isAI = player.isAI;
                }
            }
        }

        if (data.playerId === this.playerId && data.gameSession?.gameState === 'playing') {
            if (this.isReconnecting || this._didDisconnectOnce) {
                console.log('检测到自己重连到进行中的游戏，检查音频加载状态');
            }
            if (window.audioManager && window.audioManager.isLoaded) {
                console.log('音频已加载完成，发送audioLoaded消息');
                if (this.isConnected) {
                    this.sendMessage('audioLoaded', {
                        playerId: this.playerId,
                        timestamp: Date.now()
                    });
                    console.log('已发送audioLoaded消息，等待服务器的allAudioLoaded消息');
                } else {
                    console.warn('WebSocket未连接，无法发送audioLoaded消息');
                }
            }
        }

        // 更新激活玩家列表
        const player = data.gameSession?.players?.find(p => p.id === data.playerId);
        if (player) {
            // 将重连玩家添加回激活玩家列表
            if (player.color) {
                const activePlayers = activePlayerManager.getActivePlayers();
                if (!activePlayers.includes(player.color)) {
                    // 按color排序插入
                    const newActivePlayers = [...activePlayers, player.color].sort((a, b) => a - b);
                    console.log(`玩家${player.color}重连，更新激活玩家列表: [${newActivePlayers.join(', ')}]`);
                    activePlayerManager.setActivePlayers(newActivePlayers);
                }
            }
        }

        // 如果是房主，检查是否需要重新触发AI操作
        // 这是为了处理以下情况：玩家A断线后玩家B成为房主，玩家B开启了AI托管
        // 当玩家A重连后，玩家B的AI操作可能需要重新触发
        if (this.isHost && data.playerId !== this.playerId) {
            setTimeout(() => {
                this.checkAndTriggerAIOperationIfNeeded();
            }, 500);
        }

        // 自己重连：如果本地仍处于AI托管，主动向服务器重新同步一次。
        // 否则其他客户端只会看到昵称【Bot】（本地渲染）而收不到托管状态，导致操作权限/标记不同步。
        if (data.playerId === this.playerId) {
            try {
                const localTakeoverActive = !!(window.gameState && typeof window.gameState.getIsAITakeover === 'function' && window.gameState.getIsAITakeover());
                if (localTakeoverActive && this.isConnected) {
                    this.sendMessage('aiTakeoverChange', {
                        playerId: this.playerId,
                        isActive: true,
                        timestamp: Date.now(),
                        reason: 'reconnect_resync'
                    });
                }
            } catch (e) {
                // ignore
            }
        }
    }

    /**
     * 检查并触发AI操作（如果需要）
     * 用于处理各种状态变化后可能需要重新触发AI操作的情况
     */
    checkAndTriggerAIOperationIfNeeded() {
        if (!this.isHost || !this.gameInstance?.gameState) {
            return;
        }

        console.log('[检查AI操作] 触发botController.handleBotTurn()');
        if (window.botController && !window.botController.isProcessing) {
            window.botController.handleBotTurn();
        }
    }

    /**
     * 处理进度条重置消息（当前玩家重连时触发）
     */
    handleProgressBarReset(data) {
        console.log('[进度条重置] 收到消息:', data);

        const { playerColor, thinkingStartTime } = data;

        // 更新本地的思考开始时间
        if (gameState && thinkingStartTime) {
            gameState.thinkingStartTime = thinkingStartTime;
            gameState.pausedThinkingTime = 0;
            console.log(`[进度条重置] 更新thinkingStartTime: ${thinkingStartTime}`);
        }

        // 重置进度条显示
        const progressContainer = document.getElementById('thinkingProgressContainer');
        const progressBar = document.getElementById('thinkingProgressBar');

        if (progressContainer && progressBar) {
            // 设置玩家颜色
            progressContainer.className = `thinking-progress-container active player-${playerColor}`;
            // 重置进度为0%
            progressBar.style.width = '0%';
            console.log(`[进度条重置] 进度条已重置为0%，玩家颜色: ${playerColor}`);
        }

        // 重新设置超时回调（如果需要）
        const localPlayerNumber = this.getPlayerNumberByPlayerId(this.playerId);
        const isCurrentPlayerLocal = playerColor === localPlayerNumber;

        // 清除旧的超时回调
        if (gameState.thinkingTimer) {
            clearTimeout(gameState.thinkingTimer);
            gameState.thinkingTimer = null;
        }

        // 如果是本地玩家的回合，或是房主代理非本地玩家回合，设置新的超时回调
        const shouldSetTimeout = isCurrentPlayerLocal || this.isHost;

        if (shouldSetTimeout) {
            console.log(`[进度条重置] 设置新的超时回调`);
            gameState._thinkingTimerContext = {
                startTime: gameState.thinkingStartTime,
                player: playerColor,
                phase: gameState.gamePhase
            };
            gameState.thinkingTimer = setTimeout(() => {
                console.log(`玩家${playerColor}思考时间到，自动切换到下一个玩家`);
                if (this.gameInstance?.dice?.handleThinkingTimeoutWrapper) {
                    this.gameInstance.dice.handleThinkingTimeoutWrapper();
                }
            }, gameState.THINKING_TIME);
        }

        // 启动进度条更新循环
        if (uiUpdater && uiUpdater.updateProgressBarLoop) {
            uiUpdater.updateProgressBarLoop();
        }
    }

    /**
     * 处理游戏自动暂停消息
     */
    handleGameAutoPaused(data) {
        console.log('游戏已自动暂停:', data);
    }

    /**
     * 处理游戏恢复消息
     */
    handleGameResumed(data) {
        // 判断消息类型：空置房间恢复 vs 房主主动恢复
        if (data.reason === 'human_player_reconnected') {
            return; // 提前返回，不执行下面的恢复逻辑
        }

        // 房主主动恢复游戏（gameResume消息）
        // 所有客户端（包括房主）都需要同步恢复游戏状态并显示消息
        if (this.gameInstance) {
            // 调用gameState的setIsPaused方法来触发完整的恢复UI逻辑
            if (this.gameInstance.gameState) {
                this.gameInstance.gameState.setIsPaused(false);
            } else if (window.gameState) {
                window.gameState.setIsPaused(false);
            }
            // 同时调用gameInstance的resumeGame方法来设置游戏阶段
            if (this.gameInstance.resumeGame) {
                this.gameInstance.resumeGame();
            }
            // 更新按钮文本
            if (window.eventHandler) {
                window.eventHandler.updatePauseButtonText();
            }
            // 所有客户端都添加游戏恢复消息（不同步到服务器，避免重复）
            if (window.gameInfo) {
                window.gameInfo.addGameResume(true); // skipSync=true
            }
        }
    }

    /**
     * 处理房间即将销毁消息
     */
    handleRoomDestroying(data) {
        console.log('房间即将销毁:', data);
        // 5秒后返回主页
        setTimeout(() => {
            alert('房间已被销毁，即将返回主页');
            window.location.replace('./');
        }, 5000);
    }

    /**
     * 处理房主变更消息
     */
    handleHostChanged(data) {
        console.log('房主变更:', {
            oldHostId: data.oldHostId,
            newHostId: data.newHostId,
            newHostNickname: data.newHostNickname,
            currentPlayerId: this.playerId,
            isNewHost: data.newHostId === this.playerId
        });

        // 更新房主标志
        const wasHost = this.isHost;
        this.isHost = data.newHostId === this.playerId;

        // 更新暂停按钮UI
        if (window.gameInstance && window.gameInstance.eventHandler) {
            window.gameInstance.eventHandler.updatePauseButtonText();
        }

        // 显示系统消息
        if (window.gameInfo) {
            if (this.isHost) {
                window.gameInfo.addChatMessage(null, `你已成为新房主`, null, true);
            } else {
                window.gameInfo.addChatMessage(null, `${data.newHostNickname} 成为新房主`, null, true);
            }
        }

        // 如果当前客户端成为新房主，立即检查是否需要接管AI操作
        if (this.isHost && !wasHost) {
            console.log('当前客户端成为新房主，检查是否需要接管AI操作');

            // 延迟执行，确保状态更新完成
            setTimeout(() => {
                if (this.gameInstance && this.gameInstance.gameState) {
                    const currentPlayer = this.gameInstance.gameState.getCurrentPlayer();
                    const currentPlayerId = this.getPlayerIdByPlayerNumber(currentPlayer);
                    const currentPlayerData = this.players.get(currentPlayerId);
                    const gamePhase = this.gameInstance.gameState.getGamePhase();
                    // 检查当前玩家是否是AI或处于AI托管状态
                    const isAIPlayer = currentPlayerData?.isAI || false;
                    const isPlayerAITakeover = this.aiTakeoverPlayers.has(currentPlayerId) || currentPlayerData?.isAITakeover || false;

                    if ((isAIPlayer || isPlayerAITakeover) && (gamePhase === 'rolling' || gamePhase === 'selecting')) {
                        // 延迟触发，确保状态更新完成
                        setTimeout(() => {
                            if (window.botController) {
                                if (!window.botController.isEnabled) {
                                    window.botController.setEnabled(true);
                                }

                                const phaseNow = this.gameInstance?.gameState?.getGamePhase();
                                const currentPlayerNow = this.gameInstance?.gameState?.getCurrentPlayer();

                                if ((phaseNow === 'rolling' || phaseNow === 'selecting') && currentPlayerNow === currentPlayer) {
                                    window.botController.handleBotTurn();
                                }
                            } else {
                                console.error('❌ 无法执行AI操作：botController不存在');
                            }
                        }, 800);
                    } else {
                        console.log('当前玩家不需要AI操作或游戏阶段不合适', {
                            isAIPlayer,
                            isPlayerAITakeover,
                            gamePhase
                        });
                    }
                } else {
                    console.warn('⚠️ gameInstance或gameState不存在，无法检查AI状态');
                }
            }, 300);
        }
    }

    /**
     * 检查并接管AI托管操作（成为房主时调用）
     */
    checkAndTakeoverAIOperations() {
        setTimeout(() => {
            if (this.gameInstance && this.gameInstance.gameState) {
                const currentPlayer = this.gameInstance.gameState.getCurrentPlayer();
                const currentPlayerId = this.getPlayerIdByPlayerNumber(currentPlayer);
                const currentPlayerData = this.players.get(currentPlayerId);
                const gamePhase = this.gameInstance.gameState.getGamePhase();

                // 检查当前玩家是否是AI或处于AI托管状态
                const isAIPlayer = currentPlayerData?.isAI || false;
                const isPlayerAITakeover = this.aiTakeoverPlayers.has(currentPlayerId) || currentPlayerData?.isAITakeover || false;

                console.log('[接管AI] 检查状态:', {
                    currentPlayer,
                    isAIPlayer,
                    isPlayerAITakeover,
                    gamePhase,
                    aiTakeoverPlayers: Array.from(this.aiTakeoverPlayers)
                });

                if ((isAIPlayer || isPlayerAITakeover) && (gamePhase === 'rolling' || gamePhase === 'selecting')) {
                    console.log('[接管AI] 需要接管AI操作，清空倒计时避免冲突');

                    if (gameState.thinkingTimer) {
                        clearTimeout(gameState.thinkingTimer);
                        gameState.thinkingTimer = null;
                    }

                    // 延迟触发AI操作
                    setTimeout(() => {
                        console.log('[接管AI] 触发botController.handleBotTurn()');
                        if (window.botController && !window.botController.isProcessing) {
                            window.botController.handleBotTurn();
                        }
                    }, 500);
                } else {
                    console.log('[接管AI] 当前玩家不需要AI操作或游戏阶段不合适');
                }
            }
        }, 300);
    }

    /**
     * 销毁管理器
     */
    destroy() {
        this.disableReconnect = true;
        this.gameSessionId = null;
        try {
            // 主动销毁（例如返回主页）时，不应保留重连信息
            if (reconnectManager && typeof reconnectManager.clearPlayerIdentity === 'function') {
                reconnectManager.clearPlayerIdentity();
            }
        } catch (e) {
            // ignore
        }
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = null;
        }
        this.isConnected = false;
        this.players.clear();
        this.gameInstance = null;
    }
}

// 创建全局实例
const multiplayerGameManager = new MultiplayerGameManager();
window.multiplayerGameManager = multiplayerGameManager;
export { multiplayerGameManager, MultiplayerGameManager };
