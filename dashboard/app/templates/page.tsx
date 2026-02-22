"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription} from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarDays,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {withBasePath } from "@/lib/utils";
import type {
  PluginMetadata,
  NotificationTemplateDetail,
  NotificationTemplateListItem,
} from "@/lib/types";
import { HtmlPreview } from "@/components/send/html-preview";
import { ScrollArea } from "@/components/ui/scroll-area";

const fetcher = (url: string) =>
  fetch(withBasePath(url)).then((res) => {
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return res.json();
  });

export default function TemplatesPage() {
  const router = useRouter();
  const [filterPackage, setFilterPackage] = useState<string>("__all__");
  const [deleteTarget, setDeleteTarget] = useState<NotificationTemplateListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Detail view state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] =
    useState<NotificationTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const {
    data: pluginData,
    isLoading: pluginsLoading,
    error: pluginsError,
  } = useSWR<PluginMetadata>("/api/plugins", fetcher);

  const packageOptions = useMemo(() => {
    const names = new Set<string>();
    Object.values(pluginData?.channels ?? {}).forEach((channel) => {
      channel.providers.forEach((provider) => {
        if (provider.name) names.add(provider.name);
      });
    });
    return Array.from(names).sort((left, right) => left.localeCompare(right));
  }, [pluginData]);

  const {
    data: allTemplates,
    isLoading: templatesLoading,
    error: templatesError,
    mutate: mutateTemplates,
  } = useSWR<NotificationTemplateListItem[]>("/api/templates", fetcher);

  // Client-side filter by selected package
  const templates = useMemo(() => {
    if (!allTemplates) return allTemplates;
    if (!filterPackage || filterPackage === "__all__") return allTemplates;
    return allTemplates.filter((t) => t.package === filterPackage);
  }, [allTemplates, filterPackage]);

  // Unique packages derived from loaded templates (for the filter dropdown)
  const availablePackages = useMemo(() => {
    if (!allTemplates) return packageOptions;
    const fromTemplates = Array.from(
      new Set(allTemplates.map((t) => t.package)),
    ).sort();
    // merge with packageOptions so user can filter even for empty packages
    const merged = Array.from(
      new Set([...packageOptions, ...fromTemplates]),
    ).sort();
    return merged;
  }, [allTemplates, packageOptions]);

  const extractVariables = (value: unknown): string[] => {
    const names = new Set<string>();
    // Matches: {var}  {{var}}  ${var}  ${{var}}
    const pattern = /\$?\{\{?\s*([a-zA-Z0-9_.-]+)\s*\}?\}/g;

    const visit = (node: unknown) => {
      if (typeof node === "string") {
        for (const match of node.matchAll(pattern)) {
          if (match[1]) {
            names.add(match[1]);
          }
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
    return Array.from(names).sort((left, right) => left.localeCompare(right));
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        withBasePath(
          `/api/templates/${encodeURIComponent(deleteTarget.template_id)}`,
        ),
        {
          method: "DELETE",
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to delete template",
        );
      }

      toast.success("Template deleted");
      setDeleteTarget(null);
      await mutateTemplates();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete template",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const openDetailDialog = async (templateId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const response = await fetch(
        withBasePath(`/api/templates/${encodeURIComponent(templateId)}`),
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to load template",
        );
      }
      setDetailData(data as NotificationTemplateDetail);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load template",
      );
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <DashboardLayout
      title="Templates"
      description="Manage notification templates by provider package"
    >
      <div className="space-y-6">
        {/* Toolbar — hidden when there are no templates at all */}
        {(templatesLoading ||
          pluginsLoading ||
          !!templatesError ||
          !!pluginsError ||
          (allTemplates?.length ?? 0) > 0) && (
          <div className="flex items-center justify-end gap-3">
            {(pluginsError || templatesError) && (
              <Alert variant="destructive" className="flex-1 py-2">
                <AlertDescription>
                  {((pluginsError || templatesError) as Error).message}
                </AlertDescription>
              </Alert>
            )}
            <Select value={filterPackage} onValueChange={setFilterPackage}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Filter by package name" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All packages</SelectItem>
                {availablePackages.map((pkg) => (
                  <SelectItem key={pkg} value={pkg}>
                    {pkg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={() => router.push(withBasePath("/templates/editor?mode=create"))}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </div>
        )}

        {/* Loading skeletons */}
        {(templatesLoading || pluginsLoading) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Template grid */}
        {!templatesLoading && !templatesError && (
          <>
            {(templates ?? []).length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <FileText className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                  <h3 className="mb-2 text-xl font-semibold">
                    {filterPackage && filterPackage !== "__all__"
                      ? `No templates for "${filterPackage}"`
                      : "No Templates Yet"}
                  </h3>
                  <p className="mx-auto mb-6 max-w-md text-muted-foreground">
                    {filterPackage && filterPackage !== "__all__"
                      ? "Try selecting a different package or create a new template for this package."
                      : "Get started by creating your first notification template."}
                  </p>
                  <Button type="button" onClick={() => router.push(withBasePath("/templates/editor?mode=create"))}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {templates!.map((template) => (
                  <Card
                    key={template.template_id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() => openDetailDialog(template.template_id)}
                  >
                    <CardContent className="flex flex-col gap-4 p-5">
                      {/* Header row: name + actions */}
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-base font-semibold leading-tight">
                          {template.name}
                        </span>
                        <div className="flex shrink-0 gap-0.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(withBasePath(`/templates/editor?mode=edit&templateId=${encodeURIComponent(template.template_id)}`));
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(template);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Template ID badge */}
                      <Badge
                        variant="secondary"
                        className="w-fit font-mono text-xs"
                      >
                        {template.template_id}
                      </Badge>

                      {/* Description */}
                      <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                        {template.description || (
                          <span className="italic opacity-50">
                            No description
                          </span>
                        )}
                      </p>

                      {/* Footer: created_at */}
                      <div className="border-t pt-3">
                        {template.created_at ? (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {format(new Date(template.created_at), "PP")}
                          </div>
                        ) : (
                          <div className="h-4" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Detail dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                {detailLoading
                  ? "Loading..."
                  : (detailData?.name ?? "Template")}
              </DialogTitle>
              {detailData && (
                <DialogDescription className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {detailData.template_id}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {detailData.package}
                  </Badge>
                  {detailData.created_at && (
                    <span className="text-xs text-muted-foreground">
                      Created {format(new Date(detailData.created_at), "PPp")}
                    </span>
                  )}
                </DialogDescription>
              )}
            </DialogHeader>

            <ScrollArea className="flex-1 overflow-y-auto pr-1">
              {detailLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : detailData ? (
                <div className="space-y-5 py-2">
                  {detailData.description && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Description
                      </p>
                      <p className="text-sm">{detailData.description}</p>
                    </div>
                  )}

                  {/* Content fields — non-preview */}
                  {Object.keys(detailData.content ?? {}).length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Content Fields
                      </p>
                      <div className="space-y-3 rounded-md border p-3">
                        {Object.entries(detailData.content).map(
                          ([key, value]) => {
                            // Render HTML/long string as HtmlPreview
                            if (
                              typeof value === "string" &&
                              (value.includes("<") || value.length > 120)
                            ) {
                              return (
                                <div key={key} className="space-y-1">
                                  <p className="text-xs font-medium capitalize text-muted-foreground">
                                    {key}
                                  </p>
                                  <HtmlPreview html={value} />
                                </div>
                              );
                            }
                            return (
                              <div key={key} className="flex gap-2">
                                <span className="w-32 shrink-0 text-xs font-medium capitalize text-muted-foreground">
                                  {key}
                                </span>
                                <span className="break-all text-sm">
                                  {typeof value === "boolean"
                                    ? value.toString()
                                    : typeof value === "object"
                                      ? JSON.stringify(value, null, 2)
                                      : String(value ?? "")}
                                </span>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}

                  {/* Detected variables */}
                  {(() => {
                    const vars = extractVariables(detailData.content);
                    return vars.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Template Variables
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {vars.map((v) => (
                            <Badge
                              key={v}
                              variant="outline"
                              className="font-mono text-xs"
                            >
                              {`{{${v}}}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : null}
            </ScrollArea>

            <div className="flex shrink-0 justify-end gap-2 border-t pt-4">
              <Button
                variant="destructive"
                onClick={() => {
                  if (detailData) {
                    setDeleteTarget(detailData);
                    setDetailOpen(false);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `This will permanently delete ${deleteTarget.name} (${deleteTarget.template_id}).`
                  : "This will permanently delete this template."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={handleDeleteTemplate}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
