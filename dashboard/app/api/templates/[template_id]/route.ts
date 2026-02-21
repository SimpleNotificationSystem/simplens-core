import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, NS_API_KEY } from "@/lib/api-config";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ template_id: string }> }
) {
    try {
        if (!NS_API_KEY) {
            return NextResponse.json({ error: "NS_API_KEY not configured" }, { status: 500 });
        }

        const { template_id } = await params;
        const response = await fetch(`${API_BASE_URL}/api/templates/${encodeURIComponent(template_id)}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${NS_API_KEY}`,
            },
            cache: "no-store",
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Error fetching template by id:", error);
        return NextResponse.json({ error: "Failed to fetch template" }, { status: 503 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ template_id: string }> }
) {
    try {
        if (!NS_API_KEY) {
            return NextResponse.json({ error: "NS_API_KEY not configured" }, { status: 500 });
        }

        const { template_id } = await params;
        const body = await request.json();

        const response = await fetch(`${API_BASE_URL}/api/templates/${encodeURIComponent(template_id)}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${NS_API_KEY}`,
            },
            body: JSON.stringify(body),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error("Error updating template:", error);
        return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ template_id: string }> }
) {
    try {
        if (!NS_API_KEY) {
            return NextResponse.json({ error: "NS_API_KEY not configured" }, { status: 500 });
        }

        const { template_id } = await params;

        const response = await fetch(`${API_BASE_URL}/api/templates/${encodeURIComponent(template_id)}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${NS_API_KEY}`,
            },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error("Error deleting template:", error);
        return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
    }
}
