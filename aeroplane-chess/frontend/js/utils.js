// 工具函数模块
// 包含位置转换、特殊位置判断、绝对位置计算等纯函数

// 判断是否为起跳点
export function isJumpPoint(position) {
    // 普通起跳点：2, 6, 10, 14, 22, 26, 30, 34, 38, 42, 46
    // 位置18在正常情况下是特殊飞棋点，但在叠子阻挡情况下会被当作普通起跳点处理
    // 排除位置50（准备进入终点区域）
    const jumpPoints = [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46];
    return jumpPoints.includes(position);
}

// 获取下一个起跳点（跳到下一个起跳点位置）
export function getNextJumpPoint(currentPosition) {
    // 处理特殊情况
    if (currentPosition === 46) {
        return 50;
    }
    // 从当前位置开始寻找下一个起跳点
    for (let pos = currentPosition + 1; pos <= 50; pos++) {
        if (isJumpPoint(pos)) {
            return pos;
        }
    }
    return null; // 没有下一个起跳点
}

// 根据棋子在轨道上的位置计算应该的旋转角度
export function getChessRotationAtPosition(position) {
    // 特定位置的旋转角度（拐角处）
    const specificRotations = {
        1: -90,   // 逆时针转90度
        5: -90,   // 逆时针转90度
        8: 90,    // 顺时针转90度
        14: 90,   // 顺时针转90度
        19: -90,  // 逆时针转90度
        21: 90,   // 顺时针转90度
        27: 90,   // 顺时针转90度
        30: -90,  // 逆时针转90度
        34: 90,   // 顺时针转90度
        40: 90,   // 顺时针转90度
        44: -90,  // 逆时针转90度
        47: 90,    // 顺时针转90度
        50: 90
    };

    // 累积旋转角度
    let totalRotation = 0;

    // 遍历所有已经过的拐角位置，累积旋转角度
    for (let pos = 1; pos <= position; pos++) {
        if (specificRotations.hasOwnProperty(pos)) {
            totalRotation += specificRotations[pos];
        }
    }

    return totalRotation;
}

// 将玩家的相对位置转换为绝对轨道位置（以玩家1为参考）
export function getAbsolutePosition(player, relativePosition) {
    if (relativePosition === -1) return -1; // 起始区域
    if (relativePosition >= 51) return relativePosition; // 终点通道（51及以上），每个玩家独立，不参与beat检测
    if (relativePosition === 0) return 0; // 所有玩家的起点都是位置0

    // 根据映射关系.txt的规则进行转换
    if (player === 1) {
        // 玩家1的绝对位置就是其相对位置
        return relativePosition;
    } else if (player === 4) {
        // 玩家4的转换规则
        if (relativePosition >= 14) {
            return relativePosition - 13;
        } else if (relativePosition >= 1 && relativePosition <= 11) {
            return relativePosition + 39;
        } else if (relativePosition === 12) {
            return -3; // 玩家1到不了的位置
        } else if (relativePosition === 13) {
            return -2 // 玩家1到不了的位置
        }
    } else if (player === 3) {
        // 玩家3的转换规则
        if (relativePosition >= 1 && relativePosition <= 24) {
            return relativePosition + 26;
        } else if (relativePosition === 25) {
            return -3; // 玩家1到不了的位置
        } else if (relativePosition === 26) {
            return -2;// 玩家1到不了的位置
        }
        else if (relativePosition >= 27) {
            return relativePosition - 26;
        }
    } else if (player === 2) {
        // 玩家2的转换规则
        if (relativePosition >= 1 && relativePosition <= 37) {
            return relativePosition + 13;
        } else if (relativePosition === 38) {
            return -3; // 玩家1到不了的位置
        } else if (relativePosition === 39) {
            return -2;// 玩家1到不了的位置
        }
        else if (relativePosition >= 40) {
            return relativePosition - 39;
        }
    }

    return relativePosition; // 默认返回原位置
}

// 检查指定绝对 position 是否有其他玩家的棋子
export function getChessAtAbsolutePosition(absolutePosition, gameState) {
    if (absolutePosition === -1) return null; // 起始区域不会发生碰撞

    // 兼容处理：如果gameState有getPlayerChess方法，使用它；否则直接使用playerChess属性
    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4

    for (let player = 1; player <= 4; player++) {
        for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
            const chess = playerChess[player][chessIndex];
            if (chess.finished || chess.position === -1) continue;

            const chessAbsolutePos = getAbsolutePosition(player, chess.position);

            if (chessAbsolutePos === absolutePosition) {
                return { player, chessIndex, chess };
            }
        }
    }
    return null;
}
// 执行beat操作：将目标位置的对手棋子打回起点
// isRemoteDiceMove 用于标记本次移动是否来源于遥控/道具骰子
export async function beatChessAtPosition(absolutePosition, currentPlayer, gameState = null, moveChessToStartCallback = null, showBeatInfo = true, executeStateUpdate = true, isRemoteDiceMove = false, allowFinishLaneBeat = false, energyDelay = 0) {
    // 如果没有传入gameState，使用全局gameState
    if (!gameState) {
        const { gameState: globalGameState } = await import('./gameState.js');
        gameState = globalGameState;
    }

    // 导入gameInfo用于显示beat信息
    const { gameInfo } = await import('./gameInfo.js');

    // 只在外圈轨道（0-50 以及玩家1到不了的位置-2和-3，排除基地-1）检查beat操作
    // 位置51及以上（终点航道）每个玩家独立，不应该有beat检测
    if (absolutePosition === -1 || (!allowFinishLaneBeat && absolutePosition >= 51)) {
        return { hasBeat: false };
    }

    // 直接遍历查找"其他玩家"的棋子，避免把当前玩家刚落下的棋子误判为目标
    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4
    let targetChess = null;
    for (let player = 1; player <= 4 && !targetChess; player++) {
        if (player === currentPlayer) continue; // 跳过当前玩家
        for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
            const chess = playerChess[player][chessIndex];
            if (chess.finished || chess.position === -1) continue;
            const chessAbsolutePos = getAbsolutePosition(player, chess.position);
            if (chessAbsolutePos === absolutePosition) {
                targetChess = { player, chessIndex, chess };
                break;
            }
        }
    }

    if (targetChess) {
        console.log(`[Beat检测] 玩家${currentPlayer}打败玩家${targetChess.player}的棋子${targetChess.chessIndex}`);

        // 只有在executeStateUpdate为true时才执行状态更新和动画
        if (executeStateUpdate) {
            // 添加beat信息到游戏信息面板
            if (showBeatInfo) {
                gameInfo.addChessBeat(currentPlayer, targetChess.player, targetChess.chessIndex, false, isRemoteDiceMove);
            }

            // 增加击败次数统计
            gameState.incrementDefeatCount(currentPlayer, targetChess.player);

            // 计算并增加积分（如果启用道具模式）
            // 遥控/道具骰子击败不获得积分，以免过强
            if (!isRemoteDiceMove) {
                // 需要在棋子重置之前计算完成度损失
                const targetChessObj = gameState.getPlayerChess()[targetChess.player][targetChess.chessIndex];
                const progressBeforeBeat = calculateChessProgress(targetChessObj, targetChess.player);

                // 导入积分管理器
                const { energyManager } = await import('./energyManager.js');
                if (energyManager.isSkillModeEnabled()) {
                    // 被击败后的进度为0（回到起点）
                    const progressAfterBeat = 0;
                    const progressLoss = progressBeforeBeat - progressAfterBeat;

                    // 增加积分
                    energyManager.addEnergyFromBeat(currentPlayer, progressLoss, targetChess.player, targetChess.chessIndex, energyDelay);

                    console.log(`[积分系统] 玩家${currentPlayer}击败玩家${targetChess.player}的棋子，完成度损失${progressLoss.toFixed(2)}%，获得积分`);
                }
            }

            // 将对手棋子重置到起始区域
            gameState.updateChessPosition(targetChess.player, targetChess.chessIndex, -1);
            gameState.setChessFinished(targetChess.player, targetChess.chessIndex, false);

            // 调用回调函数移动棋子到起始位置
            if (moveChessToStartCallback) {
                moveChessToStartCallback(targetChess.player, targetChess.chessIndex);
            }
        }

        return { hasBeat: true, targetPlayer: targetChess.player, targetChessIndex: targetChess.chessIndex }; // 返回beat信息
    } else {
        return { hasBeat: false }; // 没有发生beat操作
    }
}
/**
 * 计算单个棋子的完成度（百分比）
 * @param {Object} chess - 棋子对象
 * @param {number} player - 玩家编号
 * @returns {number} 完成度（0-100）
 */
export function calculateChessProgress(chess, player) {
    // 如果棋子已完成
    if (chess.finished) {
        return 100;
    }

    // 如果棋子还在基地
    if (chess.position === -1) {
        return 0;
    }

    // 计算棋子的进度
    // 外圈轨道: 0-50 (51格)
    // 终点航道: 51-56 (6格)
    // 总共57格
    const totalSteps = 57;
    let currentSteps = 0;

    if (chess.position >= 0 && chess.position <= 50) {
        // 外圈轨道
        currentSteps = chess.position;
    } else if (chess.position >= 51 && chess.position <= 56) {
        // 终点航道
        currentSteps = 51 + (chess.position - 51);
    }

    // 计算百分比
    const progress = (currentSteps / totalSteps) * 100;
    return Math.min(100, Math.max(0, progress));
}

// 获取对家玩家编号（1-3, 2-4对应关系）
export function getOpponentPlayer(player) {
    const opponents = { 1: 3, 2: 4, 3: 1, 4: 2 };
    return opponents[player];
}

// 检查指定玩家的位置53是否有棋子
export function hasChessAtPosition53(player, gameState = null) {
    // 如果没有传入gameState，使用全局gameState
    if (!gameState) {
        // 动态导入以避免循环依赖
        import('./gameState.js').then(module => {
            gameState = module.gameState;
        });
        if (!gameState) return false;
    }

    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4

    // 检查该玩家是否有棋子在位置53
    for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
        const chess = playerChess[player][chessIndex];
        if (!chess.finished && chess.position === 53) {
            return { hasChess: true, chessIndex, chess };
        }
    }

    return { hasChess: false };
}

/**
 * 检查位置53是否有对家的叠子（用于飞棋阻挡检测）
 * @param {string} currentPlayer - 当前玩家
 * @param {Object} gameState - 游戏状态
 * @returns {Object} - 返回检测结果 { hasStack: boolean, stackInfo: Object|null }
 */
export function hasOpponentStackAtPosition53(currentPlayer, gameState) {
    // 位置53的绝对坐标就是53
    const absolutePosition = 53;

    // 使用现有的叠子检测函数
    const stackInfo = isStackAtAbsolutePosition(absolutePosition, gameState);

    if (stackInfo && stackInfo.chessList.length >= 2) {
        // 检查叠子是否属于对家
        const opponentPlayer = getOpponentPlayer(currentPlayer);
        const isOpponentStack = stackInfo.chessList.every(item => item.player === opponentPlayer);

        if (isOpponentStack) {
            console.log(`[飞棋阻挡] 位置53存在对家${opponentPlayer}的叠子，共${stackInfo.chessList.length}颗棋子`);
            return { hasStack: true, stackInfo };
        }
    }

    return { hasStack: false, stackInfo: null };
}

// 判断指定绝对位置是否为叠子（同一玩家的两个或多个棋子在同一位置）
export function isStackAtAbsolutePosition(absolutePosition, gameState) {
    if (absolutePosition === -1 || absolutePosition < 0) return null;

    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4

    // 统计每个玩家在该位置的棋子数量
    for (let player = 1; player <= 4; player++) {
        const chessAtPosition = [];

        for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
            const chess = playerChess[player][chessIndex];
            if (chess.finished || chess.position === -1) continue;

            const chessAbsolutePos = getAbsolutePosition(player, chess.position);
            if (chessAbsolutePos === absolutePosition) {
                chessAtPosition.push({ player, chessIndex, chess });
            }
        }

        // 如果该玩家在此位置有2个或以上棋子，则为叠子
        if (chessAtPosition.length >= 2) {
            return {
                isStack: true,
                player: player,
                chessCount: chessAtPosition.length,
                chessList: chessAtPosition
            };
        }
    }

    return null;
}

// 检测前方路径上是否有其他玩家的叠子
export function checkStackInPath(currentPlayer, currentPosition, steps, gameState) {
    // 只检测外圈轨道（1-50）上的叠子，但允许从位置0出发进行检测
    // 如果当前位置小于0或大于等于51，且不是从位置0出发，则跳过检测
    if (currentPosition < 0 || (currentPosition >= 51 && currentPosition !== 0)) {
        return null;
    }

    // 检查路径上的每一步
    for (let step = 1; step <= steps; step++) {
        const nextPosition = currentPosition + step;

        // 如果超出外圈轨道或到达位置0，停止检测
        if (nextPosition <= 0 || nextPosition > 50) {
            break;
        }

        const nextAbsolutePos = getAbsolutePosition(currentPlayer, nextPosition);
        const stackInfo = isStackAtAbsolutePosition(nextAbsolutePos, gameState);

        if (stackInfo && stackInfo.player !== currentPlayer) {
            console.log(`[叠子阻挡] 在位置${nextPosition}发现玩家${stackInfo.player}的叠子`);

            // 判断是刚好到达叠子位置还是需要反弹
            const isExactHit = (step === steps); // 刚好到达叠子位置，撞机
            const needsBounce = (step < steps); // 投出点数大于叠子距离，需要反弹

            return {
                stackPosition: nextPosition,
                stackAbsolutePosition: nextAbsolutePos,
                stackPlayer: stackInfo.player,
                stackInfo: stackInfo, // 包含叠子的详细信息
                distanceToStack: step,
                remainingSteps: steps - step,
                isExactHit: isExactHit, // 是否刚好到达叠子位置（撞机）
                needsBounce: needsBounce // 是否需要反弹
            };
        }
    }

    return null;
}

// 创建工具函数对象并导出
// 检测跳子路径中是否有叠子（不包括起点和终点）
export function checkStackInJumpPath(currentPlayer, startPosition, endPosition, gameState) {
    // 位置0不检测
    if (startPosition <= 0 || endPosition <= 0) {
        return null;
    }

    // 检查跳子路径中的每一个位置（不包括起点和终点）
    const minPos = Math.min(startPosition, endPosition);
    const maxPos = Math.max(startPosition, endPosition);

    for (let position = minPos + 1; position < maxPos; position++) {
        const absolutePos = getAbsolutePosition(currentPlayer, position);
        const stackInfo = isStackAtAbsolutePosition(absolutePos, gameState);

        if (stackInfo && stackInfo.player !== currentPlayer) {
            console.log(`[跳子阻挡] 在位置${position}发现玩家${stackInfo.player}的叠子`);
            return {
                hasStack: true,
                stackPosition: position,
                stackAbsolutePosition: absolutePos,
                stackPlayer: stackInfo.player,
                stackInfo: stackInfo
            };
        }
    }

    return null;
}

export const utils = {
    isJumpPoint,
    getNextJumpPoint,
    getChessRotationAtPosition,
    getAbsolutePosition,
    getChessAtAbsolutePosition,
    beatChessAtPosition,
    getOpponentPlayer,
    hasChessAtPosition53,
    hasOpponentStackAtPosition53,
    isStackAtAbsolutePosition,
    checkStackInPath,
    checkStackInJumpPath
};