interface SpamConfig {
    historySize: number; // 保留最近几条消息做对比 (建议 5-10)
    floodTimeWindow: number; // 频率检测窗口(毫秒)
    floodMaxCount: number; // 窗口内最大允许条数 / 复读最大允许次数
    warningLevelDecayPeriod: number; // 警告等级衰减周期 (毫秒)
}

interface UserState {
    lastMessages: { content: string; timestamp: number }[];
    warningLevel: number;
}

export class SpamDetector {
    private userStates: Map<number, UserState> = new Map();
    private config: SpamConfig;

    constructor(config: Partial<SpamConfig> = {}) {
        this.config = {
            historySize: 5,
            floodTimeWindow: 5000,
            floodMaxCount: 4,
            warningLevelDecayPeriod: 1000 * 60 * 30,
            ...config
        };
        setInterval(() => this.cleanup(), 1000 * 60 * 10);
        setInterval(() => this.decreaseWarningLevelForAll(), this.config.warningLevelDecayPeriod);
    }

    private triggerViolation(userId: number, level: number) {
        if (!this.userStates.has(userId)) {
            this.userStates.set(userId, { lastMessages: [], warningLevel: 0 });
        }
        const state = this.userStates.get(userId)!;
        state.warningLevel += level;
    }

    private getWarningLevel(userId: number): number {
        return this.userStates.get(userId)?.warningLevel || 0;
    }

    /**
     * 核心检测函数
     * @param userId 发送者ID
     * @param rawContent 原始消息内容
     * @returns result: { isSpam: boolean, level: number, reason: string }
     */
    public detect(userId: number, rawContent: string): { isSpam: boolean; level?: number; reason?: string } {
        if (!this.userStates.has(userId)) {
            this.userStates.set(userId, { lastMessages: [], warningLevel: 0 });
        }
        const state = this.userStates.get(userId)!;
        const now = Date.now();

        const cleanedContent = this.cleanText(rawContent);

        const recentMessages = state.lastMessages.filter(m => now - m.timestamp < this.config.floodTimeWindow);
        if (recentMessages.length >= this.config.floodMaxCount) {
            this.triggerViolation(userId, 1);
            return { isSpam: true, level: this.getWarningLevel(userId), reason: '频率过高' };
        }

        const sameContentCount = state.lastMessages.filter(m => m.content === cleanedContent).length;
        if (sameContentCount >= this.config.floodMaxCount) {
            this.triggerViolation(userId, 1); // 增加怒气值
            this.recordMessage(state, cleanedContent, now);
            return {
                isSpam: true,
                level: this.getWarningLevel(userId),
                reason: `复读过多 (已重复 ${sameContentCount + 1} 次)`
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
        const expireTime = 1000 * 60 * 10;
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

    private decreaseWarningLevelForAll() {
        for (const state of this.userStates.values()) {
            if (state.warningLevel > 0) {
                state.warningLevel = Math.max(0, state.warningLevel - 1);
            }
        }
    }
}
