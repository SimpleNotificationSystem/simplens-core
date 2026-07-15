import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAllTools } from '../../packages/mcp-server/src/tools/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';
import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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

    let fetchMock = vi.fn();

    beforeEach(async () => {
        // Stub global fetch
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        server = new SdkMcpServer({
            name: 'test-mcp-server',
            version: '1.0.0'
        });

        registerAllTools(server, () => credentials);

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
        vi.unstubAllGlobals();
    });

    it('should register exactly 29 tools', async () => {
        const toolsResult = await client.listTools();
        expect(toolsResult.tools.length).toBe(29);

        const toolNames = toolsResult.tools.map(t => t.name);
        expect(toolNames).toContain('send_notification');
        expect(toolNames).toContain('create_template');
        expect(toolNames).toContain('list_notifications');
        expect(toolNames).toContain('delete_alert'); // Renamed from resolve_alert
        expect(toolNames).toContain('resolve_alert_with_retry');
        expect(toolNames).toContain('get_dashboard_stats');
        expect(toolNames).toContain('list_admin_channel_providers');
    });

    it('should route list_plugins tool call to GET /api/plugins', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify([{ name: 'smtp', channel: 'email' }])
        });

        const response = await client.callTool({
            name: 'list_plugins',
            arguments: {}
        });

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/plugins', expect.objectContaining({
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
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ success: true, id: 'temp-123' })
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

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/templates/create', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(templateArgs),
            headers: expect.objectContaining({
                'Authorization': 'Bearer test-api-key'
            })
        }));

        expect(response.isError).toBeUndefined();
        const content = response.content[0] as { text: string };
        expect(JSON.parse(content.text)).toEqual({ success: true, id: 'temp-123' });
    });

    it('should route delete_alert tool call to DELETE /api/alerts/:id', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ success: true })
        });

        const response = await client.callTool({
            name: 'delete_alert',
            arguments: {
                alert_id: '60d5ec48f83c2c2e88a53820'
            }
        });

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/alerts/60d5ec48f83c2c2e88a53820', expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({
                'Authorization': 'Bearer test-api-key'
            })
        }));

        expect(response.isError).toBeUndefined();
        const content = response.content[0] as { text: string };
        expect(JSON.parse(content.text)).toEqual({ success: true });
    });
});
