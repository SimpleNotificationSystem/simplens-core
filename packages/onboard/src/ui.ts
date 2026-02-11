/**
 * Centralized UI helpers — themed intro/outro and cancellation handling.
 * 
 * NOTE: Individual @clack/prompts functions (text, confirm, select, etc.)
 * should be imported directly from '@clack/prompts' in each consumer file.
 * Re-exporting from here causes TypeScript resolution issues with .d.mts types.
 */

import { intro as clackIntro, outro as clackOutro, cancel as clackCancel, isCancel, log as clackLog, note as clackNote, spinner as clackSpinner } from '@clack/prompts';
import chalk from 'chalk';
import { getLoggerConfig } from './utils/logger.js';

/**
 * Themed intro — blue bar
 */
export function intro(title?: string): void {
    if (getLoggerConfig().silent) return;
    clackIntro(chalk.bgBlueBright.black(` ${title ?? ''} `));
}

/**
 * Themed outro — blue text
 */
export function outro(message?: string): void {
    if (getLoggerConfig().silent) return;
    clackOutro(chalk.blueBright(message ?? 'Done'));
}

/**
 * Wrapped log functions that respect silent mode
 */
export const log = {
    step: (message: string) => {
        if (getLoggerConfig().silent) return;
        clackLog.step(message);
    },
    info: (message: string) => {
        if (getLoggerConfig().silent) return;
        clackLog.info(message);
    },
    warning: (message: string) => {
        if (getLoggerConfig().silent) return;
        clackLog.warning(message);
    },
    error: (message: string) => {
        if (getLoggerConfig().silent) return;
        clackLog.error(message);
    },
    success: (message: string) => {
        if (getLoggerConfig().silent) return;
        clackLog.success(message);
    },
};

/**
 * Wrapped note function that respects silent mode
 */
export function note(message: string, title?: string): void {
    if (getLoggerConfig().silent) return;
    clackNote(message, title);
}

/**
 * Wrapped spinner that respects silent mode
 * Returns a no-op spinner in silent mode
 */
export function spinner() {
    if (getLoggerConfig().silent) {
        // Return a no-op spinner with all required methods
        return {
            start: () => {},
            stop: () => {},
            message: () => {},
            error: () => {},
        };
    }
    return clackSpinner();
}

/**
 * Handle user cancellation (Ctrl-C) for any prompt value.
 * Exits the process with code 0 after printing a message.
 */
export function handleCancel(value: unknown, message = 'Setup cancelled.'): void {
    if (isCancel(value)) {
        if (!getLoggerConfig().silent) {
            clackCancel(chalk.blueBright(message));
        }
        process.exit(0);
    }
}
