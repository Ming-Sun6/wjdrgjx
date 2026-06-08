// 闪电模式管理模块 - 处理全局动画加速和AI思考加速
export class LightningManager {
    constructor() {
        this.isEnabled = false;
        this.originalSetTimeout = window.setTimeout;
        this.lightningBtn = null;
        this.initialized = false;

        // 图标路径定义
        this.icons = {
            // 点击前：空心轮廓
            off: 'M404.208 599.305H192.493C164.852 599.305 145.785 573.031 155.621 548.517L365.994 24.1266C368.84 17.032 373.889 10.926 380.471 6.61741C387.053 2.30887 394.859 0.00115865 402.853 0H757.85C785.859 0 804.953 26.9488 794.38 51.5874L671.888 337.11H902.486C936.4 337.11 954.494 375.073 932.126 399.275L366.757 1011.06C339.273 1040.8 288.317 1015.03 298.982 976.776L404.208 599.305ZM430.034 74.9272L249.722 524.391H455.44C461.48 524.391 467.439 525.709 472.858 528.242C478.277 530.775 483.011 534.456 486.696 539.001C490.38 543.546 492.917 548.834 494.109 554.456C495.302 560.079 495.119 565.887 493.575 571.432L418.212 841.82L815.394 412.025H613.226C585.217 412.025 566.123 385.076 576.696 360.437L699.188 74.9147H430.034V74.9272Z',
            // 点击后：实心填充
            on: 'M404.208 599.305H192.493C164.852 599.305 145.785 573.031 155.621 548.517L365.994 24.1266C368.84 17.032 373.889 10.926 380.471 6.61741C387.053 2.30887 394.859 0.00115865 402.853 0H757.85C785.859 0 804.953 26.9488 794.38 51.5874L671.888 337.11H902.486C936.4 337.11 954.494 375.073 932.126 399.275L366.757 1011.06C339.273 1040.8 288.317 1015.03 298.982 976.776L404.208 599.305Z'
        };
    }

    /**
     * 初始化闪电模式
     */
    init() {
        if (this.initialized) return;
        
        this.lightningBtn = document.getElementById('lightningBtn');
        if (this.lightningBtn) {
            this.lightningBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggle();
            }, true);
            this.initialized = true;
        }
    }

    /**
     * 切换闪电模式状态
     */
    toggle() {
        this.isEnabled = !this.isEnabled;
        if (this.isEnabled) {
            this.enable();
        } else {
            this.disable();
        }
        this.updateUI();
    }

    /**
     * 开启闪电模式
     */
    enable() {
        const self = this;
        window.setTimeout = function(callback, delay) {
            // 1. 极短延迟保护：
            // 很多逻辑依赖 setTimeout(..., 0) 或 setTimeout(..., 1) 来确保执行顺序。
            // 这种情况下不能加速，否则会导致微任务队列紊乱。
            if (delay <= 10) {
                return self.originalSetTimeout.call(window, callback, delay);
            }
            
            // 2. 逻辑安全保护：
            // 对于大于 10ms 的延迟，我们将其大幅压缩。
            // 之前的 10ms 太快，导致 AI 决策和动画落位逻辑在 JS 宏任务队列中产生了严重的“时空错乱”。
            // 提升到 30ms，既能保持视觉上的极致流畅（约 33 帧/秒），又能给逻辑留出必要的执行空隙。
            const fastDelay = 30; 
            return self.originalSetTimeout.call(window, callback, fastDelay);
        };
        console.log("%c[闪电模式] 已开启！全场动画加速，安全保护逻辑已激活。", "color: #f1c40f; font-weight: bold; font-size: 16px;");
    }

    disable() {
        window.setTimeout = this.originalSetTimeout;
    }

    /**
     * 更新按钮UI状态
     */
    updateUI() {
        if (this.lightningBtn) {
            const iconPath = this.lightningBtn.querySelector('path');
            if (this.isEnabled) {
                this.lightningBtn.classList.add('active');
                this.lightningBtn.title = "动画加速：已开启";
                if (iconPath) iconPath.setAttribute('d', this.icons.on);
            } else {
                this.lightningBtn.classList.remove('active');
                this.lightningBtn.title = "动画加速";
                if (iconPath) iconPath.setAttribute('d', this.icons.off);
            }
        }
    }

    /**
     * 检查闪电按钮是否应该显示
     * 只在人机模式（非本地多人且非在线多人）下显示
     */
    shouldShowButton(gameState) {
        const isLocalMultiplayer = gameState.getIsLocalMultiplayer();
        const isOnlineMultiplayer = gameState.getIsOnlineMultiplayer();
        return !isLocalMultiplayer && !isOnlineMultiplayer;
    }
}

export const lightningManager = new LightningManager();
