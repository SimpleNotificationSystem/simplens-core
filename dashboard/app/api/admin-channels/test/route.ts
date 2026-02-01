/**
 * API Route: POST /api/admin-channels/test
 * Test channel connectivity before saving
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const { channel_type, config } = await request.json();

        if (channel_type === 'discord') {
            const webhookUrl = config?.webhook_url;

            // Validate webhook URL format
            if (!webhookUrl?.startsWith('https://discord.com/api/webhooks/')) {
                return NextResponse.json(
                    { success: false, error: "Invalid Discord webhook URL" },
                    { status: 400 }
                );
            }

            // Send test message to Discord
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '✅ SimpleNS Connection Test',
                        description: 'Your Discord webhook is configured correctly! You will receive admin alerts on this channel.',
                        color: 3066993, // Green
                        timestamp: new Date().toISOString(),
                        footer: { text: 'SimpleNS Admin Alerts' }
                    }]
                }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                return NextResponse.json({
                    success: false,
                    error: `Discord API error: ${response.status} - ${errorText}`
                });
            }

            return NextResponse.json({ success: true, message: "Test message sent!" });
        }

        return NextResponse.json(
            { success: false, error: "Unsupported channel type" },
            { status: 400 }
        );
    } catch (error) {
        console.error("Error testing channel:", error);
        return NextResponse.json(
            { success: false, error: "Test failed" },
            { status: 500 }
        );
    }
}
