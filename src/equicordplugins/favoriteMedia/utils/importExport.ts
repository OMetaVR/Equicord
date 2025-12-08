/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Toasts } from "@webpack/common";

import { ExportData, MEDIA_TYPES, MediaType, StoredMediaData } from "../types";
import { checkSameUrl, getMediaData, saveMediaData } from "./mediaManager";

const CURRENT_VERSION = "1.0.0";

export async function exportData(): Promise<void> {
    try {
        const exportData: ExportData = {
            version: CURRENT_VERSION,
            gif: await getMediaData("gif"),
            image: await getMediaData("image"),
            video: await getMediaData("video"),
            audio: await getMediaData("audio"),
            file: await getMediaData("file")
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const fileName = `FavoriteMedia_${new Date().toISOString().split("T")[0]}.json`;

        if (IS_WEB || IS_EQUIBOP || IS_VESKTOP) {
            const file = new File([jsonString], fileName, { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(file);
            a.download = fileName;

            document.body.appendChild(a);
            a.click();
            setImmediate(() => {
                URL.revokeObjectURL(a.href);
                document.body.removeChild(a);
            });
        } else {
            const data = new TextEncoder().encode(jsonString);
            await DiscordNative.fileManager.saveWithDialog(data, fileName);
        }

        Toasts.show({
            message: "Successfully exported favorites",
            type: Toasts.Type.SUCCESS,
            id: Toasts.genId(),
            options: {
                duration: 3000,
                position: Toasts.Position.BOTTOM
            }
        });
    } catch (error) {
        console.error("Failed to export favorites:", error);
        Toasts.show({
            message: `Failed to export favorites: ${error}`,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: {
                duration: 5000,
                position: Toasts.Position.BOTTOM
            }
        });
    }
}

function validateImportData(data: any): data is ExportData {
    if (!data || typeof data !== "object") {
        return false;
    }

    if (!data.version || typeof data.version !== "string") {
        return false;
    }

    for (const type of MEDIA_TYPES) {
        const typeData = data[type];
        if (!typeData || typeof typeData !== "object") {
            return false;
        }

        if (!Array.isArray(typeData.medias)) {
            return false;
        }

        if (!Array.isArray(typeData.categories)) {
            return false;
        }

        for (const media of typeData.medias) {
            if (!media.url || typeof media.url !== "string") {
                return false;
            }
            if (!media.name || typeof media.name !== "string") {
                return false;
            }
        }

        for (const category of typeData.categories) {
            if (typeof category.id !== "number") {
                return false;
            }
            if (!category.name || typeof category.name !== "string") {
                return false;
            }
            if (!category.color || typeof category.color !== "string") {
                return false;
            }
        }
    }

    return true;
}

function mergeMediaData(existing: StoredMediaData, imported: StoredMediaData): {
    merged: StoredMediaData;
    newMediaCount: number;
    newCategoryCount: number;
    skippedMediaCount: number;
} {
    let newMediaCount = 0;
    let skippedMediaCount = 0;

    const mergedMedias = [...existing.medias];
    for (const media of imported.medias) {
        const isDuplicate = existing.medias.some(m => checkSameUrl(m.url, media.url));
        if (isDuplicate) {
            skippedMediaCount++;
        } else {
            mergedMedias.push(media);
            newMediaCount++;
        }
    }

    const mergedCategories = [...existing.categories];
    let newCategoryCount = 0;

    for (const category of imported.categories) {
        const isDuplicate = existing.categories.some(c => c.name === category.name);
        if (!isDuplicate) {
            mergedCategories.push(category);
            newCategoryCount++;
        }
    }

    return {
        merged: {
            medias: mergedMedias,
            categories: mergedCategories
        },
        newMediaCount,
        newCategoryCount,
        skippedMediaCount
    };
}

async function processImport(jsonString: string): Promise<void> {
    try {
        const data = JSON.parse(jsonString);

        if (!validateImportData(data)) {
            throw new Error("Invalid import file structure");
        }

        let totalNewMedia = 0;
        let totalNewCategories = 0;
        let totalSkippedMedia = 0;

        for (const type of MEDIA_TYPES) {
            const existing = await getMediaData(type);
            const imported = data[type];

            const { merged, newMediaCount, newCategoryCount, skippedMediaCount } = mergeMediaData(existing, imported);

            await saveMediaData(type, merged);

            totalNewMedia += newMediaCount;
            totalNewCategories += newCategoryCount;
            totalSkippedMedia += skippedMediaCount;
        }

        const message = `Successfully imported ${totalNewMedia} media and ${totalNewCategories} categories` +
            (totalSkippedMedia > 0 ? ` (skipped ${totalSkippedMedia} duplicates)` : "");

        Toasts.show({
            message,
            type: Toasts.Type.SUCCESS,
            id: Toasts.genId(),
            options: {
                duration: 5000,
                position: Toasts.Position.BOTTOM
            }
        });
    } catch (error) {
        console.error("Failed to import favorites:", error);
        Toasts.show({
            message: `Failed to import favorites: ${error}`,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: {
                duration: 5000,
                position: Toasts.Position.BOTTOM
            }
        });
    }
}

export async function importData(): Promise<void> {
    try {
        if (IS_WEB || IS_EQUIBOP || IS_VESKTOP) {
            const input = document.createElement("input");
            input.type = "file";
            input.style.display = "none";
            input.accept = "application/json";
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async () => {
                    const data = reader.result as string;
                    await processImport(data);
                };

                reader.readAsText(file);
            };

            document.body.appendChild(input);
            input.click();
            setImmediate(() => {
                document.body.removeChild(input);
            });
        } else {
            const [file] = await DiscordNative.fileManager.openFiles({
                filters: [
                    { name: "FavoriteMedia", extensions: ["json"] },
                    { name: "All Files", extensions: ["*"] }
                ]
            });

            if (file) {
                const jsonString = new TextDecoder().decode(file.data);
                await processImport(jsonString);
            }
        }
    } catch (error) {
        console.error("Failed to open import dialog:", error);
        Toasts.show({
            message: `Failed to open import dialog: ${error}`,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: {
                duration: 5000,
                position: Toasts.Position.BOTTOM
            }
        });
    }
}
