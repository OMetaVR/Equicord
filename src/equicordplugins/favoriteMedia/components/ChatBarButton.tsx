/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { IconProps } from "@utils/types";
import { ExpressionPickerStore } from "@webpack/common";

import { shouldShowButton } from "../index";
import { MediaType } from "../types";

export function ImageIcon({ className, width = 20, height = 20 }: IconProps) {
    return (
        <svg
            className={className}
            aria-hidden="false"
            viewBox="0 0 384 384"
            width={width}
            height={height}
        >
            <path
                fill="currentColor"
                d="M341.333,0H42.667C19.093,0,0,19.093,0,42.667v298.667C0,364.907,19.093,384,42.667,384h298.667 C364.907,384,384,364.907,384,341.333V42.667C384,19.093,364.907,0,341.333,0z M42.667,320l74.667-96l53.333,64.107L245.333,192l96,128H42.667z"
            />
        </svg>
    );
}

export function VideoIcon({ className, width = 20, height = 20 }: IconProps) {
    return (
        <svg
            className={className}
            aria-hidden="false"
            viewBox="0 0 298 298"
            width={width}
            height={height}
        >
            <path
                fill="currentColor"
                d="M298,33c0-13.255-10.745-24-24-24H24C10.745,9,0,19.745,0,33v232c0,13.255,10.745,24,24,24h250c13.255,0,24-10.745,24-24V33zM91,39h43v34H91V39z M61,259H30v-34h31V259z M61,73H30V39h31V73z M134,259H91v-34h43V259z M123,176.708v-55.417c0-8.25,5.868-11.302,12.77-6.783l40.237,26.272c6.902,4.519,6.958,11.914,0.056,16.434l-40.321,26.277C128.84,188.011,123,184.958,123,176.708z M207,259h-43v-34h43V259z M207,73h-43V39h43V73z M268,259h-31v-34h31V259z M268,73h-31V39h31V73z"
            />
        </svg>
    );
}

export function AudioIcon({ className, width = 20, height = 20 }: IconProps) {
    return (
        <svg
            className={className}
            aria-hidden="false"
            viewBox="0 0 115.3 115.3"
            width={width}
            height={height}
        >
            <path
                fill="currentColor"
                d="M47.9,14.306L26,30.706H6c-3.3,0-6,2.7-6,6v41.8c0,3.301,2.7,6,6,6h20l21.9,16.4c4,3,9.6,0.2,9.6-4.8v-77C57.5,14.106,51.8,11.306,47.9,14.306z"
            />
            <path
                fill="currentColor"
                d="M77.3,24.106c-2.7-2.7-7.2-2.7-9.899,0c-2.7,2.7-2.7,7.2,0,9.9c13,13,13,34.101,0,47.101c-2.7,2.7-2.7,7.2,0,9.899c1.399,1.4,3.199,2,4.899,2s3.601-0.699,4.9-2.1C95.8,72.606,95.8,42.606,77.3,24.106z"
            />
            <path
                fill="currentColor"
                d="M85.1,8.406c-2.699,2.7-2.699,7.2,0,9.9c10.5,10.5,16.301,24.4,16.301,39.3s-5.801,28.8-16.301,39.3c-2.699,2.7-2.699,7.2,0,9.9c1.4,1.399,3.2,2.1,4.9,2.1c1.8,0,3.6-0.7,4.9-2c13.1-13.1,20.399-30.6,20.399-49.2c0-18.6-7.2-36-20.399-49.2C92.3,5.706,87.9,5.706,85.1,8.406z"
            />
        </svg>
    );
}

export function FileIcon({ className, width = 20, height = 20 }: IconProps) {
    return (
        <svg
            className={className}
            aria-hidden="false"
            viewBox="2 2 20 20"
            width={width}
            height={height}
        >
            <path
                fill="currentColor"
                d="M16,2l4,4H16ZM14,2H5A1,1,0,0,0,4,3V21a1,1,0,0,0,1,1H19a1,1,0,0,0,1-1V8H14Z"
            />
        </svg>
    );
}

const MEDIA_TYPE_ICONS: Record<MediaType, React.ComponentType<{ className?: string; }>> = {
    gif: ImageIcon,
    image: ImageIcon,
    video: VideoIcon,
    audio: AudioIcon,
    file: FileIcon
};

const MEDIA_TYPE_NAMES: Record<MediaType, string> = {
    gif: "GIFs",
    image: "Images",
    video: "Videos",
    audio: "Audio",
    file: "Files"
};

const MEDIA_TYPE_VIEWS: Record<MediaType, string> = {
    gif: "gif",
    image: "fm-image",
    video: "fm-video",
    audio: "fm-audio",
    file: "fm-file"
};

interface FMChatBarButtonProps {
    mediaType: MediaType;
    isMainChat: boolean;
    channel: { id: string; };
    type: any;
}

export function FavoriteMediaChatBarButton(props: FMChatBarButtonProps) {
    const { mediaType, isMainChat, channel, type: chatInputType } = props;

    if (!isMainChat || !shouldShowButton(mediaType)) {
        return null;
    }

    const Icon = MEDIA_TYPE_ICONS[mediaType];
    const displayName = MEDIA_TYPE_NAMES[mediaType];
    const activeView = MEDIA_TYPE_VIEWS[mediaType];

    const handleClick = () => {
        console.log("[FavoriteMedia] Button clicked for:", mediaType, "channel:", channel?.id);
        ExpressionPickerStore.openExpressionPicker("gif", chatInputType);
        setTimeout(() => {
            console.log("[FavoriteMedia] Switching to view:", activeView);
            ExpressionPickerStore.setExpressionPickerView(activeView);
        }, 50);
    };

    const tooltip = `Favorite ${displayName}`;

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={handleClick}
            buttonProps={{ "aria-label": tooltip }}
        >
            <Icon />
        </ChatBarButton>
    );
}
