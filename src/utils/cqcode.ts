import { isValidPositiveInteger, isValidUser } from "@/utils/validator";
import { MessageBuilder } from "@/utils/message-builder";
import { AtSegment } from "@/types/message";

export function getUserId(cqcode: string): number | null {
    if (!isValidUser(cqcode)) {
        return null;
    }
    if (isValidPositiveInteger(cqcode)) {
        return parseInt(cqcode, 10);
    }
    return parseInt(((new MessageBuilder().cqCode(cqcode).build())[0]as AtSegment).data.qq, 10);
}