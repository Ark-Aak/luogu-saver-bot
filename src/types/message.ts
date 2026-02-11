export type BaseSegment = {
    type: string;
    data: Record<string, any>;
};

export type TextSegment = {
    type: 'text';
    data: {
        text: string;
    };
};

export type FaceSegment = {
    type: 'face';
    data: {
        id: number;
    };
};

/*
 * file, type 收发都存在。
 * cache, proxy, timeout 仅发送时存在。
 * url 仅接收时存在。
 * @see https://github.com/botuniverse/onebot-11/blob/master/message/segment.md#%E5%9B%BE%E7%89%87
 */
export type ImageSegment = {
    type: 'image';
    data: {
        file: string;
        url?: string;
        type?: 'flash';
        cache?: 0 | 1;
        proxy?: 0 | 1;
        timeout?: number;
    };
};

export type RecordSegment = {
    type: 'record';
    data: {
        file: string;
        url?: string;
        magic?: 0 | 1;
        cache?: 0 | 1;
        proxy?: 0 | 1;
        timeout?: number;
    };
};

export type VideoSegment = {
    type: 'video';
    data: {
        file: string;
        url?: string;
        cache?: 0 | 1;
        proxy?: 0 | 1;
        timeout?: number;
    };
};

export type AtSegment = {
    type: 'at';
    data: {
        qq: string | 'all';
    };
};

export type RpsSegment = {
    type: 'rps';
    data: Record<string, never>;
};

export type DiceSegment = {
    type: 'dice';
    data: Record<string, never>;
};

export type ShakeSegment = {
    type: 'shake';
    data: Record<string, never>;
};

export type PokeSegment = {
    type: 'poke';
    data: {
        type: string;
        id: string;
        name?: string;
    };
};

export type AnonymousSegment = {
    type: 'anonymous';
    data: {
        ignore?: 0 | 1;
    };
};

export type ShareSegment = {
    type: 'share';
    data: {
        url: string;
        title: string;
        content?: string;
        image?: string;
    };
};

export type ContactSegment = {
    type: 'contact';
    data: {
        type: 'qq' | 'group';
        id: string;
    };
};

export type LocationSegment = {
    type: 'location';
    data: {
        lat: string;
        lon: string;
        title?: string;
        content?: string;
    };
};

export type MusicSegment = {
    type: 'music';
    data:
        | {
              type: 'qq' | '163' | 'xm';
              id: string;
          }
        | {
              type: 'custom';
              url: string;
              audio: string;
              title: string;
              content?: string;
              image?: string;
          };
};

export type ReplySegment = {
    type: 'reply';
    data: {
        id: string;
    };
};

export type ForwardSegment = {
    type: 'forward';
    data: {
        id: string;
    };
};

export type NodeSegment = {
    type: 'node';
    data:
        | {
              id: string;
          }
        | {
              user_id: string;
              nickname: string;
              content: string | MessageSegment[];
          };
};

export type XmlSegment = {
    type: 'xml';
    data: {
        data: string;
    };
};

export type JsonSegment = {
    type: 'json';
    data: {
        data: string;
    };
};

export type MessageSegment =
    | TextSegment
    | FaceSegment
    | ImageSegment
    | RecordSegment
    | VideoSegment
    | AtSegment
    | RpsSegment
    | DiceSegment
    | ShakeSegment
    | PokeSegment
    | AnonymousSegment
    | ShareSegment
    | ContactSegment
    | LocationSegment
    | MusicSegment
    | ReplySegment
    | ForwardSegment
    | NodeSegment
    | XmlSegment
    | JsonSegment
    | BaseSegment;
