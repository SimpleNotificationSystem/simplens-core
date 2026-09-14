"use client";

import { useState } from "react";
import useSWR from "swr";
import { providerService, pluginService } from "@/lib/api-client";
import type { ProviderDto, InstalledPlugin } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  KeyRound,
  TestTube2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Server,
} from "lucide-react";
import { toast } from "sonner";

type AdditionalOption = {
  id: string;
  key: string;
  value: string;
};

let additionalOptionId = 0;

const createAdditionalOption = (key = "", value = ""): AdditionalOption => ({
  id: `additional-option-${additionalOptionId++}`,
  key,
  value,
});

export function ProvidersTab() {
  const {
    data: providersData,
    isLoading: providersLoading,
    mutate: mutateProviders,
  } = useSWR<{ providers: ProviderDto[] }>("/api/providers", () => providerService.list());

  const { data: pluginsData } = useSWR<{ plugins: InstalledPlugin[] }>(
    "/api/plugins/installed",
    () => pluginService.listInstalled()
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderDto | null>(null);

  // Form State
  const [providerId, setProviderId] = useState("");
  const [pluginName, setPluginName] = useState("");
  const [priority, setPriority] = useState(0);
  const [rateLimit, setRateLimit] = useState({
    maxTokens: "",
    refillRate: "",
    refillInterval: "second",
  });
  const [additionalOptions, setAdditionalOptions] = useState<AdditionalOption[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Test Connection State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Delete State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const installedPlugins = pluginsData?.plugins || [];
  const selectedPlugin = installedPlugins.find((p) => p.name === pluginName);

  const resetForm = () => {
    setEditingProvider(null);
    setProviderId("");
    setPluginName(installedPlugins[0]?.name || "");
    setPriority(0);
    setRateLimit({ maxTokens: "", refillRate: "", refillInterval: "second" });
    setAdditionalOptions([]);
    setEnabled(true);
    setCredentials({});
    setTestResult(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    if (installedPlugins.length > 0) {
      setPluginName(installedPlugins[0].name);
    }
    setModalOpen(true);
  };

  const handleOpenEdit = async (provider: ProviderDto) => {
    setEditingProvider(provider);
    setProviderId(provider.id);
    setPluginName(provider.plugin_name);
    setPriority(provider.options?.priority ?? 0);
    setRateLimit({
      maxTokens: provider.options?.rateLimit?.maxTokens?.toString() || "",
      refillRate: provider.options?.rateLimit?.refillRate?.toString() || "",
      refillInterval: provider.options?.rateLimit?.refillInterval || "second",
    });
    setAdditionalOptions(
      Object.entries(provider.options || {})
        .filter(([key]) => key !== "priority" && key !== "rateLimit")
        .map(([key, value]) => ({
          ...createAdditionalOption(
            key,
            typeof value === "string" ? value : JSON.stringify(value),
          ),
        }))
    );
    setEnabled(provider.enabled);
    setCredentials({});
    setTestResult(null);
    setModalOpen(true);
  };

  const buildProviderOptions = (): Record<string, unknown> => {
    const options: Record<string, unknown> = { priority };
    const configuredRateLimit: Record<string, unknown> = {};

    if (rateLimit.maxTokens.trim() !== "") {
      configuredRateLimit.maxTokens = parseInt(rateLimit.maxTokens, 10);
    }
    if (rateLimit.refillRate.trim() !== "") {
      configuredRateLimit.refillRate = parseInt(rateLimit.refillRate, 10);
    }
    if (rateLimit.refillInterval) {
      configuredRateLimit.refillInterval = rateLimit.refillInterval;
    }
    if (Object.keys(configuredRateLimit).length > 0) {
      options.rateLimit = configuredRateLimit;
    }

    for (const option of additionalOptions) {
      const key = option.key.trim();
      if (!key || key === "priority" || key === "rateLimit") continue;
      const value = option.value.trim();
      options[key] = /^-?\d+$/.test(value) ? parseInt(value, 10) : option.value;
    }

    return options;
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await providerService.test({
        provider_id: editingProvider ? editingProvider.id : undefined,
        plugin_name: pluginName,
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
      });
      setTestResult(result);
      if (result.success) {
        toast.success("Health check succeeded!");
      } else {
        toast.error(result.message || "Health check failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setTestResult({ success: false, message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingProvider) {
        await providerService.update(editingProvider.id, {
          options: buildProviderOptions(),
          enabled,
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        });
        toast.success(`Provider '${editingProvider.id}' updated`);
      } else {
        if (!providerId.trim()) {
          toast.error("Provider ID is required");
          return;
        }
        await providerService.create({
          id: providerId.trim(),
          plugin_name: pluginName,
          credentials,
          options: buildProviderOptions(),
          enabled,
        });
        toast.success(`Provider '${providerId}' created`);
      }
      setModalOpen(false);
      resetForm();
      mutateProviders();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save provider";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!providerToDelete) return;
    setDeleting(true);
    try {
      await providerService.delete(providerToDelete);
      toast.success(`Provider '${providerToDelete}' deleted`);
      setDeleteDialogOpen(false);
      setProviderToDelete(null);
      mutateProviders();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete provider";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleEnabled = async (provider: ProviderDto, newEnabled: boolean) => {
    try {
      await providerService.update(provider.id, { enabled: newEnabled });
      toast.success(`Provider '${provider.id}' ${newEnabled ? "enabled" : "disabled"}`);
      mutateProviders();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update provider status";
      toast.error(message);
    }
  };

  const providers = providersData?.providers || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Configured Providers</h2>
          <p className="text-sm text-muted-foreground">
            Configure provider instances with envelope-encrypted credentials and priorities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutateProviders()}
            disabled={providersLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${providersLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleOpenCreate}
            disabled={installedPlugins.length === 0}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Provider
          </Button>
        </div>
      </div>

      {installedPlugins.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3 text-sm text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>
              No plugins are installed yet. Please switch to the <strong>Installed Plugins</strong>{" "}
              tab and install a plugin package first before creating providers.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Providers Grid */}
      {providersLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : providers.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <Server className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">No providers configured</h3>
              <p className="text-sm text-muted-foreground">
                Create a provider instance for your installed plugins.
              </p>
            </div>
            <Button
              onClick={handleOpenCreate}
              disabled={installedPlugins.length === 0}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Configure First Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => (
            <Card key={p.id} className="overflow-hidden relative group">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">{p.id}</h3>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {p.plugin_name}
                    </p>
                  </div>
                  <Badge variant={p.enabled ? "default" : "secondary"} className="text-xs">
                    {p.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="outline">Channel: {p.channel}</Badge>
                  <Badge variant="outline">Priority: {p.options?.priority || 0}</Badge>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Encrypted (RSA-OAEP)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={(checked) => handleToggleEnabled(p, checked)}
                    />
                    <span className="text-xs text-muted-foreground">Active</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => handleOpenEdit(p)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => {
                        setProviderToDelete(p.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Provider Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingProvider ? "Edit Provider" : "Configure Provider"}</DialogTitle>
              <DialogDescription>
                {editingProvider
                  ? `Update settings or rotate encrypted credentials for ${editingProvider.id}.`
                  : "Create an active provider instance backed by an installed plugin."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
              {!editingProvider ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="plugin-select">Plugin</Label>
                    <Select value={pluginName} onValueChange={setPluginName}>
                      <SelectTrigger id="plugin-select">
                        <SelectValue placeholder="Select installed plugin" />
                      </SelectTrigger>
                      <SelectContent>
                        {installedPlugins.map((plug) => (
                          <SelectItem key={plug.name} value={plug.name}>
                            {plug.manifest?.displayName || plug.name} ({plug.manifest?.channel || "generic"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="provider-id">Provider ID</Label>
                    <Input
                      id="provider-id"
                      placeholder="e.g. nodemailer-gmail-prod or twilio-us"
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                      required
                    />
                  </div>
                </>
              ) : (
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                  <div>
                    <span className="font-semibold">Provider ID:</span> {editingProvider.id}
                  </div>
                  <div>
                    <span className="font-semibold">Plugin:</span> {editingProvider.plugin_name}
                  </div>
                  <div>
                    <span className="font-semibold">Channel:</span> {editingProvider.channel}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="provider-priority">Priority (Higher Preferred)</Label>
                  <Input
                    id="provider-priority"
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="space-y-2 flex flex-col justify-end">
                  <div className="flex items-center gap-2 mb-2">
                    <Switch id="provider-enabled" checked={enabled} onCheckedChange={setEnabled} />
                    <Label htmlFor="provider-enabled" className="cursor-pointer">
                      Enable Provider
                    </Label>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <Label className="text-sm font-semibold">Rate Limit</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="rate-limit-max-tokens" className="text-xs">Max Tokens</Label>
                    <Input
                      id="rate-limit-max-tokens"
                      type="number"
                      step="1"
                      min="0"
                      value={rateLimit.maxTokens}
                      onChange={(e) => setRateLimit({ ...rateLimit, maxTokens: e.target.value })}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rate-limit-refill-rate" className="text-xs">Refill Rate</Label>
                    <Input
                      id="rate-limit-refill-rate"
                      type="number"
                      step="1"
                      min="0"
                      value={rateLimit.refillRate}
                      onChange={(e) => setRateLimit({ ...rateLimit, refillRate: e.target.value })}
                      placeholder="10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rate-limit-interval" className="text-xs">Interval</Label>
                    <Select
                      value={rateLimit.refillInterval}
                      onValueChange={(value) => setRateLimit({ ...rateLimit, refillInterval: value })}
                    >
                      <SelectTrigger id="rate-limit-interval">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="second">Second</SelectItem>
                        <SelectItem value="minute">Minute</SelectItem>
                        <SelectItem value="hour">Hour</SelectItem>
                        <SelectItem value="day">Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Additional Options</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAdditionalOptions([...additionalOptions, createAdditionalOption()])}
                  >
                    <Plus className="h-4 w-4" />
                    Add Option
                  </Button>
                </div>
                {additionalOptions.map((option, index) => (
                  <div className="flex items-center gap-2" key={option.id}>
                    <Input
                      aria-label={`Option ${index + 1} key`}
                      placeholder="Option key"
                      value={option.key}
                      onChange={(e) => {
                        const next = [...additionalOptions];
                        next[index] = { ...next[index], key: e.target.value };
                        setAdditionalOptions(next);
                      }}
                    />
                    <Input
                      aria-label={`Option ${index + 1} value`}
                      placeholder="Option value"
                      value={option.value}
                      onChange={(e) => {
                        const next = [...additionalOptions];
                        next[index] = { ...next[index], value: e.target.value };
                        setAdditionalOptions(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove option ${index + 1}`}
                      onClick={() => setAdditionalOptions(additionalOptions.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Dynamic Credential Fields from Plugin Manifest */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {editingProvider ? "Update Credentials (Optional)" : "Credentials"}
                  </Label>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <KeyRound className="h-3 w-3 text-emerald-500" />
                    Envelope Encrypted
                  </span>
                </div>
                {editingProvider && (
                  <p className="text-xs text-muted-foreground">
                    Leave credential fields empty to test with the encrypted credentials already stored for this provider.
                  </p>
                )}

                {selectedPlugin?.manifest?.requiredCredentials &&
                selectedPlugin.manifest.requiredCredentials.length > 0 ? (
                  selectedPlugin.manifest.requiredCredentials.map((field) => (
                    <div key={field} className="space-y-1">
                      <Label htmlFor={`cred-${field}`} className="text-xs font-mono">
                        {field}
                      </Label>
                      <Input
                        id={`cred-${field}`}
                        type={field.toLowerCase().includes("pass") || field.toLowerCase().includes("secret") || field.toLowerCase().includes("token") ? "password" : "text"}
                        placeholder={
                          editingProvider
                            ? "Leave empty to keep existing encrypted value"
                            : `Enter ${field}`
                        }
                        value={credentials[field] || ""}
                        onChange={(e) =>
                          setCredentials({ ...credentials, [field]: e.target.value })
                        }
                        required={!editingProvider}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    This plugin does not specify required credentials.
                  </p>
                )}
              </div>

              {/* Live Test Connection Result */}
              {testResult && (
                <div
                  className={`p-3 rounded-md text-xs flex items-center gap-2 ${
                    testResult.success
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            <DialogFooter className="flex sm:justify-between items-center gap-2">
              {editingProvider && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="gap-1.5 text-xs"
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}
                  {testing ? "Testing..." : "Test Connection"}
                </Button>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {saving ? "Saving..." : editingProvider ? "Update Provider" : "Create Provider"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Provider</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {providerToDelete}? This will unregister the instance and remove it from any channel routing. If it is a channel&apos;s primary provider, the first fallback will become primary.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Provider"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
