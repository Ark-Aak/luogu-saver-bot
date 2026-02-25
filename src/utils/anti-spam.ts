import { MessageSegment } from "@/types/message";
import { config } from "@/config";
import { calculateTextLength, calculateTextLines } from "@/utils/client";

export function isNeedShrink(message: MessageSegment[] | string): boolean {
    const messageLength = typeof message === 'string' ? message.length : calculateTextLength(message);
    const messageLines = typeof message === 'string' ? message.split('\n').length - 1 : calculateTextLines(message);
    return messageLength > config.napcat.charThreshold || messageLines > config.napcat.lineThreshold;
}
