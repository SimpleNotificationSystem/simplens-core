/**
 * Logger utility with Grafana Loki integration
 * Logs to console, file, and Loki for centralized log aggregation
 */

import winston from 'winston';
import LokiTransport from 'winston-loki';
import { env } from '@src/config/env.config.js';

// Service context types
const SERVICE_LABELS = {
    api: 'api-server',
    producer: 'producer',
    consumer: 'consumer',
    cron: 'cron',
    worker: 'background-worker',
    emailProcessor: 'email-processor',
    whatsappProcessor: 'whatsapp-processor',
    delayedWorker: 'delayed-processor',
    redis: 'redis',
    recoveryService: 'recovery-service'
} as const;

type ServiceContext = keyof typeof SERVICE_LABELS;

// Log metadata interface
interface LogMeta {
    notificationId?: string;
    requestId?: string;
    clientId?: string;
    channel?: string;
    workerId?: string;
    topic?: string;
    partition?: number;
    [key: string]: unknown;
}

// Custom log levels including 'success'
const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        success: 2,
        info: 3,
        debug: 4
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        success: 'green',
        info: 'blue',
        debug: 'gray'
    }
};

// Add custom colors to winston
winston.addColors(customLevels.colors);

// Emoji prefixes for console output
const EMOJI_PREFIX: Record<string, string> = {
    error: '❌',
    warn: '⚠️',
    success: '✅',
    info: '📋',
    debug: '🔍'
};

const SERVICE_EMOJI: Record<ServiceContext, string> = {
    api: '🌐',
    producer: '📤',
    consumer: '📥',
    cron: '⏰',
    worker: '🚀',
    emailProcessor: '📧',
    whatsappProcessor: '💬',
    delayedWorker: '⏰',
    redis: '🔴',
    recoveryService: '🔄'
};

/**
 * Create console format with colors and emojis
 */
const consoleFormat = (service: ServiceContext) => winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const emoji = EMOJI_PREFIX[level] || '';
        const serviceEmoji = SERVICE_EMOJI[service];
        const serviceName = SERVICE_LABELS[service].toUpperCase();
        const metaStr = Object.keys(meta).length > 0
            ? ` ${JSON.stringify(meta)}`
            : '';
        return `${timestamp} ${serviceEmoji} [${serviceName}] ${emoji} ${message}${metaStr}`;
    })
);

/**
 * Create JSON format for file and Loki
 */
const jsonFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

/**
 * Create a logger instance for a specific service context
 */
const createWinstonLogger = (service: ServiceContext) => {
    const transports: winston.transport[] = [
        // Console transport with colors
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize({ all: true }),
                consoleFormat(service)
            )
        })
    ];

    // Add Loki transport if LOKI_URL is configured
    if (env.LOKI_URL) {
        transports.push(
            new LokiTransport({
                host: env.LOKI_URL,
                labels: {
                    job: 'notification-service',
                    service: SERVICE_LABELS[service],
                    workerId: env.WORKER_ID,
                    environment: env.NODE_ENV
                },
                json: true,
                batching: true,
                interval: 5,
                replaceTimestamp: true,
                onConnectionError: (err: Error) => {
                    console.error(`Loki connection error for ${service}:`, err.message);
                }
            })
        );
    }

    // Add file transport in production
    if (env.NODE_ENV === 'production' && env.LOG_TO_FILE) {
        transports.push(
            new winston.transports.File({
                filename: `logs/${SERVICE_LABELS[service]}.log`,
                format: jsonFormat,
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5
            }),
            new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error',
                format: jsonFormat,
                maxsize: 10 * 1024 * 1024,
                maxFiles: 5
            })
        );
    }

    return winston.createLogger({
        levels: customLevels.levels,
        level: env.LOG_LEVEL || 'info',
        defaultMeta: {
            service: SERVICE_LABELS[service],
            workerId: "worker-default"
        },
        transports
    });
};

/**
 * Logger interface matching our usage patterns
 */
interface Logger {
    info: (message: string, meta?: LogMeta) => void;
    warn: (message: string, meta?: LogMeta) => void;
    error: (message: string, meta?: LogMeta | unknown) => void;
    debug: (message: string, meta?: LogMeta) => void;
    success: (message: string, meta?: LogMeta) => void;
}

/**
 * Create a typed logger for a service context
 */
export const createLogger = (context: ServiceContext): Logger => {
    const winstonLogger = createWinstonLogger(context);

    return {
        info: (message: string, meta?: LogMeta) => {
            winstonLogger.info(message, meta);
        },
        warn: (message: string, meta?: LogMeta) => {
            winstonLogger.warn(message, meta);
        },
        error: (message: string, meta?: LogMeta | unknown) => {
            if (meta instanceof Error) {
                winstonLogger.error(message, {
                    error: meta.message,
                    stack: meta.stack
                });
            } else {
                winstonLogger.error(message, meta as LogMeta);
            }
        },
        debug: (message: string, meta?: LogMeta) => {
            winstonLogger.debug(message, meta);
        },
        success: (message: string, meta?: LogMeta) => {
            winstonLogger.log('success', message, meta);
        }
    };
};

// Pre-configured loggers for each service context
export const apiLogger = createLogger('api');
export const producerLogger = createLogger('producer');
export const consumerLogger = createLogger('consumer');
export const cronLogger = createLogger('cron');
export const workerLogger = createLogger('worker');
export const emailProcessorLogger = createLogger('emailProcessor');
export const whatsappProcessorLogger = createLogger('whatsappProcessor');
export const delayedWorkerLogger = createLogger('delayedWorker');
export const redisLogger = createLogger('redis');
export const recoveryServiceLogger = createLogger('recoveryService');

/**
 * Graceful shutdown - flush all logs before exit
 */
export const flushLogs = async (): Promise<void> => {
    // Winston-loki handles batching, give it time to flush
    return new Promise((resolve) => {
        setTimeout(resolve, 1000);
    });
};
