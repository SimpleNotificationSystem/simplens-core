import { describe, expect, it } from "vitest";
import {
    getMissingRequiredCsvFields,
    importCsvRecipients,
    mapCsvHeaders,
    parseCsv,
} from "../../../dashboard/lib/csv-import";
import { CsvRecipientField } from "../../../dashboard/lib/types";

const fields: CsvRecipientField[] = [
    { key: "user_id", label: "User ID", required: true },
    { key: "email", label: "email", required: true },
    { key: "name", label: "name", required: false },
    { key: "variables.greeting", label: "{{greeting}}", required: false, variableName: "greeting" },
];

describe("CSV import helpers", () => {
    it("parses quoted values, escaped quotes, BOM headers, and mixed newlines", () => {
        expect(parseCsv('\uFEFFuser_id, message\r\nu-1,"Hello, ""Sam"""\n\nu-2,"Line 1\nLine 2"')).toEqual({
            headers: ["user_id", "message"],
            rows: [
                { user_id: "u-1", message: 'Hello, "Sam"' },
                { user_id: "u-2", message: "Line 1\nLine 2" },
            ],
        });
    });

    it("trims cells, ignores blank rows, and names empty headers", () => {
        expect(parseCsv(" id , ,email\n 1 , value , one \n,,\n")).toEqual({
            headers: ["id", "Column 2", "email"],
            rows: [{ id: "1", "Column 2": "value", email: "one" }],
        });
    });

    it("maps headers case-insensitively while treating spaces, hyphens, and underscores equally", () => {
        expect(mapCsvHeaders(["user-id", "EMAIL", "variables.greeting"], fields)).toEqual({
            user_id: "user-id",
            email: "EMAIL",
            "variables.greeting": "variables.greeting",
        });
    });

    it("reports required fields that are not mapped", () => {
        const missing = getMissingRequiredCsvFields(fields, { user_id: "id" });
        expect(missing.map((field) => field.key)).toEqual(["email"]);
    });

    it("imports mapped fields and variables while skipping rows missing required values", () => {
        const result = importCsvRecipients(
            [
                { id: "u-1", mail: "one@example.com", display: "One", greeting: "Hi" },
                { id: "", mail: "missing@example.com", display: "Missing", greeting: "Hello" },
                { id: "u-3", mail: "", display: "Missing email", greeting: "Hello" },
            ],
            fields,
            { user_id: "id", email: "mail", name: "display", "variables.greeting": "greeting" },
            (() => {
                let next = 0;
                return () => `generated-${++next}`;
            })()
        );

        expect(result.skipped).toBe(2);
        expect(result.recipients).toEqual([{
            id: "generated-1",
            request_id: "generated-2",
            user_id: "u-1",
            email: "one@example.com",
            name: "One",
            variables: '{"greeting":"Hi"}',
        }]);
    });
});
