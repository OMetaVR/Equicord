/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { Button, FluxDispatcher, React, TextInput, Toasts } from "@webpack/common";

import { Category, Media, MediaType } from "../types";
import { createCategory, editCategory } from "../utils/categoryManager";
import { getMediaData, saveMediaData } from "../utils/mediaManager";

interface CollectionModalProps extends ModalProps {
    type: MediaType;
    collection?: Category;
    mediaToAdd?: Media;
}

export function CollectionModal({ type, collection, mediaToAdd, onClose, transitionState }: CollectionModalProps) {
    const [name, setName] = React.useState(collection?.name ?? "");
    const [color, setColor] = React.useState(collection?.color ?? "#5865F2");
    const [error, setError] = React.useState<string | null>(null);

    const isEditing = !!collection;

    const handleSave = React.useCallback(async () => {
        if (!name.trim()) {
            setError("Collection name is required");
            return;
        }

        if (name.length > 20) {
            setError("Collection name must be 20 characters or less");
            return;
        }

        try {
            if (isEditing) {
                const success = await editCategory(type, collection!.id, name.trim(), color);
                if (!success) {
                    setError("A collection with this name already exists");
                    return;
                }
            } else {
                const success = await createCategory(type, name.trim(), color);
                if (!success) {
                    setError("A collection with this name already exists");
                    return;
                }

                if (mediaToAdd) {
                    const data = await getMediaData(type);
                    const newCollection = data.categories.find(c => c.name === name.trim());
                    if (newCollection) {
                        const mediaIndex = data.medias.findIndex(m => m.url === mediaToAdd.url);
                        if (mediaIndex !== -1) {
                            data.medias[mediaIndex].category_id = newCollection.id;
                            await saveMediaData(type, data);
                        }
                    }
                }
            }

            FluxDispatcher.dispatch({ type: "FM_MEDIA_UPDATED" });
            Toasts.show({
                message: isEditing ? "Collection updated" : "Collection created",
                type: Toasts.Type.SUCCESS,
                id: Toasts.genId()
            });
            onClose();
        } catch (err) {
            setError("Failed to save collection");
        }
    }, [name, color, type, collection, mediaToAdd, isEditing, onClose]);

    return (
        <ModalRoot size={ModalSize.SMALL} transitionState={transitionState}>
            <ModalHeader>
                <span className="fm-modal-title">
                    {isEditing ? "Edit Collection" : "Create Collection"}
                </span>
            </ModalHeader>
            <ModalContent>
                <div className="fm-modal-content">
                    <div className="fm-modal-row">
                        <div className="fm-modal-input-wrapper">
                            <TextInput
                                value={name}
                                onChange={setName}
                                placeholder="Collection name"
                                maxLength={20}
                            />
                        </div>
                        <input
                            type="color"
                            className="fm-color-circle"
                            value={color}
                            onChange={e => setColor(e.target.value)}
                            title="Collection color"
                        />
                    </div>
                    {error && <div className="fm-modal-error">{error}</div>}
                </div>
            </ModalContent>
            <ModalFooter className="fm-modal-footer">
                <Button onClick={handleSave} color={Button.Colors.BRAND}>
                    {isEditing ? "Save" : "Create"}
                </Button>
                <Button onClick={onClose} look={Button.Looks.LINK} className="fm-cancel-btn">
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}
