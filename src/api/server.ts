import express from 'express';
import type {Request, Response} from 'express';
import { env } from '@src/config/env.config.js';
import { connectMongoDB } from '@src/config/db.config.js';
import { exit } from 'process';
import notification_router from './routes/notification.routes.js';
import { auth_middleware } from './middlewares/auth_middleware.js';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

//implement rate limiter with REDIS later

app.use(express.json({ limit: '1mb' }));

app.use(helmet());

app.use(cors({origin: "*"})); //allows all origins

app.get("/", (req: Request, res: Response)=>{
    res.json({
        info: "Notification Service is running"
    });
    return;
});

app.use('/notification', auth_middleware, notification_router);

const start_server = async ()=>{
    try{
        const db = await connectMongoDB();
        console.log("Sucessfully Connected to mongoDB");
        const server = http.createServer(app);
        server.listen(env.PORT, () => console.log(`Notification Service running at http://localhost:${env.PORT}`));
        server.on('error', (err) => {
            console.error('Server error:', err);
        });
        const gracefulShutdown = async (err?: Error, reason?: string) => {
            console.error('Shutting down server', reason ?? '', err ?? '');
            try {
                server?.close(() => {
                console.log('HTTP server closed');
                });
                await db.disconnect();
            } catch (e) {
                console.error('Error during graceful shutdown', e);
            } finally {
                process.exit(1);
            }
        };

        process.on('uncaughtException', (err) => {
            console.error('Uncaught exception:', err);
            gracefulShutdown(err, 'uncaughtException');
        });

        process.on('unhandledRejection', (reason) => {
            console.error('Unhandled rejection:', reason);
            gracefulShutdown(undefined, 'unhandledRejection');
        });

        server.on('error', (err) => {
            console.error('Server error:', err);
            gracefulShutdown(err, 'serverError');
        });
    }
    catch(err){
        console.log(`Error in connecting to mongoDB: ${JSON.stringify(err)}`);
        exit(1);
    }
}

await start_server();