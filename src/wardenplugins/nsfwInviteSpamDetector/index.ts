/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { copyWithToast } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import { Message } from "@vencord/discord-types";
import { MessageType } from "@vencord/discord-types/enums";
import { ChannelStore, GuildStore, React, RelationshipStore, SnowflakeUtils, Toasts, UserProfileStore, UserStore } from "@webpack/common";

import { DetectionsModal } from "./DetectionsModal";
import { ReviewModal } from "./ReviewModal";
import {
    clearDetections,
    deleteDetection,
    DetectionRecord,
    DetectionReviewState,
    DetectionSample,
    DetectionVerdict,
    getAllDetections as dbGetAllDetections,
    getDetection as dbGetDetection,
    initDetectionsDb,
    putDetection
} from "./db";

const logger = new Logger("NSFWInviteSpamDetector", "#f26c6c");

const DEFAULT_BAIT_PHRASES = [
    "wtf is this girl doing",
    "wtf this girl doing",
    "come check out my friend",
    "check out my friend",
    "she is spicy",
    "shes spicy",
    "she s spicy",
    "we are live on sexcam",
    "were live on sexcam",
    "crazy girls",
    "shy girls"
].join("\n");

const DEFAULT_SEXUALIZED_TERMS = [
    "18+",
    "nsfw",
    "sexcam",
    "spicy",
    "onlyfans",
    "egirl",
    "egirls",
    "lewd",
    "nudes",
    "horny"
].join("\n");

const DEFAULT_NEGATIVE_CONTEXT_TERMS = [
    "partnership",
    "affiliate",
    "affiliates",
    "partner request",
    "advertise",
    "advertisement",
    "promo"
].join("\n");

const DEFAULT_BIO_BAIT_PHRASES = [
    "check my bio",
    "check bio",
    "look at my bio",
    "look in my bio",
    "link in bio",
    "bio for spicy",
    "bio for pics",
    "look at my bio for spicy",
    "look at my bio for pics",
    "check my bio for spicy",
    "check my bio for pics"
].join("\n");

const DEFAULT_IGNORED_CHANNEL_PATTERNS = [
    "^ticket-\\d+$",
    "^closed-\\d+$"
].join("\n");

const WARDEN_SOURCE = "NSFWInviteSpamDetector";
const DEFAULT_SYNC_BASE_URL = "http://127.0.0.1:3000/internal/warden";
const DEFAULT_SYNC_DEBOUNCE_SECONDS = 8;
const DEFAULT_BACKGROUND_SYNC_MINUTES = 30;
const SYNC_BATCH_SIZE = 100;
const SYNC_REQUEST_TIMEOUT_MS = 15000;

const INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg)\/([a-z0-9-]+)/gi;
const STOPWORDS = new Set([
    "and",
    "are",
    "check",
    "com",
    "discord",
    "for",
    "friend",
    "gg",
    "https",
    "http",
    "join",
    "live",
    "out",
    "server",
    "the",
    "this",
    "with",
    "www"
]);

const settings = definePluginSettings({
    guildOnly: {
        type: OptionType.BOOLEAN,
        description: "Only scan guild messages. Recommended for this detector.",
        default: true
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Ignore actual bot accounts.",
        default: true
    },
    ignoreWebhooks: {
        type: OptionType.BOOLEAN,
        description: "Ignore webhook messages.",
        default: true
    },
    ignoreFriends: {
        type: OptionType.BOOLEAN,
        description: "Skip messages from friends to reduce false positives.",
        default: true
    },
    whitelistedIds: {
        type: OptionType.STRING,
        description: "Comma or newline separated user, channel, or guild ids to ignore.",
        default: ""
    },
    ignoredChannelNamePatterns: {
        type: OptionType.STRING,
        description: "Regex patterns for channel names to ignore before scoring.",
        default: DEFAULT_IGNORED_CHANNEL_PATTERNS
    },
    baitPhrases: {
        type: OptionType.STRING,
        description: "Bait phrases matched against message and embed text.",
        default: DEFAULT_BAIT_PHRASES
    },
    bioBaitPhrases: {
        type: OptionType.STRING,
        description: "Phrases that try to redirect users to the sender bio, for example check my bio or link in bio.",
        default: DEFAULT_BIO_BAIT_PHRASES
    },
    sexualizedTerms: {
        type: OptionType.STRING,
        description: "Sexualized terms matched against message and embed text.",
        default: DEFAULT_SEXUALIZED_TERMS
    },
    negativeContextTerms: {
        type: OptionType.STRING,
        description: "Terms that reduce confidence, for example partnership or affiliate traffic.",
        default: DEFAULT_NEGATIVE_CONTEXT_TERMS
    },
    candidateScore: {
        type: OptionType.NUMBER,
        description: "Minimum score required before a message is stored locally.",
        default: 6
    },
    suspiciousScore: {
        type: OptionType.NUMBER,
        description: "Score required for a message to count as suspicious.",
        default: 7
    },
    confirmedScore: {
        type: OptionType.NUMBER,
        description: "Immediate score required to confirm an account as spam.",
        default: 10
    },
    minDetectionsForConfirmed: {
        type: OptionType.NUMBER,
        description: "Context-based confirmations need at least this many detections.",
        default: 2
    },
    minDistinctContextsForConfirmed: {
        type: OptionType.NUMBER,
        description: "Context-based confirmations need detections across at least this many guilds/channels.",
        default: 2
    },
    teacherScoreThreshold: {
        type: OptionType.NUMBER,
        description: "Records at or above this score can teach the model even if not manually boosted.",
        default: 15
    },
    maxSamplesPerAuthor: {
        type: OptionType.NUMBER,
        description: "Maximum stored sample messages per detected author.",
        default: 8
    },
    syncBaseUrl: {
        type: OptionType.STRING,
        description: "Local bot sync base URL.",
        default: DEFAULT_SYNC_BASE_URL
    },
    syncSecret: {
        type: OptionType.STRING,
        description: "Shared secret sent to the bot in the x-warden-secret header.",
        default: ""
    },
    syncOnChange: {
        type: OptionType.BOOLEAN,
        description: "Sync changed records to the bot shortly after local updates.",
        default: true
    },
    syncDebounceSeconds: {
        type: OptionType.NUMBER,
        description: "Delay before changed records are batched and sent to the bot.",
        default: DEFAULT_SYNC_DEBOUNCE_SECONDS
    },
    backgroundFullSync: {
        type: OptionType.BOOLEAN,
        description: "Periodically send the full local dataset to the bot.",
        default: true
    },
    backgroundFullSyncMinutes: {
        type: OptionType.NUMBER,
        description: "Minutes between full background syncs to the bot.",
        default: DEFAULT_BACKGROUND_SYNC_MINUTES
    },
    showToasts: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when an account is detected or upgraded to confirmed.",
        default: false
    }
});

interface MessageCreatePayload {
    guildId?: string;
    channelId: string;
    message: Message;
    optimistic?: boolean;
}

interface DetectionLearningContext {
    inviteTargetHints: string[];
    normalizedTexts: string[];
    templateKey: string;
}

interface DetectionResult {
    authorId: string;
    sample: DetectionSample;
    username: string;
    globalName: string;
    accountCreatedAt: number;
    learning: DetectionLearningContext;
}

interface SyncDetectionRecord {
    authorId: string;
    verdict: DetectionVerdict;
    reviewState: DetectionReviewState;
    teaching: boolean;
    highestScore: number;
    totalScore: number;
    detectionCount: number;
    accountCreatedAt: number | null;
    firstSeen: string;
    lastSeen: string;
    distinctGuildIds: string[];
    distinctChannelIds: string[];
    payload: DetectionRecord & { teaching: boolean; };
}

interface SyncError {
    authorId?: string;
    message: string;
}

interface UpsertBatchResponse {
    success: boolean;
    source: string;
    received: number;
    upserted: number;
    inserted: number;
    updated: number;
    errors?: SyncError[];
    error?: string;
}

interface DeleteBatchResponse {
    success: boolean;
    source: string;
    requested: number;
    deleted: number;
    error?: string;
}

interface ExportDetectionRecord {
    source?: string;
    authorId?: string;
    verdict?: string;
    reviewState?: string | null;
    teaching?: boolean;
    highestScore?: number;
    totalScore?: number;
    detectionCount?: number;
    accountCreatedAt?: number | string | null;
    firstSeen?: string;
    lastSeen?: string;
    distinctGuildIds?: string[];
    distinctChannelIds?: string[];
    payload?: unknown;
    createdAt?: string;
    updatedAt?: string;
}

interface ExportResponse {
    success: boolean;
    source: string;
    count: number;
    records: ExportDetectionRecord[];
    error?: string;
}

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let backgroundSyncInterval: ReturnType<typeof setInterval> | null = null;
let syncInFlight = false;
let queuedFullSync = false;
const pendingUpsertAuthorIds = new Set<string>();
const pendingDeleteAuthorIds = new Set<string>();

function unique<T>(values: T[]) {
    return [...new Set(values)];
}

function clampSetting(value: number, fallback: number, min = 1) {
    return Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/[`"'_*~|()[\]{}<>.,!?;:/\\]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeTemplateText(value: string) {
    return normalizeText(
        value
            .replace(INVITE_REGEX, " ")
            .replace(/@everyone|@here|<@!?\d+>|<#\d+>|<@&\d+>/g, " ")
            .replace(/\b\d{4,}\b/g, " ")
    );
}

function parseLines(value: string) {
    return unique(
        value
            .split(/[\n,]/)
            .map(entry => normalizeText(entry))
            .filter(Boolean)
    );
}

function parseRegexLines(value: string) {
    return value
        .split("\n")
        .map(entry => entry.trim())
        .filter(Boolean)
        .flatMap(pattern => {
            try {
                return [new RegExp(pattern, "i")];
            } catch (error) {
                logger.warn(`Ignoring invalid channel pattern ${pattern}.`, error);
                return [];
            }
        });
}

function buildWhitelist() {
    return new Set(
        settings.store.whitelistedIds
            .split(/[\n,]/)
            .map(entry => entry.trim())
            .filter(Boolean)
    );
}

function extractInviteCodes(texts: string[]) {
    const codes = new Set<string>();

    for (const text of texts) {
        INVITE_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = INVITE_REGEX.exec(text)) !== null) {
            const code = match[1]?.toLowerCase();
            if (code) codes.add(code);
        }
    }

    return [...codes];
}

function getEmbedTexts(message: Message) {
    const texts: string[] = [];

    for (const embed of message.embeds ?? []) {
        const anyEmbed = embed as any;
        if (typeof anyEmbed.rawTitle === "string") texts.push(anyEmbed.rawTitle);
        if (typeof anyEmbed.rawDescription === "string") texts.push(anyEmbed.rawDescription);
        if (typeof anyEmbed.url === "string") texts.push(anyEmbed.url);
        if (typeof anyEmbed.footer?.text === "string") texts.push(anyEmbed.footer.text);
        if (typeof anyEmbed.author?.name === "string") texts.push(anyEmbed.author.name);

        if (Array.isArray(anyEmbed.fields)) {
            for (const field of anyEmbed.fields) {
                if (typeof field?.name === "string") texts.push(field.name);
                if (typeof field?.value === "string") texts.push(field.value);
            }
        }
    }

    return texts;
}

function extractInviteTargetHints(message: Message) {
    const hints = new Set<string>();

    for (const embed of message.embeds ?? []) {
        const anyEmbed = embed as any;
        const sources = [
            anyEmbed.rawTitle,
            anyEmbed.author?.name
        ];

        for (const source of sources) {
            if (typeof source !== "string") continue;
            const hint = normalizeTemplateText(source).slice(0, 80);
            if (hint.length >= 4) hints.add(hint);
        }
    }

    return [...hints];
}

function buildTemplateKey(rawTexts: string[]) {
    const templateKey = rawTexts
        .map(normalizeTemplateText)
        .filter(Boolean)
        .join(" ")
        .slice(0, 240);

    return templateKey.length >= 8 ? templateKey : "";
}

function getMatchedTerms(haystacks: string[], terms: string[]) {
    const hits = new Set<string>();

    for (const haystack of haystacks) {
        for (const term of terms) {
            if (term && haystack.includes(term)) hits.add(term);
        }
    }

    return [...hits];
}

function getTrailingDigitCount(author: Message["author"]) {
    const names = [author.username, author.globalName].filter(Boolean) as string[];
    let longest = 0;

    for (const name of names) {
        const digits = name.match(/(\d+)$/)?.[1]?.length ?? 0;
        if (digits > longest) longest = digits;
    }

    return longest;
}

function getAccountAgeScore(authorId: string) {
    const createdAt = SnowflakeUtils.extractTimestamp(authorId);
    if (!Number.isFinite(createdAt)) {
        return {
            createdAt: 0,
            score: 0,
            signal: null as string | null
        };
    }

    const ageDays = (Date.now() - createdAt) / 86400000;
    if (ageDays <= 30) {
        return { createdAt, score: 3, signal: "account_age<=30d" };
    }

    if (ageDays <= 180) {
        return { createdAt, score: 2, signal: "account_age<=180d" };
    }

    if (ageDays <= 730) {
        return { createdAt, score: 1, signal: "account_age<=2y" };
    }

    return { createdAt, score: 0, signal: null };
}

function shortenContentSnippet(content: string, limit = 220) {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length <= limit) return normalized;
    return normalized.slice(0, limit - 1) + "...";
}

function getContextCount(record: DetectionRecord) {
    const ids = new Set<string>();

    for (const guildId of record.distinctGuildIds) {
        ids.add(`g:${guildId}`);
    }

    for (const channelId of record.distinctChannelIds) {
        ids.add(`c:${channelId}`);
    }

    return ids.size;
}

function computeVerdict(record: DetectionRecord) {
    const suspiciousScore = clampSetting(settings.store.suspiciousScore, 7);
    const confirmedScore = clampSetting(settings.store.confirmedScore, 10);
    const minDetections = clampSetting(settings.store.minDetectionsForConfirmed, 2);
    const minContexts = clampSetting(settings.store.minDistinctContextsForConfirmed, 2);
    const contextCount = getContextCount(record);

    if (
        record.highestScore >= confirmedScore ||
        (record.detectionCount >= minDetections && contextCount >= minContexts)
    ) {
        return "confirmed" satisfies DetectionVerdict;
    }

    if (record.highestScore >= suspiciousScore) {
        return "suspicious" satisfies DetectionVerdict;
    }

    return "candidate" satisfies DetectionVerdict;
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

function getReviewState(record: DetectionRecord) {
    return record.reviewState ?? "neutral";
}

function isTeachingRecord(record: DetectionRecord) {
    const reviewState = getReviewState(record);
    if (reviewState === "suppressed") return false;
    if (reviewState === "boosted") return true;

    const teacherScoreThreshold = clampSetting(settings.store.teacherScoreThreshold, 15);
    return record.verdict === "confirmed" || record.highestScore >= teacherScoreThreshold;
}

function showToast(message: string, type: number) {
    Toasts.show({
        id: Toasts.genId(),
        message,
        type
    });
}

function getSyncBaseUrl() {
    return settings.store.syncBaseUrl.trim().replace(/\/+$/, "");
}

function getSyncSecret() {
    return settings.store.syncSecret.trim();
}

function canSyncToBot() {
    return Boolean(getSyncBaseUrl() && getSyncSecret());
}

function getSyncDebounceMs() {
    return clampSetting(settings.store.syncDebounceSeconds, DEFAULT_SYNC_DEBOUNCE_SECONDS) * 1000;
}

function getBackgroundSyncMinutes() {
    return clampSetting(settings.store.backgroundFullSyncMinutes, DEFAULT_BACKGROUND_SYNC_MINUTES);
}

function clearSyncTimers() {
    if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = null;
    }

    if (backgroundSyncInterval) {
        clearInterval(backgroundSyncInterval);
        backgroundSyncInterval = null;
    }

    queuedFullSync = false;
}

function toSyncedRecord(record: DetectionRecord): SyncDetectionRecord {
    const normalizedRecord = {
        ...record,
        firstSeen: toIsoTimestamp(record.firstSeen),
        lastSeen: toIsoTimestamp(record.lastSeen),
        reviewState: getReviewState(record)
    } satisfies DetectionRecord;
    const teaching = isTeachingRecord(normalizedRecord);

    return {
        authorId: normalizedRecord.authorId,
        verdict: normalizedRecord.verdict,
        reviewState: getReviewState(normalizedRecord),
        teaching,
        highestScore: normalizedRecord.highestScore,
        totalScore: normalizedRecord.totalScore,
        detectionCount: normalizedRecord.detectionCount,
        accountCreatedAt: normalizedRecord.accountCreatedAt || null,
        firstSeen: normalizedRecord.firstSeen,
        lastSeen: normalizedRecord.lastSeen,
        distinctGuildIds: normalizedRecord.distinctGuildIds,
        distinctChannelIds: normalizedRecord.distinctChannelIds,
        payload: {
            ...normalizedRecord,
            teaching
        }
    };
}

function chunk<T>(values: T[], size: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }

    return chunks;
}

async function parseJsonResponse(response: Response) {
    try {
        return await response.json() as Record<string, unknown>;
    } catch {
        return null;
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDetectionVerdict(value: unknown): value is DetectionVerdict {
    return value === "candidate" || value === "suspicious" || value === "confirmed";
}

function isDetectionReviewState(value: unknown): value is DetectionReviewState {
    return value === "neutral" || value === "boosted" || value === "suppressed";
}

function toOptionalStringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function toOptionalNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseAccountCreatedAt(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function toDetectionRecordFromExport(record: ExportDetectionRecord) {
    const payload = isObject(record.payload) ? record.payload : null;
    const authorId = typeof record.authorId === "string"
        ? record.authorId
        : typeof payload?.authorId === "string"
            ? payload.authorId
            : "";
    const verdict = isDetectionVerdict(record.verdict)
        ? record.verdict
        : isDetectionVerdict(payload?.verdict)
            ? payload.verdict
            : null;

    if (!authorId || !verdict) return null;

    const payloadReviewState = payload?.reviewState;
    const reviewState = isDetectionReviewState(record.reviewState)
        ? record.reviewState
        : isDetectionReviewState(payloadReviewState)
            ? payloadReviewState
            : "neutral";
    const payloadSamples = Array.isArray(payload?.sampleMessages) ? payload.sampleMessages.filter(isObject) : [];

    return {
        authorId,
        usernames: toOptionalStringArray(payload?.usernames),
        globalNames: toOptionalStringArray(payload?.globalNames),
        firstSeen: toIsoTimestamp(record.firstSeen ?? payload?.firstSeen ?? new Date().toISOString()),
        lastSeen: toIsoTimestamp(record.lastSeen ?? payload?.lastSeen ?? new Date().toISOString()),
        accountCreatedAt: parseAccountCreatedAt(record.accountCreatedAt ?? payload?.accountCreatedAt),
        highestScore: toOptionalNumber(record.highestScore ?? payload?.highestScore),
        totalScore: toOptionalNumber(record.totalScore ?? payload?.totalScore),
        detectionCount: toOptionalNumber(record.detectionCount ?? payload?.detectionCount),
        verdict,
        distinctGuildIds: toOptionalStringArray(record.distinctGuildIds ?? payload?.distinctGuildIds),
        distinctChannelIds: toOptionalStringArray(record.distinctChannelIds ?? payload?.distinctChannelIds),
        reviewState,
        sampleMessages: payloadSamples.map(sample => ({
            messageId: typeof sample.messageId === "string" ? sample.messageId : "",
            channelId: typeof sample.channelId === "string" ? sample.channelId : "",
            guildId: typeof sample.guildId === "string" ? sample.guildId : undefined,
            guildName: typeof sample.guildName === "string" ? sample.guildName : undefined,
            channelName: typeof sample.channelName === "string" ? sample.channelName : undefined,
            contentSnippet: typeof sample.contentSnippet === "string" ? sample.contentSnippet : "",
            inviteCodes: toOptionalStringArray(sample.inviteCodes),
            inviteTargetHints: toOptionalStringArray(sample.inviteTargetHints),
            matchedSignals: toOptionalStringArray(sample.matchedSignals),
            baseScore: typeof sample.baseScore === "number" && Number.isFinite(sample.baseScore) ? sample.baseScore : undefined,
            score: typeof sample.score === "number" && Number.isFinite(sample.score) ? sample.score : 0,
            templateKey: typeof sample.templateKey === "string" ? sample.templateKey : undefined,
            timestamp: toIsoTimestamp(sample.timestamp ?? new Date().toISOString())
        })).filter(sample => sample.messageId && sample.channelId)
    } satisfies DetectionRecord;
}

function getSyncErrorMessage(response: Response, payload: Record<string, unknown> | null) {
    const bodyError = typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
            ? payload.message
            : "";

    return bodyError || `${response.status} ${response.statusText}`.trim() || "Sync request failed.";
}

async function postToBot<T extends Record<string, unknown>>(path: string, body: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${getSyncBaseUrl()}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-warden-secret": getSyncSecret()
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        const payload = await parseJsonResponse(response);

        if (!response.ok) {
            throw new Error(getSyncErrorMessage(response, payload));
        }

        return payload as T;
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("Sync request timed out.");
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function getFromBot<T extends Record<string, unknown>>(path: string, params?: Record<string, string>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS);

    try {
        const url = new URL(`${getSyncBaseUrl()}${path}`);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                url.searchParams.set(key, value);
            }
        }

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "x-warden-secret": getSyncSecret()
            },
            signal: controller.signal
        });
        const payload = await parseJsonResponse(response);

        if (!response.ok) {
            throw new Error(getSyncErrorMessage(response, payload));
        }

        return payload as T;
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("Sync request timed out.");
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function sendDeleteBatch(authorIds: string[]) {
    if (!authorIds.length) {
        return {
            success: true,
            source: WARDEN_SOURCE,
            requested: 0,
            deleted: 0
        } satisfies DeleteBatchResponse;
    }

    let requested = 0;
    let deleted = 0;

    for (const ids of chunk(authorIds, SYNC_BATCH_SIZE)) {
        const response = await postToBot<DeleteBatchResponse>("/detections/delete-batch", {
            source: WARDEN_SOURCE,
            authorIds: ids
        });

        requested += response.requested ?? ids.length;
        deleted += response.deleted ?? 0;
    }

    return {
        success: true,
        source: WARDEN_SOURCE,
        requested,
        deleted
    } satisfies DeleteBatchResponse;
}

async function sendUpsertBatch(records: DetectionRecord[]) {
    if (!records.length) {
        return {
            success: true,
            source: WARDEN_SOURCE,
            received: 0,
            upserted: 0,
            inserted: 0,
            updated: 0,
            errors: []
        } satisfies UpsertBatchResponse;
    }

    let received = 0;
    let upserted = 0;
    let inserted = 0;
    let updated = 0;
    const errors: SyncError[] = [];

    for (const batch of chunk(records.map(toSyncedRecord), SYNC_BATCH_SIZE)) {
        const response = await postToBot<UpsertBatchResponse>("/detections/upsert-batch", {
            source: WARDEN_SOURCE,
            records: batch
        });

        received += response.received ?? batch.length;
        upserted += response.upserted ?? 0;
        inserted += response.inserted ?? 0;
        updated += response.updated ?? 0;
        if (response.errors?.length) {
            errors.push(...response.errors);
        }
    }

    return {
        success: errors.length === 0,
        source: WARDEN_SOURCE,
        received,
        upserted,
        inserted,
        updated,
        errors
    } satisfies UpsertBatchResponse;
}

async function fetchRecordsForSync(authorIds: string[]) {
    const records = await Promise.all(authorIds.map(authorId => dbGetDetection(authorId)));
    return records.filter(Boolean) as DetectionRecord[];
}

function scheduleDeltaSync() {
    if (!settings.store.syncOnChange || !canSyncToBot()) return;

    if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
    }

    syncDebounceTimer = setTimeout(() => {
        syncDebounceTimer = null;
        void flushPendingSync(false);
    }, getSyncDebounceMs());
}

function queueUpsert(authorId: string) {
    pendingDeleteAuthorIds.delete(authorId);
    pendingUpsertAuthorIds.add(authorId);
    scheduleDeltaSync();
}

function queueDelete(authorId: string) {
    pendingUpsertAuthorIds.delete(authorId);
    pendingDeleteAuthorIds.add(authorId);
    scheduleDeltaSync();
}

async function flushPendingSync(showSuccessToast: boolean) {
    if (!canSyncToBot()) return null;
    if (syncInFlight) return null;

    const deleteIds = [...pendingDeleteAuthorIds];
    const upsertIds = [...pendingUpsertAuthorIds];

    if (!deleteIds.length && !upsertIds.length) return null;

    pendingDeleteAuthorIds.clear();
    pendingUpsertAuthorIds.clear();
    syncInFlight = true;
    let shouldScheduleFollowup = true;

    try {
        const deleteResult = await sendDeleteBatch(deleteIds);
        const upsertRecords = await fetchRecordsForSync(upsertIds);
        const upsertResult = await sendUpsertBatch(upsertRecords);
        const validationErrorCount = upsertResult.errors?.length ?? 0;

        if (showSuccessToast) {
            showToast(
                validationErrorCount
                    ? `Bot sync finished with ${validationErrorCount} validation errors. Upserted ${upsertResult.upserted} records and deleted ${deleteResult.deleted}.`
                    : `Bot sync finished. Upserted ${upsertResult.upserted} records and deleted ${deleteResult.deleted}.`,
                validationErrorCount ? Toasts.Type.MESSAGE : Toasts.Type.SUCCESS
            );
        }

        if (upsertResult.errors?.length) {
            logger.warn("Bot sync reported partial validation errors.", upsertResult.errors);
        }

        return { deleteResult, upsertResult };
    } catch (error) {
        shouldScheduleFollowup = false;
        deleteIds.forEach(authorId => pendingDeleteAuthorIds.add(authorId));
        upsertIds.forEach(authorId => pendingUpsertAuthorIds.add(authorId));

        if (showSuccessToast) {
            showToast(
                error instanceof Error ? error.message : "Bot sync failed.",
                Toasts.Type.FAILURE
            );
        } else {
            logger.warn("Failed to sync pending Warden detections to the bot.", error);
        }

        return null;
    } finally {
        syncInFlight = false;

        if (queuedFullSync) {
            queuedFullSync = false;
            void runFullSync(false);
        } else if (shouldScheduleFollowup && (pendingDeleteAuthorIds.size || pendingUpsertAuthorIds.size)) {
            scheduleDeltaSync();
        }
    }
}

async function runFullSync(showSuccessToast: boolean) {
    if (!canSyncToBot()) {
        if (showSuccessToast) {
            showToast("Configure the bot sync URL and secret first.", Toasts.Type.FAILURE);
        }

        return null;
    }

    if (syncInFlight) {
        queuedFullSync = true;
        if (showSuccessToast) {
            showToast("A sync is already running. Full sync queued.", Toasts.Type.MESSAGE);
        }

        return null;
    }

    syncInFlight = true;
    let shouldScheduleFollowup = true;

    const pendingDeleteIds = [...pendingDeleteAuthorIds];
    pendingDeleteAuthorIds.clear();
    pendingUpsertAuthorIds.clear();

    try {
        const deleteResult = await sendDeleteBatch(pendingDeleteIds);
        const records = await dbGetAllDetections();
        const upsertResult = await sendUpsertBatch(records);
        const validationErrorCount = upsertResult.errors?.length ?? 0;

        if (showSuccessToast) {
            showToast(
                validationErrorCount
                    ? `Full bot sync finished with ${validationErrorCount} validation errors. Upserted ${upsertResult.upserted} records and deleted ${deleteResult.deleted}.`
                    : `Full bot sync finished. Upserted ${upsertResult.upserted} records and deleted ${deleteResult.deleted}.`,
                validationErrorCount ? Toasts.Type.MESSAGE : Toasts.Type.SUCCESS
            );
        }

        if (upsertResult.errors?.length) {
            logger.warn("Full bot sync reported partial validation errors.", upsertResult.errors);
        }

        return { deleteResult, upsertResult };
    } catch (error) {
        shouldScheduleFollowup = false;
        pendingDeleteIds.forEach(authorId => pendingDeleteAuthorIds.add(authorId));
        (await dbGetAllDetections()).forEach(record => pendingUpsertAuthorIds.add(record.authorId));

        if (showSuccessToast) {
            showToast(
                error instanceof Error ? error.message : "Full bot sync failed.",
                Toasts.Type.FAILURE
            );
        } else {
            logger.warn("Failed to run full Warden bot sync.", error);
        }

        return null;
    } finally {
        syncInFlight = false;

        if (queuedFullSync) {
            queuedFullSync = false;
            void runFullSync(false);
        } else if (shouldScheduleFollowup && (pendingDeleteAuthorIds.size || pendingUpsertAuthorIds.size)) {
            scheduleDeltaSync();
        }
    }
}

async function restoreDetectionsFromBot() {
    if (!canSyncToBot()) {
        showToast("Configure the bot sync URL and secret first.", Toasts.Type.FAILURE);
        return;
    }

    try {
        const response = await getFromBot<ExportResponse>("/detections/export", {
            source: WARDEN_SOURCE
        });
        const records = response.records
            .map(toDetectionRecordFromExport)
            .filter(Boolean) as DetectionRecord[];

        await clearDetections();
        await Promise.all(records.map(record => putDetection(record)));

        pendingDeleteAuthorIds.clear();
        pendingUpsertAuthorIds.clear();

        showToast(`Restored ${records.length} detection records from the bot.`, Toasts.Type.SUCCESS);
    } catch (error) {
        showToast(
            error instanceof Error ? error.message : "Failed to restore detections from the bot.",
            Toasts.Type.FAILURE
        );
    }
}

async function saveJsonFile(filename: string, json: string) {
    if (IS_DISCORD_DESKTOP) {
        await DiscordNative.fileManager.saveWithDialog(new TextEncoder().encode(json), filename);
        return;
    }

    saveFile(new File([json], filename, { type: "application/json" }));
}

function toIsoTimestamp(value: unknown) {
    const timestamp = new Date(typeof value === "string" || typeof value === "number" ? value : String(value)).getTime();
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function intersects<T>(left: T[] = [], right: T[] = []) {
    if (!left.length || !right.length) return false;
    const rightSet = new Set(right);
    return left.some(value => rightSet.has(value));
}

function getTemplateTokens(templateKey: string) {
    return new Set(
        templateKey
            .split(" ")
            .map(token => token.trim())
            .filter(token => token.length >= 3 && !STOPWORDS.has(token))
    );
}

function getTemplateSimilarity(left: string, right: string) {
    if (!left || !right) return 0;

    const leftTokens = getTemplateTokens(left);
    const rightTokens = getTemplateTokens(right);
    if (leftTokens.size < 3 || rightTokens.size < 3) return 0;

    let overlap = 0;
    for (const token of leftTokens) {
        if (rightTokens.has(token)) overlap++;
    }

    return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function shouldIgnoreMessage({ message, guildId, channelId }: MessageCreatePayload) {
    if ((message as any).state === "SENDING") return true;
    if (message.type != null && message.type !== MessageType.DEFAULT) return true;

    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return true;
    if (!message.author) return true;
    if (message.author.id === currentUser.id) return true;

    if (settings.store.guildOnly && !guildId) return true;
    if (settings.store.ignoreBots && message.author.bot) return true;
    if (settings.store.ignoreWebhooks && Boolean((message as any).webhookId)) return true;
    if (settings.store.ignoreFriends && RelationshipStore.isFriend?.(message.author.id)) return true;

    const whitelist = buildWhitelist();
    if (
        whitelist.has(message.author.id) ||
        whitelist.has(channelId) ||
        (guildId != null && whitelist.has(guildId))
    ) {
        return true;
    }

    const channel = ChannelStore.getChannel(channelId);
    const channelName = typeof channel?.name === "string" ? channel.name : "";
    if (channelName) {
        for (const pattern of parseRegexLines(settings.store.ignoredChannelNamePatterns)) {
            if (pattern.test(channelName)) return true;
        }
    }

    return false;
}

function detectMessage(payload: MessageCreatePayload): DetectionResult | null {
    const { message, guildId, channelId } = payload;
    if (!message.author) return null;

    const rawTexts = [message.content ?? "", ...getEmbedTexts(message)].filter(Boolean);
    const normalizedTexts = rawTexts.map(normalizeText).filter(Boolean);
    const baitPhrases = parseLines(settings.store.baitPhrases);
    const bioBaitPhrases = parseLines(settings.store.bioBaitPhrases);
    const sexualizedTerms = parseLines(settings.store.sexualizedTerms);
    const negativeContextTerms = parseLines(settings.store.negativeContextTerms);

    const messageInviteCodes = extractInviteCodes(rawTexts);
    const baitHits = getMatchedTerms(normalizedTexts, baitPhrases);
    const bioBaitHits = getMatchedTerms(normalizedTexts, bioBaitPhrases);
    const sexualizedHits = getMatchedTerms(normalizedTexts, sexualizedTerms);
    const negativeHits = getMatchedTerms(normalizedTexts, negativeContextTerms);
    const cachedBio = UserProfileStore.getUserProfile(message.author.id)?.bio ?? "";
    const bioInviteCodes = cachedBio ? extractInviteCodes([cachedBio]) : [];
    const inviteCodes = unique([...messageInviteCodes, ...bioInviteCodes]);

    if (inviteCodes.length === 0 && bioBaitHits.length === 0) return null;

    const hasInviteEmbed = messageInviteCodes.length > 0 && (message.embeds?.length ?? 0) > 0;
    const hasMassMention = Boolean((message as any).mention_everyone) || /@everyone|@here/i.test(message.content ?? "");
    const trailingDigits = getTrailingDigitCount(message.author);
    const ageScore = getAccountAgeScore(message.author.id);
    const inviteTargetHints = extractInviteTargetHints(message);
    const templateKey = buildTemplateKey(rawTexts);

    if (messageInviteCodes.length === 0 && bioInviteCodes.length === 0 && bioBaitHits.length > 0 && baitHits.length === 0 && sexualizedHits.length === 0 && !hasMassMention) {
        return null;
    }

    let score = messageInviteCodes.length > 0 ? 3 : 0;
    const matchedSignals: string[] = [];

    if (messageInviteCodes.length > 0) {
        matchedSignals.push("invite_url");
    }

    if (bioBaitHits.length) {
        const bioBaitBonus = Math.min(1 + bioBaitHits.length, 3);
        score += bioBaitBonus;
        matchedSignals.push(...bioBaitHits.map(hit => `bio_bait:${hit}`));
    }

    if (bioInviteCodes.length) {
        score += 3;
        matchedSignals.push("bio_invite_cached");
    }

    if (inviteCodes.length > 1) {
        score += Math.min(inviteCodes.length - 1, 2);
        matchedSignals.push(`multiple_invites:${inviteCodes.length}`);
    }

    if (hasInviteEmbed) {
        score += 2;
        matchedSignals.push("invite_embed");
    }

    if (baitHits.length) {
        score += Math.min(baitHits.length * 2, 6);
        matchedSignals.push(...baitHits.map(hit => `bait:${hit}`));
    }

    if (sexualizedHits.length) {
        score += Math.min(sexualizedHits.length * 2, 4);
        matchedSignals.push(...sexualizedHits.map(hit => `term:${hit}`));
    }

    if (hasMassMention) {
        score += 2;
        matchedSignals.push("mass_mention");
    }

    if (trailingDigits >= 4) {
        score += 2;
        matchedSignals.push(`username_trailing_digits:${trailingDigits}`);
    } else if (trailingDigits >= 2) {
        score += 1;
        matchedSignals.push(`username_trailing_digits:${trailingDigits}`);
    }

    if (ageScore.score > 0 && ageScore.signal) {
        score += ageScore.score;
        matchedSignals.push(ageScore.signal);
    }

    if (negativeHits.length) {
        const penalty = Math.min(negativeHits.length * 2, 4);
        score -= penalty;
        matchedSignals.push(...negativeHits.map(hit => `negative:${hit}`));
    }

    const guild = guildId ? GuildStore.getGuild(guildId) : null;
    const channel = ChannelStore.getChannel(channelId);
    const snippetSource = rawTexts.find(Boolean) ?? "";

    return {
        authorId: message.author.id,
        username: message.author.username,
        globalName: message.author.globalName ?? "",
        accountCreatedAt: ageScore.createdAt,
        learning: {
            inviteTargetHints,
            normalizedTexts,
            templateKey
        },
        sample: {
            messageId: message.id,
            channelId,
            guildId,
            guildName: guild?.name,
            channelName: typeof channel?.name === "string" ? channel.name : undefined,
            contentSnippet: shortenContentSnippet(snippetSource),
            inviteCodes,
            inviteTargetHints,
            matchedSignals: unique(matchedSignals),
            baseScore: score,
            score,
            templateKey,
            timestamp: toIsoTimestamp(message.timestamp)
        }
    };
}

function applyRepeatBonuses(result: DetectionResult, existing: DetectionRecord | undefined) {
    if (!existing) return result;

    let bonus = 0;
    const matchedSignals = [...result.sample.matchedSignals];
    const previousSamples = existing.sampleMessages ?? [];

    const sameInviteCount = previousSamples.filter(sample =>
        intersects(sample.inviteCodes, result.sample.inviteCodes)
    ).length;

    if (sameInviteCount > 0) {
        const sameInviteBonus = Math.min(sameInviteCount + 1, 4);
        bonus += sameInviteBonus;
        matchedSignals.push(`repeat_same_invite:+${sameInviteBonus}`);
    } else {
        const sameTargetCount = previousSamples.filter(sample =>
            !intersects(sample.inviteCodes, result.sample.inviteCodes)
            && intersects(sample.inviteTargetHints ?? [], result.sample.inviteTargetHints ?? [])
        ).length;

        if (sameTargetCount > 0) {
            const sameTargetBonus = Math.min(sameTargetCount, 2);
            bonus += sameTargetBonus;
            matchedSignals.push(`repeat_same_target:+${sameTargetBonus}`);
        } else if ((existing.detectionCount ?? 0) > 0) {
            bonus += 1;
            matchedSignals.push("repeat_other_invite:+1");
        }
    }

    result.sample.score += bonus;
    result.sample.matchedSignals = unique(matchedSignals);
    return result;
}

function applyReputationBonuses(result: DetectionResult, allRecords: DetectionRecord[]) {
    let bonus = 0;
    const matchedSignals = [...result.sample.matchedSignals];
    const inviteAuthors = new Set<string>();
    const targetAuthors = new Set<string>();
    const templateAuthors = new Set<string>();
    let bestTemplateSimilarity = 0;

    // Only high-confidence or manually boosted records are allowed to teach future detections.
    for (const record of allRecords) {
        if (record.authorId === result.authorId || !isTeachingRecord(record)) continue;

        for (const sample of record.sampleMessages ?? []) {
            if (intersects(sample.inviteCodes, result.sample.inviteCodes)) {
                inviteAuthors.add(record.authorId);
            }

            if (intersects(sample.inviteTargetHints ?? [], result.sample.inviteTargetHints ?? [])) {
                targetAuthors.add(record.authorId);
            }

            const similarity = getTemplateSimilarity(sample.templateKey ?? "", result.learning.templateKey);
            if (similarity >= 0.68) {
                templateAuthors.add(record.authorId);
                if (similarity > bestTemplateSimilarity) bestTemplateSimilarity = similarity;
            }
        }
    }

    if (inviteAuthors.size > 0) {
        const inviteBonus = Math.min(2 + inviteAuthors.size, 4);
        bonus += inviteBonus;
        matchedSignals.push(`cross_account_invite:+${inviteBonus}`);
    }

    if (targetAuthors.size > 0) {
        const targetBonus = Math.min(1 + targetAuthors.size, 3);
        bonus += targetBonus;
        matchedSignals.push(`cross_account_target:+${targetBonus}`);
    }

    if (templateAuthors.size > 0) {
        const templateBonus = bestTemplateSimilarity >= 0.82 ? 2 : 1;
        bonus += templateBonus;
        matchedSignals.push(`cross_account_template:+${templateBonus}`);
    }

    result.sample.score += Math.min(bonus, 6);
    result.sample.matchedSignals = unique(matchedSignals);
    return result;
}

function mergeStringLists(current: string[], incoming: string[]) {
    return unique([...current, ...incoming].filter(Boolean)).slice(-12);
}

function mergeSamples(current: DetectionSample[], sample: DetectionSample, maxSamples: number) {
    const withoutSameMessage = current.filter(existing => existing.messageId !== sample.messageId);
    const next = [sample, ...withoutSameMessage]
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, maxSamples);

    return next;
}

async function buildExportPayload() {
    const records = sortRecords(await dbGetAllDetections());
    const confirmed = records.filter(record => record.verdict === "confirmed");
    const teaching = records.filter(record => isTeachingRecord(record));

    return {
        generatedAt: new Date().toISOString(),
        plugin: WARDEN_SOURCE,
        thresholds: {
            candidateScore: clampSetting(settings.store.candidateScore, 6),
            suspiciousScore: clampSetting(settings.store.suspiciousScore, 7),
            confirmedScore: clampSetting(settings.store.confirmedScore, 10),
            minDetectionsForConfirmed: clampSetting(settings.store.minDetectionsForConfirmed, 2),
            minDistinctContextsForConfirmed: clampSetting(settings.store.minDistinctContextsForConfirmed, 2),
            teacherScoreThreshold: clampSetting(settings.store.teacherScoreThreshold, 15)
        },
        counts: {
            total: records.length,
            confirmed: confirmed.length,
            suspicious: records.filter(record => record.verdict === "suspicious").length,
            candidate: records.filter(record => record.verdict === "candidate").length,
            teaching: teaching.length
        },
        confirmedIds: confirmed.map(record => record.authorId),
        teachingIds: teaching.map(record => record.authorId),
        records
    };
}

async function exportDetections() {
    const payload = await buildExportPayload();
    const json = JSON.stringify(payload, null, 2);
    const filename = `nsfw-invite-spam-detections-${new Date().toISOString().slice(0, 10)}.json`;
    await saveJsonFile(filename, json);
    showToast(`Exported ${payload.counts.total} stored detection records.`, Toasts.Type.SUCCESS);
}

async function copyConfirmedIds() {
    const payload = await buildExportPayload();
    await copyWithToast(JSON.stringify(payload.confirmedIds, null, 2), "Confirmed account IDs copied.");
}

async function clearStoredDetections() {
    const records = await dbGetAllDetections();
    await clearDetections();
    records.forEach(record => queueDelete(record.authorId));
    void flushPendingSync(false);
    showToast("Cleared stored Warden detections.", Toasts.Type.SUCCESS);
}

async function setReviewState(authorId: string, reviewState: DetectionReviewState) {
    const existing = await dbGetDetection(authorId);
    if (!existing) return null;

    const next = {
        ...existing,
        reviewState
    } satisfies DetectionRecord;

    await putDetection(next);
    queueUpsert(authorId);
    return next;
}

async function deleteStoredDetection(authorId: string) {
    await deleteDetection(authorId);
    queueDelete(authorId);
    void flushPendingSync(false);
}

async function openTrainingReviewModal() {
    const initialRecords = sortRecords(await dbGetAllDetections());

    openModal(rootProps => React.createElement(ReviewModal, {
        rootProps,
        initialRecords,
        isTeachingRecord,
        onDeleteRecord: deleteStoredDetection,
        onSetReviewState: setReviewState
    }));
}

async function openDetectionsModal() {
    const initialRecords = sortRecords(await dbGetAllDetections());

    openModal(rootProps => React.createElement(DetectionsModal, {
        rootProps,
        initialRecords,
        isTeachingRecord,
        onDeleteRecord: deleteStoredDetection
    }));
}

export default definePlugin({
    name: "NSFWInviteSpamDetector",
    description: "Detects likely NSFW Discord invite spam, stores flagged accounts locally, and exports confirmed actor IDs.",
    authors: [{ name: "Warden", id: 0n }],
    tags: ["spam", "moderation", "invite", "warden"],
    settings,

    toolboxActions: {
        async "Restore Invite Spam Detections From Bot"() {
            await restoreDetectionsFromBot();
        },
        async "Sync Invite Spam Detections to Bot"() {
            await runFullSync(true);
        },
        async "View Stored Invite Spam Detections"() {
            await openDetectionsModal();
        },
        async "Review Invite Spam Training Data"() {
            await openTrainingReviewModal();
        },
        async "Export NSFW Invite Spam JSON"() {
            await exportDetections();
        },
        async "Copy Confirmed NSFW Spam IDs"() {
            await copyConfirmedIds();
        },
        async "Clear Stored NSFW Spam Detections"() {
            await clearStoredDetections();
        }
    },

    async start() {
        await initDetectionsDb();

        clearSyncTimers();

        if (settings.store.backgroundFullSync) {
            backgroundSyncInterval = setInterval(() => {
                void runFullSync(false);
            }, getBackgroundSyncMinutes() * 60 * 1000);
        }
    },

    stop() {
        clearSyncTimers();
    },

    async getAllDetections() {
        return sortRecords(await dbGetAllDetections());
    },

    async getConfirmedIds() {
        const payload = await buildExportPayload();
        return payload.confirmedIds;
    },

    async getTeachingDetections() {
        return sortRecords((await dbGetAllDetections()).filter(record => isTeachingRecord(record)));
    },

    flux: {
        async MESSAGE_CREATE(payload: MessageCreatePayload) {
            try {
                if (payload.optimistic) return;
                if (shouldIgnoreMessage(payload)) return;

                const baseResult = detectMessage(payload);
                if (!baseResult) return;

                const [existing, allRecords] = await Promise.all([
                    dbGetDetection(baseResult.authorId),
                    dbGetAllDetections()
                ]);

                let result = applyRepeatBonuses(baseResult, existing ?? undefined);
                result = applyReputationBonuses(result, allRecords);

                const candidateScore = clampSetting(settings.store.candidateScore, 6);
                if (result.sample.score < candidateScore) return;

                const sampleLimit = clampSetting(settings.store.maxSamplesPerAuthor, 8);
                const alreadyStored = existing?.sampleMessages.some(sample => sample.messageId === result.sample.messageId) ?? false;
                const detectionCount = alreadyStored
                    ? existing?.detectionCount ?? 0
                    : (existing?.detectionCount ?? 0) + 1;

                const next: DetectionRecord = {
                    authorId: result.authorId,
                    usernames: mergeStringLists(existing?.usernames ?? [], [result.username]),
                    globalNames: mergeStringLists(existing?.globalNames ?? [], [result.globalName]),
                    firstSeen: existing?.firstSeen ?? result.sample.timestamp,
                    lastSeen: result.sample.timestamp,
                    accountCreatedAt: result.accountCreatedAt || existing?.accountCreatedAt || 0,
                    highestScore: Math.max(existing?.highestScore ?? 0, result.sample.score),
                    totalScore: (existing?.totalScore ?? 0) + (alreadyStored ? 0 : result.sample.score),
                    detectionCount,
                    verdict: "candidate",
                    distinctGuildIds: unique([...(existing?.distinctGuildIds ?? []), result.sample.guildId].filter(Boolean) as string[]),
                    distinctChannelIds: unique([...(existing?.distinctChannelIds ?? []), result.sample.channelId]),
                    reviewState: existing?.reviewState ?? "neutral",
                    sampleMessages: mergeSamples(existing?.sampleMessages ?? [], result.sample, sampleLimit)
                };

                next.verdict = computeVerdict(next);
                await putDetection(next);
                queueUpsert(next.authorId);

                if (!settings.store.showToasts) return;

                const previousVerdict = existing?.verdict;
                if (previousVerdict !== next.verdict || !existing) {
                    const label = result.globalName || result.username;
                    showToast(
                        `${label} flagged as ${next.verdict} invite spam (score ${result.sample.score}).`,
                        next.verdict === "confirmed" ? Toasts.Type.FAILURE : Toasts.Type.MESSAGE
                    );
                }
            } catch (error) {
                logger.error("Failed to process message for NSFW invite spam detection.", error);
            }
        }
    }
});
