/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { ipcMain } from "electron";
import { existsSync, statSync } from "fs";
import { renameSync, writeFileSync } from "original-fs";
import { join } from "path";

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

import { ASAR_FILE, serializeErrors } from "./common";

const API_BASE = `https://api.github.com/repos/${gitRemote}`;

function getAsarPath() {
    if (__dirname.endsWith(".asar")) return __dirname;
    const asarPath = join(__dirname, "..", ASAR_FILE);
    if (existsSync(asarPath) && statSync(asarPath).isFile()) return asarPath;
    return join(__dirname, ASAR_FILE);
}

let PendingUpdate: { url: string; hash: string; } | null = null;

async function githubGet<T = any>(endpoint: string) {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": VENCORD_USER_AGENT
        }
    });
}

async function calculateGitChanges() {
    const isOutdated = await fetchUpdates();
    if (!isOutdated || !PendingUpdate) return [];

    const data = await githubGet(`/compare/${gitHash}...${PendingUpdate.hash}`);

    return data.commits.map((c: any) => ({
        hash: c.sha,
        author: c.author?.login ?? c.commit?.author?.name ?? "Unknown Author",
        message: c.commit.message.split("\n")[0]
    }));
}

async function fetchUpdates() {
    PendingUpdate = null;
    const releaseData = await githubGet("/releases/latest");
    const tagData = await githubGet(`/git/refs/tags/${releaseData.tag_name}`);

    const releaseHash = tagData.object.sha;
    if (releaseHash === gitHash)
        return false;

    const comparison = await githubGet(`/compare/${gitHash}...${releaseHash}`);
    if (comparison.status !== "ahead") return false;

    const asset = releaseData.assets.find((a: any) => a.name === ASAR_FILE);
    if (!asset) return false;

    PendingUpdate = { url: asset.browser_download_url, hash: releaseHash };
    return true;
}

async function applyUpdates() {
    if (!PendingUpdate) return true;

    const asarPath = getAsarPath();
    const data = await fetchBuffer(PendingUpdate.url);
    const temporaryPath = `${asarPath}.tmp`;
    writeFileSync(temporaryPath, data, { flush: true });
    renameSync(temporaryPath, asarPath);

    PendingUpdate = null;
    return true;
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => `https://github.com/${gitRemote}`));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(calculateGitChanges));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(applyUpdates));
