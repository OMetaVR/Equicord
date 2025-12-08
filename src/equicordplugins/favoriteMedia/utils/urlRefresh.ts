/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { RestAPI } from "@webpack/common";

const logger = new Logger("FavoriteMedia:UrlRefresh");

interface RefreshedUrl {
    original: string;
    refreshed: string | null;
}

export function isDiscordAttachmentUrl(url: string): boolean {
    return url.includes("cdn.discordapp.com/attachments/") ||
           url.includes("media.discordapp.net/attachments/");
}

export async function refreshUrls(urls: string[]): Promise<RefreshedUrl[]> {
    const results: RefreshedUrl[] = [];
    const discordUrls: string[] = [];
    const nonDiscordUrls: string[] = [];

    for (const url of urls) {
        if (isDiscordAttachmentUrl(url)) {
            discordUrls.push(url);
        } else {
            nonDiscordUrls.push(url);
            results.push({ original: url, refreshed: null });
        }
    }

    if (discordUrls.length === 0) {
        return results;
    }

    const CHUNK_SIZE = 50;
    for (let i = 0; i < Math.ceil(discordUrls.length / CHUNK_SIZE); i++) {
        const chunk = discordUrls.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

        try {
            const response = await RestAPI.post({
                url: "/attachments/refresh-urls",
                body: { attachment_urls: chunk }
            });

            if (response.ok && response.body?.refreshed_urls) {
                for (const refreshed of response.body.refreshed_urls) {
                    results.push({
                        original: refreshed.original,
                        refreshed: refreshed.refreshed
                    });
                }
            } else {
                for (const url of chunk) {
                    results.push({ original: url, refreshed: null });
                }
            }
        } catch (error) {
            logger.warn("Failed to refresh URLs:", error);
            for (const url of chunk) {
                results.push({ original: url, refreshed: null });
            }
        }

        if (i < Math.ceil(discordUrls.length / CHUNK_SIZE) - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return results;
}

export async function refreshUrl(url: string): Promise<string> {
    if (!isDiscordAttachmentUrl(url)) {
        return url;
    }

    const results = await refreshUrls([url]);
    const result = results.find(r => r.original === url);
    return result?.refreshed ?? url;
}

export async function refreshMediaUrls<T extends { url: string }>(medias: T[]): Promise<T[]> {
    if (medias.length === 0) return medias;

    const urls = medias.map(m => m.url);
    const refreshedUrls = await refreshUrls(urls);

    for (const media of medias) {
        const refreshed = refreshedUrls.find(r => r.original === media.url);
        if (refreshed?.refreshed) {
            media.url = refreshed.refreshed;
        }
    }

    return medias;
}
