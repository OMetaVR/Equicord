/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type Branch = "stable" | "dev";

export function getReleaseUrl(apiBase: string, branch: Branch): string {
    switch (branch) {
        case "dev":
            return `${apiBase}/releases/tags/dev`;
        default:
            return `${apiBase}/releases/latest`;
    }
}

export function getTagUrl(apiBase: string, branch: Branch): string {
    switch (branch) {
        case "dev":
            return `${apiBase}/git/refs/tags/dev`;
        default:
            return `${apiBase}/git/refs/tags/latest`;
    }
}
