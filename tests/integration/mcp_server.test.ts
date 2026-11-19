import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAllTools } from '../../packages/mcp-server/src/tools/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';
import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const { mockAxios } = vi.hoisted(() => {
    const fn = vi.fn();
    return {
        mockAxios: Object.assign(fn, { default: fn }),
    };
});

vi.mock('axios', () => ({
    default: mockAxios,
    __esModule: true,
}));
vi.mock('../../packages/mcp-server/node_modules/axios', () => ({
    default: mockAxios,
    __esModule: true,
}));
vi.mock('../../packages/mcp-server/node_modules/axios/index.js', () => ({
    default: mockAxios,
    __esModule: true,
}));
vi.mock('../../packages/mcp-server/node_modules/axios/dist/node/axios.cjs', () => ({
    default: mockAxios,
    __esModule: true,
}));

// Loopback transport for in-memory client-server MCP communication
class LoopbackTransport implements Transport {
    private other?: LoopbackTransport;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification) => void;

    static link(t1: LoopbackTransport, t2: LoopbackTransport) {
        t1.other = t2;
        t2.other = t1;
    }

    async send(message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification): Promise<void> {
        // Run asynchronously to allow call stack execution to proceed
        setTimeout(() => {
            if (this.other?.onmessage) {
                this.other.onmessage(message);
            }
        }, 0);
    }

    async start(): Promise<void> {}

    async close(): Promise<void> {
        this.onclose?.();
        if (this.other) {
            this.other.onclose?.();
        }
    }
}

describe('MCP Server Integration Tests', () => {
    let server: SdkMcpServer;
    let client: Client;
    let clientTransport: LoopbackTransport;
    let serverTransport: LoopbackTransport;

    const credentials = {
        coreUrl: 'http://localhost:3000',
        apiKey: 'test-api-key'
    };

    beforeEach(async () => {
        mockAxios.mockReset();

        server = new SdkMcpServer({
            name: 'test-mcp-server',
            version: '1.0.0'
        });

        registerAllTools(server as unknown as Parameters<typeof registerAllTools>[0], () => credentials);

        client = new Client({
            name: 'test-mcp-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        clientTransport = new LoopbackTransport();
        serverTransport = new LoopbackTransport();
        LoopbackTransport.link(clientTransport, serverTransport);

        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport)
        ]);
    });

    afterEach(async () => {
        await client.close();
        await server.close();
    });

    it('should register all expected tools', async () => {
        const toolsResult = await client.listTools();
        expect(toolsResult.tools.length).toBe(67);

        const toolNames = toolsResult.tools.map(t => t.name);
        expect(toolNames).toContain('send_notification');
        expect(toolNames).toContain('create_template');
        expect(toolNames).toContain('list_notifications');
        expect(toolNames).toContain('delete_alert'); // Renamed from resolve_alert
        expect(toolNames).toContain('edit_failed_notification');
        expect(toolNames).toContain('resolve_alert_with_retry');
        expect(toolNames).toContain('get_dashboard_stats');
        expect(toolNames).toContain('list_admin_channel_providers');
    });

    it('should route list_plugins tool call to GET /api/plugins', async () => {
        mockAxios.mockResolvedValueOnce({
            status: 200,
            data: [{ name: 'smtp', channel: 'email' }]
        });

        const response = await client.callTool({
            name: 'list_plugins',
            arguments: {}
        });

        expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
            url: 'http://localhost:3000/api/plugins',
            method: 'GET',
            headers: expect.objectContaining({
                'Authorization': 'Bearer test-api-key'
            })
        }));

        expect(response.isError).toBeUndefined();
        const content = response.content[0] as { type: string; text: string };
        expect(content.type).toBe('text');
        expect(JSON.parse(content.text)).toEqual([{ name: 'smtp', channel: 'email' }]);
    });

    it('should route create_template tool call to POST /api/templates/create', async () => {
        mockAxios.mockResolvedValueOnce({
            status: 201,
            data: { success: true, id: 'temp-123' }
        });

        const templateArgs = {
            name: 'Welcome Email',
            template_id: 'welcome-email',
            description: 'Send to new signups',
            content: { subject: 'Welcome!', body: 'Hello {{name}}' },
            package: '@simplens/smtp'
        };

        const response = await client.callTool({
            name: 'create_template',
            arguments: templateArgs
        });

        expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
            url: 'http://localhost:3000/api/templates/create',
            method: 'POST',
            data: templateArgs,
            headers: expect.objectContaining({
                'Authorization': 'Bearer test-api-key'
            })
        }));

        expect(response.isError).toBeUndefined();
        const content = response.content[0] as { text: string };
        expect(JSON.parse(content.text)).toEqual({ success: true, id: 'temp-123' });
    });

    it('should route delete_alert tool call to DELETE /api/alerts/:id', async () => {
        mockAxios.mockResolvedValueOnce({
            status: 200,
            data: { success: true }
        });

        const response = await client.callTool({
            name: 'delete_alert',
            arguments: {
                alert_id: '60d5ec48f83c2c2e88a53820'
            }
        });

        expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
            url: 'http://localhost:3000/api/alerts/60d5ec48f83c2c2e88a53820',
            method: 'DELETE',
            headers: expect.objectContaining({
                'Authorization': 'Bearer test-api-key'
            })
        }));

        expect(response.isError).toBeUndefined();
        const content = response.content[0] as { text: string };
        expect(JSON.parse(content.text)).toEqual({ success: true });
    });

    it('should route edit_failed_notification tool call to PUT /api/notifications/:id', async () => {
        mockAxios.mockResolvedValueOnce({
            status: 200,
            data: {
                success: true,
                message: 'Notification updated and queued for reprocessing',
                data: { _id: '60d5ec48f83c2c2e88a53820' }
            }
        });

        const response = await client.callTool({
            name: 'edit_failed_notification',
            arguments: {
                notification_id: '60d5ec48f83c2c2e88a53820',
                content: { message: 'Updated message' },
                variables: { name: 'Ada' },
                provider: null,
                webhook_url: 'http://localhost:4000/webhook',
                scheduled_at: '2026-11-19T09:00:00.000Z'
            }
        });

        expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
            url: 'http://localhost:3000/api/notifications/60d5ec48f83c2c2e88a53820',
            method: 'PUT',
            data: {
                content: { message: 'Updated message' },
                variables: { name: 'Ada' },
                provider: null,
                webhook_url: 'http://localhost:4000/webhook',
                scheduled_at: '2026-11-19T09:00:00.000Z'
            },
            headers: expect.objectContaining({
                'Authorization': 'Bearer test-api-key'
            })
        }));

        expect(response.isError).toBeUndefined();
        const responseContent = response.content[0] as { text: string };
        expect(JSON.parse(responseContent.text)).toEqual({
            success: true,
            message: 'Notification updated and queued for reprocessing',
            data: { _id: '60d5ec48f83c2c2e88a53820' }
        });
    });

    it('should forward explicit nulls that clear or revert fields', async () => {
        mockAxios.mockResolvedValueOnce({
            status: 200,
            data: { success: true }
        });

        await client.callTool({
            name: 'edit_failed_notification',
            arguments: {
                notification_id: '60d5ec48f83c2c2e88a53820',
                provider: null,
                variables: null,
                scheduled_at: null
            }
        });

        expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
            method: 'PUT',
            data: { provider: null, variables: null, scheduled_at: null }
        }));
    });

    it('should omit unsupplied fields from the edit_failed_notification payload', async () => {
        mockAxios.mockResolvedValueOnce({
            status: 200,
            data: { success: true }
        });

        await client.callTool({
            name: 'edit_failed_notification',
            arguments: {
                notification_id: '60d5ec48f83c2c2e88a53820',
                content: { message: 'Only content' }
            }
        });

        expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
            method: 'PUT',
            data: { content: { message: 'Only content' } }
        }));
    });

    it('should surface edit_failed_notification API errors', async () => {
        mockAxios.mockResolvedValueOnce({
            status: 400,
            data: { error: 'Only failed notifications can be edited and requeued' }
        });

        const response = await client.callTool({
            name: 'edit_failed_notification',
            arguments: {
                notification_id: '60d5ec48f83c2c2e88a53820',
                content: { message: 'Updated message' }
            }
        });

        expect(response.isError).toBe(true);
        const errorContent = response.content[0] as { text: string };
        expect(errorContent.text).toContain('Error (400)');
        expect(errorContent.text).toContain('Only failed notifications can be edited and requeued');
    });

    it('should reject edit_failed_notification without any editable fields', async () => {
        const response = await client.callTool({
            name: 'edit_failed_notification',
            arguments: {
                notification_id: '60d5ec48f83c2c2e88a53820'
            }
        });

        expect(mockAxios).not.toHaveBeenCalled();
        expect(response.isError).toBe(true);
        const guardContent = response.content[0] as { text: string };
        expect(guardContent.text).toContain('No editable fields provided');
    });
});
