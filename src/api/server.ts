import express from 'express';
import type {Request, Response} from 'express';
import { env } from '@src/config/env.config.js';
import { connectMongoDB } from '@src/config/db.config.js';
import { exit } from 'process';
import notification_router from './routes/notification.routes.js';
import { auth_middleware } from './middlewares/auth_middleware.js';

const app = express();

app.use(express.json());

app.get("/", (req: Request, res: Response)=>{
    res.json({
        info: "Notification Service is running"
    });
    return;
});

app.use('/notification', auth_middleware, notification_router);

const start_server = async ()=>{
    try{
        await connectMongoDB();
        console.log("Sucessfully Connected to mongoDB");
        const server = app.listen(env.PORT, ()=>console.log(`Notification Service running at http://localhost:${env.PORT}`));
        
        server.on('error', (err) => {
            console.error('Server error:', err);
        });
        
        process.on('uncaughtException', (err) => {
            console.error('Uncaught exception:', err);
        });
        
        process.on('unhandledRejection', (reason) => {
            console.error('Unhandled rejection:', reason);
        });
    }catch(err){
        console.log(`Error in connecting to mongoDB: ${JSON.stringify(err)}`);
        exit(1);
    }
}

await start_server();