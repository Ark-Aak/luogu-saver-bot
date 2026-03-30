import { Command, CommandScope } from '@/types';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { reply } from '@/utils/client';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { isModuleEnabled, setModuleEnabled, listDisabledModules } from '@/utils/module-toggle';
import { commands } from '@/commands';

const SPECIAL_MODULES = ['anti-spam'];

function resolveModuleName(name: string): string | null {
    if (SPECIAL_MODULES.includes(name)) {
        return name;
    }
    const command = commands.find(cmd => cmd.name === name || cmd.aliases?.includes(name));
    return command?.name ?? null;
}

export class ToggleCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'toggle';
    aliases = ['开关'];
    description = '按群开关指令或模块（默认全部开启）。';
    usage = {
        list: '/toggle list',
        enable: '/toggle enable <模块名>',
        disable: '/toggle disable <模块名>'
    };
    scope: CommandScope = 'group';

    validateArgs(args: string[]): boolean {
        if (args.length === 0) return false;
        const action = args[0];
        if (action === 'list') return args.length === 1;
        if (action === 'enable' || action === 'disable') return args.length === 2;
        return false;
    }

    async execute(args: string[], client: any, data: OneBotV11.GroupMessageEvent): Promise<void> {
        if (!isSuperUser(data.user_id) && !(await isAdminByData(client, data))) {
            await reply(client, data, '权限不足，需要管理员或超级管理员权限。');
            return;
        }

        const action = args[0];

        if (action === 'list') {
            await this.handleList(client, data);
        } else if (action === 'enable') {
            await this.handleToggle(args[1], true, client, data);
        } else if (action === 'disable') {
            await this.handleToggle(args[1], false, client, data);
        }
    }

    private async handleList(client: any, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const disabled = await listDisabledModules(data.group_id);
        if (disabled.length === 0) {
            await reply(client, data, '本群所有模块均已开启。');
            return;
        }
        await reply(client, data, `本群已关闭的模块：\n${disabled.map((m, i) => `${i + 1}. ${m}`).join('\n')}`);
    }

    private async handleToggle(
        name: string,
        enabled: boolean,
        client: any,
        data: OneBotV11.GroupMessageEvent
    ): Promise<void> {
        const moduleName = resolveModuleName(name);
        if (!moduleName) {
            await reply(client, data, `未找到模块 "${name}"。可用的特殊模块：${SPECIAL_MODULES.join(', ')}。`);
            return;
        }

        const current = await isModuleEnabled(data.group_id, moduleName);
        if (current === enabled) {
            await reply(client, data, `模块 "${moduleName}" 在本群已经是${enabled ? '开启' : '关闭'}状态。`);
            return;
        }

        await setModuleEnabled(data.group_id, moduleName, enabled);
        await reply(client, data, `已${enabled ? '开启' : '关闭'}本群的模块 "${moduleName}"。`);
    }
}
