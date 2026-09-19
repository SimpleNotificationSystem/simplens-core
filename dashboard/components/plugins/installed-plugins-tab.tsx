"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { pluginService } from "@/lib/api-client";
import type { InstalledPlugin, PluginCatalogItem, InstallPluginPayload, NpmAuthStatus } from "@/lib/types";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Package, RefreshCw, Trash2, ArrowUpDown, Loader2, ExternalLink, Info, Search, Lock, ShieldCheck, Eye, EyeOff, Check } from "lucide-react";
import { toast } from "sonner";

export function InstalledPluginsTab() {
  const { data, error, isLoading, mutate } = useSWR<{ plugins: InstalledPlugin[] }>(
    "/api/plugins/installed",
    () => pluginService.listInstalled()
  );

  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [catalogTab, setCatalogTab] = useState<"official" | "community" | "custom">("official");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});
  const [installingPkgs, setInstallingPkgs] = useState<Set<string>>(new Set());

  // Custom Package Form State
  const [customPkg, setCustomPkg] = useState("");
  const [customVersion, setCustomVersion] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [useSavedToken, setUseSavedToken] = useState(true);
  const [npmToken, setNpmToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [enterpriseRegistryUrl, setEnterpriseRegistryUrl] = useState("");
  const [saveToken, setSaveToken] = useState(true);
  const [isInstallingCustom, setIsInstallingCustom] = useState(false);

  const { data: npmAuth, mutate: mutateNpmAuth } = useSWR<NpmAuthStatus>(
    installModalOpen ? "/api/plugins/npm-auth" : null,
    () => pluginService.getNpmAuth()
  );

  const { data: officialCatalog = [], isLoading: officialLoading, error: officialError } = useSWR<PluginCatalogItem[]>(
    installModalOpen && catalogTab === "official" ? "plugin-catalog-official" : null,
    () => pluginService.listCatalog("official")
  );
  const { data: communityCatalog = [], isLoading: communityLoading, error: communityError } = useSWR<PluginCatalogItem[]>(
    installModalOpen && catalogTab === "community" ? "plugin-catalog-community" : null,
    () => pluginService.listCatalog("community")
  );

  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<InstalledPlugin | null>(null);
  const [targetVersion, setTargetVersion] = useState("");
  const [updatingVersion, setUpdatingVersion] = useState(false);

  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);
  const [pluginToUninstall, setPluginToUninstall] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const [detailsPlugin, setDetailsPlugin] = useState<InstalledPlugin | null>(null);

  const handleInstall = async (plugin: PluginCatalogItem) => {
    const version = selectedVersions[plugin.package] || "latest";
    setInstallingPkgs((prev) => new Set(prev).add(plugin.package));
    try {
      await pluginService.install(plugin.package, version === "latest" ? undefined : version);
      toast.success(`Plugin '${plugin.name}' installed successfully`);
      mutate();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to install plugin";
      toast.error(message);
    } finally {
      setInstallingPkgs((prev) => {
        const next = new Set(prev);
        next.delete(plugin.package);
        return next;
      });
    }
  };

  const handleInstallCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const pkgName = customPkg.trim();
    if (!pkgName) {
      toast.error("Please enter a package name");
      return;
    }

    const payload: InstallPluginPayload = {
      package: pkgName,
      version: customVersion.trim() || undefined,
    };

    if (isPrivate) {
      const token = useSavedToken && npmAuth?.is_configured ? undefined : npmToken.trim();
      if (!useSavedToken && !token) {
        toast.error("Please enter an npm authentication token for this private package");
        return;
      }
      if (token || enterpriseRegistryUrl.trim()) {
        payload.auth = {
          token: token || undefined,
          registry_url: enterpriseRegistryUrl.trim() || undefined,
          save_token: saveToken,
        };
      }
    }

    setIsInstallingCustom(true);
    setInstallingPkgs((prev) => new Set(prev).add(pkgName));
    try {
      await pluginService.install(payload);
      toast.success(`Plugin '${pkgName}' installed successfully!`);
      mutate();
      if (payload.auth?.token && saveToken) {
        mutateNpmAuth();
      }
      setCustomPkg("");
      setCustomVersion("");
      setNpmToken("");
      setIsPrivate(false);
      setInstallModalOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to install custom plugin";
      toast.error(message);
    } finally {
      setIsInstallingCustom(false);
      setInstallingPkgs((prev) => {
        const next = new Set(prev);
        next.delete(pkgName);
        return next;
      });
    }
  };

  const catalog = catalogTab === "official" ? officialCatalog : communityCatalog;
  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return catalog;
    return catalog.filter((plugin) =>
      [plugin.name, plugin.package, plugin.description].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [catalog, catalogSearch]);

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

  const plugins = useMemo(() => data?.plugins || [], [data?.plugins]);
  const installedPackages = useMemo(
    () => new Set(plugins.map((plugin) => plugin.name)),
    [plugins]
  );

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {plugins.map((plugin) => (
            <Card key={plugin.name} className="overflow-hidden relative group h-full">
              <CardContent className="p-5 space-y-4 flex min-h-[250px] h-full flex-col">
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

                <p className="text-xs text-muted-foreground line-clamp-2 min-h-8">
                  {plugin.manifest?.description || "No description provided."}
                </p>

                <div className="flex items-center gap-2 pt-2 border-t mt-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setDetailsPlugin(plugin)}
                  >
                    <Info className="h-3.5 w-3.5" />
                    View details
                  </Button>
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

      <Dialog open={detailsPlugin !== null} onOpenChange={(open) => !open && setDetailsPlugin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailsPlugin?.manifest?.displayName || detailsPlugin?.name}</DialogTitle>
            <DialogDescription>{detailsPlugin?.name}</DialogDescription>
          </DialogHeader>
          {detailsPlugin && (
            <div className="space-y-4 py-2 text-sm">
              <p className="text-muted-foreground">
                {detailsPlugin.manifest?.description || "No description provided."}
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Version</div>
                  <div className="font-mono">{detailsPlugin.version}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Channel</div>
                  <div>{detailsPlugin.manifest?.channel || "generic"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Author</div>
                  <div>{detailsPlugin.manifest?.author || "Not specified"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div>{detailsPlugin.status}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Required credentials</div>
                <div className="mt-1 text-sm">
                  {detailsPlugin.manifest?.requiredCredentials?.join(", ") || "None"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Optional configuration</div>
                <div className="mt-1 text-sm">
                  {detailsPlugin.manifest?.optionalConfig?.join(", ") || "None"}
                </div>
              </div>
              {detailsPlugin.manifest?.homepage && (
                <a
                  href={detailsPlugin.manifest.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  Plugin homepage
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Install Plugin Dialog */}
      <Dialog open={installModalOpen} onOpenChange={setInstallModalOpen}>
        <DialogContent className="flex max-h-[min(720px,calc(100vh-2rem))] max-w-3xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>Install Plugin Package</DialogTitle>
              <DialogDescription>
                Browse official and community provider packages or install custom plugins from npmjs.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              <Tabs value={catalogTab} onValueChange={(value) => setCatalogTab(value as "official" | "community" | "custom")}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="official">Official</TabsTrigger>
                  <TabsTrigger value="community">Community</TabsTrigger>
                  <TabsTrigger value="custom">Custom Package</TabsTrigger>
                </TabsList>

                {catalogTab !== "custom" && (
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="Search plugins"
                      placeholder="Search by name, package, or description"
                      className="pl-9"
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                    />
                  </div>
                )}

                <TabsContent value="official" className="mt-3">
                  {officialLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading plugins...
                    </div>
                  ) : officialError ? (
                    <div className="py-10 text-center text-sm text-destructive">
                      Failed to load official plugins.
                    </div>
                  ) : filteredCatalog.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      No plugins match your search.
                    </div>
                  ) : (
                    <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                      {filteredCatalog.map((plugin) => {
                        const versions = plugin.versions?.length ? plugin.versions : ["latest"];
                        const selectedVersion = selectedVersions[plugin.package] || versions[0];
                        const isInstalled = installedPackages.has(plugin.package);
                        const isInstalling = installingPkgs.has(plugin.package);
                        return (
                          <div key={plugin.package} className="flex items-center gap-4 rounded-lg border bg-card p-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{plugin.name}</div>
                              <div className="truncate font-mono text-xs text-muted-foreground">{plugin.package}</div>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plugin.description}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Select
                                value={selectedVersion}
                                onValueChange={(value) => setSelectedVersions({ ...selectedVersions, [plugin.package]: value })}
                              >
                                <SelectTrigger className="w-28" aria-label={`Version for ${plugin.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {versions.map((version) => (
                                    <SelectItem key={version} value={version}>{version}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {isInstalled ? (
                                <Button type="button" size="sm" variant="secondary" disabled className="gap-1">
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                  Installed
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleInstall(plugin)}
                                  disabled={isInstalling}
                                >
                                  {isInstalling ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                  Install
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="community" className="mt-3">
                  {communityLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading plugins...
                    </div>
                  ) : communityError ? (
                    <div className="py-10 text-center text-sm text-destructive">
                      Failed to load community plugins.
                    </div>
                  ) : filteredCatalog.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      {communityCatalog.length === 0
                        ? "No community plugins are available yet."
                        : "No plugins match your search."}
                    </div>
                  ) : (
                    <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                      {filteredCatalog.map((plugin) => {
                        const versions = plugin.versions?.length ? plugin.versions : ["latest"];
                        const selectedVersion = selectedVersions[plugin.package] || versions[0];
                        const isInstalled = installedPackages.has(plugin.package);
                        const isInstalling = installingPkgs.has(plugin.package);
                        return (
                          <div key={plugin.package} className="flex items-center gap-4 rounded-lg border bg-card p-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{plugin.name}</div>
                              <div className="truncate font-mono text-xs text-muted-foreground">{plugin.package}</div>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plugin.description}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Select
                                value={selectedVersion}
                                onValueChange={(value) => setSelectedVersions({ ...selectedVersions, [plugin.package]: value })}
                              >
                                <SelectTrigger className="w-28" aria-label={`Version for ${plugin.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {versions.map((version) => (
                                    <SelectItem key={version} value={version}>{version}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {isInstalled ? (
                                <Button type="button" size="sm" variant="secondary" disabled className="gap-1">
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                  Installed
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleInstall(plugin)}
                                  disabled={isInstalling}
                                >
                                  {isInstalling ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                  Install
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="custom" className="mt-3 space-y-4">
                  <form onSubmit={handleInstallCustom} className="space-y-4">
                    <div className="rounded-lg border bg-muted/40 p-4 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Package className="h-4 w-4 text-primary" />
                        <span>Install from npmjs or Enterprise Registry</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Install any custom plugin implementing the SimpleNS Provider interface. For scoped packages (e.g. <code>@myenterprise/provider</code>), the scope is automatically detected.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2 space-y-1.5">
                        <Label htmlFor="custom-pkg-name" className="text-xs font-semibold">
                          Package Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="custom-pkg-name"
                          placeholder="e.g. @myenterprise/custom-provider or custom-mailer"
                          value={customPkg}
                          onChange={(e) => setCustomPkg(e.target.value)}
                          required
                          disabled={isInstallingCustom}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="custom-pkg-version" className="text-xs font-semibold">
                          Version (Optional)
                        </Label>
                        <Input
                          id="custom-pkg-version"
                          placeholder="latest (or 1.2.0)"
                          value={customVersion}
                          onChange={(e) => setCustomVersion(e.target.value)}
                          disabled={isInstallingCustom}
                        />
                      </div>
                    </div>

                    {/* Private / Enterprise npm Package Toggle */}
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="text-xs font-semibold flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            Private / Enterprise Package
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Enable if this package requires an npm authentication token to download.
                          </p>
                        </div>
                        <Switch
                          checked={isPrivate}
                          onCheckedChange={setIsPrivate}
                          aria-label="Toggle private package"
                          disabled={isInstallingCustom}
                        />
                      </div>

                      {isPrivate && (
                        <div className="pt-3 border-t space-y-3">
                          {npmAuth?.is_configured && (
                            <div className="flex items-center justify-between rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>
                                  Saved token active: <code className="font-mono font-semibold">{npmAuth.masked_token}</code>
                                </span>
                              </div>
                              <label className="text-[11px] text-muted-foreground cursor-pointer flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={useSavedToken}
                                  onChange={(e) => setUseSavedToken(e.target.checked)}
                                  className="rounded text-primary h-3.5 w-3.5"
                                />
                                Use saved token
                              </label>
                            </div>
                          )}

                          {(!useSavedToken || !npmAuth?.is_configured) && (
                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <Label htmlFor="custom-npm-token" className="text-xs font-semibold">
                                  npm Access Token <span className="text-destructive">*</span>
                                </Label>
                                <div className="relative">
                                  <Input
                                    id="custom-npm-token"
                                    type={showToken ? "text" : "password"}
                                    placeholder="npm_xxxxxxxxxxxxxxxxxxxxxxxx"
                                    value={npmToken}
                                    onChange={(e) => setNpmToken(e.target.value)}
                                    required={isPrivate && (!useSavedToken || !npmAuth?.is_configured)}
                                    className="pr-10 font-mono text-xs"
                                    disabled={isInstallingCustom}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    tabIndex={-1}
                                  >
                                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <Label htmlFor="custom-registry-url" className="text-xs font-semibold">
                                  Enterprise Registry URL (Optional)
                                </Label>
                                <Input
                                  id="custom-registry-url"
                                  placeholder="https://registry.npmjs.org/ (default)"
                                  value={enterpriseRegistryUrl}
                                  onChange={(e) => setEnterpriseRegistryUrl(e.target.value)}
                                  disabled={isInstallingCustom}
                                />
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  id="save-token-check"
                                  type="checkbox"
                                  checked={saveToken}
                                  onChange={(e) => setSaveToken(e.target.checked)}
                                  className="rounded text-primary h-4 w-4"
                                  disabled={isInstallingCustom}
                                />
                                <Label htmlFor="save-token-check" className="text-xs font-normal cursor-pointer text-muted-foreground">
                                  Save token in SimpleNS for background processors and future updates
                                </Label>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={isInstallingCustom || !customPkg.trim()}
                        className="gap-2 text-xs font-semibold"
                      >
                        {isInstallingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {isInstallingCustom ? "Validating & Installing..." : "Install Custom Plugin"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInstallModalOpen(false)}
                disabled={installingPkgs.size > 0}
              >
                Cancel
              </Button>
            </DialogFooter>
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
