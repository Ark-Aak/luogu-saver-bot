export class MessageBuilder {

    private parts: (string | { type: string, data: any })[] = [];

    text(text: string): MessageBuilder {
        this.parts.push({ type: 'text', data: { text } });
        return this;
    }

    image(file: string, summary?: string, subType?: string): MessageBuilder {
        this.parts.push({ type: 'image', data: { file, summary, sub_type: subType } });
        return this;
    }

    at(userId: string | number): MessageBuilder {
        this.parts.push({ type: 'at', data: { qq: String(userId) } });
        this.parts.push({ type: 'text', data: { text: ' ' } });
        return this;
    }

    atIf(condition: boolean, userId: string | number): MessageBuilder {
        if (condition) {
            this.parts.push({ type: 'at', data: { qq: String(userId) } });
            this.parts.push({ type: 'text', data: { text: ' ' } });
        }
        return this;
    }

    reply(id: number): MessageBuilder {
        this.parts.push({ type: 'reply', data: { id } });
        return this;
    }

    face(id: number): MessageBuilder {
        this.parts.push({ type: 'face', data: { id } });
        return this;
    }

    build(): (string | { type: string, data: any })[] {
        return this.parts;
    }
}