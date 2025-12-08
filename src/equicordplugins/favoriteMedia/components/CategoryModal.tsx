/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { Button, ColorPicker, React, TextInput } from "@webpack/common";

import { CategoryModalProps } from "../types";

const MAX_CATEGORY_NAME_LENGTH = 20;

const DEFAULT_COLORS = [
    "#FF5733", "#33FF57", "#3357FF", "#FF33F5", "#F5FF33",
    "#33FFF5", "#FF8C33", "#8C33FF", "#33FF8C", "#FF3333"
];

export function CategoryModal({ category, parentId, onSave, onClose, transitionState }: CategoryModalProps & ModalProps) {
    const isEditing = !!category;

    const [name, setName] = React.useState(category?.name || "");
    const [color, setColor] = React.useState(category?.color || DEFAULT_COLORS[0]);
    const [error, setError] = React.useState<string | null>(null);

    const validateName = React.useCallback((value: string): boolean => {
        if (value.trim().length === 0) {
            setError("Category name cannot be empty");
            return false;
        }

        if (value.length > MAX_CATEGORY_NAME_LENGTH) {
            setError(`Category name must be ${MAX_CATEGORY_NAME_LENGTH} characters or less`);
            return false;
        }

        setError(null);
        return true;
    }, []);

    const handleNameChange = React.useCallback((value: string) => {
        setName(value);
        validateName(value);
    }, [validateName]);

    const handleColorChange = React.useCallback((value: number) => {
        const hexColor = `#${value.toString(16).padStart(6, "0")}`;
        setColor(hexColor);
    }, []);

    const handleSave = React.useCallback(() => {
        if (!validateName(name)) {
            return;
        }

        onSave(name.trim(), color);
        onClose();
    }, [name, color, validateName, onSave, onClose]);

    const handleKeyPress = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSave();
        } else if (e.key === "Escape") {
            onClose();
        }
    }, [handleSave, onClose]);

    return (
        <ModalRoot size={ModalSize.SMALL} transitionState={transitionState}>
            <ModalHeader>
                <div className="fm-modal-header">
                    {isEditing ? "Edit Category" : "Create Category"}
                </div>
                <ModalCloseButton onClick={onClose} />
            </ModalHeader>

            <ModalContent className="fm-modal-content">
                <div className="fm-modal-field">
                    <label className="fm-modal-label">
                        Category Name
                    </label>
                    <TextInput
                        placeholder="Enter category name..."
                        value={name}
                        onChange={handleNameChange}
                        onKeyDown={handleKeyPress}
                        maxLength={MAX_CATEGORY_NAME_LENGTH}
                        autoFocus
                    />
                    <div className="fm-modal-hint">
                        {name.length}/{MAX_CATEGORY_NAME_LENGTH} characters
                    </div>
                    {error && (
                        <div className="fm-modal-error">
                            {error}
                        </div>
                    )}
                </div>

                <div className="fm-modal-field">
                    <label className="fm-modal-label">
                        Category Color
                    </label>
                    <ColorPicker
                        color={parseInt(color.replace("#", ""), 16)}
                        onChange={handleColorChange}
                    />
                    <div className="fm-color-preview" style={{ backgroundColor: color }}>
                        Preview
                    </div>
                </div>

                {parentId && (
                    <div className="fm-modal-info">
                        Creating subcategory
                    </div>
                )}
            </ModalContent>

            <ModalFooter>
                <Button
                    onClick={handleSave}
                    disabled={!!error || name.trim().length === 0}
                >
                    {isEditing ? "Save" : "Create"}
                </Button>
                <Button
                    onClick={onClose}
                    color={Button.Colors.TRANSPARENT}
                >
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}
