import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

/**
 * GET /api/plugins
 * Fetches available channels and their schemas from the notification service
 */
export async function GET() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/plugins`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(
                { error: error.message || 'Failed to fetch plugins' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching plugins:', error);
        return NextResponse.json(
            { error: 'Failed to connect to notification service' },
            { status: 503 }
        );
    }
}
