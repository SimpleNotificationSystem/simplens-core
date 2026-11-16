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

/**
 * Recursively removes empty strings (""), empty arrays ([]), and empty objects ({})
 * from an object or array. Preserves booleans (including false), numbers (including 0),
 * Date instances, and non-empty strings.
 */
export function pruneEmptyValues<T = unknown>(val: T): T {
  if (val === null || val === undefined) {
    return undefined as unknown as T;
  }
  if (typeof val === "string") {
    return (val.trim() === "" ? undefined : val) as unknown as T;
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return val;
  }
  if (val instanceof Date) {
    return val;
  }
  if (Array.isArray(val)) {
    const cleaned = val
      .map((item) => pruneEmptyValues(item))
      .filter((item) => item !== undefined);
    return (cleaned.length === 0 ? undefined : cleaned) as unknown as T;
  }
  if (typeof val === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const cleaned = pruneEmptyValues(v);
      if (cleaned !== undefined) {
        res[k] = cleaned;
      }
    }
    return (Object.keys(res).length === 0 ? undefined : res) as unknown as T;
  }
  return val;
}

/**
 * Extracts template variable placeholders (e.g. {{ var_name }}) recursively from any object or string.
 */
export function extractTemplateVariables(input: unknown): string[] {
  const variables = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(regex)) {
        if (match[1]) {
          variables.add(match[1]);
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value && typeof value === "object" && !(value instanceof Date)) {
      Object.values(value).forEach(visit);
    }
  };

  visit(input);
  return Array.from(variables).sort((left, right) => left.localeCompare(right));
}

