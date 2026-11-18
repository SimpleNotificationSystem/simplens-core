/**
 * Template variable rendering utilities.
 *
 * The renderer is the single source of truth for placeholder syntax in SimpleNS.
 * It understands the canonical `{{name}}` form and the legacy forms that older
 * templates and plugin helpers used: `${name}`, `${{name}}`, `{name}` and `$name`.
 *
 * Rendering happens exactly once per delivery (in the unified consumer), so the
 * engine never rescans substituted values: a value that itself contains a
 * placeholder token is inserted verbatim.
 */

import { apiLogger as logger } from "@src/workers/utils/logger.js";

/** Maximum depth the tree walk descends before leaving a subtree untouched. */
export const MAX_TEMPLATE_RENDER_DEPTH = 15;

/** Sentinel used to mask placeholder-bearing string leaves during validation. */
export const TEMPLATE_PLACEHOLDER_SENTINEL = "__SIMPLENS_PLACEHOLDER__";

/**
 * Ordered alternation: `${{name}}` before `${name}` before `{{name}}` before
 * `{name}`, then bare `$name`. Lookbehind/lookahead prevent partial matches.
 */
export const TEMPLATE_VARIABLE_PATTERN =
  /\$\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}|\$\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}|\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}|(?<![{$])\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}(?!\})|\$(?![{\d\s])([a-zA-Z_][a-zA-Z0-9_]*)/g;

/** Non-global variant of the same alternation, safe for `RegExp.test`. */
export const TEMPLATE_VARIABLE_TEST_PATTERN =
  /\$\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}|\$\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}|\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}|(?<![{$])\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}(?!\})|\$(?![{\d\s])([a-zA-Z_][a-zA-Z0-9_]*)/;

const EXPLICIT_TEMPLATE_VARIABLE_PATTERN =
  /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}/g;

const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

const firstDefinedGroup = (groups: unknown[]): string | undefined => {
  for (const group of groups) {
    if (typeof group === "string") {
      return group;
    }
  }
  return undefined;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Resolve a variable name. An exact key wins over dotted path traversal.
 * Path traversal only follows own properties, so `__proto__`/`constructor`
 * can never leak Object prototype members.
 */
const resolveVariableValue = (
  variables: Record<string, unknown>,
  name: string,
): unknown => {
  if (hasOwn(variables, name)) {
    return variables[name];
  }

  if (!name.includes(".")) {
    return undefined;
  }

  let current: unknown = variables;
  for (const segment of name.split(".")) {
    if (!isPlainObject(current) || !hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
};

const stringifyVariableValue = (value: unknown): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Canonicalise every supported syntax in a string to `{{name}}`.
 * Used at template create/update time only; inline content is stored verbatim.
 */
export const normalizeTemplateVariablesInString = (value: string): string => {
  if (!value.includes("{") && !value.includes("$")) {
    return value;
  }

  return value.replace(
    TEMPLATE_VARIABLE_PATTERN,
    (match: string, ...args: unknown[]) => {
      const name = firstDefinedGroup(args.slice(0, 5));
      return name ? `{{${name}}}` : match;
    },
  );
};

/**
 * Recursively canonicalise every supported syntax to `{{name}}`.
 */
export const normalizeTemplateContentVariables = (value: unknown): unknown => {
  if (typeof value === "string") {
    return normalizeTemplateVariablesInString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTemplateContentVariables(item));
  }
  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      normalized[key] = normalizeTemplateContentVariables(nestedValue);
    }
    return normalized;
  }
  return value;
};

/**
 * Replace every supported placeholder in a single string.
 * Substituted values are never rescanned (single pass).
 */
export const replaceTemplateVariablesInString = (
  value: string,
  variables: Record<string, unknown>,
): string => {
  if (!variables || Object.keys(variables).length === 0) {
    return value;
  }
  if (!value.includes("{") && !value.includes("$")) {
    return value;
  }

  return value.replace(
    TEMPLATE_VARIABLE_PATTERN,
    (match: string, ...args: unknown[]) => {
      const name = firstDefinedGroup(args.slice(0, 5));
      if (!name) {
        return match;
      }
      const resolved = stringifyVariableValue(resolveVariableValue(variables, name));
      return resolved === undefined ? match : resolved;
    },
  );
};

let depthWarningLogged = false;

const renderValue = (
  value: unknown,
  variables: Record<string, unknown>,
  depth: number,
): unknown => {
  if (typeof value === "string") {
    return replaceTemplateVariablesInString(value, variables);
  }

  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) {
    return value;
  }

  if (depth >= MAX_TEMPLATE_RENDER_DEPTH) {
    if (!depthWarningLogged) {
      depthWarningLogged = true;
      logger.warn(
        `Template rendering stopped at maximum depth ${MAX_TEMPLATE_RENDER_DEPTH}; deeper values were left untouched`,
      );
    }
    return value;
  }

  if (isArray) {
    let changed = false;
    const renderedArray = value.map((item) => {
      const rendered = renderValue(item, variables, depth + 1);
      if (rendered !== item) {
        changed = true;
      }
      return rendered;
    });
    return changed ? renderedArray : value;
  }

  const source = value as Record<string, unknown>;
  let changed = false;
  const renderedObject: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    const rendered = renderValue(item, variables, depth + 1);
    if (rendered !== item) {
      changed = true;
    }
    renderedObject[key] = rendered;
  }
  return changed ? renderedObject : value;
};

/**
 * Render placeholders in an arbitrary content tree.
 * Returns the original reference when nothing changed (copy-on-change).
 */
export const renderTemplateVariables = <T>(
  content: T,
  variables?: Record<string, unknown>,
  depth = 0,
): T => {
  if (!variables || Object.keys(variables).length === 0) {
    return content;
  }

  depthWarningLogged = false;
  return renderValue(content, variables, depth) as T;
};

/**
 * Render placeholders in `notification.content` only.
 * Accepts variables explicitly, otherwise reads them from the notification.
 */
export const renderNotificationContent = <T extends { content?: unknown }>(
  notification: T,
  variables?: Record<string, unknown>,
): T => {
  if (!notification || notification.content === undefined) {
    return notification;
  }

  const source =
    variables ??
    (notification as { variables?: Record<string, unknown> }).variables;

  if (!source || Object.keys(source).length === 0) {
    return notification;
  }

  const renderedContent = renderTemplateVariables(notification.content, source);
  if (renderedContent === notification.content) {
    return notification;
  }

  return { ...notification, content: renderedContent };
};

/**
 * Collect explicit `{{name}}` tokens from a content tree.
 * Legacy forms are intentionally excluded so literal text (`$100`, `{x}`)
 * never triggers a missing-variable error.
 */
export const extractExplicitTemplateVariableNames = (value: unknown): string[] => {
  const names: string[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      for (const match of node.matchAll(EXPLICIT_TEMPLATE_VARIABLE_PATTERN)) {
        const name = match[1];
        if (name && !seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (isPlainObject(node)) {
      Object.values(node).forEach(visit);
    }
  };

  visit(value);
  return names;
};

/**
 * Explicit `{{name}}` tokens that the variables do not resolve.
 */
export const findUnresolvedTemplateVariables = (
  content: unknown,
  variables?: Record<string, unknown>,
): string[] => {
  const names = extractExplicitTemplateVariableNames(content);
  if (!variables) {
    return names;
  }
  return names.filter(
    (name) => resolveVariableValue(variables, name) === undefined,
  );
};

/**
 * True when any string leaf contains a token the renderer recognises.
 */
export const containsPlaceholderToken = (value: unknown): boolean => {
  if (typeof value === "string") {
    return TEMPLATE_VARIABLE_TEST_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsPlaceholderToken);
  }
  if (isPlainObject(value)) {
    return Object.values(value).some(containsPlaceholderToken);
  }
  return false;
};

/**
 * Stable key for an issue path, also used for masked leaf paths.
 */
export const templatePropertyPathKey = (path?: PropertyKey[]): string =>
  (path ?? []).map((segment) => String(segment)).join("\u001f");

/**
 * Replace every placeholder-bearing string leaf with the sentinel and record
 * the leaf's path key in `maskedPaths`.
 */
export const maskTemplatePlaceholders = (
  value: unknown,
  maskedPaths: Set<string>,
  path: (string | number)[] = [],
): unknown => {
  if (typeof value === "string") {
    if (TEMPLATE_VARIABLE_TEST_PATTERN.test(value)) {
      maskedPaths.add(templatePropertyPathKey(path));
      return TEMPLATE_PLACEHOLDER_SENTINEL;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      maskTemplatePlaceholders(item, maskedPaths, [...path, index]),
    );
  }

  if (isPlainObject(value)) {
    const masked: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      masked[key] = maskTemplatePlaceholders(nestedValue, maskedPaths, [
        ...path,
        key,
      ]);
    }
    return masked;
  }

  return value;
};
