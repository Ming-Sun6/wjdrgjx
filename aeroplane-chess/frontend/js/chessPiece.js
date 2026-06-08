/**
 * 棋子模块 - 处理棋子移动相关功能
 * 依赖：gameState.js, utils.js, animation.js, uiUpdater.js, dice.js
 */
// 导入依赖模块
import { ANIMATION_DELAY } from './animation.js';
import { gameInfo } from './gameInfo.js';
import { botController } from './botController.js';
import { audioManager } from './audioManager.js';

class ChessPiece {
    constructor(gameState, utils, animation, uiUpdater, dice) {
        this.gameState = gameState;
        this.utils = utils;
        this.animation = animation;
        this.uiUpdater = uiUpdater;
        this.dice = dice;

        // 添加防抖相关属性
        this.isProcessingClick = false; // 是否正在处理点击事件
        this.clickTimeout = null; // 点击超时定时器

        // 添加唯一时间戳机制，用于判断棋子叠放顺序
        this.landTimestamp = 0;
    }

    /**
     * 生成唯一的最后落位位置标识（位置 * 1000 + 时间戳）
     * 用于确保后到达的棋子显示在最上层
     * @param {number} position - 棋子位置
     * @returns {number} 唯一的标识值
     */
    generateUniqueLastLandPos(position) {
        this.landTimestamp++;
        // 使用位置和递增时间戳组合成唯一值，时间戳越大表示越晚到达
        return position * 1000 + this.landTimestamp;
    }

    /**
     * 处理棋子点击事件
     */
    onChessClick(player, chessIndex, event) {
        // 防抖检查：如果正在处理点击事件，直接返回
        if (this.isProcessingClick) {
            console.log('正在处理棋子点击，忽略重复点击');
            return;
        }

        // 检查是否是传送门模式（最优先检查，避免其他逻辑干扰）
        if (window.gameInstance && window.gameInstance.isTeleportMode) {
            const chess = this.gameState.playerChess[player][chessIndex];

            // 检查是否是当前玩家的棋子
            if (player !== this.gameState.currentPlayer) {
                return;
            }

            // 检查棋子是否已完成
            if (chess.finished) {
                import('./skillManager.js').then(module => {
                    if (module.skillManager) {
                        module.skillManager.showNotification('已完成的棋子无法传送！');
                    }
                });
                return;
            }

            // 检查是否是最顶层棋子
            if (!this.isTopChessAtPosition(player, chessIndex, chess.position)) {
                return;
            }

            this.handleTeleportMove(player, chessIndex);
            return;
        }

        // 基本游戏状态检查
        if (this.gameState.gamePhase !== 'selecting' || this.gameState.winner) return;

        // 检查是否是当前玩家的棋子
        if (player !== this.gameState.currentPlayer) {
            console.log(`玩家${player}的棋子被点击，但当前玩家是${this.gameState.currentPlayer}，忽略点击`);
            return;
        }

        const chess = this.gameState.playerChess[player][chessIndex];

        // 检查是否可以选择这个棋子
        if (chess.finished) return; // 已完成的棋子不能选择

        // 检查是否是同一位置上最顶层的棋子
        if (!this.isTopChessAtPosition(player, chessIndex, chess.position)) {
            return; // 不是最顶层棋子，不能选择
        }

        const canLaunch = this.gameState.diceValue % 2 === 0;

        if (chess.position === -1) {
            // 棋子在起始区域，只有偶数才能出发
            if (!canLaunch) return;
        } else {
            // 棋子在轨道上，检查是否可以移动
        }

        // 设置防抖标志，防止重复点击
        this.isProcessingClick = true;

        // 设置超时清除防抖标志（防止异常情况下标志永远不被清除）
        this.clickTimeout = setTimeout(() => {
            this.isProcessingClick = false;
        }, 3000); // 3秒超时

        // 只有在棋子可以移动时才停止思考时间计时器
        this.uiUpdater.stopThinkingProgressBar();

        this.gameState.selectedChess = { player, chessIndex };

        // 选中棋子后，立即将游戏阶段设为 moving，防止 updateUI 逻辑干扰
        this.gameState.gamePhase = 'moving';

        // 立即手动触发一次非选中棋子的清理，确保视觉反馈即时
        document.querySelectorAll('.chess-movable').forEach(element => {
            if (element !== chess.element) {
                element.classList.remove('chess-movable');
            }
        });

        this.moveSelectedChess();
    }

    /**
     * 检查是否是同一位置上最顶层的棋子
     * @param {number} player - 玩家编号
     * @param {number} chessIndex - 棋子索引
     * @param {number} position - 棋子位置
     * @returns {boolean} 是否是最顶层棋子
     */
    isTopChessAtPosition(player, chessIndex, position) {
        // 如果棋子在起始区域，直接返回true
        if (position === -1) return true;

        // 获取同一位置的己方棋子
        const samePositionChess = [];
        const pieceCount = this.gameState.pieceCount; // 获取当前棋子个数
        for (let i = 0; i < pieceCount; i++) {
            const chess = this.gameState.playerChess[player][i];
            if (!chess.finished && chess.position === position) {
                samePositionChess.push({ index: i, lastLandPos: chess.lastLandPos || 0 });
            }
        }

        // 如果只有一个棋子在这个位置，直接返回true
        if (samePositionChess.length <= 1) return true;

        samePositionChess.sort((a, b) => a.lastLandPos - b.lastLandPos);
        const topChess = samePositionChess[samePositionChess.length - 1];
        
        return chessIndex === topChess.index;
    }

    /**
     * 选择传送门目标位置（三段式概率分配）
     * @param {number} currentPosition - 当前位置
     * @param {Array} validPositions - 有效位置列表
     * @returns {number} 选定的目标位置
     */
    selectTeleportTarget(currentPosition, validPositions) {
        // 按位移距离（绝对值）排序
        const sortedPositions = validPositions.map(pos => ({
            position: pos,
            displacement: pos - currentPosition,
            distance: Math.abs(pos - currentPosition)
        })).sort((a, b) => a.distance - b.distance);

        // 平均分成三段
        const total = sortedPositions.length;
        const segmentSize = Math.ceil(total / 3);

        // 近距离段（前1/3）：高权重 5.0
        // 中距离段（中1/3）：中权重 3.0
        // 远距离段（后1/3）：低权重 2.0
        const positionsWithWeight = sortedPositions.map((item, index) => {
            let weight;
            if (index < segmentSize) {
                weight = 5.0; // 近距离：50%概率
            } else if (index < segmentSize * 2) {
                weight = 3.0; // 中距离：30%概率
            } else {
                weight = 2.0; // 远距离：20%概率
            }
            return { ...item, weight };
        });

        // 计算总权重
        const totalWeight = positionsWithWeight.reduce((sum, item) => sum + item.weight, 0);

        // 使用加权随机选择
        let randomValue = Math.random() * totalWeight;
        for (const item of positionsWithWeight) {
            randomValue -= item.weight;
            if (randomValue <= 0) {
                console.log(`[传送门] 从位置${currentPosition}传送到${item.position}，位移${item.displacement > 0 ? '+' : ''}${item.displacement}`);
                return item.position;
            }
        }

        // 兜底：返回最后一个
        return positionsWithWeight[positionsWithWeight.length - 1].position;
    }

    /**
     * 处理传送门道具的棋子移动
     * @param {number} player - 玩家编号
     * @param {number} chessIndex - 棋子索引
     */
    async handleTeleportMove(player, chessIndex) {
        try {
            const chess = this.gameState.playerChess[player][chessIndex];

            // 移动开始前，先将棋子移到最顶层
            this.animation.bringToFront(player, chessIndex);

            // 棋子必须在轨道上才能传送（不能传送起始区域的棋子）
            if (chess.position === -1) {
                import('./skillManager.js').then(module => {
                    if (module.skillManager) {
                        module.skillManager.showNotification('起始区域的棋子无法传送！请选择轨道上的棋子');
                    }
                });
                return;
            }

            // 清除传送门模式标记（只有成功传送时才清除）
            if (window.gameInstance) {
                window.gameInstance.isTeleportMode = false;
                // 恢复骰子图标
                if (window.gameInstance.skillManager) {
                    window.gameInstance.skillManager.restoreDiceIcon();
                }
            }

            // 生成有效位置列表（1-50，排除当前位置，且必须是空位）
            const validPositions = [];
            for (let pos = 1; pos <= 50; pos++) {
                if (pos === chess.position) continue; // 排除当前位置

                // 计算绝对位置
                const absolutePosition = this.utils.getAbsolutePosition(player, pos);

                // 检查该绝对位置是否有任何棋子（包括自己的其他棋子和其他玩家的棋子）
                let hasOtherChess = false;

                // 固定4个玩家（游戏默认配置）
                for (let p = 1; p <= 4; p++) {
                    for (let i = 0; i < this.gameState.pieceCount; i++) {
                        const otherChess = this.gameState.playerChess[p][i];

                        // 跳过当前正在传送的棋子本身
                        if (p === player && i === chessIndex) {
                            continue;
                        }

                        // 跳过已完成的棋子
                        if (otherChess.finished) {
                            continue;
                        }

                        // 跳过在基地的棋子（position === -1）
                        if (otherChess.position === -1) {
                            continue;
                        }

                        // 跳过在终点通道的棋子（position >= 51，每个玩家独立）
                        if (otherChess.position >= 51) {
                            continue;
                        }

                        const otherAbsolutePosition = this.utils.getAbsolutePosition(p, otherChess.position);
                        if (otherAbsolutePosition === absolutePosition) {
                            hasOtherChess = true;
                            break;
                        }
                    }
                    if (hasOtherChess) break;
                }

                // 只有空位才加入有效位置列表
                if (!hasOtherChess) {
                    validPositions.push(pos);
                }
            }

            // 如果没有有效位置，取消传送
            if (validPositions.length === 0) {
                import('./skillManager.js').then(module => {
                    if (module.skillManager) {
                        module.skillManager.showNotification('没有可用的空位进行传送！');
                    }
                });
                // 清除传送门模式并恢复图标
                if (window.gameInstance) {
                    window.gameInstance.isTeleportMode = false;
                    if (window.gameInstance.skillManager) {
                        window.gameInstance.skillManager.restoreDiceIcon();
                    }
                }
                return;
            }
            const targetPosition = this.selectTeleportTarget(chess.position, validPositions);
            const fromPosition = chess.position;

            // 记录前进距离（仅记录前进的，后退的不计）
            if (targetPosition > fromPosition) {
                this.gameState.incrementTotalDistance(player, targetPosition - fromPosition);
            }

            if (window.gameInstance && window.gameInstance.skillManager) {
                window.gameInstance.skillManager.sendSkillUsageInfo(player, '传送门', { 
                    fromPosition: fromPosition, 
                    toPosition: targetPosition,
                    moveType: 'teleport'
                });
            }

            // 更新棋子位置
            this.gameState.updateChessPosition(player, chessIndex, targetPosition);
            chess.lastLandPos = this.generateUniqueLastLandPos(targetPosition);

            // 在线模式下同步移动
            if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                window.gameInstance.multiplayerGameManager.syncChessMove(player, chessIndex, fromPosition, targetPosition, 'teleport');
            }

            // 播放传送音效（使用飞行音效）
            if (window.audioManager) {
                window.audioManager.playFlySound();
            }

            // 传送动画：先淡出，再更新位置，然后淡入
            const chessElement = chess.element;
            if (chessElement) {
                // 淡出效果
                chessElement.classList.add('chess-teleport-fade');
                chessElement.style.opacity = '0';

                // 等待淡出完成后更新位置
                setTimeout(() => {
                    // 更新视觉位置
                    if (this.animation) {
                        this.animation.updateChessPosition(player, chessIndex);
                    }

                    // 淡入效果
                    setTimeout(() => {
                        chessElement.style.opacity = '1';

                        // 动画完成后清除transition
                        setTimeout(() => {
                            chessElement.classList.remove('chess-teleport-fade');
                        }, 200);
                    }, 50);
                }, 200);
            } else {
                // 如果没有element，直接更新位置
                if (this.animation) {
                    this.animation.updateChessPosition(player, chessIndex);
                }
            }

            // 更新UI
            if (this.uiUpdater) {
                this.uiUpdater.updateUI();
            }

            // 切换回合（传送门不能连投，直接切换到下一个玩家）
            this.gameState.nextPlayer(
                this.uiUpdater,
                this.dice ? this.dice.handleThinkingTimeoutWrapper.bind(this.dice) : null,
                this.triggerBotOperationIfNeeded ? this.triggerBotOperationIfNeeded.bind(this) : null,
                false,
                { forceEndTurn: true, reason: 'teleport' }
            );
        } catch (error) {
            console.error('[传送门] 处理传送时出错:', error);
            // 确保清除传送门模式标记并恢复骰子图标
            if (window.gameInstance) {
                window.gameInstance.isTeleportMode = false;
                if (window.gameInstance.skillManager) {
                    window.gameInstance.skillManager.restoreDiceIcon();
                }
            }
        }
    }

    /**
     * 重置棋子偏移，恢复到正常位置
     * @param {number} player - 玩家编号
     * @param {number} chessIndex - 棋子索引
     */
    resetChessOffset(player, chessIndex) {
        const chess = this.gameState.playerChess[player][chessIndex];
        const trackPos = this.gameState.mainTrack[chess.position];

        if (chess.element && trackPos) {
            const chessOffset = -5.6;

            // 获取基于玩家的基础旋转角度
            const baseRotations = { 1: 180, 2: 270, 3: 0, 4: 90 };
            const baseRotation = baseRotations[player];

            // 获取基于位置的旋转角度
            const positionRotation = this.utils.getChessRotationAtPosition(player, chess.position, this.gameState);

            // 棋子中心坐标（不包含叠加偏移）
            const centerX = trackPos.x + chessOffset + 5.6;
            const centerY = trackPos.y + chessOffset + 5.6;

            chess.element.setAttribute('x', trackPos.x + chessOffset);
            chess.element.setAttribute('y', trackPos.y + chessOffset);
            chess.element.setAttribute('transform', `rotate(${baseRotation},0,0) rotate(${positionRotation - baseRotation},${centerX},${centerY})`);
            
            // 更新阴影
            if (window.gameInstance && window.gameInstance.animation) {
                window.gameInstance.animation.updateChessShadow(player, chessIndex, positionRotation - baseRotation);
            }
            
            // 使用类管理动画，确保一致性
            chess.element.classList.add('chess-transition', 'animating');
            
            // 动画完成后清理类
            setTimeout(() => {
                chess.element.classList.remove('chess-transition', 'animating');
            }, 350);
        }
    }

    /**
     * 移动选中的棋子
     */
    async moveSelectedChess() {
        if (!this.gameState.selectedChess) {
            // 清除防抖标志
            this.clearClickDebounce();
            return;
        }

        const { player, chessIndex } = this.gameState.selectedChess;
        const chess = this.gameState.playerChess[player][chessIndex];

        console.log(`[移动] 玩家${player}选择了棋子${chessIndex}进行移动`);

        if (chess.position === -1) {
            // 从起始区域出发到位置0
            this.gameState.setChessMoving(true);
            try {
                const fromPosition = chess.position;

                // 播放起飞音效
                audioManager.playFlySound();

                // 移动开始前，先将棋子移到最顶层
                this.animation.bringToFront(player, chessIndex);

                chess.position = 0;
                chess.lastLandPos = this.generateUniqueLastLandPos(chess.position);
                this.animation.updateChessPosition(player, chessIndex);

                // 记录前进距离：从-1到0计为1步
                this.gameState.incrementTotalDistance(player, 1);

                // 如果是在线多人模式，同步棋子移动
                if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                    window.gameInstance.multiplayerGameManager.syncChessMove(player, chessIndex, 0);
                }

                // 添加棋子起飞信息到游戏信息面板
                gameInfo.addChessMove(player, chessIndex, 'launch', fromPosition, 0);

                // 检查位置0是否为起跳点（虽然位置0不是起跳点，但为了保持逻辑一致性）
                if (this.utils.isJumpPoint(0)) {
                    const nextJumpPoint = this.utils.getNextJumpPoint(0);
                    if (nextJumpPoint) {
                        await this.animation.animateJump(player, chessIndex, nextJumpPoint);
                    }
                } else {
                    // 如果不是起跳点，检查是否形成叠子
                    this.checkStackFormation(player, 0);
                }

                // 清除选中状态
                this.gameState.selectedChess = null;

                // 清除防抖标志
                this.clearClickDebounce();

                // 检查胜利条件
                if (this.checkWinner()) {
                    this.gameState.winner = player;
                    this.gameState.gamePhase = 'finished';

                    // 记录游戏结束时间
                    this.gameState.recordGameEndTime();

                    // 记录最后一次完成度快照（确保折线图完整性）
                    if (window.progressDisplay) {
                        this.gameState.recordProgressSnapshot(window.progressDisplay);
                    }

                    // 添加玩家胜利信息到游戏信息面板
                    gameInfo.addPlayerWin(player);

                    // 在线多人模式下同步游戏结束
                    if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                        window.gameInstance.multiplayerGameManager.syncGameEnd(player);
                    }

                    // 显示结算模态框
                    setTimeout(() => {
                        if (window.main && window.main.settlementModal) {
                            window.main.settlementModal.show(player);
                        }
                    }, 1000); // 延迟1秒显示，让玩家看到胜利信息
                } else {
                    this.handleMoveComplete(player);
                }

                this.uiUpdater.updateUI();
            } finally {
                this.gameState.setChessMoving(false);
            }
        } else {
            // 在轨道上移动，逐格移动
            this.animateChessMovement(player, chessIndex, this.gameState.diceValue);
            return; // 动画完成后会调用完成移动的逻辑
        }
    }

    /**
     * 清除点击防抖标志
     */
    clearClickDebounce() {
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }
        this.isProcessingClick = false;
    }

    /**
     * 棋子逐格移动动画
     */
    async animateChessMovement(player, chessIndex, steps) {
        // 设置棋子移动状态
        this.gameState.setChessMoving(true);

        // 记录前进距离
        this.gameState.incrementTotalDistance(player, steps);

        // 移动开始前，先将棋子移到最顶层
        this.animation.bringToFront(player, chessIndex);

        try {
            const chess = this.gameState.playerChess[player][chessIndex];
            let currentPosition = chess.position;
            const originalPosition = currentPosition; // 保存原始位置

            // 检查前方路径上是否有其他玩家的叠子
            const stackInfo = this.utils.checkStackInPath(player, currentPosition, steps, this.gameState);
            let needsStackBounce = false;// 叠子阻拦
            let stackBounceSteps = 0;
            let needsStackCrash = false; // 叠子碰撞

            if (stackInfo) {
                if (stackInfo.isExactHit) {
                    needsStackCrash = true;
                } else if (stackInfo.needsBounce) {
                    needsStackBounce = true;
                    stackBounceSteps = stackInfo.remainingSteps;
                }
            }

            // 检查是否会超出终点（需要反弹）
            let needsBounce = false;
            let bounceSteps = 0;

            // 计算移动后的位置
            const targetPosition = currentPosition + steps;

            // 如果移动后会超过位置56（终点），则需要反弹
            // 适用于所有情况：在终点通道内或从外面进入终点通道
            if (targetPosition > 56 && currentPosition < 56) {
                needsBounce = true;
                bounceSteps = targetPosition - 56;
                console.log(`[反弹检测] 从位置${currentPosition}投掷${steps}点会到达${targetPosition}，超出终点，需要反弹${bounceSteps}步`);
            }

            // 第一阶段：向前移动
            let stepsToMove;
            if (needsStackCrash || needsStackBounce) {
                stepsToMove = stackInfo.distanceToStack; // 移动到叠子位置
            } else if (needsBounce) {
                stepsToMove = 56 - currentPosition; // 移动到终点
            } else {
                stepsToMove = steps; // 正常移动
            }

            // 在开始逐格移动前，先将棋子更新到当前位置并确保它在最顶层
            // 这样在后续的逐格移动中，它已经是 lastChild，不会因为 appendChild 而中断动画
            this.animation.updateChessPosition(player, chessIndex);

            for (let step = 1; step <= stepsToMove; step++) {
                await new Promise(resolve => setTimeout(resolve, 200));

                // 播放移动音效
                audioManager.playMoveSound();

                currentPosition++;
                chess.position = currentPosition;
                chess.lastLandPos = this.generateUniqueLastLandPos(chess.position);

                // 在线多人模式下同步棋子移动
                if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                    window.gameInstance.multiplayerGameManager.syncChessMove(player, chessIndex, currentPosition);
                }

                if (currentPosition === 56) {
                    // 到达终点
                    if (!needsBounce && !needsStackBounce) {
                        // 重要：先更新视觉位置到56（此时finished还是false，所以会正常显示）
                        this.animation.updateChessPosition(player, chessIndex);

                        // 使用await等待，确保玩家能看到棋子在位置56停顿
                        await new Promise(resolve => setTimeout(resolve, 500));

                        // 现在才设置finished状态
                        chess.finished = true;

                        // 记录首位完成者（用于称号统计）
                        this.gameState.recordFirstFinished(player);

                        // 添加棋子完成信息到游戏信息面板
                        gameInfo.addChessFinish(player, chessIndex);
                        this.animation.moveChessToFinish(player, chessIndex);

                        // 棋子完成后，检查该玩家是否获胜
                        if (this.checkWinner()) {
                            this.gameState.winner = player;
                            this.gameState.gamePhase = 'finished';

                            // 记录最后一次完成度快照（确保折线图完整性）
                            if (window.progressDisplay) {
                                this.gameState.recordProgressSnapshot(window.progressDisplay);
                            }

                            // 添加玩家胜利信息到游戏信息面板
                            gameInfo.addPlayerWin(player);

                            // 在线多人模式下同步游戏结束
                            if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                                window.gameInstance.multiplayerGameManager.syncGameEnd(player);
                            }

                            // 显示结算模态框
                            setTimeout(() => {
                                if (window.main && window.main.settlementModal) {
                                    window.main.settlementModal.show(player);
                                }
                            }, 1000); // 延迟1秒显示，让玩家看到胜利信息
                        } else {
                            // 如果没有获胜，继续正常的游戏流程
                            this.handleMoveComplete(player);
                        }
                        return;
                    } else {
                        // 需要反弹，更新位置但不标记为完成（终点反弹不需要停顿）
                        this.animation.updateChessPosition(player, chessIndex);
                    }
                    break;
                } else {
                    // 正常移动过程中，更新视觉位置但不进行beat检测
                    this.animation.updateChessPosition(player, chessIndex);

                    // 只有在刚好到达叠子位置且不需要反弹时，才执行叠子碰撞逻辑
                    if (needsStackCrash && step === stepsToMove && currentPosition === stackInfo.stackPosition && !needsStackBounce) {
                        // 检查是否为在线多人模式
                        const isOnlineMultiplayer = this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager;

                        // 在线多人模式下同步叠子碰撞事件，不在本地添加info
                        if (isOnlineMultiplayer) {
                            const stackedChesses = stackInfo.stackInfo.chessList;
                            window.gameInstance.multiplayerGameManager.syncStackCollision(player, stackInfo.stackPlayer, stackedChesses, currentPosition);
                        } else {
                            // 单机模式：本地添加碰撞info
                            gameInfo.addStackCollision(player, stackInfo.stackPlayer);
                        }

                        // 延迟执行碰撞逻辑，让玩家看到棋子到达叠子位置
                        setTimeout(async () => {
                            const stackedChesses = stackInfo.stackInfo.chessList;

                            // 添加击败信息和更新击败计数
                            // 注意：联机模式下不添加gameInfo（会通过defeatCountChange同步显示）
                            for (const stackedChess of stackedChesses) {
                                if (!isOnlineMultiplayer) {
                                    gameInfo.addChessBeat(player, stackedChess.player, stackedChess.chessIndex, false, false, true);
                                }
                                this.gameState.incrementDefeatCount(player, stackedChess.player);
                            }
                            if (!isOnlineMultiplayer) {
                                gameInfo.addChessBeat(stackInfo.stackPlayer, player, chessIndex, false, false, true);
                            }
                            this.gameState.incrementDefeatCount(stackInfo.stackPlayer, player);

                            this.gameState.updateChessPosition(player, chessIndex, -1);
                            this.gameState.setChessFinished(player, chessIndex, false);
                            this.animation.moveChessToStart(player, chessIndex);

                            for (const stackedChess of stackedChesses) {
                                console.log(`[叠子碰撞] 将玩家${stackedChess.player}的棋子${stackedChess.chessIndex}返回起点`);
                                this.gameState.updateChessPosition(stackedChess.player, stackedChess.chessIndex, -1);
                                this.gameState.setChessFinished(stackedChess.player, stackedChess.chessIndex, false);
                                this.animation.moveChessToStart(stackedChess.player, stackedChess.chessIndex);
                            }

                            // 更新所有棋子位置
                            this.updateAllChessPositions();

                            // 处理特殊位置和下一个玩家
                            await this.handleSpecialPositions(player, chessIndex, -1);
                            this.gameState.nextPlayer(this.uiUpdater, this.dice ? this.dice.handleThinkingTimeoutWrapper.bind(this) : null, this.triggerBotOperationIfNeeded ? this.triggerBotOperationIfNeeded.bind(this) : null, false);
                        }, 200); // 延迟200ms执行碰撞逻辑
                        return; // 结束移动
                    }
                }
            }

            // 第二阶段：如果遇到叠子需要反弹
            if (needsStackBounce && currentPosition === stackInfo.stackPosition) {
                const startPos = currentPosition;
                gameInfo.addStackBlock(player, stackInfo.stackPlayer);

                // 记录叠子反弹步数
                this.gameState.recordBounceSteps(player, stackBounceSteps);

                // 在线多人模式下同步叠子反弹事件
                if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                    window.gameInstance.multiplayerGameManager.syncStackBounce(player, chessIndex, startPos, currentPosition - stackBounceSteps, stackBounceSteps);
                }

                for (let step = 1; step <= stackBounceSteps; step++) {
                    // 延迟每一步的移动
                    await new Promise(resolve => setTimeout(resolve, 200));

                    currentPosition--;

                    // 如果反弹到位置0以下，停在位置0
                    if (currentPosition < 0) {
                        currentPosition = 0;
                        chess.position = currentPosition;
                        chess.lastLandPos = this.generateUniqueLastLandPos(chess.position);
                        // 播放移动音效（位置0是正常位置）
                        audioManager.playMoveSound();
                        this.animation.updateChessPosition(player, chessIndex);
                        break; // 结束反弹循环，停在位置0
                    } else {
                        chess.position = currentPosition;
                        chess.lastLandPos = this.generateUniqueLastLandPos(chess.position);
                        // 正常反弹过程中播放移动音效
                        audioManager.playMoveSound();
                        this.animation.updateChessPosition(player, chessIndex);
                    }
                }
            }
            // 第三阶段：如果需要终点反弹，从终点往后退
            else if (needsBounce && currentPosition === 56) {
                console.log(`[终点反弹] 玩家${player}的棋子${chessIndex}从位置56反弹${bounceSteps}步，最终位置${56 - bounceSteps}`);

                // 记录终点反弹步数
                this.gameState.recordBounceSteps(player, bounceSteps);

                // 在线多人模式下同步终点反弹事件
                if (this.gameState.isOnlineMultiplayer && window.gameInstance && window.gameInstance.multiplayerGameManager) {
                    console.log(`[终点反弹同步] 发送终点反弹同步消息: 玩家${player}的棋子${chessIndex}`);
                    window.gameInstance.multiplayerGameManager.syncEndpointBounce(player, chessIndex, 56, 56 - bounceSteps, bounceSteps);
                }

                for (let step = 1; step <= bounceSteps; step++) {
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // 播放移动音效
                    audioManager.playMoveSound();

                    currentPosition--;
                    chess.position = currentPosition;
                    chess.lastLandPos = this.generateUniqueLastLandPos(chess.position);
                    this.animation.updateChessPosition(player, chessIndex);
                }
            }

            // 移动完成后的最终位置
            const actualFinalPosition = chess.position;

            // 检查特殊位置（起跳点和飞棋点）
            let hasSpecialAction = false;
            if (!chess.finished && !needsStackBounce && !needsBounce) {
                hasSpecialAction = await this.handleSpecialPositions(player, chessIndex, actualFinalPosition);
            } else if (needsStackBounce || needsBounce) {
                console.log(`[反弹完成] 玩家${player}反弹完成，最终位置${actualFinalPosition}，叠子反弹不触发起跳但保持beat检测`);
            }
            // 只有在非反弹的正常移动时才添加移动信息
            if (!hasSpecialAction && !needsStackBounce && !needsBounce && originalPosition !== -1) {
                gameInfo.addChessMove(player, chessIndex, 'move', originalPosition, actualFinalPosition);
            }

            // 移动完成后的逻辑
            this.gameState.selectedChess = null;

            // 在最终位置检查beat操作（只有正常移动且未完成的棋子才检查）
            // 如果反弹后回到原位置，不进行beat检测，避免误判
            const shouldCheckBeat = !chess.finished &&
                actualFinalPosition <= 51 &&
                actualFinalPosition >= 0 &&
                !this.utils.isJumpPoint(actualFinalPosition) &&
                actualFinalPosition !== originalPosition; // 排除反弹回到原位置的情况

            if (shouldCheckBeat) {
                // 捕获本次移动是否由遥控/道具骰子触发
                const isRemoteDiceMove = this.gameState.isRemoteDice === true;
                // 使用回调机制，确保在视觉动画完成后才执行beat操作
                this.animation.updateChessPosition(player, chessIndex, async () => {
                    const finalAbsolutePosition = this.utils.getAbsolutePosition(player, actualFinalPosition);
                    await this.utils.beatChessAtPosition(finalAbsolutePosition, player, this.gameState, (p, i) => {
                        console.log(`[Beat操作-最终位置] 玩家${player}在最终位置${actualFinalPosition}打败玩家${p}的棋子${i}`);
                        this.animation.moveChessToStart(p, i, null, false, ANIMATION_DELAY.BEAT_HOME_MOVE, true);
                    }, true, true, isRemoteDiceMove, false, ANIMATION_DELAY.BEAT_HOME_MOVE);
                    this.updateAllChessPositions();
                    this.checkStackFormation(player, actualFinalPosition);
                });
            } else {
                // 如果不需要beat检测，直接更新棋子位置
                this.animation.updateChessPosition(player, chessIndex);
                // 更新所有棋子的位置以重新计算叠加偏移
                this.updateAllChessPositions();

                // 检查是否形成叠子（但叠子反弹和终点反弹不应该报告形成叠子）
                if (!needsStackBounce && !needsBounce) {
                    this.checkStackFormation(player, actualFinalPosition);
                }
            }

            // 移动完成后的逻辑处理（胜利检查和玩家切换）
            this.handleMoveComplete(player);
        } finally {
            // 确保在任何情况下都清除移动状态和防抖标志
            this.gameState.setChessMoving(false);
            this.clearClickDebounce();
        }
    }

    /**
     * 更新所有棋子的位置以重新计算叠加偏移
     */
    updateAllChessPositions() {
        const pieceCount = this.gameState.pieceCount || 4; // 获取当前棋子个数，默认为4
        for (let player = 1; player <= 4; player++) {
            for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
                const chess = this.gameState.playerChess[player][chessIndex];
                if (!chess.finished && chess.position >= 0) {
                    this.animation.updateChessPosition(player, chessIndex);
                }
            }
        }
    }

    /**
     * 处理特殊位置（起跳点和飞棋点）
     */
    async handleSpecialPositions(player, chessIndex, position) {
        // 检查位置53是否有对家叠子，如果有则影响飞棋和跳子行为
        const stackCheckResult = this.utils.hasOpponentStackAtPosition53(player, this.gameState);
        const hasOpponentStackAt53 = stackCheckResult.hasStack;

        // 检查是否为特殊飞棋点
        if (position === 14) {
            if (hasOpponentStackAt53) {
                // console.log(`棋子到达位置14，但位置53有对家叠子，降级执行正常跳子到18`);

                // 提示飞棋被阻挡
                const opponentPlayer = this.utils.getOpponentPlayer(player);
                gameInfo.addStackBlock(player, opponentPlayer);

                // 直接调用标准的 animateJump，它会自动处理：
                // 1. 路径中是否有叠子阻挡
                // 2. 终点是否有叠子阻挡
                // 3. 起跳点和落点处的击败检测
                await this.animation.animateJump(player, chessIndex, 18);

                // 如果成功跳到了18，检查是否在18处形成叠子
                const chess = this.gameState.playerChess[player][chessIndex];
                if (chess.position === 18) {
                    this.checkStackFormation(player, 18);
                }
            } else {
                // console.log(`棋子到达位置14，先执行跳子到18，再执行飞棋到30`);

                // 使用animateJump来执行14->18的跳跃，这样会应用正确的时序
                await this.animation.animateJump(player, chessIndex, 18);
                const chess = this.gameState.playerChess[player][chessIndex];
                if (chess.position === 18) {
                    // 再执行飞棋到30
                    await this.performFlyingChess(player, chessIndex, 30, true, true, true);
                }
            }
            return true; // 触发了特殊动作
        } else if (position === 18) {
            // 先检查位置18是否有其他玩家的棋子需要beat（飞前撞机）
            const position18AbsolutePosition = this.utils.getAbsolutePosition(player, 18);
            const isRemoteDiceMove = this.gameState.isRemoteDice === true;
            const prevAnimationGuard = this.gameState.isInChessAnimation;
            this.gameState.isInChessAnimation = true;
            try {
                await this.utils.beatChessAtPosition(position18AbsolutePosition, player, this.gameState, (p, i) => {
                    this.animation.moveChessToStart(p, i, null, false, ANIMATION_DELAY.BEAT_HOME_MOVE, true);
                }, true, true, isRemoteDiceMove, false, ANIMATION_DELAY.BEAT_HOME_MOVE);
            } finally {
                this.gameState.isInChessAnimation = prevAnimationGuard;
            }

            if (hasOpponentStackAt53) {
                // console.log(`棋子到达位置18，但位置53有对家叠子，降级执行正常跳子到22`);

                // 提示飞棋被阻挡
                const opponentPlayer = this.utils.getOpponentPlayer(player);
                gameInfo.addStackBlock(player, opponentPlayer);

                // 直接调用标准的 animateJump，处理所有路径检测和击败检测
                await this.animation.animateJump(player, chessIndex, 22);

                // 如果成功跳到了22，检查是否在22处形成叠子
                const chess = this.gameState.playerChess[player][chessIndex];
                if (chess.position === 22) {
                    this.checkStackFormation(player, 22);
                }
            } else {
                // console.log(`棋子到达位置18，先执行飞棋到30，再执行跳子到34`);
                // 先执行飞棋到30
                await this.performFlyingChess(player, chessIndex, 30, true, true, true);
                const chess = this.gameState.playerChess[player][chessIndex];
                if (chess.position === 30) {
                    // 再执行跳子到34
                    await this.animation.animateJump(player, chessIndex, 34);
                }
            }
            return true; // 触发了特殊动作
        }

        // 检查是否落在普通起跳点
        if (this.utils.isJumpPoint(position)) {
            const nextJumpPoint = this.utils.getNextJumpPoint(position);
            if (nextJumpPoint) {
                // console.log(`棋子落在起跳点${position}，跳跃到${nextJumpPoint}`);
                await this.animation.animateJump(player, chessIndex, nextJumpPoint);
                return true; // 触发了特殊动作
            }
        }

        return false; // 没有触发特殊动作
    }

    /**
     * 执行飞棋操作
     */
    async performFlyingChess(player, chessIndex, targetPosition, checkBeat = true, check53Beat = true, showInfo = true, playSound = true) {
        const chess = this.gameState.playerChess[player][chessIndex];
        const isRemoteDiceMove = this.gameState.isRemoteDice === true;
        
        const startAbsolutePosition = this.utils.getAbsolutePosition(player, chess.position);
        const targetAbsolutePosition = this.utils.getAbsolutePosition(player, targetPosition);

        console.log(`执行飞棋：从${chess.position}（绝对坐标${startAbsolutePosition}）飞到${targetPosition}（绝对坐标${targetAbsolutePosition}）${checkBeat ? '（检查beat）' : '（不检查beat）'}`);

        // 预先显示飞棋信息
        if (showInfo) {
            gameInfo.addChessMove(player, chessIndex, 'fly', chess.position, targetPosition);
        }

        // 检查位置53是否有对家的叠子，如果有则无法飞棋
        const stackCheckResult = this.utils.hasOpponentStackAtPosition53(player, this.gameState);
        if (stackCheckResult.hasStack) {
            // console.log(`[飞棋阻挡] 位置53存在对家叠子，飞棋被阻挡，棋子停在起飞格`);
            // 添加飞棋被阻挡的信息到游戏信息面板
            const opponentPlayer = this.utils.getOpponentPlayer(player);
            gameInfo.addStackBlock(player, opponentPlayer);
            // 棋子无法飞棋，保持在当前位置
            return;
        }

        // 检查飞棋终点是否有叠子
        if (targetPosition !== 56) { // 不是终点的情况下才检查叠子
            const targetStackInfo = this.utils.isStackAtAbsolutePosition(targetAbsolutePosition, this.gameState);
            if (targetStackInfo && targetStackInfo.player !== player) {
                // console.log(`[飞棋撞机] 飞棋终点位置${targetPosition}有其他玩家${targetStackInfo.player}的叠子，所有棋子返回各自起点`);

                // 添加飞棋撞机信息到游戏信息面板
                gameInfo.addStackCollision(player, targetStackInfo.player);

                // 延迟执行撞机逻辑，让玩家看到飞棋动作
                setTimeout(() => {
                    // 当前飞棋的棋子返回起点
                    this.gameState.updateChessPosition(player, chessIndex, -1);
                    this.gameState.setChessFinished(player, chessIndex, false);
                    this.animation.moveChessToStart(player, chessIndex);

                    // 终点的所有叠子棋子也返回各自起点
                    for (const stackedChess of targetStackInfo.chessList) {
                        this.gameState.updateChessPosition(stackedChess.player, stackedChess.chessIndex, -1);
                        this.gameState.setChessFinished(stackedChess.player, stackedChess.chessIndex, false);
                        this.animation.moveChessToStart(stackedChess.player, stackedChess.chessIndex);
                    }
                }, 500);
                return; // 飞棋结束
            }
        }

        // 确认可以飞棋，在检查完成后才同步飞棋动画到其他玩家
        if (window.multiplayerGameManager && window.multiplayerGameManager.isConnected) {
            window.multiplayerGameManager.syncFlyAnimation(player, chessIndex, chess.position, targetPosition);
        }

        // 添加飞棋延迟效果
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const fromPosition = chess.position;
        chess.position = targetPosition;
        chess.lastLandPos = this.generateUniqueLastLandPos(chess.position);

        // 记录飞棋前进距离 (通常为12步)
        const flyDistance = targetPosition - fromPosition;
        if (flyDistance > 0) {
            this.gameState.incrementTotalDistance(player, flyDistance);
        }

        // 播放飞行音效
        audioManager.playFlySound();
        const prevAnimationGuard = this.gameState.isInChessAnimation;
        this.gameState.isInChessAnimation = true;
        const flyAnimationPromise = this.animation.updateChessPosition(player, chessIndex);

        // 在线多人模式下同步棋子位置到服务器
        if (window.gameInstance && window.gameInstance.multiplayerGameManager && window.gameInstance.multiplayerGameManager.isConnected) {
            window.gameInstance.multiplayerGameManager.syncChessMove(player, chessIndex, targetPosition);
        }

        // 只有在check53Beat为true时才检查53号位置的beat
        if (check53Beat) {
            // 飞棋过程中检查对家位置53是否有单颗棋子进行beat
            const opponentPlayer = this.utils.getOpponentPlayer(player);
            const opponentChessAt53 = this.utils.hasChessAtPosition53(opponentPlayer, this.gameState);

            if (opponentChessAt53.hasChess) {
                // 使用统一的beat逻辑
                const beatAbsolutePosition = this.utils.getAbsolutePosition(opponentPlayer, 53);
                await this.utils.beatChessAtPosition(
                    beatAbsolutePosition,
                    player,
                    this.gameState,
                    (p, i) => {
                        // 飞棋中途击败，给一定的延迟让飞过的动作更连贯
                        this.animation.moveChessToStart(p, i, null, false, ANIMATION_DELAY.BEAT_HOME_FLY_MID, true);
                    },
                    true,
                    true,
                    isRemoteDiceMove,
                    true,
                    ANIMATION_DELAY.BEAT_HOME_FLY_MID
                );
            }
        }

        // 等待飞棋动画完全结束
        await flyAnimationPromise;
        this.gameState.isInChessAnimation = prevAnimationGuard;

        // 检查飞棋终点是否形成叠子
        this.checkStackFormation(player, targetPosition);

        // 如果需要检查终点beat操作（非53号位置的beat）
        if (checkBeat && targetPosition <= 51 && targetPosition >= 0 && targetPosition !== 56) {
            const targetAbsolutePosition = this.utils.getAbsolutePosition(player, targetPosition);
            await this.utils.beatChessAtPosition(targetAbsolutePosition, player, this.gameState, (p, i) => {
                // console.log(`[Beat操作-飞棋终点] 玩家${player}打败玩家${p}在终点位置${targetPosition}的棋子${i}`);
                // 飞棋到达终点后的击败，给一定的延迟
                this.animation.moveChessToStart(p, i, null, false, ANIMATION_DELAY.BEAT_HOME_FLY_END, true);
            }, true, true, isRemoteDiceMove, false, ANIMATION_DELAY.BEAT_HOME_FLY_END);
        }
    }

    /**
     * 检查胜利条件
     */
    checkWinner() {
        return this.gameState.playerChess[this.gameState.currentPlayer].every(chess => chess.finished);
    }

    /**
     * 切换到下一个玩家
     */

    /**
     * 调试方法：移动指定棋子一格
     * @param {number} player - 玩家编号 (1-4)
     * @param {number} chessIndex - 棋子索引 (0-3)
     * @param {number} direction - 移动方向 (1: 前进, -1: 后退)
     */
    debugMoveChessOneStep(player, chessIndex, direction) {
        try {
            const chess = this.gameState.playerChess[player][chessIndex];

            if (chess.finished) {
                console.log(`棋子已完成，无法移动`);
                return;
            }

            // 移动开始前，先将棋子移到最顶层
            this.animation.bringToFront(player, chessIndex);

            let newPosition = chess.position + direction;

            // 处理边界情况
            if (direction > 0) {
                // 前进
                if (chess.position === -1) {
                    // 从起始区域出发
                    newPosition = 0;
                } else if (newPosition > 56) {
                    // 超出终点，限制在终点
                    newPosition = 56;
                }
            } else {
                // 后退
                if (chess.position === 0) {
                    // 从位置0后退到起始区域
                    newPosition = -1;
                } else if (chess.position === -1) {
                    // 已在起始区域，无法后退
                    console.log(`棋子已在起始区域，无法后退`);
                    return;
                } else if (newPosition < 0) {
                    // 限制最小位置为0
                    newPosition = 0;
                }
            }

            // 更新棋子位置
            chess.position = newPosition;
            chess.lastLandPos = this.generateUniqueLastLandPos(chess.position);

            if (newPosition === 56) {
                // 到达终点
                chess.finished = true;
                this.animation.moveChessToFinish(player, chessIndex);
            } else if (newPosition === -1) {
                // 回到起始区域
                chess.finished = false;
                this.animation.moveChessToStart(player, chessIndex);
            } else {
                // 正常位置
                chess.finished = false;
                this.animation.updateChessPosition(player, chessIndex);
            }

            console.log(`调试移动完成: 玩家${player} 棋子${chessIndex + 1} 移动到位置${newPosition}`);

            // 更新所有棋子位置以重新计算叠加偏移
            this.updateAllChessPositions();

            // 检查胜利条件
            if (this.checkWinner()) {
                this.gameState.winner = player;
                this.gameState.gamePhase = 'finished';
            }

        } catch (error) {
            console.error('调试移动棋子失败:', error);
        }
    }

    /**
     * 调试方法：移动棋子（保留原有功能）
     */
    debugMoveChess() {
        const currentPlayer = this.gameState.currentPlayer;
        this.debugMoveChessOneStep(currentPlayer, 0, 1);
    }

    /**
     * 调试方法：完成所有棋子
     */
    debugFinishChess() {
        try {
            const currentPlayer = this.gameState.currentPlayer;
            const pieceCount = this.gameState.pieceCount || 4; // 获取当前棋子个数，默认为4

            for (let i = 0; i < pieceCount; i++) {
                const chess = this.gameState.playerChess[currentPlayer][i];
                chess.position = 56;
                chess.lastLandPos = this.generateUniqueLastLandPos(56);
                chess.finished = true;
                this.animation.moveChessToFinish(currentPlayer, i);
            }

            if (this.checkWinner()) {
                this.gameState.winner = currentPlayer;
                this.gameState.gamePhase = 'finished';
            }

            console.log(`调试完成: 玩家${currentPlayer}的所有棋子已完成`);
        } catch (error) {
            console.error('调试完成棋子失败:', error);
        }
    }

    /**
     * 检查棋子是否可以移动
     * @param {number} player - 玩家编号
     * @param {number} chessIndex - 棋子索引
     * @param {number} diceValue - 骰子点数
     * @returns {boolean} 是否可以移动
     */
    canChessMove(player, chessIndex, diceValue) {
        const chess = this.gameState.playerChess[player][chessIndex];

        // 如果棋子已完成，不能移动
        if (chess.finished) {
            return false;
        }

        // 额外检查：如果棋子位置为56（终点），也不能移动
        if (chess.position === 56) {
            console.log(`[canChessMove] 棋子${chessIndex}位置为56（终点），不能移动`);
            return false;
        }

        // 如果棋子在起始区域（position === -1），只有偶数才能出发
        if (chess.position === -1) {
            return diceValue % 2 === 0;
        }

        // 棋子在轨道上，检查是否可以移动
        const newPosition = chess.position + diceValue;

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

    /**
     * 检查是否有可移动的棋子
     * @param {number} player - 玩家编号
     * @param {number} diceValue - 骰子点数
     * @returns {boolean} 是否有可移动的棋子
     */
    hasMovableChess(player, diceValue) {
        const pieceCount = this.gameState.pieceCount || 4; // 获取当前棋子个数，默认为4
        for (let i = 0; i < pieceCount; i++) {
            if (this.canChessMove(player, i, diceValue)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 检查是否形成叠子
     * @param {number} player - 玩家编号
     * @param {number} position - 位置
     */
    checkStackFormation(player, position) {
        // 位置0（起点）不检测叠子
        if (position === 0) {
            return;
        }

        // 获取同一位置的己方棋子数量
        const samePositionChess = [];
        const pieceCount = this.gameState.pieceCount; // 获取当前棋子个数
        for (let i = 0; i < pieceCount; i++) {
            const chess = this.gameState.playerChess[player][i];
            if (!chess.finished && chess.position === position) {
                samePositionChess.push(i);
            }
        }

        // 如果有2个或以上棋子在同一位置，形成叠子
        if (samePositionChess.length >= 2) {
            // 添加叠子形成信息到游戏信息面板
            gameInfo.addStackFormation(player);
        }
    }

    /**
     * 处理移动完成后的游戏逻辑（玩家切换）
     * @param {number} player - 玩家编号
     */
    handleMoveComplete(player) {
        // 移动结束后移除选定棋子的高亮效果
        if (this.gameState.selectedChess) {
            const { player: p, chessIndex: i } = this.gameState.selectedChess;
            const chess = this.gameState.playerChess[p][i];
            if (chess && chess.element) {
                chess.element.classList.remove('chess-movable');
            }
        }

        // 清除防抖标志
        this.clearClickDebounce();

        // 检查是否有待定的安全暂停，如果有，但不返回，继续执行后续状态切换逻辑，确保游戏恢复时状态正确
        if (this.gameState.getPendingSafePause()) {
            this.gameState.executePendingSafePause();
        }

        // 如果可以重新投骰，保持当前玩家；否则切换到下一个玩家
        if (this.gameState.canReroll) {
            console.log(`玩家${player}骰到6，可以重新投骰`);

            // 延迟显示连投奖励信息，确保所有beat操作完成后再显示
            setTimeout(() => {
                // 只有在刚刚掷出6点时才显示连投奖励信息
                if (this.gameState.justRolledSix) {
                    gameInfo.addConsecutiveBonus(player);
                    // 重置标记，避免重复显示
                    this.gameState.justRolledSix = false;
                }
            }, 500);

            this.gameState.gamePhase = 'rolling';
            this.gameState.diceValue = 0; // 重置骰子值以显示未投掷状态

            if (window.multiplayerGameManager && window.multiplayerGameManager.isOnlineMode) {
                window.multiplayerGameManager.syncDiceReset();
            }

            // 如果游戏已暂停，不启动计时器和AI操作
            if (!this.gameState.getIsPaused()) {
                // 启动新的思考时间计时器（掷骰子阶段）
                this.uiUpdater.startThinkingProgressBar(() => {
                    console.log(`玩家${this.gameState.currentPlayer}掷骰子思考时间到，自动切换到下一个玩家`);
                    // 使用 dice 的统一超时处理方法
                    this.dice?.handleThinkingTimeoutWrapper?.();
                });

                // 检查当前玩家是否为bot，如果是则触发bot操作（重新投骰情况）
                this.triggerBotOperationIfNeeded();
            } else {
                console.log('游戏已暂停，可以重新投骰，但不启动计时器和AI操作');
            }
        } else {
            // 使用 dice 的统一超时处理方法
            const handleThinkingTimeout = this.dice?.handleThinkingTimeoutWrapper
                ? this.dice.handleThinkingTimeoutWrapper.bind(this.dice)
                : null;
            const triggerBot = this.triggerBotOperationIfNeeded
                ? this.triggerBotOperationIfNeeded.bind(this)
                : null;
            this.gameState.nextPlayer(this.uiUpdater, handleThinkingTimeout, triggerBot, false);
        }

        // 更新UI
        this.uiUpdater.updateUI();
    }

    /**
     * 检查当前玩家是否为bot，如果是则触发bot操作
     */
    triggerBotOperationIfNeeded() {
        if (botController) {
            const isBot = botController.isCurrentPlayerBot();

            if (isBot) {
                botController.handleBotTurn();
            }
        }
    }

    /**
     * 从网络同步棋子移动
     */
    syncMoveFromNetwork(data) {
        try {
            console.log('从网络同步棋子移动:', data);

            // 根据playerId获取玩家编号
            const playerNumber = this.getPlayerNumberByPlayerId(data.playerId);
            if (!playerNumber) {
                console.warn('无法获取玩家编号:', data.playerId);
                return;
            }

            // 根据pieceId和fromPosition找到对应的棋子
            const chess = this.findChessByPosition(playerNumber, data.fromPosition, data.pieceId);
            if (!chess) {
                console.warn('无法找到对应的棋子:', data);
                return;
            }

            // 更新棋子位置
            chess.chess.position = data.toPosition;
            chess.chess.lastLandPos = this.generateUniqueLastLandPos(data.toPosition);

            // 更新UI显示
            this.updateAllChessPositions();

            console.log(`同步完成: 玩家${playerNumber}的棋子从${data.fromPosition}移动到${data.toPosition}`);

        } catch (error) {
            console.error('同步棋子移动失败:', error);
        }
    }

    /**
     * 根据位置和棋子ID查找棋子
     */
    findChessByPosition(player, position, pieceId) {
        const playerChess = this.gameState.playerChess[player];
        if (!playerChess) return null;

        // 如果有pieceId，直接使用
        if (pieceId !== undefined && playerChess[pieceId]) {
            return { chess: playerChess[pieceId], index: pieceId };
        }

        // 否则根据位置查找
        for (let i = 0; i < playerChess.length; i++) {
            if (playerChess[i].position === position) {
                return { chess: playerChess[i], index: i };
            }
        }

        return null;
    }

    /**
     * 根据playerId获取玩家编号
     */
    getPlayerNumberByPlayerId(playerId) {
        // 这里需要从multiplayerGameManager获取
        if (window.gameInstance && window.gameInstance.multiplayerGameManager) {
            return window.gameInstance.multiplayerGameManager.getPlayerNumberByPlayerId(playerId);
        }
        return null;
    }
}

// 导出棋子类
export default ChessPiece;
