import { NapLink } from '@naplink/naplink';
import { logger } from '@/utils/logger';
import { config } from '@/config';

export const client = new NapLink({
    connection: {
        url: config.napcat.url,
        token: config.napcat.token,
        timeout: 30000,
        pingInterval: 30000,
        heartbeatAction: {
            action: 'get_status',
            params: {}
        }
    },

    reconnect: {
        enabled: true,
        maxAttempts: 10,
        backoff: {
            initial: 1000,
            max: 60000,
            multiplier: 2
        }
    },

    logging: {
        level: 'info',
        logger: logger
    },

    api: {
        timeout: 30000,
        retries: 1
    }
});
