export type CacheControl = {
    name: string;
    clear: () => void;
    size?: () => number;
};

const caches = new Map<string, CacheControl>();

export function registerCache(cache: CacheControl): void {
    caches.set(cache.name, cache);
}

export function listCaches(): CacheControl[] {
    return [...caches.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function clearCache(name: string): boolean {
    const cache = caches.get(name);
    if (!cache) return false;

    cache.clear();
    return true;
}

export function clearAllCaches(): number {
    let count = 0;
    for (const cache of caches.values()) {
        cache.clear();
        count += 1;
    }
    return count;
}
