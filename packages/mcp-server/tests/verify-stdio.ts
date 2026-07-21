
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
            NS_API_KEY: process.env.NS_API_KEY || "dummy_api_key_for_stdio_verification",
            SIMPLENS_CORE_URL: process.env.SIMPLENS_CORE_URL || "http://localhost:3000",
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

    if (tools.tools.length !== 29) {
        throw new Error(`Expected 29 tools, found ${tools.tools.length}`);
    }



    console.log('Verification successful!');
    await client.close();
}

main().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
