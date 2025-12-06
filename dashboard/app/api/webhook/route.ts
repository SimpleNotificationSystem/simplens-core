import { NextResponse } from "next/server";

/**
 * Webhook endpoint to receive notification delivery status callbacks.
 * The worker already updates status in MongoDB, so we just acknowledge receipt.
 */
export async function POST(request: Request) {
    try {
        const payload = await request.json();

        // Log the webhook callback for debugging (optional)
        console.log("[Webhook] Received callback:", {
            request_id: payload.request_id,
            notification_id: payload.notification_id,
            status: payload.status,
            channel: payload.channel,
            occurred_at: payload.occurred_at,
        });

        // Return 200 OK to acknowledge receipt
        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[Webhook] Error processing callback:", error);
        return NextResponse.json({ received: false, error: "Invalid payload" }, { status: 400 });
    }
}
