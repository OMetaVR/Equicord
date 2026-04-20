/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DBSchema, IDBPDatabase, openDB } from "idb";

export type DetectionVerdict = "candidate" | "suspicious" | "confirmed";
export type DetectionReviewState = "neutral" | "boosted" | "suppressed";

export interface DetectionSample {
    messageId: string;
    channelId: string;
    guildId?: string;
    guildName?: string;
    channelName?: string;
    contentSnippet: string;
    inviteCodes: string[];
    inviteTargetHints?: string[];
    matchedSignals: string[];
    baseScore?: number;
    score: number;
    templateKey?: string;
    timestamp: string;
}

export interface DetectionRecord {
    authorId: string;
    usernames: string[];
    globalNames: string[];
    firstSeen: string;
    lastSeen: string;
    accountCreatedAt: number;
    highestScore: number;
    totalScore: number;
    detectionCount: number;
    verdict: DetectionVerdict;
    distinctGuildIds: string[];
    distinctChannelIds: string[];
    reviewState?: DetectionReviewState;
    sampleMessages: DetectionSample[];
}

interface InviteSpamDetectionsDB extends DBSchema {
    detections: {
        key: string;
        value: DetectionRecord;
        indexes: {
            by_lastSeen: string;
            by_verdict: DetectionVerdict;
            by_highestScore: number;
        };
    };
}

const DB_NAME = "VencordWardenInviteSpamDetector";
const DB_VERSION = 1;

let db: IDBPDatabase<InviteSpamDetectionsDB> | null = null;
let dbPromise: Promise<IDBPDatabase<InviteSpamDetectionsDB>> | null = null;

async function ensureDb() {
    if (db) return db;
    if (!dbPromise) {
        dbPromise = openDB<InviteSpamDetectionsDB>(DB_NAME, DB_VERSION, {
            upgrade(database) {
                const detections = database.createObjectStore("detections", { keyPath: "authorId" });
                detections.createIndex("by_lastSeen", "lastSeen");
                detections.createIndex("by_verdict", "verdict");
                detections.createIndex("by_highestScore", "highestScore");
            }
        }).then(database => {
            db = database;
            return database;
        });
    }

    db = await dbPromise;
    return db;
}

export async function initDetectionsDb() {
    await ensureDb();
}

export async function getDetection(authorId: string) {
    return (await ensureDb()).get("detections", authorId);
}

export async function getAllDetections() {
    return (await ensureDb()).getAll("detections");
}

export async function putDetection(record: DetectionRecord) {
    await (await ensureDb()).put("detections", record);
}

export async function deleteDetection(authorId: string) {
    await (await ensureDb()).delete("detections", authorId);
}

export async function clearDetections() {
    await (await ensureDb()).clear("detections");
}
