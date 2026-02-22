"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Code, Eye, Maximize2, Save, X } from "lucide-react";
import { withBasePath } from "@/lib/utils";
import { HtmlPreview } from "@/components/send/html-preview";
import type {
  FieldDefinition,
  PluginMetadata,
  NotificationTemplateDetail,
} from "@/lib/types";
import { Switch } from "@/components/ui/switch";

import { StableMonacoEditor } from "@/components/ui/monaco-wrapper";

const fetcher = (url: string) =>
  fetch(withBasePath(url)).then((res) => {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  });

export default function TemplateEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();

  const mode = (searchParams.get("mode") ?? "create") as "create" | "edit";
  const templateId = searchParams.get("templateId") ?? "";
  const initialPackage = searchParams.get("package") ?? "";
  const initialName = searchParams.get("name") ?? "";
  const initialTemplateId = searchParams.get("template_id") ?? "";
  const initialDescription = searchParams.get("description") ?? "";

  const [form, setForm] = useState<{
    package: string;
    name: string;
    template_id: string;
    description: string;
    content: Record<string, unknown>;
  }>({
    package: initialPackage,
    name: initialName,
    template_id: mode === "edit" ? templateId : initialTemplateId,
    description: initialDescription,
    content: {},
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [error, setError] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  /** Track which fields have Monaco enabled (by field name). */
  const [monacoFields, setMonacoFields] = useState<Set<string>>(new Set());

  const toggleMonaco = (fieldName: string) => {
    setMonacoFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  };

  // ── Plugin schemas ──
  const { data: pluginData } = useSWR<PluginMetadata>("/api/plugins", fetcher);

  const packageSchemas = useMemo(() => {
    const map = new Map<string, Map<string, FieldDefinition>>();
    Object.values(pluginData?.channels ?? {}).forEach((channel) => {
      channel.providers.forEach((provider) => {
        if (!provider.name) return;
        const existing =
          map.get(provider.name) ?? new Map<string, FieldDefinition>();
        provider.contentFields.forEach((field) => {
          const current = existing.get(field.name);
          if (!current) {
            existing.set(field.name, { ...field });
            return;
          }
          existing.set(field.name, {
            ...current,
            required: current.required || field.required,
            type: current.type === field.type ? current.type : "text",
            description: current.description || field.description,
          });
        });
        map.set(provider.name, existing);
      });
    });
    const output: Record<string, FieldDefinition[]> = {};
    map.forEach((fields, pkg) => {
      output[pkg] = Array.from(fields.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    });
    return output;
  }, [pluginData]);

  const packageOptions = useMemo(
    () => Object.keys(packageSchemas).sort((a, b) => a.localeCompare(b)),
    [packageSchemas],
  );

  const ensureContentShape = useCallback(
    (packageName: string, input: Record<string, unknown>) => {
      const schema = packageSchemas[packageName] ?? [];
      const next = { ...input };
      schema.forEach((field) => {
        if (next[field.name] !== undefined) return;
        next[field.name] = field.type === "boolean" ? false : "";
      });
      return next;
    },
    [packageSchemas],
  );

  // Merged fields: schema + extras already in content
  const fields = useMemo(() => {
    const schema = packageSchemas[form.package] ?? [];
    const extras = Object.keys(form.content)
      .filter((key) => !schema.some((f) => f.name === key))
      .map<FieldDefinition>((key) => ({
        name: key,
        type: "text",
        required: false,
        description: "Existing template field",
      }));
    return [...schema, ...extras];
  }, [packageSchemas, form.package, form.content]);

  // Variable detection
  const extractVariables = (value: unknown): string[] => {
    const names = new Set<string>();
    const pattern = /\$?\{\{?\s*([a-zA-Z0-9_.-]+)\s*\}?\}/g;
    const visit = (node: unknown) => {
      if (typeof node === "string") {
        for (const match of node.matchAll(pattern)) {
          if (match[1]) names.add(match[1]);
        }
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (node && typeof node === "object") {
        Object.values(node).forEach(visit);
      }
    };
    visit(value);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  };

  const variableNames = useMemo(
    () => extractVariables(form.content),
    [form.content],
  );

  // ── Load template data (edit mode) ──
  useEffect(() => {
    if (mode !== "edit" || !templateId) return;
    setIsLoading(true);
    fetch(withBasePath(`/api/templates/${encodeURIComponent(templateId)}`))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load template");
        return res.json();
      })
      .then((data: NotificationTemplateDetail) => {
        setForm({
          package: data.package,
          name: data.name ?? "",
          template_id: data.template_id,
          description: data.description ?? "",
          content: data.content ?? {},
        });
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load");
        router.push(withBasePath("/templates"));
      })
      .finally(() => setIsLoading(false));
  }, [mode, templateId, router]);

  // ── Load prefilled content from sessionStorage (create mode) ──
  useEffect(() => {
    if (mode !== "create") return;
    try {
      const stored = sessionStorage.getItem("__sns_editor_content");
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        setForm((prev) => ({ ...prev, content: parsed }));
        sessionStorage.removeItem("__sns_editor_content");
      }
    } catch {
      /* ignore parse errors */
    }
  }, [mode]);

  // ── Ensure content shape when package or schemas change ──
  useEffect(() => {
    if (!form.package) return;
    setForm((prev) => ({
      ...prev,
      content: ensureContentShape(prev.package, prev.content),
    }));
  }, [form.package, packageSchemas, ensureContentShape]);

  // ── Save handler ──
  const handleSave = async () => {
    if (!form.package) {
      setError("Package is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (mode === "create" && !form.template_id.trim()) {
      setError("Template ID is required.");
      return;
    }

    const schema = packageSchemas[form.package] ?? [];
    const missingFields = schema
      .filter((f) => f.required)
      .filter((f) => {
        const v = form.content[f.name];
        if (f.type === "boolean") return v === undefined || v === null;
        if (f.type === "number")
          return (
            v === undefined || v === null || v === "" || Number.isNaN(Number(v))
          );
        return String(v ?? "").trim().length === 0;
      })
      .map((f) => f.name);

    if (missingFields.length > 0) {
      setError(`Missing required fields: ${missingFields.join(", ")}`);
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const url =
        mode === "create"
          ? withBasePath("/api/templates")
          : withBasePath(
              `/api/templates/${encodeURIComponent(form.template_id)}`,
            );
      const method = mode === "create" ? "POST" : "PUT";
      const body =
        mode === "create"
          ? {
              name: form.name.trim(),
              template_id: form.template_id.trim(),
              description: form.description.trim() || undefined,
              package: form.package,
              content: form.content,
            }
          : {
              name: form.name.trim(),
              description: form.description.trim(),
              package: form.package,
              content: form.content,
            };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.message || data.error || `Failed to ${mode} template`,
        );
      }

      toast.success(
        mode === "create" ? "Template created" : "Template updated",
      );
      router.push(withBasePath("/templates"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to ${mode} template`;
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  /* ────────────────────────────────────────
   *  Shared sub-components for the panels
   * ──────────────────────────────────────── */

  /** The content-fields editor panel (left side on desktop / "Editor" tab on mobile) */
  const editorPanel = (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Content Fields</h3>
          {variableNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {variableNames.map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="font-mono text-[10px]"
                >
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Separator />

        {fields.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No content schema found. Select a package first.
          </p>
        ) : (
          <div className="space-y-4">
            {fields.map((field) => {
              const value = form.content[field.name];
              const id = `editor-field-${field.name}`;

              if (field.type === "boolean") {
                return (
                  <div
                    key={field.name}
                    className="flex items-center gap-2"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={!!value}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          content: {
                            ...prev.content,
                            [field.name]: e.target.checked,
                          },
                        }))
                      }
                      className="h-4 w-4 rounded border"
                    />
                    <Label htmlFor={id} className="text-sm">
                      {field.name}
                      {field.required && " *"}
                    </Label>
                  </div>
                );
              }

              const isLargeField =
                field.type === "text" || field.type === "string";
              const isMonacoActive = monacoFields.has(field.name);

              return (
                <div key={field.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={id} className="text-xs">
                      {field.name}
                      {field.required && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    {isLargeField && (
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`monaco-${field.name}`}
                          className="text-xs text-muted-foreground cursor-pointer"
                        >
                          Code editor
                        </Label>
                        <Switch
                          id={`monaco-${field.name}`}
                          checked={isMonacoActive}
                          onCheckedChange={() => toggleMonaco(field.name)}
                        />
                      </div>
                    )}
                  </div>

                  {isLargeField && isMonacoActive ? (
                    <div className="overflow-hidden rounded-md border">
                      <StableMonacoEditor
                        height="350px"
                        language="html"
                        theme={
                          resolvedTheme === "dark" ? "vs-dark" : "light"
                        }
                        value={String(value ?? "")}
                        onChange={(val) =>
                          setForm((prev) => ({
                            ...prev,
                            content: {
                              ...prev.content,
                              [field.name]: val ?? "",
                            },
                          }))
                        }
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          lineNumbers: "on",
                          wordWrap: "on",
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          tabSize: 2,
                          padding: { top: 8, bottom: 8 },
                        }}
                      />
                    </div>
                  ) : isLargeField ? (
                    <Textarea
                      id={id}
                      value={String(value ?? "")}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          content: {
                            ...prev.content,
                            [field.name]: e.target.value,
                          },
                        }))
                      }
                      placeholder={field.description}
                      rows={14}
                      className="font-mono text-sm"
                    />
                  ) : (
                    <Input
                      id={id}
                      type={
                        field.type === "email"
                          ? "email"
                          : field.type === "phone"
                            ? "tel"
                            : field.type === "number"
                              ? "number"
                              : "text"
                      }
                      value={String(value ?? "")}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          content: {
                            ...prev.content,
                            [field.name]:
                              field.type === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          },
                        }))
                      }
                      placeholder={field.description}
                    />
                  )}
                  {field.description && isLargeField && (
                    <p className="text-xs text-muted-foreground">
                      {field.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  /** The live-preview panel (right side on desktop / "Preview" tab on mobile) */
  const previewPanel = (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Live Preview</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPreviewExpanded(true)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <Separator />

        {fields.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Select a package to see a preview.
          </p>
        ) : (
          <ScrollArea className="max-h-[calc(100vh-280px)]">
            <div className="space-y-5 pr-2">
              {fields.map((field) => {
                const value = form.content[field.name];
                if (
                  value === undefined ||
                  value === null ||
                  value === ""
                )
                  return (
                    <div
                      key={`preview-${field.name}`}
                      className="space-y-1"
                    >
                      <p className="text-xs font-medium capitalize text-muted-foreground">
                        {field.name}
                      </p>
                      <p className="text-xs italic text-muted-foreground/50">
                        Empty
                      </p>
                    </div>
                  );

                const strValue = String(value);
                const isHtml =
                  typeof value === "string" &&
                  (strValue.includes("<") || strValue.length > 120);

                return (
                  <div
                    key={`preview-${field.name}`}
                    className="space-y-1"
                  >
                    <p className="text-xs font-medium capitalize text-muted-foreground">
                      {field.name}
                    </p>
                    {isHtml ? (
                      <HtmlPreview html={strValue} />
                    ) : field.type === "boolean" ? (
                      <Badge variant="secondary">
                        {strValue}
                      </Badge>
                    ) : (
                      <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                        {strValue}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );

  /** Fullscreen preview overlay — rendered via portal to escape sidebar */
  const previewOverlay = previewExpanded
    ? createPortal(
        <div className="fixed inset-0 z-9999 flex flex-col bg-background">
          {/* Header bar */}
          <div className="flex items-center justify-between border-b px-6 py-3">
            <h2 className="text-sm font-semibold">Live Preview</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPreviewExpanded(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          {/* Full-width scrollable preview content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-5">
              {fields.map((field) => {
                const value = form.content[field.name];
                if (value === undefined || value === null || value === "")
                  return (
                    <div key={`fs-preview-${field.name}`} className="space-y-1">
                      <p className="text-xs font-medium capitalize text-muted-foreground">
                        {field.name}
                      </p>
                      <p className="text-xs italic text-muted-foreground/50">
                        Empty
                      </p>
                    </div>
                  );

                const strValue = String(value);
                const isHtml =
                  typeof value === "string" &&
                  (strValue.includes("<") || strValue.length > 120);

                return (
                  <div key={`fs-preview-${field.name}`} className="space-y-1">
                    <p className="text-xs font-medium capitalize text-muted-foreground">
                      {field.name}
                    </p>
                    {isHtml ? (
                      <div className="rounded-lg border bg-white dark:bg-zinc-900">
                        <iframe
                          srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px;margin:0;color:#333;background:white}*{box-sizing:border-box}</style></head><body>${strValue}</body></html>`}
                          className="w-full border-0"
                          style={{ height: "80vh" }}
                          sandbox="allow-same-origin"
                          title={`${field.name} preview`}
                        />
                      </div>
                    ) : field.type === "boolean" ? (
                      <Badge variant="secondary">{strValue}</Badge>
                    ) : (
                      <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                        {strValue}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  if (isLoading) {
    return (
      <DashboardLayout
        title="Template Editor"
        description="Loading template..."
      >
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={mode === "create" ? "Create Template" : "Edit Template"}
      description="Full-screen editor with live preview"
    >
      <div className="space-y-4">
        {previewOverlay}
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(withBasePath("/templates"))}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(withBasePath("/templates"))}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1.5 h-4 w-4" />
              {isSaving
                ? "Saving..."
                : mode === "create"
                  ? "Create Template"
                  : "Save Changes"}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>
              {mode === "create" ? "Create failed" : "Update failed"}
            </AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Metadata row */}
        <Card>
          <CardContent className="grid gap-4 p-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Package</Label>
              <Select
                value={form.package}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    package: value,
                    content: ensureContentShape(value, prev.content),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose package" />
                </SelectTrigger>
                <SelectContent>
                  {packageOptions.map((pkg) => (
                    <SelectItem key={pkg} value={pkg}>
                      {pkg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Template ID</Label>
              <Input
                value={form.template_id}
                disabled={mode === "edit"}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    template_id: e.target.value,
                  }))
                }
                placeholder="welcome_template"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Welcome Message"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Desktop: side-by-side grid ── */}
        <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4">
          {editorPanel}
          <div className="lg:sticky lg:top-4 lg:self-start">
            {previewPanel}
          </div>
        </div>

        {/* ── Mobile: tabbed layout ── */}
        <div className="lg:hidden">
          <Tabs defaultValue="editor">
            <TabsList className="w-full">
              <TabsTrigger value="editor" className="flex-1 gap-1.5">
                <Code className="h-4 w-4" />
                Editor
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex-1 gap-1.5">
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="editor">{editorPanel}</TabsContent>
            <TabsContent value="preview">{previewPanel}</TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
