import mongoose from "mongoose";
import { env } from "./env.config.js";

export const connectMongoDB = async ()=>{
    try{
        const db = await mongoose.connect(env.MONGO_URI);
        return db;
    }
    catch(err){
        console.log(`Error connecting to the database, ${err}`);
        throw new Error("Error connecting to mongoDB");
    }
}

