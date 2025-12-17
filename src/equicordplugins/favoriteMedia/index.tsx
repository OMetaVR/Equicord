/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { addChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { EquicordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, Menu, React, Toasts } from "@webpack/common";

import { AudioIcon, FavoriteMediaChatBarButton, FileIcon, ImageIcon, VideoIcon } from "./components/ChatBarButton";
import { CollectionModal } from "./components/CollectionModal";
import { MediaPicker } from "./components/MediaPicker";
import { StarButton } from "./components/StarButton";
import { Media, MediaType } from "./types";
import { exportData, importData } from "./utils/importExport";
import { addMedia, getMediaData, isFavorited, loadAllMediaData, mediaDataCache, removeMedia, saveMediaData } from "./utils/mediaManager";

const logger = new Logger("FavoriteMedia");

function getMediaFromContextMenu(props: any): { url: string; type: MediaType; poster?: string; } | null {
    const { message, itemSrc, itemHref, target } = props;
    let url = itemSrc || itemHref;
    let detectedType: MediaType | null = null;
    let poster: string | undefined;

    if (target) {
        const videoElement = target.closest?.("video") || (target.tagName === "VIDEO" ? target : null);
        if (videoElement) {
            url = url || videoElement.src || videoElement.currentSrc;
            const sourceElement = videoElement.querySelector?.("source");
            if (!url && sourceElement) {
                url = sourceElement.src;
            }
            detectedType = "video";
            poster = videoElement.poster;
        }
    }

    if (!url && target) {
        url = target.src || target.href || target.currentSrc;
        if (!url && target.closest) {
            const img = target.closest("img");
            const video = target.closest("video");
            const anchor = target.closest("a");
            url = img?.src || video?.src || video?.currentSrc || anchor?.href;
        }
    }

    if (!url) return null;

    if (url.toLowerCase().includes(".gif")) return null;

    if (!detectedType && message?.embeds?.length) {
        for (const embed of message.embeds) {
            if (embed.video?.url === url || embed.video?.proxyURL === url) {
                detectedType = "video";
                poster = embed.thumbnail?.url || embed.thumbnail?.proxyURL;
                break;
            }
            if (embed.thumbnail?.url === url || embed.thumbnail?.proxyURL === url) {
                if (embed.video) {
                    url = embed.video.proxyURL || embed.video.url || url;
                    detectedType = "video";
                    poster = embed.thumbnail?.proxyURL || embed.thumbnail?.url;
                }
                break;
            }
        }
    }

    if (!detectedType) {
        const lowerUrl = url.toLowerCase();

        if (lowerUrl.match(/\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/)) {
            detectedType = "video";
        } else if (lowerUrl.match(/\.(mp3|wav|ogg|flac|m4a|aac|wma)(\?|$)/)) {
            detectedType = "audio";
        } else if (lowerUrl.match(/\.(png|jpg|jpeg|webp|bmp|svg|ico|tiff)(\?|$)/)) {
            detectedType = "image";
        } else if (lowerUrl.includes("/video/") || lowerUrl.includes("video.")) {
            detectedType = "video";
        } else if (lowerUrl.includes("/audio/") || lowerUrl.includes("audio.")) {
            detectedType = "audio";
        } else {
            detectedType = "file";
        }
    }

    if (!poster && detectedType === "video" && target) {
        const video = target.closest?.("video") || target;
        poster = video?.poster;
    }

    return { url, type: detectedType, poster };
}

function extractMediaName(url: string): string {
    try {
        const { pathname } = new URL(url);
        const filename = pathname.split("/").pop() || "media";
        return filename.replace(/\.[^.]+$/, "");
    } catch {
        return "media";
    }
}


async function addMediaToCollection(mediaInfo: { url: string; type: MediaType; poster?: string; }, collectionId: number) {
    const { url, type, poster } = mediaInfo;

    if (!isFavorited(type, url)) {
        const media: Media = {
            url,
            name: extractMediaName(url),
            poster
        };
        await addMedia(type, media);
    }

    const data = await getMediaData(type);
    const mediaIndex = data.medias.findIndex(m => m.url === url);

    if (mediaIndex !== -1) {
        data.medias[mediaIndex].category_id = collectionId;
        await saveMediaData(type, data);
    }

    FluxDispatcher.dispatch({ type: "FM_MEDIA_UPDATED" });

    Toasts.show({
        message: "Added to collection",
        type: Toasts.Type.SUCCESS,
        id: Toasts.genId()
    });
}

const addFavoriteMediaContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props) return;

    const mediaInfo = getMediaFromContextMenu(props);
    if (!mediaInfo) return;

    const { url, type, poster } = mediaInfo;

    if (!settings.store[`${type}Enabled`]) return;

    const group = findGroupChildrenByChildId("open-native-link", children)
        ?? findGroupChildrenByChildId("copy-link", children)
        ?? findGroupChildrenByChildId("copy-image", children);

    if (!group) return;

    if (group.some(child => child?.props?.id === "fm-favorite")) return;

    const favorited = isFavorited(type, url);

    const cachedData = mediaDataCache[type];
    const collections = cachedData?.categories ?? [];

    group.push(
        <Menu.MenuItem
            key="fm-favorite"
            id="fm-favorite"
            label={favorited ? "Remove from Favorites" : "Add to Favorites"}
            action={async () => {
                if (favorited) {
                    await removeMedia(type, url);
                    FluxDispatcher.dispatch({ type: "FM_MEDIA_UPDATED" });
                    FluxDispatcher.dispatch({
                        type: "FM_FAVORITE_MEDIA",
                        mediaType: type,
                        url,
                        favorited: false
                    });
                    Toasts.show({
                        message: `Removed from ${type} favorites`,
                        type: Toasts.Type.SUCCESS,
                        id: Toasts.genId()
                    });
                } else {
                    const media: Media = {
                        url,
                        name: extractMediaName(url),
                        poster
                    };
                    await addMedia(type, media);
                    FluxDispatcher.dispatch({ type: "FM_MEDIA_UPDATED" });
                    FluxDispatcher.dispatch({
                        type: "FM_FAVORITE_MEDIA",
                        mediaType: type,
                        url,
                        favorited: true
                    });
                    Toasts.show({
                        message: `Added to ${type} favorites`,
                        type: Toasts.Type.SUCCESS,
                        id: Toasts.genId()
                    });
                }
            }}
        />
    );

    group.push(
        <Menu.MenuItem
            key="fm-add-to-collection"
            id="fm-add-to-collection"
            label="Add to Collection"
        >
            {collections.length > 0 && collections.map(col => (
                <Menu.MenuItem
                    key={`fm-col-${col.id}`}
                    id={`fm-col-${col.id}`}
                    label={col.name}
                    action={() => addMediaToCollection(mediaInfo, col.id)}
                />
            ))}

            {collections.length > 0 && <Menu.MenuSeparator key="fm-separator" />}

            <Menu.MenuItem
                key="fm-create-collection"
                id="fm-create-collection"
                label="Create Collection"
                action={() => {
                    const media: Media = {
                        url,
                        name: extractMediaName(url),
                        poster
                    };

                    openModal(modalProps => (
                        <CollectionModal
                            {...modalProps}
                            type={type}
                            mediaToAdd={media}
                        />
                    ));
                }}
            />
        </Menu.MenuItem>
    );
};

async function clearCache() {
    Toasts.show({
        message: "Clear cache functionality will be implemented in task 4",
        type: Toasts.Type.MESSAGE,
        id: Toasts.genId()
    });
}

export const settings = definePluginSettings({
    hideUnsortedMedias: {
        type: OptionType.BOOLEAN,
        description: "Hide uncategorized media in picker",
        default: false
    },
    hideThumbnail: {
        type: OptionType.BOOLEAN,
        description: "Show category color instead of thumbnail",
        default: false
    },
    allowCaching: {
        type: OptionType.BOOLEAN,
        description: "Cache media previews locally",
        default: true
    },
    mediaVolume: {
        type: OptionType.SLIDER,
        description: "Preview volume for videos and audio",
        markers: [0, 25, 50, 75, 100],
        default: 10,
        stickToMarkers: false
    },
    maxMediasPerPage: {
        type: OptionType.SELECT,
        description: "Maximum media items per page",
        options: [
            { label: "20", value: 20 },
            { label: "50", value: 50 },
            { label: "100", value: 100 }
        ],
        default: 50
    },
    shiftClickAddSpace: {
        type: OptionType.BOOLEAN,
        description: "Add a space after URL when shift-clicking media",
        default: true
    },
    shiftClickAddNewline: {
        type: OptionType.BOOLEAN,
        description: "Add a newline after URL when shift-clicking media",
        default: false
    },
    imageEnabled: { type: OptionType.BOOLEAN, description: "Enable image favorites", default: true },
    imageShowStar: { type: OptionType.BOOLEAN, description: "Show star button on images", default: true },
    imageShowButton: { type: OptionType.BOOLEAN, description: "Show image button in chat bar", default: true },
    imageInstantSend: { type: OptionType.BOOLEAN, description: "Send images instantly on shift-click", default: true },
    imageUploadAsFile: { type: OptionType.BOOLEAN, description: "Upload images as files instead of URLs", default: false },
    videoEnabled: { type: OptionType.BOOLEAN, description: "Enable video favorites", default: true },
    videoShowStar: { type: OptionType.BOOLEAN, description: "Show star button on videos", default: true },
    videoShowButton: { type: OptionType.BOOLEAN, description: "Show video button in chat bar", default: true },
    videoInstantSend: { type: OptionType.BOOLEAN, description: "Send videos instantly on shift-click", default: true },
    videoUploadAsFile: { type: OptionType.BOOLEAN, description: "Upload videos as files instead of URLs", default: false },
    audioEnabled: { type: OptionType.BOOLEAN, description: "Enable audio favorites", default: true },
    audioShowStar: { type: OptionType.BOOLEAN, description: "Show star button on audio", default: true },
    audioShowButton: { type: OptionType.BOOLEAN, description: "Show audio button in chat bar", default: true },
    audioInstantSend: { type: OptionType.BOOLEAN, description: "Send audio instantly on shift-click", default: true },
    audioUploadAsFile: { type: OptionType.BOOLEAN, description: "Upload audio as files instead of URLs", default: false },
    fileEnabled: { type: OptionType.BOOLEAN, description: "Enable file favorites", default: true },
    fileShowStar: { type: OptionType.BOOLEAN, description: "Show star button on files", default: true },
    fileShowButton: { type: OptionType.BOOLEAN, description: "Show file button in chat bar", default: true },
    fileInstantSend: { type: OptionType.BOOLEAN, description: "Send files instantly on shift-click", default: true },
    fileUploadAsFile: { type: OptionType.BOOLEAN, description: "Upload files as files instead of URLs", default: false },
    exportData: {
        type: OptionType.COMPONENT,
        description: "Export all favorites to JSON file",
        component: () => <Button onClick={exportData}>Export Favorites</Button>
    },
    importData: {
        type: OptionType.COMPONENT,
        description: "Import favorites from JSON file",
        component: () => <Button onClick={importData}>Import Favorites</Button>
    },
    clearCache: {
        type: OptionType.COMPONENT,
        description: "Clear all cached media previews",
        component: () => <Button onClick={clearCache} variant="dangerPrimary">Clear Cache</Button>
    }
});

export function isMediaTypeEnabled(type: MediaType): boolean {
    return settings.store[`${type}Enabled`] as boolean;
}

export function shouldShowStar(type: MediaType): boolean {
    return isMediaTypeEnabled(type) && (settings.store[`${type}ShowStar`] as boolean);
}

export function shouldShowButton(type: MediaType): boolean {
    return isMediaTypeEnabled(type) && (settings.store[`${type}ShowButton`] as boolean);
}

export function isInstantSendEnabled(type: MediaType): boolean {
    return settings.store[`${type}InstantSend`] as boolean;
}

export function shouldUploadAsFile(type: MediaType): boolean {
    return settings.store[`${type}UploadAsFile`] as boolean;
}

function getMediaTypeFromItem(item: any): MediaType | null {
    if (!item?.type) return null;
    switch (item.type) {
        case "IMAGE": return "image";
        case "VIDEO": return "video";
        case "AUDIO": return "audio";
        case "OTHER": return "file";
        default: return null;
    }
}

function getUrlFromItem(item: any): string | null {
    return item?.downloadUrl || item?.url || item?.src || null;
}

export default definePlugin({
    name: "FavoriteMedia",
    description: "Favorite and organize images, videos, audio, and files",
    authors: [EquicordDevs.mmeta],
    settings,

    patches: [
        {
            find: "stickersNavItem",
            replacement: [
                {
                    match: /(\i=\(0,\i\.jsx\)\(\i,\{id:\i\.\i,"aria-controls":\i\.\i,"aria-selected":\i===\i\.\i\.EMOJI,isActive:\i===\i\.\i\.EMOJI,viewType:\i\.\i\.EMOJI,children:\i\.intl\.string\(\i\.t\.\i+\)\}\);)/,
                    replace: "$1let vcFmImage=(0,r.jsx)(Q,{id:\"fm-image-tab\",\"aria-selected\":ec===\"fm-image\",isActive:ec===\"fm-image\",viewType:\"fm-image\",children:\"Images\"}),vcFmVideo=(0,r.jsx)(Q,{id:\"fm-video-tab\",\"aria-selected\":ec===\"fm-video\",isActive:ec===\"fm-video\",viewType:\"fm-video\",children:\"Videos\"}),vcFmAudio=(0,r.jsx)(Q,{id:\"fm-audio-tab\",\"aria-selected\":ec===\"fm-audio\",isActive:ec===\"fm-audio\",viewType:\"fm-audio\",children:\"Audio\"}),vcFmFile=(0,r.jsx)(Q,{id:\"fm-file-tab\",\"aria-selected\":ec===\"fm-file\",isActive:ec===\"fm-file\",viewType:\"fm-file\",children:\"Files\"});"
                },
                {
                    match: /(\i\?\(0,\i\.jsxs\)\(\i\.Fragment,\{children:\[\i,\i,\i\]\}\):\(0,\i\.jsxs\)\(\i\.Fragment,\{children:\[\i,\i,\i\]\}\))/,
                    replace: "(0,r.jsxs)(r.Fragment,{children:[...(($1).props.children),vcFmImage,vcFmVideo,vcFmAudio,vcFmFile]})"
                },
                {
                    match: /(\i)===(\i\.\i)\.SOUNDBOARD\?/,
                    replace: "$1.startsWith(\"fm-\")?$self.renderMediaPicker($1):$1===$2.SOUNDBOARD?"
                }
            ]
        },
        {
            find: "mosaicItemContent",
            replacement: {
                match: /(children:\i=>\i\(\i\)\}\):)(Y\(\))(,\i\]\}\)\}\})/,
                replace: "$1(0,r.jsxs)('div',{style:{position:'relative'},children:[$2,$self.renderStarButton(n,a)]})$3"
            }
        },
        {
            find: "renderEmbedContent",
            replacement: {
                match: "children:[null!=r?t.renderSuppressButton(r):null,o,l,c,u,d,_,p,m]",
                replace: "children:[null!=r?t.renderSuppressButton(r):null,o,l,c,u,d,_,$self.renderEmbedStarButton(t.props.embed),p,m]"
            }
        },
        {
            find: "imageWrapper",
            replacement: {
                match: /(null!=G\?\(0,r\.jsx\)\(l\.P3F,\{className:g\.clickableWrapper,.*?,children:n\}\):n,)(null!=q\?\(0,r\.jsx\)\("div",\{className:g\.imageAccessory,children:q\}\):null\])/s,
                replace: "$1$self.renderImageStarButton(e),$2"
            }
        }
    ],

    renderStarButton(item: any, _message: any) {
        const mediaType = getMediaTypeFromItem(item);
        const url = getUrlFromItem(item);

        if (!mediaType || !url) return null;
        if (!shouldShowStar(mediaType)) return null;

        if (mediaType === "image" && url.toLowerCase().includes(".gif")) return null;

        return (
            <div className="fm-star-overlay">
                <StarButton type={mediaType} url={url} fromPicker={false} />
            </div>
        );
    },

    renderEmbedStarButton(embed: any) {
        const url = embed?.image?.url || embed?.video?.url || embed?.thumbnail?.url;
        if (!url) return null;

        const mediaType: MediaType = embed?.video ? "video" : "image";

        if (!shouldShowStar(mediaType)) return null;

        if (mediaType === "image" && url.toLowerCase().includes(".gif")) return null;

        return (
            <div className="fm-star-overlay">
                <StarButton type={mediaType} url={url} fromPicker={false} />
            </div>
        );
    },

    renderImageStarButton(props: any) {
        const url = props?.original || props?.src;
        if (!url) return null;

        const mediaType: MediaType = "image";
        if (!shouldShowStar(mediaType)) return null;
        if (url.toLowerCase().includes(".gif")) return null;

        return (
            <div className="fm-star-overlay">
                <StarButton type={mediaType} url={url} fromPicker={false} />
            </div>
        );
    },

    renderMediaPicker(viewType: string) {
        if (!viewType.startsWith("fm-")) return null;
        const mediaType = viewType.replace("fm-", "") as MediaType;
        return <MediaPicker type={mediaType} />;
    },

    contextMenus: {
        "message": addFavoriteMediaContextMenuPatch
    },

    async start() {
        logger.info("FavoriteMedia plugin started");
        await loadAllMediaData();

        const buttonConfig: { type: MediaType; name: string; icon: typeof ImageIcon; }[] = [
            { type: "image", name: "FavImages", icon: ImageIcon },
            { type: "video", name: "FavVideos", icon: VideoIcon },
            { type: "audio", name: "FavAudio", icon: AudioIcon },
            { type: "file", name: "FavFiles", icon: FileIcon }
        ];

        for (const { type: mediaType, name, icon } of buttonConfig) {
            addChatBarButton(
                name,
                props => <FavoriteMediaChatBarButton {...props} mediaType={mediaType} />,
                icon
            );
        }
    },

    stop() {
        logger.info("FavoriteMedia plugin stopped");
        const buttonNames = ["FavImages", "FavVideos", "FavAudio", "FavFiles"];
        for (const name of buttonNames) {
            removeChatBarButton(name);
        }
    }
});
