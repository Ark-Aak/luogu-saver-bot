import { NapLink } from "@naplink/naplink";
import { SpamDetector } from "@/helpers/anti-spam";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";

export function setupAntiSpamHandler(client: NapLink) {
    const spamDetector = new SpamDetector();

    client.on("message.group", async (data: OneBotV11.GroupMessageEvent) => {
        
    });
}