/**
 * 积分管理器 - 处理道具模式下的积分系统
 * 仅在联机模式且启用道具模式时生效
 */

import { gameState } from './gameState.js';

class EnergyManager {
    constructor() {
        this.skillModeEnabled = false;
        this.maxEnergy = 100;

        // 新的积分配置
        this.baseEnergy = 15;           // 基础保底积分
        this.progressCoefficient = 0.85; // 完成度系数

        // 根据棋子数量的倍率
        this.pieceCountMultipliers = {
            2: 1.35,  // 2子模式：1.35倍
            3: 1.15,  // 3子模式：1.15倍
            4: 1.0    // 4子模式：1.0倍（基准）
        };

        this.playerEnergy = {
            1: 0,
            2: 0,
            3: 0,
            4: 0
        };
        this.energyDisplay = null; // 将在初始化时设置
    }

    /**
     * 初始化积分系统
     */
    init() {
        // 检查是否启用道具模式
        try {
            const gameConfigStr = sessionStorage.getItem('gameConfig');
            if (gameConfigStr) {
                const gameConfig = JSON.parse(gameConfigStr);
                this.skillModeEnabled = gameConfig.skillMode === true;
            } else {
                this.skillModeEnabled = false;
            }
        } catch (error) {
            console.error('[积分系统] 初始化失败:', error);
            this.skillModeEnabled = false;
        }

        // 重置所有玩家积分
        if (this.skillModeEnabled) {
            this.resetAllEnergy();
        }
    }

    /**
     * 检查是否启用道具模式
     */
    isSkillModeEnabled() {
        return this.skillModeEnabled;
    }

    /**
     * 设置积分显示模块引用
     */
    setEnergyDisplay(energyDisplay) {
        this.energyDisplay = energyDisplay;
    }

    /**
     * 计算从击败中获得的积分
     * 基于被击败玩家损失的完成度百分比
     * @param {number} targetPlayer - 被击败的玩家编号
     * @param {number} progressBefore - 击败前的完成度
     * @param {number} progressAfter - 击败后的完成度
     * @returns {number} 获得的积分值
     */
    calculateEnergyGain(targetPlayer, progressBefore, progressAfter) {
        if (!this.skillModeEnabled) {
            return 0;
        }

        // 计算损失的完成度百分比
        const progressLoss = progressBefore - progressAfter;

        if (progressLoss <= 0) {
            console.warn('完成度损失为0或负数，不获得积分');
            return 0;
        }

        // 积分转换公式：损失1%完成度 = 1积分
        const energyGain = progressLoss * this.energyCoefficient;

        console.log(`积分计算: 玩家${targetPlayer} 损失${progressLoss.toFixed(2)}%完成度 -> 获得${energyGain.toFixed(2)}积分`);

        return Math.round(energyGain * 100) / 100; // 保留两位小数
    }

    /**
     * 增加玩家积分
     * @param {number} player - 玩家编号
     * @param {number} amount - 增加的积分值
     * @param {string} source - 积分来源 ('kill', 'mysteryBox')
     * @param {number} targetPlayer - 被击败的玩家（可选）
     * @param {number} targetChessIndex - 被击败的棋子索引（可选）
     * @param {number} delay - 粒子动画延迟（可选）
     */
    addEnergy(player, amount, source = 'mysteryBox', targetPlayer = null, targetChessIndex = null, delay = 0) {
        if (!this.skillModeEnabled) {
            return;
        }

        const oldEnergy = this.playerEnergy[player];
        this.playerEnergy[player] = Math.min(oldEnergy + amount, this.maxEnergy);

        console.log(`玩家${player}积分增加: ${oldEnergy.toFixed(1)} -> ${this.playerEnergy[player].toFixed(1)} (+${amount.toFixed(1)})`);

        // 发送积分获取的gameInfo消息
        if (window.gameInfo) {
            window.gameInfo.addEnergyGain(player, Math.round(amount), false, source, targetPlayer, targetChessIndex);
        }

        // 更新UI显示
        if (this.energyDisplay) {
            // 如果是因为击杀获得积分，且知道目标，则播放粒子动画并延迟更新进度条
            if (source === 'kill' && targetPlayer !== null && targetChessIndex !== null) {
                const startSource = this.energyDisplay.getChessCenterPosition(targetPlayer, targetChessIndex) || targetPlayer;
                this.energyDisplay.playEnergyParticles(startSource, targetChessIndex, player, () => {
                    this.energyDisplay.updateEnergyBar(player, this.playerEnergy[player]);
                    this.energyDisplay.showEnergyGainAnimation(player, amount);

                    // 检查是否达到满积分
                    if (this.isEnergyFull(player) && oldEnergy < this.maxEnergy) {
                        this.energyDisplay.triggerFullEnergyEffect(player);
                    }
                }, amount, delay);
            } else if (source === 'mysteryBox' && amount > 0) {
                // 如果是盲盒获取积分，获取骰子元素作为起点
                const diceIcon = document.querySelector('.dice-icon');
                if (diceIcon) {
                    this.energyDisplay.playEnergyParticles(diceIcon, null, player, () => {
                        this.energyDisplay.updateEnergyBar(player, this.playerEnergy[player]);
                        this.energyDisplay.showEnergyGainAnimation(player, amount);

                        // 检查是否达到满积分
                        if (this.isEnergyFull(player) && oldEnergy < this.maxEnergy) {
                            this.energyDisplay.triggerFullEnergyEffect(player);
                        }
                    }, amount);
                } else {
                    this.energyDisplay.updateEnergyBar(player, this.playerEnergy[player]);
                    this.energyDisplay.showEnergyGainAnimation(player, amount);

                    if (this.isEnergyFull(player) && oldEnergy < this.maxEnergy) {
                        this.energyDisplay.triggerFullEnergyEffect(player);
                    }
                }
            } else {
                this.energyDisplay.updateEnergyBar(player, this.playerEnergy[player]);
                this.energyDisplay.showEnergyGainAnimation(player, amount);

                // 检查是否达到满积分
                if (this.isEnergyFull(player) && oldEnergy < this.maxEnergy) {
                    this.energyDisplay.triggerFullEnergyEffect(player);
                }
            }
        }

        // 在线模式下同步到其他客户端
        this.syncEnergyChange(player, this.playerEnergy[player], amount, source, targetPlayer, targetChessIndex);

        // 更新道具可用性
        this.updateSkillAvailability();
    }

    /**
     * 从击败操作中增加积分（新公式）
     * @param {number} player - 玩家编号
     * @param {number} progressLoss - 对手损失的完成度百分比 (0-100)
     * @param {number} targetPlayer - 被击败的玩家
     * @param {number} targetChessIndex - 被击败的棋子索引
     * @param {number} delay - 粒子动画延迟
     */
    addEnergyFromBeat(player, progressLoss, targetPlayer = null, targetChessIndex = null, delay = 0) {
        if (!this.skillModeEnabled) {
            return;
        }

        // 获取当前棋子数量
        const pieceCount = gameState.pieceCount || 4;
        const multiplier = this.pieceCountMultipliers[pieceCount] || 1.0;

        // 新公式：(基础积分 + 完成度加成) × 棋子数量系数
        const baseReward = this.baseEnergy;
        const progressBonus = progressLoss * this.progressCoefficient;
        const rawEnergy = (baseReward + progressBonus) * multiplier;

        // 确保积分获得不超过上限
        const energyGain = Math.min(rawEnergy, this.maxEnergy);

        // 调用基础方法增加积分，设置来源为 'kill'
        this.addEnergy(player, energyGain, 'kill', targetPlayer, targetChessIndex, delay);
    }

    /**
     * 获取玩家当前积分
     * @param {number} player - 玩家编号
     * @returns {number} 积分值
     */
    getEnergy(player) {
        return this.playerEnergy[player] || 0;
    }

    /**
     * 设置玩家积分（用于同步）
     * @param {number} player - 玩家编号
     * @param {number} energy - 积分值
     * @param {boolean} skipDisplay - 是否跳过UI更新
     */
    setEnergy(player, energy, skipDisplay = false) {
        if (!this.skillModeEnabled) {
            return;
        }

        const oldEnergy = this.playerEnergy[player];
        this.playerEnergy[player] = Math.min(energy, this.maxEnergy);

        if (!skipDisplay && this.energyDisplay) {
            this.energyDisplay.updateEnergyBar(player, this.playerEnergy[player]);

            // 检查是否达到满积分
            if (this.isEnergyFull(player) && oldEnergy < this.maxEnergy) {
                this.energyDisplay.triggerFullEnergyEffect(player);
            }
        }
    }

    /**
     * 检查积分是否已满
     * @param {number} player - 玩家编号
     * @returns {boolean} 是否已满
     */
    isEnergyFull(player) {
        return this.playerEnergy[player] >= this.maxEnergy;
    }

    /**
     * 消耗积分（使用道具时）
     * @param {number} player - 玩家编号
     * @param {number} amount - 消耗的积分值
     * @returns {boolean} 是否成功消耗
     */
    consumeEnergy(player, amount) {
        if (!this.skillModeEnabled) {
            return false;
        }

        if (this.playerEnergy[player] < amount) {
            console.warn(`玩家${player}积分不足: ${this.playerEnergy[player]} < ${amount}`);
            return false;
        }

        this.playerEnergy[player] -= amount;
        console.log(`玩家${player}消耗积分: ${amount}, 剩余: ${this.playerEnergy[player]}`);

        // 更新UI显示
        if (this.energyDisplay) {
            this.energyDisplay.updateEnergyBar(player, this.playerEnergy[player]);
        }

        // 同步到其他客户端
        this.syncEnergyChange(player, this.playerEnergy[player], -amount);

        // 更新道具可用性
        this.updateSkillAvailability();

        return true;
    }

    /**
     * 重置所有玩家积分
     */
    resetAllEnergy() {
        for (let player = 1; player <= 4; player++) {
            this.playerEnergy[player] = 0;
        }
    }

    /**
     * 重置单个玩家积分
     * @param {number} player - 玩家编号
     */
    resetEnergy(player) {
        this.playerEnergy[player] = 0;
        if (this.energyDisplay) {
            this.energyDisplay.updateEnergyBar(player, 0);
        }
    }

    /**
     * 同步积分变化到其他客户端
     * @param {number} player - 玩家编号
     * @param {number} energy - 当前积分值
     * @param {number} change - 变化量
     * @param {string} source - 积分来源
     * @param {number} targetPlayer - 目标玩家
     * @param {number} targetChessIndex - 目标棋子
     */
    syncEnergyChange(player, energy, change = 0, source = null, targetPlayer = null, targetChessIndex = null) {
        if (!this.skillModeEnabled) {
            return;
        }

        // 只在在线多人模式下同步到其他客户端
        // 本地多人和人机模式不需要网络同步
        if (window.gameInstance && window.gameInstance.multiplayerGameManager &&
            window.gameInstance.multiplayerGameManager.isOnlineMode) {

            window.gameInstance.multiplayerGameManager.syncEnergyChange(player, energy, change, source, targetPlayer, targetChessIndex);
        }
    }

    /**
     * 获取所有玩家的积分状态（用于断线重连）
     */
    getAllEnergyStates() {
        return { ...this.playerEnergy };
    }

    /**
     * 恢复所有玩家的积分状态（用于断线重连）
     * @param {Object} energyStates - 积分状态对象
     */
    restoreAllEnergyStates(energyStates) {
        if (!energyStates) {
            return;
        }

        for (const [player, energy] of Object.entries(energyStates)) {
            const playerNum = parseInt(player);
            if (playerNum >= 1 && playerNum <= 4) {
                this.setEnergy(playerNum, energy);
            }
        }

        console.log('积分状态已恢复:', energyStates);
    }

    /**
     * 更新道具可用性（调用skillManager）
     */
    updateSkillAvailability() {
        if (window.gameInstance && window.gameInstance.skillManager) {
            window.gameInstance.skillManager.updateSkillAvailability();
        }
    }
}

// 创建全局实例
export const energyManager = new EnergyManager();
export default EnergyManager;
