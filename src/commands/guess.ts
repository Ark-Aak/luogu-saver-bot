import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { Command, CommandScope } from '@/types';
import { config } from '@/config';
import { db } from '@/db';
import { guessMessageEmbeddingAuthor } from '@/helpers/message-embedding';
import { reply } from '@/utils/client';
import { createEmbedding } from '@/utils/embedding-client';
import { logSanitizedError } from '@/utils/error';
import { logger } from '@/utils/logger';

export class GuessCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'guess';
    aliases = ['猜人'];
    description = '根据已有向量画像猜测一句话最像本群哪位成员。';
    usage = '/guess <一句话>';
    scope: CommandScope = 'group';
    cooldown: number = 30 * 1000; // 30 seconds

    validateArgs(args: string[]): boolean {
        return args.length > 0 && args.join(' ').trim().length > 0;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const settings = { ...config.embedding };
        if (!settings.endpoint) {
            await reply(client, data, '尚未配置 Embedding API，无法执行猜测。');
            return;
        }
        let embedding: number[];
        try {
            embedding = await createEmbedding(args.join(' ').trim(), settings);
        } catch (error) {
            logSanitizedError(
                logger,
                `Failed to embed guess input for user ${data.user_id} in group ${data.group_id}`,
                error
            );
            await reply(client, data, '猜测失败，Embedding API 暂时不可用。');
            return;
        }

        let members: OneBotV11.GroupMemberInfo[];
        try {
            members = (await client.getGroupMemberList(data.group_id)) as OneBotV11.GroupMemberInfo[];
        } catch (error) {
            logSanitizedError(logger, `Failed to list members for guess in group ${data.group_id}`, error);
            await reply(client, data, '猜测失败，无法获取本群成员列表。');
            return;
        }

        const guess = guessMessageEmbeddingAuthor(
            db,
            data.group_id,
            members.filter(member => member.user_id !== data.self_id).map(member => member.user_id),
            embedding,
            `${settings.endpoint}\u0000${settings.model}`,
            {
                queryTimestamp: Date.now(),
                decayHalfLifeMs: settings.decayHalfLifeMs,
                minimumEffectiveWeight: settings.guessMinEffectiveWeight
            }
        );
        if (!guess) {
            await reply(
                client,
                data,
                `当前群均值或满足有效权重门槛（≥ ${settings.guessMinEffectiveWeight}）的成员画像不足，暂时无法猜测。`
            );
            return;
        }

        const member = members.find(candidate => candidate.user_id === guess.userId);
        const displayName = member?.card || member?.nickname || String(guess.userId);
        await reply(
            client,
            data,
            [
                `我猜这句话最像 ${displayName}（${guess.userId}）说的。`,
                `最高余弦相似度: ${guess.similarity.toPrecision(6)}`,
                `领先差值: ${guess.similarityMargin === null ? '无第二候选' : guess.similarityMargin.toPrecision(6)}`,
                `相对置信度: ${
                    guess.relativeConfidence === null
                        ? '无法估计（有效候选不足 2 人）'
                        : `${(guess.relativeConfidence * 100).toFixed(2)}%（${guess.candidateCount} 名有效候选，仅表示分数区分度）`
                }`,
                `当前衰减有效权重: ${guess.effectiveWeight.toPrecision(6)}（门槛 ≥ ${settings.guessMinEffectiveWeight}）`
            ].join('\n'),
            true
        );
    }
}
