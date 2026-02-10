import fs from 'fs';
import yaml from 'js-yaml';
import { z } from 'zod';
import { AppConfigSchema } from './schemas';
import { logger } from "../utils/logger";
import path from "path";
export class ConfigLoader {
    configPath;
    config = null;
    constructor(configPath) {
        this.configPath = configPath;
    }
    load() {
        if (this.config) {
            return this.config;
        }
        if (!fs.existsSync(this.configPath)) {
            this.config = AppConfigSchema.parse({});
            return this.config;
        }
        try {
            const fileContents = fs.readFileSync(this.configPath, 'utf8');
            const rawConfig = yaml.load(fileContents);
            this.config = AppConfigSchema.parse(rawConfig);
            logger.info(`Configuration loaded successfully from ${path.resolve(this.configPath)}`);
            return this.config;
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    handleError(error) {
        if (error instanceof z.ZodError) {
            error.issues.forEach(issue => {
                const path = issue.path.join('.');
                logger.error(`Config validation error at "${path}": ${issue.message}`);
            });
        }
        process.exit(1);
    }
}
