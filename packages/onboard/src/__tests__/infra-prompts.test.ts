import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @clack/prompts
vi.mock('@clack/prompts', () => ({
    multiselect: vi.fn(),
    spinner: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        error: vi.fn(),
        message: vi.fn(),
    })),
}));

// Mock the ui.js module
vi.mock('../ui.js', () => ({
    handleCancel: vi.fn(),
}));

import { multiselect } from '@clack/prompts';
import { promptInfraServicesWithBasePath } from '../infra.js';

describe('promptInfraServicesWithBasePath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('includes nginx when allowNginx is true', async () => {
        const mockMultiselect = vi.mocked(multiselect);
        mockMultiselect.mockResolvedValue(['mongo', 'redis', 'nginx']);

        const result = await promptInfraServicesWithBasePath({ allowNginx: true });

        // Should include nginx in options
        const callArgs = mockMultiselect.mock.calls[0][0] as any;
        const values = callArgs.options.map((o: any) => o.value);
        expect(values).toContain('nginx');

        expect(result).toContain('nginx');
    });

    it('excludes nginx when allowNginx is false', async () => {
        const mockMultiselect = vi.mocked(multiselect);
        mockMultiselect.mockResolvedValue(['mongo', 'redis']);

        const result = await promptInfraServicesWithBasePath({ allowNginx: false });

        // Should NOT include nginx in options
        const callArgs = mockMultiselect.mock.calls[0][0] as any;
        const values = callArgs.options.map((o: any) => o.value);
        expect(values).not.toContain('nginx');

        expect(result).not.toContain('nginx');
    });
});
