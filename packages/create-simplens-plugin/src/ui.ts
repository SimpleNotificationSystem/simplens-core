/**
 * UI helpers using @clack/prompts for consistent TUI experience
 */

import { intro as clackIntro, outro as clackOutro, cancel as clackCancel, isCancel, spinner as clackSpinner } from '@clack/prompts';
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
 * Wrapped spinner
 */
export function spinner() {
    return clackSpinner();
}

/**
 * Handle user cancellation (Ctrl-C) for any prompt value.
 * Exits the process with code 0 after printing a message.
 */
export function handleCancel(value: unknown, message = 'Plugin creation cancelled.'): void {
    if (isCancel(value)) {
        clackCancel(chalk.blueBright(message));
        process.exit(0);
    }
}
