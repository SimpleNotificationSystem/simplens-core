"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, TestTube2, Save, AlertCircle, HardDrive } from "lucide-react";
import type { StorageProviderMeta } from "@/lib/types";
import { storageService } from "@/lib/api-client";
import { toast } from "sonner";

interface AddStorageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function AddStorageDialog({ open, onOpenChange, onSuccess }: AddStorageDialogProps) {
    const [providers, setProviders] = useState<StorageProviderMeta[]>([]);
    const [loadingProviders, setLoadingProviders] = useState(false);
    const [providerError, setProviderError] = useState<string | null>(null);

    const [providerType, setProviderType] = useState("");
    const [name, setName] = useState("");
    const [config, setConfig] = useState<Record<string, string>>({});
    const [isActive, setIsActive] = useState(true);
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

    // Fetch available storage provider schemas on open
    useEffect(() => {
        if (open) {
            setLoadingProviders(true);
            setProviderError(null);
            storageService.getProviders()
                .then((res) => {
                    const available = res.providers || [];
                    setProviders(available);
                    if (available.length > 0 && !providerType) {
                        setProviderType(available[0].providerType);
                    }
                })
                .catch((err) => {
                    setProviderError(err instanceof Error ? err.message : "Failed to load storage providers");
                })
                .finally(() => {
                    setLoadingProviders(false);
                });
        }
    }, [open, providerType]);

    // Reset config when provider type changes
    useEffect(() => {
        setConfig({});
        setTestResult(null);
    }, [providerType]);

    const selectedMeta = providers.find((p) => p.providerType === providerType);

    const handleConfigChange = (fieldName: string, value: string) => {
        setConfig((prev) => ({ ...prev, [fieldName]: value }));
        setTestResult(null);
    };

    const handleTest = async () => {
        if (!providerType) {
            toast.error("Please select a storage provider type");
            return;
        }

        setTesting(true);
        setTestResult(null);
        try {
            const res = await storageService.test({
                provider_type: providerType,
                config,
            });
            setTestResult({ success: res.success, message: res.message || "Connection successful!" });
            toast.success("Storage provider connection verified");
        } catch (err: unknown) {
            const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                (err instanceof Error ? err.message : "Connection test failed");
            setTestResult({ success: false, message: errorMsg });
            toast.error(errorMsg);
        } finally {
            setTesting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Please enter a name for this storage provider");
            return;
        }
        if (!providerType) {
            toast.error("Please select a storage provider type");
            return;
        }

        setLoading(true);
        try {
            await storageService.create({
                name: name.trim(),
                provider_type: providerType,
                config,
                enabled: true,
                is_active: isActive,
            });
            toast.success("Storage provider configured successfully");
            onSuccess();
            onOpenChange(false);
            // Reset form state
            setName("");
            setConfig({});
            setTestResult(null);
        } catch (err: unknown) {
            const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                (err instanceof Error ? err.message : "Failed to configure storage provider");
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg h-[85vh] max-h-[85vh] min-h-0 flex! flex-col p-6 overflow-hidden">
                <DialogHeader className="shrink-0 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <HardDrive className="h-5 w-5" />
                        Add Storage Provider
                    </DialogTitle>
                    <DialogDescription>
                        Configure an external storage provider to store and manage notification file attachments.
                    </DialogDescription>
                </DialogHeader>

                {loadingProviders && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                )}

                {providerError && (
                    <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-md flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{providerError}</span>
                    </div>
                )}

                {!loadingProviders && !providerError && (
                    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        <ScrollArea className="flex-1 min-h-0 overflow-hidden pr-4 -mr-2">
                            <div className="space-y-4 py-1">
                                <div className="space-y-2">
                                    <Label htmlFor="providerType">Storage Provider Type</Label>
                                    <Select value={providerType} onValueChange={setProviderType}>
                                        <SelectTrigger id="providerType">
                                            <SelectValue placeholder="Select provider type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {providers.map((p) => (
                                                <SelectItem key={p.providerType} value={p.providerType}>
                                                    {p.displayName}
                                                </SelectItem>
                                            ))}
                                            {providers.length === 0 && (
                                                <SelectItem value="none" disabled>
                                                    No storage provider plugins registered
                                                </SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="name">Display Name</Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g., Primary S3 Bucket, MinIO Storage"
                                        required
                                    />
                                </div>

                                {selectedMeta && selectedMeta.credentialFields.length > 0 && (
                                    <div className="space-y-3 pt-1">
                                        <Label className="text-sm font-semibold">Environment & Credentials</Label>
                                        <div className="space-y-3">
                                            {selectedMeta.credentialFields.map((field) => (
                                                <div key={field.name} className="space-y-1">
                                                    <Label htmlFor={field.name} className="text-xs">
                                                        {field.label} {field.required && <span className="text-destructive">*</span>}
                                                    </Label>
                                                    <Input
                                                        id={field.name}
                                                        type={field.type === "secret" ? "password" : "text"}
                                                        value={config[field.name] || ""}
                                                        onChange={(e) => handleConfigChange(field.name, e.target.value)}
                                                        placeholder={field.placeholder || field.description || ""}
                                                        required={field.required}
                                                    />
                                                    {field.description && (
                                                        <p className="text-xs text-muted-foreground">{field.description}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center space-x-2 pt-2">
                                    <Checkbox
                                        id="isActive"
                                        checked={isActive}
                                        onCheckedChange={(checked) => setIsActive(!!checked)}
                                    />
                                    <Label htmlFor="isActive" className="text-sm cursor-pointer">
                                        Set as active storage provider (demotes any currently active provider)
                                    </Label>
                                </div>

                                {testResult && (
                                    <div
                                        className={`text-sm p-3 rounded-md flex items-center gap-2 ${
                                            testResult.success
                                                ? "bg-emerald-500/10 text-emerald-500"
                                                : "bg-destructive/10 text-destructive"
                                        }`}
                                    >
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>{testResult.message}</span>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <div className="shrink-0 flex justify-between items-center pt-4 border-t mt-3">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleTest}
                                disabled={testing || !providerType || providers.length === 0}
                            >
                                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TestTube2 className="h-4 w-4 mr-2" />}
                                Test Connection
                            </Button>

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onOpenChange(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={loading || !providerType || providers.length === 0}
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    Save Storage Provider
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
