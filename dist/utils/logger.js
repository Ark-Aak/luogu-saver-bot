import { consoleFormat } from 'winston-console-format';
import { createLogger, format, transports } from 'winston';
export const logger = createLogger({
    format: format.combine(format.timestamp(), format.ms(), format.errors({ stack: true }), format.splat(), format.json()),
    transports: [
        new transports.Console({
            format: format.combine(format.colorize({ all: true }), format.padLevels(), consoleFormat({
                showMeta: true
            }))
        })
    ]
});
