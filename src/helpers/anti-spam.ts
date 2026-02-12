interface SpamConfig {
    historySize: number; // 保留最近几条消息做对比 (建议 5-10)
    floodTimeWindow: number; // 频率检测窗口(毫秒)
    floodMaxCount: number; // 窗口内最大允许条数 / 复读最大允许次数
    warningLevelDecayPeriod: number; // 警告等级衰减周期 (毫秒)
    messageRecordDuration: number; // 消息记录保留时间 (毫秒)
    repeatThreshold: number; // 复读检测阈值 (连续重复多少次算复读)
}

interface UserState {
    lastMessages: { content: string; timestamp: number }[];
}

export class SpamDetector {
    private userStates: Map<number, UserState> = new Map();
    private warningLevels: Map<number, number> = new Map();
    private warningDecayTimers: Map<number, NodeJS.Timeout> = new Map();
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
        setInterval(() => this.cleanup(), this.config.messageRecordDuration);
    }

    private triggerViolation(userId: number, level: number) {
        const currentLevel = this.warningLevels.get(userId) || 0;
        this.warningLevels.set(userId, currentLevel + level);

        this.resetDecayTimer(userId);
    }

    private resetDecayTimer(userId: number) {
        if (this.warningDecayTimers.has(userId)) {
            clearInterval(this.warningDecayTimers.get(userId)!);
        }

        const timer = setInterval(() => {
            const currentLevel = this.warningLevels.get(userId) || 0;
            if (currentLevel > 0) {
                const newLevel = currentLevel - 1;
                if (newLevel === 0) {
                    this.warningLevels.delete(userId);
                    if (this.warningDecayTimers.has(userId)) {
                        clearInterval(this.warningDecayTimers.get(userId)!);
                        this.warningDecayTimers.delete(userId);
                    }
                } else {
                    this.warningLevels.set(userId, newLevel);
                }
            }
        }, this.config.warningLevelDecayPeriod);

        this.warningDecayTimers.set(userId, timer);
    }

    private getWarningLevel(userId: number): number {
        return this.warningLevels.get(userId) || 0;
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

        const recentMessages = state.lastMessages.filter(m => now - m.timestamp < this.config.floodTimeWindow);
        if (recentMessages.length >= this.config.floodMaxCount) {
            this.triggerViolation(userId, 1);
            return { isSpam: true, level: this.getWarningLevel(userId), reason: '频率过高' };
        }

        let consecutiveCount = 0;
        for (let i = state.lastMessages.length - 1; i >= 0; i--) {
            if (state.lastMessages[i].content === cleanedContent) {
                consecutiveCount++;
            } else {
                break;
            }
        }

        if (consecutiveCount >= this.config.repeatThreshold) {
            this.triggerViolation(userId, 1);
            this.recordMessage(state, cleanedContent, now);
            return {
                isSpam: true,
                level: this.getWarningLevel(userId),
                reason: `连续复读 (第 ${consecutiveCount + 1} 条)`
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
