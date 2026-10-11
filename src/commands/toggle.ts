import { Command, CommandScope } from '@/types';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { NapLink } from '@naplink/naplink';
import { reply } from '@/utils/client';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { GROUP_FEATURE_MODULES, isModuleEnabled, setModuleEnabled } from '@/utils/module-toggle';
import { commands } from '@/commands';

const GROUP_FEATURE_MODULE_BY_NAME: Record<(typeof GROUP_FEATURE_MODULES)[number], true> = {
    'anti-spam': true,
    'image-moderation': true,
    'group-auto-review': true,
    'github-webhook': true,
    'uptime-webhook': true,
    'message-embedding': true
};

function getToggleableModuleNames(): string[] {
    const commandNames = commands
        .filter(
            command =>
                command.scope !== 'private' && command.groupToggleable !== false && command.alwaysAvailable !== true
        )
        .map(command => command.name);
    return [...new Set([...commandNames, ...GROUP_FEATURE_MODULES])].sort();
}

function resolveModuleName(name: string): string | null {
    if (Object.hasOwn(GROUP_FEATURE_MODULE_BY_NAME, name)) return name;
    const command = commands.find(
        command =>
            command.scope !== 'private' &&
            command.groupToggleable !== false &&
            command.alwaysAvailable !== true &&
            (command.name === name || command.aliases?.includes(name))
    );
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
    groupToggleable = false;

    validateArgs(args: string[]): boolean {
        if (args.length === 0) return false;
        const action = args[0];
        if (action === 'list') return args.length === 1;
        if (action === 'enable' || action === 'disable') return args.length === 2;
        return false;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
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

    private async handleList(client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const moduleNames = getToggleableModuleNames();
        const states = await Promise.all(
            moduleNames.map(async moduleName => ({
                moduleName,
                enabled: await isModuleEnabled(data.group_id, moduleName)
            }))
        );
        await reply(
            client,
            data,
            `本群功能状态：\n${states.map(({ moduleName, enabled }) => `${enabled ? '开启' : '关闭'} ${moduleName}`).join('\n')}`
        );
    }

    private async handleToggle(
        name: string,
        enabled: boolean,
        client: NapLink,
        data: OneBotV11.GroupMessageEvent
    ): Promise<void> {
        const moduleName = resolveModuleName(name);
        if (!moduleName) {
            await reply(client, data, `未找到可按群切换的功能 "${name}"。使用 /toggle list 查看全部功能。`);
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
