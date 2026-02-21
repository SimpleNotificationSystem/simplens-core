import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, NS_API_KEY } from "@/lib/api-config";

export async function GET(request: NextRequest) {
  try {
    const packageName = request.nextUrl.searchParams
      .get("package_name")
      ?.trim();

    if (!NS_API_KEY) {
      return NextResponse.json(
        { error: "NS_API_KEY not configured" },
        { status: 500 },
      );
    }

    const backendUrl = packageName
      ? `${API_BASE_URL}/api/templates?package_name=${encodeURIComponent(packageName)}`
      : `${API_BASE_URL}/api/templates`;

    const response = await fetch(backendUrl, {
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
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!NS_API_KEY) {
      return NextResponse.json(
        { error: "NS_API_KEY not configured" },
        { status: 500 },
      );
    }

    const body = await request.json();
    const response = await fetch(`${API_BASE_URL}/api/templates/create`, {
      method: "POST",
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
    console.error("Error creating template:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 },
    );
  }
}
