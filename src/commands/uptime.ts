import type { NapLink } from '@naplink/naplink';
import { config } from '@/config';
import type { AllMessageEvent, Command, CommandScope } from '@/types';
import { reply } from '@/utils/client';
import { formatUptimeResponse, queryUptimeStatus } from '@/utils/uptime';

export class UptimeCommand implements Command<AllMessageEvent> {
    name = 'uptime';
    description = '查询公开状态页中的服务状态和可用率';
    usage = '/uptime [服务名]';
    scope: CommandScope = 'both';
    cooldown = 10_000;

    async execute(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const result = await queryUptimeStatus(config.uptime, args.join(' '));
        await reply(client, data, formatUptimeResponse(result), true);
    }
}
