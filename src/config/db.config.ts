import mongoose from "mongoose";
import { env } from "./env.config.js";
import { apiLogger as logger } from "@src/workers/utils/logger.js";
import { AdminAlertService } from "@src/admin-alerts/admin-alert.service.js";

export const connectMongoDB = async ()=>{
    try{
        const db = await mongoose.connect(env.MONGO_URI);
        await db.connection.syncIndexes();
        logger.info("MongoDB indexes synced");
        
        return db;
    }
    catch(err){
        logger.error(`Error connecting to the database`, err);

        void AdminAlertService.sendAlert('service_health',
            `🔴 MONGODB CONNECTION FAILED\n` +
            `Error: ${err instanceof Error ? err.message : 'Unknown error'}\n` +
            `MONGO_URI: ${env.MONGO_URI.replace(/:[^:@]+@/, ':***@')}\n` +
            `Action: Verify MongoDB is running. Check MONGO_URI env var. Test with mongosh.`,
            { severity: 'critical' });

        throw new Error("Error connecting to mongoDB");
    }
}

