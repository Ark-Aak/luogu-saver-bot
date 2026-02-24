import { Command, CommandScope } from "@/types";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { isValidPositiveInteger, isValidUser } from "@/utils/validator";
import { reply } from "@/utils/client";
import { isAdminByData, isSuperUser } from "@/utils/permission";
import { getUserId } from "@/utils/cqcode";

export class ShutUpCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'shut-up';
    aliases = ['闭嘴'];
    description = '干掉某个人。';
    usage = '/shut-up <QQ> [Duration]';
    scope: CommandScope = 'group';
    validateArgs(args: string[]): boolean {
        if (args.length < 1 || args.length > 2) {
            return false;
        }
        if (!isValidUser(args[0])) {
            return false;
        }
        if (args.length === 2 && !isValidPositiveInteger(args[1])) {
            return false;
        }
        return true;
    }

    async execute(args: string[], client: any, data: OneBotV11.GroupMessageEvent): Promise<void> {
        if (!await isAdminByData(client, data) && !isSuperUser(data.user_id)) {
            await reply(client, data, '权限不足。');
            return;
        }
        const userId = getUserId(args[0]);
        const duration = args.length === 2 ? parseInt(args[1], 10) : 600;
        try {
            await client.setGroupBan(data.group_id, userId, duration);
            await reply(client, data, `指令执行成功。`);
        } catch (error) {
            await reply(client, data, `指令执行失败。`);
        }
    }
}