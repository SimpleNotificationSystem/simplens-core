import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('inquirer', () => ({
    default: {
        prompt: vi.fn(),
    },
}));

import inquirer from 'inquirer';
import { promptInfraServicesWithBasePath } from '../infra.js';

describe('infra service prompt behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hides and strips nginx when allowNginx is false', async () => {
        vi.mocked(inquirer.prompt).mockResolvedValueOnce({
            services: ['mongo', 'nginx', 'redis'],
        } as never);

        const selected = await promptInfraServicesWithBasePath({ allowNginx: false });
        const prompts = vi.mocked(inquirer.prompt).mock.calls[0]?.[0] as any[];
        const choices = prompts[0].choices as Array<{ value: string }>;

        expect(choices.some(choice => choice.value === 'nginx')).toBe(false);
        expect(selected).not.toContain('nginx');
    });

    it('keeps nginx available when allowNginx is true', async () => {
        vi.mocked(inquirer.prompt).mockResolvedValueOnce({
            services: ['mongo', 'nginx'],
        } as never);

        const selected = await promptInfraServicesWithBasePath({ allowNginx: true });
        const prompts = vi.mocked(inquirer.prompt).mock.calls[0]?.[0] as any[];
        const choices = prompts[0].choices as Array<{ value: string }>;

        expect(choices.some(choice => choice.value === 'nginx')).toBe(true);
        expect(selected).toContain('nginx');
    });
});
