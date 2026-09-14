"use client";

import { useState } from "react";
import useSWR from "swr";
import { pluginService } from "@/lib/api-client";
import type { InstalledPlugin } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Package, RefreshCw, Trash2, ArrowUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function InstalledPluginsTab() {
  const { data, error, isLoading, mutate } = useSWR<{ plugins: InstalledPlugin[] }>(
    "/api/plugins/installed",
    () => pluginService.listInstalled()
  );

  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [packageVersion, setPackageVersion] = useState("");
  const [installing, setInstalling] = useState(false);

  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<InstalledPlugin | null>(null);
  const [targetVersion, setTargetVersion] = useState("");
  const [updatingVersion, setUpdatingVersion] = useState(false);

  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);
  const [pluginToUninstall, setPluginToUninstall] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packageName.trim()) return;

    setInstalling(true);
    try {
      await pluginService.install(packageName.trim(), packageVersion.trim() || undefined);
      toast.success(`Plugin '${packageName}' installed successfully`);
      setInstallModalOpen(false);
      setPackageName("");
      setPackageVersion("");
      mutate();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to install plugin";
      toast.error(message);
    } finally {
      setInstalling(false);
    }
  };

  const handleChangeVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlugin || !targetVersion.trim()) return;

    setUpdatingVersion(true);
    try {
      await pluginService.changeVersion(selectedPlugin.name, targetVersion.trim());
      toast.success(`Plugin '${selectedPlugin.name}' updated to ${targetVersion.trim()}`);
      setVersionModalOpen(false);
      setSelectedPlugin(null);
      setTargetVersion("");
      mutate();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to change plugin version";
      toast.error(message);
    } finally {
      setUpdatingVersion(false);
    }
  };

  const handleUninstall = async () => {
    if (!pluginToUninstall) return;

    setUninstalling(true);
    try {
      await pluginService.uninstall(pluginToUninstall);
      toast.success(`Plugin '${pluginToUninstall}' uninstalled successfully`);
      setUninstallDialogOpen(false);
      setPluginToUninstall(null);
      mutate();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to uninstall plugin";
      toast.error(message);
    } finally {
      setUninstalling(false);
    }
  };

  const plugins = data?.plugins || [];

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Installed Plugin Packages</h2>
          <p className="text-sm text-muted-foreground">
            Manage npm provider packages installed into SimpleNS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setInstallModalOpen(true)} className="gap-2">
            <Download className="h-4 w-4" />
            Install Plugin
          </Button>
        </div>
      </div>

      {/* Plugins Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="p-6 text-center text-destructive">
            Failed to load installed plugins.
          </CardContent>
        </Card>
      ) : plugins.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <Package className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">No plugins installed</h3>
              <p className="text-sm text-muted-foreground">
                Install provider packages such as @simplens/nodemailer-gmail or @simplens/mock.
              </p>
            </div>
            <Button onClick={() => setInstallModalOpen(true)} className="gap-2">
              <Download className="h-4 w-4" />
              Install First Plugin
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plugins.map((plugin) => (
            <Card key={plugin.name} className="overflow-hidden relative group">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">{plugin.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {plugin.manifest?.displayName || plugin.name}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    v{plugin.version}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    Channel: {plugin.manifest?.channel || "generic"}
                  </Badge>
                  <Badge
                    variant={plugin.status === "installed" ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {plugin.status}
                  </Badge>
                </div>

                {plugin.manifest?.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {plugin.manifest.description}
                  </p>
                )}

                {plugin.manifest?.requiredCredentials && plugin.manifest.requiredCredentials.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Credentials required:</span>{" "}
                    {plugin.manifest.requiredCredentials.join(", ")}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs gap-1.5"
                    onClick={() => {
                      setSelectedPlugin(plugin);
                      setTargetVersion(plugin.version);
                      setVersionModalOpen(true);
                    }}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Change Version
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => {
                      setPluginToUninstall(plugin.name);
                      setUninstallDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Install Plugin Dialog */}
      <Dialog open={installModalOpen} onOpenChange={setInstallModalOpen}>
        <DialogContent>
          <form onSubmit={handleInstall}>
            <DialogHeader>
              <DialogTitle>Install Plugin Package</DialogTitle>
              <DialogDescription>
                Install a new notification provider package from npm into SimpleNS.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="pkg-name">npm Package Name</Label>
                <Input
                  id="pkg-name"
                  placeholder="e.g. @simplens/nodemailer-gmail or @simplens/mock"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pkg-version">Version (Optional)</Label>
                <Input
                  id="pkg-version"
                  placeholder="e.g. 1.0.0 or leave empty for latest"
                  value={packageVersion}
                  onChange={(e) => setPackageVersion(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInstallModalOpen(false)}
                disabled={installing}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={installing || !packageName.trim()} className="gap-2">
                {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {installing ? "Installing..." : "Install"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Version Dialog */}
      <Dialog open={versionModalOpen} onOpenChange={setVersionModalOpen}>
        <DialogContent>
          <form onSubmit={handleChangeVersion}>
            <DialogHeader>
              <DialogTitle>Change Plugin Version</DialogTitle>
              <DialogDescription>
                Upgrade or downgrade {selectedPlugin?.name} to a specific version.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="target-version">Target Version</Label>
                <Input
                  id="target-version"
                  placeholder="e.g. 1.2.0 or latest"
                  value={targetVersion}
                  onChange={(e) => setTargetVersion(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVersionModalOpen(false)}
                disabled={updatingVersion}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatingVersion || !targetVersion.trim()} className="gap-2">
                {updatingVersion ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {updatingVersion ? "Updating..." : "Update Version"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Uninstall Confirmation Dialog */}
      <AlertDialog open={uninstallDialogOpen} onOpenChange={setUninstallDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall Plugin</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to uninstall {pluginToUninstall}? This will delete the package from
                .plugins/node_modules. Any providers using this plugin and channel routings that reference those providers will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uninstalling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleUninstall();
              }}
              disabled={uninstalling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {uninstalling ? "Uninstalling..." : "Uninstall"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
