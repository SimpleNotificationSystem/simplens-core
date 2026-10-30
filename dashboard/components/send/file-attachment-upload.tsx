"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileUp, Paperclip, X, Loader2, FileIcon, CheckCircle2 } from "lucide-react";
import type { FileAttachmentItem, FileAttachmentConfig } from "@/lib/types";
import { fileService } from "@/lib/api-client";
import { toast } from "sonner";

interface FileAttachmentUploadProps {
    channel: string;
    attachments?: FileAttachmentItem[];
    onChange: (attachments: FileAttachmentItem[]) => void;
    config?: FileAttachmentConfig;
    disabled?: boolean;
}

function formatBytes(bytes: number, decimals = 1): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function FileAttachmentUpload({
    attachments = [],
    onChange,
    config,
    disabled = false,
}: FileAttachmentUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const maxCount = config?.maxCount || 10;
    const maxFileSize = config?.maxFileSize || 50 * 1024 * 1024; // 50MB default

    const handleFiles = async (files: FileList | File[]) => {
        const fileList = Array.from(files);
        if (fileList.length === 0) return;

        if (attachments.length + fileList.length > maxCount) {
            toast.error(`Maximum of ${maxCount} file attachments allowed per notification`);
            return;
        }

        for (const file of fileList) {
            if (file.size > maxFileSize) {
                toast.error(`File '${file.name}' exceeds the maximum size limit of ${formatBytes(maxFileSize)}`);
                return;
            }
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            fileList.forEach((file) => {
                formData.append("files", file);
            });

            const res = await fileService.upload(formData);
            if (res.success && res.files) {
                const updated = [...attachments, ...res.files];
                onChange(updated);
                toast.success(`Successfully uploaded ${res.files.length} attachment(s)`);
            } else {
                toast.error("File upload failed");
            }
        } catch (err: unknown) {
            const errorMsg =
                (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                (err instanceof Error ? err.message : "Failed to upload attachments");
            toast.error(errorMsg);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleRemove = (id: string) => {
        const updated = attachments.filter((att) => att.id !== id);
        onChange(updated);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && !isUploading) {
            setDragActive(true);
        }
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (disabled || isUploading) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    };

    return (
        <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4" />
                    File Attachments
                    <span className="text-xs text-muted-foreground font-normal">
                        ({attachments.length}/{maxCount} files, max {formatBytes(maxFileSize)})
                    </span>
                </Label>
            </div>

            {/* Dropzone */}
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    dragActive
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                } ${disabled || isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    disabled={disabled || isUploading}
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />

                <div className="flex flex-col items-center justify-center gap-1.5">
                    {isUploading ? (
                        <>
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <p className="text-xs text-muted-foreground">Uploading files to storage...</p>
                        </>
                    ) : (
                        <>
                            <FileUp className="h-6 w-6 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">Click to upload</span> or drag and drop files here
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* Uploaded attachments list */}
            {attachments.length > 0 && (
                <div className="space-y-2">
                    {attachments.map((att) => (
                        <div
                            key={att.id}
                            className="flex items-center justify-between p-2 rounded-md bg-muted/60 border text-xs"
                        >
                            <div className="flex items-center gap-2 overflow-hidden pr-2">
                                <FileIcon className="h-4 w-4 text-primary shrink-0" />
                                <span className="font-medium truncate max-w-[200px]" title={att.filename}>
                                    {att.filename}
                                </span>
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                    {formatBytes(att.size)}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline" title={`SHA-256: ${att.hash}`}>
                                    hash: {att.hash.slice(0, 8)}...
                                </span>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            </div>

                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => handleRemove(att.id)}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
