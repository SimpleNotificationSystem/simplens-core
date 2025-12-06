/**
 * MongoDB connection for the dashboard
 * Connects to the same database as the notification service
 */

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI ||
    'mongodb://localhost:27017/notification_service?replicaSet=rs0';

interface CachedConnection {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

declare global {
    // eslint-disable-next-line no-var
    var mongoose: CachedConnection | undefined;
}

const cached: CachedConnection = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
    global.mongoose = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGO_URI, opts).then((mongoose) => {
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}
