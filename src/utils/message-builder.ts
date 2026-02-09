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

    cqCode(code: string): MessageBuilder {
        const regex = /\[CQ:([^,\]]+)((?:,[^,\]]+=[^,\]]*)*)\]/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(code)) !== null) {
            if (match.index > lastIndex) {
                const text = code.substring(lastIndex, match.index)
                    .replace(/&#91;/g, '[')
                    .replace(/&#93;/g, ']')
                    .replace(/&amp;/g, '&');
                this.parts.push({ type: 'text', data: { text } });
            }

            const type = match[1];
            const args = match[2];
            const data: any = {};

            if (args) {
                args.substring(1).split(',').forEach(arg => {
                    const splitIndex = arg.indexOf('=');
                    if (splitIndex !== -1) {
                        const key = arg.substring(0, splitIndex);
                        const value = arg.substring(splitIndex + 1)
                            .replace(/&#91;/g, '[')
                            .replace(/&#93;/g, ']')
                            .replace(/&amp;/g, '&')
                            .replace(/&#44;/g, ',');
                        data[key] = value;
                    }
                });
            }

            this.parts.push({ type, data });
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < code.length) {
            const text = code.substring(lastIndex)
                .replace(/&#91;/g, '[')
                .replace(/&#93;/g, ']')
                .replace(/&amp;/g, '&');
            this.parts.push({ type: 'text', data: { text } });
        }

        return this;
    }

    build(): (string | { type: string, data: any })[] {
        return this.parts;
    }
}