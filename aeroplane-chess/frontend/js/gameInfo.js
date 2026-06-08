import { playerNameManager } from './playerNameManager.js';
import { gameState } from './gameState.js';

/**
 * 游戏信息管理模块 - 负责收集和显示游戏过程中的各种信息
 */
class GameInfo {
    constructor() {
        this.gameState = gameState;
        this.infoContainer = null;
        this.chatContainer = null;
        this.maxMessages = 50;
        // 标记用户是否正在与消息容器交互（鼠标悬停/触摸）
        this.isUserInteracting = false;
        this.isChatInteracting = false;
        this.currentPanel = 'game'; // 'game' 或 'chat'
        this.panelSwitchBound = false; // 标记面板切换按钮事件是否已绑定
        this.init();
    }

    init() {
        this.infoContainer = document.getElementById('gameInfoContent');
        this.chatContainer = document.getElementById('chatInfoContent');
        if (!this.infoContainer) {
            console.warn('游戏信息容器未找到');
            return;
        }
        if (!this.chatContainer) {
            console.warn('聊天信息容器未找到');
            return;
        }
        // 绑定交互检测事件（鼠标+触摸，覆盖桌面/移动端）
        this.bindInteractionEvents();
        this.bindPanelSwitchEvents();
        this.clearMessages();
    }
    clearMessages() {
        if (this.infoContainer) {
            this.infoContainer.innerHTML = '';
        }
        if (this.chatContainer) {
            this.chatContainer.innerHTML = '';
        }
    }
    // 绑定交互事件，更新用户交互状态
    bindInteractionEvents() {
        // 1. 桌面端：鼠标悬停/离开 - 游戏信息容器
        this.infoContainer.addEventListener('mouseenter', () => {
            this.isUserInteracting = true;
        });
        this.infoContainer.addEventListener('mouseleave', () => {
            this.isUserInteracting = false;
        });

        // 2. 移动端：触摸开始/结束/离开 - 游戏信息容器
        this.infoContainer.addEventListener('touchstart', () => {
            this.isUserInteracting = true;
        });
        this.infoContainer.addEventListener('touchend', () => {
            this.isUserInteracting = false;
        });
        this.infoContainer.addEventListener('touchleave', () => {
            this.isUserInteracting = false;
        });

        // 3. 桌面端：鼠标悬停/离开 - 聊天信息容器
        this.chatContainer.addEventListener('mouseenter', () => {
            this.isChatInteracting = true;
        });
        this.chatContainer.addEventListener('mouseleave', () => {
            this.isChatInteracting = false;
        });

        // 4. 移动端：触摸开始/结束/离开 - 聊天信息容器
        this.chatContainer.addEventListener('touchstart', () => {
            this.isChatInteracting = true;
        });
        this.chatContainer.addEventListener('touchend', () => {
            this.isChatInteracting = false;
        });
        this.chatContainer.addEventListener('touchleave', () => {
            this.isChatInteracting = false;
        });
    }

    // 绑定面板切换事件
    bindPanelSwitchEvents() {
        const switchBtn = document.getElementById('panelSwitchBtn');
        const panelTitle = document.getElementById('infoPanelTitle');

        if (switchBtn && !this.panelSwitchBound) {
            // 只绑定一次事件监听器
            switchBtn.addEventListener('click', () => {
                const switchText = document.getElementById('panelSwitchText');
                if (this.currentPanel === 'game') {
                    // 切换到聊天面板
                    this.currentPanel = 'chat';
                    this.infoContainer.style.display = 'none';
                    this.chatContainer.style.display = 'block';
                    if (panelTitle) panelTitle.textContent = '聊天记录';
                    if (switchText) switchText.textContent = '信息';

                    // 切换后滚动到底部
                    this.scrollToBottom(this.chatContainer);
                } else {
                    // 切换到游戏信息面板
                    this.currentPanel = 'game';
                    this.infoContainer.style.display = 'block';
                    this.chatContainer.style.display = 'none';
                    if (panelTitle) panelTitle.textContent = '游戏信息';
                    if (switchText) switchText.textContent = '聊天';

                    // 切换后滚动到底部
                    this.scrollToBottom(this.infoContainer);
                }
            });
            this.panelSwitchBound = true;
        }

        // 更新按钮显示状态
        this.updatePanelSwitchButtonVisibility();
    }

    // 滚动容器到底部
    scrollToBottom(container) {
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // 更新面板切换按钮的显示状态
    updatePanelSwitchButtonVisibility() {
        const switchBtn = document.getElementById('panelSwitchBtn');
        if (!switchBtn) return;

        // 检查游戏模式，只在联机模式下显示面板切换按钮
        const isOnlineMultiplayer = this.gameState.getIsOnlineMultiplayer();
        // 仅在线联机模式显示；本地多人不支持文字聊天，因此隐藏
        switchBtn.style.display = isOnlineMultiplayer ? 'block' : 'none';
    }

    // addMessage 方法（仅调整自动滚动逻辑）
    addMessage(messageData, skipSync = false) {
        const { type, player } = messageData;

        // 判断是聊天消息还是游戏信息
        const isChatMessage = type === 'chat_message';
        const targetContainer = isChatMessage ? this.chatContainer : this.infoContainer;
        const isTargetInteracting = isChatMessage ? this.isChatInteracting : this.isUserInteracting;

        if (!targetContainer) {
            return;
        }

        // 只有当 isSkipList = false 时，才将消息添加到右侧面板
        let isSkipList = false;

        if (type === 'chess_beat') {
            const isSkillModeForList = window.gameInstance?.energyManager?.isSkillModeEnabled();
            if (isSkillModeForList && !messageData.data.isRemoteDiceMove) {
                isSkipList = true;
            }
        }

        if (type === 'energy_gain' && messageData.data.source === 'kill') {
             const isSkillModeForList = window.gameInstance?.energyManager?.isSkillModeEnabled();
             if (isSkillModeForList && messageData.data.isRemoteDiceMove) {
                 isSkipList = true;
             }
        }

        if (!isSkipList) {
            const messageElement = document.createElement('div');
            messageElement.className = 'info-message';
            messageElement.innerHTML = this.formatMessage(messageData);
            // 添加新消息到容器底部
            targetContainer.appendChild(messageElement);

            // 限制消息数量（原有逻辑不变）
            while (targetContainer.children.length > this.maxMessages) {
                targetContainer.removeChild(targetContainer.firstChild);
            }

            // 仅当"用户无交互"时，才自动滚动到底部
            if (!isTargetInteracting) {
                // 使用 requestAnimationFrame 确保 DOM 渲染完成后再滚动（避免高度计算误差）
                requestAnimationFrame(() => {
                    targetContainer.scrollTop = targetContainer.scrollHeight;
                });
            }
        }

        // 在线多人模式下同步游戏信息（除非明确跳过同步）
        if (!skipSync && window.gameInstance && window.gameInstance.multiplayerGameManager &&
            window.gameInstance.multiplayerGameManager.isOnlineMode) {
            window.gameInstance.multiplayerGameManager.syncGameInfo(messageData);
        }

        // 显示弹框通知
        const isNonLocal = this.isNonLocalPlayer(player);

        // 默认情况下使用 formatMessage() 作为 notificationText
        let notificationText = this.formatMessage(messageData);

        if (type === 'skill_usage') {
            if (messageData.data.skillName) {
                if (messageData.data.skillName === '传送门' && messageData.data.moveType !== 'teleport') {
                    // 如果只是激活传送门（未传送），不提示
                    notificationText = '';
                } else if (!isNonLocal && messageData.data.skillName !== '遥控骰子' && messageData.data.skillName !== '多面骰子' && messageData.data.skillName !== '传送门') {
                    // 其他道具只对非本地玩家提示
                    notificationText = '';
                }
            }
        } else if (type === 'chess_beat') {
            if (messageData.data.skipNotification) {
                notificationText = ''; // 叠子碰撞等情况不弹出单独击杀提示
            } else {
                // 如果开启了道具模式，并且不是遥控骰子击杀，那么在击杀时不弹出通知（因为会有积分获取的通知代替）
                const isSkillMode = window.gameInstance?.energyManager?.isSkillModeEnabled();
                const isRemoteDiceMove = messageData.data.isRemoteDiceMove;
                if (isSkillMode && !isRemoteDiceMove) {
                    notificationText = '';
                }
            }
        } else if (type === 'energy_gain') {
            if (messageData.data.source !== 'kill' && !isNonLocal) {
                notificationText = '';
            } else {
                const amountStr = Number.isInteger(messageData.data.amount) ? messageData.data.amount : messageData.data.amount.toFixed(1);
                const playerName = this.getPlayerName(player);
                const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
                const energySpan = `<span class="energy-value-text">+${amountStr}积分</span>`;
                
                if (messageData.data.source === 'kill') {
                    const targetPlayer = messageData.data.targetPlayer;
                    const hasTarget = targetPlayer !== undefined && targetPlayer !== null;
                    const targetName = hasTarget ? this.getPlayerName(targetPlayer) : '对手';
                    const targetSpan = hasTarget ? `<span class="player-text player-${targetPlayer}">${targetName}</span>` : `<span class="action-text">对手</span>`;
                    notificationText = `${playerSpan}<span class="beat-text"> 击败了 </span>${targetSpan} ${energySpan}`;
                } else if (messageData.data.source === 'mysteryBox') {
                    notificationText = `${playerSpan}<span class="action-text"> 使用了盲盒 </span>${energySpan}`;
                } else {
                    notificationText = `${playerSpan}<span class="action-text"> 获得 </span>${energySpan}`;
                }
            }
        } else if (type !== 'skill_usage' && type !== 'energy_gain' && type !== 'chess_beat' && type !== 'stack_collision' && type !== 'three_sixes_penalty' && type !== 'chess_finish') {
            notificationText = '';
        }

        if (notificationText && window.gameInstance?.skillManager) {
            window.gameInstance.skillManager.showNotification(notificationText);
        }
    }

    // 格式化消息内容
    formatMessage(messageData) {
        const { type, player, data } = messageData;

        switch (type) {
            case 'dice_roll':
                return this.formatDiceRoll(player, data.value);

            case 'chess_move':
                return this.formatChessMove(player, data.chessIndex, data.fromPosition, data.toPosition, data.moveType);

            case 'chess_beat':
                return this.formatChessBeat(player, data.targetPlayer, data.targetChess, data.position);

            case 'chess_launch':
                return this.formatChessLaunch(player, data.chessIndex);

            case 'chess_finish':
                return this.formatChessFinish(player, data.chessIndex);

            case 'three_sixes_penalty':
                return this.formatThreeSixesPenalty(player);

            case 'stack_collision':
                return this.formatStackCollision(player, data.targetPlayer, data.position);

            case 'stack_block':
                return this.formatStackBlock(player, data.targetPlayer, data.position);

            case 'no_movable_chess':
                return this.formatNoMovableChess(player, data.diceValue);

            case 'skill_usage':
                return this.formatSkillUsage(player, data);

            case 'energy_gain':
                return this.formatEnergyGain(player, data.amount, data.source, data.targetPlayer);

            case 'player_win':
                return this.formatPlayerWin(player);

            case 'thinking_timeout':
                return this.formatThinkingTimeout(player);

            case 'game_start':
                return this.formatGameStart(player);

            case 'consecutive_bonus':
                return this.formatConsecutiveBonus(player);

            case 'stack_formation':
                return this.formatStackFormation(player);

            case 'gamePause':
                return this.formatGamePause();

            case 'gameResume':
                return this.formatGameResume();

            case 'chat_message':
                return this.formatChatMessage(player, data.message, data.playerName);

            default:
                return this.formatGenericMessage(messageData);
        }
    }

    // 获取玩家名称的辅助方法
    getPlayerName(player) {
        return playerNameManager.getPlayerName(player);
    }

    // 判断玩家是否是非本地人类玩家
    isNonLocalPlayer(player) {
        if (!this.gameState) return false;
        
        // 1. 如果是AI控制的玩家（预设机器人或本地AI托管），视为非本地玩家
        const isBot = this.gameState.isBotPlayer(player);
        
        let isTakeover = false;
        if (this.gameState.isOnlineMultiplayer && window.gameInstance?.multiplayerGameManager) {
            const playerId = window.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(player);
            const playerData = window.gameInstance.multiplayerGameManager.players?.get(playerId);
            isTakeover = window.gameInstance.multiplayerGameManager.aiTakeoverPlayers?.has(playerId) || 
                         playerData?.isAITakeover || false;
        } else {
            isTakeover = this.gameState.getIsAITakeover();
        }
        
        if (isBot || isTakeover) return true;
        
        // 2. 如果是在线模式，且不是当前客户端绑定的玩家
        if (this.gameState.getIsOnlineMultiplayer() && window.gameInstance?.multiplayerGameManager) {
            const localPlayerId = window.gameInstance.multiplayerGameManager.playerId;
            const actionPlayerId = window.gameInstance.multiplayerGameManager.getPlayerIdByPlayerNumber(player);
            if (localPlayerId !== actionPlayerId) {
                return true;
            }
        }
        
        return false;
    }

    // 格式化骰子投掷消息
    formatDiceRoll(player, value) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="action-text"> 投掷了 </span>`;
        const diceSpan = value === 6
            ? `<span class="dice-special">${value}</span>`
            : `<span class="dice-text">${value}</span>`;
        const pointSpan = `<span class="action-text"> 点</span>`;

        return `${playerSpan}${actionSpan}${diceSpan}${pointSpan}`;
    }

    // 格式化棋子移动消息
    formatChessMove(player, chessIndex, fromPosition, toPosition, moveType = 'move') {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="action-text"> 选择了棋子${chessIndex + 1} </span>`;

        let moveTypeSpan = '';
        switch (moveType) {
            case 'launch':
                moveTypeSpan = `<span class="move-type-launch">[起飞]</span>`;
                break;
            case 'teleport':
                moveTypeSpan = `<span class="skill-name-text">[传送]</span>`;
                break;
            case 'move':
                moveTypeSpan = `<span class="move-type-move">[移动]</span>`;
                break;
            case 'jump':
                moveTypeSpan = `<span class="move-type-jump">[跳子]</span>`;
                break;
            case 'fly':
                moveTypeSpan = `<span class="move-type-fly">[飞棋]</span>`;
                break;
            default:
                moveTypeSpan = `<span class="move-type-move">[移动]</span>`;
        }

        return `${playerSpan}${actionSpan}${moveTypeSpan}`;
    }

    // 格式化棋子击败消息
    formatChessBeat(player, targetPlayer, targetChess, position) {
        const playerName = this.getPlayerName(player);
        const targetPlayerName = this.getPlayerName(targetPlayer);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="beat-text"> 击败 </span>`;
        const targetSpan = `<span class="player-text player-${targetPlayer}">${targetPlayerName}</span>`;
        const exclamationSpan = `<span class="action-text">！</span>`;

        return `${playerSpan}${actionSpan}${targetSpan}${exclamationSpan}`;
    }

    // 格式化棋子出发消息
    formatChessLaunch(player, chessIndex) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="action-text"> 的棋子${chessIndex + 1} 出发了</span>`;

        return `${playerSpan}${actionSpan}`;
    }

    // 格式化棋子完成消息
    formatChessFinish(player, chessIndex) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="action-text"> 的棋子${chessIndex + 1} </span>`;
        const finishSpan = `<span class="finish-text">到达终点</span>`;
        const exclamationSpan = `<span class="action-text">！</span>`;

        return `${playerSpan}${actionSpan}${finishSpan}${exclamationSpan}`;
    }

    // 格式化三次6惩罚消息
    formatThreeSixesPenalty(player) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="action-text"> 连续投掷3次 </span>`;
        const diceSpan = `<span class="dice-special">6</span>`;
        const penaltySpan = `<span class="action-text"> 点，所有棋子返回起点！</span>`;

        return `${playerSpan}${actionSpan}${diceSpan}${penaltySpan}`;
    }

    // 格式化叠子碰撞消息
    formatStackCollision(player, targetPlayer, position) {
        const playerName = this.getPlayerName(player);
        const targetPlayerName = this.getPlayerName(targetPlayer);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="action-text"> 与 </span>`;
        const targetSpan = `<span class="player-text player-${targetPlayer}">${targetPlayerName}</span>`;
        const deSpan = `<span class="action-text"> 的</span>`;
        const stackTextSpan = `<span class="stack-text"> [叠子] </span>`;
        const collisionSpan = `<span class="action-text">发生碰撞，双方的棋子都得返回起点</span>`;

        return `${playerSpan}${actionSpan}${targetSpan}${deSpan}${stackTextSpan}${collisionSpan}`;
    }

    // 格式化叠子阻挡消息
    formatStackBlock(player, targetPlayer, position) {
        const playerName = this.getPlayerName(player);
        const targetPlayerName = this.getPlayerName(targetPlayer);
        const targetSpan = `<span class="player-text player-${targetPlayer}">${targetPlayerName}</span>`;
        const actionSpan1 = `<span class="action-text"> 的</span>`;
        const stackSpan = `<span class="stack-text"> [叠子] </span>`;
        const actionSpan2 = `<span class="action-text"> 挡住了 </span>`;
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const blockSpan = `<span class="action-text"> 的去路</span>`;

        return `${targetSpan}${actionSpan1}${stackSpan}${actionSpan2}${playerSpan}${blockSpan}`;
    }

    // 格式化无法移动消息
    formatNoMovableChess(player, diceValue) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const noMoveSpan = `<span class="action-text"> 无法移动任何棋子</span>`;

        return `${playerSpan}${noMoveSpan}`;
    }

    // 格式化道具使用消息
    formatSkillUsage(player, data) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const skillSpan = `<span class="action-text"> 使用了道具 </span>`;
        const skillNameSpan = `<span class="skill-name-text">[${data.skillName}]</span>`;
        
        let extraInfo = '';
        if (data.skillName === '遥控骰子' && data.diceValue) {
            extraInfo = `<span class="action-text">，选择了 </span><span class="dice-special">${data.diceValue}</span><span class="action-text"> 点</span>`;
        } else if (data.skillName === '多面骰子' && data.diceValue) {
            extraInfo = `<span class="action-text">，投出了 </span><span class="dice-special">${data.diceValue}</span><span class="action-text"> 点</span>`;
        } else if (data.skillName === '传送门' && data.moveType === 'teleport') {
            const fromPos = data.fromPosition === -1 ? 0 : data.fromPosition;
            const toPos = data.toPosition;
            const spaces = toPos - fromPos;
            if (spaces > 0) {
                extraInfo = `<span class="action-text">，前进了 </span><span class="teleport-distance-text">${spaces}</span><span class="action-text"> 格</span>`;
            } else if (spaces < 0) {
                extraInfo = `<span class="action-text">，后退了 </span><span class="teleport-distance-text">${-spaces}</span><span class="action-text"> 格</span>`;
            } else {
                extraInfo = `<span class="action-text">，位置未变</span>`;
            }
        }

        return `${playerSpan}${skillSpan}${skillNameSpan}${extraInfo}`;
    }

    // 格式化积分获取消息
    formatEnergyGain(player, amount, source = 'mysteryBox', targetPlayer = null) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const energySpan = `<span class="energy-value-text">${amount}</span>`;
        const actionSpan2 = `<span class="action-text"> 点积分</span>`;

        let actionSpan1 = `<span class="action-text"> 获得 </span>`;
        if (source === 'kill') {
            const hasTarget = targetPlayer !== undefined && targetPlayer !== null;
            const targetName = hasTarget ? this.getPlayerName(targetPlayer) : '对手';
            const targetSpan = hasTarget ? `<span class="player-text player-${targetPlayer}">${targetName}</span>` : `<span class="action-text"> 对手 </span>`;
            actionSpan1 = `<span class="beat-text"> 击败了 </span>${targetSpan}<span class="action-text">！获得 </span>`;
        } else if (source === 'mysteryBox') {
            actionSpan1 = `<span class="action-text"> 使用了盲盒，获得 </span>`;
        }

        return `${playerSpan}${actionSpan1}${energySpan}${actionSpan2}`;
    }

    // 格式化玩家获胜消息
    formatPlayerWin(player) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const winSpan = `<span class="action-text"> 获得胜利！</span>`;

        return `${playerSpan}${winSpan}`;
    }

    // 格式化思考超时消息
    formatThinkingTimeout(player) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const timeoutSpan = `<span class="action-text"> 思考时间到，开启AI托管</span>`;

        return `${playerSpan}${timeoutSpan}`;
    }

    // 格式化游戏开始信息
    formatGameStart(player) {
        const playerName = this.getPlayerName(player);
        return `<span class="action-text">游戏开始，等待 </span><span class="player-text player-${player}">${playerName}</span><span class="action-text"> 操作</span>`;
    }

    // 格式化通用消息
    formatGenericMessage(messageData) {
        return `<span class="action-text">${JSON.stringify(messageData)}</span>`;
    }

    // 格式化连投奖励消息
    formatConsecutiveBonus(player) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="action-text"> 获得</span>`;
        const bonusSpan = `<span class="consecutive-bonus"> [连投奖励]</span>`;

        return `${playerSpan}${actionSpan}${bonusSpan}`;
    }

    // 格式化叠子形成消息
    formatStackFormation(player) {
        const playerName = this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${playerName}</span>`;
        const actionSpan = `<span class="action-text"> 的棋子形成</span>`;
        const stackSpan = `<span class="stack-text"> [叠子]</span>`;

        return `${playerSpan}${actionSpan}${stackSpan}`;
    }

    // 格式化游戏暂停消息
    formatGamePause() {
        const actionSpan = `<span class="action-text">游戏已暂停</span>`;
        return actionSpan;
    }

    // 格式化游戏继续消息
    formatGameResume() {
        const actionSpan = `<span class="action-text">游戏已继续</span>`;
        return actionSpan;
    }

    // 格式化聊天消息
    formatChatMessage(player, message, playerName = null) {
        // 如果player为null，说明是系统消息，直接返回消息内容
        if (player === null || player === undefined) {
            return `<span class="system-message-text">${message}</span>`;
        }

        // 优先使用传入的playerName，否则使用playerNameManager获取
        const displayName = playerName || this.getPlayerName(player);
        const playerSpan = `<span class="player-text player-${player}">${displayName}</span>`;
        const colonSpan = `<span class="action-text">: </span>`;
        const messageSpan = `<span class="chat-message-text">${message}</span>`;

        return `${playerSpan}${colonSpan}${messageSpan}`;
    }

    // 便捷方法：添加骰子投掷信息
    addDiceRoll(player, value, skipSync = false) {
        this.addMessage({
            type: 'dice_roll',
            player: player,
            data: { value: value }
        }, skipSync);
    }
    /**
      * 添加棋子移动信息
      */
    addChessMove(player, chessIndex, moveType = 'move', fromPosition = null, toPosition = null) {
        this.addMessage({
            type: 'chess_move',
            player: player,
            data: { chessIndex, moveType, fromPosition, toPosition }
        });
    }

    // 便捷方法：添加棋子击败信息
    addChessBeat(player, targetPlayer, targetChess, skipSync = false, isRemoteDiceMove = false, skipNotification = false) {
        this.addMessage({
            type: 'chess_beat',
            player: player,
            data: { targetPlayer, targetChess, isRemoteDiceMove, skipNotification }
        }, skipSync);
    }

    // 便捷方法：添加三次6惩罚信息
    addThreeSixesPenalty(player, skipSync = false) {
        this.addMessage({
            type: 'three_sixes_penalty',
            player: player,
            data: {}
        }, skipSync);
    }

    // 便捷方法：添加叠子碰撞信息
    addStackCollision(player, targetPlayer, skipSync = false) {
        this.addMessage({
            type: 'stack_collision',
            player: player,
            data: { targetPlayer }
        }, skipSync);
    }

    // 便捷方法：添加叠子阻挡信息
    addStackBlock(player, targetPlayer) {
        this.addMessage({
            type: 'stack_block',
            player: player,
            data: { targetPlayer }
        });
    }

    // 便捷方法：添加无法移动信息
    addNoMovableChess(player, diceValue, skipSync = false) {
        this.addMessage({
            type: 'no_movable_chess',
            player: player,
            data: { diceValue }
        }, skipSync);
    }

    // 便捷方法：添加道具使用信息
    addSkillUsage(player, skillName, extraData = {}, skipSync = false) {
        this.addMessage({
            type: 'skill_usage',
            player: player,
            data: { skillName, ...extraData }
        }, skipSync);
    }

    // 便捷方法：添加积分获取信息
    addEnergyGain(player, amount, skipSync = false, source = 'mysteryBox', targetPlayer = null, targetChessIndex = null) {
        this.addMessage({
            type: 'energy_gain',
            player: player,
            data: { amount, source, targetPlayer, targetChessIndex }
        }, skipSync);
    }

    // 便捷方法：添加棋子完成信息
    addChessFinish(player, chessIndex) {
        this.addMessage({
            type: 'chess_finish',
            player: player,
            data: { chessIndex }
        });
    }

    // 便捷方法：添加玩家获胜信息
    addPlayerWin(player) {
        this.addMessage({
            type: 'player_win',
            player: player,
            data: {}
        });
    }

    // 便捷方法：添加游戏开始信息
    addGameStart(currentPlayer, skipSync = false) {
        this.addMessage({
            type: 'game_start',
            player: currentPlayer,
            data: {}
        }, skipSync);
    }

    // 便捷方法：添加思考超时信息
    addThinkingTimeout(player, skipSync = false) {
        return;
    }

    // 便捷方法：添加连投奖励信息
    addConsecutiveBonus(player) {
        this.addMessage({
            type: 'consecutive_bonus',
            player: player,
            data: {}
        });
    }

    // 便捷方法：添加叠子形成信息
    addStackFormation(player) {
        this.addMessage({
            type: 'stack_formation',
            player: player,
            data: {}
        });
    }

    // 添加游戏暂停消息
    addGamePause(skipSync = false) {
        this.addMessage({
            type: 'gamePause',
            timestamp: Date.now()
        }, skipSync);
    }

    // 添加游戏继续消息
    addGameResume(skipSync = false) {
        this.addMessage({
            type: 'gameResume',
            timestamp: Date.now()
        }, skipSync);
    }

    // 便捷方法：添加聊天消息
    addChatMessage(player, message, playerName = null, skipSync = false) {
        this.addMessage({
            type: 'chat_message',
            player: player,
            data: { message, playerName }
        }, skipSync);
    }
}

// 创建全局实例
export const gameInfo = new GameInfo();
export default GameInfo;