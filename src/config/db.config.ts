import mongoose from "mongoose";
import { env } from "./env.config.js";
import { apiLogger as logger } from "@src/workers/utils/logger.js";

export const connectMongoDB = async ()=>{
    try{
        const db = await mongoose.connect(env.MONGO_URI);
        await db.connection.syncIndexes();
        logger.info("MongoDB indexes synced");
        
        return db;
    }
    catch(err){
        logger.error(`Error connecting to the database`, err);
        throw new Error("Error connecting to mongoDB");
    }
}

