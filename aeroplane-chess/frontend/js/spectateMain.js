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
import { WebSocketClient } from './websocketClient.js';

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

        // 将道具/积分相关管理器暴露到全局，供multiplayerGameManager（观战初始化/同步）使用
        window.energyManager = this.energyManager;
        window.energyDisplay = this.energyDisplay;
        window.skillManager = this.skillManager;

        // 设置全局游戏实例引用（供其他模块使用）
        window.gameInstance = this;

        // 初始化游戏
        this.initializeGame();
    }

    // 初始化游戏
    initializeGame() {
        try {
            // 确保音频管理器处于开启状态
            audioManager.unmute();
            
            // 1. 重置游戏状态（在处理URL参数之前）
            gameState.resetGameState();

            // 禁用所有的控制功能，进入纯观战模式
            this.disableAllControls();

            // 2. 设置棋子元素
            this.setupChessElements();

            // 3. 设置事件监听器
            eventHandler.setGameInstance(this);
            eventHandler.setupEventListeners();

            // 4. 处理URL参数，建立连接
            this.handleUrlParameters();

            // 5. 解决浏览器自动播放限制
            this.setupAudioAutoPlayFix();

        } catch (error) {
            console.error('游戏初始化失败:', error);
        }
    }

    /**
     * 解决浏览器对自动播放音频的限制
     * 观战模式下玩家可能没有交互，导致没有声音
     */
    setupAudioAutoPlayFix() {
        const fixAudio = () => {
            // 播放一个无声片段或直接尝试触发音频上下文
            if (audioManager.isEnabled) {
                console.log('用户交互检测到，激活观战模式音效');
                // 某些浏览器需要通过播放一个音效来激活音频
                // 这里我们不真的播放，只是确保在交互后音效管理器能正常工作
                document.removeEventListener('click', fixAudio);
                document.removeEventListener('touchstart', fixAudio);
            }
        };

        document.addEventListener('click', fixAudio);
        document.addEventListener('touchstart', fixAudio);
        
        // 如果页面刷新后有加载遮罩，点击遮罩也可以激活音频
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.addEventListener('click', fixAudio);
        }
    }

    disableAllControls() {
        // 隐藏所有交互按钮
        const controlButtonsGrid = document.querySelector('.control-buttons-grid');
        if (controlButtonsGrid) controlButtonsGrid.style.display = 'none';
        
        const settlementGame = document.getElementById('settlementGame');
        if (settlementGame) settlementGame.style.display = 'none';

        const skillBtn = document.getElementById('skillBtn');
        if (skillBtn) skillBtn.style.display = 'none';
        const chatBtn = document.getElementById('chatBtn');
        if (chatBtn) chatBtn.style.display = 'none';
        // 设置所有按钮的disabled状态
        document.querySelectorAll('button').forEach(btn => {
            if (btn.id !== 'returnHome' && btn.id !== 'panelSwitchBtn') {
                btn.disabled = true;
            }
        });

        // 移除棋盘交互事件
        if (this.eventHandler) {
            this.eventHandler.setupChessEvents = function() {}; // 覆盖为空函数
            this.eventHandler.rebindChessEvents = function() {};
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
     * 初始化聊天按钮的显示状态
     */
    initializeChatButtonVisibility() {
        const chatBtn = document.getElementById('chatBtn');
        if (chatBtn) {
            const isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();

            // 检查加载动画是否正在显示
            const loadingIndicator = document.getElementById('loadingIndicator');
            const isLoading = loadingIndicator && loadingIndicator.style.display === 'flex';

            // 只有在线多人模式且非加载状态下才显示聊天按钮（本地多人不需要聊天）
            if (isOnlineMultiplayer && !isLoading) {
                chatBtn.style.display = 'block';
            } else {
                chatBtn.style.display = 'none';
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
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');
        if (roomCode) {
            // 设置观战模式的数据
            // 确保 window.WebSocketClient 可用
            if (typeof window !== 'undefined' && !window.WebSocketClient) {
                window.WebSocketClient = WebSocketClient;
            }

            const spectateData = {
                wsClient: window.wsClient || null,
                roomCode: roomCode,
                isSpectator: true,
                pieceCount: 4, // 默认值，连接后由服务器更新
                skillMode: false
            };
            
            // 设置在线多人模式标志
            gameState.setIsOnlineMultiplayer(true);

            // 更新面板切换按钮显示状态
            if (this.gameInfo && this.gameInfo.updatePanelSwitchButtonVisibility) {
                this.gameInfo.updatePanelSwitchButtonVisibility();
            }
            
            const config = {
                mode: 'online_multiplayer',
                playerCount: 4,
                pieceCount: 4,
                skillMode: false
            };
            this.updatePageTitle(config);
            
            // 确保audioManager已暴露到全局（联机模式需要）
            if (!window.audioManager) {
                window.audioManager = audioManager;
            }

            // 初始化多人游戏管理器，传递观战数据
            this.multiplayerGameManager.init(spectateData, this);

            // 观战模式固定视角
            uiUpdater.rotateBoard(0);
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