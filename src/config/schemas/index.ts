import { z } from 'zod';
import { NapcatSchema } from './napcat';
import { CommandSchema } from './command';
import { EmailSchema } from '@/config/schemas/email';
import { SaverSchema } from '@/config/schemas/saver';
import { AliyunSchema } from '@/config/schemas/aliyun';
import { AntiSpamSchema } from '@/config/schemas/anti-spam';
import { QaSchema } from '@/config/schemas/qa';
import { WebhookSchema } from '@/config/schemas/webhook';
import { GroupSchema } from '@/config/schemas/group';
import { RngdleSchema } from '@/config/schemas/rngdle';

export const AppConfigSchema = z.object({
    napcat: NapcatSchema,
    command: CommandSchema,
    email: EmailSchema,
    saver: SaverSchema,
    aliyun: AliyunSchema,
    antiSpam: AntiSpamSchema,
    qa: QaSchema,
    webhook: WebhookSchema,
    group: GroupSchema,
    rngdle: RngdleSchema
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
