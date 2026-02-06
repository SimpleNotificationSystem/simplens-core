import { NextResponse } from "next/server";
import { createSession, validateCredentials } from "@/lib/session";
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

        const result = validateCredentials(username, password);

        if (!result.isValid || !result.userId) {
            return NextResponse.json(
                { error: "Invalid username or password" },
                { status: 401 }
            );
        }

        await createSession(result.userId, username);

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
