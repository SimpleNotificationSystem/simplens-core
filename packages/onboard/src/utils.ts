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

const MAX_TUI_WIDTH = 78;
const MIN_TUI_WIDTH = 52;

type AccentColor = 'blue' | 'cyan' | 'green' | 'yellow' | 'red' | 'gray';

function getTerminalWidth(): number {
    const columns = process.stdout.columns ?? MAX_TUI_WIDTH;
    return Math.max(MIN_TUI_WIDTH, Math.min(MAX_TUI_WIDTH, columns));
}

function accent(text: string, color: AccentColor): string {
    switch (color) {
        case 'blue':
            return chalk.blueBright(text);
        case 'cyan':
            return chalk.cyanBright(text);
        case 'green':
            return chalk.greenBright(text);
        case 'yellow':
            return chalk.yellowBright(text);
        case 'red':
            return chalk.redBright(text);
        case 'gray':
        default:
            return chalk.gray(text);
    }
}

export function divider(color: AccentColor = 'gray', char: string = '─'): string {
    return accent(char.repeat(getTerminalWidth()), color);
}

export function printStepHeader(step: number, total: number, title: string): void {
    const filled = '■'.repeat(Math.max(0, step));
    const empty = '·'.repeat(Math.max(0, total - step));
    const progress = chalk.gray(`${filled}${empty}`);

    console.log(`\n${divider()}`);
    console.log(`${accent(`[${step}/${total}]`, 'cyan')} ${chalk.whiteBright(title)} ${progress}`);
    console.log(divider());
}

export function printSummaryCard(
    title: string,
    rows: Array<{ label: string; value: string }>
): void {
    const labelWidth = Math.max(...rows.map(row => row.label.length), 0);

    console.log(`\n${accent(title, 'cyan')}`);
    console.log(divider());
    for (const row of rows) {
        const label = chalk.gray(row.label.padEnd(labelWidth));
        console.log(`${label}  ${chalk.white(row.value)}`);
    }
    console.log(`${divider()}\n`);
}

export function printCommandHints(title: string, commands: string[]): void {
    console.log(accent(title, 'cyan'));
    for (const command of commands) {
        console.log(`  ${accent('›', 'gray')} ${chalk.white(command)}`);
    }
    console.log('');
}

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

    console.log('');
    console.log(divider('blue', '═'));
    console.log(chalk.blueBright(simpleNS));
    console.log(chalk.cyanBright(onboard));
    console.log(chalk.gray('SimpleNS local setup assistant'));
    console.log(divider('blue', '═'));
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
