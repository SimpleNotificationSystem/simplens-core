import express from 'express';
import type { Request, Response } from 'express';
import { env } from '@src/config/env.config.js';
import { connectMongoDB } from '@src/config/db.config.js';
import { exit } from 'process';
import notification_router from './routes/notification.routes.js';
import plugins_router from './routes/plugins.routes.js';
import { auth_middleware } from './middlewares/auth_middleware.js';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import { createTopics } from '@src/config/kafka.config.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';
import { buildKafkaTopics } from '@src/config/kafka.config.js';
import { loadProvidersFromEnv } from '@src/plugins/index.js';

const app = express();

//implement rate limiter with REDIS later

app.use(express.json({ limit: '1mb' }));

app.use(helmet());

app.use(cors({ origin: "*" })); //allows all origins

app.get("/", (req: Request, res: Response) => {
    res.json({
        info: "Notification Service is running"
    });
    return;
});

// Health check endpoint for Docker/Kubernetes
app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString()
    });
    return;
});

app.use('/api/notification', auth_middleware, notification_router);
app.use('/api/plugins', plugins_router);

const start_server = async () => {
    try {
        const db = await connectMongoDB();
        logger.success("Successfully connected to MongoDB");

        // Load plugins from simplens.config.yaml
        // Initialize: false is important here because the API service doesn't need to connect to providers (e.g. SMTP),
        // it only needs the metadata/schemas to serve the dashboard.
        logger.info('Loading plugins from configuration (metadata only)...');
        await loadProvidersFromEnv({ initialize: false });

        // Create Kafka topics dynamically from config
        const topics = buildKafkaTopics();
        await createTopics(topics);

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
    catch (err) {
        logger.error(`Error in connecting to MongoDB`, err);
        exit(1);
    }
}

await start_server();