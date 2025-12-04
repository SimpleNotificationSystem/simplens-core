import dotenv from 'dotenv';

dotenv.config();

export const env = {
    MONGO_URI:<string>process.env.MONGO_URI || "mongodb://127.0.0.1:27017/notification_service",
    PORT:<number>parseInt(process.env.PORT || "3000"),
    NS_API_KEY:<string>process.env.NS_API_KEY || "4YCItWcuH2qJe3bXM9LbsbqefflWFlXlzvneMRSSQhU=",
    MAX_BATCH_REQ_LIMIT:<number>parseInt(process.env.MAX_BATCH_REQ_LIMIT || "1000")
}