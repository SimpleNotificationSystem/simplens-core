import { cookies } from "next/headers";
import { createHmac, randomBytes } from "crypto";

const SESSION_COOKIE_NAME = "simplens_session";
const SESSION_EXPIRY_DAYS = 7;

interface SessionPayload {
    userId: string;
    username: string;
    createdAt: number;
    expiresAt: number;
}

/**
 * Get the auth secret from environment, throws if not configured
 */
function getAuthSecret(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET environment variable is not configured");
    }
    return secret;
}

/**
 * Sign a payload using HMAC-SHA256
 */
function signPayload(payload: string): string {
    const hmac = createHmac("sha256", getAuthSecret());
    hmac.update(payload);
    return hmac.digest("hex");
}

/**
 * Verify a signed token and return the payload if valid
 */
function verifyToken(token: string): SessionPayload | null {
    try {
        const [payloadBase64, signature] = token.split(".");
        if (!payloadBase64 || !signature) {
            return null;
        }

        const expectedSignature = signPayload(payloadBase64);
        if (signature !== expectedSignature) {
            return null;
        }

        const payload = JSON.parse(
            Buffer.from(payloadBase64, "base64").toString("utf-8")
        ) as SessionPayload;

        // Check if session has expired
        if (Date.now() > payload.expiresAt) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

/**
 * Create a signed session token
 */
function createToken(payload: SessionPayload): string {
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const signature = signPayload(payloadBase64);
    return `${payloadBase64}.${signature}`;
}

/**
 * Create a session for the authenticated user
 */
export async function createSession(userId: string, username: string): Promise<void> {
    const now = Date.now();
    const expiresAt = now + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    const payload: SessionPayload = {
        userId,
        username,
        createdAt: now,
        expiresAt,
    };

    const token = createToken(payload);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    });
}

/**
 * Validate the current session and return user info if valid
 */
export async function validateSession(): Promise<{
    isValid: boolean;
    user?: { id: string; username: string };
}> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        if (!token) {
            return { isValid: false };
        }

        const payload = verifyToken(token);
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

/**
 * Destroy the current session
 */
export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Validate credentials against environment variables
 */
export function validateCredentials(
    username: string,
    password: string
): { isValid: boolean; userId?: string } {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
        console.error("ADMIN_USERNAME or ADMIN_PASSWORD not configured in .env");
        return { isValid: false };
    }

    if (username === adminUsername && password === adminPassword) {
        return { isValid: true, userId: "admin-1" };
    }

    return { isValid: false };
}
