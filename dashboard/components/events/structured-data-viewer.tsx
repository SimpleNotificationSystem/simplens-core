"use client";

import React, { useState } from "react";
import DOMPurify from "dompurify";
import { FieldDefinition } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
    Copy,
    Check,
    ExternalLink,
    Eye,
    Code,
    CurlyBraces,
    Download,
    Paperclip,
    Plus,
    X,
} from "lucide-react";
import { formatBytes, withBasePath, cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

/**
 * Checks if a string contains valid HTML markup tags.
 */
export function isHtmlContent(value: unknown): boolean {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/^<!DOCTYPE/i.test(trimmed)) return true;
    const htmlRegex = /<\/?(html|head|body|p|div|span|h[1-6]|table|tbody|thead|tr|td|th|ul|ol|li|a|b|strong|i|em|br|hr|img|pre|code|blockquote|section|article|header|footer|nav|button|input|form|style)\b[^>]*>/i;
    return htmlRegex.test(trimmed);
}

/**
 * Safely sanitizes HTML content using DOMPurify (with SSR safety check).
 */
function sanitizeHtml(html: string): string {
    if (typeof window !== "undefined") {
        return DOMPurify.sanitize(html);
    }
    return html;
}

/**
 * Checks if a string matches an ISO date string format.
 */
function isIsoDateString(value: unknown): boolean {
    if (typeof value !== "string") return false;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value);
}

/**
 * Formats an ISO date string safely outside JSX.
 */
function formatIsoDate(val: string): string | null {
    try {
        const date = parseISO(val);
        return format(date, "PPpp");
    } catch {
        return null;
    }
}

/**
 * Checks if an item represents a file attachment object.
 */
export function isAttachmentItem(item: unknown): boolean {
    if (!item || typeof item !== "object") return false;
    const obj = item as Record<string, unknown>;
    return Boolean(
        (obj.id || obj.fileId) &&
        (obj.filename || obj.name || obj.mime_type || obj.contentType || obj.size !== undefined || obj.url)
    );
}

/**
 * Checks if a value is an array of attachment items.
 */
export function isAttachmentArray(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0) return false;
    return value.every(isAttachmentItem);
}

/**
 * Formats a key name into a human-readable title (e.g. "user_id" -> "User ID", "reference_code" -> "Reference Code")
 */
function formatKeyLabel(key: string): string {
    return key
        .replace(/_/g, " ")
        .replace(/\b[a-z]/g, (char) => char.toUpperCase())
        .replace(/\bId\b/g, "ID")
        .replace(/\bUrl\b/g, "URL");
}

/**
 * Copy to clipboard button with feedback
 */
function CopyButton({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success(label ? `Copied ${label}` : "Copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
            onClick={handleCopy}
            title="Copy to clipboard"
        >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
    );
}

/**
 * Tabbed HTML preview and source viewer using DOMPurify and Tailwind prose styling
 */
function HtmlContentBlock({ html, label }: { html: string; label?: string }) {
    return (
        <div className="space-y-2 w-full max-w-full">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground block break-words">
                        {label || "HTML Content"}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono py-0 h-4 uppercase shrink-0">
                        HTML
                    </Badge>
                </div>
                <CopyButton text={html} label="HTML markup" />
            </div>

            <Tabs defaultValue="preview" className="w-full max-w-full">
                <TabsList className="h-8">
                    <TabsTrigger value="preview" className="text-xs px-2.5 py-1">
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Preview
                    </TabsTrigger>
                    <TabsTrigger value="source" className="text-xs px-2.5 py-1">
                        <Code className="h-3.5 w-3.5 mr-1" />
                        Source
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="preview" className="mt-2 w-full max-w-full">
                    <div
                        className="p-4 bg-muted/30 rounded-lg text-sm prose prose-sm max-w-none dark:prose-invert border w-full overflow-auto"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
                    />
                </TabsContent>

                <TabsContent value="source" className="mt-2 w-full max-w-full">
                    <pre className="p-3 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-[350px] whitespace-pre-wrap break-words break-all [overflow-wrap:anywhere] border w-full">
                        {html}
                    </pre>
                </TabsContent>
            </Tabs>
        </div>
    );
}

/**
 * Attachments list renderer
 */
function AttachmentListView({ attachments }: { attachments: unknown[] }) {
    if (!Array.isArray(attachments) || attachments.length === 0) return null;

    return (
        <div className="space-y-2 w-full max-w-full">
            {attachments.map((item, idx) => {
                const att = (typeof item === "object" && item !== null ? item : {}) as {
                    id?: string;
                    fileId?: string;
                    filename?: string;
                    name?: string;
                    contentType?: string;
                    mime_type?: string;
                    size?: number;
                    url?: string;
                    hash?: string;
                };

                const fileId = att.fileId || att.id;
                const filename = att.filename || att.name || (fileId ? `file-${fileId.slice(0, 8)}` : `attachment-${idx + 1}`);
                const mimeType = att.contentType || att.mime_type;
                const downloadUrl = (fileId
                    ? withBasePath(`/api/file/${fileId}/download?filename=${encodeURIComponent(filename)}`)
                    : undefined);

                return (
                    <div
                        key={fileId || idx}
                        className="flex items-start justify-between p-3 rounded-lg border bg-card text-card-foreground shadow-sm hover:border-primary/50 transition-colors w-full min-w-0 gap-3"
                    >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="p-2 rounded-md bg-muted shrink-0 mt-0.5">
                                <Paperclip className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                                <p className="text-sm font-medium break-words break-all [overflow-wrap:anywhere] leading-snug">
                                    {filename}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                    {mimeType && <span className="font-mono break-all [overflow-wrap:anywhere]">{mimeType}</span>}
                                    {att.size !== undefined && (
                                        <>
                                            {mimeType && <span>•</span>}
                                            <span className="shrink-0">{formatBytes(att.size)}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {downloadUrl && (
                            <Button
                                variant="default"
                                size="sm"
                                className="h-8 shrink-0 text-xs self-start"
                                asChild
                            >
                                <a
                                    href={downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <Download className="h-3.5 w-3.5 mr-1" />
                                    Download
                                </a>
                            </Button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Generalized scalar value renderer (neutral formatting without static icon guessing)
 */
function ScalarValueView({
    value,
    type,
}: {
    value: unknown;
    type?: string;
}) {
    if (value === null || value === undefined || value === "") {
        return <span className="text-sm text-muted-foreground italic">—</span>;
    }

    // Boolean
    if (typeof value === "boolean") {
        return (
            <Badge variant="outline" className="font-medium">
                {value ? "True" : "False"}
            </Badge>
        );
    }

    // URL
    if (type === "url" || (typeof value === "string" && /^https?:\/\//i.test(value))) {
        return (
            <div className="flex items-center gap-1.5 flex-wrap w-full min-w-0">
                <a
                    href={String(value)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-mono text-primary hover:underline inline-flex items-center gap-1 break-all [overflow-wrap:anywhere]"
                >
                    <span className="break-all [overflow-wrap:anywhere]">{String(value)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <CopyButton text={String(value)} label="URL" />
            </div>
        );
    }

    // Enum
    if (type === "enum" && typeof value === "string") {
        return (
            <Badge variant="secondary" className="capitalize">
                {value}
            </Badge>
        );
    }

    // Date
    if (isIsoDateString(value)) {
        const formattedDate = formatIsoDate(value as string);
        if (formattedDate) {
            return (
                <span className="text-sm font-medium break-words">
                    {formattedDate}
                </span>
            );
        }
    }

    // Plain text / numbers / strings
    return (
        <span className="text-sm font-medium break-words break-all [overflow-wrap:anywhere] w-full min-w-0">
            {String(value)}
        </span>
    );
}

/**
 * Generalized array viewer (primitives -> badges, objects -> vertical sub-panels with vertical line)
 */
function ArrayValueView({
    name,
    items,
    fieldDef,
}: {
    name: string;
    items: unknown[];
    fieldDef?: FieldDefinition;
}) {
    if (!items || items.length === 0) {
        return <span className="text-xs text-muted-foreground italic">None (empty list)</span>;
    }

    // Attachments
    if (isAttachmentArray(items)) {
        return <AttachmentListView attachments={items} />;
    }

    // Array of primitives (strings, numbers, booleans)
    const isPrimitiveArray = items.every(
        (it) => typeof it === "string" || typeof it === "number" || typeof it === "boolean"
    );

    if (isPrimitiveArray) {
        return (
            <div className="flex flex-wrap gap-1.5 mt-1 w-full max-w-full">
                {items.map((item, idx) => (
                    <Badge
                        key={idx}
                        variant="secondary"
                        className="px-2.5 py-0.5 text-xs font-normal whitespace-normal break-words break-all [overflow-wrap:anywhere] max-w-full"
                    >
                        <span className="break-all [overflow-wrap:anywhere]">{String(item)}</span>
                    </Badge>
                ))}
            </div>
        );
    }

    // Array of objects - rendered vertically with vertical line matching dynamic-field.tsx
    return (
        <div className="space-y-3 mt-1.5 w-full max-w-full">
            {items.map((item, idx) => (
                <div
                    key={idx}
                    className="rounded-lg border bg-muted/10 p-3.5 space-y-2 w-full max-w-full"
                >
                    <div className="text-sm text-muted-foreground">
                        {name} #{idx + 1}
                    </div>
                    <div className="ml-1 pl-3.5 space-y-3.5 border-l-2 border-primary/30 w-full max-w-full">
                        {typeof item === "object" && item !== null ? (
                            <StructuredDataViewer
                                data={item as Record<string, unknown>}
                                schema={fieldDef?.itemFields}
                                isNested
                            />
                        ) : (
                            <div className="text-sm font-mono break-all [overflow-wrap:anywhere]">{String(item)}</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Nested object section viewer:
 * Renders objects without collapsible, featuring an indented colored vertical line matching dynamic-field.tsx
 */
function ObjectSectionView({
    name,
    value,
    fieldDef,
    depth = 0,
}: {
    name: string;
    value: Record<string, unknown>;
    fieldDef?: FieldDefinition;
    depth?: number;
}) {
    const keys = Object.keys(value || {});

    if (keys.length === 0) {
        return <span className="text-sm text-muted-foreground italic">None (empty object)</span>;
    }

    const title = formatKeyLabel(name);

    return (
        <div className="space-y-1.5 w-full max-w-full">
            <div>
                <span className="text-sm text-muted-foreground block">{title}</span>
                {fieldDef?.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{fieldDef.description}</p>
                )}
            </div>
            <div className="rounded-lg border bg-muted/10 p-3.5 mt-1.5 w-full max-w-full">
                <div className="ml-1 pl-3.5 space-y-3.5 border-l-2 border-primary/30 w-full max-w-full">
                    <StructuredDataViewer
                        data={value}
                        schema={fieldDef?.fields}
                        isNested
                        depth={depth + 1}
                    />
                </div>
            </div>
        </div>
    );
}

export interface StructuredDataViewerProps {
    data: unknown;
    schema?: FieldDefinition[];
    className?: string;
    isNested?: boolean;
    depth?: number;
    allowRawToggle?: boolean;
    editable?: boolean;
    onChange?: (updated: unknown) => void;
    excludeKeys?: string[];
    allowAddField?: boolean;
}

function EditablePrimitiveArray({
    items,
    onChange,
}: {
    items: unknown[];
    onChange: (items: unknown[]) => void;
}) {
    const [newItemText, setNewItemText] = useState("");

    const addItem = () => {
        if (!newItemText.trim()) return;
        onChange([...items, newItemText.trim()]);
        setNewItemText("");
    };

    const removeItem = (idx: number) => {
        onChange(items.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-2">
            {items.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {items.map((it, idx) => (
                        <Badge key={idx} variant="secondary" className="flex items-center gap-1 text-xs py-0.5">
                            <span>{String(it)}</span>
                            <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="rounded-full hover:bg-muted p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            <div className="flex gap-2">
                <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Add item..."
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addItem();
                        }
                    }}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={addItem}
                    disabled={!newItemText.trim()}
                >
                    <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
            </div>
        </div>
    );
}

/**
 * Main StructuredDataViewer Component:
 * Generalized, schema-aware, pure vertical renderer for complex JSON structures.
 * Supports both read-only viewing and live editing using Shadcn UI components.
 */
export function StructuredDataViewer({
    data,
    schema,
    className,
    isNested = false,
    depth = 0,
    allowRawToggle = true,
    editable = false,
    onChange,
    excludeKeys = [],
    allowAddField = false,
}: StructuredDataViewerProps) {
    const [viewMode, setViewMode] = useState<"formatted" | "raw">("formatted");
    const [customRawText, setCustomRawText] = useState<string | null>(null);
    const [jsonError, setJsonError] = useState<string | null>(null);

    const dataObj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;

    // Filter out excludeKeys for display if any
    const displayData = excludeKeys && excludeKeys.length > 0
        ? Object.fromEntries(Object.entries(dataObj).filter(([k]) => !excludeKeys.includes(k)))
        : dataObj;

    const rawText = customRawText !== null ? customRawText : JSON.stringify(displayData ?? {}, null, 2);

    // New field creation state
    const [newKey, setNewKey] = useState("");
    const [newType, setNewType] = useState<"string" | "number" | "boolean" | "object">("string");
    const [showAddField, setShowAddField] = useState(false);

    const handleRawChange = (text: string) => {
        setCustomRawText(text);
        try {
            const parsed = JSON.parse(text);
            setJsonError(null);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                let merged = { ...(parsed as Record<string, unknown>) };
                if (excludeKeys && excludeKeys.length > 0 && data && typeof data === "object") {
                    const orig = data as Record<string, unknown>;
                    for (const k of excludeKeys) {
                        if (k in orig) {
                            merged = { ...merged, [k]: orig[k] };
                        }
                    }
                }
                onChange?.(merged);
            } else {
                onChange?.(parsed);
            }
        } catch (err) {
            setJsonError((err as Error).message);
        }
    };

    const handleSwitchToFormatted = () => {
        setCustomRawText(null);
        setJsonError(null);
        setViewMode("formatted");
    };

    const handleSwitchToRaw = () => {
        setCustomRawText(JSON.stringify(displayData ?? {}, null, 2));
        setJsonError(null);
        setViewMode("raw");
    };

    const handleFieldChange = (key: string, value: unknown) => {
        if (!data || typeof data !== "object") return;
        const updated = { ...(data as Record<string, unknown>), [key]: value };
        onChange?.(updated);
    };

    const handleAddNewField = () => {
        const trimmedKey = newKey.trim();
        if (!trimmedKey || !data || typeof data !== "object") return;

        let defaultValue: unknown = "";
        if (newType === "number") defaultValue = 0;
        if (newType === "boolean") defaultValue = false;
        if (newType === "object") defaultValue = {};

        const updated = { ...(data as Record<string, unknown>), [trimmedKey]: defaultValue };
        onChange?.(updated);
        setNewKey("");
        setShowAddField(false);
    };

    // Guard: null or primitive non-object at root
    if (data === null || data === undefined) {
        if (editable) {
            return (
                <div className="py-4 text-center text-sm text-muted-foreground w-full">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onChange?.({})}
                    >
                        <Plus className="h-3 w-3 mr-1" /> Initialize Object
                    </Button>
                </div>
            );
        }
        return (
            <div className="py-6 text-center text-sm text-muted-foreground italic w-full">
                No data available
            </div>
        );
    }

    if (typeof data !== "object") {
        if (isHtmlContent(data)) {
            return <HtmlContentBlock html={String(data)} />;
        }
        return <div className="text-sm font-mono break-all [overflow-wrap:anywhere] w-full">{String(data)}</div>;
    }

    // If data is an array at root
    if (Array.isArray(data)) {
        if (editable) {
            return (
                <EditablePrimitiveArray
                    items={data}
                    onChange={(newItems) => onChange?.(newItems)}
                />
            );
        }
        return <ArrayValueView name="Items" items={data} />;
    }

    // Calculate ordered fields: Schema fields first, followed by remaining keys in data
    const schemaMap = new Map<string, FieldDefinition>();
    if (schema) {
        for (const f of schema) {
            schemaMap.set(f.name, f);
        }
    }

    const isExcluded = (key: string, val?: unknown): boolean => {
        if (excludeKeys && excludeKeys.includes(key)) return true;
        if (editable) {
            const def = schemaMap.get(key);
            if (key === "attachments" || def?.type === "attachment" || isAttachmentArray(val)) {
                return true;
            }
        }
        return false;
    };

    const orderedKeys: string[] = [];
    if (schema) {
        for (const f of schema) {
            if (isExcluded(f.name, dataObj[f.name])) continue;
            if (f.name in dataObj || editable) {
                orderedKeys.push(f.name);
            }
        }
    }
    for (const key of Object.keys(dataObj)) {
        if (isExcluded(key, dataObj[key])) continue;
        if (!orderedKeys.includes(key)) {
            orderedKeys.push(key);
        }
    }

    const activeKeys = editable
        ? orderedKeys
        : orderedKeys.filter((key) => {
            const val = dataObj[key];
            return val !== undefined && val !== null && val !== "";
        });

    return (
        <div className={cn("space-y-4 w-full max-w-full min-w-0", className)}>
            {/* View Mode Toggle (Formatted vs Raw JSON) for root container */}
            {!isNested && allowRawToggle && (
                <div className="flex items-center justify-between pb-2 border-b flex-wrap gap-2 w-full">
                    <span className="text-sm text-muted-foreground">
                        Payload Details ({activeKeys.length} {activeKeys.length === 1 ? "field" : "fields"})
                    </span>
                    <div className="flex items-center gap-1.5">
                        <Button
                            type="button"
                            variant={viewMode === "formatted" ? "default" : "ghost"}
                            size="sm"
                            className="h-7 text-xs px-2.5"
                            onClick={handleSwitchToFormatted}
                        >
                            <Eye className="h-3 w-3 mr-1" />
                            Formatted
                        </Button>
                        <Button
                            type="button"
                            variant={viewMode === "raw" ? "default" : "ghost"}
                            size="sm"
                            className="h-7 text-xs px-2.5"
                            onClick={handleSwitchToRaw}
                        >
                          <CurlyBraces/> Raw JSON
                        </Button>
                    </div>
                </div>
            )}

            {/* Raw JSON View */}
            {viewMode === "raw" ? (
                <div className="relative w-full max-w-full space-y-1">
                    {!editable && (
                        <div className="absolute right-3 top-3 z-10">
                            <CopyButton text={JSON.stringify(dataObj, null, 2)} label="JSON" />
                        </div>
                    )}
                    {editable ? (
                        <>
                            <Textarea
                                value={rawText}
                                onChange={(e) => handleRawChange(e.target.value)}
                                rows={10}
                                className="font-mono text-xs bg-muted/40 w-full min-h-[220px]"
                                placeholder="Enter valid JSON..."
                            />
                            {jsonError && (
                                <p className="text-xs text-red-500 font-mono">
                                    Invalid JSON: {jsonError}
                                </p>
                            )}
                        </>
                    ) : (
                        <pre className="p-4 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-[500px] border w-full whitespace-pre-wrap break-words break-all [overflow-wrap:anywhere]">
                            {JSON.stringify(dataObj, null, 2)}
                        </pre>
                    )}
                </div>
            ) : (
                /* Formatted View (Editable or Read-only) */
                <div className="space-y-4 w-full max-w-full">
                    {activeKeys.map((key, index) => {
                        const val = dataObj[key];
                        const fieldDef = schemaMap.get(key);
                        const label = formatKeyLabel(key);

                        // Editable Rendering Mode
                        if (editable) {
                            // Check if this is an object field
                            const isObjectField = fieldDef?.type === "object" ||
                                (typeof val === "object" && val !== null && !Array.isArray(val));

                            // Check if this is an array field
                            const isArrayField = fieldDef?.type === "array" || Array.isArray(val);

                            return (
                                <div key={key} className="space-y-1.5 w-full max-w-full">
                                    <div className="flex items-center gap-1.5">
                                        <Label className="text-xs font-medium">
                                            {label}
                                            {fieldDef?.required && <span className="text-red-500 ml-0.5">*</span>}
                                        </Label>
                                        {fieldDef?.description && (
                                            <span className="text-[11px] text-muted-foreground">({fieldDef.description})</span>
                                        )}
                                    </div>

                                    {/* Boolean input */}
                                    {(fieldDef?.type === "boolean" || typeof val === "boolean") && (
                                        <div className="flex items-center gap-2 pt-0.5">
                                            <Checkbox
                                                id={`cb-${key}-${depth}`}
                                                checked={Boolean(val)}
                                                onCheckedChange={(checked) => handleFieldChange(key, Boolean(checked))}
                                            />
                                            <Label htmlFor={`cb-${key}-${depth}`} className="text-xs cursor-pointer">
                                                {Boolean(val) ? "True" : "False"}
                                            </Label>
                                        </div>
                                    )}

                                    {/* Enum select */}
                                    {fieldDef?.type === "enum" && fieldDef.enumValues && fieldDef.enumValues.length > 0 && (
                                        <Select
                                            value={val ? String(val) : ""}
                                            onValueChange={(newVal) => handleFieldChange(key, newVal)}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder={`Select ${label}`} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {fieldDef.enumValues.map((opt) => (
                                                    <SelectItem key={opt} value={opt} className="text-xs">
                                                        {opt}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                    {/* Number input */}
                                    {(fieldDef?.type === "number" || (typeof val === "number" && fieldDef?.type !== "enum")) && (
                                        <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={val !== undefined && val !== null ? String(val) : ""}
                                            onChange={(e) =>
                                                handleFieldChange(
                                                    key,
                                                    e.target.value === "" ? undefined : Number(e.target.value)
                                                )
                                            }
                                        />
                                    )}

                                    {/* Date input */}
                                    {fieldDef?.type === "date" && (
                                        <DateTimePicker
                                            value={val ? new Date(val as string) : undefined}
                                            onChange={(date) => handleFieldChange(key, date ? date.toISOString() : undefined)}
                                        />
                                    )}

                                    {/* Nested Object */}
                                    {isObjectField && (
                                        <div className="rounded-lg border bg-muted/10 p-3 w-full">
                                            <div className="ml-1 pl-3 space-y-3 border-l-2 border-primary/30 w-full">
                                                <StructuredDataViewer
                                                    data={val ?? {}}
                                                    schema={fieldDef?.fields}
                                                    isNested
                                                    depth={depth + 1}
                                                    editable
                                                    onChange={(newNested) => handleFieldChange(key, newNested)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Array of primitives */}
                                    {isArrayField && !isObjectField && (
                                        <EditablePrimitiveArray
                                            items={Array.isArray(val) ? val : []}
                                            onChange={(newItems) => handleFieldChange(key, newItems)}
                                        />
                                    )}

                                    {/* Default String input (text/textarea) */}
                                    {!isObjectField &&
                                        !isArrayField &&
                                        fieldDef?.type !== "boolean" &&
                                        fieldDef?.type !== "enum" &&
                                        fieldDef?.type !== "number" &&
                                        fieldDef?.type !== "date" &&
                                        typeof val !== "boolean" &&
                                        typeof val !== "number" && (
                                            isHtmlContent(val) || String(val ?? "").includes("\n") || String(val ?? "").length > 80 ? (
                                                <Textarea
                                                    rows={3}
                                                    className="text-xs"
                                                    value={val !== undefined && val !== null ? String(val) : ""}
                                                    onChange={(e) => handleFieldChange(key, e.target.value)}
                                                />
                                            ) : (
                                                <Input
                                                    className="h-8 text-xs"
                                                    value={val !== undefined && val !== null ? String(val) : ""}
                                                    onChange={(e) => handleFieldChange(key, e.target.value)}
                                                />
                                            )
                                        )}

                                    {index < activeKeys.length - 1 && <Separator className="mt-3" />}
                                </div>
                            );
                        }

                        // Read-Only Rendering Mode (Original Behavior)
                        // 1. HTML Content
                        if (isHtmlContent(val)) {
                            return (
                                <div key={key} className="w-full max-w-full">
                                    <HtmlContentBlock html={String(val)} label={label} />
                                    {index < activeKeys.length - 1 && <Separator className="mt-4" />}
                                </div>
                            );
                        }

                        // 2. Attachments
                        if (isAttachmentArray(val) || fieldDef?.type === "attachment" || key === "attachments") {
                            return (
                                <div key={key} className="space-y-1.5 w-full max-w-full">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground block">
                                            {label}
                                        </span>
                                        <Badge variant="outline" className="text-[10px] font-mono py-0 h-4">
                                            {Array.isArray(val) ? val.length : 0}
                                        </Badge>
                                    </div>
                                    <AttachmentListView attachments={Array.isArray(val) ? val : []} />
                                    {index < activeKeys.length - 1 && <Separator className="mt-4" />}
                                </div>
                            );
                        }

                        // 3. Nested Object (Rendered with vertical line matching dynamic-field.tsx)
                        if (typeof val === "object" && val !== null && !Array.isArray(val)) {
                            return (
                                <div key={key} className="w-full max-w-full">
                                    <ObjectSectionView
                                        name={key}
                                        value={val as Record<string, unknown>}
                                        fieldDef={fieldDef}
                                        depth={depth}
                                    />
                                    {index < activeKeys.length - 1 && <Separator className="mt-4" />}
                                </div>
                            );
                        }

                        // 4. Arrays
                        if (Array.isArray(val)) {
                            return (
                                <div key={key} className="space-y-1.5 w-full max-w-full">
                                    <span className="text-sm text-muted-foreground block">
                                        {label}
                                    </span>
                                    <ArrayValueView name={label} items={val} fieldDef={fieldDef} />
                                    {index < activeKeys.length - 1 && <Separator className="mt-4" />}
                                </div>
                            );
                        }

                        // 5. Long multiline plain text
                        if (typeof val === "string" && val.length > 200) {
                            return (
                                <div key={key} className="space-y-1.5 w-full max-w-full">
                                    <span className="text-sm text-muted-foreground block">
                                        {label}
                                    </span>
                                    <pre className="p-3 bg-muted/40 rounded-lg text-sm font-sans whitespace-pre-wrap break-words break-all [overflow-wrap:anywhere] border w-full">
                                        {String(val)}
                                    </pre>
                                    {index < activeKeys.length - 1 && <Separator className="mt-4" />}
                                </div>
                            );
                        }

                        // 6. Generalized Scalar field (vertical: label above, value below)
                        return (
                            <div key={key} className="space-y-1 w-full min-w-0 max-w-full">
                                <span className="text-sm text-muted-foreground block">
                                    {label}
                                </span>
                                <div className="text-sm font-medium break-words break-all [overflow-wrap:anywhere] w-full min-w-0">
                                    <ScalarValueView value={val} type={fieldDef?.type} />
                                </div>
                                {index < activeKeys.length - 1 && <Separator className="mt-4" />}
                            </div>
                        );
                    })}

                    {/* Add Field section in editable mode */}
                    {editable && allowAddField && (
                        <div className="pt-2">
                            {showAddField ? (
                                <div className="flex items-center gap-2 flex-wrap p-2.5 rounded-md border bg-muted/20">
                                    <Input
                                        className="h-8 text-xs w-36"
                                        placeholder="Field name"
                                        value={newKey}
                                        onChange={(e) => setNewKey(e.target.value)}
                                    />
                                    <Select
                                        value={newType}
                                        onValueChange={(val) => setNewType(val as "string" | "number" | "boolean" | "object")}
                                    >
                                        <SelectTrigger className="h-8 text-xs w-28">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="string" className="text-xs">String</SelectItem>
                                            <SelectItem value="number" className="text-xs">Number</SelectItem>
                                            <SelectItem value="boolean" className="text-xs">Boolean</SelectItem>
                                            <SelectItem value="object" className="text-xs">Object</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={handleAddNewField}
                                        disabled={!newKey.trim()}
                                    >
                                        Add
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() => {
                                            setShowAddField(false);
                                            setNewKey("");
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => setShowAddField(true)}
                                >
                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
                                </Button>
                            )}
                        </div>
                    )}

                    {!editable && activeKeys.length === 0 && (
                        <div className="py-4 text-center text-sm text-muted-foreground italic w-full">
                            Empty payload
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
