import mongoose from "mongoose";
import { env } from "./env.config.js";

export const connectMongoDB = async ()=>{
    try{
        await mongoose.connect(env.MONGO_URI);
    }
    catch(err){
        console.log("Error connecting to the database");
    }
}