/**
 * Centralized UI helpers — themed intro/outro and cancellation handling.
 * 
 * NOTE: Individual @clack/prompts functions (text, confirm, select, etc.)
 * should be imported directly from '@clack/prompts' in each consumer file.
 * Re-exporting from here causes TypeScript resolution issues with .d.mts types.
 */

import { intro as clackIntro, outro as clackOutro, cancel as clackCancel, isCancel } from '@clack/prompts';
import chalk from 'chalk';

/**
 * Themed intro — blue bar
 */
export function intro(title?: string): void {
    clackIntro(chalk.bgBlueBright.black(` ${title ?? ''} `));
}

/**
 * Themed outro — blue text
 */
export function outro(message?: string): void {
    clackOutro(chalk.blueBright(message ?? 'Done'));
}

/**
 * Handle user cancellation (Ctrl-C) for any prompt value.
 * Exits the process with code 0 after printing a message.
 */
export function handleCancel(value: unknown, message = 'Setup cancelled.'): void {
    if (isCancel(value)) {
        clackCancel(chalk.blueBright(message));
        process.exit(0);
    }
}
