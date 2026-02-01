/**
 * API Route: GET /api/admin-channels/providers
 * Fetches available admin channel providers from backend
 */

import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin-channels/providers`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: "Failed to fetch providers from backend" },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error fetching providers:", error);
        return NextResponse.json(
            { error: "Could not reach backend API" },
            { status: 503 }
        );
    }
}
