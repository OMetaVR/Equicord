/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const MEDIA_TYPES = ["gif", "image", "video", "audio", "file"] as const;
export type MediaType = typeof MEDIA_TYPES[number];

export interface Media {
    url: string;
    name: string;
    width?: number;
    height?: number;
    poster?: string;
    ext?: string;
    category_id?: number;
    message?: string;
    source?: string;
    addedAt?: number;
}

export interface Category {
    id: number;
    name: string;
    color: string;
    thumbnail?: string;
    category_id?: number;
}

export interface StoredMediaData {
    medias: Media[];
    categories: Category[];
}

export interface ExportData {
    version: string;
    gif: StoredMediaData;
    image: StoredMediaData;
    video: StoredMediaData;
    audio: StoredMediaData;
    file: StoredMediaData;
}

export interface FluxReactionEvent {
    type: "MESSAGE_REACTION_ADD" | "MESSAGE_REACTION_REMOVE";
    messageId: string;
    channelId: string;
    emoji: {
        name: string;
        id?: string;
    };
    optimistic?: boolean;
}

export interface StarButtonProps {
    type: MediaType;
    url: string;
    poster?: string;
    fromPicker?: boolean;
    uploaded?: boolean;
    target?: React.RefObject<HTMLElement>;
}

export interface MediaPickerProps {
    type: MediaType;
}

export interface MediaPickerState {
    textFilter: string;
    categories: Category[];
    category: Category | null;
    medias: Media[];
    contentWidth: number | null;
    page: number;
}

export interface CategoryCardProps {
    category: Category;
    type: MediaType;
    onClick: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
}

export interface MediaCardProps {
    media: Media;
    type: MediaType;
    onClick: () => void;
    onShiftClick?: () => void;
    onDragStart?: (e: React.DragEvent) => void;
}

export interface ChatBarButtonProps {
    type: MediaType;
    channelId: string;
}

export interface CategoryModalProps {
    type: MediaType;
    category?: Category;
    parentId?: number;
    onSave: (name: string, color: string) => void;
    onClose: () => void;
}

export interface ScheduledAttachment {
    filename: string;
    data: string;
    type: string;
}
