import { NextResponse } from "next/server";

/**
 * Runtime configuration API endpoint
 * Returns the base path configured at runtime via environment variable
 * This serves as a fallback if /runtime-config.js is not loaded
 */
export async function GET() {
  return NextResponse.json({
    basePath: process.env.BASE_PATH || "",
  });
}

export const dynamic = 'force-dynamic';
