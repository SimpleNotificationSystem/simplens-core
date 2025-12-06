import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const NS_API_KEY = process.env.NS_API_KEY || "";
const WEBHOOK_HOST = process.env.WEBHOOK_HOST || "localhost";
const WEBHOOK_PORT = process.env.WEBHOOK_PORT || "3002";

/**
 * Builds the webhook URL based on environment.
 * In Docker: uses host.docker.internal
 * Locally: uses localhost
 */
function getWebhookUrl(): string {
    return `http://${WEBHOOK_HOST}:${WEBHOOK_PORT}/api/webhook`;
}

/**
 * Proxy endpoint to send notifications to the backend API.
 * Automatically sets the webhook URL based on environment.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { type, ...payload } = body;

        if (!NS_API_KEY) {
            return NextResponse.json(
                { error: "NS_API_KEY not configured" },
                { status: 500 }
            );
        }

        // Add webhook URL to payload
        const payloadWithWebhook = {
            ...payload,
            webhook_url: getWebhookUrl(),
        };

        // Determine endpoint based on type
        const endpoint = type === "batch"
            ? `${API_BASE_URL}/notification/batch`
            : `${API_BASE_URL}/notification`;

        // Forward request to notification service
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${NS_API_KEY}`,
            },
            body: JSON.stringify(payloadWithWebhook),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            message: data.message || "Notification(s) queued for processing",
            webhook_url: getWebhookUrl(),
        });
    } catch (error) {
        console.error("[Send API] Error:", error);
        return NextResponse.json(
            { error: "Failed to send notification" },
            { status: 500 }
        );
    }
}
