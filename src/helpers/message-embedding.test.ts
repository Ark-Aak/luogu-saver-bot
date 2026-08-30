import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import {
    calculateDecayedAverage,
    calculateStreamingMean,
    claimMessageEmbeddingNotice,
    getGroupMessageEmbeddingSummary,
    getMessageEmbeddingPreference,
    getUserMessageEmbeddingSummary,
    guessMessageEmbeddingAuthor,
    isMessageEmbeddingOptedOut,
    optInMessageEmbedding,
    optOutInactiveMessageEmbeddingUsers,
    optOutMessageEmbedding,
    recordMessageEmbedding,
    releaseMessageEmbeddingNoticeClaim,
    touchMessageEmbeddingLastSpokeAt
} from '@/helpers/message-embedding';
import { groupMessageEmbeddingMeans, messageEmbeddingPreferences, userMessageEmbeddingProfiles } from '@/db/schema';
import { EmbeddingSchema } from '@/config/schemas/embedding';
import { parseEmbeddingResponse, validateEmbeddingEndpoint } from '@/utils/embedding-client';
import { canViewMessageEmbeddingProfile } from '@/utils/embedding-profile-access';
import { parseEmbeddingCutoffTimestamp } from '@/utils/embedding-cutoff';

function decodeVector(buffer: Buffer): number[] {
    const values: number[] = [];
    for (let offset = 0; offset < buffer.byteLength; offset += Float32Array.BYTES_PER_ELEMENT) {
        values.push(buffer.readFloatLE(offset));
    }
    return values;
}

function encodeVector(values: readonly number[]): Buffer {
    const buffer = Buffer.alloc(values.length * Float32Array.BYTES_PER_ELEMENT);
    for (let index = 0; index < values.length; index += 1) {
        buffer.writeFloatLE(values[index], index * Float32Array.BYTES_PER_ELEMENT);
    }
    return buffer;
}

test('embedding config defaults to an unconfigured API and a 30-day half-life', () => {
    const embedding = EmbeddingSchema.parse({});
    assert.equal(embedding.endpoint, '');
    assert.equal(embedding.model, 'text-embedding-3-small');
    assert.equal(embedding.decayHalfLifeMs, 30 * 24 * 60 * 60 * 1000);
    assert.equal(embedding.guessMinEffectiveWeight, 3);
});

test('OpenRouter model pages are rejected as embedding endpoints', () => {
    assert.doesNotThrow(() => validateEmbeddingEndpoint('https://openrouter.ai/api/v1/embeddings'));
    assert.throws(
        () => validateEmbeddingEndpoint('https://openrouter.ai/baai/bge-m3'),
        /OpenRouter Embedding endpoint/
    );
    assert.doesNotThrow(() => validateEmbeddingEndpoint('https://embedding.example/v1/embeddings'));
});

test('embedding response parser accepts OpenRouter JSON and event-stream text without exposing bodies', () => {
    const response = { data: [{ index: 0, embedding: [1, 2, 3] }] };
    assert.deepEqual(parseEmbeddingResponse(response), [1, 2, 3]);
    assert.deepEqual(parseEmbeddingResponse(JSON.stringify(response)), [1, 2, 3]);
    assert.deepEqual(parseEmbeddingResponse(JSON.stringify(JSON.stringify(response))), [1, 2, 3]);
    assert.deepEqual(parseEmbeddingResponse(`\uFEFF${JSON.stringify(response)}`), [1, 2, 3]);
    assert.deepEqual(parseEmbeddingResponse(`data: ${JSON.stringify(response)}\n\ndata: [DONE]\n\n`), [1, 2, 3]);
    assert.throws(
        () => parseEmbeddingResponse('<html>private upstream body</html>', { status: 200, contentType: 'text/html' }),
        error =>
            error instanceof Error &&
            /kind=html, length=34, status=200, contentType=text\/html/.test(error.message) &&
            !error.message.includes('private upstream body')
    );
    assert.throws(() => parseEmbeddingResponse({ data: [{ embedding: [] }] }));
    assert.throws(() => parseEmbeddingResponse({ data: [{ embedding: [Number.NaN] }] }));
});

test('streaming group mean and time-decayed user average follow the configured formulas', () => {
    const meanUpdate = calculateStreamingMean([1, 3], 1, [3, 7]);
    assert.deepEqual(Array.from(meanUpdate.mean), [2, 5]);
    assert.deepEqual(Array.from(meanUpdate.residual), [1, 2]);
    assert.equal(meanUpdate.sampleCount, 2);

    const averageUpdate = calculateDecayedAverage([2, 4], 3, 1_000, [5, 1], 2_000, 1_000);
    assert.ok(Math.abs(averageUpdate.effectiveWeight - 2.5) < 1e-9);
    assert.ok(Math.abs(averageUpdate.vector[0] - 3.2) < 1e-6);
    assert.ok(Math.abs(averageUpdate.vector[1] - 2.8) < 1e-6);
});

test('profile access allows self-service and administrator lookups only', () => {
    assert.equal(canViewMessageEmbeddingProfile(7, 7, false, false), true);
    assert.equal(canViewMessageEmbeddingProfile(7, 8, false, false), false);
    assert.equal(canViewMessageEmbeddingProfile(7, 8, true, false), true);
    assert.equal(canViewMessageEmbeddingProfile(7, 8, false, true), true);
});

test('profiles cross groups, opt-out is reversible, and group summaries describe the current mean', t => {
    const sqlite = new Database(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(`
        CREATE TABLE group_message_embedding_means (
            group_id INTEGER PRIMARY KEY NOT NULL,
            space_key TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            mean_vector BLOB NOT NULL,
            sample_count INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE user_message_embedding_profiles (
            user_id INTEGER PRIMARY KEY NOT NULL,
            space_key TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            feature_vector BLOB NOT NULL,
            effective_weight REAL NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE message_embedding_preferences (
            user_id INTEGER PRIMARY KEY NOT NULL,
            opted_out INTEGER NOT NULL,
            revision INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            notice_sent_at INTEGER,
            last_spoke_at INTEGER
        );
    `);
    const database = drizzle(sqlite, { schema });
    const halfLifeMs = 1_000;

    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 0,
            embedding: [2, 4],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 1_000,
            decayHalfLifeMs: halfLifeMs
        }),
        true
    );
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 0,
            embedding: [4, 8],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 2_000,
            decayHalfLifeMs: halfLifeMs
        }),
        true
    );
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 200,
            userId: 7,
            preferenceRevision: 0,
            embedding: [10, 10],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 2_000,
            decayHalfLifeMs: halfLifeMs
        }),
        true
    );

    const group100 = database
        .select()
        .from(groupMessageEmbeddingMeans)
        .where(eq(groupMessageEmbeddingMeans.groupId, 100))
        .get();
    const groupRows = database.select().from(groupMessageEmbeddingMeans).all();
    const profileRows = database.select().from(userMessageEmbeddingProfiles).all();
    assert.equal(groupRows.length, 2);
    assert.equal(profileRows.length, 1);
    assert.ok(group100);
    assert.equal(group100.sampleCount, 2);
    assert.deepEqual(decodeVector(group100.meanVector), [3, 6]);

    const optOut = optOutMessageEmbedding(database, 7, 3_000);
    assert.equal(optOut.alreadyOptedOut, false);
    assert.equal(optOut.deletedProfile, true);
    assert.equal(optOut.revision, 1);
    assert.equal(isMessageEmbeddingOptedOut(database, 7), true);
    assert.deepEqual(getMessageEmbeddingPreference(database, 7), {
        optedOut: true,
        revision: 1,
        updatedAt: 3_000
    });
    assert.equal(database.select().from(userMessageEmbeddingProfiles).all().length, 0);
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 1,
            embedding: [100, 100],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 3_500,
            decayHalfLifeMs: halfLifeMs
        }),
        false
    );

    const optIn = optInMessageEmbedding(database, 7, 4_000);
    assert.equal(optIn.alreadyOptedIn, false);
    assert.equal(optIn.revision, 2);
    assert.deepEqual(getMessageEmbeddingPreference(database, 7), {
        optedOut: false,
        revision: 2,
        updatedAt: 4_000
    });
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 0,
            embedding: [100, 100],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 4_500,
            decayHalfLifeMs: halfLifeMs
        }),
        false
    );
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 2,
            embedding: [6, 12],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 5_000,
            decayHalfLifeMs: halfLifeMs
        }),
        true
    );

    const resumedProfile = database
        .select()
        .from(userMessageEmbeddingProfiles)
        .where(eq(userMessageEmbeddingProfiles.userId, 7))
        .get();
    assert.ok(resumedProfile);
    assert.deepEqual(decodeVector(resumedProfile.featureVector), [2, 4]);

    const userSummary = getUserMessageEmbeddingSummary(database, 7);
    assert.ok(userSummary);
    assert.equal(userSummary.model, 'test-model');
    assert.equal(userSummary.dimensions, 2);
    assert.equal(userSummary.effectiveWeight, 1);
    assert.equal(userSummary.updatedAt, 5_000);
    assert.deepEqual(userSummary.preview, [2, 4]);
    assert.equal(userSummary.componentMean, 3);
    assert.equal(userSummary.minimum, 2);
    assert.equal(userSummary.maximum, 4);
    assert.ok(Math.abs(userSummary.l2Norm - Math.sqrt(20)) < 1e-9);

    const summary = getGroupMessageEmbeddingSummary(database, 100);
    assert.ok(summary);
    assert.equal(summary.model, 'test-model');
    assert.equal(summary.sampleCount, 3);
    assert.equal(summary.dimensions, 2);
    assert.equal(summary.updatedAt, 5_000);
    assert.deepEqual(summary.preview, [4, 8]);
    assert.equal(summary.componentMean, 6);
    assert.equal(summary.minimum, 4);
    assert.equal(summary.maximum, 8);
    assert.ok(Math.abs(summary.l2Norm - Math.sqrt(80)) < 1e-9);
});

test('author guesses rank current group members in the active embedding space', t => {
    const sqlite = new Database(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(`
        CREATE TABLE group_message_embedding_means (
            group_id INTEGER PRIMARY KEY NOT NULL,
            space_key TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            mean_vector BLOB NOT NULL,
            sample_count INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE user_message_embedding_profiles (
            user_id INTEGER PRIMARY KEY NOT NULL,
            space_key TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            feature_vector BLOB NOT NULL,
            effective_weight REAL NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);
    const database = drizzle(sqlite, { schema });
    const spaceKey = 'https://embedding.example/v1\u0000test-model';
    database
        .insert(groupMessageEmbeddingMeans)
        .values({
            groupId: 100,
            spaceKey,
            dimensions: 2,
            meanVector: encodeVector([0, 0]),
            sampleCount: 9,
            updatedAt: 1_000
        })
        .run();
    database
        .insert(userMessageEmbeddingProfiles)
        .values([
            {
                userId: 7,
                spaceKey,
                dimensions: 2,
                featureVector: encodeVector([1, 0]),
                effectiveWeight: 4,
                updatedAt: 1_000
            },
            {
                userId: 8,
                spaceKey,
                dimensions: 2,
                featureVector: encodeVector([0.8, 0.2]),
                effectiveWeight: 3,
                updatedAt: 1_000
            },
            {
                userId: 9,
                spaceKey,
                dimensions: 2,
                featureVector: encodeVector([0, 0]),
                effectiveWeight: 2,
                updatedAt: 1_000
            },
            {
                userId: 10,
                spaceKey: 'https://embedding.example/v1\u0000other-model',
                dimensions: 2,
                featureVector: encodeVector([1, 0]),
                effectiveWeight: 8,
                updatedAt: 1_000
            },
            {
                userId: 11,
                spaceKey,
                dimensions: 2,
                featureVector: encodeVector([1, 0]),
                effectiveWeight: 1,
                updatedAt: 1_000
            }
        ])
        .run();
    const unfilteredGuessOptions = {
        queryTimestamp: 1_000,
        decayHalfLifeMs: 1_000,
        minimumEffectiveWeight: 0
    };

    const guess = guessMessageEmbeddingAuthor(database, 100, [8, 7, 9, 10], [1, 0], spaceKey, unfilteredGuessOptions);
    assert.ok(guess);
    assert.equal(guess.userId, 7);
    assert.equal(guess.similarity, 1);
    assert.equal(guess.effectiveWeight, 4);
    const runnerUpSimilarity = 0.8 / Math.sqrt(0.8 ** 2 + 0.2 ** 2);
    const expectedConfidence = 1 / (1 + Math.exp((runnerUpSimilarity - 1) / 0.1));
    assert.ok(Math.abs((guess.runnerUpSimilarity ?? 0) - runnerUpSimilarity) < 1e-6);
    assert.ok(Math.abs((guess.similarityMargin ?? 0) - (1 - runnerUpSimilarity)) < 1e-6);
    assert.equal(guess.candidateCount, 2);
    assert.ok(Math.abs((guess.relativeConfidence ?? 0) - expectedConfidence) < 1e-6);

    const tiedGuess = guessMessageEmbeddingAuthor(database, 100, [11, 7], [1, 0], spaceKey, unfilteredGuessOptions);
    assert.ok(tiedGuess);
    assert.equal(tiedGuess.userId, 7);
    assert.equal(tiedGuess.runnerUpSimilarity, 1);
    assert.equal(tiedGuess.similarityMargin, 0);
    assert.equal(tiedGuess.candidateCount, 2);
    assert.equal(tiedGuess.relativeConfidence, 0.5);

    const singleCandidateGuess = guessMessageEmbeddingAuthor(
        database,
        100,
        [8],
        [1, 0],
        spaceKey,
        unfilteredGuessOptions
    );
    assert.ok(singleCandidateGuess);
    assert.equal(singleCandidateGuess.candidateCount, 1);
    assert.equal(singleCandidateGuess.runnerUpSimilarity, null);
    assert.equal(singleCandidateGuess.similarityMargin, null);
    assert.equal(singleCandidateGuess.relativeConfidence, null);

    const thresholdedGuess = guessMessageEmbeddingAuthor(database, 100, [8, 7, 11], [1, 0], spaceKey, {
        queryTimestamp: 1_000,
        decayHalfLifeMs: 1_000,
        minimumEffectiveWeight: 3.5
    });
    assert.ok(thresholdedGuess);
    assert.equal(thresholdedGuess.userId, 7);
    assert.equal(thresholdedGuess.candidateCount, 1);
    assert.equal(thresholdedGuess.effectiveWeight, 4);

    const decayedGuess = guessMessageEmbeddingAuthor(database, 100, [8, 7], [1, 0], spaceKey, {
        queryTimestamp: 2_000,
        decayHalfLifeMs: 1_000,
        minimumEffectiveWeight: 1.75
    });
    assert.ok(decayedGuess);
    assert.equal(decayedGuess.userId, 7);
    assert.equal(decayedGuess.candidateCount, 1);
    assert.ok(Math.abs(decayedGuess.effectiveWeight - 2) < 1e-9);
    assert.equal(
        guessMessageEmbeddingAuthor(database, 100, [7], [1, 0], spaceKey, {
            queryTimestamp: 3_000,
            decayHalfLifeMs: 1_000,
            minimumEffectiveWeight: 1.1
        }),
        null
    );

    assert.equal(guessMessageEmbeddingAuthor(database, 100, [9, 10], [1, 0], spaceKey, unfilteredGuessOptions), null);
    assert.equal(guessMessageEmbeddingAuthor(database, 100, [7], [0, 0], spaceKey, unfilteredGuessOptions), null);
    assert.equal(
        guessMessageEmbeddingAuthor(
            database,
            100,
            [7],
            [1, 0],
            'https://embedding.example/v1\u0000other-model',
            unfilteredGuessOptions
        ),
        null
    );
});

test('embedding cutoff timestamps accept Shanghai time, explicit ISO time, and Unix timestamps', () => {
    assert.equal(parseEmbeddingCutoffTimestamp('2026-08-30 08:00:00'), Date.UTC(2026, 7, 30, 0, 0, 0));
    assert.equal(parseEmbeddingCutoffTimestamp('2026-08-30T00:00:00Z'), Date.UTC(2026, 7, 30, 0, 0, 0));
    assert.equal(parseEmbeddingCutoffTimestamp('1788048000'), 1_788_048_000_000);
    assert.equal(parseEmbeddingCutoffTimestamp('1788048000000'), 1_788_048_000_000);
    assert.equal(parseEmbeddingCutoffTimestamp('2026-02-30'), null);
    assert.equal(parseEmbeddingCutoffTimestamp('12345678901'), null);
});

test('one-time notices and inactive opt-outs use receipt-time speech activity', t => {
    const sqlite = new Database(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(`
        CREATE TABLE user_message_embedding_profiles (
            user_id INTEGER PRIMARY KEY NOT NULL,
            space_key TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            feature_vector BLOB NOT NULL,
            effective_weight REAL NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE message_embedding_preferences (
            user_id INTEGER PRIMARY KEY NOT NULL,
            opted_out INTEGER NOT NULL,
            revision INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            notice_sent_at INTEGER,
            last_spoke_at INTEGER
        );
    `);
    const database = drizzle(sqlite, { schema });
    const spaceKey = 'https://embedding.example/v1\u0000test-model';

    touchMessageEmbeddingLastSpokeAt(database, 7, 1_000);
    touchMessageEmbeddingLastSpokeAt(database, 8, 3_000);
    touchMessageEmbeddingLastSpokeAt(database, 9, 1_000);
    touchMessageEmbeddingLastSpokeAt(database, 10, 1_000);
    touchMessageEmbeddingLastSpokeAt(database, 11, 2_000);
    optOutMessageEmbedding(database, 10, 1_500);
    touchMessageEmbeddingLastSpokeAt(database, 10, 4_000);
    database
        .insert(userMessageEmbeddingProfiles)
        .values([
            {
                userId: 7,
                spaceKey,
                dimensions: 2,
                featureVector: encodeVector([1, 0]),
                effectiveWeight: 2,
                updatedAt: 1_000
            },
            {
                userId: 8,
                spaceKey,
                dimensions: 2,
                featureVector: encodeVector([0, 1]),
                effectiveWeight: 2,
                updatedAt: 500
            }
        ])
        .run();

    assert.equal(optOutInactiveMessageEmbeddingUsers(database, 2_000, 5_000), 2);
    assert.deepEqual(
        database.select({ userId: userMessageEmbeddingProfiles.userId }).from(userMessageEmbeddingProfiles).all(),
        [{ userId: 8 }]
    );

    const preference = (userId: number) =>
        database.select().from(messageEmbeddingPreferences).where(eq(messageEmbeddingPreferences.userId, userId)).get();
    assert.deepEqual(
        [7, 8, 9, 10, 11].map(userId => {
            const row = preference(userId);
            assert.ok(row);
            return {
                userId,
                optedOut: row.optedOut,
                revision: row.revision,
                noticeSentAt: row.noticeSentAt,
                lastSpokeAt: row.lastSpokeAt
            };
        }),
        [
            { userId: 7, optedOut: true, revision: 1, noticeSentAt: null, lastSpokeAt: null },
            { userId: 8, optedOut: false, revision: 0, noticeSentAt: null, lastSpokeAt: 3_000 },
            { userId: 9, optedOut: true, revision: 1, noticeSentAt: null, lastSpokeAt: null },
            { userId: 10, optedOut: true, revision: 1, noticeSentAt: 1_500, lastSpokeAt: null },
            { userId: 11, optedOut: false, revision: 0, noticeSentAt: null, lastSpokeAt: 2_000 }
        ]
    );

    assert.deepEqual(claimMessageEmbeddingNotice(database, 7, 6_000), { optedOut: true, claimedAt: 6_000 });
    assert.equal(releaseMessageEmbeddingNoticeClaim(database, 7, 6_000), true);
    assert.deepEqual(claimMessageEmbeddingNotice(database, 7, 7_000), { optedOut: true, claimedAt: 7_000 });
    assert.equal(claimMessageEmbeddingNotice(database, 7, 8_000), null);
    assert.deepEqual(claimMessageEmbeddingNotice(database, 8, 6_000), { optedOut: false, claimedAt: 6_000 });
    assert.equal(claimMessageEmbeddingNotice(database, 8, 7_000), null);
    assert.equal(claimMessageEmbeddingNotice(database, 10, 6_000), null);

    touchMessageEmbeddingLastSpokeAt(database, 7, 9_000);
    assert.equal(preference(7)?.lastSpokeAt, null);
});
