import { NextResponse } from "next/server";
import axios from "axios";
import { API_BASE_URL } from "@/lib/api-config";

export async function GET() {
    try {
        const response = await axios.get(`${API_BASE_URL}/api/admin/auth/status`, {
            timeout: 5000,
        });

        return NextResponse.json(response.data);
    } catch (error) {
        console.error("Error checking auth status from backend:", error);
        // Fallback check against process.env
        const hasEnv = Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
        return NextResponse.json({ isConfigured: hasEnv });
    }
}
