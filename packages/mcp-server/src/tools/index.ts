/**
 * Tool Registration
 * 
 * Registers all MCP tools with the server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';

import { registerSendNotification } from './send-notification.js';
import { registerSendBatchNotification } from './send-batch-notification.js';
import { registerListPlugins } from './list-plugins.js';
import { registerFindFailures } from './find-failures.js';
import { registerRetryFailure } from './retry-failure.js';
import { registerListAlerts } from './list-alerts.js';
import { registerResolveAlert } from './resolve-alert.js';
import { registerGetSendSchema } from './get-send-schema.js';

export function registerAllTools(server: McpServer, getCredentials: () => UserCredentials) {
    registerSendNotification(server, getCredentials);
    registerSendBatchNotification(server, getCredentials);
    registerListPlugins(server, getCredentials);
    registerFindFailures(server, getCredentials);
    registerRetryFailure(server, getCredentials);
    registerListAlerts(server, getCredentials);
    registerResolveAlert(server, getCredentials);
    registerGetSendSchema(server);
}
