import { eq } from 'drizzle-orm';
import type { UptimeConfig } from '@/config/schemas/uptime';
import type { db } from '@/db';
import { uptimeWebhookReceipts } from '@/db/schema';
import type { UptimeWebhookEvent } from '@/types/uptime-webhook';
import type { SendMessageResult } from '@/utils/client';
import { isGroupEnabled } from '@/utils/group-policy';
import { isModuleEnabled } from '@/utils/module-toggle';
import { UptimeWebhookError, UptimeWebhookVerifier } from '@/utils/uptime-webhook';
import type { IncomingHttpHeaders } from 'node:http';

export interface UptimeWebhookSettings {
    webhook: UptimeConfig['webhook'];
    enabledGroupIds: readonly number[] | null;
}

export interface UptimeWebhookReceiverOptions {
    sendGroup: (groupId: number, message: string) => Promise<SendMessageResult>;
    sendPrivate: (userId: number, message: string) => Promise<SendMessageResult>;
    database: typeof db;
    getSettings: () => UptimeWebhookSettings;
    now?: () => number;
    verifier?: Pick<UptimeWebhookVerifier, 'verify'>;
}

const METRIC_LABELS: Record<UptimeWebhookEvent['alert']['kind'], string> = {
    cpu: 'CPU 使用率',
    memory: '内存使用率',
    load: '每 CPU 负载',
    telemetry_stale: '遥测超时'
};
const VALUE_UNITS: Record<UptimeWebhookEvent['alert']['valueUnit'], string> = {
    percent: '%',
    load_per_cpu: ' / CPU',
    seconds_since_sample: ' 秒'
};
const RESOLUTION_REASONS: Record<NonNullable<UptimeWebhookEvent['alert']['resolution']>, string> = {
    recovered: '指标已恢复到恢复阈值内',
    telemetry_resumed: '已重新收到主机遥测',
    policy_changed: '告警策略已变更，关闭原告警（不代表主机已恢复）',
    host_monitoring_disabled: '主机监控已停用，关闭原告警（不代表主机已恢复）',
    probe_revoked: '探针已撤销，关闭原告警（不代表主机已恢复）'
};

function formatNotification(event: UptimeWebhookEvent): string {
    const { alert } = event;
    const unit = VALUE_UNITS[alert.valueUnit];
    const opened = event.eventType === 'probe.host_alert.opened';
    const recovered = alert.resolution === 'recovered' || alert.resolution === 'telemetry_resumed';
    const lines = [
        opened ? '主机告警' : recovered ? '主机告警恢复' : '主机告警关闭',
        `探针：${event.probe.name}`,
        `指标：${METRIC_LABELS[alert.kind]}`,
        `事件值：${alert.value}${unit}`,
        `告警阈值：${alert.openThreshold}${unit}，持续 ${alert.openAfterSeconds} 秒`,
        `事件时间：${event.occurredAt}`
    ];
    if (alert.resolveThreshold !== null) {
        lines.push(`恢复阈值：${alert.resolveThreshold}${unit}，持续 ${alert.resolveAfterSeconds} 秒`);
    }
    if (!opened && alert.resolution !== null) {
        lines.push(`${recovered ? '恢复原因' : '关闭原因'}：${RESOLUTION_REASONS[alert.resolution]}`);
    }
    return lines.join('\n');
}

export class UptimeWebhookReceiver {
    readonly #database: typeof db;
    readonly #getSettings: () => UptimeWebhookSettings;
    readonly #sendGroup: UptimeWebhookReceiverOptions['sendGroup'];
    readonly #sendPrivate: UptimeWebhookReceiverOptions['sendPrivate'];
    readonly #now: () => number;
    readonly #verifier: Pick<UptimeWebhookVerifier, 'verify'>;
    readonly #inFlight = new Map<string, Promise<void>>();

    constructor(options: UptimeWebhookReceiverOptions) {
        this.#database = options.database;
        this.#getSettings = options.getSettings;
        this.#sendGroup = options.sendGroup;
        this.#sendPrivate = options.sendPrivate;
        this.#now = options.now ?? Date.now;
        this.#verifier = options.verifier ?? new UptimeWebhookVerifier(this.#now);
    }

    async receive(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<void> {
        const settings = this.#getSettings();
        if (!settings.webhook.enabled) throw new UptimeWebhookError(404, 'not found');
        const event = this.#verifier.verify(rawBody, headers, settings.webhook.secretFile);
        const existing = this.#inFlight.get(event.eventId);
        if (existing) return existing;
        const delivery = this.#deliver(event, settings).finally(() => this.#inFlight.delete(event.eventId));
        this.#inFlight.set(event.eventId, delivery);
        return delivery;
    }

    async #deliver(event: UptimeWebhookEvent, settings: UptimeWebhookSettings): Promise<void> {
        try {
            const delivered = new Set(
                this.#database
                    .select({
                        recipientType: uptimeWebhookReceipts.recipientType,
                        recipientId: uptimeWebhookReceipts.recipientId
                    })
                    .from(uptimeWebhookReceipts)
                    .where(eq(uptimeWebhookReceipts.eventId, event.eventId))
                    .all()
                    .map(row => `${row.recipientType}:${row.recipientId}`)
            );
            const message = formatNotification(event);
            const recipients = [
                ...[...new Set(settings.webhook.notifyGroups)].map(id => ({ type: 'group' as const, id })),
                ...[...new Set(settings.webhook.notifyUsers)].map(id => ({ type: 'private' as const, id }))
            ];
            const results = await Promise.allSettled(
                recipients.map(async recipient => {
                    if (delivered.has(`${recipient.type}:${recipient.id}`)) return;
                    if (recipient.type === 'group') {
                        if (!isGroupEnabled(recipient.id, settings.enabledGroupIds)) return;
                        if (!(await isModuleEnabled(recipient.id, 'uptime-webhook', this.#database))) return;
                    }
                    const response = await (recipient.type === 'group' ? this.#sendGroup : this.#sendPrivate)(
                        recipient.id,
                        message
                    );
                    if (response === null && recipient.type === 'group') return;
                    if (!response || !Number.isSafeInteger(response.message_id)) throw new Error();
                    // QQ sends and SQLite receipts cannot share a transaction; a crash here can cause a retry duplicate.
                    this.#database
                        .insert(uptimeWebhookReceipts)
                        .values({
                            eventId: event.eventId,
                            recipientType: recipient.type,
                            recipientId: recipient.id,
                            deliveredAt: this.#now()
                        })
                        .onConflictDoNothing({
                            target: [
                                uptimeWebhookReceipts.eventId,
                                uptimeWebhookReceipts.recipientType,
                                uptimeWebhookReceipts.recipientId
                            ]
                        })
                        .run();
                })
            );
            if (results.some(result => result.status === 'rejected')) throw new Error();
        } catch {
            throw new UptimeWebhookError(503, 'webhook delivery unavailable');
        }
    }
}
