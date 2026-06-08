// 主入口模块 - 协调各模块工作，提供游戏初始化和重置功能
import { gameState } from './gameState.js';
import { utils } from './utils.js';
import { dice } from './dice.js';
import ChessPiece from './chessPiece.js';
import { animation } from './animation.js';
import { uiUpdater } from './uiUpdater.js';
import { eventHandler } from './eventHandler.js';
import { gameInfo } from './gameInfo.js';
import { defeatCountDisplay } from './defeatCountDisplay.js';
import { progressDisplay } from './progressDisplay.js';
import { playerNameManager } from './playerNameManager.js';
import SettlementModal from './settlementModal.js';
import { botController } from './botController.js';
import { activePlayerManager } from './activePlayerManager.js';
import { audioManager } from './audioManager.js';
import { aiTakeoverManager } from './aiTakeoverManager.js';
import { multiplayerGameManager } from './multiplayerGameManager.js';
import { energyManager } from './energyManager.js';
import { energyDisplay } from './energyDisplay.js';
import { skillManager } from './skillManager.js';
import { lightningManager } from './lightningManager.js';

class FlyingChessGame {
    constructor() {
        // 初始化模块实例
        this.gameState = gameState;
        this.utils = utils;
        this.dice = dice;
        this.animation = animation;
        this.uiUpdater = uiUpdater;
        this.gameInfo = gameInfo;
        this.defeatCountDisplay = defeatCountDisplay;
        this.progressDisplay = progressDisplay;
        this.settlementModal = new SettlementModal();
        this.chessPiece = new ChessPiece(gameState, utils, animation, uiUpdater, dice);
        this.eventHandler = eventHandler;
        this.multiplayerGameManager = multiplayerGameManager;
        this.energyManager = energyManager;
        this.energyDisplay = energyDisplay;
        this.skillManager = skillManager;
        this.lightningManager = lightningManager;

        // 设置模块间的依赖关系
        this.dice.animation = this.animation;
        this.dice.uiUpdater = this.uiUpdater;

        // 设置botController的chessPiece引用
        botController.setChessPiece(this.chessPiece);

        // 设置botController的utils引用
        botController.setUtils(this.utils);

        // 设置结算模态框的依赖关系
        this.settlementModal.setDependencies(this.gameState, this.defeatCountDisplay, this.progressDisplay);

        // 设置事件处理器的游戏实例引用
        this.eventHandler.setGameInstance(this);

        // 设置积分管理器和积分显示的依赖关系
        this.energyManager.setEnergyDisplay(this.energyDisplay);

        // 将playerNameManager暴露到全局，供multiplayerGameManager使用
        window.playerNameManager = playerNameManager;

        // 将activePlayerManager暴露到全局，供其他模块获取当前激活玩家
        window.activePlayerManager = activePlayerManager;

        // 将animation暴露到全局，供multiplayerGameManager使用
        window.animation = this.animation;

        // 设置全局游戏实例引用（供其他模块使用）
        window.gameInstance = this;

        // 设置音频管理器回调，处理加载 UI
        this.setupAudioManagerUI();

        // 初始化游戏
        this.initializeGame();
    }

    /**
     * 设置音频管理器的 UI 回调
     */
    setupAudioManagerUI() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const loadingText = loadingIndicator?.querySelector('.loading-text');
        const thinkingProgressContainer = document.getElementById('thinkingProgressContainer');
        const diceDisplay = document.getElementById('diceDisplay');

        // 初始显示加载
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        if (thinkingProgressContainer) thinkingProgressContainer.style.display = 'none';
        
        // 只有在非暂停且非显示聊天时才隐藏骰子
        const isPaused = gameState.getIsPaused();
        const chatInputArea = document.getElementById('chatInputArea');
        if (!isPaused && diceDisplay && !(chatInputArea && chatInputArea.style.display === 'flex')) {
            diceDisplay.style.display = 'none';
        }

        // 隐藏控制按钮
        const chatBtn = document.getElementById('chatBtn');
        const skillBtn = document.getElementById('skillBtn');
        const lightningBtn = document.getElementById('lightningBtn');
        if (chatBtn) chatBtn.style.display = 'none';
        if (skillBtn) skillBtn.style.display = 'none';
        if (lightningBtn) lightningBtn.style.display = 'none';

        audioManager.onProgress((percentage) => {
            if (loadingText) loadingText.textContent = `正在加载... ${percentage}%`;
        });

        audioManager.onStatusChange((status) => {
            if (status === 'waiting_others') {
                if (loadingText) loadingText.textContent = '等待其他玩家加载...';
            } else if (status === 'ready') {
                this.hideLoadingUI();
            }
        });
    }

    /**
     * 隐藏加载 UI 并恢复游戏控件
     */
    hideLoadingUI() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';

        // 只有在未暂停时才恢复 UI
        if (gameState.getIsPaused()) return;

        // 恢复控件显示
        const diceDisplay = document.getElementById('diceDisplay');
        const thinkingProgressContainer = document.getElementById('thinkingProgressContainer');
        
        if (this.uiUpdater && typeof this.uiUpdater.updateDiceDisplay === 'function') {
            this.uiUpdater.updateDiceDisplay();
        } else if (diceDisplay) {
            const chatInputArea = document.getElementById('chatInputArea');
            if (!(chatInputArea && window.getComputedStyle(chatInputArea).display !== 'none')) {
                diceDisplay.style.display = 'flex';
            }
        }

        if (thinkingProgressContainer) thinkingProgressContainer.style.display = 'block';

        this.initializeControlButtonsVisibility();
        this.skillManager.updateButtonVisibility();
    }

    // 初始化游戏
    initializeGame() {
        try {
            // 1. 重置游戏状态（在处理URL参数之前）
            gameState.resetGameState();

            // 2. 处理URL参数（如果有的话）
            this.handleUrlParameters();

            // 3. 设置棋子元素
            this.setupChessElements();

            // 4. 设置事件监听器
            eventHandler.setGameInstance(this);
            eventHandler.setupEventListeners();

            // 5. 设置dice的eventHandler引用
            dice.setEventHandler(eventHandler);

            // 6. 设置初始游戏阶段为waiting，让bot能够正确启动
            gameState.setState('gamePhase', 'waiting');

            // 7. 更新UI
            uiUpdater.updateUI();

            // 8. 添加游戏开始信息（在URL参数处理和玩家名称设置之后）
            const isOnlineModeStrStr = sessionStorage.getItem('multiplayerGameData');
            const isOnlineMode = !!isOnlineModeStrStr;
            const isWaiting = gameState.getGamePhase() === 'waiting';
            
            if (!isOnlineMode && isWaiting) {
                // 本地多人或人机模式，直接发送游戏开始消息
                gameInfo.addGameStart(gameState.getCurrentPlayer());
            } else if (isOnlineMode) {
                console.log('[初始化] 联机模式跳过发送游戏开始消息，等待全员加载完毕由网络管理器触发');
            } else {
                console.log('[初始化] 跳过发送游戏开始消息, 原因:', { phase: gameState.getGamePhase() });
            }

            // 9. 初始化bot控制器并处理游戏开始
            botController.setEnabled(true);
            this.handleGameStart();

            // 10. 记录游戏开始时间
            gameState.recordGameStartTime();

            // 10.5 设置游戏正式开始状态（单机/本地多人直接开始）
            if (!isOnlineMode) {
                gameState.setGameOfficiallyStarted(true);
            }

            // 11. 初始化AI托管按钮状态
            aiTakeoverManager.initializeButton();
            eventHandler.updatePauseButtonText();

            // 12. 初始化聊天和闪电按钮显示状态
            this.initializeControlButtonsVisibility();

            // 13. 初始化积分系统（仅在道具模式下）
            this.energyManager.init();
            // 始终初始化道具管理器（用于控制道具按钮的显示/隐藏）
            this.skillManager.init();
            if (this.energyManager.isSkillModeEnabled()) {
                this.energyDisplay.init();
            }

            // 14. 初始化最后应用视角旋转（在UI全部创建完成后）
            if (this.localPlayerColor) {
                this.autoRotateBoard(this.localPlayerColor);
            } else {
                // 如果没有 localPlayerColor (本地多人模式)，强制进行0度旋转以应用正确的UI类名
                uiUpdater.rotateBoard(0);
            }

            console.log('飞行棋游戏初始化完成');
        } catch (error) {
            console.error('游戏初始化失败:', error);
        }
    }

    // 检查是否有棋子不在初始位置
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
     * 初始化控制区域按钮（聊天、闪电模式等）的显示状态
     */
    initializeControlButtonsVisibility() {
        const chatBtn = document.getElementById('chatBtn');
        const lightningBtn = document.getElementById('lightningBtn');
        const isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();

        // 检查加载动画是否正在显示
        const loadingIndicator = document.getElementById('loadingIndicator');
        const isLoading = loadingIndicator && loadingIndicator.style.display === 'flex';

        // 1. 聊天按钮：只有在线多人模式且非加载状态下才显示
        if (chatBtn) {
            if (isOnlineMultiplayer && !isLoading) {
                chatBtn.style.display = 'block';
            } else {
                chatBtn.style.display = 'none';
            }
        }

        // 2. 闪电模式按钮：只在人机模式（非本地多人且非在线多人）下显示
        if (lightningBtn) {
            const shouldShowLightning = lightningManager.shouldShowButton(gameState);
            if (shouldShowLightning && !isLoading) {
                lightningManager.init();
                lightningBtn.style.display = 'block';
                lightningManager.updateUI();
            } else {
                lightningBtn.style.display = 'none';
            }
        }
    }

    // 根据玩家颜色自动旋转棋盘
    autoRotateBoard(playerColor) {
        // 目标是将当前玩家放在左下角 (3号位的位置)
        // 棋盘默认顺序 (顺时针，从左下角开始): 紫色(3) -> 蓝色(4) -> 粉色(1) -> 黄色(2)
        // 也就是说：
        // 左下 = 3 (紫色)
        // 左上 = 4 (蓝色)
        // 右上 = 1 (粉色)
        // 右下 = 2 (黄色)
        
        let rotations = 0;
        switch (Number(playerColor)) {
            case 3: rotations = 0; break; // 紫色已经在左下角，不旋转
            case 4: rotations = 3; break; // 蓝色在左上角，顺时针旋转3次（270度）到左下角
            case 1: rotations = 2; break; // 粉色在右上角，顺时针旋转2次（180度）到左下角
            case 2: rotations = 1; break; // 黄色在右下角，顺时针旋转1次（90度）到左下角
        }
        
        // 无论如何都要调用一次，确保赋予正确的初始 class
        uiUpdater.rotateBoard(rotations);
    }

    // 处理URL参数
    handleUrlParameters() {
        // 首先检查是否有新的游戏配置（本地多人或AI模式）
        // 如果有，应该清除旧的联机模式数据
        const checkGameConfigStr = sessionStorage.getItem('gameConfig');
        if (checkGameConfigStr) {
            try {
                const checkGameConfig = JSON.parse(checkGameConfigStr);
                // 如果是本地多人模式或AI模式（包括没有明确mode字段的旧配置），清除联机模式数据
                if (checkGameConfig.mode === 'local_multiplayer' || 
                    checkGameConfig.humanPlayer !== undefined) {
                    sessionStorage.removeItem('multiplayerGameData');
                }
            } catch (error) {
                console.error('预检查游戏配置失败:', error);
            }
        }

        // 然后检查多人游戏数据（联机模式）
        const multiplayerGameDataStr = sessionStorage.getItem('multiplayerGameData');
        if (multiplayerGameDataStr) {
            try {
                const multiplayerGameData = JSON.parse(multiplayerGameDataStr);

                // 确保audioManager已暴露到全局（联机模式需要）
                if (!window.audioManager) {
                    window.audioManager = audioManager;
                }

                // 更新页面标题为在线多人模式
                const multiplayerConfig = {
                    mode: 'online_multiplayer',
                    playerCount: multiplayerGameData.players ? multiplayerGameData.players.length : 2,
                    pieceCount: multiplayerGameData.pieceCount || 4,
                    takeoffRule: multiplayerGameData.takeoffRule || 'even',
                    skillMode: multiplayerGameData.skillMode || false // 添加道具模式配置
                };
                this.updatePageTitle(multiplayerConfig);

                // 设置棋子数量
                if (multiplayerGameData.pieceCount) {
                    gameState.initializePlayerChess(multiplayerGameData.pieceCount);
                }
                gameState.setTakeoffRule(multiplayerGameData.takeoffRule || 'even');

                // 设置在线多人模式标志
                gameState.setIsOnlineMultiplayer(true);

                // 更新面板切换按钮显示状态
                if (this.gameInfo && this.gameInfo.updatePanelSwitchButtonVisibility) {
                    this.gameInfo.updatePanelSwitchButtonVisibility();
                }

                // 分离真实玩家和AI玩家
                const realPlayers = multiplayerGameData.players.filter(p => !p.isAI);
                const aiPlayers = multiplayerGameData.players.filter(p => p.isAI);

                // 构建激活玩家列表（包括真实玩家和AI玩家）
                const activePlayers = multiplayerGameData.players.map(p => p.color || p.id).sort((a, b) => a - b);
                activePlayerManager.setActivePlayers(activePlayers);

                // 设置玩家名称和表情
                for (const player of multiplayerGameData.players) {
                    const playerId = player.color || player.id;
                    this.updatePlayerName(playerId, player.nickname || `玩家${playerId}`);
                    if (player.emoji) {
                        this.updatePlayerEmoji(playerId, player.emoji);
                    }
                }

                // 设置当前玩家 - 在多人在线模式下，应该使用统一的起始玩家
                if (multiplayerGameData.currentPlayer) {
                    const currentPlayerId = multiplayerGameData.currentPlayer.color || multiplayerGameData.currentPlayer.id;
                    gameState.setCurrentPlayer(currentPlayerId);
                    activePlayerManager.setCurrentActivePlayer(currentPlayerId);
                } else {
                    // 如果没有指定当前玩家，使用第一个激活玩家
                    const firstPlayer = activePlayers[0];
                    gameState.setCurrentPlayer(firstPlayer);
                    activePlayerManager.setCurrentActivePlayer(firstPlayer);
                }

                // 如果有AI玩家，启用botController并设置AI玩家配置
                if (aiPlayers.length > 0) {
                    botController.setEnabled(true);

                    // 设置AI玩家到gameState
                    const aiPlayerIds = aiPlayers.map(ai => ai.color || ai.id);
                    gameState.setBotPlayers(aiPlayerIds);

                    // 设置AI难度
                    const botDifficulties = {};
                    aiPlayers.forEach(ai => {
                        botDifficulties[ai.color || ai.id] = ai.difficulty || 'easy';
                    });
                    botController.setBotDifficulties(botDifficulties);
                } else {
                    // 没有AI玩家，禁用botController
                    botController.setEnabled(false);
                }

                // 初始化多人游戏管理器
                this.multiplayerGameManager.init(multiplayerGameData, this);

                // 记录需要旋转的视角颜色，推迟到初始化结尾执行
                this.localPlayerColor = this.multiplayerGameManager.getPlayerNumberByPlayerId(this.multiplayerGameManager.playerId);

                return;
            } catch (error) {
                console.error('解析多人游戏数据失败:', error);
            }
        }

        // 其次从sessionStorage获取游戏配置
        const gameConfigStr = sessionStorage.getItem('gameConfig');
        if (gameConfigStr) {
            try {
                const gameConfig = JSON.parse(gameConfigStr);
                console.log('从sessionStorage加载游戏配置:', gameConfig);

                // 记录需要旋转的视角颜色，推迟到初始化结尾执行
                if (gameConfig.mode !== 'local_multiplayer') {
                    // 对于人机模式，真实玩家在1号位，颜色在 humanPlayer 中
                    this.localPlayerColor = gameConfig.humanPlayer || 1;
                }

                // 更新页面标题
                this.updatePageTitle(gameConfig);

                // 设置棋子数量
                if (gameConfig.pieceCount) {
                    gameState.initializePlayerChess(gameConfig.pieceCount);
                }
                gameState.setTakeoffRule(gameConfig.takeoffRule || 'even');

                // 处理本地多人模式
                if (gameConfig.mode === 'local_multiplayer') {
                    // 清除联机模式的所有数据
                    sessionStorage.removeItem('multiplayerGameData');

                    // 设置本地多人模式标志
                    gameState.setIsLocalMultiplayer(true);
                    // 确保清除在线多人模式标志
                    gameState.setIsOnlineMultiplayer(false);

                    // 清除之前联机模式的会话数据，避免错误的重连尝试
                    if (window.reconnectManager) {
                        window.reconnectManager.clearPlayerIdentity();
                    }

                    // 设置audioManager为单机模式
                    if (window.audioManager) {
                        window.audioManager.setSinglePlayerMode();
                    }

                    // 更新面板切换按钮显示状态
                    if (this.gameInfo && this.gameInfo.updatePanelSwitchButtonVisibility) {
                        this.gameInfo.updatePanelSwitchButtonVisibility();
                    }

                    // 构建激活玩家列表（按颜色排序）
                    const activePlayers = gameConfig.players.map(p => p.id).sort((a, b) => a - b);
                    activePlayerManager.setActivePlayers(activePlayers);

                    // 设置玩家名称和表情
                    for (const player of gameConfig.players) {
                        this.updatePlayerName(player.id, player.name);
                        if (player.emoji && player.emoji.key) {
                            this.updatePlayerEmoji(player.id, player.emoji.key);
                        }
                    }

                    // 设置颜色最小的玩家为起始玩家（activePlayers已排序）
                    const firstPlayer = activePlayers[0];
                    gameState.setCurrentPlayer(firstPlayer);
                    activePlayerManager.setCurrentActivePlayer(firstPlayer);

                    // 处理本地多人中的AI玩家（可选）
                    const aiPlayers = (gameConfig.players || []).filter(p => p && p.isAI === true);
                    if (aiPlayers.length > 0) {
                        const aiPlayerIds = aiPlayers.map(p => p.id);
                        gameState.setBotPlayers(aiPlayerIds);

                        const botDifficulties = {};
                        aiPlayerIds.forEach(id => {
                            botDifficulties[id] = (gameConfig.botDifficulties && gameConfig.botDifficulties[id]) || 'easy';
                        });
                        botController.setBotDifficulties(botDifficulties);
                        botController.setEnabled(true);

                        // 根据难度设置AI表情（困难用随机表情，简单用bot表情）
                        this.setupBotEmojis(firstPlayer, null, aiPlayerIds);
                    } else {
                        // 没有AI玩家，禁用botController
                        botController.setEnabled(false);
                    }

                    return;
                }

                // 处理AI模式（原有逻辑）
                const humanPlayer = gameConfig.humanPlayer;
                const bots = gameConfig.bots || [];

                // 清除联机模式的所有数据
                sessionStorage.removeItem('multiplayerGameData');

                // AI模式是单机模式，清除之前联机模式的会话数据
                if (window.reconnectManager) {
                    window.reconnectManager.clearPlayerIdentity();
                }
                // 确保清除在线多人模式标志
                gameState.setIsOnlineMultiplayer(false);

                // 设置audioManager为单机模式
                if (window.audioManager) {
                    window.audioManager.setSinglePlayerMode();
                }

                // 构建激活玩家列表
                const activePlayers = [humanPlayer, ...bots].filter(p => p).sort((a, b) => a - b);
                activePlayerManager.setActivePlayers(activePlayers);

                // 设置玩家名称
                playerNameManager.setupPlayersWithActiveBots(
                    humanPlayer,
                    gameConfig.humanUsername || '玩家',
                    bots,
                    gameConfig.botDifficulties || {}
                );

                // 更新玩家名称显示
                this.updatePlayerName(humanPlayer, gameConfig.humanUsername || '玩家');

                // 设置当前玩家为人类玩家
                gameState.setCurrentPlayer(humanPlayer);
                activePlayerManager.setCurrentActivePlayer(humanPlayer);

                // 设置人类玩家表情
                if (gameConfig.humanEmoji) {
                    this.updatePlayerEmoji(humanPlayer, gameConfig.humanEmoji);
                }

                // 为激活的机器人玩家设置随机表情
                this.setupBotEmojis(humanPlayer, gameConfig.humanEmoji, bots);

                // 设置AI难度
                if (gameConfig.botDifficulties) {
                    botController.setBotDifficulties(gameConfig.botDifficulties);
                }

                // 设置电脑玩家配置到gameState
                gameState.setBotPlayers(bots);

                // 启用botController
                botController.setEnabled(true);

                return;
            } catch (error) {
                console.error('解析游戏配置失败:', error);
            }
        }

        // 如果没有sessionStorage配置，则尝试URL参数（向后兼容）
        const urlParams = new URLSearchParams(window.location.search);
        const playerColor = urlParams.get('playerColor');
        const playerName = urlParams.get('playerName');
        const playerEmoji = urlParams.get('playerEmoji');
        const activeBots = urlParams.get('activeBots');
        const pieceCount = urlParams.get('pieceCount');

        // 处理棋子个数参数
        if (pieceCount) {
            const parsedPieceCount = parseInt(pieceCount);
            if (!isNaN(parsedPieceCount) && parsedPieceCount >= 1 && parsedPieceCount <= 4) {
                gameState.initializePlayerChess(parsedPieceCount);
            } else {
                console.warn(`无效的棋子个数参数：${pieceCount}，使用默认值4`);
            }
        }

        // 如果有玩家颜色参数，初始化玩家名称管理器并更新显示
        if (playerColor && playerName) {
            const selectedPlayer = parseInt(playerColor);
            // 解析激活的AI玩家
            const activeBotNumbers = activeBots ? activeBots.split(',').map(num => parseInt(num.trim())).filter(num => !isNaN(num)) : [];
            // 构建所有激活玩家列表（用户玩家 + AI玩家）
            const allActivePlayers = [selectedPlayer, ...activeBotNumbers].filter((value, index, self) => self.indexOf(value) === index).sort((a, b) => a - b);
            // 设置激活玩家管理器
            activePlayerManager.setActivePlayers(allActivePlayers);

            // 设置玩家名称，只为激活的AI设置Bot名称
            playerNameManager.setupPlayersWithActiveBots(selectedPlayer, playerName, activeBotNumbers);
            this.updatePlayerName(selectedPlayer, playerName);

            // 设置当前玩家为人类玩家（确保游戏总是由人类玩家开始）
            gameState.setCurrentPlayer(selectedPlayer);
            activePlayerManager.setCurrentActivePlayer(selectedPlayer);
            // 如果有表情参数，设置人类玩家表情
            if (playerEmoji) {
                this.updatePlayerEmoji(selectedPlayer, playerEmoji);
            }

            // 为激活的机器人玩家设置随机表情
            this.setupBotEmojis(selectedPlayer, playerEmoji, activeBotNumbers);

            // 设置电脑玩家配置到gameState
            gameState.setBotPlayers(activeBotNumbers);

            // 为URL参数模式更新标题
            const urlGameConfig = {
                mode: 'ai_battle',
                bots: activeBotNumbers,  // 使用bots数组动态计算
                pieceCount: parseInt(pieceCount) || 4
            };
            this.updatePageTitle(urlGameConfig);
        } else {
            console.log('没有找到有效的URL参数，使用默认设置');
            // 如果没有参数，使用默认设置（所有其他玩家都是AI）
            playerNameManager.initFromUrlParams();
            // 为所有机器人玩家设置随机表情（除了玩家1）
            this.setupBotEmojis(1);

            // 默认配置的标题
            const defaultGameConfig = {
                mode: 'ai_battle',
                bots: [2, 3, 4],  // 默认3个bot
                pieceCount: 4
            };
            this.updatePageTitle(defaultGameConfig);
        }
    }

    // 更新页面标题
    updatePageTitle(gameConfig) {
        let titleText = '极简飞行棋';

        try {
            if (gameConfig.mode === 'local_multiplayer') {
                // 本地多人模式
                const playerCount = gameConfig.players?.length || gameConfig.playerCount || 4;
                const pieceCount = gameConfig.pieceCount || 4;
                const skillMode = gameConfig.skillMode === true;
                const modeText = skillMode ? '道具模式' : '标准模式';
                titleText = `本地多人-${playerCount}人${pieceCount}棋子-${modeText}`;
            } else if (gameConfig.mode === 'online_multiplayer') {
                // 在线多人模式
                const playerCount = gameConfig.playerCount || 4;
                const pieceCount = gameConfig.pieceCount || 4;
                const skillMode = gameConfig.skillMode === true;
                const modeText = skillMode ? '道具模式' : '标准模式';
                titleText = `在线多人-${playerCount}人${pieceCount}棋子-${modeText}`;
            } else {
                // 人机对战模式 - 动态计算玩家数量
                const playerCount = gameConfig.bots
                    ? 1 + gameConfig.bots.length  // 1个人类玩家 + bot数量
                    : (gameConfig.playerCount || 4);
                const pieceCount = gameConfig.pieceCount || 4;
                const skillMode = gameConfig.skillMode === true;
                const modeText = skillMode ? '道具模式' : '标准模式';
                titleText = `人机对战-${playerCount}人${pieceCount}棋子-${modeText}`;
            }

            // 更新页面标题
            document.title = titleText;
        } catch (error) {
            console.error('更新页面标题失败:', error);
            document.title = '极简飞行棋';
        }
    }

    // 更新玩家名称显示
    updatePlayerName(playerNumber, customName) {
        // 首先更新playerNameManager中的名称
        if (customName) {
            playerNameManager.setPlayerName(playerNumber, customName);
        }

        // 更新所有显示该玩家名称的元素
        const playerNameElements = document.querySelectorAll(`.player-${playerNumber}-info .player-name`);
        playerNameElements.forEach(element => {
            element.textContent = customName;
        });

        // 更新其他玩家为Bot名称
        for (let i = 1; i <= 4; i++) {
            if (i !== playerNumber) {
                const botNameElements = document.querySelectorAll(`.player-${i}-info .player-name`);
                const botName = playerNameManager.getPlayerName(i);
                botNameElements.forEach(element => {
                    element.textContent = botName;
                });
            }
        }
    }

    // 更新玩家表情显示
    async updatePlayerEmoji(playerNumber, emojiKey) {
        try {
            // 动态导入表情数据
            const { emojis } = await import('../assets/emojis.js');

            if (emojis[emojiKey]) {
                const emojiElements = document.querySelectorAll(`#player-${playerNumber}-emoji`);
                emojiElements.forEach(element => {
                    element.innerHTML = emojis[emojiKey].svg;
                });

                // 查找移动端表情元素
                const mobileEmojiElements = document.querySelectorAll(`#player-${playerNumber}-emoji-mobile`);
                mobileEmojiElements.forEach(element => {
                    element.innerHTML = emojis[emojiKey].svg;
                });
            }
        } catch (error) {
            console.error('加载表情失败:', error);
        }
    }

    // 为机器人玩家设置表情
    async setupBotEmojis(humanPlayerNumber, humanPlayerEmoji = null, activeBotNumbers = null) {
        try {
            // 动态导入表情数据
            await import('../assets/emojis.js');

            // 如果没有指定激活的AI玩家，默认为除人类玩家外的所有玩家
            const botsToSetup = activeBotNumbers || [1, 2, 3, 4].filter(i => i !== humanPlayerNumber);

            // 为每个机器人玩家设置表情
            for (const i of botsToSetup) {
                if (i !== humanPlayerNumber) {
                    // 简单/困难AI统一使用bot表情
                    this.updatePlayerEmoji(i, 'bot');
                }
            }
        } catch (error) {
            console.error('设置机器人表情失败:', error);
        }
    }

    // 设置棋子元素
    setupChessElements() {
        try {
            // 获取所有棋子元素并关联到游戏状态
            const playerChess = gameState.getPlayerChess();
            const pieceCount = gameState.pieceCount; // 获取当前棋子个数

            for (let player = 1; player <= 4; player++) {
                const chessElements = document.querySelectorAll(`#board-svg use[href="#chess"].player-${player}`);
                for (let i = 0; i < pieceCount; i++) {
                    if (chessElements[i]) {
                        // 关联棋子元素到游戏状态
                        playerChess[player][i].element = chessElements[i];

                        // 设置初始位置，跳过同步（游戏初始化不需要同步）
                        animation.moveChessToStart(player, i, null, true);
                    }
                }

                // 隐藏多余的棋子元素
                for (let i = pieceCount; i < chessElements.length; i++) {
                    if (chessElements[i]) {
                        chessElements[i].style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('设置棋子元素失败:', error);
        }
    }

    // 重置游戏
    async resetGame() {
        try {
            audioManager.mute();
            console.log('重置游戏...');

            // 1. 停止当前的思考时间进度条
            uiUpdater.stopThinkingProgressBar();

            // 2. 获取游戏配置信息（优先从sessionStorage，其次从URL参数）
            let humanPlayer = 1; // 默认值
            let playerName = '玩家';
            let activeBots = [];

            // 首先尝试从sessionStorage获取游戏配置
            const gameConfigStr = sessionStorage.getItem('gameConfig');
            if (gameConfigStr) {
                try {
                    const gameConfig = JSON.parse(gameConfigStr);
                    if (gameConfig.mode === 'local_multiplayer') {
                        // 本地多人模式：第一个玩家为初始玩家
                        if (gameConfig.players && gameConfig.players.length > 0) {
                            humanPlayer = gameConfig.players[0].id;
                            playerName = gameConfig.players[0].name;
                        }
                    } else {
                        // AI对战模式：人类玩家为初始玩家
                        humanPlayer = gameConfig.humanPlayer || 1;
                        playerName = gameConfig.humanUsername || '玩家';
                        activeBots = gameConfig.bots || [];
                    }
                    console.log(`从sessionStorage获取人类玩家信息：玩家${humanPlayer}`);
                } catch (error) {
                    console.error('解析sessionStorage游戏配置失败:', error);
                }
            } else {
                // 如果没有sessionStorage配置，尝试URL参数（向后兼容）
                const urlParams = new URLSearchParams(window.location.search);
                const playerColor = urlParams.get('playerColor');
                const urlPlayerName = urlParams.get('playerName');
                const urlActiveBots = urlParams.get('activeBots');

                if (playerColor) {
                    humanPlayer = parseInt(playerColor);
                }
                if (urlPlayerName) {
                    playerName = urlPlayerName;
                }
                if (urlActiveBots) {
                    activeBots = urlActiveBots.split(',').map(Number);
                }
                console.log(`从URL参数获取人类玩家信息：玩家${humanPlayer}`);
            }

            // 3. 重置游戏状态
            await gameState.resetGame();

            // 4. 更新暂停按钮状态
            eventHandler.updatePauseButtonText();

            // 5. 重新设置棋子位置
            this.resetChessPositions();

            // 6. 设置游戏阶段为waiting
            gameState.setGamePhase('waiting');

            // 7. 设置当前玩家为人类玩家（确保游戏总是由人类玩家开始）
            gameState.setCurrentPlayer(humanPlayer);
            activePlayerManager.setCurrentActivePlayer(humanPlayer);
            console.log(`重置游戏，设置当前玩家为人类玩家：${humanPlayer}`);

            // 8. 重新设置玩家名称和机器人配置
            if (activeBots.length > 0) {
                playerNameManager.setupPlayersWithActiveBots(humanPlayer, playerName, activeBots);
                this.updatePlayerName(humanPlayer, playerName);
                // 重新设置电脑玩家配置到gameState
                gameState.setBotPlayers(activeBots);
                console.log(`重置后重新设置玩家名称：玩家${humanPlayer} -> ${playerName}`);
            }

            // 9. 更新UI
            uiUpdater.updateUI();

            // 10. 清空游戏信息
            gameInfo.clearMessages();

            // 11. 添加游戏开始信息
            // 在联机模式下，只有房主发送游戏开始消息，避免重复显示
            if (!this.multiplayerGameManager || !this.multiplayerGameManager.isOnlineMode || this.multiplayerGameManager.isHostPlayer()) {
                const currentPlayer = gameState.getCurrentPlayer();
                gameInfo.addGameStart(currentPlayer);
            }

            // 12. 重置击败次数显示
            this.defeatCountDisplay.resetAllDefeatCounts();

            // 13. 重置进度显示
            this.progressDisplay.resetAllProgress();

            // 14. 重新触发游戏开始逻辑
            this.handleGameStart();

            // 15. 更新页面标题
            if (gameConfigStr) {
                try {
                    const gameConfig = JSON.parse(gameConfigStr);
                    this.updatePageTitle(gameConfig);
                } catch (error) {
                    console.error('更新页面标题失败:', error);
                }
            }

            console.log('游戏重置完成');
            audioManager.unmute();
            gameState.hidePauseIndicator();
        } catch (error) {
            console.error('重置游戏失败:', error);
        }
    }

    // 重置棋子位置
    resetChessPositions() {
        try {
            const pieceCount = gameState.pieceCount; // 获取当前棋子个数
            for (let player = 1; player <= 4; player++) {
                for (let i = 0; i < pieceCount; i++) {
                    // 将所有棋子移动到起始位置，跳过同步（游戏初始化不需要同步）
                    animation.moveChessToStart(player, i, null, true);
                }
            }
        } catch (error) {
            console.error('重置棋子位置失败:', error);
        }
    }

    // 开始游戏（从waiting状态转换到rolling状态）
    startGame() {
        try {
            const gamePhase = gameState.getGamePhase();
            if (gamePhase === 'waiting') {
                gameState.setGamePhase('rolling');
                uiUpdater.updateUI();
                console.log('游戏开始');
            }
        } catch (error) {
            console.error('开始游戏失败:', error);
        }
    }

    // 暂停游戏
    pauseGame() {
        try {
            const gamePhase = gameState.getGamePhase();
            if (gamePhase !== 'finished' && gamePhase !== 'waiting') {
                gameState.setGamePhase('paused');
                uiUpdater.updateUI();
            }
        } catch (error) {
            console.error('暂停游戏失败:', error);
        }
    }

    // 恢复游戏
    resumeGame() {
        try {
            const gamePhase = gameState.getGamePhase();
            if (gamePhase === 'paused') {
                // 恢复到暂停前的游戏阶段，而不是固定设置为'rolling'
                const phaseBeforePause = gameState.gamePhaseBeforePause;
                if (phaseBeforePause && phaseBeforePause !== 'paused') {
                    gameState.setGamePhase(phaseBeforePause);
                } else {
                    // 如果没有保存的阶段或阶段无效，默认设置为'rolling'
                    gameState.setGamePhase('rolling');
                }
                
                uiUpdater.updateUI();
                
                // 重新启动思考计时器和进度条
                const currentPhase = gameState.getGamePhase();
                if (currentPhase === 'rolling' || currentPhase === 'selecting' || currentPhase === 'moving') {
                    if (window.uiUpdater && typeof window.uiUpdater.resumeThinkingProgressBar === 'function') {
                        window.uiUpdater.resumeThinkingProgressBar(() => {
                            console.log(`玩家${gameState.getCurrentPlayer()}思考时间到，自动切换到下一个玩家`);
                            if (this.dice && typeof this.dice.handleThinkingTimeoutWrapper === 'function') {
                                this.dice.handleThinkingTimeoutWrapper();
                            }
                        });
                    } else if (window.uiUpdater && typeof window.uiUpdater.startThinkingProgressBar === 'function') {
                        window.uiUpdater.startThinkingProgressBar(() => {
                            console.log(`玩家${gameState.getCurrentPlayer()}思考时间到，自动切换到下一个玩家`);
                            if (this.dice && typeof this.dice.handleThinkingTimeoutWrapper === 'function') {
                                this.dice.handleThinkingTimeoutWrapper();
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.error('恢复游戏失败:', error);
        }
    }

    // 获取游戏状态信息
    getGameInfo() {
        try {
            return {
                currentPlayer: gameState.getCurrentPlayer(),
                gamePhase: gameState.getGamePhase(),
                diceValue: gameState.getDiceValue(),
                winner: gameState.getWinner(),
                consecutiveSixes: gameState.getConsecutiveSixes(),
                canReroll: gameState.getCanReroll(),
                playerChess: gameState.getPlayerChess()
            };
        } catch (error) {
            console.error('获取游戏信息失败:', error);
            return null;
        }
    }

    // 调试方法：移动棋子
    debugMoveChess() {
        try {
            chessPiece.debugMoveChess();
        } catch (error) {
            console.error('调试移动棋子失败:', error);
        }
    }

    // 调试方法：完成棋子
    debugFinishChess() {
        try {
            chessPiece.debugFinishChess();
        } catch (error) {
            console.error('调试完成棋子失败:', error);
        }
    }

    // 调试方法：掷指定点数的骰子
    async debugRollDice(value) {
        try {
            await dice.debugRollDice(value);
        } catch (error) {
            console.error('调试掷骰子失败:', error);
        }
    }

    // 获取模块实例（用于调试和扩展）
    getModules() {
        return {
            gameState,
            dice,
            chessPiece: this.chessPiece,
            animation,
            uiUpdater,
            eventHandler,
            utils
        };
    }

    // 销毁游戏实例
    async destroy() {
        try {
            // 移除事件监听器
            eventHandler.removeEventListeners();

            // 清理游戏状态
            await gameState.resetGame();

            console.log('游戏实例已销毁');
        } catch (error) {
            console.error('销毁游戏实例失败:', error);
        }
    }

    // 检查游戏是否可以进行操作
    canPerformAction() {
        const gamePhase = gameState.getGamePhase();
        return gamePhase !== 'moving' && gamePhase !== 'finished' && gamePhase !== 'paused';
    }

    // 获取当前可移动的棋子
    getMovableChess() {
        try {
            const currentPlayer = gameState.getCurrentPlayer();
            const diceValue = gameState.getDiceValue();
            const gamePhase = gameState.getGamePhase();

            if (gamePhase !== 'selecting') {
                return [];
            }

            const playerChess = gameState.getPlayerChess();
            const movableChess = [];

            playerChess[currentPlayer].forEach((chess, index) => {
                // 简化的可移动性检查
                if (chess.position === 'start' && diceValue === 6) {
                    movableChess.push({ player: currentPlayer, chessIndex: index });
                } else if (chess.position !== 'start' && chess.position !== 'finish') {
                    movableChess.push({ player: currentPlayer, chessIndex: index });
                }
            });

            return movableChess;
        } catch (error) {
            console.error('获取可移动棋子失败:', error);
            return [];
        }
    }

    // 处理游戏开始时的bot逻辑
    handleGameStart() {
        try {
            const gamePhase = gameState.getGamePhase();
            const isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();
            if (isOnlineMultiplayer) {
                return;
            }

            if (botController.isCurrentPlayerBot()) {
                // 延迟一小段时间让UI完全初始化
                setTimeout(() => {
                    botController.handleBotTurn();
                    // 确保UI更新以反映游戏阶段的变化
                    uiUpdater.updateUI();
                }, 500);
            } else {
                // 确保人类玩家可以操作，设置游戏阶段为rolling
                if (gamePhase === 'waiting') {
                    gameState.setGamePhase('rolling');
                    uiUpdater.updateUI();
                }
            }
        } catch (error) {
            console.error('处理游戏开始时的bot逻辑失败:', error);
        }
    }

    // 保存游戏状态到本地存储
    saveGameState() {
        try {
            const gameInfo = this.getGameInfo();
            localStorage.setItem('flyingChessGameState', JSON.stringify(gameInfo));
        } catch (error) {
            console.error('保存游戏状态失败:', error);
        }
    }

    // 从本地存储加载游戏状态
    loadGameState() {
        try {
            const savedState = localStorage.getItem('flyingChessGameState');
            if (savedState) {
                const gameInfo = JSON.parse(savedState);

                // 恢复游戏状态
                gameState.setCurrentPlayer(gameInfo.currentPlayer);
                gameState.setGamePhase(gameInfo.gamePhase);
                gameState.setDiceValue(gameInfo.diceValue);
                gameState.setWinner(gameInfo.winner);
                gameState.setConsecutiveSixes(gameInfo.consecutiveSixes);
                gameState.setCanReroll(gameInfo.canReroll);

                // 恢复棋子位置
                const playerChess = gameState.getPlayerChess();
                const pieceCount = gameState.pieceCount; // 获取当前棋子个数
                for (let player = 1; player <= 4; player++) {
                    for (let i = 0; i < pieceCount; i++) {
                        if (gameInfo.playerChess[player] && gameInfo.playerChess[player][i]) {
                            playerChess[player][i].position = gameInfo.playerChess[player][i].position;
                            animation.updateChessPosition(player, i);
                        }
                    }
                }

                uiUpdater.updateUI();
                return true;
            }
            return false;
        } catch (error) {
            console.error('加载游戏状态失败:', error);
            return false;
        }
    }
}

// 全局游戏实例
let gameInstance = null;

// 初始化游戏
function initializeGame() {
    try {
        // 首先暴露audioManager到全局，确保其他模块可以访问
        window.audioManager = audioManager;

        // 暴露aiTakeoverManager到全局，确保联机模式可以访问
        window.aiTakeoverManager = aiTakeoverManager;

        if (gameInstance) {
            gameInstance.destroy();
        }

        gameInstance = new FlyingChessGame();

        // 便于调试，将游戏实例暴露到全局
        window.game = gameInstance;
        window.main = gameInstance; // 添加main引用供结算模态框使用
        window.gameModules = gameInstance.getModules();
        window.eventHandler = gameInstance.eventHandler; // 暴露eventHandler到全局，供多人联机模式使用

        // 暴露核心模块到全局，供multiplayerGameManager使用
        window.gameState = gameState;
        window.uiUpdater = uiUpdater;
        window.gameInfo = gameInfo;
        window.botController = botController;

        // 只有在非联机模式下才设置为单机模式
        if (window.audioManager && !gameState.getIsOnlineMultiplayer()) {
            window.audioManager.setSinglePlayerMode();
        }

        return gameInstance;
    } catch (error) {
        console.error('初始化游戏失败:', error);
        return null;
    }
}

// 页面加载完成后自动初始化游戏
// 全局函数：更新页面标题
function updatePageTitle() {
    if (gameInstance) {
        // 从sessionStorage获取游戏配置
        const gameConfigStr = sessionStorage.getItem('gameConfig');
        if (gameConfigStr) {
            try {
                const gameConfig = JSON.parse(gameConfigStr);
                gameInstance.updatePageTitle(gameConfig);
            } catch (error) {
                console.error('更新页面标题失败:', error);
                document.title = '极简飞行棋';
            }
        } else {
            // 如果没有配置，使用默认标题
            document.title = '极简飞行棋';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 解析URL参数并显示房间号
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');

    const controlTitle = document.querySelector('.control-title');
    const roomCodeDisplay = document.getElementById('gameRoomCodeDisplay');
    const roomCodeElement = document.getElementById('gameRoomCode');

    if (roomCode) {
        // 联机模式：显示房间号
        if (roomCodeDisplay && roomCodeElement) {
            roomCodeElement.textContent = roomCode;
            roomCodeDisplay.style.display = 'block';
        }
        if (controlTitle) {
            controlTitle.style.display = 'block';
        }

        // 检查是否有有效的联机会话
        const multiplayerGameDataStr = sessionStorage.getItem('multiplayerGameData');
        let isValidSession = false;

        if (multiplayerGameDataStr) {
            try {
                const multiplayerGameData = JSON.parse(multiplayerGameDataStr);
                // 检查是否有有效的游戏会话ID或房间代码匹配
                isValidSession = multiplayerGameData.gameSessionId ||
                    (multiplayerGameData.roomCode && multiplayerGameData.roomCode === roomCode);
            } catch (error) {
                console.error('解析multiplayerGameData失败:', error);
                isValidSession = false;
            }
        }

        // 如果URL中有房间号但没有有效的联机会话，并且不是观战页面，重定向回主页
        if (!isValidSession && !window.location.pathname.includes('spectate')) {
            console.log('检测到无效的房间会话，重定向回主页');
            setTimeout(() => {
                window.location.replace('./');
            }, 1000);
            return;
        }
    } else {
        // 非联机模式：隐藏整个标题区域
        if (controlTitle) {
            controlTitle.style.display = 'none';
        }
    }

    initializeGame();
});

window.toggleDebugPanel = function() {
    const debugSection = document.querySelector('.debug-section');
    if (debugSection && debugSection.classList.contains('is-enabled')) {
        debugSection.classList.toggle('show-debug');
    }
};

// 注册全局 getter，在控制台输入 debug 回车即可启用/停用调试功能
Object.defineProperty(window, 'debug', {
    get: function() {
        const debugSection = document.querySelector('.debug-section');
        if (debugSection) {
            const isEnabled = debugSection.classList.toggle('is-enabled');
            if (!isEnabled) {
                debugSection.classList.remove('show-debug');
            }
            return `调试功能已${isEnabled ? '启用 (可点击左侧把手展开面板)' : '停用'}`;
        }
        return '未找到调试面板元素';
    },
    configurable: true
});

// 导出主要接口
export {
    FlyingChessGame,
    initializeGame,
    gameInstance,
    updatePageTitle
};
