/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Settings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { SpotifyPlayer as Player } from "equicordplugins/musicControls/spotify/PlayerComponent";

import { migrateOldLyrics } from "./api";
import { Lyrics } from "./components/lyrics";
import settings from "./settings";


export default definePlugin({
    name: "SpotifyLyrics",
    authors: [Devs.Joona],
    description: "Adds lyrics to SpotifyControls",
    dependencies: ["MusicControls"],
    patches: [
        {
            find: "this.isCopiedStreakGodlike",
            replacement: {
                match: /Vencord\.Plugins\.plugins\["MusicControls"]\.PanelWrapper/,
                replace: "$self.FakePanelWrapper",
            },
            predicate: () => Settings.plugins.MusicControls.enabled,
        },
    ],
    FakePanelWrapper({ VencordOriginal, ...props }) {
        const { LyricsPosition } = settings.use(["LyricsPosition"]);
        return (
            <>
                <ErrorBoundary
                    fallback={() => (
                        <div className="vc-spotify-fallback">
                            <p>Failed to render Spotify Lyrics Modal :(</p>
                            <p>Check the console for errors</p>
                        </div>
                    )}
                >
                    {LyricsPosition === "above" && <Lyrics />}
                    <Player />
                    {LyricsPosition === "below" && <Lyrics />}
                </ErrorBoundary>

                <VencordOriginal {...props} />
            </>
        );
    },
    settings,
    async start() {
        await migrateOldLyrics();
    },
});
