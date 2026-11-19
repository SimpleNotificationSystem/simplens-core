import { describe, expect, it } from "vitest";
import { extractTemplateVariables, pruneEmptyValues } from "../../../dashboard/lib/template-variables";

describe("Dashboard template variables and pruning utilities", () => {
    describe("extractTemplateVariables", () => {
        it("extracts variables across all 5 supported syntaxes: {{var}}, {var}, $var, ${var}, ${{var}}", () => {
            const content = {
                subject: "Hello {{first_name}}, welcome {last_name}",
                body: "Your order ID is $order_id and shipment code is ${shipment_code}. Details: ${{action_ref}}.",
            };

            const extracted = extractTemplateVariables(content);
            expect(extracted).toEqual([
                "action_ref",
                "first_name",
                "last_name",
                "order_id",
                "shipment_code",
            ]);
        });

        it("ignores monetary amounts like $100 and $5.50", () => {
            const content = "Total price is $100.50, tax is $15, discount $0, user is $user_id";
            const extracted = extractTemplateVariables(content);
            expect(extracted).toEqual(["user_id"]);
        });

        it("ignores CSS blocks, JSON strings, and single braces with spaces or non-variable contents", () => {
            const content = '<style>div { color: red; margin: 10px; }</style><p>{"key": "value"}</p><p>Hello {user}</p>';
            const extracted = extractTemplateVariables(content);
            expect(extracted).toEqual(["user"]);
        });

        it("extracts variables recursively from nested objects and arrays", () => {
            const content = {
                metadata: {
                    deep: [
                        { note: "Hi $recipient_name" },
                        { ref: "{{nested_ref}}" },
                    ],
                },
            };

            const extracted = extractTemplateVariables(content);
            expect(extracted).toEqual(["nested_ref", "recipient_name"]);
        });
    });

    describe("pruneEmptyValues", () => {
        it("removes empty strings, empty arrays, and empty objects while preserving falsy valid values", () => {
            const input = {
                str: "valid",
                empty: "",
                spaces: "   ",
                zero: 0,
                boolFalse: false,
                emptyArray: [],
                validArray: ["item"],
                emptyObj: {},
                nested: {
                    a: "",
                    b: "val",
                },
            };

            const result = pruneEmptyValues(input);
            expect(result).toEqual({
                str: "valid",
                zero: 0,
                boolFalse: false,
                validArray: ["item"],
                nested: {
                    b: "val",
                },
            });
        });
    });
});
