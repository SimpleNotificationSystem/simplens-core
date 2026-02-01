/**
 * API Route: POST /api/admin-channels/test
 * Proxies test request to backend API
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Proxy to backend API
        const response = await fetch(`${API_URL}/api/admin-channels/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error("Error testing channel:", error);
        return NextResponse.json(
            { success: false, error: "Test failed - could not reach backend" },
            { status: 500 }
        );
    }
}
