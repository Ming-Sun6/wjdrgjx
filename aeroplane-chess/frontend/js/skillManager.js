/**
 * 道具管理器 - 处理道具UI交互
 */

import { energyManager } from './energyManager.js';
import { gameState } from './gameState.js';
import { gameInfo } from './gameInfo.js';

class SkillManager {
    constructor() {
        this.skillPanel = null;
        this.skillBtn = null;
        this.skillEnergyText = null;
        this.isPanelOpen = false;
        this.currentNotification = null;
        this.notificationTimeout = null;
        this.hintTimer = null;
        this.notificationAnchorCenterX = null;
        this.layoutCompensationX = 0;
    }

    /**
     * 初始化道具管理器
     */
    init() {
        // 检查是否启用道具模式
        const isSpectator = window.multiplayerGameManager && window.multiplayerGameManager.isSpectator;
        if (!energyManager.isSkillModeEnabled() || isSpectator) {
            // 隐藏道具按钮
            const skillBtn = document.getElementById('skillBtn');
            if (skillBtn) {
                skillBtn.classList.add('is-hidden');
                skillBtn.style.display = 'none';
            }
            return;
        }

        this.skillPanel = document.getElementById('skillPanel');
        this.skillBtn = document.getElementById('skillBtn');
        this.skillEnergyText = document.getElementById('skillEnergyText');

        if (!this.skillPanel || !this.skillBtn) {
            return;
        }
        // 绑定道具按钮点击事件
        this.skillBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });

        // 绑定道具项点击事件
        this.bindSkillItemEvents();

        // 点击其他地方关闭面板
        document.addEventListener('click', (e) => {
            if (this.isPanelOpen &&
                !this.skillPanel.contains(e.target) &&
                !this.skillBtn.contains(e.target)) {
                this.closePanel();
            }
        });

        // 初始化积分显示
        this.updateEnergyDisplay();

        // 启动提示定时器
        this.startHintTimer();

        // 记录初始化基准中心点，并在窗口变化后重置基准
        this.cacheNotificationAnchor();
        if (!this._onResizeReanchor) {
            this._onResizeReanchor = () => {
                this.notificationAnchorCenterX = null;
                this.applyLayoutCompensation(0);
                this.cacheNotificationAnchor();
            };
            window.addEventListener('resize', this._onResizeReanchor);
        }
    }

    cacheNotificationAnchor() {
        requestAnimationFrame(() => {
            const gameContainer = document.querySelector('.game-container');
            if (!gameContainer) return;
            const rect = gameContainer.getBoundingClientRect();
            this.notificationAnchorCenterX = rect.left + rect.width / 2;
        });
    }

    applyLayoutCompensation(offsetX) {
        const mainLayout = document.querySelector('.main-layout');
        if (!mainLayout) return;
        if (Math.abs(offsetX) < 0.5) {
            mainLayout.style.transform = '';
            this.layoutCompensationX = 0;
            return;
        }
        mainLayout.style.transform = `translateX(${offsetX}px)`;
        this.layoutCompensationX = offsetX;
    }

    /**
     * 启动提示定时器
     */
    startHintTimer() {
        if (this.hintTimer) return;

        this.hintTimer = setInterval(() => {
            this.checkAndShowHint();
        }, 3000); // 每 3 秒检查一次
    }

    /**
     * 停止提示定时器
     */
    stopHintTimer() {
        if (this.hintTimer) {
            clearInterval(this.hintTimer);
            this.hintTimer = null;
        }
    }

    /**
     * 检查是否需要显示提示
     */
    checkAndShowHint() {
        if (!this.skillBtn) return;

        // 获取本地玩家编号
        let localPlayer = gameState.getCurrentPlayer();
        const isOnlineMode = gameState.getIsOnlineMultiplayer();

        if (isOnlineMode) {
            const multiplayerManager = window.gameInstance?.multiplayerGameManager;
            if (multiplayerManager) {
                localPlayer = multiplayerManager.getPlayerNumberByPlayerId(multiplayerManager.playerId);
            }
        }

        // 检查是否轮到本地玩家，且能量已满
        const isMyTurn = gameState.getCurrentPlayer() === localPlayer;
        const currentEnergy = energyManager.getEnergy(localPlayer);
        const isEnergyFull = currentEnergy >= energyManager.maxEnergy;

        if (isMyTurn && isEnergyFull && !this.isPanelOpen) {
            this.skillBtn.classList.remove('skill-btn-hint');
            // 触发重绘以重新开始动画
            void this.skillBtn.offsetWidth;
            this.skillBtn.classList.add('skill-btn-hint');
        } else {
            this.skillBtn.classList.remove('skill-btn-hint');
        }
    }

    disableForAITakeover() {
        if (this.skillPanel) {
            this.closePanel();
        }
        if (this.skillBtn) {
            this.skillBtn.classList.add('is-hidden');
            this.skillBtn.classList.remove('skill-btn-hint');
        }
        this.stopHintTimer();
    }

    enableAfterAITakeover() {
        // 观战模式或道具模式未启用时，不恢复道具按钮
        const isSpectator = window.multiplayerGameManager && window.multiplayerGameManager.isSpectator;
        if (!energyManager.isSkillModeEnabled() || isSpectator) return;
        
        if (this.skillBtn) {
            this.skillBtn.classList.remove('is-hidden');
        }
        this.updateSkillAvailability();
        this.startHintTimer();
    }

    /**
     * 绑定道具项点击事件
     */
    bindSkillItemEvents() {
        const skillItems = document.querySelectorAll('.skill-item');
        skillItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleSkillClick(item);
            });
        });
    }

    /**
     * 更新道具按钮的显示/隐藏状态
     */
    updateButtonVisibility() {
        const skillBtn = document.getElementById('skillBtn');
        if (!skillBtn) return;
        const isSpectator = window.multiplayerGameManager && window.multiplayerGameManager.isSpectator;
        const isSkillMode = energyManager.isSkillModeEnabled();
        const loadingIndicator = document.getElementById('loadingIndicator');
        const isLoading = loadingIndicator && loadingIndicator.style.display === 'flex';

        if (isSpectator || !isSkillMode || isLoading) {
            skillBtn.style.display = 'none';
        } else {
            skillBtn.style.display = 'block';
        }
    }

    /**
     * 处理道具点击
     * @param {HTMLElement} skillItem - 道具项元素
     */
    handleSkillClick(skillItem) {
        const skillId = skillItem.dataset.skill;
        const cost = parseInt(skillItem.dataset.cost);

        console.log(`道具点击: ${skillId}, 消耗: ${cost}积分`);

        // 获取本地玩家编号
        let localPlayer = 1;
        const isOnlineMode = gameState.getIsOnlineMultiplayer();
        const isLocalMultiplayer = gameState.getIsLocalMultiplayer();

        if (isOnlineMode) {
            // 在线多人模式：通过 multiplayerManager 获取玩家编号
            const multiplayerManager = window.gameInstance?.multiplayerGameManager;
            if (multiplayerManager) {
                localPlayer = multiplayerManager.getPlayerNumberByPlayerId(multiplayerManager.playerId);
            }
        } else if (isLocalMultiplayer) {
            // 本地多人模式：使用当前玩家编号
            localPlayer = gameState.getCurrentPlayer();
        } else {
            // 人机模式：使用当前玩家编号（人类玩家可能不是玩家1）
            localPlayer = gameState.getCurrentPlayer();
        }

        // 检查是否是当前玩家的回合
        const currentPlayer = gameState.getCurrentPlayer();
        if (currentPlayer !== localPlayer) {
            console.log('不是当前玩家的回合，无法使用道具');
            this.showNotification('请等待你的回合！');
            return;
        }

        // 检查游戏阶段（必须是rolling阶段且骰子值为0，即还未投掷）
        const gamePhase = gameState.getGamePhase();
        const diceValue = gameState.getDiceValue();
        if (gamePhase !== 'rolling' || diceValue !== 0) {
            console.log(`无法使用道具: 阶段=${gamePhase}, 骰子值=${diceValue}`);
            this.showNotification('只能在投掷前使用道具！');
            return;
        }

        // 检查积分是否足够
        const currentEnergy = energyManager.getEnergy(localPlayer);
        if (currentEnergy < cost) {
            console.log(`积分不足: 当前${currentEnergy}, 需要${cost}`);
            return;
        }

        // 如果是传送门道具，检查是否有可传送的棋子
        if (skillId === 'teleport') {
            const hasChessOnTrack = this.checkHasChessOnTrack(localPlayer);
            if (!hasChessOnTrack) {
                this.showNotification('没有可传送的棋子！所有棋子都在基地');
                return;
            }
        }

        // 使用道具
        this.useSkill(skillId, cost, localPlayer);
    }

    /**
     * 检查玩家是否有棋子在轨道上（不在基地）
     * @param {number} player - 玩家编号
     * @returns {boolean} 是否有棋子在轨道上
     */
    checkHasChessOnTrack(player) {
        const playerChess = gameState.getPlayerChess()[player];
        const pieceCount = gameState.pieceCount || 4;

        for (let i = 0; i < pieceCount; i++) {
            const chess = playerChess[i];
            // 只要有一个棋子不在基地（position !== -1）且未完成，就返回true
            if (chess.position !== -1 && !chess.finished) {
                return true;
            }
        }

        return false;
    }

    /**
     * 使用道具
     * @param {string} skillId - 道具ID
     * @param {number} cost - 消耗的积分
     * @param {number} player - 玩家编号
     */
    useSkill(skillId, cost, player) {
        // 消耗积分
        const success = energyManager.consumeEnergy(player, cost);
        if (!success) {
            console.error('消耗积分失败');
            return;
        }

        console.log(`玩家${player}使用道具: ${skillId}`);

        // 播放道具音效
        if (audioManager) {
            audioManager.playSkillSound();
        }

        // 实现具体的道具效果
        switch (skillId) {
            case 'remote-dice':
                this.activateRemoteDice(player);
                break;
            case 'teleport':
                this.activateTeleport(player);
                break;
            case 'polyhedral-dice':
                this.activatePolyhedralDice(player);
                break;
            case 'mysteryBox':
                this.activateMysteryBox(player);
                break;
            default:
                console.warn(`未知的道具: ${skillId}`);
        }

        // 关闭面板
        this.closePanel();

        // 更新积分显示
        this.updateEnergyDisplay();
        this.updateSkillAvailability();
    }

    /**
     * 激活遥控骰子道具
     * @param {number} player - 玩家编号
     */
    activateRemoteDice(player) {
        console.log(`玩家${player}激活遥控骰子道具`);

        let shouldShowPanel = true;
        if (window.gameInfo && window.gameInfo.isNonLocalPlayer) {
            shouldShowPanel = !window.gameInfo.isNonLocalPlayer(player);
        } else if (window.botController && window.botController.isCurrentPlayerBot()) {
            shouldShowPanel = false;
        }
        
        if (shouldShowPanel) {
            // 本地玩家：暂时不再提前发送不带点数的消息，统一在选择完点数后发送
            this.showDiceSelectionPanel(player);
        } else {
            // 非本地玩家：暂不发送消息，等真正选择点数(handleDiceSelection)时再发包含点数的消息
        }
    }

    /**
     * 显示骰子点数选择面板
     * @param {number} player - 玩家编号
     */
    showDiceSelectionPanel(player) {
        // 暂停当前回合的思考时间进度条（掷骰/走子阶段）
        if (window.gameInstance && window.gameInstance.uiUpdater) {
            window.gameInstance.uiUpdater.stopThinkingProgressBar();
        } else if (gameState.clearThinkingTimer) {
            gameState.clearThinkingTimer();
        }

        // 如果已存在面板，先移除
        const existingPanel = document.getElementById('diceSelectionPanel');
        if (existingPanel) {
            existingPanel.remove();
        }

        // 创建选择面板
        const panel = document.createElement('div');
        panel.className = 'dice-selection-panel';
        panel.id = 'diceSelectionPanel';

        // 创建标题
        const title = document.createElement('h3');
        title.textContent = '选择骰子点数';

        // 创建骰子点数按钮容器
        const diceContainer = document.createElement('div');
        diceContainer.className = 'dice-selection-container';

        // 骰子符号数组
        const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

        // 创建骰子点数按钮（1-6）
        for (let i = 1; i <= 6; i++) {
            const btn = document.createElement('button');
            btn.textContent = DICE_SYMBOLS[i - 1];
            btn.className = 'dice-selection-btn';
            btn.addEventListener('click', () => {
                this.handleDiceSelection(i, player, panel);
            });
            diceContainer.appendChild(btn);
        }

        panel.appendChild(title);
        panel.appendChild(diceContainer);

        // 添加到game-controls-center容器中（与表情面板同级）
        const gameControlsCenter = document.querySelector('.game-controls-center');
        if (gameControlsCenter) {
            gameControlsCenter.appendChild(panel);
        } else {
            // 如果找不到容器，降级到body
            document.body.appendChild(panel);
        }

        // 检查聊天输入框是否正在显示，如果是则临时隐藏但标记应该显示
        const chatInputArea = document.getElementById('chatInputArea');
        const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';
        if (isChatInputVisible) {
            // 不再隐藏面板，让用户可以选择骰子点数
            console.log('聊天输入框显示中，但骰子选择面板仍然可见');
        }

        // 为遥控骰子点数选择阶段启动新的思考时间进度条
        if (window.gameInstance && window.gameInstance.uiUpdater) {
            const uiUpdater = window.gameInstance.uiUpdater;

            uiUpdater.startThinkingProgressBar(() => {
                console.log(`[遥控骰子] 玩家${player}选择点数思考时间到，开启AI托管`);

                const selectionPanel = document.getElementById('diceSelectionPanel');
                // 如果面板已经被关闭，说明玩家已手动选择或道具被取消
                if (!selectionPanel) {
                    return;
                }

                // 超时不再直接随机点数，而是开启AI托管，由AI统一接管当前玩家回合
                (async () => {
                    try {
                        const module = await import('./aiTakeoverManager.js');
                        if (module && module.aiTakeoverManager && typeof module.aiTakeoverManager.enableTakeover === 'function') {
                            module.aiTakeoverManager.enableTakeover();
                        }
                    } catch (error) {
                        console.error('遥控骰子选择超时开启AI托管失败:', error);
                    }
                })();
            });
        }
    }

    /**
     * 处理骰子点数选择
     * @param {number} diceValue - 选择的骰子点数
     * @param {number} player - 玩家编号
     * @param {HTMLElement} panel - 面板元素
     */
    async handleDiceSelection(diceValue, player, panel) {
        console.log(`玩家${player}选择骰子点数: ${diceValue}`);

        // 移除选择面板
        if (panel && panel.parentNode) {
            panel.parentNode.removeChild(panel);
        }

        // 无论是本地玩家还是非本地玩家，都发送带点数的道具使用消息
        // 以便联机模式下其他玩家能看到对方选择了什么点数
        this.sendSkillUsageInfo(player, '遥控骰子', { diceValue });

        // 直接更新骰子显示为选择的点数
        const diceDisplay = document.getElementById('diceDisplay');
        const DICE_SYMBOLS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        if (diceDisplay) {
            diceDisplay.textContent = DICE_SYMBOLS[diceValue - 1];
            // 添加遥控骰子红色发光特效
            diceDisplay.classList.add('remote-dice');
        }

        // 在线模式下同步骰子显示
        if (gameState.getIsOnlineMultiplayer() && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            window.gameInstance.multiplayerGameManager.syncDiceDisplay(diceValue);
        }

        // 设置游戏状态中的骰子值
        gameState.setDiceValue(diceValue);

        // 标记这是遥控骰子（6点不触发连投奖励）
        gameState.isRemoteDice = true;

        // 添加骰子投掷信息
        if (gameInfo) {
            gameInfo.addDiceRoll(player, diceValue);
        }

        // 直接调用handleDiceResult进入棋子移动阶段
        if (window.gameInstance && window.gameInstance.dice) {
            await window.gameInstance.dice.handleDiceResult();
        }

        // 仅当当前玩家不是由AI控制时，才显示提示文字
        if (!window.botController || !window.botController.isCurrentPlayerBot()) {
            this.showNotification(`已选择点数: ${diceValue}`);
        }
    }

    /**
     * 激活传送门道具
     * @param {number} player - 玩家编号
     */
    activateTeleport(player) {
        console.log(`玩家${player}激活传送门道具`);

        // 记录传送门使用信息（包括AI），确保gameInfo中有完整轨迹
        this.sendSkillUsageInfo(player, '传送门');

        // 在骰子位置显示传送门图标
        this.showTeleportIcon();

        // 在线模式下同步传送门图标显示
        if (gameState.getIsOnlineMultiplayer() && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            window.gameInstance.multiplayerGameManager.syncTeleportIcon(true);
        }

        // 设置传送门模式标记
        if (window.gameInstance) {
            window.gameInstance.isTeleportMode = true;
        }

        // 直接进入选择棋子阶段
        gameState.setGamePhase('selecting');
        gameState.setDiceValue(999); // 使用特殊值标记传送门模式，避免与正常骰子值冲突

        // 仅当当前玩家不是由AI控制时，才显示提示文字
        if (!window.botController || !window.botController.isCurrentPlayerBot()) {
            this.showNotification('传送门已激活！选择棋子进行传送');
        }

        // 触发 bot 操作
        if (window.gameInstance && window.gameInstance.dice && window.gameInstance.dice.triggerBotOperationIfNeeded) {
            window.gameInstance.dice.triggerBotOperationIfNeeded();
        }
    }

    /**
     * 激活多面骰子道具
     * @param {number} player - 玩家编号
     */
    async activatePolyhedralDice(player) {
        console.log(`玩家${player}激活多面骰子道具`);

        // 生成1-12的随机点数
        const diceValue = Math.floor(Math.random() * 12) + 1;
        console.log(`多面骰子生成点数: ${diceValue}`);

        // 发送游戏信息，同时携带骰子点数
        this.sendSkillUsageInfo(player, '多面骰子', { diceValue });

        // 显示多面骰子
        this.showPolyhedralDice(diceValue);

        // 仅当当前玩家不是由AI控制时，才显示提示文字
        if (!window.botController || !window.botController.isCurrentPlayerBot()) {
            this.showNotification(`多面骰子掷出: ${diceValue} 点`);
        }

        // 在线模式下同步多面骰子显示
        if (gameState.getIsOnlineMultiplayer() && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            window.gameInstance.multiplayerGameManager.syncPolyhedralDice(diceValue);
        }

        // 设置游戏状态中的骰子值
        gameState.setDiceValue(diceValue);

        // 标记这是遥控骰子（6点不触发连投奖励）
        gameState.isRemoteDice = true;

        // 添加骰子投掷信息
        if (gameInfo) {
            gameInfo.addDiceRoll(player, diceValue);
        }

        // 直接调用handleDiceResult进入棋子移动阶段
        if (window.gameInstance && window.gameInstance.dice) {
            await window.gameInstance.dice.handleDiceResult();
        }
    }

    /**
     * 激活盲盒道具
     * @param {number} player - 玩家编号
     */
    async activateMysteryBox(player) {
        console.log(`玩家${player}激活盲盒道具`);

        // 停止思考进度条
        if (window.gameInstance && window.gameInstance.uiUpdater) {
            window.gameInstance.uiUpdater.stopThinkingProgressBar();
            console.log('[盲盒] 已停止思考进度条');
        }

        // 生成0-40的随机积分
        const energyGain = Math.floor(Math.random() * 41);
        console.log(`盲盒开启: ${energyGain}点积分`);

        // 发送游戏信息 (包含获得的积分值)
        this.sendSkillUsageInfo(player, '盲盒', { amount: energyGain });

        // 仅当当前玩家不是由AI控制时，才显示提示文字
        if (!window.botController || !window.botController.isCurrentPlayerBot()) {
            this.showNotification(`盲盒开启: 获得 ${energyGain}点积分`);
        }

        // 显示盲盒图标
        this.showMysteryBoxIcon(player);

        // 在线模式下同步盲盒图标显示
        if (gameState.getIsOnlineMultiplayer() && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            window.gameInstance.multiplayerGameManager.syncMysteryBoxIcon(energyGain, player);
        }

        // 等待盲盒闪烁动画完成（2次闪烁，1秒）
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 移除盲盒图标
        this.removeMysteryBoxIcon(false);

        // 在线模式下同步移除盲盒图标
        if (gameState.getIsOnlineMultiplayer() && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            window.gameInstance.multiplayerGameManager.syncRemoveMysteryBoxIcon();
        }

        // 增加积分
        energyManager.addEnergy(player, energyGain);

        // 显示积分获得数值动画（带玩家颜色）
        this.showEnergyGainAnimation(energyGain, player);

        // 在线模式下同步积分数值动画
        if (gameState.getIsOnlineMultiplayer() && window.gameInstance && window.gameInstance.multiplayerGameManager) {
            window.gameInstance.multiplayerGameManager.syncEnergyGainAnimation(energyGain);
        }

        // 等待积分数值动画完成（1秒）
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 使用盲盒后跳过当前回合
        console.log(`玩家${player}使用盲盒后跳过回合`);

        // 切换到下一个玩家
        if (window.gameInstance && window.gameInstance.uiUpdater) {
            const handleThinkingTimeout = window.gameInstance.dice?.handleThinkingTimeoutWrapper?.bind(window.gameInstance.dice);
            const triggerBot = window.eventHandler?.triggerBotOperationIfNeeded?.bind(window.eventHandler);
            gameState.nextPlayer(window.gameInstance.uiUpdater, handleThinkingTimeout, triggerBot, true);
        } else {
            gameState.nextPlayer();
        }
    }

    /**
     * 显示多面骰子（1-12的随机点数）
     * @param {number} diceValue - 骰子点数（1-12）
     */
    showPolyhedralDice(diceValue) {
        const diceDisplay = document.getElementById('diceDisplay');
        if (!diceDisplay) return;

        // 隐藏原始骰子
        diceDisplay.style.display = 'none';

        // 获取当前玩家
        const currentPlayer = gameState.getCurrentPlayer();

        // 创建或更新多面骰子显示
        let polyhedralDice = document.getElementById('polyhedralDiceDisplay');
        if (!polyhedralDice) {
            polyhedralDice = document.createElement('div');
            polyhedralDice.id = 'polyhedralDiceDisplay';
            polyhedralDice.className = `polyhedral-dice-display player-${currentPlayer}-color`;
            polyhedralDice.textContent = diceValue;

            // 插入到骰子的父容器中
            diceDisplay.parentNode.insertBefore(polyhedralDice, diceDisplay);
        } else {
            polyhedralDice.textContent = diceValue;
            polyhedralDice.className = `polyhedral-dice-display player-${currentPlayer}-color`;
            polyhedralDice.style.display = 'flex';
        }

        // 检查聊天输入框是否正在显示，如果是则临时隐藏但标记应该显示
        const chatInputArea = document.getElementById('chatInputArea');
        const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';
        if (isChatInputVisible) {
            polyhedralDice.style.display = 'none';
            polyhedralDice.dataset.shouldShow = 'true';
            console.log('[多面骰子] 聊天输入框正在显示，多面骰子已创建但暂时隐藏');
        } else {
            polyhedralDice.style.display = 'flex';
            console.log('[多面骰子] 骰子已隐藏，多面骰子已显示');
        }
    }

    /**
     * 恢复原始骰子图标（从多面骰子状态）
     */
    restoreDiceFromPolyhedral() {
        const diceDisplay = document.getElementById('diceDisplay');
        const polyhedralDice = document.getElementById('polyhedralDiceDisplay');

        // 检查聊天输入框是否正在显示，如果是则不恢复骰子显示
        const chatInputArea = document.getElementById('chatInputArea');
        const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';

        // 显示骰子（除非聊天输入框正在显示）
        if (diceDisplay && !isChatInputVisible) {
            diceDisplay.style.display = 'flex';
        }

        // 移除多面骰子显示
        if (polyhedralDice) {
            polyhedralDice.remove();
        }
    }

    /**
     * 显示盲盒图标
     */
    showMysteryBoxIcon(player) {
        const diceDisplay = document.getElementById('diceDisplay');
        if (!diceDisplay) return;
        const playerColor = getComputedStyle(document.documentElement).getPropertyValue(`--player-${player}-color`).trim() || '#FFD700';

        // 隐藏骰子
        diceDisplay.style.display = 'none';

        // 创建盲盒图标容器（如果不存在）
        let mysteryBoxIcon = document.getElementById('mysteryBoxIcon');
        if (!mysteryBoxIcon) {
            mysteryBoxIcon = document.createElement('div');
            mysteryBoxIcon.id = 'mysteryBoxIcon';
            mysteryBoxIcon.className = 'dice-icon dice-icon-centered';
            mysteryBoxIcon.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.77694 4.71874C6.9227 4.57859 7.12001 4.5001 7.32555 4.50049H16.6776C16.8824 4.50049 17.0812 4.57853 17.2262 4.71874L19.4357 6.85816H4.56597L6.7784 4.71874H6.77694ZM3.47026 8.35865H20.5329L18.9812 18.7522C18.9808 18.9506 18.8991 19.1409 18.754 19.2812C18.6088 19.4216 18.4121 19.5006 18.2069 19.501H5.79633C5.59082 19.501 5.3937 19.4221 5.24824 19.2817C5.10279 19.1414 5.02087 18.9509 5.02048 18.7522L3.47026 8.35865ZM7.32555 3.00144C6.70818 3.00144 6.11621 3.23852 5.68118 3.66061L2.43727 6.79311C2.27536 6.94984 2.15287 7.14047 2.07926 7.35026C2.00565 7.56005 1.98289 7.7834 2.01274 8.00305L3.46874 18.7493C3.46874 19.9925 4.5107 21 5.79481 21H18.2054C19.491 21 20.5314 19.9925 20.5314 18.7507L21.9874 8.00305C22.0171 7.78328 21.9941 7.55987 21.9202 7.35007C21.8463 7.14027 21.7236 6.94971 21.5614 6.79311L18.3205 3.65917C17.8844 3.2373 17.2929 3.0002 16.6761 3H7.32555V3.00144ZM14.2319 9.70445C14.1714 9.64146 14.0977 9.59162 14.0158 9.55823C13.9338 9.52484 13.8455 9.50866 13.7566 9.51077H10.2481C10.1589 9.50846 10.0703 9.52453 9.98806 9.55793C9.90583 9.59132 9.83191 9.64127 9.77121 9.70445C9.70982 9.76129 9.66125 9.82981 9.62858 9.90569C9.5959 9.98157 9.57982 10.0632 9.58135 10.1453V11.2599C9.58135 11.4333 9.64412 11.5794 9.77121 11.7008C9.83378 11.7608 9.90832 11.8079 9.99029 11.8392C10.0723 11.8705 10.16 11.8854 10.2481 11.8829H10.9282C11.014 11.8843 11.0991 11.8689 11.1785 11.8376C11.2579 11.8063 11.3299 11.7598 11.3902 11.7008C11.4536 11.6447 11.5043 11.5767 11.5393 11.5008C11.5743 11.4249 11.5927 11.3429 11.5935 11.2599V10.9751H12.4097V12.2457L11.2676 13.3082C11.2039 13.3661 11.154 13.4367 11.1212 13.5151C11.0885 13.5934 11.0736 13.6777 11.0777 13.7621V14.4097C11.0777 14.5919 11.1405 14.7422 11.2676 14.8636C11.328 14.9228 11.4003 14.9695 11.4799 15.0008C11.5596 15.0321 11.645 15.0474 11.731 15.0458H12.4097C12.497 15.0477 12.5839 15.0326 12.6651 15.0015C12.7463 14.9703 12.8202 14.9237 12.8824 14.8643C12.9446 14.805 12.9938 14.7342 13.0272 14.6561C13.0605 14.578 13.0772 14.4942 13.0764 14.4097V13.8272L14.2319 12.7502C14.2932 12.6936 14.3416 12.6253 14.3743 12.5497C14.4069 12.4741 14.4231 12.3927 14.4218 12.3108V10.1439C14.4233 10.0617 14.4073 9.98013 14.3746 9.90425C14.3419 9.82837 14.2933 9.75985 14.2319 9.70301V9.70445ZM12.8582 15.9781C12.7976 15.9192 12.7253 15.8728 12.6456 15.8418C12.566 15.8107 12.4806 15.7956 12.3947 15.7975H11.7295C11.6439 15.7958 11.5588 15.811 11.4794 15.8421C11.4 15.8731 11.328 15.9194 11.2676 15.9781C11.2062 16.035 11.1576 16.1035 11.125 16.1794C11.0923 16.2553 11.0762 16.3369 11.0777 16.419V17.0667C11.0777 17.2401 11.1405 17.3876 11.2676 17.5076C11.326 17.5701 11.3976 17.6198 11.4775 17.6535C11.5574 17.6871 11.6439 17.7039 11.731 17.7027H12.3962C12.4834 17.7039 12.5698 17.6871 12.6497 17.6535C12.7296 17.6198 12.8012 17.5701 12.8596 17.5076C12.9245 17.4526 12.9762 17.3848 13.0113 17.3087C13.0464 17.2326 13.064 17.15 13.0629 17.0667V16.419C13.0638 16.3356 13.046 16.253 13.0106 16.1769C12.9753 16.1007 12.9232 16.0329 12.8582 15.9781Z" fill="currentColor"/>
                </svg>
            `;
            diceDisplay.parentNode.insertBefore(mysteryBoxIcon, diceDisplay);
        }
        
        // 设置图标颜色
        mysteryBoxIcon.style.color = playerColor;

        // 添加闪烁动画
        mysteryBoxIcon.classList.add('mysteryBox-glow-animation');

        // 检查聊天输入框是否正在显示，如果是则临时隐藏但标记应该显示
        const chatInputArea = document.getElementById('chatInputArea');
        const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';
        if (isChatInputVisible) {
            mysteryBoxIcon.style.display = 'none';
            mysteryBoxIcon.dataset.shouldShow = 'true';
            console.log('[盲盒] 聊天输入框正在显示，盲盒图标已创建但暂时隐藏');
        } else {
            mysteryBoxIcon.style.display = 'flex';
            console.log('[盲盒] 骰子已隐藏，盲盒图标已显示');
        }
    }

    /**
     * 移除盲盒图标
     * @param {boolean} shouldRestoreDice - 是否恢复骰子显示
     */
    removeMysteryBoxIcon(shouldRestoreDice = true) {
        const diceDisplay = document.getElementById('diceDisplay');
        const mysteryBoxIcon = document.getElementById('mysteryBoxIcon');

        // 检查聊天输入框是否正在显示，如果是则不恢复骰子显示
        const chatInputArea = document.getElementById('chatInputArea');
        const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';

        // 显示骰子（除非明确要求不显示，或者聊天输入框正在显示）
        if (shouldRestoreDice && diceDisplay && !isChatInputVisible) {
            diceDisplay.style.display = 'flex';
        }

        // 移除盲盒图标
        if (mysteryBoxIcon) {
            mysteryBoxIcon.remove();
        }
    }

    /**
     * 显示积分获得数值动画
     * @param {number} energyGain - 获得的积分数值
     * @param {number} player - 玩家编号（用于设置颜色）
     */
    showEnergyGainAnimation(energyGain, player) {
        const diceDisplay = document.getElementById('diceDisplay');
        if (!diceDisplay) return;

        // 获取玩家颜色以设置动画的文字颜色变量
        const playerColor = getComputedStyle(document.documentElement).getPropertyValue(`--player-${player}-color`).trim() || '#FFD700';
        document.documentElement.style.setProperty('--text-color', playerColor);

        // 隐藏骰子
        diceDisplay.style.display = 'none';

        // 创建积分数值显示元素（样式由CSS控制）
        const energyText = document.createElement('div');
        energyText.id = 'energyGainText';
        energyText.className = `energy-gain-text player-${player}`;

        // 添加积分图标和积分数值
        energyText.innerHTML = `
            <span>+${energyGain}</span>
            <svg t="1777811441484" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1702" style="width: 38px; height: 38px; transform: translateY(4px);">
                <path d="M511.838 472.601c-173.757 0-358.398-56-358.398-159.679 0-103.684 184.641-159.762 358.398-159.762 173.761 0 358.402 56 358.402 159.68 0 103.679-184.64 159.761-358.402 159.761z m0-265.839c-188.718 0-304.636 61.839-304.636 106.078 0 44.242 115.918 106.16 304.636 106.16 188.722 0 304.64-61.84 304.64-106.16 0.001-44.321-115.917-106.078-304.64-106.078z m0 0" fill="currentColor" p-id="1703"></path>
                <path d="M511.838 594.039c-172.636 0-358.398-40.56-358.398-129.68 0-14.801 12.078-26.801 26.879-26.801 14.801 0 26.883 12 26.883 26.801 0 22.723 103.679 76.082 304.636 76.082 200.96 0 304.64-53.358 304.64-76.082 0-14.801 12-26.801 26.883-26.801 14.797 0 26.879 12 26.879 26.801 0 89.12-185.761 129.68-358.402 129.68z m0 0" fill="currentColor" p-id="1704"></path>
                <path d="M511.838 721.719c-172.636 0-358.398-40.559-358.398-129.68 0-14.801 12.078-26.801 26.879-26.801 14.801 0 26.883 12 26.883 26.801 0 22.723 103.679 76.082 304.636 76.082 200.96 0 304.64-53.359 304.64-76.082 0-14.801 12-26.801 26.883-26.801 14.797 0 26.879 12 26.879 26.801 0 89.121-185.761 129.68-358.402 129.68z m0 0" fill="currentColor" p-id="1705"></path>
                <path d="M511.838 869.961c-172.636 0-358.398-40.563-358.398-129.68v-24.402c0-14.797 12.078-26.797 26.879-26.797 14.801 0 26.883 12 26.883 26.797v24.402c0 22.719 103.679 76.078 304.636 76.078 200.96 0 304.64-53.359 304.64-76.078v-24.402c0-14.797 12-26.797 26.883-26.797 14.797 0 26.879 12 26.879 26.797v24.402c0 89.116-185.761 129.68-358.402 129.68z m0 0" fill="currentColor" p-id="1706"></path>
            </svg>
        `;

        // 插入到骰子的父容器中
        diceDisplay.parentNode.insertBefore(energyText, diceDisplay);

        // 检查聊天输入框是否正在显示，如果是则临时隐藏但标记应该显示
        const chatInputArea = document.getElementById('chatInputArea');
        const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';
        if (isChatInputVisible) {
            energyText.style.display = 'none';
            energyText.dataset.shouldShow = 'true';
            console.log('[盲盒] 聊天输入框正在显示，积分数值已创建但暂时隐藏');
        }

        // 1秒后移除积分数值并恢复骰子（与CSS动画时间一致）
        setTimeout(() => {
            if (energyText && energyText.parentNode) {
                energyText.remove();
            }
            // 检查聊天输入框是否正在显示，如果是则不恢复骰子显示
            const chatInputArea = document.getElementById('chatInputArea');
            const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';
            if (diceDisplay && !isChatInputVisible) {
                diceDisplay.style.display = 'flex';
            }
        }, 1000);

        console.log('[盲盒] 积分数值动画已显示:', energyGain);
    }

    /**
     * 显示传送门图标
     */
    showTeleportIcon() {
        const diceDisplay = document.getElementById('diceDisplay');
        if (!diceDisplay) return;

        // 隐藏骰子
        diceDisplay.style.display = 'none';

        // 获取当前玩家
        const currentPlayer = gameState.getCurrentPlayer();

        // 创建传送门图标容器
        let teleportIcon = document.getElementById('teleportIcon');
        if (!teleportIcon) {
            teleportIcon = document.createElement('div');
            teleportIcon.id = 'teleportIcon';
            teleportIcon.className = `dice-icon dice-icon-centered player-${currentPlayer}-border`;
            teleportIcon.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                        stroke-width="2">
                        <path d="M7.027 11.477a5 5 0 1 0 5.496-4.45a4.95 4.95 0 0 0-3.088.681">
                        </path>
                        <path d="M5.636 5.636a9 9 0 1 0 3.555-2.188"></path>
                        <path d="M17 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path>
                        <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path>
                        <path d="M8 16a1 1 0 1 0 2 0a1 1 0 1 0-2 0"></path>
                    </g>
                </svg>
            `;
            diceDisplay.parentNode.insertBefore(teleportIcon, diceDisplay);
        } else {
            teleportIcon.className = `dice-icon dice-icon-centered player-${currentPlayer}-border`;
        }

        // 添加脉冲动画
        teleportIcon.classList.add('pulse-animation');

        // 检查聊天输入框是否正在显示，如果是则临时隐藏但标记应该显示
        const chatInputArea = document.getElementById('chatInputArea');
        const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';
        if (isChatInputVisible) {
            teleportIcon.style.display = 'none';
            teleportIcon.dataset.shouldShow = 'true';
            console.log('[传送门] 聊天输入框正在显示，传送门图标已创建但暂时隐藏');
        } else {
            teleportIcon.style.display = 'flex';
            console.log('[传送门] 骰子已隐藏，传送门图标已显示');
        }
    }

    /**
     * 恢复原始骰子图标
     */
    restoreDiceIcon() {
        const diceDisplay = document.getElementById('diceDisplay');
        const teleportIcon = document.getElementById('teleportIcon');
        const polyhedralDice = document.getElementById('polyhedralDiceDisplay');

        // 检查聊天输入框是否正在显示，如果是则不恢复骰子显示
        const chatInputArea = document.getElementById('chatInputArea');
        const isChatInputVisible = chatInputArea && chatInputArea.style.display === 'flex';

        let hasRestored = false;

        // 显示骰子（除非聊天输入框正在显示）
        if (diceDisplay && !isChatInputVisible) {
            if (diceDisplay.style.display !== 'flex') {
                diceDisplay.style.display = 'flex';
                hasRestored = true;
            }
        }

        // 隐藏并移除传送门图标
        if (teleportIcon) {
            if (teleportIcon.style.display !== 'none') {
                teleportIcon.style.display = 'none';
                teleportIcon.style.animation = '';
                hasRestored = true;
            }
        }

        // 移除多面骰子显示
        if (polyhedralDice) {
            polyhedralDice.remove();
            hasRestored = true;
        }
    }

    /**
     * 发送道具使用信息
     * @param {number} player - 玩家编号
     * @param {string} skillName - 道具名称
     * @param {Object} extraData - 额外的数据（如获得的积分等）
     */
    sendSkillUsageInfo(player, skillName, extraData = {}) {
        // 直接使用已导入的gameInfo
        if (gameInfo) {
            gameInfo.addSkillUsage(player, skillName, extraData);
        } else {
            console.error('[道具] gameInfo未初始化');
        }
    }

    /**
     * 切换面板显示/隐藏
     */
    togglePanel() {
        if (this.isPanelOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    /**
     * 打开面板
     */
    openPanel() {
        if (!this.skillPanel) return;

        this.skillPanel.classList.add('show');
        this.isPanelOpen = true;

        // 更新积分显示和道具可用性
        this.updateEnergyDisplay();
        this.updateSkillAvailability();
    }

    /**
     * 关闭面板
     */
    closePanel() {
        if (!this.skillPanel) return;

        this.skillPanel.classList.remove('show');
        this.isPanelOpen = false;
    }

    /**
     * 更新积分显示（显示当前玩家的积分）
     */
    updateEnergyDisplay() {
        if (!this.skillEnergyText) return;

        // 获取当前玩家编号
        let localPlayer = gameState.getCurrentPlayer();
        const isOnlineMode = gameState.getIsOnlineMultiplayer();

        // 仅在在线模式下需要获取本地玩家编号
        if (isOnlineMode) {
            const multiplayerManager = window.gameInstance?.multiplayerGameManager;
            if (multiplayerManager) {
                localPlayer = multiplayerManager.getPlayerNumberByPlayerId(multiplayerManager.playerId);
            }
        }
        // 在本地多人和人机模式下，始终显示当前玩家的积分

        const currentEnergy = energyManager.getEnergy(localPlayer);
        const maxEnergy = energyManager.maxEnergy;

        this.skillEnergyText.textContent = `积分: ${Math.floor(currentEnergy)}/${maxEnergy}`;
    }

    /**
     * 更新道具可用性状态（基于当前玩家的积分）
     */
    updateSkillAvailability() {
        // 获取当前玩家编号
        let localPlayer = gameState.getCurrentPlayer();
        const isOnlineMode = gameState.getIsOnlineMultiplayer();

        // 仅在在线模式下需要获取本地玩家编号
        if (isOnlineMode) {
            const multiplayerManager = window.gameInstance?.multiplayerGameManager;
            if (multiplayerManager) {
                localPlayer = multiplayerManager.getPlayerNumberByPlayerId(multiplayerManager.playerId);
            }
        }
        // 在本地多人和人机模式下，使用当前玩家编号

        const currentEnergy = energyManager.getEnergy(localPlayer);

        const skillItems = document.querySelectorAll('.skill-item');
        skillItems.forEach(item => {
            const skillId = item.dataset.skill;
            const cost = parseInt(item.dataset.cost);

            // 盲盒道具的特殊逻辑：积分>=40时禁用，<40且>=cost时可用
            if (skillId === 'mysteryBox') {
                if (currentEnergy >= 40) {
                    item.classList.add('disabled');
                } else if (currentEnergy >= cost) {
                    item.classList.remove('disabled');
                } else {
                    item.classList.add('disabled');
                }
            } else {
                // 其他道具：积分>=cost时可用
                if (currentEnergy >= cost) {
                    item.classList.remove('disabled');
                } else {
                    item.classList.add('disabled');
                }
            }
        });
    }

    /**
     * 显示通知消息
     * @param {string} message - 消息内容
     */
    showNotification(message) {
        // 如果有已存在的通知，先移除它
        if (this.currentNotification) {
            if (this.currentNotification.parentNode) {
                this.currentNotification.parentNode.removeChild(this.currentNotification);
            }
            if (this.notificationTimeout) {
                clearTimeout(this.notificationTimeout);
            }
            this.currentNotification = null;
            this.notificationTimeout = null;
        }

        // 积分图标 SVG
        const scoreIcon = `<svg t="1777811441484" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1702" style="height: 1.4em; width: 1.4em; vertical-align: -0.35em; fill: currentColor; margin-left: 0; display: inline-block;"><path d="M511.838 472.601c-173.757 0-358.398-56-358.398-159.679 0-103.684 184.641-159.762 358.398-159.762 173.761 0 358.402 56 358.402 159.68 0 103.679-184.64 159.761-358.402 159.761z m0-265.839c-188.718 0-304.636 61.839-304.636 106.078 0 44.242 115.918 106.16 304.636 106.16 188.722 0 304.64-61.84 304.64-106.16 0.001-44.321-115.917-106.078-304.64-106.078z m0 0" p-id="1703"></path><path d="M511.838 594.039c-172.636 0-358.398-40.56-358.398-129.68 0-14.801 12.078-26.801 26.879-26.801 14.801 0 26.883 12 26.883 26.801 0 22.723 103.679 76.082 304.636 76.082 200.96 0 304.64-53.358 304.64-76.082 0-14.801 12-26.801 26.883-26.801 14.797 0 26.879 12 26.879 26.801 0 89.12-185.761 129.68-358.402 129.68z m0 0" fill="currentColor" p-id="1704"></path><path d="M511.838 721.719c-172.636 0-358.398-40.559-358.398-129.68 0-14.801 12.078-26.801 26.879-26.801 14.801 0 26.883 12 26.883 26.801 0 22.723 103.679 76.082 304.636 76.082 200.96 0 304.64-53.359 304.64-76.082 0-14.801 12-26.801 26.883-26.801 14.797 0 26.879 12 26.879 26.801 0 89.121-185.761 129.68-358.402 129.68z m0 0" fill="currentColor" p-id="1705"></path><path d="M511.838 869.961c-172.636 0-358.398-40.563-358.398-129.68v-24.402c0-14.797 12.078-26.797 26.879-26.797 14.801 0 26.883 12 26.883 26.797v24.402c0 22.719 103.679 76.078 304.636 76.078 200.96 0 304.64-53.359 304.64-76.078v-24.402c0-14.797 12-26.797 26.883-26.797 14.797 0 26.879 12 26.879 26.797v24.402c0 89.116-185.761 129.68-358.402 129.68z m0 0" fill="currentColor" p-id="1706"></path></svg>`;

        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = 'game-notification';
        notification.innerHTML = message.replace(/积分/g, scoreIcon);

        const gameContainer = document.querySelector('.game-container');
        const targetContainer = document.body;

        // 预处理：计算最优宽度以实现平衡换行，避免出现一行很长一行很短的情况
        notification.style.visibility = 'hidden';
        notification.style.whiteSpace = 'nowrap';
        notification.style.width = 'max-content';
        targetContainer.appendChild(notification);

        // 使用初始化时记录的棋盘中心作为通知锚点，避免运行中基准漂移
        if (gameContainer) {
            const rect = gameContainer.getBoundingClientRect();
            const currentCenter = rect.left + rect.width / 2;
            if (this.notificationAnchorCenterX === null) {
                this.notificationAnchorCenterX = currentCenter;
            }
            const drift = this.notificationAnchorCenterX - currentCenter;
            this.applyLayoutCompensation(drift);
            const centerLeft = this.notificationAnchorCenterX;
            notification.style.left = `${centerLeft}px`;
        }

        // 测量实际单行宽度
        const fullWidth = notification.offsetWidth;
        // 获取容器的最大允许宽度 (参考CSS中的max-width: 80% 或 90%)
        const containerWidth = gameContainer ? gameContainer.clientWidth : window.innerWidth;
        const isMobile = window.innerWidth <= 480;
        const maxWidth = containerWidth * (isMobile ? 0.9 : 0.8);

        if (fullWidth > maxWidth) {
            const lines = Math.ceil(fullWidth / maxWidth);
            let balancedWidth = Math.ceil(fullWidth / (lines > 1 ? 2 : lines)) + 30; 
            balancedWidth = Math.min(balancedWidth, maxWidth);
            
            notification.style.width = balancedWidth + 'px';
        } else {
            notification.style.width = 'max-content';
        }

        notification.style.whiteSpace = 'normal';
        notification.style.visibility = 'visible';

        this.currentNotification = notification;

        // 3秒后移除 (与CSS动画时间一致)
        this.notificationTimeout = setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            if (this.currentNotification === notification) {
                this.currentNotification = null;
                this.notificationTimeout = null;
            }
        }, 3000);
    }

    /**
     * 获取道具管理器是否可用
     * @returns {boolean}
     */
    isEnabled() {
        return energyManager.isSkillModeEnabled();
    }
}

// 创建全局实例
export const skillManager = new SkillManager();
export default SkillManager;

