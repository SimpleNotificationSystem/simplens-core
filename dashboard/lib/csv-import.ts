import { CsvRecipientField } from "./types";

export interface ParsedCsv {
    headers: string[];
    rows: Record<string, string>[];
}

export interface CsvImportedRecipient {
    id: string;
    request_id: string;
    user_id: string;
    variables: string;
    [key: string]: string;
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

const normalizeCsvHeader = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");

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
            const fieldValue = field.key === "user_id" ? userId : row[mappings[field.key] || ""];
            if (!fieldValue) return;
            if (field.variableName) variables[field.variableName] = fieldValue;
            else if (field.key !== "user_id") recipient[field.key] = fieldValue;
        });
        recipient.variables = JSON.stringify(variables);
        return [recipient];
    });

    return { recipients, skipped };
}
