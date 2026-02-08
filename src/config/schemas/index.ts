import { z } from 'zod';
import { NapcatSchema } from "./napcat";
import { CommandSchema } from "./command";
import { EmailSchema } from "@/config/schemas/email";

export const AppConfigSchema = z.object({
    napcat: NapcatSchema,
    command: CommandSchema,
    email: EmailSchema
});

export type AppConfig = z.infer<typeof AppConfigSchema>;