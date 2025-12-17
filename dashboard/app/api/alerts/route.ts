/**
 * API Route: GET /api/alerts
 * Lists unresolved alerts with pagination
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import AlertModel from "@/lib/models/alert";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = parseInt(searchParams.get("limit") || "50", 10);
        const type = searchParams.get("type"); // Filter by alert type
        const skip = (page - 1) * limit;

        // Build query filter
        const baseFilter: { resolved: boolean; alert_type?: string } = { resolved: false };
        if (type && type !== "all") {
            baseFilter.alert_type = type;
        }

        // Get total count of unresolved alerts (for badges, stats - always unfiltered)
        const totalCount = await AlertModel.countDocuments({ resolved: false });

        // Get filtered count (for pagination)
        const count = await AlertModel.countDocuments(baseFilter);

        // Get counts by alert type (always unfiltered for summary)
        const countsByType = await AlertModel.aggregate([
            { $match: { resolved: false } },
            { $group: { _id: "$alert_type", count: { $sum: 1 } } }
        ]);

        const byType: Record<string, number> = {};
        for (const item of countsByType) {
            byType[item._id] = item.count;
        }

        // Get paginated alerts with optional filter
        const alerts = await AlertModel.find(baseFilter)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return NextResponse.json({
            alerts,
            count, // Total unresolved count (not just returned alerts)
            byType, // Counts by alert type
            page,
            limit,
            totalPages: Math.ceil(count / limit),
        });
    } catch (error) {
        console.error("Error fetching alerts:", error);
        return NextResponse.json(
            { error: "Failed to fetch alerts" },
            { status: 500 }
        );
    }
}

