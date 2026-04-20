/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./DetectionsModal.css";

import { Button } from "@components/Button";
import { copyWithToast } from "@utils/discord";
import { classNameFactory } from "@utils/css";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot } from "@utils/modal";
import { React, useEffect, useMemo, useState } from "@webpack/common";

import { DetectionRecord, DetectionVerdict } from "./db";

const cl = classNameFactory("vc-nsfw-invite-detections-");

interface DetectionsModalProps {
    rootProps: any;
    initialRecords: DetectionRecord[];
    isTeachingRecord(record: DetectionRecord): boolean;
    onDeleteRecord(authorId: string): Promise<void>;
}

function sortRecords(records: DetectionRecord[]) {
    const verdictRank: Record<DetectionVerdict, number> = {
        confirmed: 3,
        suspicious: 2,
        candidate: 1
    };

    return [...records].sort((left, right) =>
        verdictRank[right.verdict] - verdictRank[left.verdict] ||
        right.highestScore - left.highestScore ||
        right.lastSeen.localeCompare(left.lastSeen)
    );
}

function formatDisplayName(record: DetectionRecord) {
    return record.globalNames[record.globalNames.length - 1]
        || record.usernames[record.usernames.length - 1]
        || record.authorId;
}

export function DetectionsModal({
    rootProps,
    initialRecords,
    isTeachingRecord,
    onDeleteRecord
}: DetectionsModalProps) {
    const [records, setRecords] = useState(() => sortRecords(initialRecords));
    const [selectedAuthorId, setSelectedAuthorId] = useState(() => initialRecords[0]?.authorId ?? "");
    const [busyAuthorId, setBusyAuthorId] = useState<string | null>(null);

    useEffect(() => {
        if (!records.some(record => record.authorId === selectedAuthorId)) {
            setSelectedAuthorId(records[0]?.authorId ?? "");
        }
    }, [records, selectedAuthorId]);

    const selectedRecord = useMemo(
        () => records.find(record => record.authorId === selectedAuthorId) ?? null,
        [records, selectedAuthorId]
    );

    async function removeRecord(authorId: string) {
        setBusyAuthorId(authorId);
        try {
            await onDeleteRecord(authorId);
            setRecords(current => current.filter(record => record.authorId !== authorId));
        } finally {
            setBusyAuthorId(current => current === authorId ? null : current);
        }
    }

    return (
        <ModalRoot className={cl("modal")} size="large" {...rootProps}>
            <ModalHeader>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", width: "100%" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0, color: "var(--text-default)" }}>
                        <strong>Stored Invite Spam Detections</strong>
                        <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                            Review stored accounts, inspect message samples, and remove bad data from the pool.
                        </div>
                    </div>
                    <ModalCloseButton onClick={rootProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent className={cl("modal-content")}>
                <div className={cl("toolbar")}>
                    <div className={cl("toolbar-note")}>
                        {records.length} stored records. {records.filter(record => record.verdict === "confirmed").length} confirmed.
                    </div>
                </div>

                <div className={cl("layout")}>
                    <div className={cl("list")}>
                        <div className={cl("list-scroll")}>
                            {records.map(record => (
                                <button
                                    key={record.authorId}
                                    type="button"
                                    className={cl("row")}
                                    data-selected={record.authorId === selectedAuthorId}
                                    onClick={() => setSelectedAuthorId(record.authorId)}
                                >
                                    <div className={cl("row-title")}>
                                        <div className={cl("row-name")}>{formatDisplayName(record)}</div>
                                        <div className={cl("row-verdict")}>{record.verdict}</div>
                                    </div>
                                    <div className={cl("row-meta")}>
                                        <span>High {record.highestScore}</span>
                                        <span>Detections {record.detectionCount}</span>
                                        <span>{isTeachingRecord(record) ? "Teaching" : "Not teaching"}</span>
                                    </div>
                                    <div className={cl("row-id")}>{record.authorId}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={cl("detail")}>
                        {!selectedRecord && (
                            <div className={cl("detail-empty")}>
                                No stored detections remain.
                            </div>
                        )}

                        {selectedRecord && (
                            <>
                                <div className={cl("header")}>
                                    <div>
                                        <div className={cl("name")}>{formatDisplayName(selectedRecord)}</div>
                                        <div className={cl("subtitle")}>{selectedRecord.authorId}</div>
                                        <div className={cl("subtitle")}>
                                            Usernames: {selectedRecord.usernames.join(", ") || "None"} | Global names: {selectedRecord.globalNames.join(", ") || "None"}
                                        </div>
                                    </div>

                                    <div className={cl("actions")}>
                                        <Button
                                            size="small"
                                            variant="secondary"
                                            onClick={() => copyWithToast(selectedRecord.authorId, "User ID copied.")}
                                        >
                                            Copy User ID
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="dangerSecondary"
                                            disabled={busyAuthorId === selectedRecord.authorId}
                                            onClick={() => removeRecord(selectedRecord.authorId)}
                                        >
                                            Remove Record
                                        </Button>
                                    </div>
                                </div>

                                <div className={cl("summary")}>
                                    <div className={cl("stat")}>
                                        <div className={cl("stat-label")}>Verdict</div>
                                        <div className={cl("stat-value")}>{selectedRecord.verdict}</div>
                                    </div>
                                    <div className={cl("stat")}>
                                        <div className={cl("stat-label")}>Teaching</div>
                                        <div className={cl("stat-value")}>{isTeachingRecord(selectedRecord) ? "Yes" : "No"}</div>
                                    </div>
                                    <div className={cl("stat")}>
                                        <div className={cl("stat-label")}>Highest score</div>
                                        <div className={cl("stat-value")}>{selectedRecord.highestScore}</div>
                                    </div>
                                    <div className={cl("stat")}>
                                        <div className={cl("stat-label")}>Total score</div>
                                        <div className={cl("stat-value")}>{selectedRecord.totalScore}</div>
                                    </div>
                                    <div className={cl("stat")}>
                                        <div className={cl("stat-label")}>Detections</div>
                                        <div className={cl("stat-value")}>{selectedRecord.detectionCount}</div>
                                    </div>
                                    <div className={cl("stat")}>
                                        <div className={cl("stat-label")}>Contexts</div>
                                        <div className={cl("stat-value")}>
                                            {selectedRecord.distinctGuildIds.length} guilds, {selectedRecord.distinctChannelIds.length} channels
                                        </div>
                                    </div>
                                    <div className={cl("stat")}>
                                        <div className={cl("stat-label")}>First seen</div>
                                        <div className={cl("stat-value")}>{new Date(selectedRecord.firstSeen).toLocaleString()}</div>
                                    </div>
                                    <div className={cl("stat")}>
                                        <div className={cl("stat-label")}>Last seen</div>
                                        <div className={cl("stat-value")}>{new Date(selectedRecord.lastSeen).toLocaleString()}</div>
                                    </div>
                                </div>

                                <div className={cl("section")}>
                                    <div className={cl("section-title")}>What this user did</div>
                                    <div className={cl("sample-list")}>
                                        {selectedRecord.sampleMessages.map(sample => (
                                            <div key={sample.messageId} className={cl("sample")}>
                                                <div className={cl("sample-meta")}>
                                                    <span>{new Date(sample.timestamp).toLocaleString()}</span>
                                                    {sample.guildName && <span>Guild: {sample.guildName}</span>}
                                                    {sample.channelName && <span>Channel: {sample.channelName}</span>}
                                                    <span>Score: {sample.score}</span>
                                                    {typeof sample.baseScore === "number" && <span>Base: {sample.baseScore}</span>}
                                                </div>

                                                <div className={cl("sample-snippet")}>
                                                    {sample.contentSnippet || "No stored snippet."}
                                                </div>

                                                <div className={cl("inline-list")}>
                                                    Invite codes: {sample.inviteCodes.join(", ") || "None"}
                                                </div>

                                                {!!sample.inviteTargetHints?.length && (
                                                    <div className={cl("inline-list")}>
                                                        Invite target hints: {sample.inviteTargetHints.join(", ")}
                                                    </div>
                                                )}

                                                <div className={cl("inline-list")}>
                                                    Signals: {(sample.matchedSignals ?? []).join(", ") || "None"}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </ModalContent>

        </ModalRoot>
    );
}
