import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL } from "./lib/api-config";

const basePath = process.env.BASE_PATH || "";
const SESSION_COOKIE_NAME = "simplens_session";

function proxyToBackend(request: NextRequest, pathname: string, jwtToken?: string) {
    const requestHeaders = new Headers(request.headers);
    if (jwtToken) {
        requestHeaders.set("Authorization", `Bearer ${jwtToken}`);
    }

    const backendUrl = new URL(`${API_BASE_URL}${pathname}${request.nextUrl.search}`);
    return NextResponse.rewrite(backendUrl, {
        request: {
            headers: requestHeaders,
        },
    });
}

// Routes that don't require authentication
const publicRoutes = [
    "/login",
    "/setup",
    "/api/auth/login",
    "/api/auth/setup",
    "/api/auth/status",
    "/api/auth/logout",
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

function validateSessionFromRequest(request: NextRequest): {
    isValid: boolean;
    token?: string;
} {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token || token.trim().length === 0) {
        return { isValid: false };
    }
    return {
        isValid: true,
        token: token.trim(),
    };
}

function isPublicRoute(pathname: string): boolean {
    let normalizedPath = pathname;
    if (basePath && pathname.startsWith(basePath)) {
        normalizedPath = pathname.slice(basePath.length) || "/";
    }
    return publicRoutes.some((route) => normalizedPath.startsWith(route));
}

function isStaticFile(pathname: string): boolean {
    return staticPatterns.some((pattern) => pathname.includes(pattern));
}

export async function middleware(request: NextRequest) {
    let pathname = request.nextUrl.pathname;

    // STEP 0: Handle root path when base path is configured
    if (basePath && pathname === "/" && basePath !== "") {
        return NextResponse.redirect(new URL(basePath, request.url));
    }

    // STEP 1: Strip base path if present and rewrite the request
    if (basePath && pathname.startsWith(basePath)) {
        const strippedPath = pathname.slice(basePath.length) || '/';
        const url = request.nextUrl.clone();
        url.pathname = strippedPath;
        pathname = strippedPath;

        if (isStaticFile(pathname)) {
            return NextResponse.rewrite(url);
        }
    } else {
        if (isStaticFile(pathname)) {
            return NextResponse.next();
        }
    }

    // STEP 2: Validate session from request cookies
    const session = validateSessionFromRequest(request);

    // STEP 3: Handle root path after stripping base path
    if (pathname === "/") {
        if (session.isValid) {
            return NextResponse.redirect(new URL(`${basePath}/dashboard`, request.url));
        } else {
            return NextResponse.redirect(new URL(`${basePath}/login`, request.url));
        }
    }

    // STEP 4: Check if authenticated user is trying to access login page
    if (pathname === "/login" && session.isValid) {
        return NextResponse.redirect(new URL(`${basePath}/dashboard`, request.url));
    }

    // STEP 5: Proxy API requests directly to backend when accessed on standalone dashboard port
    if (pathname.startsWith("/api/")) {
        // Public API routes
        if (isPublicRoute(pathname)) {
            return proxyToBackend(request, pathname);
        }

        // Authenticated session
        if (session.isValid) {
            return proxyToBackend(request, pathname, session.token);
        }

        // Bearer token fallback for external/MCP clients
        const authHeader = request.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            return proxyToBackend(request, pathname);
        }

        return NextResponse.json(
            { error: "Unauthorized: valid session or API key required" },
            { status: 401 }
        );
    }

    // STEP 6: Allow public UI pages
    if (isPublicRoute(pathname)) {
        if (basePath && request.nextUrl.pathname.startsWith(basePath)) {
            const url = request.nextUrl.clone();
            url.pathname = pathname;
            return NextResponse.rewrite(url);
        }
        return NextResponse.next();
    }

    // STEP 7: Protected UI pages - redirect unauthenticated users to login
    if (!session.isValid) {
        const loginUrl = new URL(`${basePath}/login`, request.url);
        loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
        return NextResponse.redirect(loginUrl);
    }

    if (basePath && request.nextUrl.pathname.startsWith(basePath)) {
        const url = request.nextUrl.clone();
        url.pathname = pathname;
        return NextResponse.rewrite(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
    ],
};
