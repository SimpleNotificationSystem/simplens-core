import express from 'express';
import type { Request, Response } from 'express';
import { env } from '@src/config/env.config.js';
import { connectMongoDB } from '@src/config/db.config.js';
import { connectRedis } from '@src/config/redis.config.js';
import { exit } from 'process';
import notification_router from './routes/notification.routes.js';
import plugins_router from './routes/plugins.routes.js';
import providers_router from './routes/providers.routes.js';
import channel_routing_router from './routes/channel-routing.routes.js';
import admin_channels_router from './routes/admin-channels.routes.js';
import notification_templates_router from '@src/api/routes/notification_templates.routes.js';
import notifications_management_router from './routes/notifications-management.routes.js';
import alerts_router from './routes/alerts.routes.js';
import dashboard_router from './routes/dashboard.routes.js';
import settings_router from './routes/settings.routes.js';
import admin_auth_router from './routes/admin-auth.routes.js';
import api_keys_router from './routes/api-key.routes.js';
import { dynamicConfig } from '@src/config/dynamic-config.service.js';
import { auth_middleware } from './middlewares/auth_middleware.js';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import { createTopics, buildKafkaTopicsFromDatabase } from '@src/config/kafka.config.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';
import {
  PluginSyncService,
  PluginManagerService,
  NpmAuthService,
  ProviderManagerService,
  ChannelRoutingService,
  YamlMigrator,
  loadProvidersFromDatabase,
} from '@src/plugins/index.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';

//Import the admin channel provider files here for them to self-register
import "@src/admin-alerts/channels/discord.channel.js";
import "@src/admin-alerts/channels/telegram.channel.js";

const app = express();

//implement rate limiter with REDIS later

app.use(express.json({ limit: '1mb' }));

app.use(helmet());

app.use(cors({
    origin: true,
    credentials: true,
}));

app.get("/api", (req: Request, res: Response) => {
    res.json({
        info: "Notification Service is running"
    });
    return;
});

// Health check endpoint for Docker/Kubernetes
app.get("/api/health", (req: Request, res: Response) => {
    res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString()
    });
    return;
});

app.use('/api/notification', auth_middleware, notification_router);
app.use('/api/notifications', auth_middleware, notifications_management_router);
app.use('/api/alerts', auth_middleware, alerts_router);
app.use('/api/dashboard', auth_middleware, dashboard_router);
app.use('/api/plugins', auth_middleware, plugins_router);
app.use('/api/providers', auth_middleware, providers_router);
app.use('/api/channels/routing', auth_middleware, channel_routing_router);
app.use('/api/admin-channels', auth_middleware, admin_channels_router);
app.use('/api/templates', auth_middleware, notification_templates_router);
app.use('/api/settings', auth_middleware, settings_router);
app.use('/api/keys', auth_middleware, api_keys_router);
app.use('/api/admin/auth', admin_auth_router);

const start_server = async () => {
    try {
        const db = await connectMongoDB();
        logger.success("Successfully connected to MongoDB");

        // 0. Initialize Dynamic Configuration & seed defaults into MongoDB
        await dynamicConfig.initialize(true);

        // 1. Connect Redis & initialize subscriber for plugins
        await connectRedis();
        await PluginSyncService.startSubscriber();
        NpmAuthService.registerSyncHandlers();
        await NpmAuthService.syncNpmrc();
        PluginManagerService.registerSyncHandlers();
        ProviderManagerService.registerSyncHandlers();
        ChannelRoutingService.registerSyncHandlers();

        // 2. Check if MongoDB has providers; if empty and YAML exists, migrate it
        await YamlMigrator.migrateYamlIfNeeded();

        // 3. Load provider plugins from MongoDB (metadata only for API server)
        logger.info('Loading plugins from MongoDB (metadata only)...');
        await loadProvidersFromDatabase({ initialize: false });

        // 4. Create Kafka topics dynamically from MongoDB channel routing
        const topics = await buildKafkaTopicsFromDatabase();
        await createTopics(topics);

        const server = http.createServer(app);
        server.listen(env.PORT, () => logger.success(`Notification Service running at http://localhost:${env.PORT}`));
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

            void AdminAlertService.sendAlert('service_health',
                `🔴 UNCAUGHT EXCEPTION IN API SERVER\n` +
                `Error: ${err.message}\n` +
                `Stack: ${err.stack?.split('\n').slice(0, 3).join('\n')}\n` +
                `Action: Review error handling. Check for async operations without try-catch.`,
                { severity: 'critical' });

            gracefulShutdown(err, 'uncaughtException');
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled rejection:', reason);

            void AdminAlertService.sendAlert('service_health',
                `🔴 UNHANDLED PROMISE REJECTION IN API SERVER\n` +
                `Reason: ${reason}\n` +
                `Action: Add .catch() handlers to promises. Review async/await error handling.`,
                { severity: 'critical' });

            gracefulShutdown(undefined, 'unhandledRejection');
        });

        server.on('error', (err) => {
            logger.error('Server error:', err);
            void AdminAlertService.sendAlert('service_health',
                `🔴 API SERVER ERROR\n` +
                `Error: ${err.message}\n` +
                `Port: ${env.PORT}\n` +
                `Action: Check if port is in use. Review server logs for stack trace.`,
                { severity: 'critical' });
            gracefulShutdown(err, 'serverError');
        });
    }
    catch (err) {
        logger.error(`Error in initializing api server:`, err);
        exit(1);
    }
}

await start_server();