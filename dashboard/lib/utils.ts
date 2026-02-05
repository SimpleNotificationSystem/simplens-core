import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the configured base path from environment variable
 * Returns the base path (e.g., "/dashboard") or empty string if not set
 */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || "";
}

/**
 * Prepend the base path to a URL path
 * @param path - The path to prepend (e.g., "/api/notifications")
 * @returns The path with base path prepended (e.g., "/dashboard/api/notifications")
 */
export function withBasePath(path: string): string {
  const basePath = getBasePath();
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  return `${basePath}${path}`;
}
