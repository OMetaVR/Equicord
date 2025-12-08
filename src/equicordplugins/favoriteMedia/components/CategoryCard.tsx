/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openModal } from "@utils/modal";
import { Alerts, ContextMenuApi, FluxDispatcher, Menu, React } from "@webpack/common";

import { settings } from "..";
import { CategoryCardProps } from "../types";
import { deleteCategory } from "../utils/categoryManager";
import { getMediaData } from "../utils/mediaManager";
import { CollectionModal } from "./CollectionModal";

function shouldUseDarkText(hexColor: string): boolean {
    const hex = hexColor.replace("#", "");

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);

    return luminance > 186;
}

export function CategoryCard({ category, type, onClick, onDragOver, onDrop }: CategoryCardProps) {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [coverImage, setCoverImage] = React.useState<string | null>(null);
    const hideThumbnail = settings.store.hideThumbnail as boolean;

    React.useEffect(() => {
        const loadCoverImage = async () => {
            const data = await getMediaData(type);
            const collectionMedia = data.medias.filter(m => m.category_id === category.id);

            if (collectionMedia.length > 0) {
                const randomMedia = collectionMedia[Math.floor(Math.random() * collectionMedia.length)];
                const imageUrl = type === "video" && randomMedia.poster
                    ? randomMedia.poster
                    : randomMedia.url;
                setCoverImage(imageUrl);
            } else {
                setCoverImage(null);
            }
        };

        loadCoverImage();
    }, [category.id, type]);

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
        if (onDragOver) onDragOver(e);
    }, [onDragOver]);

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (onDrop) onDrop(e);
    }, [onDrop]);

    const handleClick = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    }, [onClick]);

    const handleDelete = React.useCallback(async () => {
        Alerts.show({
            title: "Delete Collection",
            body: `Are you sure you want to delete "${category.name}"? Media in this collection will not be deleted.`,
            confirmText: "Delete",
            confirmColor: "red",
            cancelText: "Cancel",
            onConfirm: async () => {
                await deleteCategory(type, category.id);
                FluxDispatcher.dispatch({ type: "FM_MEDIA_UPDATED" });
            }
        });
    }, [type, category]);

    const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu
                navId="fm-collection-context"
                onClose={() => FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" })}
            >
                <Menu.MenuItem
                    id="fm-edit-collection"
                    label="Edit Collection"
                    action={() => {
                        openModal(modalProps => (
                            <CollectionModal
                                {...modalProps}
                                type={type}
                                collection={category}
                            />
                        ));
                    }}
                />
                <Menu.MenuSeparator />
                <Menu.MenuItem
                    id="fm-delete-collection"
                    label="Delete Collection"
                    color="danger"
                    action={handleDelete}
                />
            </Menu.Menu>
        ));
    }, [type, category, handleDelete]);

    const imageToUse = !hideThumbnail ? (coverImage || category.thumbnail) : null;

    const useDarkText = shouldUseDarkText(category.color);

    return (
        <div
            className={`fm-category-card ${isDragOver ? "fm-drag-over" : ""}`}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            title={`${category.name}\nRight-click for options`}
        >
            {imageToUse ? (
                <div
                    className="fm-category-bg"
                    style={{ backgroundImage: `url(${imageToUse})` }}
                />
            ) : (
                <div
                    className="fm-category-bg fm-category-bg-solid"
                    style={{ backgroundColor: category.color }}
                />
            )}

            {imageToUse && (
                <div
                    className="fm-category-overlay"
                    style={{ backgroundColor: category.color }}
                />
            )}

            <div
                className="fm-category-name"
                style={useDarkText ? { color: "#000", textShadow: "0 1px 4px rgb(255 255 255 / 50%)" } : undefined}
            >
                {category.name}
            </div>
        </div>
    );
}
