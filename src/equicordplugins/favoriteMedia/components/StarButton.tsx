/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { FluxDispatcher, React, Tooltip } from "@webpack/common";

import { shouldShowStar } from "..";
import { StarButtonProps } from "../types";
import { addMedia, checkSameUrl, isFavorited, removeMedia } from "../utils/mediaManager";

const logger = new Logger("FavoriteMedia:StarButton");

const FM_FAVORITE_MEDIA_EVENT = "FM_FAVORITE_MEDIA";

function StarFilledIcon() {
    return (
        <svg
            className="fm-star-icon"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fill="currentColor"
                d="M10.81 2.86c.38-1.15 2-1.15 2.38 0l1.89 5.83h6.12c1.2 0 1.71 1.54.73 2.25l-4.95 3.6 1.9 5.82a1.25 1.25 0 0 1-1.93 1.4L12 18.16l-4.95 3.6c-.98.7-2.3-.25-1.92-1.4l1.89-5.82-4.95-3.6a1.25 1.25 0 0 1 .73-2.25h6.12l1.9-5.83Z"
            />
        </svg>
    );
}

function StarUnfilledIcon() {
    return (
        <svg
            className="fm-star-icon"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M2.07 10.94a1.25 1.25 0 0 1 .73-2.25h6.12l1.9-5.83c.37-1.15 2-1.15 2.37 0l1.89 5.83h6.12c1.2 0 1.71 1.54.73 2.25l-4.95 3.6 1.9 5.82a1.25 1.25 0 0 1-1.93 1.4L12 18.16l-4.95 3.6c-.98.7-2.3-.25-1.92-1.4l1.89-5.82-4.95-3.6Zm11.55-.25h5.26l-4.25 3.09 1.62 5-4.25-3.1-4.25 3.1 1.62-5-4.25-3.1h5.26l1.62-5 1.62 5Z"
            />
        </svg>
    );
}

export function StarButton(props: StarButtonProps) {
    const { type, url, poster, fromPicker = false, uploaded = false } = props;

    if (!shouldShowStar(type)) {
        return null;
    }

    const [favorited, setFavorited] = React.useState(() => isFavorited(type, url));

    React.useEffect(() => {
        const handleFavoriteChange = (event: any) => {
            if (event.mediaType === type && checkSameUrl(event.url, url)) {
                setFavorited(event.favorited);
            }
        };

        FluxDispatcher.subscribe(FM_FAVORITE_MEDIA_EVENT, handleFavoriteChange);

        return () => {
            FluxDispatcher.unsubscribe(FM_FAVORITE_MEDIA_EVENT, handleFavoriteChange);
        };
    }, [type, url]);

    const handleClick = React.useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            if (favorited) {
                await removeMedia(type, url);
                setFavorited(false);

                FluxDispatcher.dispatch({
                    type: FM_FAVORITE_MEDIA_EVENT,
                    mediaType: type,
                    url,
                    favorited: false
                });

                logger.info(`Removed ${type} from favorites:`, url);
            } else {
                const media = {
                    url,
                    name: extractMediaName(url),
                    poster
                };

                await addMedia(type, media);
                setFavorited(true);

                FluxDispatcher.dispatch({
                    type: FM_FAVORITE_MEDIA_EVENT,
                    mediaType: type,
                    url,
                    favorited: true
                });

                logger.info(`Added ${type} to favorites:`, url);
            }
        } catch (error) {
            logger.error("Error toggling favorite state:", error);
        }
    }, [type, url, poster, favorited]);

    const tooltipText = favorited ? "Remove from Favorites" : "Add to Favorites";

    return (
        <Tooltip text={tooltipText} position="top">
            {tooltipProps => (
                <div
                    {...tooltipProps}
                    className={`fm-star-button${favorited ? " fm-favorited" : ""}`}
                    onClick={handleClick}
                >
                    {favorited ? <StarFilledIcon /> : <StarUnfilledIcon />}
                </div>
            )}
        </Tooltip>
    );
}

function extractMediaName(url: string): string {
    try {
        const urlObj = new URL(url);
        const { pathname } = urlObj;
        const filename = pathname.split("/").pop() || "media";
        return filename.replace(/\.[^.]+$/, "");
    } catch {
        return "media";
    }
}
