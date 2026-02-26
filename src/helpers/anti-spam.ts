import { logger } from '@/utils/logger';

interface SpamConfig {
    historySize: number; // 保留最近几条消息做对比 (建议 5-10)
    floodTimeWindow: number; // 频率检测窗口(毫秒)
    floodMaxCount: number; // 窗口内最大允许条数 / 复读最大允许次数
    warningLevelDecayPeriod: number; // 警告等级衰减周期 (毫秒)
    messageRecordDuration: number; // 消息记录保留时间 (毫秒)
    repeatThreshold: number; // 复读检测阈值 (滑动窗口内重复多少次算复读)
}

interface UserState {
    lastMessages: { content: string; timestamp: number }[];
}

export class SpamDetector {
    private userStates: Map<number, UserState> = new Map();
    private warningLevels: Map<number, number> = new Map();
    // 统一改为单一的 NodeJS.Timeout 存储，告别嵌套与覆盖
    private warningDecayTimers: Map<number, NodeJS.Timeout> = new Map();
    private userBanInfo: Map<number, { banTime: number; banDuration: number }> = new Map();
    private config: SpamConfig;

    constructor(config: Partial<SpamConfig> = {}) {
        this.config = {
            historySize: 10,
            floodTimeWindow: 5000,
            floodMaxCount: 4,
            warningLevelDecayPeriod: 1000 * 60 * 30,
            messageRecordDuration: 1000 * 60 * 10,
            repeatThreshold: 3,
            ...config
        };
        // 这里的全局清理依然使用 setInterval，因为它是伴随类实例生命周期的，没有问题
        setInterval(() => this.cleanup(), this.config.messageRecordDuration);
    }

    private triggerViolation(userId: number, level: number) {
        const currentLevel = this.warningLevels.get(userId) || 0;
        this.warningLevels.set(userId, currentLevel + level);
    }

    /**
     * 清理用户的衰减定时器
     */
    private clearDecayTimer(userId: number) {
        if (this.warningDecayTimers.has(userId)) {
            clearTimeout(this.warningDecayTimers.get(userId));
            this.warningDecayTimers.delete(userId);
        }
    }

    /**
     * 重置并启动警告衰减定时器
     */
    private resetDecayTimer(userId: number) {
        // 1. 先安全清理可能存在的旧定时器
        this.clearDecayTimer(userId);

        const banInfo = this.userBanInfo.get(userId);
        let initialDelay = 0;

        if (banInfo) {
            const banEndTime = banInfo.banTime + banInfo.banDuration * 1000;
            const now = Date.now();
            if (now < banEndTime) {
                initialDelay = banEndTime - now;
            }
        }

        logger.info(`User ${userId} ban info:`, { initialDelay, banInfo });
        logger.info(`Setting decay timer for user ${userId} with initial delay ${initialDelay}ms`);

        // 2. 第一次衰减发生的时间 = 禁言剩余时间 + 正常的衰减周期
        this.scheduleDecayTick(userId, initialDelay + this.config.warningLevelDecayPeriod);
    }

    /**
     * 递归调度下一次衰减（核心重构：用递归 setTimeout 替代 setInterval）
     */
    private scheduleDecayTick(userId: number, delay: number) {
        const timer = setTimeout(() => {
            const currentLevel = this.warningLevels.get(userId) || 0;

            if (currentLevel > 0) {
                const newLevel = currentLevel - 1;
                if (newLevel <= 0) {
                    // 警告等级清零，彻底清理所有相关状态
                    this.warningLevels.delete(userId);
                    this.userBanInfo.delete(userId);
                    this.warningDecayTimers.delete(userId);
                } else {
                    // 没清零，更新等级，并递归调度下一次正常周期的衰减
                    this.warningLevels.set(userId, newLevel);
                    this.scheduleDecayTick(userId, this.config.warningLevelDecayPeriod);
                }
            }
        }, delay);

        this.warningDecayTimers.set(userId, timer);
    }

    private getWarningLevel(userId: number): number {
        return this.warningLevels.get(userId) || 0;
    }

    /**
     * 记录用户的禁言信息
     * @param userId 用户ID
     * @param banDuration 禁言时长（秒）
     */
    public recordBan(userId: number, banDuration: number) {
        this.userBanInfo.set(userId, {
            banTime: Date.now(),
            banDuration
        });
        this.resetDecayTimer(userId);
    }

    /**
     * 核心检测函数
     * @param userId 发送者ID
     * @param rawContent 原始消息内容
     * @returns result: { isSpam: boolean, level: number, reason: string }
     */
    public detect(userId: number, rawContent: string): { isSpam: boolean; level?: number; reason?: string } {
        if (!this.userStates.has(userId)) {
            this.userStates.set(userId, { lastMessages: [] });
        }
        const state = this.userStates.get(userId)!;
        const now = Date.now();

        const cleanedContent = this.cleanText(rawContent);

        // 1. 频率检测 (Flood Check)
        const recentMessages = state.lastMessages.filter(m => now - m.timestamp < this.config.floodTimeWindow);
        if (recentMessages.length >= this.config.floodMaxCount) {
            this.triggerViolation(userId, 1);
            return { isSpam: true, level: this.getWarningLevel(userId), reason: '频率过高' };
        }

        // 2. 复读检测 (Repeat Check) - 使用滑动窗口统计历史出现频率
        let repeatCount = 0;
        for (let i = state.lastMessages.length - 1; i >= 0; i--) {
            if (state.lastMessages[i].content === cleanedContent) {
                repeatCount++;
            }
        }

        if (repeatCount + 1 >= this.config.repeatThreshold) {
            this.triggerViolation(userId, 1);
            this.recordMessage(state, cleanedContent, now);
            return {
                isSpam: true,
                level: this.getWarningLevel(userId),
                reason: `近期高频复读 (第 ${repeatCount + 1} 次)`
            };
        }

        this.recordMessage(state, cleanedContent, now);
        return { isSpam: false };
    }

    private recordMessage(state: UserState, content: string, timestamp: number) {
        state.lastMessages.push({ content, timestamp });
        if (state.lastMessages.length > this.config.historySize) {
            state.lastMessages.shift();
        }
    }

    private cleanText(text: string): string {
        return text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();
    }

    private cleanup() {
        const now = Date.now();
        const expireTime = this.config.messageRecordDuration;
        for (const [userId, state] of this.userStates.entries()) {
            if (state.lastMessages.length > 0) {
                const lastMsgTime = state.lastMessages[state.lastMessages.length - 1].timestamp;
                if (now - lastMsgTime > expireTime) {
                    this.userStates.delete(userId);
                }
            } else {
                this.userStates.delete(userId);
            }
        }
    }
}