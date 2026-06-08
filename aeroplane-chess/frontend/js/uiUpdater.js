/**
 * UI更新模块 - 处理界面更新相关功能
 */
// 导入依赖模块
import { gameState } from './gameState.js';
import { progressDisplay } from './progressDisplay.js';

// 骰子符号常量
const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

class UIUpdater {
    constructor() {
        // 初始化UI更新器
    }

    // 更新UI界面
    updateUI() {
        // 如果是观战模式，跳过某些交互相关的UI更新
        const isSpectator = window.gameInstance && window.gameInstance.multiplayerGameManager && window.gameInstance.multiplayerGameManager.isSpectator;

        this.updateDiceDisplay();
        
        if (!isSpectator) {
            this.updateChessGlow();
            this.highlightMovableChess();
            this.updateStartAreaGlow();
        } else {
            // 观战模式下清除这些高亮
            this.clearAllGlows();
        }

        this.updatePlayerAvatarGlow();
        this.updateThinkingProgressBar();

        // 更新进度显示
        this.updateProgressDisplay();
    }

    /**
     * 清除所有高亮和发光效果（主要用于观战模式）
     */
    clearAllGlows() {
        // 清除棋子高亮
        document.querySelectorAll('.chess-movable, .animating').forEach(el => {
            el.classList.remove('chess-movable', 'animating');
        });

        // 清除起点发光
        document.querySelectorAll('.start-area-glow').forEach(el => {
            el.classList.remove('start-area-glow');
        });
    }

    // 更新骰子显示
    updateDiceDisplay(forceDiceValue = null) {
        const diceDisplay = document.getElementById('diceDisplay');
        const pauseIndicator = document.getElementById('pauseIndicator');
        if (!diceDisplay) return;

        // 定义比普通骰子优先级更高、共用中心位置的UI元素ID及其描述
        const highPriorityUIElements = [
            { id: 'loadingIndicator', name: '加载提示' },
            { id: 'chatInputArea', name: '聊天输入框' },
            { id: 'polyhedralDiceDisplay', name: '多面骰子' },
            { id: 'teleportIcon', name: '传送门图标' },
            { id: 'mysteryBoxIcon', name: '盲盒图标' },
            { id: 'diceSelectionPanel', name: '遥控骰子面板' }
        ];

        // 检查是否有高优先级UI正在显示，如果有则隐藏普通骰子并跳过更新
        for (const ui of highPriorityUIElements) {
            const element = document.getElementById(ui.id);
            if (element && window.getComputedStyle(element).display !== 'none') {
                // console.log(`${ui.name}正在显示，跳过原骰子显示更新`);
                diceDisplay.style.display = 'none';
                return;
            }
        }

        // 检查游戏是否处于暂停状态
        if (gameState && gameState.getIsPaused() && pauseIndicator && window.getComputedStyle(pauseIndicator).display !== 'none') {
            // 如果游戏已暂停，确保骰子隐藏，不进行更新
            diceDisplay.style.display = 'none';
            return;
        }

        // 确保骰子在非暂停/非聊天状态下可见
        if (diceDisplay.style.display === 'none') {
            diceDisplay.style.display = 'flex';
        }

        // 如果骰子正在闪烁动画中，且不是强制更新，不要打断动画
        if (diceDisplay.classList.contains('dice-flashing') && forceDiceValue === null) {
            return;
        }

        const { diceValue: stateDiceValue, currentPlayer, gamePhase, isRolling } = gameState;
        const diceValue = forceDiceValue !== null ? forceDiceValue : stateDiceValue;

        // 先检查是否有震动效果和已有的重要样式，再清除样式类
        const hasShakeClass = diceDisplay.classList.contains('dice-shake');
        const hasPenaltyWarningClass = diceDisplay.classList.contains('dice-penalty-warning');

        // 清除所有样式类，但保留基础类
        diceDisplay.className = 'dice-icon';

        // 保留震动效果
        if (hasShakeClass) {
            diceDisplay.classList.add('dice-shake');
        }

        if (hasPenaltyWarningClass) {
            diceDisplay.classList.add('dice-penalty-warning');
        }

        if (diceValue > 0) {
            const newContent = DICE_SYMBOLS[diceValue - 1];
            diceDisplay.textContent = newContent;
            
            // 重要：由于联机模式中玩家视角不同，显示点数时应该发光并应用对应玩家的颜色样式
            // 首先清除可能存在的旧玩家样式
            diceDisplay.className = diceDisplay.className.replace(/player-\d+/g, '');
            // 添加基础类和当前状态类
            diceDisplay.classList.add('dice-icon', 'rolled', `player-${currentPlayer}`);
            diceDisplay.classList.remove('dice-penalty-warning', 'dice-flashing');
            
            // 显示点数时应该发光
            diceDisplay.classList.add('dice-glowing');
        } else {
            // 重置为未投掷状态
            diceDisplay.textContent = '⚀';
            diceDisplay.classList.add('not-rolled');

            // 添加发光效果（当轮到当前玩家且可以掷骰子时）
            // 在未掷出时，只要是rolling阶段就应该发光提示投掷
            if (gamePhase === 'rolling' && !isRolling) {
                diceDisplay.classList.add('dice-glowing');
            } else {
                diceDisplay.classList.remove('dice-glowing');
            }

            if (gamePhase === 'rolling' && !isRolling && gameState.getCanReroll() && gameState.getConsecutiveSixes() === 2) {
                diceDisplay.classList.add('dice-penalty-warning');
            } else {
                diceDisplay.classList.remove('dice-penalty-warning');
            }
        }

        // 更新骰子禁用状态
        this.updateDiceDisabledState();
    }

    // 更新骰子禁用状态
    updateDiceDisabledState() {
        const diceDisplay = document.getElementById('diceDisplay');
        if (diceDisplay) {
            const gamePhase = gameState.getGamePhase();
            const isRolling = gameState.getIsRolling();
            const currentPlayer = gameState.getCurrentPlayer();
            const isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();

            // 导入botController来检查当前玩家是否为bot
            import('./botController.js').then(({ botController }) => {
                const isBot = botController.isCurrentPlayerBot();

                // 在多人游戏中，检查当前玩家是否是本地玩家或房主代替AI托管玩家操作
                let isCurrentPlayerLocal = true;
                let isHostControllingAITakeover = false;
                if (isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                    const localPlayerId = window.gameInstance.multiplayerGameManager.getCurrentPlayerId();
                    const localPlayerNumber = window.gameInstance.multiplayerGameManager.getPlayerNumberByPlayerId(localPlayerId);
                    isCurrentPlayerLocal = (currentPlayer === localPlayerNumber);

                    // 检查当前玩家是否被AI托管且当前客户端是房主
                    const currentPlayerId = window.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(currentPlayer);
                    const currentPlayerData = window.gameInstance.multiplayerGameManager.players.get(currentPlayerId);
                    const isCurrentPlayerAITakeover = window.gameInstance.multiplayerGameManager.aiTakeoverPlayers?.has(currentPlayerId) ||
                        currentPlayerData?.isAITakeover || false;
                    const isHost = window.gameInstance.multiplayerGameManager.isHost;
                    isHostControllingAITakeover = isCurrentPlayerAITakeover && isHost && !isCurrentPlayerLocal;
                }

                // 只有轮到当前玩家且不是bot且游戏阶段为rolling且不在掷骰中且（是本地玩家或房主代替AI托管玩家操作）时，骰子才可用
                const canControl = isCurrentPlayerLocal || isHostControllingAITakeover;
                const shouldDisable = gamePhase !== 'rolling' || isRolling || isBot || !canControl;

                // 不再进行状态恢复逻辑，避免覆盖正确的骰子显示

                if (shouldDisable) {
                    diceDisplay.classList.add('disabled');
                } else {
                    diceDisplay.classList.remove('disabled');
                }

                // 强制触发UI更新事件，确保其他组件也能响应权限变化
                const event = new CustomEvent('dicePermissionChanged', {
                    detail: { canRoll: !shouldDisable, currentPlayer, isCurrentPlayerLocal, isHostControllingAITakeover }
                });
                document.dispatchEvent(event);
            });
        }
    }

    // 更新棋子发光效果
    updateChessGlow() {
        // 移除所有棋子的选中效果
        document.querySelectorAll('.chess-selected').forEach(element => {
            element.classList.remove('chess-selected');
        });

        const selectedChess = gameState.getSelectedChess();
        if (selectedChess) {
            const { player, chessIndex } = selectedChess;
            const playerChess = gameState.getPlayerChess();
            const chess = playerChess[player][chessIndex];
            if (chess && chess.element) {
                chess.element.classList.add('chess-selected');
            }
        }
    }

    // 更新玩家头像发光效果
    updatePlayerAvatarGlow() {
        // 移除所有玩家头像的发光效果
        const allAvatars = document.querySelectorAll('.player-avatar');
        allAvatars.forEach(avatar => {
            avatar.classList.remove('player-avatar-active');
        });

        // 为当前玩家的头像添加发光效果
        // 只有在游戏进行中且不是游戏结束状态才显示发光效果
        const currentPlayer = gameState.getCurrentPlayer();
        const winner = gameState.getWinner();
        const gamePhase = gameState.getGamePhase();

        if (!winner && (gamePhase === 'rolling' || gamePhase === 'selecting' || gamePhase === 'waiting')) {
            const currentPlayerAvatars = document.querySelectorAll(`.player-${currentPlayer}-avatar`);
            currentPlayerAvatars.forEach(avatar => {
                avatar.classList.add('player-avatar-active');
            });
        }
    }

    // 更新起始区域发光效果
    updateStartAreaGlow() {
        // 移除所有起始区域的发光效果
        for (let i = 1; i <= 4; i++) {
            const startArea = document.getElementById(`player${i}-start`);
            if (startArea) {
                startArea.classList.remove('start-area-active');
            }
        }

        // 如果当前玩家可以出棋，为其起始区域添加发光效果
        const gamePhase = gameState.getGamePhase();
        const currentPlayer = gameState.getCurrentPlayer();
        const diceValue = gameState.getDiceValue();

        if (gamePhase === 'selecting' && diceValue === 6) {
            const startArea = document.getElementById(`player${currentPlayer}-start`);
            if (startArea) {
                startArea.classList.add('start-area-active');
            }
        }
    }



    // 显示游戏结束信息
    showGameEndMessage(winner) {
        const message = `恭喜玩家 ${winner} 获胜！`;
        alert(message);
    }


    // 更新游戏状态显示
    updateGameStatusDisplay() {
        const statusElement = document.getElementById('game-status');
        if (statusElement) {
            const currentPlayer = gameState.getCurrentPlayer();
            const gamePhase = gameState.getGamePhase();
            const diceValue = gameState.getDiceValue();

            let statusText = `当前玩家: ${currentPlayer}`;

            switch (gamePhase) {
                case 'rolling':
                    statusText += ' - 请掷骰子';
                    break;
                case 'selecting':
                    statusText += ` - 骰子点数: ${diceValue}, 请选择棋子`;
                    break;
                case 'moving':
                    statusText += ' - 棋子移动中...';
                    break;
                case 'finished':
                    const winner = gameState.getWinner();
                    statusText = `游戏结束 - 玩家 ${winner} 获胜！`;
                    break;
                default:
                    statusText += ' - 等待操作';
            }

            statusElement.textContent = statusText;
        }
    }

    // 更新骰子按钮状态
    updateDiceButtonState() {
        const diceButton = document.getElementById('dice-button');
        if (diceButton) {
            const gamePhase = gameState.getGamePhase();
            const isRolling = gameState.getIsRolling();

            diceButton.disabled = gamePhase !== 'rolling' || isRolling;
            diceButton.textContent = isRolling ? '掷骰中...' : '掷骰子';
        }
    }

    // 更新重置按钮状态
    updateResetButtonState() {
        const resetButton = document.getElementById('reset-button');
        if (resetButton) {
            const gamePhase = gameState.getGamePhase();
            resetButton.disabled = gamePhase === 'moving';
        }
    }

    // 高亮可移动的棋子
    highlightMovableChess() {
        const currentPlayer = gameState.getCurrentPlayer();
        const diceValue = gameState.getDiceValue();
        const playerChess = gameState.getPlayerChess();
        const gamePhase = gameState.getGamePhase();

        // 获取当前选中的棋子元素（如果有）
        const selectedChess = gameState.getSelectedChess();
        const selectedElement = selectedChess ? playerChess[selectedChess.player][selectedChess.chessIndex].element : null;

        // 移除所有高亮，但保留当前正在移动的棋子的高亮
        document.querySelectorAll('.chess-movable').forEach(element => {
            if (element !== selectedElement) {
                element.classList.remove('chess-movable');
            }
        });

        // 只有在选择棋子阶段（selecting）才显示高亮提示
        if (gamePhase !== 'selecting') {
            return;
        }

        // 为可移动的棋子添加高亮
        playerChess[currentPlayer].forEach((chess, index) => {
            if (this.canChessMove(currentPlayer, index, diceValue)) {
                if (chess.element) {
                    chess.element.classList.add('chess-movable');
                }
            }
        });
    }

    // 检查棋子是否可以移动
    canChessMove(player, chessIndex, diceValue) {
        const playerChess = gameState.getPlayerChess();
        const chess = playerChess[player][chessIndex];

        // 如果棋子已完成，不能移动
        if (chess.finished) {
            return false;
        }

        // 如果棋子在起始区域（position === -1），只有偶数才能出发
        if (chess.position === -1) {
            return diceValue % 2 === 0;
        }

        // 棋子在轨道上，检查是否可以移动
        // 如果棋子在终点通道（位置51-56），支持反弹机制，任何点数都可以移动
        if (chess.position >= 51 && chess.position < 56) {
            return true;
        }

        // 如果棋子在普通轨道（0-50），可以移动并支持反弹
        // 注意：不再限制点数+位置不能超过56，因为可以反弹
        if (chess.position >= 0 && chess.position <= 50) {
            return true;
        }

        return false;
    }

    // 更新思考时间进度条
    updateThinkingProgressBar() {
        const progressContainer = document.getElementById('thinkingProgressContainer');
        const progressBar = document.getElementById('thinkingProgressBar');

        if (!progressContainer || !progressBar) {
            return;
        }

        // 如果游戏暂停，不要重新显示进度条
        if (gameState.getIsPaused()) {
            return;
        }

        const currentPlayer = gameState.getCurrentPlayer();

        // 显示进度条并设置玩家颜色
        progressContainer.className = `thinking-progress-container active player-${currentPlayer}`;

        // 更新进度条宽度
        const progress = gameState.getThinkingProgress();
        // 进度条显示已用时间，从0%到100%
        const usedProgress = Math.min(100, progress * 100);
        progressBar.style.width = `${usedProgress}%`;

    }

    // 启动思考时间进度条动画
    startThinkingProgressBar(onTimeout) {
        // 只有在联机模式下才启动思考时间倒计时（用于处理玩家掉线或长时间不操作）
        // 单机模式（包括人机对战和本地多人）都不需要自动超时的倒计时
        if (!gameState.getIsOnlineMultiplayer()) {
            return;
        }

        const progressContainer = document.getElementById('thinkingProgressContainer');
        const progressBar = document.getElementById('thinkingProgressBar');

        if (!progressContainer || !progressBar) {
            return;
        }

        const currentPlayer = gameState.getCurrentPlayer();

        // 显示进度条并设置玩家颜色
        progressContainer.className = `thinking-progress-container active player-${currentPlayer}`;
        // 在单机模式下，进度条从0%开始，与联机模式保持一致
        progressBar.style.width = '0%';

        // 如果是在线多人模式，同步进度条状态
        if (gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            // 检查是否应该跳过进度条启动（防止死循环）
            if (!gameState._skipProgressBarStart) {
                // 只有当前玩家是本地玩家时才同步进度条启动
                const localPlayerNumber = window.gameInstance.multiplayerGameManager.getPlayerNumberByPlayerId(window.gameInstance.multiplayerGameManager.playerId);
                if (currentPlayer === localPlayerNumber) {
                    window.gameInstance.multiplayerGameManager.syncProgressBarStart(currentPlayer);
                }
            }
        }

        // 启动游戏状态中的计时器
        gameState.startThinkingTimer(onTimeout);

        // 启动进度条更新循环
        this.updateProgressBarLoop();
    }

    // 恢复思考时间进度条动画
    resumeThinkingProgressBar(onTimeout) {
        // 只有在联机模式下才启动思考时间倒计时
        if (!gameState.getIsOnlineMultiplayer()) {
            return;
        }

        const progressContainer = document.getElementById('thinkingProgressContainer');
        const progressBar = document.getElementById('thinkingProgressBar');

        if (!progressContainer || !progressBar) {
            return;
        }

        const currentPlayer = gameState.getCurrentPlayer();

        // 确保进度条容器显示并设置正确的玩家颜色
        progressContainer.className = `thinking-progress-container active player-${currentPlayer}`;

        // 恢复游戏状态中的计时器
        gameState.resumeThinkingTimer(onTimeout);

        // 启动进度条更新循环
        this.updateProgressBarLoop();
    }

    // 暂停思考时间进度条
    pauseThinkingProgressBar() {
        // 暂停游戏状态中的计时器，不要完全清除
        gameState.pauseThinkingTimer();

        // 停止进度条更新循环
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
            this.progressUpdateInterval = null;
        }
    }

    // 停止思考时间进度条
    stopThinkingProgressBar() {
        // 完全清除游戏状态中的计时器
        gameState.clearThinkingTimer();

        // 停止进度条更新循环
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
            this.progressUpdateInterval = null;
        }
        
        const progressContainer = document.getElementById('thinkingProgressContainer');
        if (progressContainer) {
            progressContainer.classList.remove('active');
        }
    }

    // 进度条更新循环
    updateProgressBarLoop() {
        // 清除之前的循环
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
        }

        // 每100ms更新一次进度条
        this.progressUpdateInterval = setInterval(() => {
            // 如果游戏暂停，或者正在加载中，停止进度条更新
            const isLoading = window.audioManager && !window.audioManager.allPlayersAudioLoaded;
            if (gameState.getIsPaused() || isLoading) {
                return;
            }

            if (!gameState.isThinkingTimerActive()) {
                this.stopThinkingProgressBar();
                return;
            }
            const progressBar = document.getElementById('thinkingProgressBar');
            if (progressBar) {
                const progress = gameState.getThinkingProgress();
                // 进度条显示已用时间，从0%到100%
                const usedProgress = Math.min(100, progress * 100);
                progressBar.style.width = `${usedProgress}%`;
            }
        }, 100);
    }

    // 更新进度显示
    updateProgressDisplay() {
        try {
            progressDisplay.updateAllProgress(gameState);
        } catch (error) {
            console.error('更新进度显示失败:', error);
        }
    }

    // 旋转棋盘和UI (初始化时调用)
    rotateBoard(rotations = 1) {
        window.boardRotationTotal = 90 * rotations;
        window.boardRotation = window.boardRotationTotal % 360;
        const boardSvg = document.getElementById('board-svg');
        if (boardSvg) {
            boardSvg.style.transition = 'none';
            boardSvg.style.transform = `rotate(${window.boardRotationTotal}deg)`;
            boardSvg.offsetHeight;
        }
        this.updateDesktopPlayerPositions(window.boardRotation);
        this.updateMobilePlayerPositions(window.boardRotation);
        
        // 旋转棋盘后，更新所有棋子的旋转角度和阴影方向，使其保持正向
        if (window.gameInstance && window.gameInstance.animation) {
            const pieceCount = gameState.pieceCount || 4;
            for (let player = 1; player <= 4; player++) {
                for (let i = 0; i < pieceCount; i++) {
                    const chess = gameState.playerChess[player][i];
                    if (chess) {
                        // 无论是否完成，都调用 updateChessPosition 来重新计算 transform 和 shadow
                        // updateChessPosition 内部会根据 chess.finished 决定调用哪个方法
                        window.gameInstance.animation.updateChessPosition(player, i, null, false);
                    }
                }
            }
        }
    }
    updateDesktopPlayerPositions(rotation) {
        const playersInfo = document.querySelector('.players-info');
        if (!playersInfo) return;

        const players = {
            1: playersInfo.querySelector('.player-1-info'),
            2: playersInfo.querySelector('.player-2-info'),
            3: playersInfo.querySelector('.player-3-info'),
            4: playersInfo.querySelector('.player-4-info')
        };

        if (!players[1] || !players[2] || !players[3] || !players[4]) return;

        let layout;
        switch (rotation) {
            case 0:
                layout = { tr: 1, br: 2, bl: 3, tl: 4 };
                break;
            case 90:
                layout = { tr: 4, br: 1, bl: 2, tl: 3 };
                break;
            case 180:
                layout = { tr: 3, br: 4, bl: 1, tl: 2 };
                break;
            case 270:
                layout = { tr: 2, br: 3, bl: 4, tl: 1 };
                break;
            default:
                layout = { tr: 1, br: 2, bl: 3, tl: 4 };
                break;
        }

        const applyPositionAndFormat = (playerNum, position) => {
            const el = players[playerNum];
            
            // 清除可能残留的内联样式，让 CSS 完全接管
            el.style.top = '';
            el.style.bottom = '';
            el.style.left = '';
            el.style.right = '';

            // 移除旧的位置 class
            el.classList.remove('pos-tr', 'pos-br', 'pos-bl', 'pos-tl');
            
            // 添加新的位置 class，由 CSS 的 order 属性自动处理内部排版
            el.classList.add(`pos-${position}`);
        };

        applyPositionAndFormat(layout.tr, 'tr');
        applyPositionAndFormat(layout.br, 'br');
        applyPositionAndFormat(layout.bl, 'bl');
        applyPositionAndFormat(layout.tl, 'tl');
    }

    // 更新移动端玩家信息位置
    updateMobilePlayerPositions(rotation) {
        const topContainer = document.querySelector('.players-top');
        const bottomContainer = document.querySelector('.players-bottom');
        if (!topContainer || !bottomContainer) return;

        const players = {
            1: document.querySelector('.players-top .player-1-info') || document.querySelector('.players-bottom .player-1-info'),
            2: document.querySelector('.players-top .player-2-info') || document.querySelector('.players-bottom .player-2-info'),
            3: document.querySelector('.players-top .player-3-info') || document.querySelector('.players-bottom .player-3-info'),
            4: document.querySelector('.players-top .player-4-info') || document.querySelector('.players-bottom .player-4-info')
        };

        if (!players[1] || !players[2] || !players[3] || !players[4]) return;

        let layout;
        switch (rotation) {
            case 0:
                layout = { top: [4, 1], bottom: [3, 2] };
                break;
            case 90:
                layout = { top: [3, 4], bottom: [2, 1] };
                break;
            case 180:
                layout = { top: [2, 3], bottom: [1, 4] };
                break;
            case 270:
                layout = { top: [1, 2], bottom: [4, 3] };
                break;
            default:
                layout = { top: [4, 1], bottom: [3, 2] };
                break;
        }

        // 辅助函数：只添加对应的类，不修改内部 DOM，依靠 CSS flex order 排序
        const formatPlayerInfo = (playerEl, side) => {
            playerEl.classList.remove('mobile-left', 'mobile-right');
            playerEl.classList.add(`mobile-${side}`);
        };

        formatPlayerInfo(players[layout.top[0]], 'left');
        topContainer.appendChild(players[layout.top[0]]);

        formatPlayerInfo(players[layout.top[1]], 'right');
        topContainer.appendChild(players[layout.top[1]]);

        formatPlayerInfo(players[layout.bottom[0]], 'left');
        bottomContainer.appendChild(players[layout.bottom[0]]);

        formatPlayerInfo(players[layout.bottom[1]], 'right');
        bottomContainer.appendChild(players[layout.bottom[1]]);
    }
}

// 创建并导出UI更新器实例
export const uiUpdater = new UIUpdater();

// 同时保持默认导出以兼容其他用法
export default UIUpdater;