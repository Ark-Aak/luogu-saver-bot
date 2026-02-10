import { AllMessageEvent, Command, CommandScope } from '.';
import { NapLink } from '@naplink/naplink';
import axios from 'axios';
import { db } from '@/db';
import { users } from '@/db/schema';
import { MessageBuilder } from '@/utils/message-builder';
import { getTargetId, sendAutoMessage } from '@/utils/client';
import { sendEmail } from '@/utils/resend';
import { logger } from '@/utils/logger';

export class BindCommand implements Command<AllMessageEvent> {
    name = 'bind';
    description = 'Bind your QQ account with your email for better service.';
    usage = {
        luogu: '/bind luogu <32位luogu_token>',
        email: '/bind email <邮箱>',
        verify: '/bind verify <6位验证码>'
    };
    scope: CommandScope = 'both';
    validateArgs = (args: string[]) => {
        if (args.length !== 2) return false;
        if (!['luogu', 'email', 'verify'].includes(args[0])) return false;
        if (args[0] === 'luogu') {
            const luoguIdRegex = /^[0-9a-f]{32}$/;
            return luoguIdRegex.test(args[1]);
        } else if (args[0] === 'verify') {
            const codeRegex = /^[A-Z0-9]{6}$/;
            return codeRegex.test(args[1]);
        } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(args[1]);
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
        const isPrivate = data.message_type === 'private';
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
                    const msg = `与洛谷用户 ${luoguId} 绑定成功。`;
                    const msgObject = new MessageBuilder()
                        .reply(data.message_id)
                        .atIf(!isPrivate, data.user_id)
                        .text(msg)
                        .build();
                    await sendAutoMessage(client, isPrivate, getTargetId(data), msgObject);
                } else {
                    const msgObject = new MessageBuilder()
                        .reply(data.message_id)
                        .atIf(!isPrivate, data.user_id)
                        .text('保存站令牌无效或网络不稳定，请检查后重新绑定。')
                        .build();
                    logger.info(
                        `Binding failed for user ${data.user_id} with token ${args[1]}`,
                        resp.data
                    );
                    await sendAutoMessage(client, isPrivate, getTargetId(data), msgObject);
                }
                try {
                    if (!isPrivate) {
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
                const msg = `验证码已发送至 ${args[1]}。\n请查收并使用 "/bind verify <验证码>" 命令完成绑定。\n验证码有效期为 10 分钟。`;
                const msgObject = new MessageBuilder()
                    .reply(data.message_id)
                    .atIf(!isPrivate, data.user_id)
                    .text(msg)
                    .build();
                await sendAutoMessage(client, isPrivate, getTargetId(data), msgObject);
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
                const msg = `与邮箱 ${email} 绑定成功。`;
                const msgObject = new MessageBuilder()
                    .reply(data.message_id)
                    .atIf(!isPrivate, data.user_id)
                    .text(msg)
                    .build();
                await sendAutoMessage(client, isPrivate, getTargetId(data), msgObject);
            }
        } catch (error) {
            const msg = `验证失败：${error instanceof Error ? error.message : '未知错误'}`;
            const msgObject = new MessageBuilder()
                .reply(data.message_id)
                .atIf(!isPrivate, data.user_id)
                .text(msg)
                .build();
            await sendAutoMessage(client, isPrivate, getTargetId(data), msgObject);
            return;
        }
    }
}
