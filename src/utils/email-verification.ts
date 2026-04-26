import { config } from '@/config';
import { sendEmail } from '@/utils/resend';

export type VerificationRecord<TPayload> = {
    email: string;
    code: string;
    payload: TPayload;
};

export class EmailVerificationStore<TPayload> {
    private records = new Map<number, VerificationRecord<TPayload>>();
    private lastSendTime = new Map<number, number>();

    create(userId: number, email: string, payload: TPayload): VerificationRecord<TPayload> {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const record = { email, code, payload };
        this.records.set(userId, record);
        setTimeout(() => this.records.delete(userId), config.email.verificationExpireMs);
        return record;
    }

    assertCanSend(userId: number): void {
        const lastTime = this.lastSendTime.get(userId) || 0;
        if (Date.now() - lastTime < config.email.verificationCooldownMs) {
            throw new Error('请勿频繁发送验证码，稍后再试。');
        }
    }

    markSent(userId: number): void {
        this.lastSendTime.set(userId, Date.now());
    }

    verify(userId: number, code: string): VerificationRecord<TPayload> | null {
        const record = this.records.get(userId);
        if (!record || record.code !== code) {
            return null;
        }

        this.records.delete(userId);
        return record;
    }
}

export async function sendVerificationEmail(
    email: string,
    subject: string,
    code: string,
    purpose: string
): Promise<void> {
    const result = await sendEmail({
        to: email,
        subject,
        text: `您的 LGS-Bot ${purpose}验证码是：${code}。该验证码有效期为 10 分钟，请尽快使用。`,
        html: `<p>您的 LGS-Bot ${purpose}验证码是：<strong>${code}</strong>。</p><p>该验证码有效期为 10 分钟，请尽快使用。</p>`
    });

    if (!result.success) {
        throw new Error('验证码邮件发送失败，请稍后再试。');
    }
}
