#!/usr/bin/env node

/**
 * MCP Server Entry Point
 *
 * Supports two transport modes:
 * 1. Streamable HTTP (default) - starts an Express server on PORT (default 3001)
 * 2. Stdio (via --stdio flag) - uses standard input/output for local use
 */

import express from 'express';
import cors from 'cors';
import type { Request } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { serverConfig } from './config.js';
import { extractCredentials, getStdioCredentials } from './auth.js';
import { registerAllTools } from './tools/index.js';
import { randomUUID } from 'crypto';

interface SessionContext {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
}

// Store active sessions: sessionId -> transport/server context
const sessions = new Map<string, SessionContext>();

function getHeaderValue(header: string | string[] | undefined): string | undefined {
    if (Array.isArray(header)) {
        return header[0];
    }
    return header;
}

async function createHttpSession(req: Request): Promise<StreamableHTTPServerTransport> {
    const credentials = extractCredentials(req);

    const server = new McpServer({
        name: 'simplens-mcp',
        version: '1.0.0',
    });

    registerAllTools(server, () => credentials);

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
            sessions.set(sessionId, { transport, server });
            console.log('Session initialized:', sessionId);
        },
    });

    transport.onclose = () => {
        const sessionId = transport.sessionId;
        if (sessionId) {
            sessions.delete(sessionId);
            console.log('Session closed:', sessionId);
        }
        // Avoid recursive close loops: transport.close() triggers onclose,
        // and server.close() closes the transport again.
    };

    await server.connect(transport);
    return transport;
}

async function main() {
    const args = process.argv.slice(2);
    const mode = args.includes('--stdio') ? 'stdio' : 'http';

    console.error(`Starting SimpleNS MCP Server in ${mode} mode...`);

    if (mode === 'stdio') {
        const server = new McpServer({
            name: 'simplens-mcp',
            version: '1.0.0',
        });

        const credentials = getStdioCredentials();
        registerAllTools(server, () => credentials);

        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('SimpleNS MCP Server running on stdio');
    } else {
        const app = express();

        app.disable('x-powered-by');
        app.use(express.json({ limit: '1mb' }));
        app.use(cors({
            origin: serverConfig.ALLOWED_ORIGINS,
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                'Mcp-Session-Id',
                'Last-Event-ID',
                'X-SimpleNS-API-Key',
                'X-SimpleNS-Core-URL',
                'X-SimpleNS-Dashboard-URL',
            ],
        }));

        app.get('/health', (_req, res) => {
            res.json({ status: 'healthy', version: '1.0.0' });
        });

        app.all('/mcp', async (req, res) => {
            try {
                const sessionId = getHeaderValue(req.headers['mcp-session-id']) || (typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined);

                if (req.method === 'POST') {
                    let transport: StreamableHTTPServerTransport;

                    if (sessionId) {
                        const session = sessions.get(sessionId);
                        if (!session) {
                            res.status(404).send('Session not found');
                            return;
                        }
                        transport = session.transport;
                    } else if (isInitializeRequest(req.body)) {
                        transport = await createHttpSession(req);
                    } else {
                        res.status(400).json({
                            jsonrpc: '2.0',
                            error: {
                                code: -32000,
                                message: 'Bad Request: No valid session ID provided',
                            },
                            id: null,
                        });
                        return;
                    }

                    await transport.handleRequest(req, res, req.body);
                    return;
                }

                if (req.method === 'GET' || req.method === 'DELETE') {
                    if (!sessionId) {
                        res.status(400).send('Missing Mcp-Session-Id header');
                        return;
                    }

                    const session = sessions.get(sessionId);
                    if (!session) {
                        res.status(404).send('Session not found');
                        return;
                    }

                    await session.transport.handleRequest(req, res, req.body);
                    return;
                }

                res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
                res.status(405).send('Method Not Allowed');
            } catch (error) {
                console.error('MCP route error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        });

        app.listen(serverConfig.PORT, () => {
            console.error(`SimpleNS MCP Server HTTP listening on port ${serverConfig.PORT}`);
        });
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
