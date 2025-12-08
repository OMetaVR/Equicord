/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface PaginationResult<T> {
    items: T[];
    currentPage: number;
    totalPages: number;
    totalItems: number;
    hasPrevious: boolean;
    hasNext: boolean;
}

export function getPaginatedItems<T>(
    items: T[],
    page: number,
    pageSize: number
): PaginationResult<T> {
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    const currentPage = Math.max(1, Math.min(page, totalPages || 1));

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);

    const paginatedItems = items.slice(startIndex, endIndex);

    return {
        items: paginatedItems,
        currentPage,
        totalPages: totalPages || 1,
        totalItems,
        hasPrevious: currentPage > 1,
        hasNext: currentPage < totalPages
    };
}

export function calculateTotalPages(itemCount: number, pageSize: number): number {
    if (itemCount === 0 || pageSize <= 0) {
        return 1;
    }
    return Math.ceil(itemCount / pageSize);
}

export function getPageIndices(
    page: number,
    pageSize: number,
    totalItems: number
): { startIndex: number; endIndex: number } {
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);

    return { startIndex, endIndex };
}

export function isValidPage(page: number, itemCount: number, pageSize: number): boolean {
    if (page < 1) return false;
    const totalPages = calculateTotalPages(itemCount, pageSize);
    return page <= totalPages;
}
