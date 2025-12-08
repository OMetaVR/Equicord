/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openModal } from "@utils/modal";
import { ContextMenuApi, FluxDispatcher, Menu, React } from "@webpack/common";

import { settings } from "..";
import { Category, MediaCardProps } from "../types";
import { getMediaData, saveMediaData } from "../utils/mediaManager";
import { CollectionModal } from "./CollectionModal";
import { StarButton } from "./StarButton";

export function MediaCard({ media, type, onClick, onShiftClick, onDragStart }: MediaCardProps) {
    const [showControls, setShowControls] = React.useState(false);
    const [collections, setCollections] = React.useState<Category[]>([]);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const audioRef = React.useRef<HTMLAudioElement>(null);
    const mediaVolume = (settings.store.mediaVolume as number) / 100;

    React.useEffect(() => {
        getMediaData(type).then(data => {
            setCollections(data.categories.filter(c => !c.category_id));
        });
    }, [type]);

    const handleClick = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.shiftKey && onShiftClick) {
            onShiftClick();
        } else {
            onClick();
        }
    }, [onClick, onShiftClick]);

    const handleDragStart = React.useCallback((e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", media.url);
        e.dataTransfer.setData("application/x-favorite-media", JSON.stringify({
            type,
            url: media.url
        }));

        if (onDragStart) {
            onDragStart(e);
        }
    }, [media.url, type, onDragStart]);

    const handleControlsToggle = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (showControls) {
            videoRef.current?.pause();
            audioRef.current?.pause();
        }

        setShowControls(prev => !prev);
    }, [showControls]);

    const handleAddToCollection = React.useCallback(async (collection: Category) => {
        const data = await getMediaData(type);
        const mediaIndex = data.medias.findIndex(m => m.url === media.url);
        if (mediaIndex !== -1) {
            data.medias[mediaIndex].category_id = collection.id;
            await saveMediaData(type, data);
            FluxDispatcher.dispatch({ type: "FM_MEDIA_UPDATED" });
        }
    }, [type, media.url]);

    const handleRemoveFromCollection = React.useCallback(async () => {
        const data = await getMediaData(type);
        const mediaIndex = data.medias.findIndex(m => m.url === media.url);
        if (mediaIndex !== -1) {
            delete data.medias[mediaIndex].category_id;
            await saveMediaData(type, data);
            FluxDispatcher.dispatch({ type: "FM_MEDIA_UPDATED" });
        }
    }, [type, media.url]);

    const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu
                navId="fm-media-context"
                onClose={() => FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" })}
            >
                <Menu.MenuItem
                    id="fm-add-to-collection"
                    label="Add to Collection"
                >
                    {collections.length > 0 && collections.map(col => (
                        <Menu.MenuItem
                            key={`col-${col.id}`}
                            id={`col-${col.id}`}
                            label={col.name}
                            action={() => handleAddToCollection(col)}
                        />
                    ))}
                    {collections.length > 0 && <Menu.MenuSeparator />}
                    <Menu.MenuItem
                        id="fm-create-collection"
                        label="Create Collection"
                        action={() => {
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
                {media.category_id && (
                    <Menu.MenuItem
                        id="fm-remove-from-collection"
                        label="Remove from Collection"
                        color="danger"
                        action={handleRemoveFromCollection}
                    />
                )}
            </Menu.Menu>
        ));
    }, [type, media, collections, handleAddToCollection, handleRemoveFromCollection]);

    const renderThumbnail = () => {
        if (type === "image" || type === "gif") {
            return (
                <img
                    src={media.url}
                    alt={media.name}
                    className="fm-media-thumbnail"
                    draggable={false}
                />
            );
        }

        if (type === "video") {
            return (
                <video
                    ref={videoRef}
                    src={media.url}
                    poster={media.poster}
                    className="fm-media-thumbnail"
                    controls={showControls}
                    draggable={false}
                    volume={mediaVolume}
                />
            );
        }

        if (type === "audio") {
            return (
                <div className="fm-media-icon-container">
                    <div className="fm-media-icon">🎵</div>
                    <div className="fm-media-name">{media.name}</div>
                    {showControls && (
                        <audio
                            ref={audioRef}
                            src={media.url}
                            controls
                            className="fm-media-audio-controls"
                            volume={mediaVolume}
                        />
                    )}
                </div>
            );
        }

        if (type === "file") {
            return (
                <div className="fm-media-icon-container">
                    <div className="fm-media-icon">📄</div>
                    <div className="fm-media-name">{media.name}</div>
                    {media.ext && (
                        <div className="fm-media-ext">.{media.ext}</div>
                    )}
                </div>
            );
        }

        return null;
    };

    return (
        <div
            className="fm-media-card"
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            draggable
            onDragStart={handleDragStart}
            title={`${media.name}\nClick to send, Shift+Click to put in input\nRight-click for options`}
        >
            <div className="fm-star-overlay">
                <StarButton type={type} url={media.url} fromPicker={true} />
            </div>

            {renderThumbnail()}

            {(type === "video" || type === "audio") && (
                <button
                    className="fm-controls-toggle"
                    onClick={handleControlsToggle}
                    title={showControls ? "Stop & hide controls" : "Show controls"}
                >
                    {showControls ? "⏹️" : "▶️"}
                </button>
            )}
        </div>
    );
}
