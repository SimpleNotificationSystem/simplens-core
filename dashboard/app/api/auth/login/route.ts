import { NextResponse } from "next/server";
import axios from "axios";
import { createSession, validateCredentials } from "@/lib/session";
import { getBasePath } from "@/lib/utils";
import { API_BASE_URL, NS_API_KEY } from "@/lib/api-config";

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

        let verifiedUser: { id: string; username: string } | null = null;

        // 1. Try verifying via backend Core API (MongoDB credentials)
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/admin/auth/verify`,
                { username, password },
                {
                    headers: {
                        Authorization: `Bearer ${NS_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    timeout: 5000,
                }
            );

            if (response.data?.isValid && response.data?.user) {
                verifiedUser = response.data.user;
            }
        } catch (apiErr: unknown) {
            // If backend returned 401, it's explicitly invalid credentials
            if (axios.isAxiosError(apiErr) && apiErr.response?.status === 401) {
                return NextResponse.json(
                    { error: "Invalid username or password" },
                    { status: 401 }
                );
            }
            // Fallback for network issues / local dev without backend running
            const fallbackResult = validateCredentials(username, password);
            if (fallbackResult.isValid && fallbackResult.userId) {
                verifiedUser = { id: fallbackResult.userId, username };
            }
        }

        if (!verifiedUser) {
            return NextResponse.json(
                { error: "Invalid username or password" },
                { status: 401 }
            );
        }

        await createSession(verifiedUser.id, verifiedUser.username);

        const basePath = getBasePath();
        return NextResponse.json({
            success: true,
            redirectUrl: `${basePath}/dashboard`,
        });
    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json(
            { error: "An error occurred during login" },
            { status: 500 }
        );
    }
}
