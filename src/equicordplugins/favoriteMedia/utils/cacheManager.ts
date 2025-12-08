/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export class MediaCache {
    private static readonly DB_NAME = "FavoriteMedia";
    private static readonly STORE_NAME = "MediaCache";
    private static readonly DB_VERSION = 1;
    private static readonly MAX_CACHE_SIZE_MB = 100;
    private static readonly MAX_CACHE_ITEMS = 500;

    private db: IDBDatabase | null = null;

    async open(): Promise<IDBDatabase> {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(MediaCache.DB_NAME, MediaCache.DB_VERSION);

            request.onerror = () => {
                reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = event => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains(MediaCache.STORE_NAME)) {
                    db.createObjectStore(MediaCache.STORE_NAME);
                }
            };
        });
    }

    async get(key: string): Promise<ArrayBuffer | undefined> {
        const db = await this.open();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([MediaCache.STORE_NAME], "readonly");
            const store = transaction.objectStore(MediaCache.STORE_NAME);
            const request = store.get(key);

            request.onerror = () => {
                reject(new Error(`Failed to get cache entry: ${request.error?.message}`));
            };

            request.onsuccess = () => {
                resolve(request.result as ArrayBuffer | undefined);
            };
        });
    }

    async set(key: string, data: ArrayBuffer): Promise<void> {
        const db = await this.open();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([MediaCache.STORE_NAME], "readwrite");
            const store = transaction.objectStore(MediaCache.STORE_NAME);
            const request = store.put(data, key);

            request.onerror = () => {
                reject(new Error(`Failed to set cache entry: ${request.error?.message}`));
            };

            request.onsuccess = () => {
                resolve();
            };
        });
    }

    async delete(key: string): Promise<void> {
        const db = await this.open();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([MediaCache.STORE_NAME], "readwrite");
            const store = transaction.objectStore(MediaCache.STORE_NAME);
            const request = store.delete(key);

            request.onerror = () => {
                reject(new Error(`Failed to delete cache entry: ${request.error?.message}`));
            };

            request.onsuccess = () => {
                resolve();
            };
        });
    }

    async clear(): Promise<void> {
        const db = await this.open();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([MediaCache.STORE_NAME], "readwrite");
            const store = transaction.objectStore(MediaCache.STORE_NAME);
            const request = store.clear();

            request.onerror = () => {
                reject(new Error(`Failed to clear cache: ${request.error?.message}`));
            };

            request.onsuccess = () => {
                resolve();
            };
        });
    }

    async getAll(): Promise<ArrayBuffer[]> {
        const db = await this.open();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([MediaCache.STORE_NAME], "readonly");
            const store = transaction.objectStore(MediaCache.STORE_NAME);
            const request = store.getAll();

            request.onerror = () => {
                reject(new Error(`Failed to get all cache entries: ${request.error?.message}`));
            };

            request.onsuccess = () => {
                resolve(request.result as ArrayBuffer[]);
            };
        });
    }

    async getKeys(): Promise<string[]> {
        const db = await this.open();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([MediaCache.STORE_NAME], "readonly");
            const store = transaction.objectStore(MediaCache.STORE_NAME);
            const request = store.getAllKeys();

            request.onerror = () => {
                reject(new Error(`Failed to get cache keys: ${request.error?.message}`));
            };

            request.onsuccess = () => {
                resolve(request.result as string[]);
            };
        });
    }

    async cache(url: string): Promise<void> {
        try {
            const existing = await this.get(url);
            if (existing) {
                return;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
            }

            const data = await response.arrayBuffer();

            await this.set(url, data);

            await this.evictCacheIfNeeded();
        } catch (error) {
            console.error(`Failed to cache media from ${url}:`, error);
            throw error;
        }
    }

    private async evictCacheIfNeeded(): Promise<void> {
        const keys = await this.getKeys();

        if (keys.length <= MediaCache.MAX_CACHE_ITEMS) {
            return;
        }

        const toRemove = keys.slice(0, keys.length - MediaCache.MAX_CACHE_ITEMS);
        for (const key of toRemove) {
            await this.delete(key);
        }
    }

    static sizeOf(bytes: number): string {
        if (bytes === 0) return "0 B";

        const units = ["B", "KB", "MB", "GB"];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        const unitIndex = Math.min(i, units.length - 1);

        const value = bytes / Math.pow(k, unitIndex);
        return `${value.toFixed(2)} ${units[unitIndex]}`;
    }

    async getStats(): Promise<{ count: number; size: number; formattedSize: string }> {
        const keys = await this.getKeys();
        const allData = await this.getAll();

        const totalSize = allData.reduce((sum, buffer) => sum + buffer.byteLength, 0);

        return {
            count: keys.length,
            size: totalSize,
            formattedSize: MediaCache.sizeOf(totalSize)
        };
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

export const mediaCache = new MediaCache();

export const mediasCache: Record<string, string> = {};

export async function initializeCache(): Promise<void> {
    try {
        await mediaCache.open();
    } catch (error) {
        console.error("Failed to initialize media cache:", error);
    }
}

export function cleanupCache(): void {
    for (const blobUrl of Object.values(mediasCache)) {
        URL.revokeObjectURL(blobUrl);
    }

    Object.keys(mediasCache).forEach(key => delete mediasCache[key]);

    mediaCache.close();
}

export async function getCachedBlobUrl(url: string): Promise<string | undefined> {
    if (mediasCache[url]) {
        return mediasCache[url];
    }

    const data = await mediaCache.get(url);
    if (!data) {
        return undefined;
    }

    const blob = new Blob([data]);
    const blobUrl = URL.createObjectURL(blob);

    mediasCache[url] = blobUrl;

    return blobUrl;
}
