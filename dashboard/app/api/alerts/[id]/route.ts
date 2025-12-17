/**
 * API Route: DELETE /api/alerts/[id]
 * Dismisses an alert without retrying the notification
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AlertModel from "@/lib/models/alert";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        await connectDB();

        // Validate alert ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { error: "Invalid alert ID" },
                { status: 400 }
            );
        }

        // Find and update the alert
        const alert = await AlertModel.findByIdAndUpdate(
            id,
            {
                resolved: true,
                resolved_at: new Date(),
            },
            { new: true }
        );

        if (!alert) {
            return NextResponse.json(
                { error: "Alert not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Alert dismissed",
        });
    } catch (error) {
        console.error("Error dismissing alert:", error);
        return NextResponse.json(
            { error: "Failed to dismiss alert" },
            { status: 500 }
        );
    }
}
