import { get } from 'fast-levenshtein';

interface SpamConfig {
    historySize: number; // 保留最近几条消息做对比 (建议 5-10)
    similarityThreshold: number; // 相似度阈值 0-1 (建议 0.8)
    minContentLength: number; // 极短文本豁免长度 (建议 2-3)
    floodTimeWindow: number; // 频率检测窗口(毫秒)
    floodMaxCount: number; // 窗口内最大允许条数
    warningLevelDecayPeriod: number; // 警告等级衰减周期 (毫秒)
}

interface UserState {
    lastMessages: { content: string; timestamp: number }[];
    warningLevel: number;
}

export class SpamDetector {
    private userStates: Map<string, UserState> = new Map();
    private config: SpamConfig;

    constructor(config: Partial<SpamConfig> = {}) {
        this.config = {
            historySize: 5,
            similarityThreshold: 0.8,
            minContentLength: 3,
            floodTimeWindow: 5000,
            floodMaxCount: 4,
            warningLevelDecayPeriod: 1000 * 60 * 30,
            ...config
        };
        setInterval(() => this.cleanup(), 1000 * 60 * 10);
        setInterval(() => this.decreaseWarningLevelForAll(), this.config.warningLevelDecayPeriod);
    }

    private triggerViolation(userId: string, level: number) {
        if (!this.userStates.has(userId)) {
            this.userStates.set(userId, { lastMessages: [], warningLevel: 0 });
        }
        const state = this.userStates.get(userId)!;
        state.warningLevel += level;
    }

    private getWarningLevel(userId: string): number {
        return this.userStates.get(userId)!.warningLevel!;
    }

    /**
     * 核心检测函数
     * @param userId 发送者ID
     * @param rawContent 原始消息内容
     * @returns result: { isSpam: boolean, level: number, reason: string }
     */
    public detect(userId: string, rawContent: string): { isSpam: boolean; level?: number; reason?: string } {
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

        if (cleanedContent.length >= this.config.minContentLength) {
            for (const historyMsg of state.lastMessages) {
                const similarity = this.calculateSimilarity(cleanedContent, historyMsg.content);
                if (similarity >= this.config.similarityThreshold) {
                    this.recordMessage(state, cleanedContent, now);
                    return {
                        isSpam: true,
                        level: this.getWarningLevel(userId),
                        reason: `内容重复 (相似度: ${(similarity * 100).toFixed(0)}%)`
                    };
                }
            }
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

    private calculateSimilarity(s1: string, s2: string): number {
        if (s1 === s2) return 1.0;
        const len1 = s1.length;
        const len2 = s2.length;
        const maxLen = Math.max(len1, len2);
        if (maxLen === 0) return 1.0;

        const distance = get(s1, s2);

        return 1 - distance / maxLen;
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
