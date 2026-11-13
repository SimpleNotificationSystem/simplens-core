import { CsvRecipientField, FieldDefinition, FieldType } from "./types";

export interface ParsedCsv {
    headers: string[];
    rows: Record<string, string>[];
}

export interface CsvImportedRecipient {
    id: string;
    request_id: string;
    user_id: string;
    variables: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

export function parseCsv(text: string): ParsedCsv {
    const values: string[][] = [];
    let row: string[] = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const next = text[index + 1];
        if (character === '"') {
            if (quoted && next === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "," && !quoted) {
            row.push(value);
            value = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && next === "\n") index += 1;
            row.push(value);
            if (row.some((cell) => cell.trim() !== "")) values.push(row);
            row = [];
            value = "";
        } else {
            value += character;
        }
    }

    if (value || row.length > 0) {
        row.push(value);
        if (row.some((cell) => cell.trim() !== "")) values.push(row);
    }

    const headers = (values.shift() || []).map((header, index) => header.replace(/^\uFEFF/, "").trim() || `Column ${index + 1}`);
    return {
        headers,
        rows: values.map((cells) =>
            Object.fromEntries(headers.map((header, index) => [header, (cells[index] || "").trim()]))
        ),
    };
}

const normalizeCsvHeader = (value: string) => value.toLowerCase().replace(/[\s_.-]+/g, "");

export function mapCsvHeaders(headers: string[], fields: CsvRecipientField[]): Record<string, string> {
    const mappings: Record<string, string> = {};
    fields.forEach((field) => {
        const matchingHeader = headers.find((header) => normalizeCsvHeader(header) === normalizeCsvHeader(field.key));
        if (matchingHeader) mappings[field.key] = matchingHeader;
    });
    return mappings;
}

export function getMissingRequiredCsvFields(
    fields: CsvRecipientField[],
    mappings: Record<string, string>
): CsvRecipientField[] {
    return fields.filter((field) => field.required && !mappings[field.key]);
}

/**
 * Recursively flattens recipient FieldDefinition trees into dot-paths for CSV mapping.
 */
export function flattenRecipientFieldsForCsv(fields: FieldDefinition[], prefix = ""): CsvRecipientField[] {
    const result: CsvRecipientField[] = [];
    for (const field of fields) {
        if (field.name === "user_id" && !prefix) continue;
        const fullKey = prefix ? `${prefix}.${field.name}` : field.name;
        const fullLabel = prefix ? `${prefix}.${field.name}` : field.name;

        if (field.type === "object" && field.fields && field.fields.length > 0) {
            result.push({
                key: fullKey,
                label: `${fullLabel} (JSON)`,
                required: false,
                type: "object",
            });
            result.push(...flattenRecipientFieldsForCsv(field.fields, fullKey));
        } else if (field.type === "array") {
            result.push({
                key: fullKey,
                label: `${fullLabel} (comma-separated list)`,
                required: field.required,
                type: "array",
            });
        } else {
            result.push({
                key: fullKey,
                label: fullLabel,
                required: field.required,
                type: field.type,
            });
        }
    }
    return result;
}

/**
 * Sets a value at a dot-notated path inside an object
 */
export function setNestedPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part] || typeof current[part] !== "object") {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
}

/**
 * Parses raw CSV cell string into the appropriate typed field representation
 */
export function parseCsvFieldValue(raw: string, type?: FieldType): unknown {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    if (type === "number") {
        const num = Number(trimmed);
        return Number.isNaN(num) ? trimmed : num;
    }

    if (type === "boolean") {
        if (trimmed.toLowerCase() === "true" || trimmed === "1") return true;
        if (trimmed.toLowerCase() === "false" || trimmed === "0") return false;
        return Boolean(trimmed);
    }

    if (type === "array") {
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed;
            } catch {
                // Fallback to splitting
            }
        }
        return trimmed
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }

    if (type === "object" || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed;
        }
    }

    return trimmed;
}

export function importCsvRecipients(
    rows: Record<string, string>[],
    fields: CsvRecipientField[],
    mappings: Record<string, string>,
    createId: () => string
): { recipients: CsvImportedRecipient[]; skipped: number } {
    let skipped = 0;
    const recipients = rows.flatMap((row) => {
        const userId = mappings.user_id ? row[mappings.user_id] : "";
        const requiredMissing = fields.some(
            (field) => field.required && !row[mappings[field.key] || ""]
        );
        if (!userId || requiredMissing) {
            skipped += 1;
            return [];
        }

        const variables: Record<string, string> = {};
        const recipient: CsvImportedRecipient = {
            id: createId(),
            request_id: createId(),
            user_id: userId,
            variables: "{}",
        };

        fields.forEach((field) => {
            const rawValue = field.key === "user_id" ? userId : row[mappings[field.key] || ""];
            if (rawValue === undefined || rawValue === "") return;
            const parsedVal = parseCsvFieldValue(rawValue, field.type);
            if (parsedVal === undefined) return;

            if (field.variableName) {
                variables[field.variableName] = String(parsedVal);
            } else if (field.key !== "user_id") {
                if (field.key.includes(".")) {
                    setNestedPath(recipient, field.key, parsedVal);
                } else {
                    recipient[field.key] = parsedVal;
                }
            }
        });

        recipient.variables = JSON.stringify(variables);
        return [recipient];
    });

    return { recipients, skipped };
}
