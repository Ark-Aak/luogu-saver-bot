import { z } from 'zod';

const isoDateTimeSchema = z
    .string()
    .refine(value => /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)))
    .transform(value => new Date(value).toISOString());
const safeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const envelopeShape = {
    schemaVersion: z.literal(1),
    eventId: z.string().uuid(),
    occurredAt: isoDateTimeSchema
};

const HostAlertWebhookEventSchema = z
    .strictObject({
        ...envelopeShape,
        eventType: z.enum(['probe.host_alert.opened', 'probe.host_alert.resolved']),
        probe: z.strictObject({
            id: z.string().uuid(),
            name: z.string(),
            kind: z.enum(['local', 'remote']),
            mode: z.enum(['endpoint', 'host', 'both'])
        }),
        alert: z.strictObject({
            id: z.string().uuid(),
            kind: z.enum(['cpu', 'memory', 'load', 'telemetry_stale']),
            status: z.enum(['open', 'resolved']),
            openedAt: isoDateTimeSchema,
            resolvedAt: isoDateTimeSchema.nullable(),
            resolution: z
                .enum(['recovered', 'telemetry_resumed', 'policy_changed', 'host_monitoring_disabled', 'probe_revoked'])
                .nullable(),
            value: z.number().finite().nonnegative(),
            valueUnit: z.enum(['percent', 'load_per_cpu', 'seconds_since_sample']),
            openThreshold: z.number().finite().nonnegative(),
            resolveThreshold: z.number().finite().nonnegative().nullable(),
            openAfterSeconds: safeIntegerSchema,
            resolveAfterSeconds: safeIntegerSchema
        })
    })
    .superRefine((event, context) => {
        const opened = event.eventType === 'probe.host_alert.opened';
        if (opened !== (event.alert.status === 'open')) {
            context.addIssue({ code: 'custom', path: ['alert', 'status'], message: 'event_alert_status_mismatch' });
        }
        if (opened && (event.alert.resolvedAt !== null || event.alert.resolution !== null)) {
            context.addIssue({ code: 'custom', path: ['alert'], message: 'opened_event_cannot_be_resolved' });
        }
        if (!opened && (event.alert.resolvedAt === null || event.alert.resolution === null)) {
            context.addIssue({ code: 'custom', path: ['alert'], message: 'resolved_event_requires_resolution' });
        }
    });

const monitorSchema = z.strictObject({
    id: z.string().uuid(),
    name: z.string(),
    kind: z.enum(['http', 'tcp', 'udp']),
    state: z.enum(['pending', 'up', 'down', 'degraded', 'paused', 'unknown'])
});
const incidentShape = {
    id: z.string().uuid(),
    openedAt: isoDateTimeSchema,
    durationSeconds: safeIntegerSchema
};

const MonitorIncidentOpenedWebhookEventSchema = z.strictObject({
    ...envelopeShape,
    eventType: z.literal('monitor.incident.opened'),
    monitor: monitorSchema,
    incident: z.strictObject({
        ...incidentShape,
        status: z.literal('ongoing'),
        resolvedAt: z.null(),
        resolution: z.null()
    })
});

const MonitorIncidentResolvedWebhookEventSchema = z.strictObject({
    ...envelopeShape,
    eventType: z.literal('monitor.incident.resolved'),
    monitor: monitorSchema,
    incident: z.strictObject({
        ...incidentShape,
        status: z.literal('resolved'),
        resolvedAt: isoDateTimeSchema,
        resolution: z.enum(['recovered', 'monitor_disabled', 'probe_assignment_changed'])
    })
});

// Mirrors oh-my-uptime's schema-version 1 WebhookEventBodySchema.
export const UptimeWebhookEventSchema = z.discriminatedUnion('eventType', [
    HostAlertWebhookEventSchema,
    MonitorIncidentOpenedWebhookEventSchema,
    MonitorIncidentResolvedWebhookEventSchema
]);

export type UptimeWebhookEvent = z.infer<typeof UptimeWebhookEventSchema>;
export type HostAlertWebhookEvent = z.infer<typeof HostAlertWebhookEventSchema>;
export type MonitorIncidentWebhookEvent = Exclude<UptimeWebhookEvent, HostAlertWebhookEvent>;
