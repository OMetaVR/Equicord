/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { CloudUpload } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findLazy } from "@webpack";
import { ChannelStore, Constants, RestAPI, SelectedChannelStore, SnowflakeUtils } from "@webpack/common";

import { Media, MediaType } from "../types";
import { refreshUrls } from "./urlRefresh";

const logger = new Logger("FavoriteMedia:Upload");

const CloudUploader = findLazy(m => m.prototype?.trackUploadFinished) as typeof CloudUpload;

function isMediaUrl(url: string): boolean {
    const mediaExtensions = [
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg",
        "mp4", "webm", "mov", "avi", "mkv",
        "mp3", "wav", "ogg", "flac", "m4a", "aac"
    ];

    try {
        const pathname = new URL(url).pathname.toLowerCase();
        return mediaExtensions.some(ext => pathname.includes(`.${ext}`));
    } catch {
        return false;
    }
}

function transformUrlForFetch(url: string, type: MediaType): string {
    if (type === "file") {
        return url;
    }

    if (!isMediaUrl(url) && type === "file") {
        return url;
    }

    if (url.includes("cdn.discordapp.com")) {
        return url.replace("cdn.discordapp.com", "media.discordapp.net");
    }
    return url;
}

export async function fetchMediaBuffer(url: string, type: MediaType = "file"): Promise<ArrayBuffer> {
    const fetchUrl = transformUrlForFetch(url, type);

    const response = await fetch(fetchUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch media: ${response.status}`);
    }

    return response.arrayBuffer();
}

export function getFileExtension(url: string, type: MediaType): string {
    try {
        const urlObj = new URL(url);
        const { pathname } = urlObj;
        const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
        if (match) {
            return match[1].toLowerCase();
        }
    } catch {
    }

    switch (type) {
        case "image":
            return "png";
        case "video":
            return "mp4";
        case "audio":
            return "mp3";
        case "file":
            return "bin";
        case "gif":
            return "gif";
        default:
            return "bin";
    }
}

export function getMimeType(ext: string, type: MediaType): string {
    const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        flac: "audio/flac",
        m4a: "audio/mp4",
        pdf: "application/pdf",
        zip: "application/zip",
        txt: "text/plain",
    };

    if (mimeMap[ext]) {
        return mimeMap[ext];
    }

    switch (type) {
        case "image":
        case "gif":
            return "image/png";
        case "video":
            return "video/mp4";
        case "audio":
            return "audio/mpeg";
        default:
            return "application/octet-stream";
    }
}

export function getFilename(media: Media, type: MediaType): string {
    const ext = media.ext || getFileExtension(media.url, type);
    const baseName = media.name || "media";

    const cleanName = baseName.replace(/[<>:"/\\|?*]/g, "_");

    if (cleanName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
        return cleanName;
    }

    return `${cleanName}.${ext}`;
}

async function uploadFile(channelId: string, file: File): Promise<{ id: string; filename: string; uploaded_filename: string; } | null> {
    return new Promise(resolve => {
        const upload = new CloudUploader({ file, platform: CloudUploadPlatform.WEB }, channelId);

        upload.on("complete", () => resolve({
            id: "",
            filename: upload.filename,
            uploaded_filename: upload.uploadedFilename
        }));
        upload.on("error", () => resolve(null));
        upload.upload();
    });
}

async function postMessage(
    channelId: string,
    content: string,
    attachments?: { id: string; filename: string; uploaded_filename: string; }[]
): Promise<void> {
    await RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body: {
            content,
            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
            ...(attachments?.length ? { channel_id: channelId, sticker_ids: [], type: 0, attachments } : {})
        }
    });
}

export async function uploadMediaAsFile(
    media: Media,
    type: MediaType,
    spoiler: boolean = false,
    autoSend: boolean = true
): Promise<void> {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) {
        throw new Error("No channel selected");
    }

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) {
        throw new Error("Could not get channel");
    }

    logger.info(`Uploading ${type} as file:`, media.url);

    let urlToFetch = media.url;
    if (media.url.includes("cdn.discordapp.com") || media.url.includes("media.discordapp.net")) {
        try {
            const refreshed = await refreshUrls([media.url]);
            if (refreshed[0]?.refreshed) {
                urlToFetch = refreshed[0].refreshed;
                logger.info("Using refreshed URL:", urlToFetch);
            }
        } catch (e) {
            logger.warn("URL refresh failed, using original:", e);
        }
    }

    const buffer = await fetchMediaBuffer(urlToFetch, type);

    const ext = media.ext || getFileExtension(media.url, type);
    let filename = getFilename(media, type);
    const mimeType = getMimeType(ext, type);

    if (spoiler) {
        filename = `SPOILER_${filename}`;
    }

    const file = new File([buffer], filename, { type: mimeType });

    if (autoSend) {
        const uploaded = await uploadFile(channelId, file);
        if (!uploaded) {
            throw new Error("Failed to upload file");
        }

        await postMessage(channelId, "", [{ ...uploaded, id: "0" }]);
        logger.info(`Sent ${filename} to channel ${channelId}`);
    } else {
        const { UploadHandler, DraftType } = await import("@webpack/common");
        setTimeout(() => {
            UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage);
        }, 10);
        logger.info(`Attached ${filename} to input`);
    }
}

export function shouldUploadAsFile(type: MediaType, uploadAsFileSetting: boolean): boolean {
    if (type === "audio") {
        return true;
    }

    if (type === "file") {
        return false;
    }

    return uploadAsFileSetting;
}
