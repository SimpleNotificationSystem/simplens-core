/**
 * Utility functions for logging, banner display, and console output
 */

import chalk from 'chalk';
import figlet from 'figlet';

type AccentColor = 'blue' | 'cyan' | 'green' | 'yellow' | 'red' | 'gray';

const MAX_TUI_WIDTH = 78;
const MIN_TUI_WIDTH = 52;

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

/**
 * Display SimpleNS Create Plugin banner
 */
export function displayBanner(): void {
    const create = figlet.textSync('Create', {
        font: 'Standard',
        horizontalLayout: 'default',
    });
    
    const plugin = figlet.textSync('Plugin', {
        font: 'Standard',
        horizontalLayout: 'default',
    });

    console.log('');
    console.log(divider('blue', '═'));
    console.log(chalk.blueBright(create));
    console.log(chalk.cyanBright(plugin));
    console.log(chalk.gray('SimpleNS plugin scaffolding tool'));
    console.log(divider('blue', '═'));
    console.log('');
}

/**
 * Format tag for log messages
 */
function formatTag(tag: string, color: (text: string) => string): string {
    return color(`[${tag.toUpperCase().padEnd(7)}]`);
}

/**
 * Log success message
 */
export function logSuccess(message: string): void {
    console.log(`${formatTag('ok', chalk.greenBright)} ${message}`);
}

/**
 * Log info message
 */
export function logInfo(message: string): void {
    console.log(`${formatTag('info', chalk.blueBright)} ${message}`);
}

/**
 * Log warning message
 */
export function logWarning(message: string): void {
    console.log(`${formatTag('warn', chalk.yellowBright)} ${message}`);
}

/**
 * Log error message
 */
export function logError(message: string): void {
    console.log(`${formatTag('error', chalk.redBright)} ${message}`);
}

/**
 * Print command hints
 */
export function printCommandHints(title: string, commands: string[]): void {
    console.log(accent(title, 'cyan'));
    for (const command of commands) {
        console.log(`  ${accent('›', 'gray')} ${chalk.white(command)}`);
    }
    console.log('');
}
