import Green20220302, * as $Green20220302 from '@alicloud/green20220302';
import * as $OpenApi from '@alicloud/openapi-client';
import * as $Util from '@alicloud/tea-util';
import { config as globalConfig } from '@/config';
import { logger } from "@/utils/logger";
export class Moderation {
    static createClient() {
        const config = new $OpenApi.Config({
            accessKeyId: globalConfig.aliyun.accessKeyId,
            accessKeySecret: globalConfig.aliyun.accessKeySecret,
        });
        config.endpoint = 'green-cip.cn-shanghai.aliyuncs.com';
        const Client = Green20220302.default || Green20220302;
        return new Client(config);
    }
    static async moderateText(text) {
        let client = this.createClient();
        let textModerationPlusRequest = new $Green20220302.TextModerationPlusRequest({
            service: "comment_detection_pro",
            serviceParameters: JSON.stringify({
                content: text,
            })
        });
        let runtime = new $Util.RuntimeOptions({});
        try {
            let response = await client.textModerationPlusWithOptions(textModerationPlusRequest, runtime);
            const level = response.body?.data?.riskLevel || 'high';
            logger.info(`Text moderation result: ${level}`);
            return level !== 'high';
        }
        catch (error) {
            logger.error('Text moderation failed:', error);
            return false;
        }
    }
}
