/**
 * Bot控制器 - 处理AI玩家的自动操作
 */
import { gameState } from './gameState.js';
import { playerNameManager } from './playerNameManager.js';
import { progressDisplay } from './progressDisplay.js';
import { activePlayerManager } from './activePlayerManager.js';

class BotController {
    constructor() {
        this.isEnabled = false;
        // 统一思考和操作延迟（联机和本地模式一致）
        this.thinkingDelay = { min: 200, max: 300 }; // 思考时间
        this.actionDelay = { min: 100, max: 300 };    // 操作延迟
        this.chessPiece = null; // 将在gameMain.js中设置
        this.botDifficulties = {}; // 存储每个AI玩家的难度设置
        this.isProcessing = false; // 防止重复触发的标志
        this.lastProcessedPlayer = null; // 记录上次处理的玩家
        this.lastProcessedPhase = null; // 记录上次处理的阶段
    }

    setChessPiece(chessPiece) {
        this.chessPiece = chessPiece;
    }

    setUtils(utils) {
        this.utils = utils;
    }

    /**
     * 设置AI玩家的难度配置
     */
    setBotDifficulties(difficulties) {
        this.botDifficulties = difficulties || {};
        console.log('设置AI难度配置:', this.botDifficulties);
    }

    /**
     * 获取指定玩家的难度设置
     */
    getBotDifficulty(player) {
        return this.botDifficulties[player] || 'easy';
    }

    /**
     * 检查当前玩家是否为bot或处于AI托管状态
     */
    isCurrentPlayerBot() {
        // 添加防重复调用的缓存机制
        const currentPlayer = gameState.getCurrentPlayer();
        const gamePhase = gameState.getGamePhase();
        const cacheKey = `${currentPlayer}-${gamePhase}`;

        // 如果缓存中有相同的结果且时间间隔很短，直接返回缓存结果
        const now = Date.now();
        if (this._lastBotCheckCache &&
            this._lastBotCheckCache.key === cacheKey &&
            now - this._lastBotCheckCache.timestamp < 100) {
            return this._lastBotCheckCache.result;
        }

        const isBot = gameState.isBotPlayer(currentPlayer);
        const isAITakeover = gameState.getIsAITakeover();

        // 在线多人模式下，检查当前玩家是否被AI托管（而不是检查全局状态）
        let isCurrentPlayerAITakeover = false;
        if (gameState.isOnlineMultiplayer && window.gameInstance?.multiplayerGameManager) {
            const currentPlayerId = window.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(currentPlayer);
            const currentPlayerData = window.gameInstance.multiplayerGameManager.players?.get(currentPlayerId);
            isCurrentPlayerAITakeover = window.gameInstance.multiplayerGameManager.aiTakeoverPlayers?.has(currentPlayerId) ||
                currentPlayerData?.isAITakeover || false;
        } else {
            // 单机模式或AI模式，使用全局的isAITakeover
            isCurrentPlayerAITakeover = isAITakeover;
        }

        const result = isCurrentPlayerAITakeover || isBot;

        // 缓存结果
        this._lastBotCheckCache = {
            key: cacheKey,
            result,
            timestamp: now
        };

        // 返回结果
        return result;
    }

    /**
     * 启用/禁用bot自动操作
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
    }

    /**
     * 获取随机延迟时间
     */
    getRandomDelay(delayType = 'thinking') {
        const delays = delayType === 'thinking' ? this.thinkingDelay : this.actionDelay;
        const delay = Math.floor(Math.random() * (delays.max - delays.min + 1)) + delays.min;
        return delay;
    }

    /**
     * Bot自动掷骰子
     */
    async autoDiceRoll() {
        if (!this.isEnabled || !this.isCurrentPlayerBot()) {
            return false;
        }

        const gamePhase = gameState.getGamePhase();
        const isRolling = gameState.getIsRolling();

        // 检查是否可以掷骰子
        if ((gamePhase !== 'rolling' && gamePhase !== 'waiting') || isRolling) {
            return false;
        }

        // 检查游戏是否暂停
        if (gameState.getIsPaused()) {
            return false;
        }

        // 传送门模式下禁止掷骰：该阶段必须走“选棋传送”流程
        if (window.gameInstance?.isTeleportMode || gameState.getDiceValue() === 999) {
            return false;
        }

        // 检查是否为联机模式
        let isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();

        // 在联机模式下，AI和AI托管玩家统一由房主代理执行
        if (isOnlineMultiplayer) {
            const currentPlayer = gameState.getCurrentPlayer();
            const isBotPlayer = gameState.isBotPlayer(currentPlayer);
            let isCurrentPlayerAITakeover = false;
            if (window.gameInstance?.multiplayerGameManager) {
                const currentPlayerId = window.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(currentPlayer);
                const currentPlayerData = window.gameInstance.multiplayerGameManager.players?.get(currentPlayerId);
                isCurrentPlayerAITakeover = window.gameInstance.multiplayerGameManager.aiTakeoverPlayers?.has(currentPlayerId) ||
                    currentPlayerData?.isAITakeover || false;
            }

            if (isBotPlayer || isCurrentPlayerAITakeover) {
                const isHost = window.gameInstance?.multiplayerGameManager?.isHost;
                if (!isHost) {
                    return false;
                }
            }
        }

        // 在联机模式下，启动进度条以显示AI正在思考
        if (isOnlineMultiplayer) {
            // 动态导入uiUpdater
            const { uiUpdater } = await import('./uiUpdater.js');
            if (uiUpdater && uiUpdater.startThinkingProgressBar) {
                // 这里不传入回调，因为AI会自行完成操作
                uiUpdater.startThinkingProgressBar(null);
            }
        }

        // 添加思考延迟
        const thinkingTime = this.getRandomDelay('thinking');
        await new Promise(resolve => setTimeout(resolve, thinkingTime));

        // 思考延迟结束后再次检查：可能在此期间关闭了AI托管/切回手动
        if (!this.isEnabled || !this.isCurrentPlayerBot()) {
            return false;
        }

        // 再次检查游戏是否在延迟期间被暂停
        if (gameState.getIsPaused()) {
            return false;
        }

        // 二次防护：若思考期间进入了传送门模式，直接退出掷骰流程
        if (window.gameInstance?.isTeleportMode || gameState.getDiceValue() === 999) {
            return false;
        }

        // 检查是否为AI托管模式或联机模式的AI电脑玩家，如果是则直接调用事件处理方法
        isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();
        const isAITakeover = gameState.getIsAITakeover();
        const currentPlayer = gameState.getCurrentPlayer();
        const isBotPlayer = gameState.isBotPlayer(currentPlayer);

        // 尝试使用道具
        if (await this.tryUseSkill(currentPlayer)) {
            return true; // 道具已使用，不需要普通掷骰子
        }

        // 联机模式下，使用“当前回合玩家是否被托管”的状态，而不是全局isAITakeover
        let isCurrentPlayerAITakeover = false;
        if (isOnlineMultiplayer && window.gameInstance?.multiplayerGameManager) {
            const currentPlayerId = window.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(currentPlayer);
            const currentPlayerData = window.gameInstance.multiplayerGameManager.players?.get(currentPlayerId);
            isCurrentPlayerAITakeover = window.gameInstance.multiplayerGameManager.aiTakeoverPlayers?.has(currentPlayerId) ||
                currentPlayerData?.isAITakeover || false;
        }

        if ((isOnlineMultiplayer && isCurrentPlayerAITakeover) || (!isOnlineMultiplayer && isAITakeover) || (isOnlineMultiplayer && isBotPlayer)) {
            // 导入eventHandler并直接调用handleDiceClick方法
            const { eventHandler } = await import('./eventHandler.js');
            if (eventHandler && eventHandler.handleDiceClick) {
                console.log(`[AI] 玩家${currentPlayer}触发掷骰`);
                await eventHandler.handleDiceClick();
                return true;
            }
        }

        // 模拟点击骰子
        const diceDisplay = document.getElementById('diceDisplay');
        if (diceDisplay) {
            diceDisplay.click();
            return true;
        }

        return false;
    }

    /**
     * 判断当前玩家是否处于落后状态
     * @param {number} player 玩家编号
     * @returns {boolean} 是否落后
     */
    isPlayerBehind(player) {
        if (!progressDisplay || !window.gameInstance || !window.gameInstance.gameState) {
            return false;
        }
        
        const gameState = window.gameInstance.gameState;
        const progressData = [];
        
        for (let p = 1; p <= 4; p++) {
            // 获取当前激活的玩家列表
            const activePlayers = activePlayerManager ? activePlayerManager.getActivePlayers() : [1, 2, 3, 4];
            if (activePlayers.includes(p)) {
                const progress = progressDisplay.calculatePlayerProgress(p, gameState);
                progressData.push({ player: p, progress: progress });
            }
        }
        
        // 只有1个或0个玩家活跃，谈不上落后
        if (progressData.length <= 1) return false;
        
        progressData.sort((a, b) => b.progress - a.progress);
        
        // 找到当前玩家的排名 (0-based)
        const rank = progressData.findIndex(item => item.player === player);
        
        if (rank === -1) return false;
        
        const myProgress = progressData[rank].progress;
        const topProgress = progressData[0].progress;
        
        // 落后定义：
        // 1. 排名在后半段（例如4人局排第3或第4，3人局排第3）
        // 2. 或者与第一名差距超过20%
        const isBottomHalf = rank >= Math.floor(progressData.length / 2);
        const isSignificantlyBehind = (topProgress - myProgress) > 20;
        
        return isBottomHalf || isSignificantlyBehind;
    }

    /**
     * 判断当前玩家是否严重落后（用于盲盒）
     * @param {number} player 玩家编号
     * @returns {boolean} 是否严重落后
     */
    isPlayerSignificantlyBehind(player) {
        if (!progressDisplay || !window.gameInstance || !window.gameInstance.gameState) {
            return false;
        }
        
        const gameState = window.gameInstance.gameState;
        const progressData = [];
        
        for (let p = 1; p <= 4; p++) {
            // 获取当前激活的玩家列表
            const activePlayers = activePlayerManager ? activePlayerManager.getActivePlayers() : [1, 2, 3, 4];
            if (activePlayers.includes(p)) {
                const progress = progressDisplay.calculatePlayerProgress(p, gameState);
                progressData.push({ player: p, progress: progress });
            }
        }
        
        if (progressData.length <= 1) return false;
        
        progressData.sort((a, b) => b.progress - a.progress);
        
        const rank = progressData.findIndex(item => item.player === player);
        if (rank === -1) return false;
        
        const myProgress = progressData[rank].progress;
        const topProgress = progressData[0].progress;
        
        // 严重落后定义：排最后一名且与第一名差距超过30%
        return rank === progressData.length - 1 && (topProgress - myProgress) > 30;
    }

    /**
     * 尝试在投掷骰子前使用道具
     * @param {number} player 当前玩家
     * @returns {boolean} 是否成功使用了占用回合的道具（返回true表示不需要普通掷骰子）
     */
    async tryUseSkill(player) {
        // 检查是否启用了道具模式
        if (!window.gameInstance || !window.gameInstance.energyManager || !window.gameInstance.energyManager.isSkillModeEnabled()) {
            return false;
        }

        // 检查AI难度，只有hard才使用道具
        const difficulty = this.getBotDifficulty(player);
        if (difficulty !== 'hard') {
            return false;
        }

        const energyManager = window.gameInstance.energyManager;
        const skillManager = window.gameInstance.skillManager;
        if (!skillManager) return false;

        const currentEnergy = Math.floor(energyManager.getEnergy(player));
        
        // 评估应该使用哪个道具
        let selectedSkill = null;
        let bestDiceValue = null; // 用于遥控骰子
        let skillReason = "";
        let skipReasons = []; // 用于记录放弃使用的原因
        
        // 1. 遥控骰子 (花费70)
        if (currentEnergy >= 70 && !selectedSkill) {
            let bestScore = -Infinity;
            let bestDice = 1;
            let foundKillerMove = false;
            
            for (let dice = 1; dice <= 6; dice++) {
                const movable = this.getMovableChess(player, dice);
                if (movable.length === 0) continue;
                
                for (const item of movable) {
                    const analysis = this.analyzeMoveConsequences(player, item.chessIndex, dice);
                    // 只有能产生击杀或到达终点时才考虑使用遥控骰子
                    if (analysis.consequences.some(c => c.startsWith('beat') || c === 'finish')) {
                        const priority = this.calculateMovePriority(analysis);
                        if (priority > bestScore) {
                            bestScore = priority;
                            bestDice = dice;
                            foundKillerMove = true;
                        }
                    }
                }
            }
            
            if (foundKillerMove) {
                if (bestScore >= 500) {
                    selectedSkill = 'remote-dice';
                    bestDiceValue = bestDice;
                    skillReason = bestScore >= 1000 ? "可直接到达终点" : `可击杀对手 (评分: ${bestScore})`;
                } else {
                    skipReasons.push(`遥控骰子: 最佳获益评分(${bestScore})不足500`);
                }
            } else {
                skipReasons.push("遥控骰子: 遍历点数后未发现击杀或终点机会");
            }
        } else if (currentEnergy < 70) {
            skipReasons.push(`遥控骰子: 积分不足 (需70, 现有${currentEnergy})`);
        }

        // 2. 传送门 (花费40)
        if (currentEnergy >= 40 && !selectedSkill) {
            const isBehind = this.isPlayerBehind(player);
            const hasChessOnTrack = skillManager.checkHasChessOnTrack(player);
            
            if (isBehind && hasChessOnTrack) {
                const rand = Math.random();
                if (rand < 0.7) {
                    selectedSkill = 'teleport';
                    skillReason = "位置落后且有棋子在赛道";
                } else {
                    skipReasons.push(`传送门: 策略概率拦截 (随机值${rand.toFixed(2)} >= 0.70)`);
                }
            } else {
                skipReasons.push(`传送门: ${!isBehind ? "排名未落后" : "赛道上无棋子"}`);
            }
        } else if (currentEnergy < 40) {
            skipReasons.push(`传送门: 积分不足 (需40, 现有${currentEnergy})`);
        }

        // 3. 盲盒 (花费15)
        if (currentEnergy >= 15 && currentEnergy < 85 && !selectedSkill) {
            const isSignificantlyBehind = this.isPlayerSignificantlyBehind(player);
            if (isSignificantlyBehind) {
                const rand = Math.random();
                if (rand < 0.8) {
                    selectedSkill = 'mysteryBox';
                    skillReason = "严重落后，急需补充积分";
                } else {
                    skipReasons.push(`盲盒: 策略概率拦截 (随机值${rand.toFixed(2)} >= 0.80)`);
                }
            } else {
                skipReasons.push("盲盒: 尚未达到严重落后标准");
            }
        } else if (currentEnergy < 15) {
            skipReasons.push(`盲盒: 积分不足 (需15, 现有${currentEnergy})`);
        }

        // 4. 多面骰子 (花费50)
        if (currentEnergy >= 50 && !selectedSkill) {
            const isBehind = this.isPlayerBehind(player);
            const hasChessOnTrack = skillManager.checkHasChessOnTrack(player);
            
            if (isBehind && hasChessOnTrack) {
                const rand = Math.random();
                if (rand < 0.4) {
                    selectedSkill = 'polyhedral-dice';
                    skillReason = "落后赶路，尝试多面骰子";
                } else {
                    skipReasons.push(`多面骰子: 策略概率拦截 (随机值${rand.toFixed(2)} >= 0.40)`);
                }
            } else {
                skipReasons.push(`多面骰子: ${!isBehind ? "排名未落后" : "赛道上无棋子"}`);
            }
        } else if (currentEnergy < 50) {
            skipReasons.push(`多面骰子: 积分不足 (需50, 现有${currentEnergy})`);
        }

        if (selectedSkill) {
            const skillNameMap = {
                'remote-dice': '遥控骰子',
                'polyhedral-dice': '多面骰子',
                'teleport': '传送门',
                'mysteryBox': '盲盒'
            };
            
            console.log(`[AI决策] 玩家${player} 决定使用道具: ${skillNameMap[selectedSkill]} (原因: ${skillReason}, 当前积分: ${currentEnergy})`);
            
            const skillCosts = {
                'remote-dice': 70,
                'polyhedral-dice': 50,
                'teleport': 40,
                'mysteryBox': 15
            };
            const cost = skillCosts[selectedSkill];

            skillManager.useSkill(selectedSkill, cost, player);

            if (selectedSkill === 'remote-dice') {
                console.log(`[AI决策] 遥控骰子选择了最优获益点数: ${bestDiceValue}`);
                await skillManager.handleDiceSelection(bestDiceValue, player, null);
                return true;
            } else if (selectedSkill === 'mysteryBox') {
                await new Promise(r => setTimeout(r, 1500));
                return true; 
            }
            return true;
        } else {
            // 如果积分足以使用任何一个道具但最终没用
            if (currentEnergy >= 15) {
                console.log(`[AI决策] 玩家${player} 评估道具后决定暂不使用 (当前积分: ${currentEnergy})`);
                console.log(`[AI决策分析] 放弃原因汇总: ${skipReasons.join(' | ')}`);
            }
        }

        return false;
    }

    /**
     * 智能棋子选择 - 困难模式AI的核心决策逻辑
     */
    intelligentChessSelection(player, diceValue, movableChess) {

        // 特殊处理：传送门模式
        if (diceValue === 999) {
            // 传送门模式：将点位靠前的棋子快速移动
            let mostAdvancedChess = movableChess[0];
            let maxPosition = -Infinity;
            for (const chess of movableChess) {
                if (chess.finished) continue;
                if (chess.position > maxPosition) {
                    maxPosition = chess.position;
                    mostAdvancedChess = chess;
                }
            }
            return mostAdvancedChess;
        }

        const chessAnalysis = [];

        // 分析每个可移动棋子的移动后果
        for (const chess of movableChess) {
            const analysis = this.analyzeMoveConsequences(player, chess.chessIndex, diceValue);
            chessAnalysis.push({
                chess: chess,
                analysis: analysis,
                priority: this.calculateMovePriority(analysis)
            });
        }

        // 特殊决策：多面骰子的优化策略
        if (gameState.isPolyhedralDiceActive) {
            // 检查是否有基地外的棋子可以移动
            const nonBaseChessAnalysis = chessAnalysis.filter(item =>
                item.analysis.currentPosition !== -1
            );
            // 多面骰子主要是用来落后赶路，如果起飞就太亏了（尤其是大点数）
            if (nonBaseChessAnalysis.length > 0) {
                chessAnalysis.forEach(item => {
                    if (item.analysis.consequences.includes('takeoff')) {
                        // 极大降低起飞的优先级
                        item.priority = -1000;
                    } else {
                        // 稍微增加普通移动的优先级
                        item.priority += 500;
                    }
                });
            }
        } else {
            // 特殊决策：点数6的优化策略
            if (diceValue === 6) {
                // 检查是否有基地外的棋子可以移动
                const nonBaseChessAnalysis = chessAnalysis.filter(item =>
                    item.analysis.currentPosition !== -1
                );
                // 如果有基地外的棋子可以移动，降低起飞的优先级，使其低于normal移动
                if (nonBaseChessAnalysis.length > 0) {
                    chessAnalysis.forEach(item => {
                        if (item.analysis.consequences.includes('takeoff')) {
                            item.priority = 30;
                        }
                    });
                }
            }

            // 特殊决策：偶数移动且有棋子在终点通道时，优先起飞基地棋子
            if (diceValue % 2 === 0 && diceValue !== 6) { // 偶数点数但不是6
                const playerChess = gameState.getPlayerChess()[player];

                // 检查是否有棋子在安全轨道（51-56）
                const hasChessInSafeTrack = playerChess.some(chess =>
                    chess.position >= 51 && chess.position <= 56 && !chess.finished
                );

                // 检查是否有基地棋子可以起飞
                const baseChessAnalysis = chessAnalysis.filter(item =>
                    item.analysis.currentPosition === -1 &&
                    item.analysis.consequences.includes('takeoff')
                );

                // 检查是否有可以击败敌人的棋子
                const canBeatAnalysis = chessAnalysis.some(item => 
                    item.analysis.consequences.some(c => c.startsWith('beat'))
                );

                // 只有在没有可以击败敌人的情况下，才考虑提升起飞优先级
                if (hasChessInSafeTrack && !canBeatAnalysis) {
                    if (baseChessAnalysis.length) {
                        // 提升基地棋子起飞的优先级，但确保不高于击败(500+)
                        baseChessAnalysis.forEach(item => {
                            item.priority = 400; 
                        });
                    } else {
                        // 提升基地棋子起飞的优先级，使其略高于普通移动
                        chessAnalysis.forEach(item => {
                            if (item.analysis.consequences.includes('takeoff')) {
                                item.priority = 400;
                            }
                        });
                    }
                }
            }
        }

        // 按优先级排序（优先级越高越好）
        chessAnalysis.sort((a, b) => b.priority - a.priority);

        // 决策原因映射表
        const reasonMap = {
            'takeoff': '起飞',
            'finish': '终点',
            'beat': '击败',
            'stack': '叠子',
            'jump': '跳跃',
            'beat_after_bounce': '终点反弹击败',
            'beat_after_stack_bounce': '叠子反弹击败',
            'normal': '普通',
            'bounce': '终点反弹',
            'stack_bounce': '叠子反弹',
            'stack_collision': '叠子撞机',
            'escape_threat': '逃离威胁'
        };

        // 展示AI决策逻辑的详细日志，包含所有可行动的评分（统一中文）
        const scoresSummary = chessAnalysis.map(item => {
            const reasons = item.analysis.consequences.map(c => reasonMap[c] || c).join('+');
            return `棋子${item.chess.chessIndex}: ${item.priority}点 (${reasons})`;
        }).join(' | ');
        
        console.log(`[AI决策分析] 玩家${player} 待选评分: ${scoresSummary}`);

        const best = chessAnalysis[0];
        const mainReason = best.analysis.consequences.map(c => reasonMap[c] || c).join('+');
        console.log(`[AI决策] 玩家${player} 最终选择棋子${best.chess.chessIndex} (原因: ${mainReason})`);

        // 返回优先级最高的棋子
        return chessAnalysis[0].chess;
    }

    /**
     * 分析棋子移动后果
     */
    analyzeMoveConsequences(player, chessIndex, diceValue) {
        const playerChess = gameState.getPlayerChess()[player];
        const chess = playerChess[chessIndex];
        const currentPosition = chess.position;


        const analysis = {
            chessIndex: chessIndex,
            currentPosition: currentPosition,
            diceValue: diceValue,
            consequences: []
        };

        // 如果棋子在基地，检查是否可以起飞
        if (currentPosition === -1) {
            if (diceValue % 2 === 0) { // 偶数可以起飞
                analysis.consequences.push('takeoff');
            }
            return analysis;
        }

        // 首先检查路径上是否有叠子阻挡
        const stackInPath = this.utils.checkStackInPath(player, currentPosition, diceValue, gameState);
        if (stackInPath) {
            if (stackInPath.isExactHit) {
                // 刚好撞到叠子，双方都返回起点，这是不利的
                analysis.consequences.push('stack_collision');
                analysis.stackCollisionInfo = stackInPath;
                return analysis;
            } else if (stackInPath.needsBounce) {
                // 被叠子阻挡需要反弹
                analysis.consequences.push('stack_bounce');
                analysis.stackBounceInfo = stackInPath;
                const finalPosition = currentPosition + stackInPath.distanceToStack - stackInPath.remainingSteps;
                analysis.targetPosition = finalPosition;

                // 检查反弹后是否能beat其他棋子
                const beatAfterBounce = this.checkBeatAtPosition(player, finalPosition);
                if (beatAfterBounce.canBeat) {
                    analysis.consequences.push('beat_after_stack_bounce');
                    analysis.beatTargets = beatAfterBounce.targets;
                }
                return analysis;
            }
        }

        // 计算目标位置
        const targetPosition = this.calculateTargetPosition(player, currentPosition, diceValue);
        analysis.targetPosition = targetPosition;

        // 检查是否到达终点
        if (this.isFinishPosition(player, targetPosition)) {
            analysis.consequences.push('finish');
            return analysis;
        }

        // 检查是否会发生终点反弹
        const bounceResult = this.checkBounce(player, currentPosition, diceValue);
        if (bounceResult.willBounce) {
            analysis.consequences.push('bounce');
            analysis.bouncePosition = bounceResult.finalPosition;

            // 检查反弹后是否能beat其他棋子
            const beatAfterBounce = this.checkBeatAtPosition(player, bounceResult.finalPosition);
            if (beatAfterBounce.canBeat) {
                analysis.consequences.push('beat_after_bounce');
                analysis.beatTargets = beatAfterBounce.targets;
            }
            return analysis;
        }

        // 检查跳子和飞棋（需要先检查，因为跳子可能改变最终位置）
        const jumpResult = this.checkJumpAndFly(player, currentPosition, targetPosition);
        let finalPosition = targetPosition;
        if (jumpResult.hasJump) {
            analysis.consequences.push('jump');
            analysis.jumpDetails = jumpResult;
            finalPosition = jumpResult.finalPosition;

            // 检查起跳点是否能beat其他棋子（跳子前先beat）
            const beatAtJumpStart = this.checkBeatAtPosition(player, targetPosition);
            if (beatAtJumpStart.canBeat) {
                analysis.consequences.push('beat_after_jump');
                analysis.beatTargets = beatAtJumpStart.targets;
            }

            // 检查跳子后的最终位置是否能beat其他棋子
            const beatAfterJump = this.checkBeatAtPosition(player, finalPosition);
            if (beatAfterJump.canBeat) {
                if (!analysis.consequences.includes('beat_after_jump')) {
                    analysis.consequences.push('beat_after_jump');
                    analysis.beatTargets = beatAfterJump.targets;
                } else {
                    // 如果已经有beat_after_jump，合并目标
                    analysis.beatTargets = [...(analysis.beatTargets || []), ...beatAfterJump.targets];
                }
            }
        } else {
            // 没有跳子，检查普通移动是否会beat其他棋子
            const beatResult = this.checkBeatAtPosition(player, targetPosition);
            if (beatResult.canBeat) {
                analysis.consequences.push('beat');
                analysis.beatTargets = beatResult.targets;
            }
        }

        // 如果没有特殊后果，标记为普通移动
        if (analysis.consequences.length === 0) {
            analysis.consequences.push('normal');
        }

        // 无论何种移动，检查当前棋子后方 4 格内是否有威胁
        const threatCheck = this.checkEnemyBehind(player, currentPosition);
        if (threatCheck.hasThreat) {
            analysis.consequences.push('escape_threat');
            analysis.threatLevel = threatCheck.threatLevel; // 威胁等级（敌人数量）
        }

        return analysis;
    }

    /**
     * 计算移动优先级
     */
    calculateMovePriority(analysis) {
        let priority = 0;

        for (const consequence of analysis.consequences) {
            switch (consequence) {
                case 'finish':
                    // 检查这枚棋子到达终点后，是否意味着整局游戏的胜利
                    const player = analysis.player || gameState.getCurrentPlayer();
                    const playerChess = gameState.getPlayerChess()[player];
                    // 计算还剩多少枚棋子没完成（排除当前这枚）
                    const unfinishedCount = playerChess.filter((c, idx) => !c.finished && idx !== analysis.chessIndex).length;

                    if (unfinishedCount === 0) {
                        priority += 2000; // 绝对最高优先级：直接赢得游戏
                    } else {
                        // 虽然到达终点，但还没赢，优先级设为 450，略低于击败对手(500)
                        // 这样 AI 在“送一个棋子进终点”和“干掉敌人一个棋子”之间会选择后者
                        priority += 450;
                    }
                    break;
                case 'beat':
                case 'beat_after_jump':
                case 'beat_after_bounce':
                case 'beat_after_stack_bounce':
                    priority += 500; // 基础高优先级：击败对手

                    // 如果一次移动可以击败多个棋子，优先击杀离终点最近的敌人：
                    // 敌人越接近终点，被打回起点的收益越高。
                    if (analysis.beatTargets && Array.isArray(analysis.beatTargets) && analysis.beatTargets.length > 0) {
                        try {
                            const playerChess = gameState.getPlayerChess();

                            let maxEnemyProgress = 0;
                            for (const target of analysis.beatTargets) {
                                const tPlayer = target.player;
                                const tIndex = target.chessIndex;
                                const tChess = playerChess?.[tPlayer]?.[tIndex];
                                if (!tChess) continue;

                                const pos = tChess.position;
                                let progressScore = 0;

                                // 简单的“离终点远近”估计：
                                // - 起点（-1）：0
                                // - 轨道(0-50)：基础10 + 位置
                                // - 终点通道(51-56)：基础70 + （越接近56加分越多）
                                if (pos === -1) {
                                    progressScore = 0;
                                } else if (pos >= 51 && pos <= 56) {
                                    progressScore = 70 + (pos - 50) * 5;
                                } else if (pos >= 0) {
                                    progressScore = 10 + pos;
                                }

                                if (progressScore > maxEnemyProgress) {
                                    maxEnemyProgress = progressScore;
                                }
                            }

                            // 将“打掉进度最高的敌人”的收益叠加到优先级上
                            // 系数可以视为权重，数值越大越偏向优先清理临近终点的敌人。
                            priority += maxEnemyProgress * 3;
                        } catch (e) {
                            // 安全降级：如果计算失败，不影响基础逻辑
                        }
                    }
                    break;
                case 'jump':
                    priority += 300; // 中高优先级：跳子
                    break;
                case 'takeoff':
                    priority += 200; // 中等优先级：起飞
                    break;
                case 'stack_bounce':
                    // 叠子反弹的优先级取决于是否有后续beat
                    if (analysis.consequences.includes('beat_after_stack_bounce')) {
                        priority += 400; // 如果反弹后能beat，优先级较高
                    } else {
                        priority += 20; // 单纯反弹优先级很低，因为浪费了点数
                    }
                    break;
                case 'bounce':
                    // 终点反弹的优先级取决于是否有后续beat
                    if (analysis.consequences.includes('beat_after_bounce')) {
                        priority += 400; // 如果反弹后能beat，优先级较高
                    } else {
                        priority += 20; // 降低bounce优先级，因为浪费了点数
                    }
                    break;
                case 'normal':
                    // 基础优先级
                    let normalPriority = 50;

                    // 位置50的特殊处理：提高优先级以进入安全轨道
                    if (analysis.currentPosition === 50) {
                        normalPriority += 30; // 位置50时提高优先级
                    }
                    // 大于50的位置适当降低优先级
                    else if (analysis.currentPosition > 50) {
                        normalPriority -= 10; // 大于50后降低优先级
                    }
                    // 对于普通移动，如果无法刚好到达终点，优先走位置小于50的棋子
                    else if (analysis.currentPosition < 50) {
                        normalPriority += 10;
                    }

                    priority += normalPriority;

                    // 检查是否会拆除自己的叠子（降低优先级）
                    const currentAbsolutePos = this.utils.getAbsolutePosition(analysis.player || gameState.getCurrentPlayer(), analysis.currentPosition);
                    const currentStackInfo = this.utils.isStackAtAbsolutePosition(currentAbsolutePos, gameState);
                    if (currentStackInfo && currentStackInfo.player === (analysis.player || gameState.getCurrentPlayer()) && currentStackInfo.chessCount >= 2) {
                        priority -= 15; // 拆除自己叠子的惩罚
                    }

                    // 检查从当前位置到目标位置的路径上是否有其他玩家的棋子
                    const pathCheckResult = this.checkOpponentInPath(analysis.player || gameState.getCurrentPlayer(), analysis.currentPosition, analysis.targetPosition);
                    if (pathCheckResult.hasOpponent) {
                        priority -= 15; // 超越其他玩家的惩罚
                    }
                    break;
                case 'stack_collision':
                    priority -= 200; // 负优先级：叠子碰撞对双方都不利，应该避免
                    break;
                case 'escape_threat':
                    // 逃离威胁：后方 4 格有敌人紧随
                    // 基础加分 120，每个敌人额外 +30
                    priority += 120 + (analysis.threatLevel || 1) * 30;
                    break;
            }
        }

        // 特殊位置优先级调整：位置53的危险位置判断
        if (analysis.currentPosition === 53) {
            // 如果棋子在位置53（危险位置），且点数不为6，可以离开危险位置，提高优先级
            if (analysis.diceValue !== 6) {
                priority += 150; // 提高优先级，鼓励离开危险位置53
            }
        }
        return priority;
    }

    /**
     * Bot自动选择棋子
     */
    async autoSelectChess() {
        if (!this.isEnabled || !this.isCurrentPlayerBot()) {
            return false;
        }

        // 检查游戏是否暂停
        if (gameState.getIsPaused()) {
            return false;
        }

        const gamePhase = gameState.getGamePhase();
        const currentPlayer = gameState.getCurrentPlayer();

        // 检查是否处于选择棋子阶段
        if (gamePhase !== 'selecting') {
            return false;
        }

        // 在联机模式下，AI和AI托管玩家统一由房主代理执行
        let isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();
        if (isOnlineMultiplayer) {
            const isBotPlayer = gameState.isBotPlayer(currentPlayer);
            let isCurrentPlayerAITakeover = false;
            if (window.gameInstance?.multiplayerGameManager) {
                const currentPlayerId = window.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(currentPlayer);
                const currentPlayerData = window.gameInstance.multiplayerGameManager.players?.get(currentPlayerId);
                
                isCurrentPlayerAITakeover = window.gameInstance.multiplayerGameManager.aiTakeoverPlayers?.has(currentPlayerId) ||
                    currentPlayerData?.isAITakeover || 
                    (currentPlayerData?.isAI && !gameState.isBotPlayer(currentPlayer)) || false;
            }

            if (isBotPlayer || isCurrentPlayerAITakeover) {
                const isHost = window.gameInstance?.multiplayerGameManager?.isHost;
                if (!isHost) {
                    return false;
                }
            }
        }

        // 获取骰子点数
        const diceValue = gameState.getDiceValue();

        // 获取可移动的棋子
        const movableChess = this.getMovableChess(currentPlayer, diceValue);

        if (movableChess.length === 0) {
            return false;
        }

        // 标记AI正在进行决策过程
        gameState.setAIDecisionInProgress(true);

        // 注意：不再在selecting阶段启动进度条，因为进度条已经在rolling阶段启动
        // 避免重复启动导致syncProgressBarStart被多次调用

        // 添加思考延迟
        const thinkingTime = this.getRandomDelay('thinking');
        console.log(`[AI] 玩家${currentPlayer}思考中 (${thinkingTime}ms)...`);
        await new Promise(resolve => setTimeout(resolve, thinkingTime));

        // 再次检查游戏是否在延迟期间被暂停
        if (gameState.getIsPaused()) {
            gameState.setAIDecisionInProgress(false);
            return false;
        }

        // 根据AI难度选择策略
        const difficulty = this.getBotDifficulty(currentPlayer);
        let selectedChess;

        if (difficulty === 'hard') {
            // 困难模式：使用智能决策
            selectedChess = this.intelligentChessSelection(currentPlayer, diceValue, movableChess);
        } else {
            // 简单模式：随机选择
            const randomIndex = Math.floor(Math.random() * movableChess.length);
            selectedChess = movableChess[randomIndex];
            console.log(`[AI决策] 玩家${currentPlayer} 随机选择了棋子${selectedChess.chessIndex} (当前难度: simple)`);
        }

        const selectedChessIndex = selectedChess.chessIndex;

        // 添加操作延迟
        const actionTime = this.getRandomDelay('action');
        await new Promise(resolve => setTimeout(resolve, actionTime));

        // 最后一次检查游戏是否在操作延迟期间被暂停
        if (gameState.getIsPaused()) {
            gameState.setAIDecisionInProgress(false);
            return false;
        }

        // 模拟点击棋子 
        // 只查找未完成的棋子元素（href="#chess"）
        const chessElements = document.querySelectorAll(`#board-svg use[href="#chess"].player-${currentPlayer}`);

        // 创建一个映射，将可移动棋子的逻辑索引映射到DOM元素索引
        const availableChessElements = [];
        const playerChess = gameState.getPlayerChess()[currentPlayer];
        const pieceCount = gameState.pieceCount || 4;

        for (let i = 0; i < chessElements.length; i++) {
            const element = chessElements[i];
            // 通过元素的data属性或其他方式确定这是哪个棋子
            // 这里我们需要找到对应的棋子索引
            for (let chessIdx = 0; chessIdx < pieceCount; chessIdx++) {
                const chess = playerChess[chessIdx];
                if (!chess.finished && chess.element === element) {
                    availableChessElements.push({
                        domIndex: i,
                        chessIndex: chessIdx,
                        element: element
                    });
                    break;
                }
            }
        }

        // 找到选中棋子对应的DOM元素
        const targetChess = availableChessElements.find(item => item.chessIndex === selectedChessIndex);

        if (targetChess) {
            // 检查是否为AI托管模式或联机模式的AI电脑玩家，如果是则直接调用事件处理方法
            const isAITakeover = gameState.getIsAITakeover();
            const isBotPlayer = gameState.isBotPlayer(currentPlayer);

            if (isAITakeover || (isOnlineMultiplayer && isBotPlayer)) {
                // 导入eventHandler并直接调用handleChessClick方法
                const { eventHandler } = await import('./eventHandler.js');
                if (eventHandler && eventHandler.handleChessClick) {
                    try {
                        await eventHandler.handleChessClick(currentPlayer, selectedChessIndex, null);
                    } finally {
                        gameState.setAIDecisionInProgress(false);
                    }
                    return true;
                }
            }

            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            targetChess.element.dispatchEvent(clickEvent);
            gameState.setAIDecisionInProgress(false);
            return true;
        } else {
            console.log(`无法找到棋子${selectedChessIndex}对应的DOM元素`);

            // 备用方案：直接使用第一个可移动棋子的DOM元素
            if (chessElements.length > 0) {
                console.log(`使用备用方案：点击第一个可用的棋子元素`);

                // 检查是否为AI托管模式，如果是则直接调用事件处理方法
                if (gameState.getIsAITakeover()) {
                    // 获取第一个可用棋子的索引
                    const firstAvailableChess = availableChessElements[0];
                    if (firstAvailableChess) {
                        const { eventHandler } = await import('./eventHandler.js');
                        if (eventHandler && eventHandler.handleChessClick) {
                            try {
                                await eventHandler.handleChessClick(currentPlayer, firstAvailableChess.chessIndex, null);
                            } finally {
                                gameState.setAIDecisionInProgress(false);
                            }
                            return true;
                        }
                    }
                }

                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                chessElements[0].dispatchEvent(clickEvent);
                gameState.setAIDecisionInProgress(false);
                return true;
            }
        }

        gameState.setAIDecisionInProgress(false);
        return false;
    }

    /**
     * 计算目标位置
     */
    calculateTargetPosition(player, currentPosition, diceValue) {
        return currentPosition + diceValue;
    }

    /**
     * 检查是否到达终点
     */
    isFinishPosition(player, position) {
        return position === 56;
    }

    /**
     * 检查反弹
     */
    checkBounce(player, currentPosition, diceValue) {
        const targetPosition = currentPosition + diceValue;

        // 只有在终点通道（位置51-56）才会发生反弹
        if (currentPosition >= 51 && currentPosition < 56) {
            if (targetPosition > 56) {
                // 计算反弹后的位置
                const overflow = targetPosition - 56;
                const finalPosition = 56 - overflow;
                return {
                    willBounce: true,
                    finalPosition: finalPosition
                };
            }
        }

        return {
            willBounce: false,
            finalPosition: targetPosition
        };
    }

    /**
     * 检查指定位置是否可以beat其他棋子
     */
    checkBeatAtPosition(player, position) {
        const result = {
            canBeat: false,
            targets: []
        };
        if (position >= 51 && position <= 56) {
            return result;
        }

        // 获取绝对位置
        const absolutePosition = this.utils.getAbsolutePosition(player, position);

        // 检查该位置是否有其他玩家的棋子
        const pieceCount = gameState.pieceCount || 4;
        for (let otherPlayer = 1; otherPlayer <= 4; otherPlayer++) {
            if (otherPlayer === player) continue;

            const otherPlayerChess = gameState.getPlayerChess()[otherPlayer];
            for (let chessIdx = 0; chessIdx < pieceCount; chessIdx++) {
                const otherChess = otherPlayerChess[chessIdx];
                if (otherChess.finished) continue;

                const otherAbsolutePosition = this.utils.getAbsolutePosition(otherPlayer, otherChess.position);
                if (otherAbsolutePosition === absolutePosition) {
                    // 检查是否为叠子（如果是叠子则不能beat）
                    const stackInfo = this.utils.isStackAtAbsolutePosition(absolutePosition, gameState);
                    if (!stackInfo || stackInfo.chessList.length === 1) {
                        result.canBeat = true;
                        result.targets.push({
                            player: otherPlayer,
                            chessIndex: chessIdx
                        });
                    }
                }
            }
        }

        return result;
    }

    /**
     * 检查跳子和飞棋
     */
    checkJumpAndFly(player, currentPosition, targetPosition) {
        const result = {
            hasJump: false,
            finalPosition: targetPosition
        };

        // 检查是否落在起跳点
        if (this.utils.isJumpPoint(targetPosition)) {
            const nextJumpPoint = this.utils.getNextJumpPoint(targetPosition);
            if (nextJumpPoint) {
                // 检查跳子路径中是否有叠子阻挡
                const jumpPathStack = this.utils.checkStackInJumpPath(player, targetPosition, nextJumpPoint, gameState);
                if (jumpPathStack && jumpPathStack.hasStack) {
                    // 跳子路径被叠子阻挡，无法跳子，停在起跳点
                    console.log(`[跳子检测] 跳子路径被叠子阻挡，无法跳子，停在起跳点${targetPosition}`);
                    result.hasJump = false;
                    result.finalPosition = targetPosition;
                    result.jumpBlocked = true;
                    result.blockingStack = jumpPathStack;
                } else {
                    result.hasJump = true;
                    result.finalPosition = nextJumpPoint;
                    result.jumpType = 'normal';
                }
            }
        }

        // 检查特殊飞棋点
        if (targetPosition === 14 || targetPosition === 18) {
            // 检查位置53是否有对家叠子
            const stackCheckResult = this.utils.hasOpponentStackAtPosition53(player, gameState);
            if (!stackCheckResult.hasStack) {
                let flyTarget;
                if (targetPosition === 14) {
                    flyTarget = 30; // 14->18->30
                } else if (targetPosition === 18) {
                    flyTarget = 34; // 18->30->34
                }

                // 检查飞棋路径中是否有叠子阻挡
                const flyPathStack = this.utils.checkStackInJumpPath(player, targetPosition, flyTarget, gameState);
                if (flyPathStack && flyPathStack.hasStack) {
                    // 飞棋路径被叠子阻挡，无法飞棋，按普通跳子处理
                    console.log(`[飞棋检测] 飞棋路径被叠子阻挡，无法飞棋，按普通跳子处理`);
                    const normalJumpTarget = this.utils.getNextJumpPoint(targetPosition);
                    if (normalJumpTarget) {
                        result.hasJump = true;
                        result.finalPosition = normalJumpTarget;
                        result.jumpType = 'normal';
                        result.flyBlocked = true;
                        result.blockingStack = flyPathStack;
                    }
                } else {
                    result.hasJump = true;
                    result.jumpType = 'fly';
                    result.finalPosition = flyTarget;
                }
            }
        }

        return result;
    }

    /**
     * 获取当前玩家可移动的棋子列表
     */
    getMovableChess(player, diceValue) {
        const movableChess = [];
        const pieceCount = gameState.pieceCount || 4;

        for (let chessIdx = 0; chessIdx < pieceCount; chessIdx++) {
            const chess = gameState.getChessState(player, chessIdx);

            // 检查棋子是否可以移动（基本条件）
            if (this.chessPiece && this.chessPiece.canChessMove(player, chessIdx, diceValue)) {
                // 额外检查：是否是同一位置上最顶层的棋子
                if (this.chessPiece.isTopChessAtPosition(player, chessIdx, chess.position)) {
                    movableChess.push({
                        chessIndex: chessIdx,
                        chess: chess
                    });
                }
            }
        }

        return movableChess;
    }

    /**
     * 检查棋子是否在指定位置的最顶层
     */
    isTopChessAtPosition(player, chessIndex, position) {
        // 如果棋子在起始区域，直接返回true
        if (position === -1) return true;
        // 获取同一位置的己方棋子
        const samePositionChess = [];
        const pieceCount = gameState.pieceCount || 4;
        for (let i = 0; i < pieceCount; i++) {
            const chess = gameState.getPlayerChess()[player][i];
            if (!chess.finished && chess.position === position) {
                samePositionChess.push(i);
            }
        }

        // 如果只有一个棋子在这个位置，直接返回true
        if (samePositionChess.length <= 1) {
            return true;
        }

        // 最顶层的棋子是索引最大的那个
        const topChessIndex = Math.max(...samePositionChess);
        const isTop = chessIndex === topChessIndex;
        return isTop;
    }

    /**
     * 处理bot回合开始
     */
    async handleBotTurn() {
        const currentPlayer = gameState.getCurrentPlayer();
        const gamePhase = gameState.getGamePhase();

        // 如果开启了全局AI托管，则视为当前玩家可由AI代理，无论其是否是预设的bot玩家
        const isGlobalTakeover = gameState.getIsAITakeover();

        if (!this.isEnabled) {
            return;
        }

        // 检查游戏是否暂停
        if (gameState.getIsPaused()) {
            return;
        }

        // 如果既不是预设bot玩家，又没有开启全局AI托管，则不处理
        if (!this.isCurrentPlayerBot() && !isGlobalTakeover) {
            return;
        }

        // 防止重复触发：如果正在处理中，检查是否是相同的玩家和阶段
        if (this.isProcessing) {
            const isSameContext = this.lastProcessedPlayer === currentPlayer &&
                this.lastProcessedPhase === gamePhase;
            if (isSameContext) {
                return;
            }
        }

        // 设置处理标志
        this.isProcessing = true;
        this.lastProcessedPlayer = currentPlayer;
        this.lastProcessedPhase = gamePhase;

        try {
            // 传送门模式优先执行选棋，避免因阶段竞争误入掷骰分支
            if (window.gameInstance?.isTeleportMode || gameState.getDiceValue() === 999) {
                await this.autoSelectChess();
                return;
            }

            // 根据游戏阶段执行相应操作
            switch (gamePhase) {
                case 'waiting':
                case 'rolling':
                    await this.autoDiceRoll();
                    break;
                case 'selecting':
                    await this.autoSelectChess();
                    break;
            }
        } finally {
            // 延迟清除处理标志，确保异步操作完成
            setTimeout(() => {
                this.isProcessing = false;
            }, 300); // 300ms后清除标志，防止过快的重复触发
        }
    }

    /**
     * 检查路径上是否有其他玩家的棋子
     */
    checkOpponentInPath(player, fromPosition, toPosition) {
        let hasOpponent = false;
        const opponentPositions = [];

        // 检查从fromPosition+1到toPosition之间的每个位置
        for (let pos = fromPosition + 1; pos <= toPosition; pos++) {
            const absolutePos = this.utils.getAbsolutePosition(player, pos);

            // 检查其他玩家是否有棋子在这个位置
            for (let otherPlayer = 1; otherPlayer <= 4; otherPlayer++) {
                if (otherPlayer === player) continue;

                const otherPlayerChesses = gameState.getPlayerChess()[otherPlayer];
                for (let i = 0; i < otherPlayerChesses.length; i++) {
                    const otherChess = otherPlayerChesses[i];
                    if (otherChess.position >= 0) { // 棋子已出发
                        const otherAbsolutePos = this.utils.getAbsolutePosition(otherPlayer, otherChess.position);
                        if (otherAbsolutePos === absolutePos) {
                            hasOpponent = true;
                            opponentPositions.push({
                                player: otherPlayer,
                                position: pos,
                                absolutePosition: absolutePos
                            });
                        }
                    }
                }
            }
        }

        return {
            hasOpponent: hasOpponent,
            opponentPositions: opponentPositions
        };
    }

    /**
     * 检查棋子后方是否存在威胁（4格内直接威胁 + 10格内同色跳子威胁）
     * @param {number} player 当前玩家
     * @param {number} position 当前棋子在自己坐标系的相对位置
     */
    checkEnemyBehind(player, position) {
        // 只检查赛道上的棋子 (1-50)，0是起点安全区，51+无法到达位置
        if (position < 1 || position > 50) return { hasThreat: false, threatLevel: 0 };

        const currentAbsolutePos = this.utils.getAbsolutePosition(player, position);
        
        // 定义绝对坐标环线 (52格)
        const ABSOLUTE_LOOP = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 
            21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 
            41, 42, 43, 44, 45, 46, 47, 48, 49, 50, -3, -2
        ];
        
        const currentIndex = ABSOLUTE_LOOP.indexOf(currentAbsolutePos);
        if (currentIndex === -1) return { hasThreat: false, threatLevel: 0 };

        let threatCount = 0;

        // 1. 检查后方 1-10 格的潜在威胁
        for (let i = 1; i <= 10; i++) {
            let checkIndex = (currentIndex - i + 52) % 52;
            const checkAbsolutePos = ABSOLUTE_LOOP[checkIndex];

            // 遍历所有对手
            for (let otherPlayer = 1; otherPlayer <= 4; otherPlayer++) {
                if (otherPlayer === player) continue;

                const otherChesses = gameState.getPlayerChess()[otherPlayer];
                if (!otherChesses) continue;

                for (const otherChess of otherChesses) {
                    // 只有在赛道上的棋子才可能构成威胁
                    if (otherChess.position >= 0 && otherChess.position <= 50) {
                        const otherAbsolutePos = this.utils.getAbsolutePosition(otherPlayer, otherChess.position);
                        
                        if (otherAbsolutePos === checkAbsolutePos) {
                            // 排除逻辑：如果身后的敌人已经处于他自己坐标系的 47-50 格，无法构成威胁
                            if (otherChess.position >= 47 && otherChess.position <= 50) {
                                continue;
                            }

                            // 判定逻辑：
                            // A. 1-4 格：直接撞击威胁（任何颜色）
                            // B. 5-10 格：检查自身棋子所在位置，是否是该敌人的“起跳点”
                            if (i <= 4) {
                                threatCount++;
                            } else {
                                // 检查当前棋子所在位置在敌人坐标系下是否是起跳点
                                if (this.utils.isJumpPoint(otherChess.position + i)) {
                                    threatCount++;
                                }
                            }
                        }
                    }
                }
            }
        }
        return {
            hasThreat: threatCount > 0,
            threatLevel: threatCount
        };
    }
}

// 创建全局实例
export const botController = new BotController();
