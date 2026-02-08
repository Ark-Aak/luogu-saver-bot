import { z } from 'zod';
import { NapcatSchema } from "./napcat";
import { CommandSchema } from "./command";
import { EmailSchema } from "@/config/schemas/email";
import { SaverSchema } from "@/config/schemas/saver";

export const AppConfigSchema = z.object({
    napcat: NapcatSchema,
    command: CommandSchema,
    email: EmailSchema,
    saver: SaverSchema
});

export type AppConfig = z.infer<typeof AppConfigSchema>;