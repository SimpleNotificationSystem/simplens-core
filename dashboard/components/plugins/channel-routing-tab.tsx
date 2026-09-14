"use client";

import { useState } from "react";
import useSWR from "swr";
import { channelRoutingService, providerService } from "@/lib/api-client";
import type { ChannelRoutingDto, ProviderDto } from "@/lib/types";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GitBranch,
  RefreshCw,
  Edit2,
  Plus,
  ArrowRight,
  Cpu,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";

export function ChannelRoutingTab() {
  const {
    data: routingData,
    isLoading: routingLoading,
    mutate: mutateRouting,
  } = useSWR<{ routings: ChannelRoutingDto[] }>("/api/channels/routing", () =>
    channelRoutingService.list()
  );

  const { data: providersData } = useSWR<{ providers: ProviderDto[] }>("/api/providers", () =>
    providerService.list()
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRouting, setEditingRouting] = useState<ChannelRoutingDto | null>(null);

  // Form State
  const [channel, setChannel] = useState("");
  const [defaultProviderId, setDefaultProviderId] = useState("");
  const [fallbackIds, setFallbackIds] = useState<string[]>([]);
  const [partitions, setPartitions] = useState<number>(6);
  const [saving, setSaving] = useState(false);

  const allProviders = providersData?.providers || [];
  const routings = routingData?.routings || [];

  // Filter providers by selected channel
  const channelProviders = allProviders.filter((p) => !channel || p.channel === channel);

  const handleOpenEdit = (route: ChannelRoutingDto) => {
    setEditingRouting(route);
    setChannel(route.channel);
    setDefaultProviderId(route.default_provider_id);
    setFallbackIds(route.fallback_provider_ids || []);
    setPartitions(route.partitions || 6);
    setModalOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingRouting(null);
    setChannel("");
    setDefaultProviderId("");
    setFallbackIds([]);
    setPartitions(6);
    setModalOpen(true);
  };

  const handleAddFallback = (provId: string) => {
    if (!provId || provId === defaultProviderId || fallbackIds.includes(provId)) return;
    setFallbackIds([...fallbackIds, provId]);
  };

  const handleRemoveFallback = (index: number) => {
    setFallbackIds(fallbackIds.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel.trim()) {
      toast.error("Channel name is required");
      return;
    }
    if (!defaultProviderId.trim()) {
      toast.error("Default primary provider is required");
      return;
    }

    setSaving(true);
    try {
      await channelRoutingService.set(channel.trim(), {
        default_provider_id: defaultProviderId.trim(),
        fallback_provider_ids: fallbackIds,
        partitions,
      });

      toast.success(`Routing for channel '${channel}' updated`);
      setModalOpen(false);
      mutateRouting();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update channel routing";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Channel Routing & Kafka Scaling</h2>
          <p className="text-sm text-muted-foreground">
            Configure primary and cascading fallback providers per channel, and scale topic partitions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutateRouting()}
            disabled={routingLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${routingLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Configure Channel
          </Button>
        </div>
      </div>

      {/* Routing Cards Grid */}
      {routingLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : routings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <GitBranch className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">No channel routings configured</h3>
              <p className="text-sm text-muted-foreground">
                Map channels to primary and cascading fallback providers.
              </p>
            </div>
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Configure First Channel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routings.map((route) => (
            <Card key={route.channel} className="overflow-hidden">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="text-sm font-semibold px-3 py-1 uppercase tracking-wider">
                      {route.channel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Cpu className="h-3.5 w-3.5 text-primary" />
                    <span>{route.partitions || 6} Partitions</span>
                  </div>
                </div>

                {/* Routing Cascade Chain */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Cascading Failover Route
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg flex items-center gap-2 flex-wrap text-xs">
                    <Badge variant="default" className="font-mono bg-blue-600 hover:bg-blue-700">
                      Primary: {route.default_provider_id}
                    </Badge>

                    {route.fallback_provider_ids && route.fallback_provider_ids.length > 0 ? (
                      route.fallback_provider_ids.map((fId, idx) => (
                        <div key={fId} className="flex items-center gap-2">
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <Badge variant="secondary" className="font-mono">
                            Fallback {idx + 1}: {fId}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground italic text-xs ml-1">
                        (No fallbacks configured)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => handleOpenEdit(route)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit Routing
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Configure Routing Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingRouting ? "Edit Channel Routing" : "Configure Channel"}</DialogTitle>
              <DialogDescription>
                Configure primary provider, ordered fallback failover cascade, and Kafka partition target.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="route-channel">Channel Name</Label>
                <Input
                  id="route-channel"
                  placeholder="e.g. email, sms, mock"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value.toLowerCase())}
                  disabled={!!editingRouting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-provider">Primary Default Provider</Label>
                <Select value={defaultProviderId} onValueChange={setDefaultProviderId}>
                  <SelectTrigger id="default-provider">
                    <SelectValue placeholder="Select primary provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {channelProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.id} (Priority: {p.priority})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cascading Fallback Array */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold">Cascading Fallback Chain (Ordered)</Label>
                <p className="text-xs text-muted-foreground">
                  If the primary provider fails with a non-retryable error, SimpleNS tries each fallback in order.
                </p>

                {fallbackIds.length > 0 && (
                  <div className="space-y-1.5 p-2 bg-muted/40 rounded-md">
                    {fallbackIds.map((fId, idx) => (
                      <div
                        key={fId}
                        className="flex items-center justify-between text-xs p-1.5 bg-background rounded border"
                      >
                        <span className="font-mono">
                          {idx + 1}. {fId}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveFallback(idx)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Select
                    onValueChange={(val) => {
                      handleAddFallback(val);
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="+ Add Fallback Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {channelProviders
                        .filter((p) => p.id !== defaultProviderId && !fallbackIds.includes(p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.id} (Priority: {p.priority})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Kafka Partitions Scaling */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor="route-partitions" className="text-xs font-semibold">
                    Kafka Topic Partitions (KEDA Autoscaling)
                  </Label>
                  <span className="text-xs text-muted-foreground font-mono">
                    Min: {editingRouting?.partitions || 1}
                  </span>
                </div>
                <Input
                  id="route-partitions"
                  type="number"
                  min={editingRouting?.partitions || 1}
                  value={partitions}
                  onChange={(e) => setPartitions(parseInt(e.target.value, 10) || 1)}
                  required
                />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 shrink-0 text-amber-500" />
                  <span>Partitions can only be scaled up, never decreased.</span>
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !defaultProviderId} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save Routing"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
