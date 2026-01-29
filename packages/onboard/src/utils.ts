import chalk from 'chalk';
import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import figlet from 'figlet';

// Re-export logger functions for backward compatibility
export {
    logSuccess,
    logError,
    logWarning,
    logInfo,
    logDebug,
    logVerbose,
    logCommand,
    logFileOperation,
    initLogger,
    getLoggerConfig,
} from './utils/logger.js';

/**
 * Display SimpleNS banner in blue using figlet
 */
export function displayBanner(): void {
    const simpleNS = figlet.textSync('SimpleNS', {
        font: 'Standard',
        horizontalLayout: 'default',
    });
    
    const onboard = figlet.textSync('Onboard', {
        font: 'Standard',
        horizontalLayout: 'default',
    });

    console.log(chalk.blue(simpleNS));
    console.log(chalk.blue(onboard));
    console.log('');
}

/**
 * Execute a shell command with error handling
 */
export async function executeCommand(
    command: string,
    args: string[],
    options?: { cwd?: string; silent?: boolean }
): Promise<{ stdout: string; stderr: string }> {
    // Import dynamically to avoid circular dependency
    const { logCommand } = await import('./utils/logger.js');
    
    logCommand(command, args);
    
    try {
        const result = await execa(command, args, {
            cwd: options?.cwd || process.cwd(),
            stdio: options?.silent ? 'pipe' : 'inherit',
        });
        return { stdout: result.stdout, stderr: result.stderr };
    } catch (error: any) {
        throw new Error(`Command failed: ${command} ${args.join(' ')}\n${error.message}`);
    }
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Write file content
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
    const { logFileOperation } = await import('./utils/logger.js');
    
    logFileOperation('Writing file', filePath);
    
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read file content
 */
export async function readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
}

/**
 * Append content to file
 */
export async function appendFile(filePath: string, content: string): Promise<void> {
    // Ensure parent directory exists, similar to writeFile
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.appendFile(filePath, content, 'utf-8');
}
