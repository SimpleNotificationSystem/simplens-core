import { NextResponse } from "next/server";
import axios from "axios";
import { API_BASE_URL, NS_API_KEY } from "@/lib/api-config";
import { createSession } from "@/lib/session";
import { getBasePath } from "@/lib/utils";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json(
                { error: "Username and password are required" },
                { status: 400 }
            );
        }

        const trimmedUsername = String(username).trim();
        if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
            return NextResponse.json(
                { error: "Username must be between 3 and 50 characters" },
                { status: 400 }
            );
        }

        if (password.length < 8 || password.length > 64) {
            return NextResponse.json(
                { error: "Password must be between 8 and 64 characters" },
                { status: 400 }
            );
        }

        const response = await axios.post(
            `${API_BASE_URL}/api/admin/auth/setup`,
            { username, password },
            {
                headers: {
                    Authorization: `Bearer ${NS_API_KEY}`,
                    "Content-Type": "application/json",
                },
                timeout: 5000,
            }
        );

        if (response.data.success && response.data.user) {
            await createSession(response.data.user.id, response.data.user.username);
        }

        const basePath = getBasePath();
        return NextResponse.json({
            success: true,
            redirectUrl: `${basePath}/dashboard`,
        });
    } catch (error: unknown) {
        console.error("Admin setup error:", error);
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data as { error?: string; details?: unknown };
            return NextResponse.json(
                { error: data.error || "Setup failed", details: data.details },
                { status: error.response.status || 400 }
            );
        }

        return NextResponse.json(
            { error: "An unexpected error occurred during setup" },
            { status: 500 }
        );
    }
}
