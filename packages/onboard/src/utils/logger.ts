import chalk from 'chalk';
import { appendFile as fsAppendFile } from 'fs/promises';
import path from 'path';
import { FILES } from '../config/constants.js';

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
        console.log(chalk.gray(`🔧 ${message}`));
    }
    writeToLogFile('debug', message);
}

/**
 * Log verbose message (shown with --verbose or --debug)
 */
export function logVerbose(message: string): void {
    if (loggerConfig.verbose || loggerConfig.debug) {
        console.log(chalk.cyan(`ℹ️  ${message}`));
    }
    writeToLogFile('info', message);
}

/**
 * Log info message (always displayed)
 */
export function logInfo(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
    writeToLogFile('info', message);
}

/**
 * Log success message (always displayed)
 */
export function logSuccess(message: string): void {
    console.log(chalk.green(`✅ ${message}`));
    writeToLogFile('info', message);
}

/**
 * Log warning message (always displayed)
 */
export function logWarning(message: string): void {
    console.log(chalk.yellow(`⚠️  ${message}`));
    writeToLogFile('warn', message);
}

/**
 * Log error message (always displayed)
 */
export function logError(message: string): void {
    console.log(chalk.red(`❌ ${message}`));
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
