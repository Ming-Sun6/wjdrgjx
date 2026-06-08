// 事件处理模块 - 负责所有用户交互事件的处理
import { gameState } from './gameState.js';
import { dice } from './dice.js';
import { uiUpdater } from './uiUpdater.js';
import { activePlayerManager } from './activePlayerManager.js';
import { playerNameManager } from './playerNameManager.js';
import { gameInfo } from './gameInfo.js';
import { botController } from './botController.js';
import { progressDisplay } from './progressDisplay.js';
import { aiTakeoverManager } from './aiTakeoverManager.js';
import { sanitizeUserText } from './contentModeration.js';

class EventHandler {
    constructor() {
        // 初始化事件处理器
        this.gameInstance = null; // 将在main.js中设置
        this.pendingPause = false; // 延迟暂停标志
        this.pauseDebounceTime = 1000; // 防抖时间（1秒）
        this.lastPauseClickTime = 0; // 上次点击暂停的时间
        this.hiddenSkillIcons = {}; // 记录被隐藏的道具图标状态
    }

    // 设置游戏实例引用
    setGameInstance(gameInstance) {
        this.gameInstance = gameInstance;
    }

    // 设置事件监听器
    setupEventListeners() {
        this.setupDiceEvents();
        this.setupResetEvents();
        this.setupControlEvents();
        this.setupDebugEvents();
        this.setupChessEvents();
        this.setupKeyboardEvents();
        this.setupChatEvents();
    }

    // 设置骰子相关事件
    setupDiceEvents() {
        const diceDisplay = document.getElementById('diceDisplay');
        if (diceDisplay) {
            diceDisplay.addEventListener('click', () => this.handleDiceClick());
        }
    }

    // 设置重置游戏事件
    setupResetEvents() {
        const settlementGameBtn = document.getElementById('settlementGame');
        if (settlementGameBtn) {
            settlementGameBtn.addEventListener('click', () => this.handleSettlementClick());
            // 默认禁用，等初始化时根据模式和房主状态启用
            settlementGameBtn.disabled = true;
        }

        // 暂停游戏按钮事件
        const pauseGameBtn = document.getElementById('pauseGame');
        if (pauseGameBtn) {
            pauseGameBtn.addEventListener('click', () => this.handlePauseClick());
            // 默认禁用，等初始化时根据模式和房主状态启用
            pauseGameBtn.disabled = true;
        }
    }

    // 设置控制按钮事件
    setupControlEvents() {
        const showRulesBtn = document.getElementById('showRules');
        if (showRulesBtn) {
            showRulesBtn.addEventListener('click', () => this.handleShowRulesClick());
        }

        const returnHomeBtn = document.getElementById('returnHome');
        if (returnHomeBtn) {
            returnHomeBtn.addEventListener('click', () => this.handleReturnHomeClick());
        }

        // 音效开关按钮
        const toggleAudioBtn = document.getElementById('toggleAudio');
        if (toggleAudioBtn) {
            toggleAudioBtn.addEventListener('click', () => this.handleToggleAudioClick());
        }

        // AI托管按钮
        const toggleAITakeoverBtn = document.getElementById('toggleAITakeover');
        if (toggleAITakeoverBtn) {
            toggleAITakeoverBtn.addEventListener('click', () => this.handleToggleAITakeoverClick());
        }

        // 规则模态框关闭按钮
        const rulesCloseBtn = document.getElementById('rules-close');
        if (rulesCloseBtn) {
            rulesCloseBtn.addEventListener('click', () => this.handleRulesCloseClick());
        }

        // 点击模态框背景关闭
        const rulesModal = document.getElementById('rules-modal');
        if (rulesModal) {
            rulesModal.addEventListener('click', (e) => {
                if (e.target === rulesModal) {
                    this.handleRulesCloseClick();
                }
            });
        }
    }

    // 设置调试事件
    setupDebugEvents() {
        // 调试骰子按钮事件监听
        const diceBtns = document.querySelectorAll('.dice-btn');
        diceBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const value = parseInt(e.target.getAttribute('data-value'));
                this.handleDebugDiceClick(value);
            });
        });

        // 棋子移动调试按钮事件监听
        const moveForwardBtn = document.getElementById('move-forward-btn');
        const moveBackwardBtn = document.getElementById('move-backward-btn');

        if (moveForwardBtn) {
            moveForwardBtn.addEventListener('click', () => {
                this.handleDebugMoveClick(2);
            });
        }

        if (moveBackwardBtn) {
            moveBackwardBtn.addEventListener('click', () => {
                this.handleDebugMoveClick(-1);
            });
        }

        // 积分调试按钮事件监听
        const energy30Btn = document.getElementById('energy-30-btn');
        const energy100Btn = document.getElementById('energy-100-btn');
        
        if (energy30Btn) {
            energy30Btn.addEventListener('click', () => {
                this.handleSetEnergyClick(30);
            });
        }
        
        if (energy100Btn) {
            energy100Btn.addEventListener('click', () => {
                this.handleSetEnergyClick(100);
            });
        }
    }

    // 设置棋子点击事件
    setupChessEvents() {
        // 获取所有棋子元素并绑定点击事件
        for (let player = 1; player <= 4; player++) {
            const chessElements = document.querySelectorAll(`#board-svg use[href="#chess"].player-${player}`);
            const pieceCount = gameState.pieceCount; // 获取当前棋子个数
            for (let i = 0; i < pieceCount; i++) {
                if (chessElements[i]) {
                    // 绑定棋子点击事件
                    chessElements[i].addEventListener('click', (e) => this.handleChessClick(player, i, e));

                    // 绑定鼠标悬停事件（可选）
                    chessElements[i].addEventListener('mouseenter', (e) => this.handleChessHover(player, i, e));
                    chessElements[i].addEventListener('mouseleave', (e) => this.handleChessLeave(player, i, e));
                }
            }
        }
    }

    // 设置键盘事件
    setupKeyboardEvents() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    // 处理骰子点击
    async handleDiceClick() {
        try {
            // 检查是否在传送门模式，如果是则取消传送门
            if (window.gameInstance && window.gameInstance.isTeleportMode) {
                console.log('[传送门] 用户点击骰子，取消传送门模式');
                window.gameInstance.isTeleportMode = false;
                // 重置游戏阶段为rolling
                gameState.setGamePhase('rolling');
                gameState.setDiceValue(0);
                // 恢复骰子图标
                if (window.gameInstance.skillManager) {
                    window.gameInstance.skillManager.restoreDiceIcon();
                    window.gameInstance.skillManager.showNotification('已取消传送门');
                }
                return;
            }

            const gamePhase = gameState.getGamePhase();
            const isRolling = gameState.getIsRolling();
            const isPaused = gameState.getIsPaused();
            const currentPlayer = gameState.getCurrentPlayer();
            const isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();
            const isBotPlayer = gameState.isBotPlayer(currentPlayer);

            // 检查是否可以掷骰子（游戏暂停时不能投骰子）
            // 允许在waiting和rolling阶段掷骰子
            if ((gamePhase !== 'rolling' && gamePhase !== 'waiting') || isRolling || isPaused) {
                return;
            }

            // 在多人游戏中，检查权限
            if (isOnlineMultiplayer && this.gameInstance && this.gameInstance.multiplayerGameManager) {
                const localPlayerId = this.gameInstance.multiplayerGameManager.getCurrentPlayerId();
                const localPlayerNumber = this.gameInstance.multiplayerGameManager.getPlayerNumberByPlayerId(localPlayerId);
                const isHost = this.gameInstance.multiplayerGameManager.isHost;

                // 检查当前玩家是否被AI托管
                const currentPlayerId = this.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(currentPlayer);
                const currentPlayerData = this.gameInstance.multiplayerGameManager.players.get(currentPlayerId);
                const isCurrentPlayerAITakeover = this.gameInstance.multiplayerGameManager.aiTakeoverPlayers?.has(currentPlayerId) ||
                    currentPlayerData?.isAITakeover || false;

                // 如果是AI电脑玩家，只有房主可以操作
                if (isBotPlayer) {
                    if (!isHost) {
                        return;
                    }
                }
                // 如果当前玩家被AI托管
                else if (isCurrentPlayerAITakeover) {
                    // 判断是否是自己的回合
                    const isLocalPlayerTurn = currentPlayer === localPlayerNumber;

                    if (!isLocalPlayerTurn && !isHost) {
                        // 其他玩家的回合且该玩家被AI托管，只有房主可以代理
                        return;
                    }
                }
                // 如果是真实玩家，必须是本地玩家才能操作
                else if (currentPlayer !== localPlayerNumber) {
                    return;
                }

                if (currentPlayer === localPlayerNumber && isCurrentPlayerAITakeover) {
                    this.gameInstance.multiplayerGameManager.clearLocalAITakeoverForManualAction('manual_dice_click');
                }
            }

            // 执行掷骰子
            await dice.rollDice();

            // 更新UI
            uiUpdater.updateUI();
        } catch (error) {
            console.error('处理骰子点击时出错:', error);
        }
    }

    // 处理结算游戏点击
    handleSettlementClick() {
        try {
            // 在线多人模式下，检查是否为房主
            if (window.gameInstance && window.gameInstance.multiplayerGameManager &&
                window.gameInstance.multiplayerGameManager.isOnlineMode) {
                if (!window.gameInstance.multiplayerGameManager.isHost) {
                    console.log('只有房主可以提前结束游戏');
                    return;
                }
            }

            // 显示确认对话框
            const confirmed = confirm('确定要强制结算游戏吗？这将根据当前进度计算排名。');

            if (!confirmed) {
                return; // 用户取消，不执行结算
            }

            // 先暂停游戏
            gameState.setIsPaused(true);
            this.updatePauseButtonText();

            // 触发强制结算
            this.forceGameSettlement();
        } catch (error) {
            console.error('处理结算点击时出错:', error);
        }
    }

    // 强制结算游戏
    forceGameSettlement() {
        try {
            // 播放游戏结束音效
            if (window.audioManager && window.audioManager.playGameOverSound) {
                window.audioManager.playGameOverSound();
            }

            // 计算各玩家的完成进度
            const playerProgress = this.calculatePlayerProgress();

            // 根据进度排序确定排名
            const rankings = this.calculateRankings(playerProgress);

            // 设置游戏状态为结束
            gameState.setState('gamePhase', 'finished');

            // 在线多人模式下同步强制结算
            if (gameState.isOnlineMultiplayer && this.gameInstance && this.gameInstance.multiplayerGameManager) {
                this.gameInstance.multiplayerGameManager.syncForceSettlement(rankings);
            }

            // 显示结算模态框，传入排名信息
            if (this.gameInstance && this.gameInstance.settlementModal) {
                this.gameInstance.settlementModal.showWithRankings(rankings);
            }
        } catch (error) {
            console.error('强制结算游戏时出错:', error);
        }
    }

    // 计算玩家进度（使用progressDisplay的统一方法）
    calculatePlayerProgress() {
        const progress = {};
        const activePlayerNumbers = activePlayerManager.getActivePlayers();

        activePlayerNumbers.forEach(playerNumber => {
            const progressPercentage = progressDisplay.calculatePlayerProgress(playerNumber, gameState);
            const playerChess = gameState.getPlayerChess()[playerNumber];

            // 计算完成棋子数量和总进度
            let finishedCount = 0;
            let totalProgress = 0;

            playerChess.forEach(chess => {
                if (chess.finished) {
                    finishedCount++;
                    totalProgress += 56; // 完成的棋子算满进度
                } else if (chess.position >= 0) {
                    totalProgress += chess.position; // 在轨道上的棋子按位置计算
                }
                // 在起始区域的棋子（position === -1）不计算进度
            });

            progress[playerNumber] = {
                totalProgress,
                progressPercentage,
                finishedCount,
                playerName: playerNameManager.getPlayerName(playerNumber)
            };
        });

        return progress;
    }

    // 计算排名
    calculateRankings(playerProgress) {
        const rankings = Object.entries(playerProgress)
            .map(([playerNumber, progress]) => {
                const playerNum = parseInt(playerNumber);

                // 获取该玩家的击败次数数据
                const defeatCounts = {};
                for (let opponent = 1; opponent <= 4; opponent++) {
                    if (opponent !== playerNum) {
                        defeatCounts[opponent] = gameState.getDefeatCount(playerNum, opponent);
                    }
                }

                return {
                    playerNumber: playerNum,
                    ...progress,
                    defeatCounts: defeatCounts
                };
            })
            .sort((a, b) => {
                // 首先按完成棋子数量排序
                if (b.finishedCount !== a.finishedCount) {
                    return b.finishedCount - a.finishedCount;
                }
                // 如果完成数量相同，按总进度排序
                return b.totalProgress - a.totalProgress;
            });

        return rankings;
    }

    // 处理调试骰子点击
    async handleDebugDiceClick(value) {
        try {
            const gamePhase = gameState.getGamePhase();
            const isRolling = gameState.getIsRolling();

            // 检查是否可以掷骰子
            if (gamePhase !== 'rolling' || isRolling) {
                return;
            }

            // 执行调试掷骰子
            await dice.debugRollDice(value);

            // 更新UI
            uiUpdater.updateUI();
        } catch (error) {
            console.error('处理调试骰子点击时出错:', error);
        }
    }

    // 处理调试移动棋子点击
    handleDebugMoveClick(direction) {
        try {
            const selectedPlayerInput = document.querySelector('input[name="debug-player"]:checked');
            const selectedChessInput = document.querySelector('input[name="debug-chess"]:checked');

            if (!selectedPlayerInput || !selectedChessInput) {
                console.error('找不到玩家或棋子单选项');
                return;
            }

            const selectedPlayer = parseInt(selectedPlayerInput.value);
            const selectedChessIndex = parseInt(selectedChessInput.value);

            console.log(`调试移动: 玩家${selectedPlayer} 棋子${selectedChessIndex + 1} ${direction > 0 ? `前进${direction}格` : `后退${Math.abs(direction)}格`}`);

            // 调用棋子的调试移动方法
            if (this.gameInstance && this.gameInstance.chessPiece) {
                this.gameInstance.chessPiece.debugMoveChessOneStep(selectedPlayer, selectedChessIndex, direction);
            }

            // 更新UI
            uiUpdater.updateUI();
        } catch (error) {
            console.error('处理调试移动点击时出错:', error);
        }
    }

    // 处理调试完成棋子点击
    handleDebugFinishClick() {
        try {
            if (this.gameInstance && this.gameInstance.debugFinishChess) {
                this.gameInstance.debugFinishChess();
            } else if (this.gameInstance && this.gameInstance.chessPiece) {
                this.gameInstance.chessPiece.debugFinishChess();
            }
            uiUpdater.updateUI();
        } catch (error) {
            console.error('处理调试完成点击时出错:', error);
        }
    }

    // 设置指定数值的积分
    async handleSetEnergyClick(amount) {
        try {
            console.log(`[调试] 设置积分按钮被点击: ${amount}`);

            // 检查是否启用道具模式
            const { energyManager } = await import('./energyManager.js');
            if (!energyManager.isSkillModeEnabled()) {
                alert('当前未启用道具模式，无法设置积分');
                return;
            }

            // 获取选择的玩家
            const selectedPlayerInput = document.querySelector('input[name="debug-energy-player"]:checked');
            if (!selectedPlayerInput) {
                console.error('未找到积分调试玩家单选项');
                return;
            }
            const selectedPlayer = parseInt(selectedPlayerInput.value);

            // 设置指定积分
            energyManager.setEnergy(selectedPlayer, amount);

            // 在线模式下同步积分变化
            if (gameState.getIsOnlineMultiplayer() && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                window.gameInstance.multiplayerGameManager.syncEnergyChange(selectedPlayer, amount, amount);
            }

        } catch (error) {
            console.error('处理设置积分调试时出错:', error);
        }
    }

    // 处理棋子点击
    async handleChessClick(player, chessIndex, event) {
        try {
            // 只有在event存在时才调用stopPropagation
            if (event) {
                event.stopPropagation();
            }

            const gamePhase = gameState.getGamePhase();
            const currentPlayer = gameState.getCurrentPlayer();
            const isPaused = gameState.getIsPaused();
            const botPlayers = gameState.getBotPlayers();
            const isAITakeover = gameState.getIsAITakeover();
            const isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();
            const isBotPlayer = gameState.isBotPlayer(currentPlayer);

            // AI托管模式下允许人类玩家点击棋子（简化逻辑）

            // 检查游戏是否暂停
            if (isPaused) {
                return;
            }

            // 检查是否是当前玩家的回合
            if (player !== currentPlayer) {
                return;
            }

            // 检查游戏阶段
            if (gamePhase !== 'selecting') {
                return;
            }

            // 在多人游戏中，检查权限（与骰子点击保持一致）
            if (isOnlineMultiplayer && this.gameInstance && this.gameInstance.multiplayerGameManager) {
                const localPlayerId = this.gameInstance.multiplayerGameManager.getCurrentPlayerId();
                const localPlayerNumber = this.gameInstance.multiplayerGameManager.getPlayerNumberByPlayerId(localPlayerId);
                const isHost = this.gameInstance.multiplayerGameManager.isHost;

                // 检查当前玩家是否被AI托管
                const currentPlayerId = this.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(currentPlayer);
                const currentPlayerData = this.gameInstance.multiplayerGameManager.players.get(currentPlayerId);
                const isCurrentPlayerAITakeover = this.gameInstance.multiplayerGameManager.aiTakeoverPlayers?.has(currentPlayerId) ||
                    currentPlayerData?.isAITakeover || false;

                // 如果是AI电脑玩家，只有房主可以操作
                if (isBotPlayer) {
                    if (!isHost) {
                        return;
                    }
                }
                // 如果当前玩家被AI托管
                else if (isCurrentPlayerAITakeover) {
                    // 判断是否是自己的回合
                    const isLocalPlayerTurn = currentPlayer === localPlayerNumber;

                    if (!isLocalPlayerTurn && !isHost) {
                        // 其他玩家的回合且该玩家被AI托管，只有房主可以代理
                        return;
                    }
                }
                // 如果是真实玩家，必须是本地玩家才能操作
                else if (currentPlayer !== localPlayerNumber) {
                    return;
                }

                if (currentPlayer === localPlayerNumber && isCurrentPlayerAITakeover) {
                    this.gameInstance.multiplayerGameManager.clearLocalAITakeoverForManualAction('manual_chess_click');
                }
            }

            // 如果这是人类玩家的首次操作，标记游戏正式开始
            if (!gameState.getGameOfficiallyStarted() && !gameState.isBotPlayer(player)) {
                gameState.setGameOfficiallyStarted(true);
            }

            // 执行棋子点击逻辑
            if (this.gameInstance && this.gameInstance.chessPiece) {
                await this.gameInstance.chessPiece.onChessClick(player, chessIndex, event);
            }

            // 更新UI
            uiUpdater.updateUI();
        } catch (error) {
            console.error('处理棋子点击时出错:', error);
        }
    }

    // 处理棋子悬停
    handleChessHover(player, chessIndex, event) {
        try {
            const gamePhase = gameState.getGamePhase();
            const currentPlayer = gameState.getCurrentPlayer();

            // 只在选择阶段且是当前玩家的棋子时显示悬停效果
            if (gamePhase === 'selecting' && player === currentPlayer) {
                const chess = gameState.getPlayerChess()[player][chessIndex];
                if (chess.element) {
                    chess.element.classList.add('chess-hover');
                }
            }
        } catch (error) {
            console.error('处理棋子悬停时出错:', error);
        }
    }

    // 处理棋子离开悬停
    handleChessLeave(player, chessIndex, event) {
        try {
            const chess = gameState.getPlayerChess()[player][chessIndex];
            if (chess.element) {
                chess.element.classList.remove('chess-hover');
            }
        } catch (error) {
            console.error('处理棋子离开悬停时出错:', error);
        }
    }

    // 处理键盘按键
    handleKeyDown(event) {
        try {
            switch (event.key) {
                case ' ': // 空格键掷骰子
                    event.preventDefault();
                    this.handleDiceClick();
                    break;
                case 'Enter': // 回车键触发聊天（仅联机模式）
                    // 检查是否在联机模式
                    const isOnlineMultiplayer = this.gameInstance?.gameState?.getIsOnlineMultiplayer();
                    if (!isOnlineMultiplayer) {
                        break; // 非联机模式不处理
                    }

                    const chatInputArea = document.getElementById('chatInputArea');
                    if (chatInputArea && chatInputArea.style.display === 'flex') {
                        break;
                    }

                    // 检查chatBtn是否可见
                    const chatBtn = document.getElementById('chatBtn');
                    if (chatBtn) {
                        const chatBtnStyle = window.getComputedStyle(chatBtn);
                        const isVisible = chatBtnStyle.display !== 'none' && chatBtnStyle.visibility !== 'hidden';

                        if (isVisible) {
                            event.preventDefault();
                            this.handleChatBtnClick();
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('处理键盘按键时出错:', error);
        }
    }

    // 处理显示规则按钮点击
    handleShowRulesClick() {
        try {
            const rulesModal = document.getElementById('rules-modal');
            if (rulesModal) {
                rulesModal.style.display = 'flex';
            }
        } catch (error) {
            console.error('显示游戏规则时出错:', error);
        }
    }

    // 处理返回主页按钮点击
    handleReturnHomeClick() {
        try {
            const multiplayerGameManager = this.gameInstance?.multiplayerGameManager;
            const isSpectator = !!multiplayerGameManager?.isSpectator;
            const isOnlineMode = !!multiplayerGameManager?.isOnlineMode;

            // 观战模式下不需要确认弹窗，直接返回
            if (!isSpectator && !confirm('确定要返回主页吗？当前游戏进度将丢失。')) {
                return;
            }

            if (isOnlineMode) {
                try {
                    multiplayerGameManager.sendMessage('leave_room', {
                        reason: 'return_home'
                    });
                } catch (e) {
                    // ignore
                }
                
                // 仅关闭连接并清理UI，不再调用导致重新渲染或重定向报错的破坏性销毁
                try {
                    if (multiplayerGameManager.wsClient) {
                        multiplayerGameManager.wsClient.disconnect();
                    }
                } catch (e) {
                    // ignore
                }
            }

            window.location.replace('./');
        } catch (error) {
            console.error('返回主页时出错:', error);
        }
    }

    // 处理关闭规则模态框
    handleRulesCloseClick() {
        try {
            const rulesModal = document.getElementById('rules-modal');
            if (rulesModal) {
                rulesModal.style.display = 'none';
            }
        } catch (error) {
            console.error('关闭游戏规则时出错:', error);
        }
    }

    // 处理音效开关按钮点击
    handleToggleAudioClick() {
        try {
            // 动态导入audioManager
            import('./audioManager.js').then(({ audioManager }) => {
                const toggleBtn = document.getElementById('toggleAudio');
                if (!toggleBtn) return;

                if (audioManager.isEnabled) {
                    audioManager.mute();
                    toggleBtn.textContent = '开启音效';
                } else {
                    audioManager.unmute();
                    audioManager.playMoveSound();
                    toggleBtn.textContent = '关闭音效';
                }
            }).catch(error => {
                console.error('导入audioManager时出错:', error);
            });
        } catch (error) {
            console.error('切换音效状态时出错:', error);
        }
    }

    // 处理切换AI托管状态点击
    handleToggleAITakeoverClick() {
        try {
            // 检查游戏是否尚未开始
            const isOfficiallyStarted = gameState && gameState.getGameOfficiallyStarted();
            if (!window.gameInstance || !gameState || (!isOfficiallyStarted && gameState.getGamePhase() === 'waiting')) {
                return;
            }
            // 检查音频是否正在加载
            if (window.audioManager && !window.audioManager.isLoaded) {
                return;
            }
            aiTakeoverManager.toggleTakeover();
        } catch (error) {
            console.error('切换AI托管状态时出错:', error);
        }
    }

    // 处理暂停游戏点击
    handlePauseClick() {
        try {
            // 在线多人模式下，检查是否为房主
            if (window.gameInstance && window.gameInstance.multiplayerGameManager &&
                window.gameInstance.multiplayerGameManager.isOnlineMode) {
                if (!window.gameInstance.multiplayerGameManager.isHost) {
                    console.log('只有房主可以暂停游戏');
                    return;
                }
            }

            // 防抖检查：如果距离上次点击时间太短，忽略本次点击
            const currentTime = Date.now();
            if (currentTime - this.lastPauseClickTime < this.pauseDebounceTime) {
                return;
            }
            this.lastPauseClickTime = currentTime;

            // 防抖：如果已经有待处理的暂停操作，忽略后续点击
            if (this.pendingPause) {
                return;
            }

            // 如果正在掷骰子，不允许暂停
            if (gameState.getIsRolling()) {
                // 设置一个标志，等待掷骰子完成后再暂停
                this.pendingPause = true;
                // 更新按钮状态为等待中
                this.updatePauseButtonForPending();
                return;
            }

            // 如果游戏已经暂停，直接恢复
            if (gameState.getIsPaused()) {
                this.resumeGame();
                return;
            }

            // 请求安全暂停
            const canPauseImmediately = gameState.requestSafePause();

            if (canPauseImmediately) {
                // 可以立即暂停
                this.pauseGame();
            } else {
                // 需要等待棋子移动或AI决策完成
                console.log('棋子正在移动或AI正在决策，等待完成后暂停');
                this.updatePauseButtonForPending();
            }
        } catch (error) {
            console.error('处理暂停点击时出错:', error);
        }
    }

    // 暂停游戏的具体逻辑
    pauseGame() {
        // 重置防抖状态
        this.pendingPause = false;
        gameState.setIsPaused(true);
        this.updatePauseButtonText();
        
        if (uiUpdater && typeof uiUpdater.pauseThinkingProgressBar === 'function') {
            uiUpdater.pauseThinkingProgressBar();
        } else {
            uiUpdater.stopThinkingProgressBar();
        }
        
        gameInfo.addGamePause();

        // 联机模式下，立即停止所有AI操作和计时器
        if (window.gameInstance && window.gameInstance.multiplayerGameManager &&
            window.gameInstance.multiplayerGameManager.isOnlineMode) {

            // 停止botController的操作
            if (window.botController) {
                // 不禁用botController，只是确保当前操作被中断
            }

            // 停止aiTakeoverManager的操作
            if (window.aiTakeoverManager) {
                // 清除可能正在进行的延迟触发
            }

            // 同步暂停状态到其他玩家
            window.gameInstance.multiplayerGameManager.syncGamePause();
        }
    }

    // 恢复游戏的具体逻辑
    resumeGame() {
        // 重置防抖状态
        this.pendingPause = false;

        gameState.setIsPaused(false);
        this.updatePauseButtonText();

        // 在线多人模式下，通过syncGameResume同步，不在本地添加gameInfo
        const isOnlineMode = window.gameInstance && window.gameInstance.multiplayerGameManager &&
            window.gameInstance.multiplayerGameManager.isOnlineMode;

        if (isOnlineMode) {
            // 联机模式：只同步到服务器，不在本地添加（避免重复）
            window.gameInstance.multiplayerGameManager.syncGameResume();
        } else {
            // 单机模式：直接添加游戏恢复消息
            gameInfo.addGameResume(false);
        }

        // 恢复游戏时，检查游戏状态
        const currentPhase = gameState.getGamePhase();

        // 如果是游戏刚开始的waiting状态，不需要切换玩家
        if (currentPhase === 'waiting') {
            // 如果当前玩家是机器人或处于AI托管状态，触发机器人操作
            this.triggerBotOperationIfNeeded();
            return;
        }

        // 如果游戏还没有正式开始（人类玩家还没有进行首次操作），不切换玩家
        if (!gameState.getGameOfficiallyStarted()) {
            console.log('游戏尚未正式开始，恢复后继续等待当前玩家操作');
            // 如果当前玩家是机器人或处于AI托管状态，触发机器人操作
            this.triggerBotOperationIfNeeded();
            return;
        }

        // 恢复游戏时，恢复到暂停前的状态，不切换玩家
        console.log('游戏恢复，继续当前玩家的回合');

        // 重新启动思考计时器和进度条（仅在本地或房主端执行，非房主由 multiplayerGameManager 触发）
        if (currentPhase === 'rolling' || currentPhase === 'selecting' || currentPhase === 'moving') {
            if (uiUpdater && typeof uiUpdater.resumeThinkingProgressBar === 'function') {
                uiUpdater.resumeThinkingProgressBar(() => {
                    console.log(`玩家${gameState.getCurrentPlayer()}思考时间到，自动切换到下一个玩家`);
                    if (this.gameInstance && this.gameInstance.dice) {
                        this.gameInstance.dice.handleThinkingTimeoutWrapper();
                    }
                });
            } else if (uiUpdater && typeof uiUpdater.startThinkingProgressBar === 'function') {
                uiUpdater.startThinkingProgressBar(() => {
                    console.log(`玩家${gameState.getCurrentPlayer()}思考时间到，自动切换到下一个玩家`);
                    if (this.gameInstance && this.gameInstance.dice) {
                        this.gameInstance.dice.handleThinkingTimeoutWrapper();
                    }
                });
            }
        }

        // 如果当前玩家是机器人或处于AI托管状态，重新触发机器人操作
        setTimeout(() => {
            this.triggerBotOperationIfNeeded();
        }, 500);
    }

    // 更新暂停和结算按钮文本
    updatePauseButtonText() {
        const pauseBtn = document.getElementById('pauseGame');
        const settlementBtn = document.getElementById('settlementGame');
        
        const isPaused = gameState.getIsPaused();
        
        if (pauseBtn) {
            pauseBtn.textContent = isPaused ? '继续游戏' : '暂停游戏';
        }
        
        
        // 如果是联机模式，根据状态显示文本（非房主灰显）
        if (gameState.getIsOnlineMultiplayer()) {
            const isHost = window.gameInstance?.multiplayerGameManager?.isHost;
            
            if (pauseBtn) {
                if (!isHost) {
                    pauseBtn.disabled = true;
                } else {
                    pauseBtn.disabled = false;
                }
            }
            
            if (settlementBtn) {
                if (!isHost) {
                    settlementBtn.disabled = true;
                } else {
                    settlementBtn.disabled = false;
                }
            }
            return;
        }
        
        // 单机或本地多人模式
        if (pauseBtn) {
            pauseBtn.disabled = false;
        }
        
        if (settlementBtn) {
            settlementBtn.disabled = false;
        }
    }

    // 更新暂停按钮为等待状态
    updatePauseButtonForPending() {
        const pauseBtn = document.getElementById('pauseGame');
        if (pauseBtn) {
            // 在本地多人模式下隐藏暂停按钮
            if (gameState.getIsLocalMultiplayer()) {
                pauseBtn.style.display = 'none';
                return;
            }

            pauseBtn.textContent = '等待暂停...';
            pauseBtn.disabled = true; // 禁用按钮防止重复点击
        }
    }

    // 移除所有事件监听器（清理用）
    removeEventListeners() {
        // 移除骰子事件
        const diceElement = document.getElementById('dice');
        if (diceElement) {
            diceElement.removeEventListener('click', this.handleDiceClick);
        }

        // 移除棋子事件
        const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4
        for (let player = 1; player <= 4; player++) {
            const chessElements = document.querySelectorAll(`#board-svg use[href="#chess"].player-${player}`);
            for (let i = 0; i < pieceCount; i++) {
                if (chessElements[i]) {
                    chessElements[i].removeEventListener('click', this.handleChessClick);
                    chessElements[i].removeEventListener('mouseenter', this.handleChessHover);
                    chessElements[i].removeEventListener('mouseleave', this.handleChessLeave);
                }
            }
        }

        // 移除键盘事件
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    // 重新绑定棋子事件（在棋子元素更新后调用）
    rebindChessEvents() {
        // 先移除旧的事件监听器
        const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4
        for (let player = 1; player <= 4; player++) {
            const chessElements = document.querySelectorAll(`#board-svg use[href="#chess"].player-${player}`);
            for (let i = 0; i < pieceCount; i++) {
                if (chessElements[i]) {
                    chessElements[i].removeEventListener('click', this.handleChessClick);
                    chessElements[i].removeEventListener('mouseenter', this.handleChessHover);
                    chessElements[i].removeEventListener('mouseleave', this.handleChessLeave);
                }
            }
        }

        // 重新绑定事件
        this.setupChessEvents();
    }

    // handleThinkingTimeoutWrapper 方法已移除
    // 统一使用 dice.handleThinkingTimeoutWrapper()

    /**
     * 检查当前玩家是否为bot，如果是则触发bot操作
     */
    triggerBotOperationIfNeeded() {
        if (botController) {
            const currentPlayer = window.gameState.getCurrentPlayer();
            const isBot = botController.isCurrentPlayerBot();
            
            // 获取托管状态
            const isAITakeover = window.gameState.getIsAITakeover();
            let isCurrentPlayerAITakeover = false;
            
            if (window.gameState.isOnlineMultiplayer && window.multiplayerGameManager) {
                const currentPlayerId = window.multiplayerGameManager.getPlayerIdByPlayerNumber(currentPlayer);
                const currentPlayerData = window.multiplayerGameManager.players?.get(currentPlayerId);
                isCurrentPlayerAITakeover = window.multiplayerGameManager.aiTakeoverPlayers?.has(currentPlayerId) || 
                                          currentPlayerData?.isAITakeover || false;
            }

            if (isBot || isAITakeover || isCurrentPlayerAITakeover) {
                // 联机模式下，非房主不触发AI操作（由房主统一触发并同步）
                if (window.gameState.isOnlineMultiplayer && window.multiplayerGameManager && !window.multiplayerGameManager.isHost) {
                    console.log(`[事件处理] 玩家${currentPlayer}是AI/托管，但当前不是房主，不触发本地操作`);
                    return;
                }
                

                // 解除正在处理锁定（如果卡住了）
                if (botController.isProcessing) {
                    botController.isProcessing = false;
                }

                console.log(`[事件处理] 玩家${currentPlayer}需要AI操作，延迟触发botController`);
                setTimeout(() => {
                    botController.handleBotTurn();
                }, 200); // 延迟200ms执行，让玩家看到状态变化
            }
        }
    }

    /**
     * 处理延迟暂停逻辑，在掷骰子完成后执行暂停
     */
    handlePendingPause() {
        if (this.pendingPause) {
            this.pendingPause = false;
            // 切换暂停状态
            const isPaused = gameState.togglePause();
            this.updatePauseButtonText(); // 这会重新启用按钮并更新文本

            // 暂停时清除思考计时器并显示暂停消息
            if (isPaused) {
                uiUpdater.stopThinkingProgressBar();
                gameInfo.addGamePause();
            }
        }
    }

    /**
     * 检查AI决策是否完成，完成后执行暂停
     */
    checkAIDecisionComplete() {
        if (!this.pendingPause) {
            return; // 如果不再需要暂停，停止检查
        }

        if (!gameState.getAIDecisionInProgress()) {
            // AI决策已完成，执行暂停
            console.log('AI决策完成，执行暂停');
            this.handlePendingPause();
        } else {
            // AI决策仍在进行中，继续检查
            setTimeout(() => {
                this.checkAIDecisionComplete();
            }, 100); // 每100ms检查一次
        }
    }

    // 设置聊天相关事件
    setupChatEvents() {
        const chatBtn = document.getElementById('chatBtn');
        if (chatBtn) {
            chatBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleChatBtnClick();
            });
        }

        const chatSendBtn = document.getElementById('chatSendBtn');
        if (chatSendBtn) {
            chatSendBtn.addEventListener('click', () => this.handleChatSend());
        }

        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // 阻止默认行为
                    e.stopPropagation(); // 阻止事件冒泡
                    this.handleChatSend();
                }
            });
        }

        // Emoji按钮点击事件
        const emojiBtn = document.getElementById('emojiBtn');
        if (emojiBtn) {
            emojiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleEmojiBtnClick();
            });
        }

        // 初始化emoji面板
        this.initEmojiPanel();

        // 点击其他区域隐藏聊天输入框和emoji面板
        document.addEventListener('click', (e) => {
            const chatInputArea = document.getElementById('chatInputArea');
            const chatBtn = document.getElementById('chatBtn');
            const emojiPanel = document.getElementById('emojiPanel');
            const emojiBtn = document.getElementById('emojiBtn');

            if (chatInputArea && chatInputArea.style.display === 'flex') {
                // 如果点击的不是聊天输入区域或聊天按钮，则隐藏聊天输入框
                if (!chatInputArea.contains(e.target) && !chatBtn.contains(e.target)) {
                    this.hideChatInput();
                }
            }

            // 如果点击的不是emoji按钮或emoji面板，则隐藏emoji面板
            if (emojiPanel && emojiPanel.classList.contains('show')) {
                if (!emojiPanel.contains(e.target) && !emojiBtn.contains(e.target)) {
                    this.hideEmojiPanel();
                }
            }
        });
    }

    // 处理聊天按钮点击
    handleChatBtnClick() {
        const chatInputArea = document.getElementById('chatInputArea');
        const diceDisplay = document.getElementById('diceDisplay');
        const pauseIndicator = document.getElementById('pauseIndicator');
        const chatBtn = document.getElementById('chatBtn');

        if (chatInputArea && diceDisplay && chatBtn) {
            // 显示聊天输入框，隐藏骰子、暂停提示和chat-icon
            chatInputArea.style.display = 'flex';
            diceDisplay.style.display = 'none';
            chatBtn.style.display = 'none';
            if (pauseIndicator) {
                pauseIndicator.style.display = 'none';
            }

            // 记录并隐藏所有正在显示的道具图标
            this.hiddenSkillIcons = {};

            const teleportIcon = document.getElementById('teleportIcon');
            const polyhedralDiceDisplay = document.getElementById('polyhedralDiceDisplay');
            const mysteryBoxIcon = document.getElementById('mysteryBoxIcon');
            const energyGainText = document.getElementById('energyGainText');
            const diceSelectionPanel = document.getElementById('diceSelectionPanel');

            // 只记录并隐藏那些当前正在显示的图标
            // 对于传送门图标，只有当前玩家激活的传送门才记录
            const isTeleportMode = this.gameInstance && this.gameInstance.isTeleportMode;
            if (teleportIcon && teleportIcon.style.display !== 'none' && getComputedStyle(teleportIcon).display !== 'none') {
                // 只有在传送门模式下才记录传送门图标（表示是当前玩家激活的）
                if (isTeleportMode) {
                    this.hiddenSkillIcons.teleportIcon = true;
                }
                // 无论是否记录，都要隐藏图标
                teleportIcon.style.display = 'none';
            }
            if (polyhedralDiceDisplay && polyhedralDiceDisplay.style.display !== 'none' && getComputedStyle(polyhedralDiceDisplay).display !== 'none') {
                this.hiddenSkillIcons.polyhedralDiceDisplay = true;
                polyhedralDiceDisplay.style.display = 'none';
            }
            if (mysteryBoxIcon && mysteryBoxIcon.style.display !== 'none' && getComputedStyle(mysteryBoxIcon).display !== 'none') {
                this.hiddenSkillIcons.mysteryBoxIcon = true;
                mysteryBoxIcon.style.display = 'none';
            }
            if (energyGainText && energyGainText.style.display !== 'none' && getComputedStyle(energyGainText).display !== 'none') {
                this.hiddenSkillIcons.energyGainText = true;
                energyGainText.style.display = 'none';
            }
            if (diceSelectionPanel && diceSelectionPanel.style.display !== 'none' && getComputedStyle(diceSelectionPanel).display !== 'none') {
                this.hiddenSkillIcons.diceSelectionPanel = true;
                diceSelectionPanel.style.display = 'none';
            }

            // 自动聚焦到输入框（仅桌面端）
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (!isMobile) {
                const chatInput = document.getElementById('chatInput');
                if (chatInput) {
                    setTimeout(() => chatInput.focus(), 100);
                }
            }
        }
    }

    // 隐藏聊天输入框
    hideChatInput() {
        const chatInputArea = document.getElementById('chatInputArea');
        const diceDisplay = document.getElementById('diceDisplay');
        const pauseIndicator = document.getElementById('pauseIndicator');
        const chatBtn = document.getElementById('chatBtn');

        if (chatInputArea && diceDisplay && chatBtn) {
            chatInputArea.style.display = 'none';
            chatBtn.style.display = 'block';

            // 获取道具图标元素
            const teleportIcon = document.getElementById('teleportIcon');
            const polyhedralDiceDisplay = document.getElementById('polyhedralDiceDisplay');
            const mysteryBoxIcon = document.getElementById('mysteryBoxIcon');
            const energyGainText = document.getElementById('energyGainText');
            const diceSelectionPanel = document.getElementById('diceSelectionPanel');

            // 检查骰子是否处于遥控骰子状态（有红色发光效果）
            const isRemoteDice = diceDisplay.classList.contains('remote-dice');

            // 恢复被隐藏的道具图标，或检查新出现的道具图标
            let hasSkillIcon = false;

            // 检查并恢复传送门图标
            // 只有在当前玩家真正激活了传送门时才恢复显示
            const isTeleportMode = this.gameInstance && this.gameInstance.isTeleportMode;
            const isSelectingPhase = gameState && gameState.getGamePhase() === 'selecting';
            if (teleportIcon && (this.hiddenSkillIcons.teleportIcon || teleportIcon.dataset.shouldShow === 'true')) {
                // 只有在传送门模式且处于selecting阶段时才恢复传送门图标
                if (isTeleportMode && isSelectingPhase) {
                    teleportIcon.style.display = 'flex';
                    delete teleportIcon.dataset.shouldShow;
                    hasSkillIcon = true;
                } else {
                    // 否则清除标记，不恢复显示
                    delete teleportIcon.dataset.shouldShow;
                    // 如果传送门图标不应该显示，确保它被隐藏
                    teleportIcon.style.display = 'none';
                }
            }

            // 检查并恢复多面骰子（使用flex保持居中）
            if (polyhedralDiceDisplay && (this.hiddenSkillIcons.polyhedralDiceDisplay || polyhedralDiceDisplay.dataset.shouldShow === 'true')) {
                polyhedralDiceDisplay.style.display = 'flex';
                delete polyhedralDiceDisplay.dataset.shouldShow;
                hasSkillIcon = true;
            }

            // 检查并恢复盲盒图标
            if (mysteryBoxIcon && (this.hiddenSkillIcons.mysteryBoxIcon || mysteryBoxIcon.dataset.shouldShow === 'true')) {
                mysteryBoxIcon.style.display = 'flex';
                delete mysteryBoxIcon.dataset.shouldShow;
                hasSkillIcon = true;
            }

            // 检查并恢复积分数值
            if (energyGainText && (this.hiddenSkillIcons.energyGainText || energyGainText.dataset.shouldShow === 'true')) {
                energyGainText.style.display = 'flex';
                delete energyGainText.dataset.shouldShow;
                hasSkillIcon = true;
            }

            // 检查并恢复遥控骰子选择面板
            if (diceSelectionPanel && (this.hiddenSkillIcons.diceSelectionPanel || diceSelectionPanel.dataset.shouldShow === 'true')) {
                diceSelectionPanel.style.display = 'block';
                delete diceSelectionPanel.dataset.shouldShow;
                hasSkillIcon = true;
            }

            // 清空记录
            this.hiddenSkillIcons = {};

            // 检查游戏是否暂停，决定显示骰子还是暂停提示
            const isPaused = gameState && gameState.getIsPaused();
            if (isPaused) {
                // 游戏暂停时，显示暂停提示，隐藏骰子
                diceDisplay.style.display = 'none';
                if (pauseIndicator) {
                    pauseIndicator.style.display = 'flex';
                }
            } else if (hasSkillIcon) {
                // 如果恢复了道具图标，不显示骰子，保持道具图标显示
                diceDisplay.style.display = 'none';
                if (pauseIndicator) {
                    pauseIndicator.style.display = 'none';
                }
            } else if (isRemoteDice) {
                // 遥控骰子状态，显示骰子（使用flex保持垂直对齐一致）
                diceDisplay.style.display = 'flex';
                if (pauseIndicator) {
                    pauseIndicator.style.display = 'none';
                }
            } else {
                // 游戏未暂停且没有道具图标时，显示骰子
                diceDisplay.style.display = 'flex';
                if (pauseIndicator) {
                    pauseIndicator.style.display = 'none';
                }
            }

            // 清空输入框
            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.value = '';
            }

            // 隐藏emoji面板
            this.hideEmojiPanel();

            // 强制更新UI以确保骰子状态正确恢复
            if (this.gameInstance && this.gameInstance.uiUpdater) {
                this.gameInstance.uiUpdater.updateUI();
            }
        }
    }

    // 初始化emoji面板
    initEmojiPanel() {
        const fontEmojis = [
            '👋', '🙏', '👊', '😎', '🤗', '🤭',
            '😄', '😜', '😂', '🤣', '😍', '🙂',
            '🖕', '👍', '👎', '🥺', '🤮', '🙁',
            '🐷', '💢', '😭', '😤', '😡', '🤬'
        ];

        const emojiPanelContent = document.getElementById('emojiPanelContent');

        if (!emojiPanelContent) return;

        // 清空现有内容
        emojiPanelContent.innerHTML = '';

        // 遍历所有emoji并创建DOM元素
        fontEmojis.forEach(emoji => {
            const emojiItem = document.createElement('div');
            emojiItem.className = 'emoji-item';
            emojiItem.textContent = emoji;

            // 添加点击事件
            emojiItem.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleEmojiClick(emoji);
            });

            emojiPanelContent.appendChild(emojiItem);
        });
    }

    // 处理emoji按钮点击
    handleEmojiBtnClick() {
        const emojiPanel = document.getElementById('emojiPanel');
        if (emojiPanel) {
            emojiPanel.classList.toggle('show');
        }
    }

    // 处理emoji点击（仅联机模式使用）
    handleEmojiClick(emoji) {
        console.log('发送emoji:', emoji);

        // 获取当前玩家编号
        const currentPlayer = window.gameState ? window.gameState.getCurrentPlayer() : 1;

        // 发送emoji消息到联机服务器
        if (window.multiplayerGameManager && window.multiplayerGameManager.isConnected) {
            window.multiplayerGameManager.sendMessage('chatMessage', {
                message: emoji,
                playerNumber: currentPlayer,
                timestamp: Date.now()
            });
        }

        // 隐藏emoji面板
        this.hideEmojiPanel();
    }

    // 隐藏emoji面板
    hideEmojiPanel() {
        const emojiPanel = document.getElementById('emojiPanel');
        if (emojiPanel) {
            emojiPanel.classList.remove('show');
        }
    }

    // 处理聊天发送
    async handleChatSend() {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            const message = chatInput.value.trim();
            if (message) {
                const sanitizedMessage = await sanitizeUserText(message);
                console.log('发送聊天消息:', sanitizedMessage);

                // 获取当前玩家编号
                const currentPlayer = window.gameState ? window.gameState.getCurrentPlayer() : 1;

                // 发送消息到后端（联机模式）
                if (window.multiplayerGameManager && window.multiplayerGameManager.isConnected) {
                    // 游戏中的联机模式
                    window.multiplayerGameManager.sendMessage('chatMessage', {
                        message: sanitizedMessage,
                        playerNumber: currentPlayer,
                        timestamp: Date.now()
                    });
                } else if (window.multiplayerManager && window.multiplayerManager.wsClient && window.multiplayerManager.wsClient.isConnected) {
                    // 房间中的联机模式
                    window.multiplayerManager.wsClient.send(JSON.stringify({
                        type: 'chatMessage',
                        message: sanitizedMessage,
                        playerNumber: currentPlayer,
                        timestamp: Date.now()
                    }));
                } else {
                    // 单机模式，直接显示消息
                    this.showChatMessage(message, currentPlayer);

                    // 同时添加到游戏信息
                    if (window.gameInfo) {
                        const playerName = window.playerNameManager ?
                            window.playerNameManager.getPlayerName(currentPlayer) :
                            `玩家${currentPlayer}`;
                        window.gameInfo.addChatMessage(currentPlayer, sanitizedMessage, playerName);
                    }
                }

                // 清空输入框
                chatInput.value = '';

                // 发送后隐藏聊天输入框
                this.hideChatInput();
            }
        }
    }

    // 显示聊天消息
    showChatMessage(message, playerNumber = null, playerName = null, isSystemMessage = false) {
        const chatMessageDisplay = document.getElementById('chatMessageDisplay');
        const chatMessageContent = document.getElementById('chatMessageContent');

        if (!chatMessageDisplay || !chatMessageContent) return;

        // 如果有正在显示的消息，立即清除timeout和动画状态
        if (this.chatMessageTimeout) {
            clearTimeout(this.chatMessageTimeout);
            this.chatMessageTimeout = null;
        }

        // 确保移除所有动画相关的类
        chatMessageDisplay.classList.remove('fade-out');

        // 暂时隐藏元素以强制重新渲染，确保动画状态完全重置
        chatMessageDisplay.style.display = 'none';

        // 格式化消息内容
        let formattedMessage;
        if (isSystemMessage) {
            // 系统消息：使用特殊样式，不显示玩家编号
            formattedMessage = `<span class="system-message-text">${message}</span>`;
        } else if (playerNumber) {
            // 优先使用服务器传递的playerName，否则使用本地playerNameManager
            const displayName = playerName ||
                (window.playerNameManager ? window.playerNameManager.getPlayerName(playerNumber) : `玩家${playerNumber}`);

            // 创建带有玩家颜色的格式化消息
            const playerSpan = `<span class="player-text player-${playerNumber}">${displayName}</span>`;
            const colonSpan = `<span class="action-text">: </span>`;
            const messageSpan = `<span class="chat-message-text">${message}</span>`;
            formattedMessage = `${playerSpan}${colonSpan}${messageSpan}`;
        } else {
            // 如果没有指定玩家编号，直接显示消息
            formattedMessage = `<span class="chat-message-text">${message}</span>`;
        }

        // 设置消息内容
        chatMessageContent.innerHTML = formattedMessage;

        // 使用requestAnimationFrame确保DOM更新后再显示，避免动画状态继承
        requestAnimationFrame(() => {
            // 重置宽度为auto让CSS自然处理
            chatMessageContent.style.width = 'auto';

            // 显示消息
            chatMessageDisplay.style.display = 'block';

            // 10秒后开始淡出动画
            this.chatMessageTimeout = setTimeout(() => {
                chatMessageDisplay.classList.add('fade-out');

                // 动画完成后隐藏元素
                setTimeout(() => {
                    chatMessageDisplay.style.display = 'none';
                    chatMessageDisplay.classList.remove('fade-out');
                    this.chatMessageTimeout = null;
                }, 300); // 与CSS动画时间匹配
            }, 10000);
        });
    }

    // 动态调整聊天消息容器宽度以刚好包裹文字
    adjustChatMessageWidth(chatMessageContent) {
        try {
            // 先重置宽度为auto以获取自然宽度
            chatMessageContent.style.width = 'auto';
            
            // 临时显示元素以测量宽度
            const originalDisplay = chatMessageContent.style.display;
            const originalVisibility = chatMessageContent.style.visibility;
            
            chatMessageContent.style.display = 'block';
            chatMessageContent.style.visibility = 'hidden';
            
            // 强制重新计算布局
            chatMessageContent.offsetHeight;
            
            // 获取内容的实际宽度
            const contentWidth = chatMessageContent.scrollWidth;
            
            // 恢复原始显示状态
            chatMessageContent.style.display = originalDisplay;
            chatMessageContent.style.visibility = originalVisibility;
            
            // 设置宽度为内容宽度，但不超出最大宽度限制
            const maxWidth = window.innerWidth * 0.8; // 80%的视口宽度
            const finalWidth = Math.min(contentWidth + 40, maxWidth); // 加40px的padding缓冲
            
            chatMessageContent.style.width = `${finalWidth}px`;
            
            console.log(`聊天消息宽度已调整为: ${finalWidth}px (内容宽度: ${contentWidth}px)`);
        } catch (error) {
            console.warn('调整聊天消息宽度时出错:', error);
            // 如果出错，回退到auto让CSS自然处理
            chatMessageContent.style.width = 'auto';
        }
    }

    // 隐藏聊天消息（用于新消息替换旧消息）
    hideChatMessage() {
        const chatMessageDisplay = document.getElementById('chatMessageDisplay');

        if (this.chatMessageTimeout) {
            clearTimeout(this.chatMessageTimeout);
            this.chatMessageTimeout = null;
        }

        if (chatMessageDisplay) {
            chatMessageDisplay.style.display = 'none';
            chatMessageDisplay.classList.remove('fade-out');
        }
    }

}

// 创建并导出事件处理器实例
export const eventHandler = new EventHandler();
export default EventHandler;
