/**
 * Tool: Notification Template Management
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerTemplateTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. create_template
    server.registerTool(
        'create_template',
        {
            description: 'Create a new notification template. Guides AI to define the content template for a specific plugin package.',
            inputSchema: {
                name: z.string().describe('Human-readable name of the template'),
                template_id: z.string().optional().describe('Optional unique string identifier for the template. If omitted, SimpleNS and MongoDB will automatically generate a unique ID.'),
                description: z.string().optional().describe('Optional explanation of the template\'s purpose'),
                content: z.record(z.string(), z.unknown()).describe('Template content structure matching the package schema (e.g. HTML/Subject). Double curly braces {{variable}} can be used for placeholders.'),
                package: z.string().describe('Package name of the provider this template targets (e.g., "@simplens/smtp")')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.createTemplate(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to create template', error);
            }
        }
    );

    // 2. list_templates
    server.registerTool(
        'list_templates',
        {
            description: 'List all available notification templates, optionally filtered by package.',
            inputSchema: {
                package_name: z.string().optional().describe('Filter templates by package name (e.g. "@simplens/smtp")')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listTemplates(params.package_name ? { package_name: params.package_name } : {});
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list templates', error);
            }
        }
    );

    // 3. get_template_by_id
    server.registerTool(
        'get_template_by_id',
        {
            description: 'Retrieve a single notification template by its unique template ID, including its content layout.',
            inputSchema: {
                template_id: z.string().describe('Unique template ID (slug)')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getTemplateById(params.template_id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retrieve template', error);
            }
        }
    );

    // 4. update_template
    server.registerTool(
        'update_template',
        {
            description: 'Update an existing template by its template ID.',
            inputSchema: {
                template_id: z.string().describe('The template ID of the template to update'),
                name: z.string().describe('Updated human-readable name'),
                description: z.string().optional().describe('Updated description'),
                content: z.record(z.string(), z.unknown()).describe('Updated template content structure'),
                package: z.string().describe('Package name of the provider')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const { template_id, ...payload } = params;
                const result = await client.updateTemplate(template_id, {
                    template_id,
                    ...payload
                });
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to update template', error);
            }
        }
    );

    // 5. delete_template
    server.registerTool(
        'delete_template',
        {
            description: 'Permanently delete a notification template by its template ID.',
            inputSchema: {
                template_id: z.string().describe('The template ID of the template to delete')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.deleteTemplate(params.template_id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to delete template', error);
            }
        }
    );
}
