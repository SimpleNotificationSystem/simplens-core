"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { providerService, pluginService } from "@/lib/api-client";
import type {
  ProviderDto,
  InstalledPlugin,
  ProviderRateLimitStatus,
  ProviderRateLimitListResponse,
  FileSizeUnit,
  MimeCategory,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Eye,
  EyeOff,
  Gauge,
  RotateCcw,
  AlertTriangle,
  Paperclip,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatBytes } from "@/lib/utils";

const STANDARD_MIME_CATEGORIES: MimeCategory[] = [
  {
    category: "Wildcards",
    items: [
      { mime: "*/*", label: "All File Types (Wildcard)", ext: "Any" },
      { mime: "image/*", label: "All Images", ext: "Images" },
      { mime: "audio/*", label: "All Audio", ext: "Audio" },
      { mime: "video/*", label: "All Video", ext: "Video" },
      { mime: "text/*", label: "All Text Files", ext: "Text" },
      { mime: "application/*", label: "All Application Files", ext: "Apps" },
    ],
  },
  {
    category: "Documents",
    items: [
      { mime: "application/pdf", label: "PDF Document", ext: ".pdf" },
      { mime: "text/plain", label: "Plain Text", ext: ".txt" },
      { mime: "text/csv", label: "CSV Spreadsheet", ext: ".csv" },
      { mime: "text/html", label: "HTML Document", ext: ".html" },
      { mime: "text/markdown", label: "Markdown Document", ext: ".md" },
      { mime: "application/rtf", label: "Rich Text Format", ext: ".rtf" },
      { mime: "application/json", label: "JSON Data", ext: ".json" },
      { mime: "application/xml", label: "XML Document", ext: ".xml" },
      { mime: "application/msword", label: "Microsoft Word (Legacy)", ext: ".doc" },
      {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        label: "Microsoft Word",
        ext: ".docx",
      },
      { mime: "application/vnd.ms-excel", label: "Microsoft Excel (Legacy)", ext: ".xls" },
      {
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        label: "Microsoft Excel",
        ext: ".xlsx",
      },
      { mime: "application/vnd.ms-powerpoint", label: "Microsoft PowerPoint (Legacy)", ext: ".ppt" },
      {
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        label: "Microsoft PowerPoint",
        ext: ".pptx",
      },
      { mime: "application/vnd.oasis.opendocument.text", label: "OpenDocument Text", ext: ".odt" },
      { mime: "application/vnd.oasis.opendocument.spreadsheet", label: "OpenDocument Spreadsheet", ext: ".ods" },
    ],
  },
  {
    category: "Images",
    items: [
      { mime: "image/jpeg", label: "JPEG Image", ext: ".jpg, .jpeg" },
      { mime: "image/png", label: "PNG Image", ext: ".png" },
      { mime: "image/gif", label: "GIF Animation", ext: ".gif" },
      { mime: "image/webp", label: "WebP Image", ext: ".webp" },
      { mime: "image/svg+xml", label: "SVG Vector Image", ext: ".svg" },
      { mime: "image/bmp", label: "Bitmap Image", ext: ".bmp" },
      { mime: "image/tiff", label: "TIFF Image", ext: ".tiff" },
      { mime: "image/x-icon", label: "Icon File", ext: ".ico" },
      { mime: "image/heic", label: "HEIC Image", ext: ".heic" },
      { mime: "image/avif", label: "AVIF Image", ext: ".avif" },
    ],
  },
  {
    category: "Archives & Compressed",
    items: [
      { mime: "application/zip", label: "ZIP Archive", ext: ".zip" },
      { mime: "application/gzip", label: "GZIP Archive", ext: ".gz, .gzip" },
      { mime: "application/x-tar", label: "TAR Archive", ext: ".tar" },
      { mime: "application/vnd.rar", label: "RAR Archive", ext: ".rar" },
      { mime: "application/x-7z-compressed", label: "7-Zip Archive", ext: ".7z" },
      { mime: "application/x-bzip2", label: "BZIP2 Archive", ext: ".bz2" },
      { mime: "application/octet-stream", label: "Binary Data / Arbitrary Stream", ext: ".bin" },
    ],
  },
  {
    category: "Audio",
    items: [
      { mime: "audio/mpeg", label: "MP3 Audio", ext: ".mp3" },
      { mime: "audio/wav", label: "WAV Audio", ext: ".wav" },
      { mime: "audio/ogg", label: "OGG Audio", ext: ".ogg" },
      { mime: "audio/aac", label: "AAC Audio", ext: ".aac" },
      { mime: "audio/webm", label: "WebM Audio", ext: ".weba" },
      { mime: "audio/flac", label: "FLAC Audio", ext: ".flac" },
      { mime: "audio/mp4", label: "M4A Audio", ext: ".m4a" },
    ],
  },
  {
    category: "Video",
    items: [
      { mime: "video/mp4", label: "MP4 Video", ext: ".mp4" },
      { mime: "video/webm", label: "WebM Video", ext: ".webm" },
      { mime: "video/mpeg", label: "MPEG Video", ext: ".mpeg" },
      { mime: "video/quicktime", label: "QuickTime MOV", ext: ".mov" },
      { mime: "video/x-msvideo", label: "AVI Video", ext: ".avi" },
      { mime: "video/x-matroska", label: "Matroska Video", ext: ".mkv" },
      { mime: "video/ogg", label: "OGG Video", ext: ".ogv" },
    ],
  },
];

function splitFileSize(raw: string | number | undefined): { value: string; unit: FileSizeUnit } {
  if (raw === undefined || raw === null || raw === "") {
    return { value: "", unit: "MB" };
  }
  const str = String(raw).trim();
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) {
    return { value: str, unit: "MB" };
  }
  const num = parseFloat(match[1]);
  const unit = match[2] ? (match[2].toUpperCase() as FileSizeUnit) : undefined;

  if (unit) {
    return { value: match[1], unit };
  }

  if (num === 0) return { value: "0", unit: "MB" };
  const tb = 1024 * 1024 * 1024 * 1024;
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  const kb = 1024;

  if (num >= tb && num % tb === 0) {
    return { value: String(num / tb), unit: "TB" };
  }
  if (num >= gb && num % gb === 0) {
    return { value: String(num / gb), unit: "GB" };
  }
  if (num >= mb && num % mb === 0) {
    return { value: String(num / mb), unit: "MB" };
  }
  if (num >= kb && num % kb === 0) {
    return { value: String(num / kb), unit: "KB" };
  }
  return { value: String(num), unit: "B" };
}

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

function ProviderRateLimitRing({
  rateLimit,
  onReset,
  isResetting,
}: {
  rateLimit?: ProviderRateLimitStatus;
  onReset: () => void;
  isResetting?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!rateLimit) {
    return null;
  }

  const { config, status } = rateLimit;
  const maxTokens = config.max_tokens;
  const remaining = status.remaining_tokens;
  const used = status.used_tokens;
  const isExhausted = status.is_exhausted;

  const remainingPct = maxTokens > 0 ? Math.min(100, Math.max(0, Math.round((remaining / maxTokens) * 100))) : 0;
  const usedPct = 100 - remainingPct;

  let strokeColor = "text-emerald-500";
  let statusBadgeClass = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  let statusText = "Healthy";

  if (isExhausted) {
    strokeColor = "text-rose-500";
    statusBadgeClass = "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
    statusText = "Exhausted";
  } else if (remainingPct <= 30) {
    strokeColor = "text-amber-500";
    statusBadgeClass = "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    statusText = "Low Capacity";
  }

  const size = 32;
  const strokeWidth = 3;
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (remainingPct / 100) * circumference;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          className={cn(
            "relative flex items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer p-0.5",
            isExhausted && "animate-pulse"
          )}
          aria-label={`Rate limit: ${remaining}/${maxTokens} tokens remaining`}
        >
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={center}
              cy={center}
              r={radius}
              className="text-muted/40 stroke-current"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              className={cn("stroke-current transition-all duration-500 ease-in-out", strokeColor)}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={cn(
                "text-[9px] font-bold font-mono tracking-tighter leading-none",
                isExhausted ? "text-rose-600 dark:text-rose-400" : "text-foreground"
              )}
            >
              {isExhausted ? "0" : `${remainingPct}%`}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-4 space-y-3 z-50 text-xs shadow-xl rounded-xl"
        align="end"
        sideOffset={6}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-sm">
            <Gauge className="h-4 w-4 text-primary" />
            <span>Rate Limit Details</span>
          </div>
          <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 font-medium", statusBadgeClass)}>
            {statusText}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Tokens Remaining:</span>
            <span className="font-semibold font-mono">{remaining} / {maxTokens}</span>
          </div>
          <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                isExhausted ? "bg-rose-500" : remainingPct <= 30 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${remainingPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-muted-foreground">
            <span>Used: <strong className="font-mono text-foreground">{used}</strong> ({usedPct}%)</span>
            <span>Capacity: <strong className="font-mono text-foreground">{maxTokens}</strong></span>
          </div>
        </div>

        <div className="bg-muted/40 rounded-lg p-2.5 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Refill Cadence:</span>
            <span className="font-mono font-medium">+{config.refill_rate} / {config.refill_interval}</span>
          </div>
          {status.is_exhausted ? (
            <div className="flex items-center gap-1.5 text-rose-500 font-medium pt-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Next token in {(status.resets_in_ms / 1000).toFixed(1)}s</span>
            </div>
          ) : remaining < maxTokens ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Full bucket in:</span>
              <span className="font-mono font-medium text-foreground">{(status.full_refill_in_ms / 1000).toFixed(1)}s</span>
            </div>
          ) : (
            <div className="text-emerald-600 dark:text-emerald-400 font-medium">
              Bucket is at full capacity
            </div>
          )}
          {status.exhausted_count > 0 && (
            <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-muted/60">
              <span>Exhaustion events:</span>
              <span className="font-mono font-semibold text-rose-500">{status.exhausted_count}</span>
            </div>
          )}
        </div>

        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5 h-8"
            onClick={onReset}
            disabled={isResetting}
          >
            {isResetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            Refill / Reset Bucket
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

  const {
    data: rateLimitsData,
    mutate: mutateRateLimits,
  } = useSWR<ProviderRateLimitListResponse>(
    "/api/providers/rate-limits",
    () => providerService.getRateLimits(),
    { refreshInterval: 5000, revalidateOnFocus: true }
  );

  const rateLimitsMap = useMemo(() => {
    const map = new Map<string, ProviderRateLimitStatus>();
    if (rateLimitsData?.providers) {
      for (const rl of rateLimitsData.providers) {
        map.set(rl.provider_id, rl);
      }
    }
    return map;
  }, [rateLimitsData]);

  const [resettingProviderId, setResettingProviderId] = useState<string | null>(null);

  const handleResetRateLimit = async (id: string) => {
    try {
      setResettingProviderId(id);
      await providerService.resetRateLimit(id);
      toast.success(`Rate limit for provider '${id}' reset successfully`);
      await mutateRateLimits();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reset rate limit";
      toast.error(message);
    } finally {
      setResettingProviderId(null);
    }
  };

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
  const [optionalConfigValues, setOptionalConfigValues] = useState<Record<string, string>>({});
  const [fileSizeValue, setFileSizeValue] = useState("");
  const [fileSizeUnit, setFileSizeUnit] = useState<FileSizeUnit>("MB");
  const [maxCountOverride, setMaxCountOverride] = useState("");
  const [selectedMimeTypes, setSelectedMimeTypes] = useState<string[]>([]);
  const [mimeSearchQuery, setMimeSearchQuery] = useState("");
  const [customMimeInput, setCustomMimeInput] = useState("");
  const [mimePopoverOpen, setMimePopoverOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [visibleCredentials, setVisibleCredentials] = useState<Record<string, boolean>>({});
  const [loadingCredentialVisibility, setLoadingCredentialVisibility] = useState<Record<string, boolean>>({});
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

  const allMimeCategories = useMemo(() => {
    const pluginMimes = selectedPlugin?.manifest?.fileAttachment?.allowedMimeTypes || [];
    const knownMimes = new Set<string>();
    for (const cat of STANDARD_MIME_CATEGORIES) {
      for (const item of cat.items) {
        knownMimes.add(item.mime.toLowerCase());
      }
    }

    const extraMimes = pluginMimes.filter((m) => !knownMimes.has(m.toLowerCase()));
    if (extraMimes.length === 0) {
      return STANDARD_MIME_CATEGORIES;
    }

    return [
      {
        category: "Plugin Specific",
        items: extraMimes.map((m) => ({
          mime: m,
          label: m,
        })),
      },
      ...STANDARD_MIME_CATEGORIES,
    ];
  }, [selectedPlugin]);

  const filteredMimeCategories = useMemo(() => {
    if (!mimeSearchQuery.trim()) {
      return allMimeCategories;
    }
    const q = mimeSearchQuery.trim().toLowerCase();
    return allMimeCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (i) =>
            i.mime.toLowerCase().includes(q) ||
            i.label.toLowerCase().includes(q) ||
            (i.ext && i.ext.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [allMimeCategories, mimeSearchQuery]);

  const handleAddCustomMime = () => {
    const trimmed = customMimeInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes("/")) {
      toast.error("MIME type must be in the format 'type/subtype' (e.g. application/pdf)");
      return;
    }
    if (selectedMimeTypes.includes(trimmed)) {
      toast.info("MIME type is already selected");
      setCustomMimeInput("");
      return;
    }
    setSelectedMimeTypes([...selectedMimeTypes, trimmed]);
    setCustomMimeInput("");
  };

  const resetForm = () => {
    setEditingProvider(null);
    setProviderId("");
    setPluginName(installedPlugins[0]?.name || "");
    setPriority(0);
    setRateLimit({ maxTokens: "", refillRate: "", refillInterval: "second" });
    setAdditionalOptions([]);
    setOptionalConfigValues({});
    setFileSizeValue("");
    setFileSizeUnit("MB");
    setMaxCountOverride("");
    setSelectedMimeTypes([]);
    setMimeSearchQuery("");
    setCustomMimeInput("");
    setMimePopoverOpen(false);
    setEnabled(true);
    setCredentials({});
    setVisibleCredentials({});
    setLoadingCredentialVisibility({});
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

    const plugin = installedPlugins.find((p) => p.name === provider.plugin_name);
    const optKeys = new Set(plugin?.manifest?.optionalConfig || []);
    const providerOpts = (provider.options || {}) as Record<string, unknown>;

    const loadedOptionalConfig: Record<string, string> = {};
    let rawMaxFileSize: string | number | undefined;
    let loadedMaxCount = "";
    let loadedAllowedMimeTypes: string[] = [];

    if (providerOpts.fileAttachment && typeof providerOpts.fileAttachment === "object") {
      const fa = providerOpts.fileAttachment as Record<string, unknown>;
      if (fa.maxFileSize !== undefined) rawMaxFileSize = fa.maxFileSize as string | number;
      if (fa.maxCount !== undefined) loadedMaxCount = String(fa.maxCount);
      if (fa.allowedMimeTypes) {
        loadedAllowedMimeTypes = Array.isArray(fa.allowedMimeTypes)
          ? (fa.allowedMimeTypes as string[])
          : String(fa.allowedMimeTypes).split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    if (providerOpts.ATTACHMENT_MAX_FILE_SIZE !== undefined) {
      rawMaxFileSize = providerOpts.ATTACHMENT_MAX_FILE_SIZE as string | number;
    }
    if (providerOpts.ATTACHMENT_MAX_COUNT !== undefined) {
      loadedMaxCount = String(providerOpts.ATTACHMENT_MAX_COUNT);
    }
    if (providerOpts.ATTACHMENT_ALLOWED_MIME_TYPES !== undefined) {
      loadedAllowedMimeTypes = Array.isArray(providerOpts.ATTACHMENT_ALLOWED_MIME_TYPES)
        ? (providerOpts.ATTACHMENT_ALLOWED_MIME_TYPES as string[])
        : String(providerOpts.ATTACHMENT_ALLOWED_MIME_TYPES).split(",").map((s) => s.trim()).filter(Boolean);
    }

    const { value: parsedSizeVal, unit: parsedSizeUnit } = splitFileSize(rawMaxFileSize);

    for (const key of optKeys) {
      if (providerOpts[key] !== undefined) {
        loadedOptionalConfig[key] = String(providerOpts[key]);
      }
    }

    const reservedOptionKeys = new Set([
      "priority",
      "rateLimit",
      "fileAttachment",
      "ATTACHMENT_MAX_FILE_SIZE",
      "ATTACHMENT_MAX_COUNT",
      "ATTACHMENT_ALLOWED_MIME_TYPES",
      "ATTACHMENT_ENABLED",
      ...optKeys,
    ]);

    setAdditionalOptions(
      Object.entries(provider.options || {})
        .filter(([key]) => !reservedOptionKeys.has(key))
        .map(([key, value]) => ({
          ...createAdditionalOption(
            key,
            typeof value === "string" ? value : JSON.stringify(value),
          ),
        }))
    );
    setOptionalConfigValues(loadedOptionalConfig);
    setFileSizeValue(parsedSizeVal);
    setFileSizeUnit(parsedSizeUnit);
    setMaxCountOverride(loadedMaxCount);
    setSelectedMimeTypes(loadedAllowedMimeTypes);
    setEnabled(provider.enabled);
    setCredentials({});
    setVisibleCredentials({});
    setLoadingCredentialVisibility({});
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

    // Merge optional config values
    for (const [key, value] of Object.entries(optionalConfigValues)) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      options[key] = /^-?\d+$/.test(trimmed) ? parseInt(trimmed, 10) : trimmed;
    }

    // Merge file attachment overrides
    if (fileSizeValue.trim() !== "") {
      options.ATTACHMENT_MAX_FILE_SIZE = `${fileSizeValue.trim()}${fileSizeUnit}`;
    }
    if (maxCountOverride.trim() !== "") {
      const count = parseInt(maxCountOverride.trim(), 10);
      if (!isNaN(count)) options.ATTACHMENT_MAX_COUNT = count;
    }
    if (selectedMimeTypes.length > 0) {
      options.ATTACHMENT_ALLOWED_MIME_TYPES = selectedMimeTypes;
    }

    for (const option of additionalOptions) {
      const key = option.key.trim();
      if (!key || key === "priority" || key === "rateLimit") continue;
      const value = option.value.trim();
      options[key] = /^-?\d+$/.test(value) ? parseInt(value, 10) : option.value;
    }

    return options;
  };

  const toggleCredentialVisibility = async (field: string): Promise<void> => {
    if (visibleCredentials[field]) {
      setVisibleCredentials({ ...visibleCredentials, [field]: false });
      return;
    }

    if (!editingProvider) return;

    if (!credentials[field]) {
      setLoadingCredentialVisibility({ ...loadingCredentialVisibility, [field]: true });
      try {
        const result = await providerService.get(editingProvider.id, true);
        const decryptedCredentials = result.provider.decrypted_credentials || {};
        setCredentials({ ...credentials, ...decryptedCredentials });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : `Failed to reveal ${field}`;
        toast.error(message);
        return;
      } finally {
        setLoadingCredentialVisibility({ ...loadingCredentialVisibility, [field]: false });
      }
    }

    setVisibleCredentials({ ...visibleCredentials, [field]: true });
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
      mutateRateLimits();
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
      mutateRateLimits();
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
      mutateRateLimits();
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
            onClick={() => {
              mutateProviders();
              mutateRateLimits();
            }}
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
                  <div className="flex items-center gap-2 shrink-0">
                    <ProviderRateLimitRing
                      rateLimit={rateLimitsMap.get(p.id)}
                      onReset={() => handleResetRateLimit(p.id)}
                      isResetting={resettingProviderId === p.id}
                    />
                    <Badge variant={p.enabled ? "default" : "secondary"} className="text-xs">
                      {p.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
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
        <DialogContent className="sm:max-w-lg w-full p-6">
          <DialogHeader className="pb-1">
            <DialogTitle>{editingProvider ? "Edit Provider" : "Configure Provider"}</DialogTitle>
            <DialogDescription>
              {editingProvider
                ? `Update settings or rotate encrypted credentials for ${editingProvider.id}.`
                : "Create an active provider instance backed by an installed plugin."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <ScrollArea className="h-[55vh] sm:h-[60vh] pr-4">
              <div className="space-y-4 py-2 pr-1 min-w-0">
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

              {/* Manifest Optional Configuration */}
              {selectedPlugin?.manifest?.optionalConfig &&
                selectedPlugin.manifest.optionalConfig.filter(
                  (f) =>
                    !f.startsWith("ATTACHMENT_") &&
                    f !== "MAX_FILE_SIZE" &&
                    f !== "MAX_COUNT"
                ).length > 0 && (
                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <Label className="text-sm font-semibold">Optional Configuration</Label>
                      <p className="text-xs text-muted-foreground">
                        Provider-specific parameters defined by the plugin.
                      </p>
                    </div>
                    {selectedPlugin.manifest.optionalConfig
                      .filter(
                        (f) =>
                          !f.startsWith("ATTACHMENT_") &&
                          f !== "MAX_FILE_SIZE" &&
                          f !== "MAX_COUNT"
                      )
                      .map((field) => (
                        <div key={field} className="space-y-1">
                          <Label htmlFor={`opt-${field}`} className="text-xs font-mono">
                            {field}
                          </Label>
                          <Input
                            id={`opt-${field}`}
                            placeholder={`Enter ${field} (Optional)`}
                            value={optionalConfigValues[field] || ""}
                            onChange={(e) =>
                              setOptionalConfigValues({
                                ...optionalConfigValues,
                                [field]: e.target.value,
                              })
                            }
                          />
                        </div>
                      ))}
                  </div>
                )}

              {/* File Attachment Limits Overrides */}
              {selectedPlugin?.manifest?.fileAttachment?.enabled && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Paperclip className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-semibold">File Attachment Limits</Label>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      Optional Overrides
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Override default attachment limits for this provider tier. Leave empty to use plugin defaults.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="att-max-file-size" className="text-xs">
                        Max File Size
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          id="att-max-file-size"
                          type="number"
                          step="any"
                          min="0"
                          placeholder={
                            selectedPlugin.manifest.fileAttachment.maxFileSize
                              ? `Default: ${formatBytes(selectedPlugin.manifest.fileAttachment.maxFileSize)}`
                              : "e.g. 25"
                          }
                          value={fileSizeValue}
                          onChange={(e) => setFileSizeValue(e.target.value)}
                          className="flex-1"
                        />
                        <Select
                          value={fileSizeUnit}
                          onValueChange={(val: FileSizeUnit) => setFileSizeUnit(val)}
                        >
                          <SelectTrigger className="w-[85px] shrink-0" aria-label="File size unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="B">B</SelectItem>
                            <SelectItem value="KB">KB</SelectItem>
                            <SelectItem value="MB">MB</SelectItem>
                            <SelectItem value="GB">GB</SelectItem>
                            <SelectItem value="TB">TB</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {fileSizeValue.trim() !== "" && (
                        <p className="text-[10px] text-muted-foreground">
                          Override: {fileSizeValue.trim()} {fileSizeUnit}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="att-max-count" className="text-xs">
                        Max Attachment Count
                      </Label>
                      <Input
                        id="att-max-count"
                        type="number"
                        min="1"
                        placeholder={
                          selectedPlugin.manifest.fileAttachment.maxCount
                            ? `Default: ${selectedPlugin.manifest.fileAttachment.maxCount}`
                            : "e.g. 10"
                        }
                        value={maxCountOverride}
                        onChange={(e) => setMaxCountOverride(e.target.value)}
                      />
                      {maxCountOverride.trim() !== "" && (
                        <p className="text-[10px] text-muted-foreground">
                          Override: {maxCountOverride.trim()} files
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Allowed MIME Types Dropdown Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Allowed MIME Types</Label>
                      {selectedPlugin.manifest.fileAttachment.allowedMimeTypes &&
                        selectedPlugin.manifest.fileAttachment.allowedMimeTypes.length > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            Plugin default: {selectedPlugin.manifest.fileAttachment.allowedMimeTypes.length} types
                          </span>
                        )}
                    </div>

                    <Popover open={mimePopoverOpen} onOpenChange={setMimePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-between font-normal text-left h-auto min-h-9 py-1.5 px-3 min-w-0 max-w-full overflow-hidden"
                        >
                          <span className="truncate text-xs min-w-0 flex-1">
                            {selectedMimeTypes.length === 0
                              ? "Using plugin default MIME types (Click to customize)"
                              : `${selectedMimeTypes.length} MIME type${selectedMimeTypes.length === 1 ? "" : "s"} selected`}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[380px] max-w-[380px] p-0" align="start">
                        <div className="p-3 border-b space-y-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Search MIME types or extensions..."
                              value={mimeSearchQuery}
                              onChange={(e) => setMimeSearchQuery(e.target.value)}
                              className="pl-8 text-xs h-8"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => {
                                  const all = allMimeCategories.flatMap((cat) => cat.items.map((i) => i.mime));
                                  setSelectedMimeTypes(Array.from(new Set(all)));
                                }}
                              >
                                Select All
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => setSelectedMimeTypes([])}
                              >
                                Clear
                              </Button>
                            </div>
                            {selectedPlugin.manifest.fileAttachment.allowedMimeTypes &&
                              selectedPlugin.manifest.fileAttachment.allowedMimeTypes.length > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() =>
                                    setSelectedMimeTypes([...(selectedPlugin.manifest.fileAttachment.allowedMimeTypes || [])])
                                  }
                                >
                                  Use Defaults
                                </Button>
                              )}
                          </div>
                        </div>

                        <ScrollArea className="h-64 p-2">
                          <div className="space-y-4">
                            {filteredMimeCategories.map((cat) => (
                              <div key={cat.category} className="space-y-1">
                                <div className="flex items-center justify-between px-2 py-1">
                                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    {cat.category}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const catMimes = cat.items.map((i) => i.mime);
                                      const allSelected = catMimes.every((m) => selectedMimeTypes.includes(m));
                                      if (allSelected) {
                                        setSelectedMimeTypes(selectedMimeTypes.filter((m) => !catMimes.includes(m)));
                                      } else {
                                        setSelectedMimeTypes(Array.from(new Set([...selectedMimeTypes, ...catMimes])));
                                      }
                                    }}
                                    className="text-[10px] text-primary hover:underline cursor-pointer"
                                  >
                                    {cat.items.every((i) => selectedMimeTypes.includes(i.mime)) ? "Deselect" : "Select"}
                                  </button>
                                </div>
                                <div className="space-y-0.5">
                                  {cat.items.map((item) => {
                                    const isChecked = selectedMimeTypes.includes(item.mime);
                                    return (
                                      <label
                                        key={item.mime}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-xs transition-colors"
                                      >
                                        <Checkbox
                                          checked={isChecked}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              setSelectedMimeTypes([...selectedMimeTypes, item.mime]);
                                            } else {
                                              setSelectedMimeTypes(selectedMimeTypes.filter((m) => m !== item.mime));
                                            }
                                          }}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="font-mono text-[11px] truncate max-w-[200px] block" title={item.mime}>
                                              {item.mime}
                                            </span>
                                            {item.ext && (
                                              <span className="text-[10px] text-muted-foreground shrink-0">{item.ext}</span>
                                            )}
                                          </div>
                                          <p className="text-[10px] text-muted-foreground truncate">{item.label}</p>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                            {filteredMimeCategories.length === 0 && (
                              <div className="p-4 text-center text-xs text-muted-foreground">
                                No matching MIME types found.
                              </div>
                            )}
                          </div>
                        </ScrollArea>

                        {/* Custom MIME type input */}
                        <div className="p-2 border-t bg-muted/20">
                          <div className="flex items-center gap-1.5">
                            <Input
                              placeholder="Add custom MIME (e.g. text/x-custom)"
                              value={customMimeInput}
                              onChange={(e) => setCustomMimeInput(e.target.value)}
                              className="text-xs h-8"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddCustomMime();
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 text-xs shrink-0"
                              onClick={handleAddCustomMime}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Selected MIME badges */}
                    {selectedMimeTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 bg-muted/30 rounded-md border w-full min-w-0 max-w-full">
                        {selectedMimeTypes.map((mime) => (
                          <Badge
                            key={mime}
                            variant="secondary"
                            className="text-[11px] font-mono py-0.5 pl-2 pr-1 flex items-center gap-1 max-w-full min-w-0 shrink-0"
                          >
                            <span className="truncate max-w-[200px] sm:max-w-[280px]" title={mime}>
                              {mime}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedMimeTypes(selectedMimeTypes.filter((m) => m !== mime))}
                              className="hover:bg-muted rounded p-0.5 cursor-pointer shrink-0"
                              aria-label={`Remove ${mime}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                      <div className="relative">
                        <Input
                          id={`cred-${field}`}
                          className={editingProvider ? "pr-10" : undefined}
                          type={
                            editingProvider
                              ? visibleCredentials[field]
                                ? "text"
                                : "password"
                              : field.toLowerCase().includes("pass") || field.toLowerCase().includes("secret") || field.toLowerCase().includes("token")
                                ? "password"
                                : "text"
                          }
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
                        {editingProvider && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2"
                            aria-label={visibleCredentials[field] ? `Hide ${field}` : `Show ${field}`}
                            title={visibleCredentials[field] ? `Hide ${field}` : `Show ${field}`}
                            disabled={loadingCredentialVisibility[field]}
                            onClick={() => void toggleCredentialVisibility(field)}
                          >
                            {loadingCredentialVisibility[field] ? (
                              <Loader2 className="animate-spin" />
                            ) : visibleCredentials[field] ? (
                              <Eye />
                            ) : (
                              <EyeOff />
                            )}
                          </Button>
                        )}
                      </div>
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
            </ScrollArea>

            <DialogFooter className="shrink-0 pt-4 border-t mt-4 flex sm:justify-between items-center gap-2">
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
