export class MessageBuilder {
    parts = [];
    text(text) {
        this.parts.push({ type: 'text', data: { text } });
        return this;
    }
    image(file, summary, subType) {
        this.parts.push({ type: 'image', data: { file, summary, sub_type: subType } });
        return this;
    }
    at(userId) {
        this.parts.push({ type: 'at', data: { qq: String(userId) } });
        this.parts.push({ type: 'text', data: { text: ' ' } });
        return this;
    }
    atIf(condition, userId) {
        if (condition) {
            this.parts.push({ type: 'at', data: { qq: String(userId) } });
            this.parts.push({ type: 'text', data: { text: ' ' } });
        }
        return this;
    }
    reply(id) {
        this.parts.push({ type: 'reply', data: { id } });
        return this;
    }
    face(id) {
        this.parts.push({ type: 'face', data: { id } });
        return this;
    }
    cqCode(code) {
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
            const data = {};
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
    build() {
        return this.parts;
    }
}
