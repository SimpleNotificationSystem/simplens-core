/**
 * Dashboard API Client
 * Centralized client-side fetch wrapper
 */
import { withBasePath } from "./utils";

export async function apiRequest<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const response = await fetch(withBasePath(path), {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `API request failed with status ${response.status}`);
    }

    return response.json();
}
