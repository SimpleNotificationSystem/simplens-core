import { NextResponse } from "next/server";
import { validateSession } from "@/lib/session";

export async function GET() {
    try {
        const session = await validateSession();

        if (!session.isValid) {
            return NextResponse.json({
                authenticated: false,
            });
        }

        return NextResponse.json({
            authenticated: true,
            user: session.user,
        });
    } catch (error) {
        console.error("Session check error:", error);
        return NextResponse.json({
            authenticated: false,
        });
    }
}
