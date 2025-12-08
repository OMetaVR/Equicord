/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";
import { ExpressionPickerStore, FluxDispatcher, React, Toasts } from "@webpack/common";

import { settings, shouldUploadAsFile as shouldUploadAsFileSetting } from "..";
import { Category, Media, MediaPickerProps, MediaPickerState, MediaType } from "../types";
import { getMediaData } from "../utils/mediaManager";
import { getPaginatedItems } from "../utils/paginationUtils";
import { filterByName } from "../utils/searchUtils";
import { shouldUploadAsFile, uploadMediaAsFile } from "../utils/uploadMedia";
import { refreshMediaUrls } from "../utils/urlRefresh";
import { CategoryCard } from "./CategoryCard";
import { MediaCard } from "./MediaCard";

const logger = new Logger("FavoriteMedia:MediaPicker");

const ComponentDispatch = findByPropsLazy("dispatchToLastSubscribed");

export function MediaPicker({ type }: MediaPickerProps) {
    const [state, setState] = React.useState<MediaPickerState>({
        textFilter: "",
        categories: [],
        category: null,
        medias: [],
        contentWidth: null,
        page: 1
    });

    const loadMediaData = React.useCallback(async () => {
        try {
            const data = await getMediaData(type);

            const refreshedMedias = await refreshMediaUrls([...data.medias]);

            refreshedMedias.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));

            setState(prev => ({
                ...prev,
                categories: data.categories,
                medias: refreshedMedias
            }));
        } catch (error) {
            logger.error("Error loading media data:", error);
        }
    }, [type]);

    React.useEffect(() => {
        loadMediaData();

        const handleMediaUpdate = () => {
            loadMediaData();
        };

        FluxDispatcher.subscribe("FM_MEDIA_UPDATED", handleMediaUpdate);

        return () => {
            FluxDispatcher.unsubscribe("FM_MEDIA_UPDATED", handleMediaUpdate);
        };
    }, [type, loadMediaData]);

    const handleSearchChange = React.useCallback((value: string) => {
        setState(prev => ({
            ...prev,
            textFilter: value,
            page: 1
        }));
    }, []);

    const handleClearSearch = React.useCallback(() => {
        setState(prev => ({
            ...prev,
            textFilter: "",
            page: 1
        }));
    }, []);

    const handleCategoryClick = React.useCallback((category: Category) => {
        setState(prev => ({
            ...prev,
            category,
            page: 1
        }));
    }, []);

    const handleBackClick = React.useCallback(() => {
        setState(prev => ({
            ...prev,
            category: null,
            page: 1
        }));
    }, []);

    const handlePageChange = React.useCallback((newPage: number) => {
        setState(prev => ({
            ...prev,
            page: newPage
        }));
    }, []);

    const handleMediaSend = React.useCallback(async (media: Media, mediaType: MediaType, shiftClick: boolean) => {
        const uploadAsFileSetting = shouldUploadAsFileSetting(mediaType);
        const needsFileUpload = shouldUploadAsFile(mediaType, uploadAsFileSetting);

        if (needsFileUpload) {
            try {
                await uploadMediaAsFile(media, mediaType, false, !shiftClick);

                if (shiftClick) {
                    return;
                }

                ExpressionPickerStore.closeExpressionPicker();
            } catch (error) {
                logger.error("Failed to upload media:", error);
                Toasts.show({
                    message: `Failed to upload ${mediaType}: ${error}`,
                    type: Toasts.Type.FAILURE,
                    id: Toasts.genId()
                });
            }
        } else {
            if (shiftClick) {
                let textToInsert = media.url;
                if (settings.store.shiftClickAddNewline) {
                    textToInsert += "\n";
                } else if (settings.store.shiftClickAddSpace) {
                    textToInsert += " ";
                }

                ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT", {
                    rawText: textToInsert,
                    plainText: textToInsert
                });
                return;
            }

            const { sendMessage } = await import("@utils/discord");
            const { SelectedChannelStore } = await import("@webpack/common");
            const channelId = SelectedChannelStore.getChannelId();
            if (channelId) {
                sendMessage(channelId, { content: media.url });
            }
            ExpressionPickerStore.closeExpressionPicker();
        }
    }, []);

    const getDisplayItems = React.useCallback(() => {
        const { textFilter, categories, category, medias, page } = state;
        const pageSize = settings.store.maxMediasPerPage as number;
        const hideUnsorted = settings.store.hideUnsortedMedias as boolean;

        let filteredCategories = filterByName(categories, textFilter);
        let filteredMedias = filterByName(medias, textFilter);

        if (category) {
            filteredCategories = filteredCategories.filter(c => c.category_id === category.id);
            filteredMedias = filteredMedias.filter(m => m.category_id === category.id);
        } else {
            filteredCategories = filteredCategories.filter(c => !c.category_id);

            if (hideUnsorted) {
                filteredMedias = filteredMedias.filter(m => m.category_id != null);
            }
        }

        logger.info(`Displaying ${filteredCategories.length} categories and ${filteredMedias.length} medias (hideUnsorted=${hideUnsorted})`);

        const allItems = [...filteredCategories, ...filteredMedias];

        return getPaginatedItems(allItems, page, pageSize);
    }, [state]);

    const displayItems = getDisplayItems();
    const { textFilter, category } = state;

    return (
        <div className="fm-picker-container">
            <div className="fm-picker-header">
                {category && (
                    <button
                        className="fm-back-button"
                        onClick={handleBackClick}
                        title="Back"
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                        </svg>
                    </button>
                )}

                <div className="fm-search-container">
                    <div className="fm-search-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M21.707 20.293L16.314 14.9C17.403 13.504 18 11.799 18 10C18 5.589 14.411 2 10 2C5.589 2 2 5.589 2 10C2 14.411 5.589 18 10 18C11.799 18 13.504 17.403 14.9 16.314L20.293 21.707C20.488 21.902 20.744 22 21 22C21.256 22 21.512 21.902 21.707 21.707C22.098 21.316 22.098 20.684 21.707 20.293ZM4 10C4 6.691 6.691 4 10 4C13.309 4 16 6.691 16 10C16 13.309 13.309 16 10 16C6.691 16 4 13.309 4 10Z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        className="fm-search-input"
                        autoFocus
                        value={textFilter}
                        onChange={e => handleSearchChange(e.target.value)}
                        placeholder={`Search Favorite ${type.charAt(0).toUpperCase() + type.slice(1)}s`}
                    />
                    {textFilter && (
                        <button
                            className="fm-clear-search"
                            onClick={handleClearSearch}
                            aria-label="Clear search"
                        >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                                <path d="M7.02799 0.333252C3.346 0.333252 0.361328 3.31792 0.361328 6.99992C0.361328 10.6819 3.346 13.6666 7.02799 13.6666C10.71 13.6666 13.6947 10.6819 13.6947 6.99992C13.6947 3.31792 10.7093 0.333252 7.02799 0.333252ZM10.166 9.19525L9.22333 10.1379L7.02799 7.94325L4.83266 10.1379L3.89 9.19525L6.08466 6.99992L3.88933 4.80459L4.832 3.86192L7.02799 6.05765L9.22266 3.86192L10.1653 4.80459L7.97066 6.99992L10.166 9.19525Z" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="fm-media-counter">
                    {displayItems.totalItems} items
                </div>

                <div className="fm-action-buttons">
                </div>
            </div>

            <div className="fm-media-grid">
                {displayItems.items.length === 0 ? (
                    <div className="fm-empty-state">
                        <div className="fm-empty-state-icon">⭐</div>
                        <div className="fm-empty-state-text">
                            No favorites yet!<br />
                            Hover over {type}s and click the star to add them.
                        </div>
                    </div>
                ) : (
                    displayItems.items.map((item, index) => {
                        if ("color" in item) {
                            const cat = item as Category;
                            return (
                                <CategoryCard
                                    key={`category-${cat.id}`}
                                    category={cat}
                                    type={type}
                                    onClick={() => handleCategoryClick(cat)}
                                />
                            );
                        } else {
                            const media = item as Media;
                            return (
                                <MediaCard
                                    key={`media-${index}-${media.url}`}
                                    media={media}
                                    type={type}
                                    onClick={() => handleMediaSend(media, type, false)}
                                    onShiftClick={() => handleMediaSend(media, type, true)}
                                />
                            );
                        }
                    })
                )}
            </div>

            {displayItems.totalPages > 1 && (
                <div className="fm-pagination">
                    <button
                        className="fm-pagination-button"
                        onClick={() => handlePageChange(displayItems.currentPage - 1)}
                        disabled={!displayItems.hasPrevious}
                    >
                        Previous
                    </button>
                    <span className="fm-pagination-info">
                        Page {displayItems.currentPage} of {displayItems.totalPages}
                    </span>
                    <button
                        className="fm-pagination-button"
                        onClick={() => handlePageChange(displayItems.currentPage + 1)}
                        disabled={!displayItems.hasNext}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
