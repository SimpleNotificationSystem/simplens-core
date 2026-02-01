/**
 * API Route: /api/admin-channels
 * GET - List all channels, POST - Create new channel
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AdminChannelModel } from "@/lib/models/admin-channel";
import { getOrCreateEncryptionKey, encrypt } from "@/lib/encryption";
import { API_BASE_URL } from "@/lib/api-config";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await connectDB();
        const channels = await AdminChannelModel.find({})
            .select('-config') // Exclude encrypted config for security
            .sort({ created_at: -1 })
            .lean();

        return NextResponse.json({ channels });
    } catch (error) {
        console.error("Error fetching admin channels:", error);
        return NextResponse.json(
            { error: "Failed to fetch channels" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        await connectDB();
        const body = await request.json();
        const { channel_type, name, config, alert_filters } = body;

        // Validate required fields
        if (!channel_type || !name || !config) {
            return NextResponse.json(
                { error: "Missing required fields: channel_type, name, config" },
                { status: 400 }
            );
        }

        // Validate channel config against backend schema
        const validationRes = await fetch(`${API_BASE_URL}/api/admin-channels/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_type, config }),
        });

        if (!validationRes.ok) {
            const errorData = await validationRes.json();
            return NextResponse.json(
                { error: "Validation failed", details: errorData.errors || [] },
                { status: 400 }
            );
        }

        // Encrypt config before storing
        const encryptionKey = await getOrCreateEncryptionKey();
        const encryptedConfig = encrypt(JSON.stringify(config), encryptionKey);

        const channel = await AdminChannelModel.create({
            channel_type,
            name,
            enabled: true,
            config: encryptedConfig,
            alert_filters: alert_filters || {
                failed_notifications: true,
                service_health: true,
                stuck_processing: true,
                orphaned_pending: true,
                ghost_delivery: false,
            },
        });

        // Return channel without encrypted config
        const { config: _, ...channelData } = channel.toObject();
        return NextResponse.json(
            { success: true, channel: channelData },
            { status: 201 }
        );
    } catch (error) {
        console.error("Error creating admin channel:", error);
        return NextResponse.json(
            { error: "Failed to create channel" },
            { status: 500 }
        );
    }
}
