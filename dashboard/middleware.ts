import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const basePath = process.env.BASE_PATH || "";
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
    "/runtime-config.js",
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
    let pathname = request.nextUrl.pathname;

    // STEP 0: Handle root path when base path is configured
    // Redirect "/" to basePath (e.g., "/dashboard")
    if (basePath && pathname === "/" && basePath !== "") {
        return NextResponse.redirect(new URL(basePath, request.url));
    }

    // STEP 1: Strip base path if present and rewrite the request
    // This allows Next.js to serve pages at /dashboard/path while routing internally to /path
    if (basePath && pathname.startsWith(basePath)) {
        const strippedPath = pathname.slice(basePath.length) || '/';
        
        // Create URL with stripped path for internal processing
        const url = request.nextUrl.clone();
        url.pathname = strippedPath;
        
        // Update pathname for subsequent checks
        pathname = strippedPath;
        
        // Skip static files - rewrite and return immediately
        if (isStaticFile(pathname)) {
            return NextResponse.rewrite(url);
        }
        
        // For non-static files, we'll rewrite at the end after auth checks
        // Continue with auth checks using the stripped pathname
    } else {
        // No base path or doesn't start with base path
        // Skip static files
        if (isStaticFile(pathname)) {
            return NextResponse.next();
        }
    }

    // STEP 2: Validate session from request cookies
    const session = await validateSessionFromRequest(request);

    // STEP 3: Handle root path after stripping base path
    // When user visits /dashboard (with basePath=/dashboard), it becomes / internally
    // Redirect authenticated users to the dashboard route, unauthenticated to login
    if (pathname === "/") {
        if (session.isValid) {
            // Authenticated: redirect to dashboard route
            return NextResponse.redirect(new URL(`${basePath}/dashboard`, request.url));
        } else {
            // Not authenticated: redirect to login
            return NextResponse.redirect(new URL(`${basePath}/login`, request.url));
        }
    }

    // STEP 4: Check if authenticated user is trying to access login page
    if (pathname === "/login" && session.isValid) {
        // Redirect to dashboard
        return NextResponse.redirect(new URL(`${basePath}/dashboard`, request.url));
    }

    // STEP 6: Allow public routes (for non-authenticated users)
    if (isPublicRoute(pathname)) {
        // If we stripped base path, rewrite the request
        if (basePath && request.nextUrl.pathname.startsWith(basePath)) {
            const url = request.nextUrl.clone();
            url.pathname = pathname;
            return NextResponse.rewrite(url);
        }
        return NextResponse.next();
    }

    // STEP 7: Protected routes - require authentication
    if (!session.isValid) {
        // Redirect to login
        const loginUrl = new URL(`${basePath}/login`, request.url);
        loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
        return NextResponse.redirect(loginUrl);
    }

    // STEP 8: If we stripped base path earlier, rewrite the request for Next.js
    if (basePath && request.nextUrl.pathname.startsWith(basePath)) {
        const url = request.nextUrl.clone();
        url.pathname = pathname;
        return NextResponse.rewrite(url);
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
