
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {config} from 'dotenv';

config();

async function main() {
    console.log('Starting verification...');

    const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/index.js', '--stdio'],
        env: {
            ...process.env,
            NS_API_KEY: process.env.NS_API_KEY || "",
            SIMPLENS_CORE_URL: process.env.SIMPLENS_CORE_URL || "",
            SIMPLENS_DASHBOARD_URL: process.env.SIMPLENS_DASHBOARD_URL || "",
        }
    });

    const client = new Client({
        name: 'test-client',
        version: '1.0.0',
    }, {
        capabilities: {}
    });

    await client.connect(transport);
    console.log('Connected to server via stdio');

    // List Tools
    const tools = await client.listTools();
    console.log(`Found ${tools.tools.length} tools:`);
    tools.tools.forEach(t => console.log(`- ${t.name}`));

    if (tools.tools.length !== 7) {
        throw new Error(`Expected 7 tools, found ${tools.tools.length}`);
    }

    // List Resources
    const resources = await client.listResources();
    console.log(`Found ${resources.resources.length} resources:`);
    resources.resources.forEach(r => console.log(`- ${r.uri}`));

    if (resources.resources.length !== 2) {
        throw new Error(`Expected 2 resources, found ${resources.resources.length}`);
    }

    console.log('Verification successful!');
    await client.close();
}

main().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
