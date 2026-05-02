import Green20220302, * as $Green20220302 from '@alicloud/green20220302';
import OpenApi, * as $OpenApi from '@alicloud/openapi-client';
import Util, * as $Util from '@alicloud/tea-util';
import { config as globalConfig } from '@/config';
import { logger } from '@/utils/logger';

export class Moderation {
    private static createClient(): Green20220302 {
        const config = new $OpenApi.Config({
            accessKeyId: globalConfig.aliyun.accessKeyId,
            accessKeySecret: globalConfig.aliyun.accessKeySecret
        });
        config.endpoint = globalConfig.aliyun.endpoint;
        const Client = (Green20220302 as any).default || Green20220302;
        return new Client(config);
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

    static async moderateImage(imageUrl: string): Promise<{ pass: boolean; riskLevel: string; labels: string[] }> {
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
}
