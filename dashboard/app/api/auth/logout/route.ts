import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { API_BASE_URL } from "@/lib/api-config";

export async function POST() {
    try {
        const cookieStore = await cookies();
        cookieStore.delete("simplens_session");

        try {
            await axios.post(`${API_BASE_URL}/api/admin/auth/logout`, {}, { timeout: 3000 });
        } catch {
            // Ignore backend errors on logout
        }

        const res = NextResponse.json({ success: true });
        res.cookies.delete("simplens_session");
        return res;
    } catch (error) {
        console.error("Logout error:", error);
        return NextResponse.json(
            { error: "An error occurred during logout" },
            { status: 500 }
        );
    }
}
