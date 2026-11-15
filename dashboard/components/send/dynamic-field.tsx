import { useState, KeyboardEvent, ClipboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FieldDefinition } from "@/lib/types";
import { X, Plus } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FieldValue = any;

interface DynamicFieldProps {
    field: FieldDefinition;
    value: FieldValue;
    onChange: (value: FieldValue) => void;
    error?: string;
    headerAction?: React.ReactNode;
}

/**
 * Array editor for primitive values (strings, numbers)
 * Supports Enter, comma separation, pasting, and badge removal
 */
function PrimitiveArrayInput({
    field,
    value,
    onChange,
    error,
}: {
    field: FieldDefinition;
    value: unknown;
    onChange: (value: unknown[]) => void;
    error?: string;
}) {
    const [inputValue, setInputValue] = useState("");
    const items: (string | number)[] = Array.isArray(value) ? value : [];

    const addItem = (rawText: string) => {
        const parts = rawText
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);

        if (parts.length === 0) return;

        const newItems = parts.map((part) =>
            field.itemType === "number" ? (Number(part) || 0) : part
        );

        onChange([...items, ...newItems]);
        setInputValue("");
    };

    const removeItem = (indexToRemove: number) => {
        onChange(items.filter((_, idx) => idx !== indexToRemove));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addItem(inputValue);
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        const pasted = e.clipboardData.getData("text");
        if (pasted.includes(",") || pasted.includes("\n") || pasted.includes(";")) {
            e.preventDefault();
            addItem(pasted);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={field.description || `Add ${field.name} (press Enter or comma)`}
                    className={`flex-1 text-sm ${error ? "border-red-500" : ""}`}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addItem(inputValue)}
                    disabled={!inputValue.trim()}
                    className="shrink-0"
                >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                </Button>
            </div>

            {items.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5 items-center">
                    {items.map((item, idx) => (
                        <Badge
                            key={idx}
                            variant="secondary"
                            className="flex items-center gap-1 pl-2.5 pr-1 py-0.5 text-xs font-normal"
                        >
                            <span>{String(item)}</span>
                            <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="rounded-full hover:bg-muted p-0.5 transition-colors"
                            >
                                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                <span className="sr-only">Remove {String(item)}</span>
                            </button>
                        </Badge>
                    ))}
                </div>
            )}

            <p className="text-[11px] text-muted-foreground">
                Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd> or <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">,</kbd> to add values, or paste comma-separated lists.
            </p>
        </div>
    );
}

export function DynamicField({ field, value, onChange, error, headerAction }: DynamicFieldProps) {
    if (field.type === "attachment") {
        return null;
    }

    const id = `field-${field.name}`;

    // 1. Boolean field
    if (field.type === "boolean") {
        return (
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <Checkbox
                        id={id}
                        checked={Boolean(value)}
                        onCheckedChange={(checked) => onChange(Boolean(checked))}
                    />
                    <Label htmlFor={id} className={error ? "text-red-500" : ""}>
                        {field.name} {field.required && "*"}
                    </Label>
                </div>
                {headerAction}
            </div>
        );
    }

    // 2. Enum field
    if (field.type === "enum" && field.enumValues && field.enumValues.length > 0) {
        return (
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <Label htmlFor={id} className={error ? "text-red-500" : ""}>
                        {field.name} {field.required && "*"}
                    </Label>
                    {headerAction}
                </div>
                <Select
                    value={value ? String(value) : ""}
                    onValueChange={(val) => onChange(val)}
                >
                    <SelectTrigger id={id} className={error ? "border-red-500" : ""}>
                        <SelectValue placeholder={field.description || `Select ${field.name}`} />
                    </SelectTrigger>
                    <SelectContent>
                        {field.enumValues.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                                {opt}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        );
    }

    // 3. Nested Object field
    if (field.type === "object") {
        if (field.fields && field.fields.length > 0) {
            const currentObj = (typeof value === "object" && value !== null) ? (value as Record<string, unknown>) : {};
            return (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor={id} className={`text-sm font-medium ${error ? "text-red-500" : ""}`}>
                                {field.name} {field.required && "*"}
                            </Label>
                            {field.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                            )}
                        </div>
                        {headerAction}
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-3.5 mt-1.5">
                        <div className="ml-1 pl-3.5 space-y-3.5 border-l-2 border-primary/30">
                            {field.fields.map((child) => (
                                <DynamicField
                                    key={child.name}
                                    field={child}
                                    value={currentObj[child.name]}
                                    onChange={(childVal) =>
                                        onChange({
                                            ...currentObj,
                                            [child.name]: childVal,
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
            );
        }

        // Generic object / Record fallback: JSON editor
        return (
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <Label htmlFor={id} className={error ? "text-red-500" : ""}>
                        {field.name} {field.required && "*"} (JSON Object)
                    </Label>
                    {headerAction}
                </div>
                <Textarea
                    id={id}
                    value={typeof value === "string" ? value : JSON.stringify(value || {}, null, 2)}
                    onChange={(e) => {
                        try {
                            const parsed = JSON.parse(e.target.value);
                            onChange(parsed);
                        } catch {
                            onChange(e.target.value);
                        }
                    }}
                    placeholder={field.description || '{\n  "key": "value"\n}'}
                    rows={4}
                    className={`font-mono text-xs ${error ? "border-red-500" : ""}`}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        );
    }

    // 4. Array field
    if (field.type === "array") {
        if (field.itemType === "object") {
            // Array of objects fallback: JSON editor
            return (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <Label htmlFor={id} className={error ? "text-red-500" : ""}>
                            {field.name} {field.required && "*"} (Array of Objects)
                        </Label>
                        {headerAction}
                    </div>
                    <Textarea
                        id={id}
                        value={typeof value === "string" ? value : JSON.stringify(value || [], null, 2)}
                        onChange={(e) => {
                            try {
                                const parsed = JSON.parse(e.target.value);
                                onChange(parsed);
                            } catch {
                                onChange(e.target.value);
                            }
                        }}
                        placeholder={'[\n  {\n    "key": "value"\n  }\n]'}
                        rows={4}
                        className={`font-mono text-xs ${error ? "border-red-500" : ""}`}
                    />
                    {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
            );
        }

        // Primitive array (string, number, boolean)
        return (
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <Label htmlFor={id} className={error ? "text-red-500" : ""}>
                        {field.name} {field.required && "*"}
                    </Label>
                    {headerAction}
                </div>
                <PrimitiveArrayInput
                    field={field}
                    value={value}
                    onChange={(newArr) => onChange(newArr)}
                    error={error}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        );
    }

    // 5. Scalar fields (text, number, email, phone, url, string)
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <Label htmlFor={id} className={error ? "text-red-500" : ""}>
                    {field.name} {field.required && "*"}
                </Label>
                {headerAction}
            </div>

            {field.type === "text" ? (
                <Textarea
                    id={id}
                    value={value !== undefined && value !== null ? String(value) : ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.description}
                    required={field.required}
                    rows={4}
                    className={error ? "border-red-500" : ""}
                />
            ) : (
                <Input
                    id={id}
                    type={
                        field.type === "email"
                            ? "email"
                            : field.type === "phone"
                                ? "tel"
                                : field.type === "url"
                                    ? "url"
                                    : field.type === "number"
                                        ? "number"
                                        : "text"
                    }
                    value={value !== undefined && value !== null ? value : ""}
                    onChange={(e) =>
                        onChange(
                            field.type === "number"
                                ? (e.target.value === "" ? "" : Number(e.target.value))
                                : e.target.value
                        )
                    }
                    placeholder={field.description}
                    required={field.required}
                    className={error ? "border-red-500" : ""}
                />
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    );
}
