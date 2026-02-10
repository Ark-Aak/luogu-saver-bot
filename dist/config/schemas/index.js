import { z } from 'zod';
import { NapcatSchema } from "./napcat";
import { CommandSchema } from "./command";
import { EmailSchema } from "@/config/schemas/email";
import { SaverSchema } from "@/config/schemas/saver";
import { AliyunSchema } from "@/config/schemas/aliyun";
export const AppConfigSchema = z.object({
    napcat: NapcatSchema,
    command: CommandSchema,
    email: EmailSchema,
    saver: SaverSchema,
    aliyun: AliyunSchema
});
