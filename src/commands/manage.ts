import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { reply } from '@/utils/client';
import { clearAllCaches, clearCache, listCaches } from '@/utils/cache-registry';

export class ManageCommand implements Command<AllMessageEvent> {
    name = 'manage';
    aliases = ['管理'];
    description = '通用运行时管理。';
    usage = {
        cache: {
            list: '/manage cache list',
            clear: '/manage cache clear <缓存名|all>'
        }
    };
    scope: CommandScope = 'both';
    superUserOnly = true;

    validateArgs(args: string[]): boolean {
        if (args.length === 2 && args[0] === 'cache' && args[1] === 'list') return true;
        if (args.length === 3 && args[0] === 'cache' && args[1] === 'clear') return true;
        return false;
    }

    async execute(
        args: string[],
        client: NapLink,
        data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent
    ): Promise<void> {
        if (args[1] === 'list') {
            await this.handleCacheList(client, data);
            return;
        }

        await this.handleCacheClear(args[2], client, data);
    }

    private async handleCacheList(client: NapLink, data: AllMessageEvent): Promise<void> {
        const caches = listCaches();
        if (caches.length === 0) {
            await reply(client, data, '当前没有已注册缓存。');
            return;
        }

        await reply(
            client,
            data,
            ['已注册缓存', ...caches.map(cache => `${cache.name}: ${cache.size ? cache.size() : '-'} 项`)].join('\n')
        );
    }

    private async handleCacheClear(name: string, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (name === 'all') {
            const count = clearAllCaches();
            await reply(client, data, `已清除 ${count} 个缓存。`);
            return;
        }

        if (!clearCache(name)) {
            await reply(client, data, `未找到缓存 "${name}"。`);
            return;
        }

        await reply(client, data, `已清除缓存 "${name}"。`);
    }
}
