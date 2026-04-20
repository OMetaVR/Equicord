/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { DeleteIcon, DownArrow, RightArrow } from "@components/Icons";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot } from "@utils/modal";
import { React, useMemo, useState } from "@webpack/common";

import { DetectionRecord, DetectionReviewState, DetectionVerdict } from "./db";

interface ReviewModalProps {
    rootProps: any;
    initialRecords: DetectionRecord[];
    isTeachingRecord(record: DetectionRecord): boolean;
    onDeleteRecord(authorId: string): Promise<void>;
    onSetReviewState(authorId: string, reviewState: DetectionReviewState): Promise<DetectionRecord | null>;
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

function reviewLabel(reviewState?: DetectionReviewState) {
    switch (reviewState) {
        case "boosted": return "Boosted";
        case "suppressed": return "Suppressed";
        default: return "Neutral";
    }
}

function teachingColor(isTeaching: boolean) {
    return isTeaching ? "var(--status-positive)" : "var(--text-muted)";
}

export function ReviewModal({
    rootProps,
    initialRecords,
    isTeachingRecord,
    onDeleteRecord,
    onSetReviewState
}: ReviewModalProps) {
    const [records, setRecords] = useState(() => sortRecords(initialRecords));
    const [showOnlyTeaching, setShowOnlyTeaching] = useState(false);
    const [busyAuthorId, setBusyAuthorId] = useState<string | null>(null);

    const visibleRecords = useMemo(
        () => records.filter(record => !showOnlyTeaching || isTeachingRecord(record)),
        [records, showOnlyTeaching, isTeachingRecord]
    );

    const teachingCount = useMemo(
        () => records.filter(record => isTeachingRecord(record)).length,
        [records, isTeachingRecord]
    );

    async function applyReview(authorId: string, reviewState: DetectionReviewState) {
        setBusyAuthorId(authorId);
        try {
            const updated = await onSetReviewState(authorId, reviewState);
            if (!updated) return;

            setRecords(current => sortRecords(current.map(record =>
                record.authorId === authorId ? updated : record
            )));
        } finally {
            setBusyAuthorId(current => current === authorId ? null : current);
        }
    }

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
        <ModalRoot {...rootProps} size="large">
            <ModalHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", color: "var(--text-default)" }}>
                    <strong>NSFW Invite Spam Training Review</strong>
                    <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                        {teachingCount} of {records.length} stored records are currently teaching the model.
                    </div>
                </div>
            </ModalHeader>

            <ModalContent>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", color: "var(--text-default)" }}>
                    <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                        Boosted records always teach. Suppressed records never teach.
                    </div>
                    <Button
                        size="small"
                        variant={showOnlyTeaching ? "primary" : "secondary"}
                        onClick={() => setShowOnlyTeaching(value => !value)}
                    >
                        {showOnlyTeaching ? "Show All" : "Show Teaching Only"}
                    </Button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {visibleRecords.length === 0 && (
                        <div style={{
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "10px",
                            padding: "16px",
                            color: "var(--text-muted)"
                        }}>
                            No records match the current filter.
                        </div>
                    )}

                    {visibleRecords.map(record => {
                        const latestSample = record.sampleMessages[0];
                        const isTeaching = isTeachingRecord(record);
                        const isBusy = busyAuthorId === record.authorId;
                        const displayName = record.globalNames[record.globalNames.length - 1]
                            || record.usernames[record.usernames.length - 1]
                            || record.authorId;

                        return (
                            <div
                                key={record.authorId}
                                style={{
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "10px",
                                    padding: "14px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "10px",
                                    color: "var(--text-default)"
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{displayName}</div>
                                        <div style={{ color: "var(--text-muted)", fontSize: "13px", overflowWrap: "anywhere" }}>
                                            {record.authorId}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        <div style={{ fontSize: "13px" }}>Verdict: {record.verdict}</div>
                                        <div style={{ fontSize: "13px" }}>High: {record.highestScore}</div>
                                        <div style={{ fontSize: "13px", color: teachingColor(isTeaching) }}>
                                            {isTeaching ? "Teaching" : "Not teaching"}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", color: "var(--text-muted)", fontSize: "13px" }}>
                                    <span>Review: {reviewLabel(record.reviewState)}</span>
                                    <span>Detections: {record.detectionCount}</span>
                                    <span>Last seen: {new Date(record.lastSeen).toLocaleString()}</span>
                                    {latestSample?.channelName && <span>Channel: {latestSample.channelName}</span>}
                                    {latestSample?.guildName && <span>Guild: {latestSample.guildName}</span>}
                                </div>

                                {latestSample && (
                                    <>
                                        <div style={{ fontSize: "13px", lineHeight: 1.45, overflowWrap: "anywhere", color: "var(--text-default)" }}>
                                            {latestSample.contentSnippet || "No stored snippet."}
                                        </div>
                                        <div style={{ color: "var(--text-muted)", fontSize: "12px", overflowWrap: "anywhere" }}>
                                            Signals: {(latestSample.matchedSignals ?? []).join(", ") || "None"}
                                        </div>
                                    </>
                                )}

                                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                    <Button
                                        size="small"
                                        variant={record.reviewState === "boosted" ? "positive" : "secondary"}
                                        disabled={isBusy}
                                        onClick={() => applyReview(record.authorId, record.reviewState === "boosted" ? "neutral" : "boosted")}
                                        title="Boost this record's teaching weight"
                                    >
                                        <RightArrow width={14} height={14} style={{ transform: "rotate(-90deg)" }} />
                                        <span style={{ marginLeft: "6px" }}>Teach</span>
                                    </Button>

                                    <Button
                                        size="small"
                                        variant={record.reviewState === "suppressed" ? "dangerSecondary" : "secondary"}
                                        disabled={isBusy}
                                        onClick={() => applyReview(record.authorId, record.reviewState === "suppressed" ? "neutral" : "suppressed")}
                                        title="Stop this record from teaching the model"
                                    >
                                        <DownArrow width={14} height={14} />
                                        <span style={{ marginLeft: "6px" }}>Suppress</span>
                                    </Button>

                                    <Button
                                        size="small"
                                        variant="dangerSecondary"
                                        disabled={isBusy}
                                        onClick={() => removeRecord(record.authorId)}
                                        title="Delete this stored record"
                                    >
                                        <DeleteIcon width={14} height={14} />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </ModalContent>

            <ModalFooter>
                <Button variant="secondary" onClick={rootProps.onClose}>Close</Button>
            </ModalFooter>
        </ModalRoot>
    );
}
