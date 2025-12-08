/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Category, MediaType } from "../types";
import { getMediaData, saveMediaData } from "./mediaManager";

const MAX_CATEGORY_NAME_LENGTH = 20;

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

function validateCategoryName(name: string): boolean {
    return name.length > 0 && name.length <= MAX_CATEGORY_NAME_LENGTH;
}

function validateCategoryColor(color: string): boolean {
    return HEX_COLOR_REGEX.test(color);
}

async function categoryNameExists(type: MediaType, name: string, excludeId?: number): Promise<boolean> {
    const data = await getMediaData(type);
    return data.categories.some(c => c.name === name && c.id !== excludeId);
}

export function getNewCategoryId(categories: Category[]): number {
    if (categories.length === 0) {
        return 1;
    }

    const maxId = Math.max(...categories.map(c => c.id));
    return maxId + 1;
}

export async function createCategory(
    type: MediaType,
    name: string,
    color: string,
    parentId?: number
): Promise<boolean> {
    if (!validateCategoryName(name)) {
        return false;
    }

    if (!validateCategoryColor(color)) {
        return false;
    }

    if (await categoryNameExists(type, name)) {
        return false;
    }

    const data = await getMediaData(type);

    const newCategory: Category = {
        id: getNewCategoryId(data.categories),
        name,
        color,
        category_id: parentId
    };

    data.categories.push(newCategory);

    await saveMediaData(type, data);

    return true;
}

export async function editCategory(
    type: MediaType,
    id: number,
    name: string,
    color: string
): Promise<boolean> {
    if (!validateCategoryName(name)) {
        return false;
    }

    if (!validateCategoryColor(color)) {
        return false;
    }

    if (await categoryNameExists(type, name, id)) {
        return false;
    }

    const data = await getMediaData(type);

    const category = data.categories.find(c => c.id === id);
    if (!category) {
        return false;
    }

    category.name = name;
    category.color = color;

    await saveMediaData(type, data);

    return true;
}

export async function deleteCategory(type: MediaType, id: number): Promise<boolean> {
    const data = await getMediaData(type);

    const categoryIndex = data.categories.findIndex(c => c.id === id);
    if (categoryIndex === -1) {
        return false;
    }

    const descendantIds = getDescendantCategoryIds(data.categories, id);
    const allIdsToDelete = [id, ...descendantIds];

    data.categories = data.categories.filter(c => !allIdsToDelete.includes(c.id));

    data.medias.forEach(media => {
        if (media.category_id && allIdsToDelete.includes(media.category_id)) {
            delete media.category_id;
        }
    });

    await saveMediaData(type, data);

    return true;
}

function getDescendantCategoryIds(categories: Category[], parentId: number): number[] {
    const descendants: number[] = [];

    const children = categories.filter(c => c.category_id === parentId);

    for (const child of children) {
        descendants.push(child.id);
        descendants.push(...getDescendantCategoryIds(categories, child.id));
    }

    return descendants;
}

export async function moveCategory(type: MediaType, id: number, direction: -1 | 1): Promise<void> {
    const data = await getMediaData(type);

    const currentIndex = data.categories.findIndex(c => c.id === id);
    if (currentIndex === -1) {
        return;
    }

    const newIndex = currentIndex + direction;

    if (newIndex < 0 || newIndex >= data.categories.length) {
        return;
    }

    const temp = data.categories[currentIndex];
    data.categories[currentIndex] = data.categories[newIndex];
    data.categories[newIndex] = temp;

    await saveMediaData(type, data);
}

export async function categoryHasSubcategories(type: MediaType, categoryId: number): Promise<boolean> {
    const data = await getMediaData(type);
    return data.categories.some(c => c.category_id === categoryId);
}
