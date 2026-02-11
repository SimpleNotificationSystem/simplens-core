import { describe, it, expect } from 'vitest';
import { createProgram } from './cli.js';

describe('cli', () => {
    describe('createProgram', () => {
        it('should return a Commander program instance', () => {
            const program = createProgram();
            expect(program).toBeDefined();
            expect(program.name()).toBe('create-simplens-plugin');
        });

        it('should have correct version', () => {
            const program = createProgram();
            expect(program.version()).toBe('1.0.0');
        });

        it('should have correct description', () => {
            const program = createProgram();
            expect(program.description()).toBe('Scaffold a new SimpleNS notification plugin');
        });

        it('should have all expected options', () => {
            const program = createProgram();
            const options = program.options;

            const optionNames = options.map((opt) => opt.long);
            expect(optionNames).toContain('--name');
            expect(optionNames).toContain('--channel');
            expect(optionNames).toContain('--directory');
            expect(optionNames).toContain('--yes');
            expect(optionNames).toContain('--no-git');
            expect(optionNames).toContain('--no-install');
        });

        it('should have short flags for common options', () => {
            const program = createProgram();
            const options = program.options;

            const shortFlags = options.map((opt) => opt.short);
            expect(shortFlags).toContain('-n');
            expect(shortFlags).toContain('-c');
            expect(shortFlags).toContain('-d');
            expect(shortFlags).toContain('-y');
        });
    });
});
