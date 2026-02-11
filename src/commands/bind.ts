import { NapLink } from '@naplink/naplink';
import axios from 'axios';
import { db } from '@/db';
import { users } from '@/db/schema';
import { isPrivate, reply } from '@/utils/client';
import { sendEmail } from '@/utils/resend';
import { logger } from '@/utils/logger';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { isValidEmail, isValidSaverToken, isValidVerificationCode } from '@/utils/validator';

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

    verificationCode = new Map<number, { email: string; code: string }>();
    lastSendTime = new Map<number, number>();

    private generateVerificationCode(userId: number, email: string): string {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.verificationCode.set(userId, { code, email });
        setTimeout(() => this.verificationCode.delete(userId), 10 * 60 * 1000);
        return code;
    }

    private verifyCodesMatch(userId: number, code: string): boolean {
        const storedCode = this.verificationCode.get(userId);
        return storedCode?.code === code;
    }

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
                const now = Date.now();
                const lastTime = this.lastSendTime.get(data.user_id) || 0;
                if (now - lastTime < 120 * 1000) {
                    throw new Error('请勿频繁发送验证码，稍后再试。');
                }
                const code = this.generateVerificationCode(data.user_id, args[1]);
                this.lastSendTime.set(data.user_id, now);
                await sendEmail({
                    to: args[1],
                    subject: 'LGS-Bot 验证码',
                    text: `您的 LGS-Bot 绑定验证码是：${code}。该验证码有效期为 10 分钟，请尽快使用。`,
                    html: `<p>您的 LGS-Bot 绑定验证码是：<strong>${code}</strong>。</p><p>该验证码有效期为 10 分钟，请尽快使用。</p>`
                });
                await reply(
                    client,
                    data,
                    `验证码已发送至 ${args[1]}。\n请查收并使用 "/bind verify <验证码>" 命令完成绑定。\n验证码有效期为 10 分钟。`
                );
            } else {
                if (!this.verifyCodesMatch(data.user_id, args[1])) {
                    throw new Error('验证码错误或已过期，请重新获取验证码。');
                }
                const email = this.verificationCode.get(data.user_id)?.email!;
                this.verificationCode.delete(data.user_id);
                await db
                    .insert(users)
                    .values({
                        id: data.user_id,
                        email,
                        lId: 0
                    })
                    .onConflictDoUpdate({
                        target: users.id,
                        set: {
                            email
                        }
                    });
                await reply(client, data, `邮箱 ${email} 绑定成功。`);
            }
        } catch (error) {
            await reply(client, data, `验证失败：${error instanceof Error ? error.message : '未知错误'}`);
            return;
        }
    }
}
