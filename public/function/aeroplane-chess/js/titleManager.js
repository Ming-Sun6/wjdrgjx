/**
 * 称号管理器 - 负责计算和分配玩家结算称号
 * 称号优先级：概率称号 > 唯一称号 > 默认称号
 */
import { activePlayerManager } from './activePlayerManager.js';

class TitleManager {
    constructor() {
        // 称号配置
        this.TITLES = {
            // 概率称号 (优先级 1)
            PROBABILITY: {
                REVERSE_LUCKY: { id: 'reverse_lucky', name: '反向欧皇', desc: '连着三回合都投出 1 点' },
                UNLUCKY_START: { id: 'unlucky_takeoff', name: '非酋', desc: '连着三回合无法起飞' },
                LUCKY_KING: { id: 'lucky_king', name: '欧皇', desc: '连投三次 6' },
                INVISIBLE: { id: 'invisible', name: '不死传说', desc: '整局未被击败过' },
                TAILWIND_WALKER: { id: 'tailwind_walker', name: '顺风行者', desc: '在整局未发生过反弹的情况下获胜' },
                BOUNCE_KING: { id: 'wind_walker', name: '逆风行者', desc: '反弹总格数超过 50 格' }
            },
            // 唯一称号 (优先级 2)
            UNIQUE: {
                MARATHON: { id: 'marathon', name: '长跑冠军', desc: '移动格数全场最多' },
                SPEED_LEGEND: { id: 'speed_legend', name: '最速传说', desc: '首个使棋子抵达终点' },
                SIX_MASTER: { id: 'six_master', name: '六点狂魔', desc: '投出 6 的次数全场最多' },
                KILLER: { id: 'killer', name: '收割者', desc: '击败对手次数最多' },
                HOME_VISITOR: { id: 'home_visitor', name: '回家常客', desc: '被对手击败次数最多' },
                CHESS_KING: { id: 'chess_king', name: '棋王', desc: '本局第一名' },
                COMEBACK: { id: 'comeback', name: '逆风翻盘', desc: '整局 60% 时间处于垫底，最后反败为胜' },
                STEADY_DOG: { id: 'steady_dog', name: '避战大师', desc: '被击败次数全场最少' }
            },
            // 默认称号
            DEFAULT: { id: 'default', name: '平凡棋手', desc: '平平淡淡才是真' }
        };
    }

    /**
     * 计算所有玩家的称号
     * @param {Object} gameState - 游戏状态对象
     * @param {Array} rankings - 排名数据 [{player: 1, position: 1, ...}]
     * @returns {Object} { playerNumber: { name, desc } }
     */
    calculateTitles(gameState, rankings) {
        const playerTitles = {};
        const activePlayers = activePlayerManager.getActivePlayers();
        
        // 预计算一些统计数据
        const stats = this._prepareStats(gameState, activePlayers, rankings);

        // 为每个玩家确定称号
        activePlayers.forEach(player => {
            playerTitles[player] = this._determinePlayerTitle(player, gameState, stats, rankings);
        });

        return playerTitles;
    }

    /**
     * 预计算统计数据，用于唯一称号判定
     */
    _prepareStats(gameState, activePlayers, rankings) {
        const stats = {
            totalDistances: {},
            diceSixCounts: {},
            defeatOthersCounts: {},
            beenDefeatedCounts: {},
            firstFinished: gameState.titleStats.firstFinishedPlayer
        };

        activePlayers.forEach(player => {
            // 前进距离
            stats.totalDistances[player] = gameState.getTotalDistance(player);
            
            // 6点次数
            stats.diceSixCounts[player] = gameState.diceStatistics[player]?.[6] || 0;
            
            // 击败他人次数
            let defeatOthers = 0;
            for (let target = 1; target <= 4; target++) {
                if (target !== player) {
                    defeatOthers += gameState.defeatCounts[player]?.[target] || 0;
                }
            }
            stats.defeatOthersCounts[player] = defeatOthers;

            // 被击败次数 (从其他玩家的 defeatCounts 中汇总)
            let beenDefeated = 0;
            activePlayers.forEach(other => {
                if (other !== player) {
                    beenDefeated += gameState.defeatCounts[other]?.[player] || 0;
                }
            });
            stats.beenDefeatedCounts[player] = beenDefeated;
        });

        return stats;
    }

    /**
     * 为单个玩家确定优先级最高的称号
     */
    _determinePlayerTitle(player, gameState, stats, rankings) {
        const titleStats = gameState.titleStats;
        const ranking = rankings.find(r => r.player === player);

        // --- 1. 概率称号 (最高优先级) ---

        // 反向欧皇：连着三回合 1 点
        if (titleStats.consecutiveOnes[player] >= 3) {
            return this.TITLES.PROBABILITY.REVERSE_LUCKY;
        }

        // 非酋：连着三回合无法起飞
        if (titleStats.consecutiveNoTakeoff[player] >= 3) {
            return this.TITLES.PROBABILITY.UNLUCKY_START;
        }

        // 欧皇：连投三次 6
        if (titleStats.maxConsecutiveSixes[player] >= 3) {
            return this.TITLES.PROBABILITY.LUCKY_KING;
        }

        // 不死传说：整局未被击败过
        if (stats.beenDefeatedCounts[player] === 0) {
            return this.TITLES.PROBABILITY.INVISIBLE;
        }

        // 顺风行者：整局未发生过反弹且获胜（第一名）
        if (titleStats.bounceSteps && titleStats.bounceSteps[player] === 0 && ranking && ranking.position === 1) {
            return this.TITLES.PROBABILITY.TAILWIND_WALKER;
        }

        // 逆风行者：反弹格数超过 50 格
        if (titleStats.bounceSteps && titleStats.bounceSteps[player] > 50) {
            return this.TITLES.PROBABILITY.BOUNCE_KING;
        }

        // --- 2. 唯一称号 ---
        // 唯一称号需要是全场之最，且可能存在并列。如果并列，则按顺序检查下一个可能的唯一称号。

        // 最速传说 (首个完成)
        if (stats.firstFinished === player) {
            return this.TITLES.UNIQUE.SPEED_LEGEND;
        }

        // 长跑冠军 (距离最多)
        if (this._isMax(player, stats.totalDistances) && stats.totalDistances[player] > 0) {
            return this.TITLES.UNIQUE.MARATHON;
        }

        // 收割者 (击败最多)
        if (this._isMax(player, stats.defeatOthersCounts) && stats.defeatOthersCounts[player] > 0) {
            return this.TITLES.UNIQUE.KILLER;
        }

        // 六点狂魔 (6点最多)
        if (this._isMax(player, stats.diceSixCounts) && stats.diceSixCounts[player] > 0) {
            return this.TITLES.UNIQUE.SIX_MASTER;
        }

        // 回家常客 (被击败最多)
        if (this._isMax(player, stats.beenDefeatedCounts) && stats.beenDefeatedCounts[player] > 0) {
            return this.TITLES.UNIQUE.HOME_VISITOR;
        }

        // 避战大师 (被击败最少，且不为0)
        if (this._isMin(player, stats.beenDefeatedCounts) && stats.beenDefeatedCounts[player] > 0) {
            return this.TITLES.UNIQUE.STEADY_DOG;
        }

        // 逆风翻盘 (冠军，且在超过 60% 的历史快照中处于落后位置)
        if (ranking && ranking.position === 1 && gameState.progressHistory && gameState.progressHistory.length >= 5) {
            const history = gameState.progressHistory;
            const activePlayers = activePlayerManager.getActivePlayers();
            let behindCount = 0;

            history.forEach(snapshot => {
                const playerProgress = snapshot.players[player] || 0;
                const progresses = Object.values(snapshot.players);
                const minProgress = Math.min(...progresses);
                
                // 如果当前进度是全场最低，视为处于垫底状态
                if (playerProgress === minProgress) {
                    behindCount++;
                }
            });

            // 如果垫底状态占了 60% 以上的回合快照
            if (behindCount / history.length >= 0.6) {
                return this.TITLES.UNIQUE.COMEBACK;
            }
        }

        // 棋王 (第一名)
        if (ranking && ranking.position === 1) {
            return this.TITLES.UNIQUE.CHESS_KING;
        }

        // --- 3. 默认称号 ---
        return this.TITLES.DEFAULT;
    }

    /**
     * 辅助方法：检查玩家是否为统计中的最大值
     */
    _isMax(player, statsMap) {
        const values = Object.values(statsMap);
        const max = Math.max(...values);
        return statsMap[player] === max && max > 0;
    }

    /**
     * 辅助方法：检查玩家是否为统计中的最小值
     */
    _isMin(player, statsMap) {
        const values = Object.values(statsMap);
        const min = Math.min(...values);
        return statsMap[player] === min;
    }
}

export const titleManager = new TitleManager();
