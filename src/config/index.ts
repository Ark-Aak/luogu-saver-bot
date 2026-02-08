import path from 'path';
import fs from 'fs';
import { ConfigLoader } from './loader';
import { logger } from "../utils/logger";

function findConfigPath(): string {
    if (process.env.CONFIG_PATH) {
        return path.resolve(process.env.CONFIG_PATH);
    }

    const candidates: string[] = [];

    candidates.push(path.resolve(process.cwd(), 'config.yml'));
    candidates.push(path.resolve(process.cwd(), 'config', 'config.yml'));

    if (process.argv && process.argv[1]) {
        const execDir = path.dirname(process.argv[1]);
        candidates.push(path.resolve(execDir, 'config.yml'));
        candidates.push(path.resolve(execDir, '../config.yml'));
        candidates.push(path.resolve(execDir, '../../config.yml'));
    }

    let dir = process.cwd();
    while (true) {
        candidates.push(path.join(dir, 'config.yml'));
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    const seen = new Set<string>();
    for (const c of candidates) {
        const p = path.normalize(c);
        if (seen.has(p)) continue;
        seen.add(p);
        try {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                logger.info(`Found config file at: ${p}`);
                return p;
            }
        } catch (err) {
        }
    }

    throw new Error(
        'Oh my baby god, where is the config file? Searched at: \n' + Array.from(seen).join('\n')
    );
}

const CONFIG_PATH = findConfigPath();

const loader = new ConfigLoader(CONFIG_PATH);
export const config = loader.load();

export type { AppConfig } from './schemas';
