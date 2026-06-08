/**
 * 骰子模块 - 处理掷骰子相关功能
 * 依赖：gameState.js, utils.js, animation.js, uiUpdater.js
 */
// 导入依赖模块
import { gameState } from './gameState.js';
import { utils } from './utils.js';
import { gameInfo } from './gameInfo.js';
import { botController } from './botController.js';
import { audioManager } from './audioManager.js';

// 骰子符号常量
const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

class Dice {
    constructor(gameState, utils, animation, uiUpdater) {
        this.gameState = gameState;
        this.utils = utils;
        this.animation = animation;
        this.uiUpdater = uiUpdater;
        this.eventHandler = null; // 将在main.js中设置
        this.presetDiceValue = null; // 遥控骰子道具设置的预设值
    }

    /**
     * 设置eventHandler引用
     */
    setEventHandler(eventHandler) {
        this.eventHandler = eventHandler;
    }

    /**
     * 设置预设骰子值（用于遥控骰子道具）
     * @param {number} value - 骰子点数 (1-6)
     */
    setPresetDiceValue(value) {
        if (value >= 1 && value <= 6) {
            this.presetDiceValue = value;
            console.log(`[遥控骰子] 设置预设值: ${value}`);
        }
    }

    /**
     * 掷骰子方法
     */
    async rollDice() {
        // 防抖检查：如果正在掷骰子或游戏状态不允许，直接返回
        if (this.gameState.isRolling || (this.gameState.gamePhase !== 'rolling' && this.gameState.gamePhase !== 'waiting') || this.gameState.winner) return;

        // 用户开始操作，停止思考时间计时器
        this.uiUpdater.stopThinkingProgressBar();

        // 如果已经连续掷出2次6，这一次有可能触发第三次6的惩罚，
        // 在整个掷骰动画期间使用纯红色样式进行高亮提示（不再红白闪烁）。
        const diceDisplay = document.getElementById('diceDisplay');
        const isThirdSixRisk = !this.gameState.isRemoteDice && this.gameState.consecutiveSixes >= 2;
        if (diceDisplay && isThirdSixRisk) {
            // 先移除预备阶段用的红白闪烁警告样式
            diceDisplay.classList.remove('dice-penalty-warning');
            // 使用专门的第三次惩罚样式，使投掷动画期间始终为红色
            diceDisplay.classList.add('dice-third-penalty');
        }

        // 设置防抖标志
        this.gameState.isRolling = true;

        // 如果是游戏开始前的第一次掷骰子，切换到rolling状态
        if (this.gameState.gamePhase === 'waiting') {
            this.gameState.gamePhase = 'rolling';
        }

        // 如果是在线多人模式，先发送动画开始消息，让所有玩家同时开始动画
        if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            // 发送动画开始消息，传递当前玩家编号（1-4）
            window.gameInstance.multiplayerGameManager.syncDiceAnimationStart(this.gameState.currentPlayer);

            // 等待动画完成后生成并发送骰子结果
            setTimeout(async () => {
                const isRemoteDice = this.presetDiceValue !== null;
                if (this.presetDiceValue !== null) {
                    this.gameState.diceValue = this.presetDiceValue;
                    console.log(`玩家${this.gameState.currentPlayer}使用遥控骰子，掷出了${this.gameState.diceValue}点`);
                    this.presetDiceValue = null; // 使用后清除预设值
                } else {
                    this.gameState.diceValue = Math.floor(Math.random() * 6) + 1;
                    console.log(`玩家${this.gameState.currentPlayer}掷出了${this.gameState.diceValue}点`);
                    // 统计普通骰子投掷（不统计遥控骰子）
                    if (this.gameState.diceStatistics && this.gameState.diceStatistics[this.gameState.currentPlayer]) {
                        this.gameState.diceStatistics[this.gameState.currentPlayer][this.gameState.diceValue]++;
                        // 同步骰子统计到服务器（用于重连恢复）
                        const currentCount = this.gameState.diceStatistics[this.gameState.currentPlayer][this.gameState.diceValue];
                        window.gameInstance.multiplayerGameManager.syncDiceStatistics(
                            this.gameState.currentPlayer,
                            this.gameState.diceValue,
                            currentCount
                        );
                    }
                }

                // 立即添加到游戏信息（在同步之前），确保本地显示顺序正确
                gameInfo.addDiceRoll(this.gameState.currentPlayer, this.gameState.diceValue, true);

                // 发送骰子结果给所有玩家（传递isRemoteDice标志）
                window.gameInstance.multiplayerGameManager.syncDiceRoll(this.gameState.diceValue, this.gameState.currentPlayer, isRemoteDice);

                // 在联机模式下，本地玩家也需要处理骰子结果
                await this.handleDiceResult();
            }, 500); // 与动画时长保持一致
        } else {
            // 单机模式：播放音效并执行本地动画和逻辑
            audioManager.playRollingSound();

            const diceDisplay = document.getElementById('diceDisplay');

            // 添加闪烁动画类
            diceDisplay.classList.add('dice-flashing');

            // 闪烁过程中随机显示不同点数
            const flashInterval = setInterval(() => {
                const randomIndex = Math.floor(Math.random() * 6);
                diceDisplay.textContent = DICE_SYMBOLS[randomIndex];
            }, 100);

            // 闪烁后停止并显示最终结果
            await new Promise(resolve => setTimeout(resolve, 500));
            clearInterval(flashInterval);
            diceDisplay.classList.remove('dice-flashing');

            // 生成最终点数
            // 检查是否使用遥控骰子道具的预设值
            if (this.presetDiceValue !== null) {
                this.gameState.diceValue = this.presetDiceValue;
                console.log(`玩家${this.gameState.currentPlayer}使用遥控骰子，掷出了${this.gameState.diceValue}点`);
                this.presetDiceValue = null; // 使用后清除预设值
            } else {
                this.gameState.diceValue = Math.floor(Math.random() * 6) + 1;
                console.log(`玩家${this.gameState.currentPlayer}掷出了${this.gameState.diceValue}点`);
                // 统计普通骰子投掷（不统计遥控骰子）
                if (this.gameState.diceStatistics && this.gameState.diceStatistics[this.gameState.currentPlayer]) {
                    this.gameState.diceStatistics[this.gameState.currentPlayer][this.gameState.diceValue]++;
                }
            }

            diceDisplay.textContent = DICE_SYMBOLS[this.gameState.diceValue - 1];

            // 只在单机模式下直接添加到游戏信息面板
            gameInfo.addDiceRoll(this.gameState.currentPlayer, this.gameState.diceValue);

            // 处理掷骰子结果
            await this.handleDiceResult();
        }
    }

    /**
     * 调试掷骰子方法 - 指定点数
     */
    async debugRollDice(value) {
        // 防抖检查：如果正在掷骰子或游戏状态不允许，直接返回
        if (this.gameState.isRolling || (this.gameState.gamePhase !== 'rolling' && this.gameState.gamePhase !== 'waiting') || this.gameState.winner) return;

        // 设置防抖标志
        this.gameState.isRolling = true;

        // 如果是游戏开始前的第一次掷骰子，切换到rolling状态
        if (this.gameState.gamePhase === 'waiting') {
            this.gameState.gamePhase = 'rolling';
        }

        // 直接设置指定的点数，不进行动画
        const diceDisplay = document.getElementById('diceDisplay');

        this.gameState.diceValue = value;
        diceDisplay.textContent = DICE_SYMBOLS[value - 1];
        console.log(`[调试] 玩家${this.gameState.currentPlayer}掷出了${this.gameState.diceValue}点`);

        // 如果是在线多人模式，立即添加到游戏信息并同步骰子结果
        if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            // 立即添加到游戏信息（在同步之前），确保本地显示顺序正确
            gameInfo.addDiceRoll(this.gameState.currentPlayer, this.gameState.diceValue, true);
            window.gameInstance.multiplayerGameManager.syncDiceRoll(this.gameState.diceValue, this.gameState.currentPlayer);
        } else {
            // 单机模式下直接添加到游戏信息面板
            gameInfo.addDiceRoll(this.gameState.currentPlayer, this.gameState.diceValue);
        }

        // 处理掷骰子结果
        await this.handleDiceResult();
    }

    /**
     * 处理掷骰子结果
     */
    async handleDiceResult() {
        // 每次处理结果前，清理第三次惩罚样式，避免影响后续回合的颜色
        try {
            const diceDisplay = document.getElementById('diceDisplay');
            if (diceDisplay) {
                diceDisplay.classList.remove('dice-third-penalty');
            }
        } catch (e) {
            // ignore
        }

        // 检查是否是遥控骰子
        const isRemoteDice = this.gameState.isRemoteDice === true;

        // 处理特殊规则：骰到6的情况
        if (this.gameState.diceValue === 6) {
            // 遥控骰子的6点不触发连投奖励
            if (isRemoteDice) {
                this.gameState.canReroll = false;
                this.gameState.justRolledSix = false;
                // 重置连续6的计数（遥控骰子不计入连续6）
                this.gameState.consecutiveSixes = 0;
            } else {
                // 正常投骰的6点

                const isOnlineMode = window.multiplayerGameManager && window.multiplayerGameManager.isOnlineMode;

                if (!isOnlineMode) {
                    // 单机模式：前端自己管理计数
                    this.gameState.consecutiveSixes++;
                }
                console.log(`玩家${this.gameState.currentPlayer}连续骰到${this.gameState.consecutiveSixes}次6`);

                // 检查是否连续骰到3次6
                if (this.gameState.consecutiveSixes >= 3) {
                    console.log(`[警告] 玩家${this.gameState.currentPlayer}连续骰到${this.gameState.consecutiveSixes}次6，触发惩罚！`);

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

                    // 在联机模式下，不要在本地添加消息，等待服务器广播threeSixesPenalty消息
                    // 在单机模式下，本地添加消息
                    if (!isOnlineMode) {
                        gameInfo.addThreeSixesPenalty(this.gameState.currentPlayer);
                    }

                    // 惩罚：所有棋子返回起点
                    await this.handleThreeSixesPenalty();

                    // 清除遥控骰子标记
                    this.gameState.isRemoteDice = false;
                    return;
                } else {
                    // 骰到6但未达到3次，可以重新投骰
                    this.gameState.canReroll = true;
                    // 标记这次掷出了6，用于后续显示连投奖励
                    this.gameState.justRolledSix = true;
                }
            }
        } else {
            // 没有骰到6，重置连续6的计数
            this.gameState.consecutiveSixes = 0;
            this.gameState.canReroll = false;
            this.gameState.justRolledSix = false;
        }

        // 记录骰子投掷（用于称号统计）
        this.gameState.recordDiceRollForTitle(this.gameState.currentPlayer, this.gameState.diceValue, isRemoteDice);

        // 检查是否可以出发（偶数）或移动棋子
        const canLaunch = this.gameState.diceValue % 2 === 0;

        // 检查是否有棋子可以移动
        const hasMovableChess = this.gameState.playerChess[this.gameState.currentPlayer].some(chess => {
            if (chess.finished) return false;
            if (chess.position === -1) return canLaunch;

            // 如果棋子在轨道上（位置0-50），需要检查能否进入终点通道
            if (chess.position >= 0 && chess.position <= 50) {
                // 可以移动：要么不会超过终点通道入口，要么会进入终点通道并支持反弹
                return true;
            }

            // 如果棋子在终点通道（位置51-56），支持反弹机制
            if (chess.position >= 51 && chess.position < 56) {
                // 在终点通道内，任何点数都可以移动（要么到终点，要么反弹）
                return true;
            }

            return false;
        });

        if (hasMovableChess) {
            // 记录起飞尝试结果（用于称号统计）：成功
            this.gameState.recordTakeoffAttempt(this.gameState.currentPlayer, true);

            this.gameState.gamePhase = 'selecting';
            // 启动思考时间计时器：超时时统一走 handleThinkingTimeoutWrapper（内部会开启AI托管）
            this.uiUpdater.startThinkingProgressBar(() => {
                console.log(`玩家${this.gameState.currentPlayer}思考时间到，开启AI托管`);
                this.handleThinkingTimeoutWrapper();
            });

            // 检查当前玩家是否为bot，如果是则触发bot选择棋子
            this.triggerBotOperationIfNeeded();
        } else {
            // 无法移动，显示点数并停顿2秒后
            console.log(`玩家${this.gameState.currentPlayer}无法移动任何棋子`);

            // 记录起飞尝试结果（用于称号统计）：失败
            this.gameState.recordTakeoffAttempt(this.gameState.currentPlayer, false);

            // 添加骰子震动效果表示无效点数
            const diceDisplay = document.getElementById('diceDisplay');
            audioManager.playShakeSound();
            if (diceDisplay) {
                diceDisplay.classList.add('dice-shake');
                // 无可用棋子时，确保保留发光并移除闪烁效果
                diceDisplay.classList.add('dice-glowing');
                diceDisplay.classList.remove('dice-flashing');
                // 0.5秒后移除震动效果
                setTimeout(() => {
                    diceDisplay.classList.remove('dice-shake');
                }, 500);
            }

            // 在联机模式下，同步无法移动的状态给其他客户端
            if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                // 检查是否是AI托管玩家（非房主）
                const multiplayerManager = window.gameInstance.multiplayerGameManager;
                const currentPlayerId = multiplayerManager.getPlayerIdByPlayerNumber(this.gameState.currentPlayer);
                const isAITakeoverPlayer = multiplayerManager.aiTakeoverPlayers.has(currentPlayerId);
                const isHost = multiplayerManager.isHost;
                const isLocalPlayer = currentPlayerId === multiplayerManager.playerId;

                // 如果是AI托管玩家且不是房主，既不添加本地消息也不发送网络同步
                if (isAITakeoverPlayer && !isHost) {
                    console.log('AI托管玩家（非房主）跳过无法移动消息的处理，等待房主代理');
                } else {
                    // 其他情况：添加本地消息
                    gameInfo.addNoMovableChess(this.gameState.currentPlayer, this.gameState.diceValue, true);

                    // 发送网络同步消息给其他客户端
                    multiplayerManager.syncNoMovableChess(this.gameState.currentPlayer, this.gameState.diceValue);
                }
            } else {
                // 单机模式下直接添加消息
                gameInfo.addNoMovableChess(this.gameState.currentPlayer, this.gameState.diceValue);
            }

            this.uiUpdater.updateUI();
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 在联机模式下，不要本地切换玩家，统一等待服务器同步
            if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                console.log(`联机模式：玩家${this.gameState.currentPlayer}无法移动，等待服务器同步玩家切换`);
            } else {
                // 单机模式正常切换玩家
                this.gameState.nextPlayer(this.uiUpdater, this.handleThinkingTimeoutWrapper.bind(this), this.triggerBotOperationIfNeeded.bind(this));
            }
        }

        // 重置防抖标志
        this.gameState.isRolling = false;
        this.uiUpdater.updateUI();

        // 检查是否有延迟的暂停操作
        if (this.eventHandler && this.eventHandler.handlePendingPause) {
            this.eventHandler.handlePendingPause();
        }
    }

    /**
     * 处理连续三次6的惩罚
     */
    async handleThreeSixesPenalty() {
        // 惩罚：所有棋子返回起点
        const pieceCount = this.gameState.pieceCount; // 获取当前棋子个数
        for (let i = 0; i < pieceCount; i++) {
            if (this.gameState.playerChess[this.gameState.currentPlayer][i].position >= 0 &&
                !this.gameState.playerChess[this.gameState.currentPlayer][i].finished) {
                this.gameState.playerChess[this.gameState.currentPlayer][i].position = -1;
                this.animation.moveChessToStart(this.gameState.currentPlayer, i, this.gameState.playerChess);
            }
        }
        // 重置连续6的计数
        this.gameState.consecutiveSixes = 0;
        this.gameState.canReroll = false;
        this.gameState.justRolledSix = false;
        this.uiUpdater.updateUI();
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 停止思考进度条，防止Bot继续操作
        if (this.uiUpdater) {
            this.uiUpdater.stopThinkingProgressBar();
        }

        // 在联机模式下，不要本地切换玩家，等待服务器同步
        if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            console.log(`联机模式：玩家${this.gameState.currentPlayer}连续3次6惩罚后，等待服务器同步玩家切换`);
            // 重置游戏阶段，防止Bot继续操作
            this.gameState.gamePhase = 'waiting';
            // 不调用 nextPlayer()，等待服务器同步
        } else {
            // 单机模式正常切换玩家
            this.gameState.nextPlayer(this.uiUpdater, this.handleThinkingTimeoutWrapper.bind(this), this.triggerBotOperationIfNeeded.bind(this));
        }

        this.gameState.isRolling = false;

        // 检查是否有延迟的暂停操作
        if (this.eventHandler && this.eventHandler.handlePendingPause) {
            this.eventHandler.handlePendingPause();
        }
    }

    /**
     * 处理思考时间超时的包装函数
     */
    handleThinkingTimeoutWrapper() {
        console.log(`思考超时触发 - 当前玩家: ${this.gameState.currentPlayer}`);
        gameInfo.addThinkingTimeout(this.gameState.currentPlayer);
        // 统一使用 gameState.handleThinkingTimeout() 处理超时逻辑（内部已实现开启AI托管）
        const result = this.gameState.handleThinkingTimeout();

        if (result && result.shouldUpdateUI) {
            this.uiUpdater.updateUI();
        }

        if (result && result.shouldStartNewTimer) {
            // 为新玩家启动思考时间计时器
            setTimeout(() => {
                this.uiUpdater.startThinkingProgressBar(() => {
                    console.log(`玩家${result.newPlayer}掷骰子思考时间到，开启AI托管`);
                    this.handleThinkingTimeoutWrapper();
                });
                // 检查新玩家是否为bot，如果是则触发bot操作
                this.triggerBotOperationIfNeeded();
            }, 100);
        }
    }

    /**
     * 检查当前玩家是否为bot，如果是则触发bot操作
     */
    triggerBotOperationIfNeeded() {
        if (botController) {
            const isBot = botController.isCurrentPlayerBot();

            if (isBot) {
                setTimeout(() => {
                    botController.handleBotTurn();
                }, 100);
            }
        }
    }
}

// 创建并导出骰子实例
export const dice = new Dice(gameState, utils, null, null);
export default Dice;