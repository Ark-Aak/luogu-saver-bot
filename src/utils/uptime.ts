import { z } from 'zod';
import type { UptimeConfig } from '@/config/schemas/uptime';

const monitorStatusSchema = z.enum(['operational', 'degraded', 'outage', 'paused', 'pending', 'unknown']);
const percentageSchema = z.number().min(0).max(100).nullable();

export const PublicUptimeStatusSchema = z.object({
    productName: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value)),
    title: z.string(),
    generatedAt: z
        .string()
        .refine(value => /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)))
        .transform(value => new Date(value).toISOString()),
    overallStatus: z.enum(['operational', 'degraded', 'outage', 'unknown']),
    monitors: z.array(
        z.object({
            name: z.string(),
            status: monitorStatusSchema,
            uptime: z.object({
                '24h': percentageSchema,
                '7d': percentageSchema,
                '30d': percentageSchema
            })
        })
    )
});

export type PublicUptimeStatus = z.infer<typeof PublicUptimeStatusSchema>;
export type UptimeQueryOptions = Pick<UptimeConfig, 'baseUrl' | 'statusPageSlug' | 'requestTimeoutMs'>;
export type UptimeQueryError =
    | 'not-configured'
    | 'timeout'
    | 'unreachable'
    | 'not-found'
    | 'unavailable'
    | 'invalid-response';
export type UptimeQueryResult =
    | {
          ok: true;
          page: PublicUptimeStatus;
          monitors: PublicUptimeStatus['monitors'];
          serviceName: string;
          publicPageUrl: string;
      }
    | {
          ok: false;
          error: UptimeQueryError;
      };

export async function queryUptimeStatus(options: UptimeQueryOptions, serviceName = ''): Promise<UptimeQueryResult> {
    if (!options.baseUrl || !options.statusPageSlug) {
        return { ok: false, error: 'not-configured' };
    }

    const origin = options.baseUrl.replace(/\/$/, '');
    const slug = encodeURIComponent(options.statusPageSlug);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.requestTimeoutMs);
    try {
        const response = await fetch(`${origin}/api/v1/public/status-pages/${slug}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'omit',
            redirect: 'manual',
            signal: controller.signal
        });
        if (response.status === 404) return { ok: false, error: 'not-found' };
        if (response.status >= 300 && response.status < 400) return { ok: false, error: 'invalid-response' };
        if (!response.ok) return { ok: false, error: 'unavailable' };

        let raw: unknown;
        try {
            raw = await response.json();
        } catch (error) {
            if (controller.signal.aborted) return { ok: false, error: 'timeout' };
            return { ok: false, error: error instanceof SyntaxError ? 'invalid-response' : 'unreachable' };
        }
        const parsed = PublicUptimeStatusSchema.safeParse(raw);
        if (!parsed.success) return { ok: false, error: 'invalid-response' };

        const filter = serviceName.trim();
        const needle = filter.toLowerCase();
        const monitors = needle
            ? parsed.data.monitors.filter(monitor => monitor.name.toLowerCase().includes(needle))
            : parsed.data.monitors;
        return {
            ok: true,
            page: parsed.data,
            monitors,
            serviceName: filter,
            publicPageUrl: `${origin}/status/${slug}`
        };
    } catch {
        return { ok: false, error: controller.signal.aborted ? 'timeout' : 'unreachable' };
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
}

const errorMessages: Record<UptimeQueryError, string> = {
    'not-configured': '尚未配置服务状态查询。请管理员设置 uptime.baseUrl 和 uptime.statusPageSlug，并发布对应状态页。',
    timeout: '服务状态查询超时，请稍后重试；若持续超时，请联系管理员检查服务连接或 uptime.requestTimeoutMs。',
    unreachable: '暂时无法连接状态页，请稍后重试；若仍无法连接，请联系管理员检查服务连接和 uptime.baseUrl。',
    'not-found': '状态页不存在或尚未发布。请管理员检查 uptime.statusPageSlug，并在 Uptime 中发布对应状态页。',
    unavailable: '状态页暂时无法访问，请稍后重试；若持续失败，请联系管理员检查服务和公开访问设置。',
    'invalid-response': '状态页返回的数据格式不符合要求。请联系管理员检查 uptime.baseUrl 和 Uptime 服务版本。'
};

const overallLabels: Record<PublicUptimeStatus['overallStatus'], string> = {
    operational: '正常',
    degraded: '部分异常',
    outage: '全部故障',
    unknown: '未知（暂无明确状态）'
};

const serviceLabels: Record<PublicUptimeStatus['monitors'][number]['status'], string> = {
    operational: '正常',
    degraded: '部分异常',
    outage: '故障',
    paused: '已暂停',
    pending: '等待检测',
    unknown: '未知'
};

export function formatUptimeResponse(result: UptimeQueryResult): string {
    if (!result.ok) return errorMessages[result.error];

    const { page, monitors } = result;
    const lines = [
        `${page.productName} · ${page.title || '服务状态'}`,
        `状态页总体状态：${overallLabels[page.overallStatus]}`
    ];
    if (result.serviceName) lines.push(`匹配服务：${monitors.length}/${page.monitors.length} 项`);
    if (monitors.length === 0) {
        lines.push(
            result.serviceName
                ? '未找到符合条件的服务。请使用状态页中的服务名称，或发送 /uptime 查看全部服务。'
                : '状态页尚未配置服务。请联系管理员添加服务。'
        );
    }
    for (const monitor of monitors) {
        const uptime24h = monitor.uptime['24h'] === null ? '暂无数据' : `${monitor.uptime['24h'].toFixed(2)}%`;
        const uptime7d = monitor.uptime['7d'] === null ? '暂无数据' : `${monitor.uptime['7d'].toFixed(2)}%`;
        const uptime30d = monitor.uptime['30d'] === null ? '暂无数据' : `${monitor.uptime['30d'].toFixed(2)}%`;
        lines.push(
            '',
            `${monitor.name || '未命名服务'}：${serviceLabels[monitor.status]}`,
            `可用率：24h ${uptime24h} | 7d ${uptime7d} | 30d ${uptime30d}`
        );
    }
    lines.push('', `生成时间：${page.generatedAt}`, `公开状态页：${result.publicPageUrl}`);
    return lines.join('\n');
}
