import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { config } from '@/config';
import { ImageSegment, MessageSegment } from '@/types/message';
import { logger } from '@/utils/logger';
import { Moderation } from '@/utils/moderation';
import { registerMessageHandler } from '@/handlers/registry';
import { isModuleEnabled } from '@/utils/module-toggle';

function getImageSegments(message: MessageSegment[]): ImageSegment[] {
    return message.filter((segment): segment is ImageSegment => segment.type === 'image');
}

async function resolveImageUrl(client: NapLink, image: ImageSegment): Promise<string | null> {
    if (image.data.url) {
        return image.data.url;
    }

    try {
        const result = await client.getImage(image.data.file);
        return result?.url ?? result?.file ?? null;
    } catch (error) {
        logger.warn(`Failed to resolve image url for ${image.data.file}:`, error);
        return null;
    }
}

async function handleImages(client: NapLink, data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent) {
    if (!config.aliyun.imageModerationEnabled) return;
    if (data.message_type === 'group' && !(await isModuleEnabled(data.group_id, 'image-moderation'))) return;

    const images = getImageSegments(data.message as MessageSegment[]);
    if (images.length === 0) return;

    for (const image of images) {
        const imageUrl = await resolveImageUrl(client, image);
        if (!imageUrl) continue;

        const result = await Moderation.moderateImage(imageUrl);
        logger.info(
            `Image moderation result for message ${data.message_id} from ${data.user_id}: pass=${result.pass}, risk=${result.riskLevel}, labels=${result.labels.length ? result.labels.join(', ') : '-'}`
        );
        if (result.pass) continue;

        logger.warn(
            `Blocked image message ${data.message_id} from ${data.user_id}: risk=${result.riskLevel}, labels=${result.labels.join(', ')}`
        );
        await client.deleteMessage(data.message_id);
        return;
    }
}

export function setupImageModerationHandler() {
    registerMessageHandler({
        name: 'image-moderation',
        order: 0,
        group: handleImages,
        private: handleImages
    });
}
