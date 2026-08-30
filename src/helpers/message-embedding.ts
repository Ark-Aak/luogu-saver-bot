import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { groupMessageEmbeddingMeans, messageEmbeddingPreferences, userMessageEmbeddingProfiles } from '@/db/schema';

// Converts cosine gaps into a relative candidate distribution, not a calibrated success probability.
const MESSAGE_AUTHOR_GUESS_TEMPERATURE = 0.1;

export type MessageEmbeddingDatabase = BetterSQLite3Database<typeof schema>;

export type StreamingMeanUpdate = {
    mean: Float32Array;
    residual: Float32Array;
    sampleCount: number;
};

export type DecayedAverageUpdate = {
    vector: Float32Array;
    effectiveWeight: number;
    updatedAt: number;
};

export type MessageEmbeddingRecord = {
    groupId: number;
    userId: number;
    preferenceRevision: number;
    embedding: readonly number[];
    spaceKey: string;
    timestamp: number;
    decayHalfLifeMs: number;
};

export type MessageEmbeddingPreference = {
    optedOut: boolean;
    revision: number;
    updatedAt: number | null;
};

export type GroupMessageEmbeddingSummary = {
    groupId: number;
    model: string;
    dimensions: number;
    sampleCount: number;
    updatedAt: number;
    componentMean: number;
    minimum: number;
    maximum: number;
    l2Norm: number;
    preview: number[];
};

export type UserMessageEmbeddingSummary = {
    userId: number;
    model: string;
    dimensions: number;
    effectiveWeight: number;
    updatedAt: number;
    componentMean: number;
    minimum: number;
    maximum: number;
    l2Norm: number;
    preview: number[];
};

export type MessageAuthorGuess = {
    userId: number;
    similarity: number;
    effectiveWeight: number;
    runnerUpSimilarity: number | null;
    similarityMargin: number | null;
    candidateCount: number;
    relativeConfidence: number | null;
};

export type MessageAuthorGuessOptions = {
    queryTimestamp: number;
    decayHalfLifeMs: number;
    minimumEffectiveWeight: number;
};

export type MessageEmbeddingNoticeClaim = {
    optedOut: boolean;
    claimedAt: number;
};

function assertFiniteVector(vector: ArrayLike<number>, label: string): void {
    if (!Number.isSafeInteger(vector.length) || vector.length <= 0) {
        throw new Error(`${label} must contain at least one dimension.`);
    }
    for (let index = 0; index < vector.length; index += 1) {
        if (!Number.isFinite(vector[index])) throw new Error(`${label} contains a non-finite value.`);
    }
}

export function calculateStreamingMean(
    previousMean: ArrayLike<number> | null,
    previousCount: number,
    sample: ArrayLike<number>
): StreamingMeanUpdate {
    assertFiniteVector(sample, 'Sample vector');
    if (previousMean === null) {
        if (previousCount !== 0) throw new Error('A missing mean must have a zero sample count.');
        return {
            mean: Float32Array.from(sample),
            residual: new Float32Array(sample.length),
            sampleCount: 1
        };
    }

    assertFiniteVector(previousMean, 'Previous mean');
    if (previousMean.length !== sample.length) throw new Error('Embedding dimensions do not match the group mean.');
    if (!Number.isSafeInteger(previousCount) || previousCount <= 0 || previousCount >= Number.MAX_SAFE_INTEGER) {
        throw new Error('Previous sample count is invalid.');
    }

    const sampleCount = previousCount + 1;
    const mean = new Float32Array(sample.length);
    const residual = new Float32Array(sample.length);
    for (let index = 0; index < sample.length; index += 1) {
        mean[index] = previousMean[index] + (sample[index] - previousMean[index]) / sampleCount;
        residual[index] = sample[index] - mean[index];
    }
    return { mean, residual, sampleCount };
}

export function calculateDecayedAverage(
    previousVector: ArrayLike<number> | null,
    previousWeight: number,
    previousTimestamp: number,
    sample: ArrayLike<number>,
    timestamp: number,
    halfLifeMs: number
): DecayedAverageUpdate {
    assertFiniteVector(sample, 'Residual vector');
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('Update timestamp is invalid.');
    if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) throw new Error('Decay half-life must be positive.');

    if (previousVector === null) {
        return {
            vector: Float32Array.from(sample),
            effectiveWeight: 1,
            updatedAt: timestamp
        };
    }

    assertFiniteVector(previousVector, 'Previous feature vector');
    if (previousVector.length !== sample.length) throw new Error('Embedding dimensions do not match the user profile.');
    if (!Number.isFinite(previousWeight) || previousWeight <= 0)
        throw new Error('Previous effective weight is invalid.');
    if (!Number.isFinite(previousTimestamp) || previousTimestamp < 0) {
        throw new Error('Previous update timestamp is invalid.');
    }

    const updatedAt = Math.max(timestamp, previousTimestamp);
    const decayedWeight = previousWeight * Math.pow(0.5, (updatedAt - previousTimestamp) / halfLifeMs);
    const effectiveWeight = decayedWeight + 1;
    const vector = new Float32Array(sample.length);
    for (let index = 0; index < sample.length; index += 1) {
        vector[index] = (previousVector[index] * decayedWeight + sample[index]) / effectiveWeight;
    }
    return { vector, effectiveWeight, updatedAt };
}

function encodeVector(vector: ArrayLike<number>): Buffer {
    const buffer = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
    for (let index = 0; index < vector.length; index += 1) {
        buffer.writeFloatLE(vector[index], index * Float32Array.BYTES_PER_ELEMENT);
    }
    return buffer;
}

function decodeVector(buffer: Buffer, dimensions: number): Float32Array {
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0)
        throw new Error('Stored embedding dimensions are invalid.');
    if (buffer.byteLength !== dimensions * Float32Array.BYTES_PER_ELEMENT) {
        throw new Error('Stored embedding vector length does not match its dimensions.');
    }
    const vector = new Float32Array(dimensions);
    for (let index = 0; index < dimensions; index += 1) {
        vector[index] = buffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
    }
    return vector;
}

export function getMessageEmbeddingPreference(
    database: MessageEmbeddingDatabase,
    userId: number
): MessageEmbeddingPreference {
    const row = database
        .select()
        .from(messageEmbeddingPreferences)
        .where(eq(messageEmbeddingPreferences.userId, userId))
        .get();
    return row
        ? { optedOut: row.optedOut, revision: row.revision, updatedAt: row.updatedAt }
        : { optedOut: false, revision: 0, updatedAt: null };
}

export function isMessageEmbeddingOptedOut(database: MessageEmbeddingDatabase, userId: number): boolean {
    return getMessageEmbeddingPreference(database, userId).optedOut;
}

export function touchMessageEmbeddingLastSpokeAt(
    database: MessageEmbeddingDatabase,
    userId: number,
    spokenAt: number
): MessageEmbeddingPreference {
    if (!Number.isSafeInteger(spokenAt) || spokenAt < 0) {
        throw new Error('Message embedding last-spoken timestamp is invalid.');
    }
    database.run(sql`
        INSERT INTO message_embedding_preferences (
            user_id,
            opted_out,
            revision,
            updated_at,
            notice_sent_at,
            last_spoke_at
        )
        VALUES (${userId}, 0, 0, ${spokenAt}, NULL, ${spokenAt})
        ON CONFLICT(user_id) DO UPDATE SET
            last_spoke_at = MAX(
                COALESCE(message_embedding_preferences.last_spoke_at, 0),
                excluded.last_spoke_at
            )
        WHERE message_embedding_preferences.opted_out = 0
    `);
    return getMessageEmbeddingPreference(database, userId);
}

export function claimMessageEmbeddingNotice(
    database: MessageEmbeddingDatabase,
    userId: number,
    claimedAt: number
): MessageEmbeddingNoticeClaim | null {
    if (!Number.isSafeInteger(claimedAt) || claimedAt < 0) {
        throw new Error('Message embedding notice timestamp is invalid.');
    }
    const inserted = database
        .insert(messageEmbeddingPreferences)
        .values({
            userId,
            optedOut: false,
            revision: 0,
            updatedAt: claimedAt,
            noticeSentAt: claimedAt,
            lastSpokeAt: null
        })
        .onConflictDoNothing()
        .run();
    if (inserted.changes > 0) return { optedOut: false, claimedAt };

    const claimed = database
        .update(messageEmbeddingPreferences)
        .set({ noticeSentAt: claimedAt })
        .where(and(eq(messageEmbeddingPreferences.userId, userId), isNull(messageEmbeddingPreferences.noticeSentAt)))
        .run();
    if (claimed.changes === 0) return null;

    const preference = database
        .select({ optedOut: messageEmbeddingPreferences.optedOut })
        .from(messageEmbeddingPreferences)
        .where(eq(messageEmbeddingPreferences.userId, userId))
        .get();
    return preference ? { optedOut: preference.optedOut, claimedAt } : null;
}

export function releaseMessageEmbeddingNoticeClaim(
    database: MessageEmbeddingDatabase,
    userId: number,
    claimedAt: number
): boolean {
    return (
        database
            .update(messageEmbeddingPreferences)
            .set({ noticeSentAt: null })
            .where(
                and(
                    eq(messageEmbeddingPreferences.userId, userId),
                    eq(messageEmbeddingPreferences.noticeSentAt, claimedAt)
                )
            )
            .run().changes > 0
    );
}

export function optOutMessageEmbedding(
    database: MessageEmbeddingDatabase,
    userId: number,
    updatedAt: number
): { alreadyOptedOut: boolean; deletedProfile: boolean; revision: number } {
    return database.transaction(transaction => {
        const existing = transaction
            .select()
            .from(messageEmbeddingPreferences)
            .where(eq(messageEmbeddingPreferences.userId, userId))
            .get();
        const revision = (existing?.revision ?? 0) + 1;
        const deletedProfile =
            transaction
                .delete(userMessageEmbeddingProfiles)
                .where(eq(userMessageEmbeddingProfiles.userId, userId))
                .run().changes > 0;
        const noticeSentAt = existing?.noticeSentAt ?? updatedAt;
        transaction
            .insert(messageEmbeddingPreferences)
            .values({ userId, optedOut: true, revision, updatedAt, noticeSentAt, lastSpokeAt: null })
            .onConflictDoUpdate({
                target: messageEmbeddingPreferences.userId,
                set: { optedOut: true, revision, updatedAt, noticeSentAt, lastSpokeAt: null }
            })
            .run();
        return { alreadyOptedOut: existing?.optedOut === true, deletedProfile, revision };
    });
}

export function optInMessageEmbedding(
    database: MessageEmbeddingDatabase,
    userId: number,
    updatedAt: number
): { alreadyOptedIn: boolean; revision: number } {
    return database.transaction(transaction => {
        const existing = transaction
            .select()
            .from(messageEmbeddingPreferences)
            .where(eq(messageEmbeddingPreferences.userId, userId))
            .get();
        if (!existing) {
            transaction
                .insert(messageEmbeddingPreferences)
                .values({
                    userId,
                    optedOut: false,
                    revision: 0,
                    updatedAt,
                    noticeSentAt: updatedAt,
                    lastSpokeAt: null
                })
                .run();
            return { alreadyOptedIn: true, revision: 0 };
        }
        if (!existing.optedOut) {
            if (existing.noticeSentAt === null) {
                transaction
                    .update(messageEmbeddingPreferences)
                    .set({ noticeSentAt: updatedAt })
                    .where(eq(messageEmbeddingPreferences.userId, userId))
                    .run();
            }
            return { alreadyOptedIn: true, revision: existing.revision };
        }

        const revision = existing.revision + 1;
        transaction
            .update(messageEmbeddingPreferences)
            .set({
                optedOut: false,
                revision,
                updatedAt,
                noticeSentAt: existing.noticeSentAt ?? updatedAt,
                lastSpokeAt: null
            })
            .where(eq(messageEmbeddingPreferences.userId, userId))
            .run();
        return { alreadyOptedIn: false, revision };
    });
}

export function optOutInactiveMessageEmbeddingUsers(
    database: MessageEmbeddingDatabase,
    cutoffTimestamp: number,
    updatedAt: number
): number {
    if (!Number.isSafeInteger(cutoffTimestamp) || cutoffTimestamp < 0) {
        throw new Error('Embedding inactivity cutoff timestamp is invalid.');
    }
    if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) {
        throw new Error('Embedding preference update timestamp is invalid.');
    }

    return database.transaction(transaction => {
        transaction.run(sql`
            DELETE FROM user_message_embedding_profiles
            WHERE user_id IN (
                SELECT user_id
                FROM message_embedding_preferences
                WHERE opted_out = 0 AND last_spoke_at < ${cutoffTimestamp}
            )
        `);
        return transaction
            .update(messageEmbeddingPreferences)
            .set({
                optedOut: true,
                revision: sql`${messageEmbeddingPreferences.revision} + 1`,
                updatedAt,
                lastSpokeAt: null
            })
            .where(
                and(
                    eq(messageEmbeddingPreferences.optedOut, false),
                    lt(messageEmbeddingPreferences.lastSpokeAt, cutoffTimestamp)
                )
            )
            .run().changes;
    });
}

export function recordMessageEmbedding(database: MessageEmbeddingDatabase, record: MessageEmbeddingRecord): boolean {
    return database.transaction(transaction => {
        const preference = transaction
            .select({ optedOut: messageEmbeddingPreferences.optedOut, revision: messageEmbeddingPreferences.revision })
            .from(messageEmbeddingPreferences)
            .where(eq(messageEmbeddingPreferences.userId, record.userId))
            .get();
        if (preference?.optedOut || (preference?.revision ?? 0) !== record.preferenceRevision) return false;

        const dimensions = record.embedding.length;
        const groupRecord = transaction
            .select()
            .from(groupMessageEmbeddingMeans)
            .where(eq(groupMessageEmbeddingMeans.groupId, record.groupId))
            .get();
        const compatibleGroupRecord =
            groupRecord?.spaceKey === record.spaceKey &&
            groupRecord.dimensions === dimensions &&
            groupRecord.sampleCount > 0;
        const meanUpdate = calculateStreamingMean(
            compatibleGroupRecord ? decodeVector(groupRecord.meanVector, dimensions) : null,
            compatibleGroupRecord ? groupRecord.sampleCount : 0,
            record.embedding
        );

        const userRecord = transaction
            .select()
            .from(userMessageEmbeddingProfiles)
            .where(eq(userMessageEmbeddingProfiles.userId, record.userId))
            .get();
        const compatibleUserRecord =
            userRecord?.spaceKey === record.spaceKey &&
            userRecord.dimensions === dimensions &&
            Number.isFinite(userRecord.effectiveWeight) &&
            userRecord.effectiveWeight > 0;
        const averageUpdate = calculateDecayedAverage(
            compatibleUserRecord ? decodeVector(userRecord.featureVector, dimensions) : null,
            compatibleUserRecord ? userRecord.effectiveWeight : 0,
            compatibleUserRecord ? userRecord.updatedAt : record.timestamp,
            meanUpdate.residual,
            record.timestamp,
            record.decayHalfLifeMs
        );
        const meanVector = encodeVector(meanUpdate.mean);
        const featureVector = encodeVector(averageUpdate.vector);
        const groupUpdatedAt = compatibleGroupRecord
            ? Math.max(record.timestamp, groupRecord.updatedAt)
            : record.timestamp;

        transaction
            .insert(groupMessageEmbeddingMeans)
            .values({
                groupId: record.groupId,
                spaceKey: record.spaceKey,
                dimensions,
                meanVector,
                sampleCount: meanUpdate.sampleCount,
                updatedAt: groupUpdatedAt
            })
            .onConflictDoUpdate({
                target: groupMessageEmbeddingMeans.groupId,
                set: {
                    spaceKey: record.spaceKey,
                    dimensions,
                    meanVector,
                    sampleCount: meanUpdate.sampleCount,
                    updatedAt: groupUpdatedAt
                }
            })
            .run();
        transaction
            .insert(userMessageEmbeddingProfiles)
            .values({
                userId: record.userId,
                spaceKey: record.spaceKey,
                dimensions,
                featureVector,
                effectiveWeight: averageUpdate.effectiveWeight,
                updatedAt: averageUpdate.updatedAt
            })
            .onConflictDoUpdate({
                target: userMessageEmbeddingProfiles.userId,
                set: {
                    spaceKey: record.spaceKey,
                    dimensions,
                    featureVector,
                    effectiveWeight: averageUpdate.effectiveWeight,
                    updatedAt: averageUpdate.updatedAt
                }
            })
            .run();
        return true;
    });
}

type VectorStatistics = Pick<
    GroupMessageEmbeddingSummary,
    'componentMean' | 'minimum' | 'maximum' | 'l2Norm' | 'preview'
>;

function summarizeVector(buffer: Buffer, dimensions: number): VectorStatistics {
    const vector = decodeVector(buffer, dimensions);
    let sum = 0;
    let sumSquares = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    const preview: number[] = [];
    for (let index = 0; index < vector.length; index += 1) {
        const value = vector[index];
        sum += value;
        sumSquares += value * value;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        if (index < 8) preview.push(value);
    }
    return {
        componentMean: sum / vector.length,
        minimum,
        maximum,
        l2Norm: Math.sqrt(sumSquares),
        preview
    };
}

function resolveEmbeddingModel(spaceKey: string): string {
    const separatorIndex = spaceKey.lastIndexOf('\u0000');
    return separatorIndex >= 0 ? spaceKey.slice(separatorIndex + 1) : spaceKey;
}

export function getGroupMessageEmbeddingSummary(
    database: MessageEmbeddingDatabase,
    groupId: number
): GroupMessageEmbeddingSummary | null {
    const record = database
        .select()
        .from(groupMessageEmbeddingMeans)
        .where(eq(groupMessageEmbeddingMeans.groupId, groupId))
        .get();
    if (!record) return null;

    return {
        groupId,
        model: resolveEmbeddingModel(record.spaceKey),
        dimensions: record.dimensions,
        sampleCount: record.sampleCount,
        updatedAt: record.updatedAt,
        ...summarizeVector(record.meanVector, record.dimensions)
    };
}

export function getUserMessageEmbeddingSummary(
    database: MessageEmbeddingDatabase,
    userId: number
): UserMessageEmbeddingSummary | null {
    const record = database
        .select()
        .from(userMessageEmbeddingProfiles)
        .where(eq(userMessageEmbeddingProfiles.userId, userId))
        .get();
    if (!record) return null;

    return {
        userId,
        model: resolveEmbeddingModel(record.spaceKey),
        dimensions: record.dimensions,
        effectiveWeight: record.effectiveWeight,
        updatedAt: record.updatedAt,
        ...summarizeVector(record.featureVector, record.dimensions)
    };
}

export function guessMessageEmbeddingAuthor(
    database: MessageEmbeddingDatabase,
    groupId: number,
    candidateUserIds: number[],
    embedding: readonly number[],
    spaceKey: string,
    options: MessageAuthorGuessOptions
): MessageAuthorGuess | null {
    if (!Number.isSafeInteger(options.queryTimestamp) || options.queryTimestamp < 0) {
        throw new Error('Guess query timestamp is invalid.');
    }
    if (!Number.isFinite(options.decayHalfLifeMs) || options.decayHalfLifeMs <= 0) {
        throw new Error('Guess decay half-life must be positive.');
    }
    if (!Number.isFinite(options.minimumEffectiveWeight) || options.minimumEffectiveWeight < 0) {
        throw new Error('Guess minimum effective weight must be non-negative.');
    }
    if (candidateUserIds.length === 0) return null;

    const groupRecord = database
        .select()
        .from(groupMessageEmbeddingMeans)
        .where(eq(groupMessageEmbeddingMeans.groupId, groupId))
        .get();
    if (
        !groupRecord ||
        groupRecord.spaceKey !== spaceKey ||
        groupRecord.dimensions !== embedding.length ||
        groupRecord.sampleCount <= 0
    ) {
        return null;
    }

    const groupMean = decodeVector(groupRecord.meanVector, groupRecord.dimensions);
    const residual = calculateStreamingMean(groupMean, groupRecord.sampleCount, embedding).residual;
    let residualMagnitudeSquared = 0;
    for (let index = 0; index < residual.length; index += 1) {
        residualMagnitudeSquared += residual[index] * residual[index];
    }
    if (residualMagnitudeSquared === 0) return null;

    let bestGuess: Pick<MessageAuthorGuess, 'userId' | 'similarity' | 'effectiveWeight'> | null = null;
    let runnerUpSimilarity: number | null = null;
    let candidateCount = 0;
    let maximumSimilarity = Number.NEGATIVE_INFINITY;
    let relativeExponentialSum = 0;
    const residualMagnitude = Math.sqrt(residualMagnitudeSquared);
    for (let offset = 0; offset < candidateUserIds.length; offset += 500) {
        const candidateChunk = candidateUserIds.slice(offset, offset + 500);
        const profiles = database
            .select()
            .from(userMessageEmbeddingProfiles)
            .where(
                and(
                    inArray(userMessageEmbeddingProfiles.userId, candidateChunk),
                    eq(userMessageEmbeddingProfiles.spaceKey, spaceKey),
                    eq(userMessageEmbeddingProfiles.dimensions, embedding.length)
                )
            )
            .all();
        for (const profile of profiles) {
            const elapsedMs = Math.max(0, options.queryTimestamp - profile.updatedAt);
            const currentEffectiveWeight = profile.effectiveWeight * Math.pow(0.5, elapsedMs / options.decayHalfLifeMs);
            if (!Number.isFinite(currentEffectiveWeight) || currentEffectiveWeight < options.minimumEffectiveWeight) {
                continue;
            }

            const featureVector = decodeVector(profile.featureVector, profile.dimensions);
            let dotProduct = 0;
            let featureMagnitudeSquared = 0;
            for (let index = 0; index < featureVector.length; index += 1) {
                dotProduct += residual[index] * featureVector[index];
                featureMagnitudeSquared += featureVector[index] * featureVector[index];
            }
            if (featureMagnitudeSquared === 0) continue;

            const similarity = dotProduct / (residualMagnitude * Math.sqrt(featureMagnitudeSquared));
            if (!Number.isFinite(similarity)) continue;

            candidateCount += 1;
            if (similarity > maximumSimilarity) {
                relativeExponentialSum =
                    relativeExponentialSum *
                        Math.exp((maximumSimilarity - similarity) / MESSAGE_AUTHOR_GUESS_TEMPERATURE) +
                    1;
                maximumSimilarity = similarity;
            } else {
                relativeExponentialSum += Math.exp((similarity - maximumSimilarity) / MESSAGE_AUTHOR_GUESS_TEMPERATURE);
            }

            if (
                !bestGuess ||
                similarity > bestGuess.similarity ||
                (similarity === bestGuess.similarity && profile.userId < bestGuess.userId)
            ) {
                if (bestGuess) {
                    runnerUpSimilarity =
                        runnerUpSimilarity === null
                            ? bestGuess.similarity
                            : Math.max(runnerUpSimilarity, bestGuess.similarity);
                }
                bestGuess = {
                    userId: profile.userId,
                    similarity,
                    effectiveWeight: currentEffectiveWeight
                };
            } else {
                runnerUpSimilarity =
                    runnerUpSimilarity === null ? similarity : Math.max(runnerUpSimilarity, similarity);
            }
        }
    }
    if (!bestGuess) return null;
    return {
        ...bestGuess,
        runnerUpSimilarity,
        similarityMargin: runnerUpSimilarity === null ? null : bestGuess.similarity - runnerUpSimilarity,
        candidateCount,
        relativeConfidence: candidateCount < 2 ? null : 1 / relativeExponentialSum
    };
}
