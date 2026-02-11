import { execSync } from 'child_process';
import { access, constants } from 'fs/promises';
import { join } from 'path';

/**
 * Checks if git is available on the system
 * @returns true if git is available
 */
export function isGitAvailable(): boolean {
    try {
        execSync('git --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Initializes a git repository in the specified directory
 * @param directory - The directory to initialize git in
 */
export function initGitRepository(directory: string): void {
    execSync('git init', { cwd: directory, stdio: 'ignore' });
}

/**
 * Checks if a directory is already a git repository
 * @param directory - The directory to check
 * @returns true if directory contains .git folder
 */
export async function isGitRepository(directory: string): Promise<boolean> {
    try {
        await access(join(directory, '.git'), constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Creates an initial git commit
 * @param directory - The git repository directory
 * @param message - The commit message
 */
export function createInitialCommit(directory: string, message: string = 'Initial commit'): void {
    execSync('git add -A', { cwd: directory, stdio: 'ignore' });
    execSync(`git commit -m "${message}"`, { cwd: directory, stdio: 'ignore' });
}
