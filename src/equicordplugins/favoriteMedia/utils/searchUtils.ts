/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Category, Media } from "../types";

function normalizeSearchString(str: string): string {
    return str.toLowerCase().replace(/[_-]/g, " ");
}

export function filterByName<T extends { name: string }>(
    items: T[],
    filter: string
): T[] {
    if (!filter || filter.trim() === "") {
        return items;
    }

    const normalizedFilter = normalizeSearchString(filter.trim());
    const filterWords = normalizedFilter.split(/\s+/).filter(word => word.length > 0);

    if (filterWords.length === 0) {
        return items;
    }

    return items.filter(item => {
        const normalizedName = normalizeSearchString(item.name);
        return filterWords.every(word => normalizedName.includes(word));
    });
}

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;

    return function debounced(...args: Parameters<T>) {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            func(...args);
            timeoutId = null;
        }, delay);
    };
}

export function createDebouncedSearch(
    onSearch: (filter: string) => void,
    delay: number = 150
): (filter: string) => void {
    return debounce(onSearch, delay);
}

export function filterMediaAndCategories(
    medias: Media[],
    categories: Category[],
    filter: string
): { medias: Media[]; categories: Category[] } {
    return {
        medias: filterByName(medias, filter),
        categories: filterByName(categories, filter)
    };
}
