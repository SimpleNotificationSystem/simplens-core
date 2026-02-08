import chalk from 'chalk';
import { appendFile as fsAppendFile } from 'fs/promises';

/**
 * Logging level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger configuration
 */
interface LoggerConfig {
    verbose: boolean;
    debug: boolean;
    logFile?: string;
}

let loggerConfig: LoggerConfig = {
    verbose: false,
    debug: false,
};

function formatTag(tag: string, color: (text: string) => string): string {
    return color(`[${tag.toUpperCase().padEnd(7)}]`);
}

function printLogLine(tag: 'debug' | 'info' | 'ok' | 'warn' | 'error', message: string): void {
    switch (tag) {
        case 'debug':
            console.log(`${formatTag('debug', chalk.gray)} ${chalk.gray(message)}`);
            return;
        case 'info':
            console.log(`${formatTag('info', chalk.blueBright)} ${message}`);
            return;
        case 'ok':
            console.log(`${formatTag('ok', chalk.greenBright)} ${message}`);
            return;
        case 'warn':
            console.log(`${formatTag('warn', chalk.yellowBright)} ${message}`);
            return;
        case 'error':
            console.log(`${formatTag('error', chalk.redBright)} ${message}`);
            return;
    }
}

/**
 * Initialize logger with configuration
 */
export function initLogger(config: Partial<LoggerConfig>): void {
    loggerConfig = { ...loggerConfig, ...config };
}

/**
 * Get current logger configuration
 */
export function getLoggerConfig(): Readonly<LoggerConfig> {
    return { ...loggerConfig };
}

/**
 * Write log message to file if configured
 */
async function writeToLogFile(level: LogLevel, message: string): Promise<void> {
    if (!loggerConfig.logFile) return;

    try {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
        await fsAppendFile(loggerConfig.logFile, logEntry, 'utf-8');
    } catch (error) {
        // Silently fail on log file errors
    }
}

/**
 * Log debug message (only shown with --debug flag)
 */
export function logDebug(message: string): void {
    if (loggerConfig.debug) {
        printLogLine('debug', message);
    }
    writeToLogFile('debug', message);
}

/**
 * Log verbose message (shown with --verbose or --debug)
 */
export function logVerbose(message: string): void {
    if (loggerConfig.verbose || loggerConfig.debug) {
        console.log(`${formatTag('verbose', chalk.cyanBright)} ${message}`);
    }
    writeToLogFile('info', message);
}

/**
 * Log info message (always displayed)
 */
export function logInfo(message: string): void {
    printLogLine('info', message);
    writeToLogFile('info', message);
}

/**
 * Log success message (always displayed)
 */
export function logSuccess(message: string): void {
    printLogLine('ok', message);
    writeToLogFile('info', message);
}

/**
 * Log warning message (always displayed)
 */
export function logWarning(message: string): void {
    printLogLine('warn', message);
    writeToLogFile('warn', message);
}

/**
 * Log error message (always displayed)
 */
export function logError(message: string): void {
    printLogLine('error', message);
    writeToLogFile('error', message);
}

/**
 * Log command execution (debug level)
 */
export function logCommand(command: string, args: string[]): void {
    logDebug(`Executing: ${command} ${args.join(' ')}`);
}

/**
 * Log file operation (debug level)
 */
export function logFileOperation(operation: string, filePath: string): void {
    logDebug(`${operation}: ${filePath}`);
}
