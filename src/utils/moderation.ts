import Green20220302, * as $Green20220302 from '@alicloud/green20220302';
import OpenApi, * as $OpenApi from '@alicloud/openapi-client';
import Util, * as $Util from '@alicloud/tea-util';
import * as $tea from '@alicloud/tea-typescript';
import { config as globalConfig } from '@/config';
import { logger } from "@/utils/logger";

export class Moderation {

    private static createClient(): Green20220302 {
        const config = new $OpenApi.Config({
            accessKeyId: globalConfig.aliyun.accessKeyId,
            accessKeySecret: globalConfig.aliyun.accessKeySecret,
        });
        config.endpoint = 'green-cip.cn-shanghai.aliyuncs.com';
        const Client = (Green20220302 as any).default || Green20220302;
        return new Client(config);
    }

    static async moderateText(text: string): Promise<boolean> {
        let client = this.createClient();
        let textModerationRequest = new $Green20220302.TextModerationRequest({
            service: "comment_detection",
            serviceParameters: JSON.stringify({
                content: text,
            })
        });
        let runtime = new $Util.RuntimeOptions({});
        try {
            let response = await client.textModerationWithOptions(textModerationRequest, runtime);
            return JSON.parse(response.body?.data?.reason || '{"riskLevel": "high"}').riskLevel !== 'high';
        } catch (error) {
            logger.error('Text moderation failed:', error);
            return false;
        }
    }
}