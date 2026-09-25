import { NextResponse } from "next/server";
import axios from "axios";
import { API_BASE_URL } from "@/lib/api-config";
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
            `${API_BASE_URL}/api/admin/auth/signup`,
            { username, password },
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 5000,
            }
        );

        const basePath = getBasePath();
        const nextRes = NextResponse.json({
            success: true,
            redirectUrl: `${basePath}/dashboard`,
            user: response.data?.user,
        });

        const token = response.data?.token;
        if (token) {
            nextRes.cookies.set("simplens_session", token, {
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                maxAge: 7 * 24 * 60 * 60,
                path: "/",
            });
        }

        return nextRes;
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
