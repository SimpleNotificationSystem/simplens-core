import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SESSION_COOKIE_NAME = "simplens_session";

// Routes that don't require authentication
const publicRoutes = [
    "/login",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/session",
    "/api/webhook",
];

// Static file patterns to skip
const staticPatterns = [
    "/_next/",
    "/favicon.ico",
    ".png",
    ".jpg",
    ".svg",
    ".ico",
];

interface SessionPayload {
    userId: string;
    username: string;
    createdAt: number;
    expiresAt: number;
}

function getAuthSecret(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET environment variable is not configured");
    }
    return secret;
}

// Web Crypto API compatible HMAC-SHA256
async function signPayload(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(getAuthSecret()),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        secretKey,
        encoder.encode(payload)
    );
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

async function verifyToken(token: string): Promise<SessionPayload | null> {
    try {
        const [payloadBase64, signature] = token.split(".");
        if (!payloadBase64 || !signature) {
            return null;
        }

        const expectedSignature = await signPayload(payloadBase64);
        if (signature !== expectedSignature) {
            return null;
        }

        const payload = JSON.parse(atob(payloadBase64)) as SessionPayload;

        // Check if session has expired
        if (Date.now() > payload.expiresAt) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

async function validateSessionFromRequest(request: NextRequest): Promise<{
    isValid: boolean;
    user?: { id: string; username: string };
}> {
    try {
        const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

        if (!token) {
            return { isValid: false };
        }

        const payload = await verifyToken(token);
        if (!payload) {
            return { isValid: false };
        }

        return {
            isValid: true,
            user: {
                id: payload.userId,
                username: payload.username,
            },
        };
    } catch {
        return { isValid: false };
    }
}

function isPublicRoute(pathname: string): boolean {
    // Remove base path prefix if present
    let normalizedPath = pathname;
    if (basePath && pathname.startsWith(basePath)) {
        normalizedPath = pathname.slice(basePath.length) || "/";
    }

    // Check if it's a public route
    return publicRoutes.some((route) => normalizedPath.startsWith(route));
}

function isStaticFile(pathname: string): boolean {
    return staticPatterns.some((pattern) => pathname.includes(pattern));
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip static files
    if (isStaticFile(pathname)) {
        return NextResponse.next();
    }

    // Allow public routes
    if (isPublicRoute(pathname)) {
        return NextResponse.next();
    }

    // Validate session from request cookies
    const session = await validateSessionFromRequest(request);

    if (!session.isValid) {
        // Redirect to login
        const loginUrl = new URL(`${basePath}/login`, request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Check if user is on login page but already authenticated
    let normalizedPath = pathname;
    if (basePath && pathname.startsWith(basePath)) {
        normalizedPath = pathname.slice(basePath.length) || "/";
    }

    if (normalizedPath === "/login" && session.isValid) {
        // Redirect to dashboard
        return NextResponse.redirect(new URL(`${basePath}/dashboard`, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files (images, etc.)
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
    ],
};
