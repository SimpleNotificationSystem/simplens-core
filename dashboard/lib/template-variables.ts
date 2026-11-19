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
 * Extracts template variable placeholders recursively from any object or string.
 * Supports: {{var_name}}, {var_name}, $var_name, ${var_name}, ${{var_name}}
 * Explicitly ignores prices (e.g. $100, $5.50) and single-brace non-variables (e.g. JSON/CSS).
 */
export function extractTemplateVariables(input: unknown): string[] {
  const variables = new Set<string>();
  const regexes = [
    /\$\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}/g,      // ${{ var }}
    /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}/g,        // {{ var }}
    /\$\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}/g,          // ${ var }
    /(?<![{$])\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}(?!\})/g, // { var }
    /\$(?![{\d\s])([a-zA-Z_][a-zA-Z0-9_]*)/g,           // $var (not $100, ${var})
  ];

  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const re of regexes) {
        for (const match of value.matchAll(re)) {
          if (match[1]) {
            variables.add(match[1]);
          }
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
