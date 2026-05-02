import Green20220302, * as $Green20220302 from '@alicloud/green20220302';
import OpenApi, * as $OpenApi from '@alicloud/openapi-client';
import Util, * as $Util from '@alicloud/tea-util';
import axios from 'axios';
import { createHash } from 'crypto';
import { config as globalConfig } from '@/config';
import { logger } from '@/utils/logger';
import { registerCache } from '@/utils/cache-registry';

export type ImageModerationResult = {
    pass: boolean;
    riskLevel: string;
    labels: string[];
};

type CachedImageModerationResult = {
    expiresAt: number;
    result: ImageModerationResult;
};

export class Moderation {
    private static imageModerationCache = new Map<string, CachedImageModerationResult>();
    private static imageHashModerationCache = new Map<string, ImageModerationResult>();
    private static cachesRegistered = false;

    private static createClient(): Green20220302 {
        const config = new $OpenApi.Config({
            accessKeyId: globalConfig.aliyun.accessKeyId,
            accessKeySecret: globalConfig.aliyun.accessKeySecret
        });
        config.endpoint = globalConfig.aliyun.endpoint;
        const Client = (Green20220302 as any).default || Green20220302;
        return new Client(config);
    }

    static registerCaches(): void {
        if (this.cachesRegistered) return;

        registerCache({
            name: 'image-moderation-url',
            clear: () => this.imageModerationCache.clear(),
            size: () => this.imageModerationCache.size
        });
        registerCache({
            name: 'image-moderation-sha256',
            clear: () => this.imageHashModerationCache.clear(),
            size: () => this.imageHashModerationCache.size
        });

        this.cachesRegistered = true;
    }

    static async moderateText(text: string): Promise<boolean> {
        let client = this.createClient();
        let textModerationPlusRequest = new $Green20220302.TextModerationPlusRequest({
            service: 'comment_detection_pro',
            serviceParameters: JSON.stringify({
                content: text
            })
        });
        let runtime = new $Util.RuntimeOptions({});
        try {
            let response = await client.textModerationPlusWithOptions(textModerationPlusRequest, runtime);
            const level = response.body?.data?.riskLevel || 'high';
            logger.info(`Text moderation result: ${level}`);
            return level !== 'high';
        } catch (error) {
            logger.error('Text moderation failed:', error);
            return false;
        }
    }

    static async moderateImage(imageUrl: string): Promise<ImageModerationResult> {
        const cachedResult = this.getCachedImageModerationResult(imageUrl);
        if (cachedResult) {
            logger.info(`Image moderation cache hit: ${imageUrl}`);
            return cachedResult;
        }

        const imageHash = await this.resolveImageSha256(imageUrl);
        if (imageHash) {
            const hashCachedResult = this.imageHashModerationCache.get(imageHash);
            if (hashCachedResult) {
                logger.info(`Image moderation SHA256 cache hit: ${imageHash}`);
                this.setCachedImageModerationResult(imageUrl, hashCachedResult);
                return hashCachedResult;
            }
        }

        const result = await this.requestImageModeration(imageUrl);
        this.setCachedImageModerationResult(imageUrl, result);
        if (imageHash) {
            this.imageHashModerationCache.set(imageHash, result);
        }
        return result;
    }

    private static async requestImageModeration(imageUrl: string): Promise<ImageModerationResult> {
        const client = this.createClient();
        const imageModerationRequest = new $Green20220302.ImageModerationRequest({
            service: globalConfig.aliyun.imageModerationService,
            serviceParameters: JSON.stringify({
                imageUrl,
                dataId: `${Date.now()}-${Math.random().toString(36).slice(2)}`
            })
        });
        const runtime = new $Util.RuntimeOptions({});

        try {
            const response = await client.imageModerationWithOptions(imageModerationRequest, runtime);
            const body = response.body;
            if (body?.code !== 200) {
                logger.warn(`Image moderation failed with code ${body?.code}: ${body?.msg ?? 'unknown'}`);
                return { pass: true, riskLevel: 'unknown', labels: [] };
            }

            const riskLevel = body.data?.riskLevel ?? 'none';
            const labels =
                body.data?.result?.map(result => result.label).filter((label): label is string => !!label) ?? [];
            logger.info(`Image moderation result: ${riskLevel}${labels.length ? ` (${labels.join(', ')})` : ''}`);
            return {
                pass: !globalConfig.aliyun.imageModerationBlockRiskLevels.includes(riskLevel),
                riskLevel,
                labels
            };
        } catch (error) {
            logger.error('Image moderation failed:', error);
            return { pass: true, riskLevel: 'unknown', labels: [] };
        }
    }

    private static async resolveImageSha256(imageUrl: string): Promise<string | null> {
        if (!globalConfig.aliyun.imageModerationHashCacheEnabled) return null;

        try {
            const response = await axios.get<ArrayBuffer>(imageUrl, {
                responseType: 'arraybuffer',
                timeout: globalConfig.aliyun.imageModerationDownloadTimeoutMs,
                maxContentLength: globalConfig.aliyun.imageModerationMaxDownloadBytes,
                maxBodyLength: globalConfig.aliyun.imageModerationMaxDownloadBytes
            });

            const buffer = Buffer.from(response.data);
            if (buffer.length > globalConfig.aliyun.imageModerationMaxDownloadBytes) {
                logger.warn(`Image moderation SHA256 skipped: image too large (${buffer.length} bytes)`);
                return null;
            }

            return createHash('sha256').update(buffer).digest('hex');
        } catch (error) {
            logger.warn(`Image moderation SHA256 resolve failed: ${imageUrl}`, error);
            return null;
        }
    }

    private static getCachedImageModerationResult(imageUrl: string): ImageModerationResult | null {
        const ttl = globalConfig.aliyun.imageModerationCacheTtlMs;
        if (ttl <= 0) return null;

        const cached = this.imageModerationCache.get(imageUrl);
        if (!cached) return null;

        if (cached.expiresAt <= Date.now()) {
            this.imageModerationCache.delete(imageUrl);
            return null;
        }

        return cached.result;
    }

    private static setCachedImageModerationResult(imageUrl: string, result: ImageModerationResult): void {
        const ttl = globalConfig.aliyun.imageModerationCacheTtlMs;
        if (ttl <= 0) return;

        this.imageModerationCache.set(imageUrl, {
            expiresAt: Date.now() + ttl,
            result
        });
    }
}
