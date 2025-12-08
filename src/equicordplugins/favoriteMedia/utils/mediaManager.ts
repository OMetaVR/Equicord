/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";

import { Media, MEDIA_TYPES, MediaType, StoredMediaData } from "../types";

const STORAGE_KEYS: Record<MediaType, string> = {
    gif: "FavoriteMedia_gif",
    image: "FavoriteMedia_image",
    video: "FavoriteMedia_video",
    audio: "FavoriteMedia_audio",
    file: "FavoriteMedia_file"
};

export const mediaDataCache: Partial<Record<MediaType, StoredMediaData>> = {};

export async function getMediaData(type: MediaType): Promise<StoredMediaData> {
    if (mediaDataCache[type]) {
        return mediaDataCache[type]!;
    }

    const data = await DataStore.get<StoredMediaData>(STORAGE_KEYS[type]);

    const result: StoredMediaData = data ?? { medias: [], categories: [] };

    mediaDataCache[type] = result;

    return result;
}

export async function saveMediaData(type: MediaType, data: StoredMediaData): Promise<void> {
    mediaDataCache[type] = data;

    await DataStore.set(STORAGE_KEYS[type], data);
}

export async function addMedia(type: MediaType, media: Media): Promise<void> {
    const data = await getMediaData(type);

    const exists = data.medias.some(m => checkSameUrl(m.url, media.url));
    if (exists) {
        return;
    }

    media.addedAt = Date.now();
    data.medias.unshift(media);

    await saveMediaData(type, data);
}

export async function removeMedia(type: MediaType, url: string): Promise<void> {
    const data = await getMediaData(type);

    data.medias = data.medias.filter(m => !checkSameUrl(m.url, url));

    await saveMediaData(type, data);
}

export function isFavorited(type: MediaType, url: string): boolean {
    const data = mediaDataCache[type];
    if (!data) {
        return false;
    }

    return data.medias.some(m => checkSameUrl(m.url, url));
}

export function checkSameUrl(url1: string, url2: string): boolean {
    try {
        const u1 = new URL(url1);
        const u2 = new URL(url2);

        return u1.origin === u2.origin && u1.pathname === u2.pathname;
    } catch {
        return url1 === url2;
    }
}

export function clearMediaCache(): void {
    for (const type of MEDIA_TYPES) {
        delete mediaDataCache[type];
    }
}

export async function loadAllMediaData(): Promise<void> {
    for (const type of MEDIA_TYPES) {
        await getMediaData(type);
    }
}
