import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
    fileExists,
    writeFile,
    readFile,
    appendFile,
} from '../utils.js';

describe('utils - file operations', () => {
    let tempDir: string;

    beforeEach(async () => {
        // Create a temporary directory for tests
        tempDir = path.join(os.tmpdir(), `onboard-test-${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('fileExists', () => {
        it('should return true for existing file', async () => {
            const filePath = path.join(tempDir, 'test.txt');
            await fs.writeFile(filePath, 'content');

            expect(await fileExists(filePath)).toBe(true);
        });

        it('should return false for non-existing file', async () => {
            const filePath = path.join(tempDir, 'nonexistent.txt');

            expect(await fileExists(filePath)).toBe(false);
        });

        it('should return true for existing directory', async () => {
            expect(await fileExists(tempDir)).toBe(true);
        });
    });

    describe('writeFile', () => {
        it('should write content to file', async () => {
            const filePath = path.join(tempDir, 'write-test.txt');
            const content = 'Hello, World!';

            await writeFile(filePath, content);

            const written = await fs.readFile(filePath, 'utf-8');
            expect(written).toBe(content);
        });

        it('should create parent directories if they do not exist', async () => {
            const filePath = path.join(tempDir, 'nested', 'dir', 'file.txt');
            const content = 'Nested content';

            await writeFile(filePath, content);

            expect(await fileExists(filePath)).toBe(true);
            const written = await fs.readFile(filePath, 'utf-8');
            expect(written).toBe(content);
        });

        it('should overwrite existing file', async () => {
            const filePath = path.join(tempDir, 'overwrite.txt');
            
            await fs.writeFile(filePath, 'original');
            await writeFile(filePath, 'new content');

            const written = await fs.readFile(filePath, 'utf-8');
            expect(written).toBe('new content');
        });
    });

    describe('readFile', () => {
        it('should read file content', async () => {
            const filePath = path.join(tempDir, 'read-test.txt');
            const content = 'File content to read';
            await fs.writeFile(filePath, content);

            const read = await readFile(filePath);

            expect(read).toBe(content);
        });

        it('should throw error for non-existing file', async () => {
            const filePath = path.join(tempDir, 'nonexistent.txt');

            await expect(readFile(filePath)).rejects.toThrow();
        });

        it('should handle UTF-8 content', async () => {
            const filePath = path.join(tempDir, 'utf8.txt');
            const content = 'Hello 世界 🌍';
            await fs.writeFile(filePath, content);

            const read = await readFile(filePath);

            expect(read).toBe(content);
        });
    });

    describe('appendFile', () => {
        it('should append content to existing file', async () => {
            const filePath = path.join(tempDir, 'append-test.txt');
            await fs.writeFile(filePath, 'Line 1\n');

            await appendFile(filePath, 'Line 2\n');

            const content = await fs.readFile(filePath, 'utf-8');
            expect(content).toBe('Line 1\nLine 2\n');
        });

        it('should create file if it does not exist', async () => {
            const filePath = path.join(tempDir, 'new-append.txt');

            await appendFile(filePath, 'First line\n');

            expect(await fileExists(filePath)).toBe(true);
            const content = await fs.readFile(filePath, 'utf-8');
            expect(content).toBe('First line\n');
        });

        it('should handle multiple appends', async () => {
            const filePath = path.join(tempDir, 'multi-append.txt');

            await appendFile(filePath, 'Line 1\n');
            await appendFile(filePath, 'Line 2\n');
            await appendFile(filePath, 'Line 3\n');

            const content = await fs.readFile(filePath, 'utf-8');
            expect(content).toBe('Line 1\nLine 2\nLine 3\n');
        });
    });
});
