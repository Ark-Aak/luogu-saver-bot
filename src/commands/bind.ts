import { NapLink } from '@naplink/naplink';
import axios from 'axios';
import { db } from '@/db';
import { users } from '@/db/schema';
import { isPrivate, reply } from '@/utils/client';
import { logger } from '@/utils/logger';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { isValidEmail, isValidSaverToken, isValidVerificationCode } from '@/utils/validator';
import { maskEmail } from '@/utils/email';
import { EmailVerificationStore, sendVerificationEmail } from '@/utils/email-verification';
import { getErrorMessage } from '@/utils/error';

export class BindCommand implements Command<AllMessageEvent> {
    name = 'bind';
    aliases = ['绑定'];
    description = '将你的 QQ 与邮箱和保存站绑定。';
    usage = {
        luogu: '/bind luogu <保存站令牌>',
        email: '/bind email <邮箱>',
        verify: '/bind verify <6 位验证码>'
    };
    scope: CommandScope = 'both';
    validateArgs = (args: string[]) => {
        if (args.length !== 2) return false;
        if (!['luogu', 'email', 'verify'].includes(args[0])) return false;
        if (args[0] === 'luogu') {
            return isValidSaverToken(args[1]);
        } else if (args[0] === 'verify') {
            return isValidVerificationCode(args[1]);
        } else {
            return isValidEmail(args[1]);
        }
    };

    private verificationStore = new EmailVerificationStore<null>();

    async execute(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            if (args[0] === 'luogu') {
                logger.info(`User ${data.user_id} is trying to bind with token ${args[1]}`);
                const url = `https://api.luogu.me/token/inspect`;
                const resp = await axios.get(url, {
                    headers: { Authorization: `Bearer ${args[1]}` }
                });
                if (resp.data && resp.data.code === 200) {
                    const luoguId = resp.data.data.uid;
                    await db
                        .insert(users)
                        .values({
                            id: data.user_id,
                            email: '',
                            lId: luoguId
                        })
                        .onConflictDoUpdate({
                            target: users.id,
                            set: {
                                lId: luoguId
                            }
                        });
                    await reply(client, data, `与洛谷用户 ${luoguId} 绑定成功。`);
                } else {
                    logger.info(`Binding failed for user ${data.user_id} with token ${args[1]}`, resp.data);
                    await reply(client, data, '保存站令牌无效或网络不稳定，请检查后重新绑定。');
                }
                try {
                    if (!isPrivate(data)) {
                        await client.deleteMessage(data.message_id);
                    }
                } catch {}
            } else if (args[0] === 'email') {
                this.verificationStore.assertCanSend(data.user_id);
                const verification = this.verificationStore.create(data.user_id, args[1], null);
                await sendVerificationEmail(args[1], 'LGS-Bot 验证码', verification.code, '绑定');
                this.verificationStore.markSent(data.user_id);
                await reply(
                    client,
                    data,
                    `验证码已发送至 ${maskEmail(args[1])}。\n请查收并使用 "/bind verify <验证码>" 命令完成绑定。\n验证码有效期为 10 分钟。`
                );
            } else {
                const verification = this.verificationStore.verify(data.user_id, args[1]);
                if (!verification) {
                    throw new Error('验证码错误或已过期，请重新获取验证码。');
                }
                await db
                    .insert(users)
                    .values({
                        id: data.user_id,
                        email: verification.email,
                        lId: 0
                    })
                    .onConflictDoUpdate({
                        target: users.id,
                        set: {
                            email: verification.email
                        }
                    });
                await reply(client, data, `邮箱 ${maskEmail(verification.email)} 绑定成功。`);
            }
        } catch (error) {
            await reply(client, data, `验证失败：${getErrorMessage(error)}`);
            return;
        }
    }
}
