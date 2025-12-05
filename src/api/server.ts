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
import { createTopics } from '@src/config/kafka.config.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

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

// Health check endpoint for Docker/Kubernetes
app.get("/health", (req: Request, res: Response)=>{
    res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString()
    });
    return;
});

app.use('/notification', auth_middleware, notification_router);

const start_server = async ()=>{
    try{
        const db = await connectMongoDB();
        logger.success("Successfully connected to MongoDB");
        // temporarily topic creation is performed here.
        await createTopics([
            { topic: 'email_notification', numPartitions: 2, replicationFactor: 1 },
            { topic: 'whatsapp_notification', numPartitions: 2, replicationFactor: 1 },
            { topic: 'delayed_notification', numPartitions: 2, replicationFactor: 1 },
            { topic: 'notification_status', numPartitions: 2, replicationFactor: 1 }
        ]);
        const server = http.createServer(app);
        server.listen(env.PORT, () => logger.success(`Notification Service running at http://localhost:${env.PORT}`));
        server.on('error', (err) => {
            logger.error('Server error:', err);
        });
        const gracefulShutdown = async (err?: Error, reason?: string) => {
            logger.error('Shutting down server', { reason: reason ?? '', error: err?.message ?? '' });
            try {
                server?.close(() => {
                logger.info('HTTP server closed');
                });
                await db.disconnect();
            } catch (e) {
                logger.error('Error during graceful shutdown', e);
            } finally {
                process.exit(1);
            }
        };

        process.on('uncaughtException', (err) => {
            logger.error('Uncaught exception:', err);
            gracefulShutdown(err, 'uncaughtException');
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled rejection:', reason);
            gracefulShutdown(undefined, 'unhandledRejection');
        });

        server.on('error', (err) => {
            logger.error('Server error:', err);
            gracefulShutdown(err, 'serverError');
        });
    }
    catch(err){
        logger.error(`Error in connecting to MongoDB`, err);
        exit(1);
    }
}

await start_server();