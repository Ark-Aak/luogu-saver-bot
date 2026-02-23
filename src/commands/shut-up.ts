import { Command, CommandScope } from "@/types";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { isValidPositiveInteger } from "@/utils/validator";
import { reply } from "@/utils/client";

export class ShutUpCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = '/闭嘴';
    description = '干掉某个人。';
    usage = '/闭嘴 <QQ> [Duration]';
    scope: CommandScope = 'group';
    validateArgs(args: string[]): boolean {
        if (args.length < 1 || args.length > 2) {
            return false;
        }
        if (!isValidPositiveInteger(args[0])) {
            return false;
        }
        if (args.length === 2 && !isValidPositiveInteger(args[1])) {
            return false;
        }
        return true;
    }

    async execute(args: string[], client: any, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const userId = parseInt(args[0], 10);
        const duration = args.length === 2 ? parseInt(args[1], 10) : 600;
        try {
            await client.setGroupBan(data.group_id, userId, duration);
            await reply(client, data, `指令执行成功。`);
        } catch (error) {
            await reply(client, data, `指令执行失败。可能没有权限或用户不存在。`);
        }
    }
}