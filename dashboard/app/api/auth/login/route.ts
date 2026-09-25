import { NextResponse } from "next/server";
import axios from "axios";
import { getBasePath } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api-config";

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

        const response = await axios.post(
            `${API_BASE_URL}/api/admin/auth/login`,
            { username, password },
            {
                headers: { "Content-Type": "application/json" },
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
        if (axios.isAxiosError(error) && error.response) {
            const data = error.response.data as { message?: string; error?: string };
            return NextResponse.json(
                { error: data?.message || data?.error || "Invalid username or password" },
                { status: error.response.status }
            );
        }
        console.error("Login error:", error);
        return NextResponse.json(
            { error: "An error occurred during login" },
            { status: 500 }
        );
    }
}
