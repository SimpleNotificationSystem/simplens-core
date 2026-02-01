/**
 * API Route: /api/admin-channels/[id]
 * GET, PATCH, DELETE single channel
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { AdminChannelModel } from "@/lib/models/admin-channel";
import { getOrCreateEncryptionKey, encrypt } from "@/lib/encryption";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await connectDB();

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const channel = await AdminChannelModel.findById(id)
            .select('-config')
            .lean();

        if (!channel) {
            return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }

        return NextResponse.json({ channel });
    } catch (error) {
        console.error("Error fetching channel:", error);
        return NextResponse.json({ error: "Failed to fetch channel" }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await connectDB();

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const body = await request.json();
        const updateData: Record<string, unknown> = {};

        // Only update provided fields
        if (body.name) updateData.name = body.name;
        if (typeof body.enabled === 'boolean') updateData.enabled = body.enabled;
        if (body.alert_filters) updateData.alert_filters = body.alert_filters;

        // If config is being updated, re-encrypt it
        if (body.config) {
            const key = await getOrCreateEncryptionKey();
            updateData.config = encrypt(JSON.stringify(body.config), key);
        }

        const channel = await AdminChannelModel.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        ).select('-config').lean();

        if (!channel) {
            return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, channel });
    } catch (error) {
        console.error("Error updating channel:", error);
        return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await connectDB();

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const result = await AdminChannelModel.findByIdAndDelete(id);

        if (!result) {
            return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: "Channel deleted" });
    } catch (error) {
        console.error("Error deleting channel:", error);
        return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
    }
}
