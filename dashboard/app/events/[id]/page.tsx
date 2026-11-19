"use client";

import { use } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatusBadge } from "@/components/events/status-badge";
import { ChannelBadge } from "@/components/events/channel-badge";
import { StructuredDataViewer } from "@/components/events/structured-data-viewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

import {
    ArrowLeft,
    RefreshCw,
    Trash2,
    Clock,
    Link as LinkIcon,
    Copy,
    Check,
    Pencil,
    Plus,
    CurlyBraces,
    Eye
} from "lucide-react";
import { format } from "date-fns";
import {
    Notification,
    NOTIFICATION_STATUS,
    PluginMetadata,
    ProviderMetadata,
    StorageStatus,
    NotificationTemplateListItem,
    NotificationTemplateDetail,
    EditNotificationPayload,
    FileAttachmentItem,
} from "@/lib/types";
import Link from "next/link";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { withBasePath, pruneEmptyValues, extractTemplateVariables, showErrorToast } from "@/lib/utils";
import {
    apiClient,
    notificationService,
    templateService,
    storageService,
} from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { FileAttachmentUpload } from "@/components/send/file-attachment-upload";
import { HtmlPreview } from "@/components/send/html-preview";

const fetcher = <T,>(url: string): Promise<T> => apiClient.get(url) as unknown as Promise<T>;

interface PageProps {
    params: Promise<{ id: string }>;
}

function CopyableValue({ value, label }: { value: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success(label ? `Copied ${label}` : "Copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    };

    return (
        <div className="flex items-start justify-between gap-1.5 font-mono text-xs bg-muted/50 px-2 py-1 rounded w-full min-w-0">
            <span className="break-all [overflow-wrap:anywhere] flex-1">{value}</span>
            <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                onClick={handleCopy}
                title="Copy"
            >
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
        </div>
    );
}

export default function EventDetailPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const router = useRouter();
    const [isRetrying, setIsRetrying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [retryDialogOpen, setRetryDialogOpen] = useState(false);

    // Edit Dialog States
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<string>("__default__");
    const [contentMode, setContentMode] = useState<"content" | "template">("content");
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
    const [recipientData, setRecipientData] = useState<Record<string, unknown>>({});
    const [contentData, setContentData] = useState<Record<string, unknown>>({});
    const [variablesData, setVariablesData] = useState<Record<string, string>>({});
    const [variablesRaw, setVariablesRaw] = useState<string>("{}");
    const [variablesMode, setVariablesMode] = useState<"pairs" | "raw">("pairs");
    const [variablesJsonError, setVariablesJsonError] = useState<string | null>(null);
    const [webhookUrl, setWebhookUrl] = useState<string>("");
    const [scheduledAt, setScheduledAt] = useState<Date | undefined>(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [templates, setTemplates] = useState<NotificationTemplateListItem[]>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [selectedTemplateDetail, setSelectedTemplateDetail] = useState<NotificationTemplateDetail | null>(null);
    const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);

    const { data: notification, isLoading, error, mutate } = useSWR<Notification>(
        `/api/notifications/${resolvedParams.id}`,
        fetcher
    );

    // Fetch plugin metadata for dynamic schema rendering
    const { data: plugins } = useSWR<PluginMetadata>('/api/plugins', fetcher);

    // Fetch storage status on mount
    useEffect(() => {
        storageService.getStatus()
            .then((res) => setStorageStatus(res))
            .catch(() => setStorageStatus(null));
    }, []);

    // Helper to find provider metadata based on channel and provider ID
    const getProviderMetadata = (
        channel: string,
        providerId: string | undefined
    ): ProviderMetadata | undefined => {
        if (!plugins?.channels[channel]) return undefined;
        const channelMeta = plugins.channels[channel];
        // Find by providerId, or use default, or use first provider
        return channelMeta.providers.find(p => p.id === providerId)
            || channelMeta.providers.find(p => p.id === channelMeta.default)
            || channelMeta.providers[0];
    };

    // Active provider metadata for the edit dialog
    const activeEditProviderMeta = notification
        ? getProviderMetadata(
            notification.channel,
            selectedProvider === "__default__" ? undefined : selectedProvider
        )
        : undefined;

    // Fetch templates whenever the active provider in the edit dialog changes
    useEffect(() => {
        if (!editDialogOpen || !activeEditProviderMeta?.name) {
            return;
        }

        let cancelled = false;
        setIsLoadingTemplates(true);

        templateService.list(activeEditProviderMeta.name)
            .then((res) => {
                if (!cancelled) {
                    const list = Array.isArray(res) ? res : [];
                    setTemplates(list);
                }
            })
            .catch(() => {
                if (!cancelled) setTemplates([]);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingTemplates(false);
            });

        return () => {
            cancelled = true;
        };
    }, [editDialogOpen, activeEditProviderMeta?.name]);

    // Fetch template detail when a template is selected
    useEffect(() => {
        if (!selectedTemplateId || selectedTemplateId === "__none__") {
            setSelectedTemplateDetail(null);
            return;
        }

        let cancelled = false;
        templateService.get(selectedTemplateId)
            .then((detail) => {
                if (!cancelled) {
                    setSelectedTemplateDetail(detail);

                    // Auto-populate template variables into variables section without duplicates
                    const extractedVars = extractTemplateVariables(detail.content);
                    if (extractedVars.length > 0) {
                        setVariablesData((prev) => {
                            const next = { ...prev };
                            let hasNew = false;
                            for (const name of extractedVars) {
                                if (!(name in next)) {
                                    next[name] = "";
                                    hasNew = true;
                                }
                            }
                            if (hasNew) {
                                setVariablesRaw(JSON.stringify(next, null, 2));
                            }
                            return next;
                        });
                    }
                }
            })
            .catch(() => {
                if (!cancelled) setSelectedTemplateDetail(null);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedTemplateId]);

    const getTemplatePreviewHtml = (content: Record<string, unknown> | undefined): string => {
        if (!content) return "";
        const preferredFields = ["body", "message", "html", "text"];
        for (const field of preferredFields) {
            const value = content[field];
            if (typeof value === "string") return value;
        }
        const firstString = Object.values(content).find((value) => typeof value === "string");
        if (typeof firstString === "string") return firstString;
        return JSON.stringify(content, null, 2);
    };

    const handleOpenEdit = () => {
        if (!notification) return;

        const rawContent = (notification.content as Record<string, unknown>)?.[notification.channel] as Record<string, unknown> | undefined
            || notification.content as Record<string, unknown>;

        setSelectedProvider(notification.provider || "__default__");
        setContentMode("content");
        setSelectedTemplateId("");
        setSelectedTemplateDetail(null);
        setRecipientData(notification.recipient ? JSON.parse(JSON.stringify(notification.recipient)) : {});
        setContentData(rawContent ? JSON.parse(JSON.stringify(rawContent)) : {});
        const currentVars = notification.variables ? JSON.parse(JSON.stringify(notification.variables)) : {};
        setVariablesData(currentVars);
        setVariablesRaw(JSON.stringify(currentVars, null, 2));
        setVariablesMode("pairs");
        setVariablesJsonError(null);
        setWebhookUrl(notification.webhook_url || "");
        setScheduledAt(notification.scheduled_at ? new Date(notification.scheduled_at) : undefined);
        setEditDialogOpen(true);
    };

    const handleSwitchVarMode = (mode: "pairs" | "raw") => {
        if (mode === "raw") {
            setVariablesRaw(JSON.stringify(variablesData, null, 2));
            setVariablesJsonError(null);
        } else {
            try {
                const parsed = JSON.parse(variablesRaw);
                if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                    setVariablesData(parsed as Record<string, string>);
                    setVariablesJsonError(null);
                }
            } catch {
                toast.error("Invalid JSON in variables. Fix errors before switching to pairs view.");
                return;
            }
        }
        setVariablesMode(mode);
    };

    const handleVarRawChange = (text: string) => {
        setVariablesRaw(text);
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                setVariablesData(parsed as Record<string, string>);
                setVariablesJsonError(null);
            } else {
                setVariablesJsonError("Variables must be an object of key-value pairs");
            }
        } catch (err) {
            setVariablesJsonError((err as Error).message);
        }
    };

    const updateVarKey = (oldKey: string, newKey: string) => {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(variablesData)) {
            if (k === oldKey) {
                next[newKey] = v;
            } else {
                next[k] = v;
            }
        }
        setVariablesData(next);
    };

    const updateVarValue = (key: string, value: string) => {
        setVariablesData((prev) => ({ ...prev, [key]: value }));
    };

    const removeVarKey = (key: string) => {
        const next = { ...variablesData };
        delete next[key];
        setVariablesData(next);
    };

    const addVarPair = () => {
        const baseKey = "key";
        let counter = 1;
        while (`${baseKey}_${counter}` in variablesData) {
            counter++;
        }
        setVariablesData((prev) => ({ ...prev, [`${baseKey}_${counter}`]: "" }));
    };

    const handleSaveAndRequeue = async () => {
        if (!notification) return;

        if (!webhookUrl || !webhookUrl.trim()) {
            toast.error("Webhook URL is required");
            return;
        }

        try {
            new URL(webhookUrl.trim());
        } catch {
            toast.error("Please enter a valid Webhook URL (e.g. https://example.com/webhook)");
            return;
        }

        if (contentMode === "template" && !selectedTemplateId) {
            toast.error("Please select a template or switch to Manual Content");
            return;
        }

        if (variablesMode === "raw" && variablesJsonError) {
            toast.error(`Invalid variables JSON: ${variablesJsonError}`);
            return;
        }

        setIsSubmitting(true);
        try {
            const cleanedRecipient = (pruneEmptyValues(recipientData) || {}) as Record<string, unknown>;
            const payload: EditNotificationPayload = {
                provider: selectedProvider === "__default__" ? null : selectedProvider,
                webhook_url: webhookUrl.trim(),
                scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
                recipient: cleanedRecipient,
                variables: variablesData,
            };

            if (contentMode === "template" && selectedTemplateId) {
                payload.template_id = selectedTemplateId;
                if (contentData?.attachments && Array.isArray(contentData.attachments) && contentData.attachments.length > 0) {
                    payload.content = { attachments: contentData.attachments };
                } else {
                    payload.content = { attachments: [] };
                }
            } else {
                payload.template_id = null;
                const cleanedContent = (pruneEmptyValues(contentData) || {}) as Record<string, unknown>;
                if (!contentData?.attachments || !Array.isArray(contentData.attachments) || contentData.attachments.length === 0) {
                    delete cleanedContent.attachments;
                } else {
                    cleanedContent.attachments = contentData.attachments;
                }
                payload.content = cleanedContent;
            }

            await notificationService.updateAndRequeue(notification._id, payload);
            toast.success("Notification updated and queued for reprocessing");
            setEditDialogOpen(false);
            mutate();
        } catch (err) {
            showErrorToast(err, "Failed to edit and requeue notification");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRetry = async () => {
        if (!notification) return;

        setIsRetrying(true);
        try {
            await notificationService.retry(notification._id);
            toast.success("Notification queued for retry");
            mutate();
            setRetryDialogOpen(false);
        } catch (err) {
            const error = err as Error;
            toast.error(error.message || "Failed to retry notification");
        } finally {
            setIsRetrying(false);
        }
    };

    const handleDelete = async () => {
        if (!notification) return;

        setIsDeleting(true);
        try {
            await notificationService.delete(notification._id);
            toast.success("Notification deleted");
            router.push(withBasePath("/events"));
        } catch (err) {
            const error = err as Error;
            toast.error(error.message || "Failed to delete notification");
        } finally {
            setIsDeleting(false);
            setDeleteDialogOpen(false);
        }
    };

    if (isLoading) {
        return (
            <DashboardLayout title="Event Details" description="Loading...">
                <div className="space-y-6">
                    <Skeleton className="h-10 w-32" />
                    <div className="grid gap-6 md:grid-cols-2">
                        <Skeleton className="h-64" />
                        <Skeleton className="h-64" />
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (error || !notification) {
        return (
            <DashboardLayout title="Event Details" description="Error">
                <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">Notification not found</p>
                    <Link href={withBasePath("/events")}>
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Events
                        </Button>
                    </Link>
                </div>
            </DashboardLayout>
        );
    }

    const isFailed = notification.status === NOTIFICATION_STATUS.failed;
    const providerMeta = getProviderMetadata(notification.channel, notification.provider);
    const channelMeta = plugins?.channels[notification.channel];
    const channelProviders = channelMeta?.providers || [];

    // Content may be nested under channel key or flat
    const channelContent = (notification.content as Record<string, unknown>)?.[notification.channel] as Record<string, unknown> | undefined
        || notification.content as Record<string, unknown>;

    return (
        <DashboardLayout
            title="Event Details"
            description={`Request ID: ${notification.request_id}`}
        >
            <div className="space-y-6">
                {/* Header Actions */}
                <div className="flex items-center justify-between">
                    <Link href={withBasePath("/events")}>
                        <Button variant="outline" size="sm">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2">
                        {isFailed && (
                            <>
                                <Button
                                    onClick={() => setRetryDialogOpen(true)}
                                    disabled={isRetrying}
                                    variant="outline"
                                >
                                    <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
                                    {isRetrying ? "Retrying..." : "Retry"}
                                </Button>

                                {/* Retry Dialog */}
                                <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Retry Notification</DialogTitle>
                                            <DialogDescription>
                                                This will reset the notification to pending status and reprocess it.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setRetryDialogOpen(false)}>
                                                Cancel
                                            </Button>
                                            <Button onClick={handleRetry} disabled={isRetrying}>
                                                {isRetrying ? (
                                                    <>
                                                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                                        Retrying...
                                                    </>
                                                ) : (
                                                    <>
                                                        <RefreshCw className="mr-2 h-4 w-4" />
                                                        Retry
                                                    </>
                                                )}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                {/* Edit Button for Failed Notifications */}
                                <Button
                                    onClick={handleOpenEdit}
                                    variant="default"
                                    size="sm"
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                </Button>

                                {/* Edit & Requeue Dialog */}
                                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                                        <DialogHeader>
                                            <DialogTitle>Edit & Requeue Failed Notification</DialogTitle>
                                            <DialogDescription>
                                                Modify permitted fields of this failed notification. Saving will reset the notification to pending and will be processed again.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="space-y-6 py-2">
                                            {/* Block 1: Provider */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold">Provider</Label>
                                                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Select provider" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__default__">
                                                            System Default Provider ({channelMeta?.providers.find(p => p.id === channelMeta.default)?.displayName || "Default"})
                                                        </SelectItem>
                                                        {channelProviders.map((p) => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.displayName} ({p.id})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Select a provider registered for the {notification.channel} channel, or leave as Default.
                                                </p>
                                            </div>

                                            <Separator />

                                            {/* Block 2: Recipient Block */}
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-sm font-semibold">Recipient</Label>
                                                </div>
                                                <div className="p-3.5 border rounded-lg bg-card">
                                                    <StructuredDataViewer
                                                        data={recipientData}
                                                        schema={activeEditProviderMeta?.recipientFields}
                                                        editable
                                                        onChange={(newRec) => setRecipientData(newRec as Record<string, unknown>)}
                                                    />
                                                </div>
                                            </div>

                                            <Separator />

                                            {/* Block 3: Content Block (Tabs layout matching single-notification-form.tsx) */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between flex-wrap gap-2">
                                                    <div>
                                                        <Label className="text-sm font-semibold">Content</Label>
                                                        {activeEditProviderMeta && (
                                                            <p className="text-[11px] text-muted-foreground">
                                                                Provider: {activeEditProviderMeta.displayName} ({activeEditProviderMeta.id})
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Tabs
                                                        value={contentMode}
                                                        onValueChange={(val) => setContentMode(val as "content" | "template")}
                                                    >
                                                        <TabsList className="h-8">
                                                            <TabsTrigger value="content" className="text-xs px-3 py-1">
                                                                Manual Content
                                                            </TabsTrigger>
                                                            <TabsTrigger value="template" className="text-xs px-3 py-1">
                                                                Template
                                                            </TabsTrigger>
                                                        </TabsList>
                                                    </Tabs>
                                                </div>

                                                <div className="p-3.5 border rounded-lg bg-card space-y-4">
                                                    {contentMode === "content" ? (
                                                        <StructuredDataViewer
                                                            data={contentData}
                                                            schema={activeEditProviderMeta?.contentFields?.filter(
                                                                (f) => f.name !== "attachments" && f.type !== "attachment"
                                                            )}
                                                            excludeKeys={["attachments"]}
                                                            editable
                                                            onChange={(newContent) => setContentData(newContent as Record<string, unknown>)}
                                                        />
                                                    ) : (
                                                        <div className="space-y-3">
                                                            <div className="space-y-1.5">
                                                                <Label className="text-xs">Select Template</Label>
                                                                <Select
                                                                    value={selectedTemplateId || "__none__"}
                                                                    onValueChange={(val) => setSelectedTemplateId(val === "__none__" ? "" : val)}
                                                                >
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder={isLoadingTemplates ? "Loading templates..." : "Select template"} />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="__none__">-- None (select a template) --</SelectItem>
                                                                        {templates.map((template) => (
                                                                            <SelectItem key={template.template_id} value={template.template_id}>
                                                                                {template.name} ({template.template_id})
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            {selectedTemplateDetail && (
                                                                <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                                                                    {selectedTemplateDetail.description && (
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {selectedTemplateDetail.description}
                                                                        </p>
                                                                    )}
                                                                    {(() => {
                                                                        const previewHtml = getTemplatePreviewHtml(selectedTemplateDetail.content);
                                                                        return previewHtml ? (
                                                                            <div className="space-y-1">
                                                                                <Label className="text-xs text-muted-foreground">Preview</Label>
                                                                                <HtmlPreview html={previewHtml} variables={variablesData} />
                                                                            </div>
                                                                        ) : null;
                                                                    })()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Common File Attachment Block */}
                                                    {(() => {
                                                        const attachmentField = activeEditProviderMeta?.contentFields?.find(
                                                            (f) => f.name === "attachments" || f.type === "attachment"
                                                        );
                                                        if (!attachmentField) return null;
                                                        if (attachmentField.attachmentConfig?.enabled === false) {
                                                            return (
                                                                <p className="text-xs text-muted-foreground italic">
                                                                    File attachments are disabled for this provider.
                                                                </p>
                                                            );
                                                        }
                                                        return storageStatus?.hasActiveProvider ? (
                                                            <div className="pt-2 border-t">
                                                                <FileAttachmentUpload
                                                                    channel={notification.channel}
                                                                    providerId={selectedProvider === "__default__" ? undefined : selectedProvider}
                                                                    attachments={
                                                                        Array.isArray(contentData?.attachments)
                                                                            ? (contentData.attachments as unknown as FileAttachmentItem[])
                                                                            : []
                                                                    }
                                                                    onChange={(atts) =>
                                                                        setContentData((prev) => {
                                                                            const next = { ...prev };
                                                                            if (atts.length === 0) {
                                                                                delete next.attachments;
                                                                            } else {
                                                                                next.attachments = atts;
                                                                            }
                                                                            return next;
                                                                        })
                                                                    }
                                                                    config={attachmentField.attachmentConfig}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-muted-foreground italic">
                                                                No active storage provider configured for file attachments.
                                                            </p>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            <Separator />

                                            {/* Block 4: Variables (Key-Value Pair JSON Editor) */}
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-sm font-semibold">Variables</Label>
                                                    <div className="flex items-center gap-1.5">
                                                        <Button
                                                            type="button"
                                                            variant={variablesMode === "pairs" ? "default" : "ghost"}
                                                            size="sm"
                                                            className="h-7 text-xs px-2.5"
                                                            onClick={() => handleSwitchVarMode("pairs")}
                                                        >
                                                            <Eye/> Formatted
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant={variablesMode === "raw" ? "default" : "ghost"}
                                                            size="sm"
                                                            className="h-7 text-xs px-2.5"
                                                            onClick={() => handleSwitchVarMode("raw")}
                                                        >
                                                            <CurlyBraces/> Raw JSON
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="p-3.5 border rounded-lg bg-card space-y-3">
                                                    {variablesMode === "raw" ? (
                                                        <div className="space-y-1">
                                                            <Textarea
                                                                className="font-mono text-xs min-h-[100px]"
                                                                value={variablesRaw}
                                                                onChange={(e) => handleVarRawChange(e.target.value)}
                                                                placeholder="{}"
                                                            />
                                                            {variablesJsonError && (
                                                                <p className="text-xs text-red-500 font-mono">
                                                                    Invalid JSON: {variablesJsonError}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {Object.entries(variablesData).length === 0 ? (
                                                                <p className="text-xs text-muted-foreground italic">No variables set.</p>
                                                            ) : (
                                                                Object.entries(variablesData).map(([k, v], idx) => (
                                                                    <div key={idx} className="flex items-center gap-2">
                                                                        <Input
                                                                            className="h-8 text-xs flex-1 font-mono"
                                                                            placeholder="Variable key"
                                                                            value={k}
                                                                            onChange={(e) => updateVarKey(k, e.target.value)}
                                                                        />
                                                                        <Input
                                                                            className="h-8 text-xs flex-1"
                                                                            placeholder="Value"
                                                                            value={v}
                                                                            onChange={(e) => updateVarValue(k, e.target.value)}
                                                                        />
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                                                            onClick={() => removeVarKey(k)}
                                                                            title={`Remove variable ${k}`}
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                ))
                                                            )}
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 text-xs"
                                                                onClick={addVarPair}
                                                            >
                                                                <Plus className="h-3 w-3 mr-1" /> Add Variable
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <Separator />

                                            {/* Block 5: Webhook URL */}
                                            <div className="space-y-1.5">
                                                <Label className="text-sm font-semibold">Webhook URL</Label>
                                                <Input
                                                    value={webhookUrl}
                                                    onChange={(e) => setWebhookUrl(e.target.value)}
                                                    placeholder="https://example.com/api/webhook"
                                                    className="font-mono text-xs"
                                                />
                                                <p className="text-[11px] text-muted-foreground">
                                                    Callback URL for delivery status updates.
                                                </p>
                                            </div>

                                            <Separator />

                                            {/* Block 6: Scheduled (using DateTimePicker) */}
                                            <div className="space-y-1.5">
                                                <Label className="text-sm font-semibold">Scheduled Time</Label>
                                                <DateTimePicker
                                                    value={scheduledAt}
                                                    onChange={setScheduledAt}
                                                    placeholder="Send immediately or pick a scheduled date & time"
                                                />
                                                <p className="text-[11px] text-muted-foreground">
                                                    Leave empty to process immediately, or select a future time.
                                                </p>
                                            </div>
                                        </div>

                                        <DialogFooter className="pt-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => setEditDialogOpen(false)}
                                                disabled={isSubmitting}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={handleSaveAndRequeue}
                                                disabled={isSubmitting}
                                            >
                                                {isSubmitting ? "Saving & Requeuing..." : "Save & Requeue"}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </>
                        )}
                        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Delete Notification</DialogTitle>
                                    <DialogDescription>
                                        Are you sure you want to delete this notification? This action cannot be undone.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={handleDelete}
                                        disabled={isDeleting}
                                    >
                                        {isDeleting ? "Deleting..." : "Delete"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Layout Row 1: Notification Info | Identifiers */}
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Status & Info Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Notification Info</CardTitle>
                            <CardDescription>Basic details about this notification</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <StatusBadge status={notification.status} />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Channel</span>
                                <ChannelBadge channel={notification.channel} />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Provider</span>
                                <span className="text-sm font-medium">
                                    {notification.provider || 'Default'}
                                </span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Retry Count</span>
                                <span className="font-mono">{notification.retry_count}</span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Clock className="h-3 w-3" />
                                    Created
                                </span>
                                <span className="text-sm">
                                    {format(new Date(notification.created_at), "PPpp")}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Clock className="h-3 w-3" />
                                    Updated
                                </span>
                                <span className="text-sm">
                                    {format(new Date(notification.updated_at), "PPpp")}
                                </span>
                            </div>
                            {notification.scheduled_at && (
                                <>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Scheduled For</span>
                                        <span className="text-sm">
                                            {format(new Date(notification.scheduled_at), "PPpp")}
                                        </span>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Identifiers Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Identifiers</CardTitle>
                            <CardDescription>Request identifiers and callback endpoints</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3.5">
                            <div className="space-y-1">
                                <span className="text-sm text-muted-foreground block">
                                    Notification ID
                                </span>
                                <CopyableValue value={notification._id} label="Notification ID" />
                            </div>
                            <Separator />
                            <div className="space-y-1">
                                <span className="text-sm text-muted-foreground block">
                                    Request ID
                                </span>
                                <CopyableValue value={notification.request_id} label="Request ID" />
                            </div>
                            <Separator />
                            <div className="space-y-1">
                                <span className="text-sm text-muted-foreground block">
                                    Client ID
                                </span>
                                <CopyableValue value={notification.client_id} label="Client ID" />
                            </div>
                            {notification.client_name && (
                                <>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">
                                            Client Name
                                        </span>
                                        <span className="text-sm font-medium">{notification.client_name}</span>
                                    </div>
                                </>
                            )}
                            {notification.webhook_url && (
                                <>
                                    <Separator />
                                    <div className="space-y-1">
                                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                                            <LinkIcon className="h-3 w-3" />
                                            Webhook URL
                                        </span>
                                        <CopyableValue value={notification.webhook_url} label="Webhook URL" />
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Layout Row 2: Recipient */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recipient</CardTitle>
                        <CardDescription>Recipient destination details and parameters</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StructuredDataViewer
                            data={notification.recipient}
                            schema={providerMeta?.recipientFields}
                        />
                    </CardContent>
                </Card>

                {/* Layout Row 3: Content */}
                <Card>
                    <CardHeader>
                        <CardTitle>Content</CardTitle>
                        <CardDescription>Notification payload and message content</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StructuredDataViewer
                            data={channelContent}
                            schema={providerMeta?.contentFields}
                        />
                    </CardContent>
                </Card>

                {/* Layout Row 4: Provider Execution History */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Provider Execution History</CardTitle>
                                <CardDescription>
                                    Timeline of provider dispatch attempts, rate limit cascades, and failure reasons
                                </CardDescription>
                            </div>
                            {notification.provider_history && notification.provider_history.length > 0 && (
                                <span className="text-xs font-mono px-2 py-1 bg-muted rounded-full text-muted-foreground">
                                    {notification.provider_history.length} {notification.provider_history.length === 1 ? 'attempt' : 'attempts'}
                                </span>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {(!notification.provider_history || notification.provider_history.length === 0) ? (
                            <div className="text-center py-6 text-muted-foreground text-sm">
                                No intermediate provider cascade attempts recorded.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {notification.provider_history.map((attempt, index) => {
                                    const isSuccess = attempt.status === 'delivered';
                                    const isRateLimit = attempt.status === 'rate_limited';

                                    return (
                                        <div
                                            key={index}
                                            className={`p-4 rounded-lg border text-sm flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                                isSuccess
                                                    ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
                                                    : isRateLimit
                                                    ? 'bg-yellow-50/50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900'
                                                    : 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900'
                                            }`}
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold">{index + 1}. {attempt.provider}</span>
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                            isSuccess
                                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                                : isRateLimit
                                                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                        }`}
                                                    >
                                                        {isSuccess ? 'Delivered' : isRateLimit ? 'Rate Limited' : 'Failed'}
                                                    </span>
                                                    {attempt.error_code && (
                                                        <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                            {attempt.error_code}
                                                        </span>
                                                    )}
                                                    {attempt.duration_ms !== undefined && (
                                                        <span className="text-xs text-muted-foreground">
                                                            ({attempt.duration_ms}ms)
                                                        </span>
                                                    )}
                                                </div>
                                                {attempt.error_message && (
                                                    <p className="text-xs text-muted-foreground font-mono mt-1">
                                                        {attempt.error_message}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                                <Clock className="h-3 w-3" />
                                                {format(new Date(attempt.attempted_at), "PPpp")}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Error Message (if failed) */}
                {isFailed && notification.error_message && (
                    <Card className="border-red-200 dark:border-red-900">
                        <CardHeader>
                            <CardTitle className="text-red-600 dark:text-red-400">Error Details</CardTitle>
                            <CardDescription>This notification failed with the following error</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-800 dark:text-red-300 font-mono">
                                {notification.error_message}
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    );
}
