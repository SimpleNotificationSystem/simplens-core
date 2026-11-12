import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Runtime configuration type injected by entrypoint.sh
 */
declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      basePath: string;
      webhookHost?: string;
      webhookPort?: string;
    };
  }
}

/**
 * Get the configured base path from runtime or environment
 * Priority: Runtime config (client) > Environment variable (server) > Empty string
 * Returns the base path (e.g., "/dashboard") or empty string if not set
 */
export function getBasePath(): string {
  // Browser: Try runtime config first (injected by entrypoint.sh at container startup)
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
    return window.__RUNTIME_CONFIG__.basePath || "";
  }

  // Server/Build: Fall back to env var (available at actual runtime in container)
  return process.env.BASE_PATH || "";
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

/**
 * Format bytes into human-readable size string (e.g. 1.5 MB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Show error toast with proper multi-line formatting.
 */
export function showErrorToast(error: unknown, fallbackMessage = "An error occurred"): void {
  const message = error instanceof Error ? error.message : String(error || fallbackMessage);
  const [firstLine, ...rest] = message.split("\n");
  if (rest.length > 0) {
    toast.error(firstLine, {
      description: rest.join("\n"),
      style: { whiteSpace: "pre-line" },
    });
  } else {
    toast.error(message);
  }
}

// Command string function to format lowercase or uppoercase to make the first letter of every word alone into upper case
export function toCamelCase(str: string) {
  const words = str.split(' ');
  const compiled: string[] = [];
  for (let word of words) {
    word = word.toLowerCase();
    const firstLetter = word.slice(0, 1).toUpperCase();
    const remaining = word.slice(1);
    compiled.push(firstLetter+remaining)
  }
  let final = "";
  for (const word of compiled) {
    final += word+" "
  }
  return final.trimStart().trimEnd();
}

export function truncateLongDescriptions(str: string, maxLength: number) {
  if (str.length > maxLength) {
    return str.slice(0, maxLength) + "...";
  }
  return str;
}
