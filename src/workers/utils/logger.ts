/**
 * Simple logger utility for consistent logging across workers and processors
 * Can be replaced with a proper logging library (winston, pino) later
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const LOG_PREFIX = {
    producer: '📤 [Producer]',
    consumer: '📥 [Consumer]',
    cron: '⏰ [Cron]',
    worker: '🚀 [Worker]',
    emailProcessor: '📧 [EmailProcessor]',
    whatsappProcessor: '💬 [WhatsAppProcessor]',
    delayedWorker: '⏰ [DelayedWorker]',
    redis: '🔴 [Redis]'
} as const;

type LogContext = keyof typeof LOG_PREFIX;

const formatMessage = (context: LogContext, message: string): string => {
    return `${LOG_PREFIX[context]} ${message}`;
};

export const createLogger = (context: LogContext) => ({
    info: (message: string, ...args: unknown[]) => {
        console.log(formatMessage(context, message), ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
        console.warn(formatMessage(context, `⚠️ ${message}`), ...args);
    },
    error: (message: string, ...args: unknown[]) => {
        console.error(formatMessage(context, `❌ ${message}`), ...args);
    },
    debug: (message: string, ...args: unknown[]) => {
        if (process.env.DEBUG === 'true') {
            console.debug(formatMessage(context, `🔍 ${message}`), ...args);
        }
    },
    success: (message: string, ...args: unknown[]) => {
        console.log(formatMessage(context, `✅ ${message}`), ...args);
    }
});

// Pre-configured loggers for each context
export const producerLogger = createLogger('producer');
export const consumerLogger = createLogger('consumer');
export const cronLogger = createLogger('cron');
export const workerLogger = createLogger('worker');
export const emailProcessorLogger = createLogger('emailProcessor');
export const whatsappProcessorLogger = createLogger('whatsappProcessor');
export const delayedWorkerLogger = createLogger('delayedWorker');
export const redisLogger = createLogger('redis');
