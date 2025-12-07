/**
 * Database Test Utilities
 * Provides in-memory MongoDB for isolated testing
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer | null = null;

/**
 * Connect to an in-memory MongoDB instance
 * Used for integration tests that need real database operations
 */
export const connectTestDb = async (): Promise<typeof mongoose> => {
    // Disconnect existing connection if any
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

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

    if (mongoServer) {
        await mongoServer.stop();
        mongoServer = null;
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
