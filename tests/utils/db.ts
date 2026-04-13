/**
 * Database Test Utilities
 * Provides in-memory MongoDB replica set for isolated testing with transaction support
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoReplSet: MongoMemoryReplSet | null = null;

function getExternalTestMongoUri(): string | null {
    const uri = process.env.TEST_MONGO_URI?.trim();
    return uri ? uri : null;
}

/**
 * Connect to an in-memory MongoDB replica set
 * Used for integration tests that need real database operations including transactions
 */
export const connectTestDb = async (): Promise<typeof mongoose> => {
    // Disconnect existing connection if any
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    const externalUri = getExternalTestMongoUri();
    if (externalUri) {
        await mongoose.connect(externalUri);
        return mongoose;
    }

    mongoReplSet = await MongoMemoryReplSet.create({
        binary: {
            version: process.env.MONGOMS_VERSION || '7.0.14',
        },
        replSet: {
            count: 1, // Single node replica set for testing
            storageEngine: 'wiredTiger',
            dbName: 'simplens_test', // Use a consistent database name
        },
    });

    // Wait for replica set to be fully running and stable
    await mongoReplSet.waitUntilRunning();

    const uri = mongoReplSet.getUri('simplens_test');

    // Connect without directConnection to allow replica set operations
    await mongoose.connect(uri);

    return mongoose;
};

/**
 * Disconnect from the in-memory MongoDB and stop the server
 */
export const disconnectTestDb = async (): Promise<void> => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    if (mongoReplSet) {
        await mongoReplSet.stop();
        mongoReplSet = null;
    }
};

/**
 * Clear all collections in the test database
 * Useful for resetting state between tests
 */
export const clearTestDb = async (): Promise<void> => {
    if (mongoose.connection.readyState === 0) {
        return;
    }

    const collections = mongoose.connection.collections;

    for (const key in collections) {
        await collections[key].deleteMany({});
    }
};

/**
 * Drop all collections in the test database
 * More aggressive cleanup than clearTestDb
 */
export const dropTestDb = async (): Promise<void> => {
    if (mongoose.connection.readyState === 0) {
        return;
    }

    const collections = mongoose.connection.collections;

    for (const key in collections) {
        try {
            await collections[key].drop();
        } catch {
            // Collection might not exist, ignore
        }
    }
};

/**
 * Check if connected to test database
 */
export const isTestDbConnected = (): boolean => {
    return mongoose.connection.readyState === 1;
};
