"use client";

import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Bot,
    Check,
    CheckCircle2,
    Clock,
    Download,
    Eye,
    EyeOff,
    HardDrive,
    KeyRound,
    Layers,
    Loader2,
    Lock,
    Package,
    Puzzle,
    RefreshCw,
    Server,
    ShieldCheck,
    SkipForward,
    Sparkles,
    User,
    Zap,
} from "lucide-react";
import { ElegantShape } from "@/components/elegant-shape";
import { withBasePath } from "@/lib/utils";
import { authService, pluginService, providerService } from "@/lib/api-client";
import type { InstalledPlugin, PluginCatalogItem } from "@/lib/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type SetupStep = 1 | 2 | 3 | 4;
type PluginPhase = "install" | "configure" | "complete";

// Fallback official plugins if public catalog CDN is temporarily unreachable
const FALLBACK_CATALOG: PluginCatalogItem[] = [
    {
        name: "Nodemailer Gmail",
        package: "@simplens/nodemailer-gmail",
        description: "Send email notifications via Gmail SMTP using Nodemailer.",
    },
    {
        name: "Resend",
        package: "@simplens/resend",
        description: "Modern email delivery API for developers using Resend.",
    },
    {
        name: "Mock Provider",
        package: "@simplens/mock",
        description: "A mock notification provider for testing, verification, and local development.",
    },
];

export default function SetupPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState<SetupStep>(1);

    // Form states
    const [username, setUsername] = useState("admin");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Step 4 Plugin & Provider states
    const [pluginPhase, setPluginPhase] = useState<PluginPhase>("install");
    const [catalog, setCatalog] = useState<PluginCatalogItem[]>([]);
    const [isCatalogLoading, setIsCatalogLoading] = useState(false);
    const [installedPackages, setInstalledPackages] = useState<Set<string>>(new Set());
    const [newlyInstalledPlugins, setNewlyInstalledPlugins] = useState<InstalledPlugin[]>([]);
    const [installingPkg, setInstallingPkg] = useState<string | null>(null);

    // Provider configuration state
    const [configureIndex, setConfigureIndex] = useState(0);
    const [providerId, setProviderId] = useState("");
    const [credentials, setCredentials] = useState<Record<string, string>>({});
    const [isSavingProvider, setIsSavingProvider] = useState(false);
    const [providerError, setProviderError] = useState("");

    // On mount, check if admin credentials have already been configured
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const status = await authService.getAuthStatus();
                if (status.isConfigured) {
                    router.replace(withBasePath("/login"));
                    return;
                }
            } catch (err) {
                console.warn("Failed to check auth configuration status", err);
            } finally {
                setIsCheckingStatus(false);
            }
        };

        checkStatus();
    }, [router]);

    // Password strength calculation
    const hasMinLength = password.length >= 8;
    const hasMaxLength = password.length <= 64;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    const score = [
        hasMinLength && hasMaxLength,
        hasUpper && hasLower,
        hasNumber,
        hasSpecial,
    ].filter(Boolean).length;

    const strengthLabel =
        password.length === 0 ? "" :
        score <= 1 ? "Weak" :
        score === 2 ? "Fair" :
        score === 3 ? "Good" : "Strong";

    const strengthBarColor =
        score <= 1 ? "bg-red-500" :
        score === 2 ? "bg-amber-500" :
        score === 3 ? "bg-blue-500" : "bg-emerald-500";

    const strengthTextColor =
        score <= 1 ? "text-red-500 dark:text-red-400" :
        score === 2 ? "text-amber-500 dark:text-amber-400" :
        score === 3 ? "text-blue-500 dark:text-blue-400" : "text-emerald-500 dark:text-emerald-400";

    const passwordsMatch = password.length > 0 && password === confirmPassword;

    // Load plugin catalog when entering step 4
    const loadCatalog = async () => {
        setIsCatalogLoading(true);
        try {
            const data = await pluginService.listCatalog("official");
            if (Array.isArray(data) && data.length > 0) {
                setCatalog(data);
            } else {
                setCatalog(FALLBACK_CATALOG);
            }
        } catch {
            setCatalog(FALLBACK_CATALOG);
        } finally {
            setIsCatalogLoading(false);
        }
    };

    const handleSkipToDashboard = () => {
        window.location.href = withBasePath("/dashboard");
    };

    const handleAdminSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const trimmedUser = username.trim();
        if (trimmedUser.length < 3 || trimmedUser.length > 50) {
            setError("Username must be between 3 and 50 characters.");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }

        if (password.length > 64) {
            setError("Password cannot exceed 64 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsLoading(true);

        try {
            await authService.setup({ username: trimmedUser, password });
            
            // Check if any plugins are already installed
            try {
                const installedRes = await pluginService.listInstalled();
                if (installedRes.plugins && installedRes.plugins.length > 0) {
                    window.location.href = withBasePath("/dashboard");
                    return;
                }
            } catch {
                // If listing plugins fails, proceed to step 4 as fallback
            }

            // No plugins installed: advance to Step 4 (Discover & Install Plugins)
            setIsLoading(false);
            setCurrentStep(4);
            setPluginPhase("install");
            void loadCatalog();
        } catch (err) {
            const errorObj = err as Error;
            setError(errorObj.message || "An error occurred during setup. Please try again.");
            setIsLoading(false);
        }
    };

    const handleInstallPlugin = async (item: PluginCatalogItem) => {
        setInstallingPkg(item.package);
        try {
            const res = await pluginService.install(item.package);
            setInstalledPackages((prev) => new Set([...prev, item.package]));
            if (res.plugin) {
                setNewlyInstalledPlugins((prev) => [...prev, res.plugin]);
            }
            toast.success(`Installed ${item.name} successfully!`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to install plugin";
            toast.error(msg);
        } finally {
            setInstallingPkg(null);
        }
    };

    const handleStartConfigure = () => {
        if (newlyInstalledPlugins.length === 0) {
            handleSkipToDashboard();
            return;
        }
        setConfigureIndex(0);
        const first = newlyInstalledPlugins[0];
        setProviderId(`${first.name.replace(/^plugin-/, "")}-provider`);
        setCredentials({});
        setProviderError("");
        setPluginPhase("configure");
    };

    const handleSaveProvider = async (e: React.FormEvent) => {
        e.preventDefault();
        setProviderError("");

        const currentPlugin = newlyInstalledPlugins[configureIndex];
        if (!currentPlugin) {
            handleSkipToDashboard();
            return;
        }

        const trimmedId = providerId.trim();
        if (!trimmedId) {
            setProviderError("Provider identifier is required.");
            return;
        }

        setIsSavingProvider(true);

        try {
            await providerService.create({
                id: trimmedId,
                plugin_name: currentPlugin.name,
                credentials,
                enabled: true,
            });

            toast.success(`Configured provider for ${currentPlugin.manifest?.displayName || currentPlugin.name}!`);

            // Move to next plugin or finish
            if (configureIndex + 1 < newlyInstalledPlugins.length) {
                const nextIndex = configureIndex + 1;
                const nextPlugin = newlyInstalledPlugins[nextIndex];
                setConfigureIndex(nextIndex);
                setProviderId(`${nextPlugin.name.replace(/^plugin-/, "")}-provider`);
                setCredentials({});
                setProviderError("");
            } else {
                setPluginPhase("complete");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to configure provider";
            setProviderError(msg);
        } finally {
            setIsSavingProvider(false);
        }
    };

    const handleSkipCurrentProvider = () => {
        if (configureIndex + 1 < newlyInstalledPlugins.length) {
            const nextIndex = configureIndex + 1;
            const nextPlugin = newlyInstalledPlugins[nextIndex];
            setConfigureIndex(nextIndex);
            setProviderId(`${nextPlugin.name.replace(/^plugin-/, "")}-provider`);
            setCredentials({});
            setProviderError("");
        } else {
            setPluginPhase("complete");
        }
    };

    if (isCheckingStatus) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-white dark:bg-[#030303]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const steps = [
        { number: 1, title: "Introduction", desc: "What is SimpleNS?" },
        { number: 2, title: "Capabilities", desc: "Features & Architecture" },
        { number: 3, title: "Administrator", desc: "Create Master Account" },
        { number: 4, title: "Plugins", desc: "Optional Provider Setup" },
    ];

    const currentConfiguringPlugin = newlyInstalledPlugins[configureIndex];

    return (
        <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background text-foreground overflow-hidden">
            {/* Left Column: Brand & Interactive Progression Showcase */}
            <div className="relative hidden lg:flex lg:w-5/12 xl:w-4/12 flex-col justify-between p-10 xl:p-14 bg-muted/20 border-r border-border/50 overflow-hidden">
                {/* Background Ambient Shapes */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <ElegantShape
                        delay={0.2}
                        width={420}
                        height={420}
                        rotate={-12}
                        borderRadius={48}
                        gradient="from-primary/20 dark:from-primary/15"
                        className="left-[-10%] top-[-8%]"
                    />
                    <ElegantShape
                        delay={0.4}
                        width={460}
                        height={240}
                        rotate={18}
                        borderRadius={36}
                        gradient="from-blue-500/15 dark:from-blue-500/10"
                        className="right-[-12%] bottom-[15%]"
                    />
                </div>

                {/* Top Logo & Brand Tag */}
                <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-3">
                        <Image
                            src="/SimpleNSLogo.png"
                            alt="SimpleNS Logo"
                            width={210}
                            height={80}
                            priority
                            className="object-contain"
                        />
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        <Sparkles className="h-3.5 w-3.5" />
                        First-Time Workspace Onboarding
                    </div>
                </div>

                {/* Step Timeline Indicator */}
                <div className="relative z-10 space-y-6 my-auto py-8">
                    <div className="space-y-5">
                        {steps.map((step) => {
                            const isCompleted = currentStep > step.number;
                            const isActive = currentStep === step.number;

                            return (
                                <button
                                    key={step.number}
                                    type="button"
                                    onClick={() => {
                                        // Allow navigating directly to visited steps (before admin creation)
                                        if (currentStep < 4 && step.number < currentStep) {
                                            setCurrentStep(step.number as SetupStep);
                                        }
                                    }}
                                    disabled={currentStep === 4 || step.number >= currentStep}
                                    className={`w-full flex items-start gap-4 text-left transition-all duration-200 group ${
                                        isActive
                                            ? "opacity-100"
                                            : isCompleted
                                            ? "opacity-80 hover:opacity-100 cursor-pointer"
                                            : "opacity-40 cursor-not-allowed"
                                    }`}
                                >
                                    {/* Circle Indicator */}
                                    <div
                                        className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                                            isCompleted
                                                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                                                : isActive
                                                ? "bg-primary/20 text-primary border-2 border-primary ring-4 ring-primary/10"
                                                : "bg-muted text-muted-foreground border border-border"
                                        }`}
                                    >
                                        {isCompleted ? <Check className="h-4 w-4" /> : step.number}
                                    </div>

                                    {/* Label */}
                                    <div className="space-y-0.5 pt-0.5">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-sm font-semibold tracking-tight ${
                                                    isActive ? "text-primary" : "text-foreground"
                                                }`}
                                            >
                                                {step.title}
                                            </span>
                                            {isActive && (
                                                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                                                    Current
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            {step.desc}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Step Highlight Preview Box */}
                    <div className="p-4 rounded-xl bg-card/60 backdrop-blur-xs border border-border/60 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                            {currentStep === 1 && <Sparkles className="h-4 w-4" />}
                            {currentStep === 2 && <Zap className="h-4 w-4" />}
                            {currentStep === 3 && <Lock className="h-4 w-4" />}
                            {currentStep === 4 && <Puzzle className="h-4 w-4" />}
                            <span>
                                {currentStep === 1 && "Orchestration, Not Delivery"}
                                {currentStep === 2 && "Modular, Scalable & Extensible"}
                                {currentStep === 3 && "Secure Master Account"}
                                {currentStep === 4 && "Optional Provider Connectors"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            {currentStep === 1 &&
                                "SimpleNS manages the complex notification lifecycle (retries, rate limiting, and recovery) while delegating actual sending to lightweight plugins."}
                            {currentStep === 2 &&
                                "Enjoy complete data sovereignty, AI integration via Model Context Protocol (MCP), independent channel scaling, and zero per-notification vendor fees."}
                            {currentStep === 3 &&
                                "Master administrator credentials are cryptographically protected and stored securely in MongoDB for complete operational authority."}
                            {currentStep === 4 &&
                                "Install delivery provider plugins now or explore the full catalog at any time inside the dashboard."}
                        </p>
                    </div>
                </div>

                {/* Bottom Footer Note */}
                <div className="relative z-10 text-xs text-muted-foreground">
                    SimpleNS &bull; Fast, Resilient, Open Architecture
                </div>
            </div>

            {/* Right Column: Step Content Area */}
            <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-14 xl:p-16 overflow-y-auto">
                {/* Mobile Top Header */}
                <div className="lg:hidden flex items-center justify-between pb-6 border-b border-border/50">
                    <Image
                        src="/SimpleNSLogo.png"
                        alt="SimpleNS Logo"
                        width={140}
                        height={48}
                        priority
                        className="object-contain"
                    />
                    <div className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                        Step {currentStep} of 4
                    </div>
                </div>

                <div className="my-auto max-w-2xl w-full mx-auto py-6">
                    <AnimatePresence mode="wait">
                        {/* ================= STEP 1: WHAT IS SIMPLENS ================= */}
                        {currentStep === 1 && (
                            <motion.div
                                key="step-1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-8"
                            >
                                <div className="space-y-3">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                        Step 1 of 4 &bull; Introduction
                                    </div>
                                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                                        What is SimpleNS?
                                    </h1>
                                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                                        SimpleNS (Simple Notification System) is a <span className="text-foreground font-semibold">self-hosted notification orchestration engine</span> that solves your notification infrastructure once and for all.
                                    </p>
                                </div>

                                {/* Core Concept Callout */}
                                <div className="p-5 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-bold text-primary">
                                        <Sparkles className="h-4 w-4" />
                                        <span>Core Philosophy: Orchestration, Not Delivery</span>
                                    </div>
                                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                        SimpleNS handles the complex, heavy-lifting infrastructure logic—exponential backoff retries, rate limiting, delayed queues, idempotency deduplication, and crash recovery—while delegating actual delivery to lightweight, swappable plugins.
                                    </p>
                                </div>

                                {/* 3 Essential Pillars */}
                                <div className="grid gap-4 sm:grid-cols-3 pt-1">
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-2.5">
                                        <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                            <HardDrive className="h-5 w-5" />
                                        </div>
                                        <h3 className="text-sm font-bold text-foreground">
                                            100% Self-Hosted
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Runs on your infrastructure. Maintain total data sovereignty and customer privacy with zero per-notification vendor fees.
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-2.5">
                                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                                            <Puzzle className="h-5 w-5" />
                                        </div>
                                        <h3 className="text-sm font-bold text-foreground">
                                            Plugin-Based
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Swap delivery providers (Email, SMS, Push, Chat) at any time without modifying a single line of application code.
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-2.5">
                                        <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                        <h3 className="text-sm font-bold text-foreground">
                                            Zero Lock-In
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Standard REST APIs, webhook status callbacks, and open-source architecture that puts you in full control.
                                        </p>
                                    </div>
                                </div>

                                {/* Step 1 Navigation */}
                                <div className="flex items-center justify-end pt-4">
                                    <Button
                                        type="button"
                                        size="lg"
                                        onClick={() => setCurrentStep(2)}
                                        className="h-11 px-6 text-sm font-semibold gap-2 cursor-pointer"
                                    >
                                        Explore Features
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* ================= STEP 2: WHAT IT CAN DO ================= */}
                        {currentStep === 2 && (
                            <motion.div
                                key="step-2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-8"
                            >
                                <div className="space-y-3">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                        <Zap className="h-3.5 w-3.5" />
                                        Step 2 of 4 &bull; Core Features
                                    </div>
                                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                                        What Can SimpleNS Do?
                                    </h1>
                                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                                        A powerful, developer-friendly toolkit engineered for reliable notifications, effortless scaling, and modern AI automation.
                                    </p>
                                </div>

                                {/* 6 High-Level Features Grid */}
                                <div className="grid gap-3.5 sm:grid-cols-2 pt-1">
                                    {/* Feature 1: Extensibility */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 flex items-start gap-3.5">
                                        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                                            <Puzzle className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-bold text-foreground">Modular Extensibility</h3>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                Install official or community plugins for Email (SMTP/SES/Resend), SMS (Twilio/SNS), Push, Discord, Telegram, and Webhooks.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Feature 2: MCP Server & AI */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 flex items-start gap-3.5">
                                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                                            <Bot className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-bold text-foreground">AI & MCP Server Support</h3>
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Native</Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                Built-in Model Context Protocol (MCP) server allows AI agents (Claude, Gemini, Cursor) to send notifications and resolve alerts autonomously.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Feature 3: Scalability */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 flex items-start gap-3.5">
                                        <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                                            <Layers className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-bold text-foreground">Horizontal Scalability</h3>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                Scale notification workers independently per channel. Effortlessly absorb millions of deliveries with zero bottlenecks.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Feature 4: Self-Hosting */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 flex items-start gap-3.5">
                                        <div className="h-9 w-9 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0 mt-0.5">
                                            <Server className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-bold text-foreground">Self-Hosted & Private</h3>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                Deploy effortlessly with Docker Compose or Kubernetes. All sensitive customer credentials and logs stay in your private network.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Feature 5: Scheduled & Delayed Queueing */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 flex items-start gap-3.5">
                                        <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                                            <Clock className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-bold text-foreground">Scheduled & Delayed Queue</h3>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                Queue notifications for future campaigns, set reminders, or delay dispatch with millisecond precision and automatic retry fallbacks.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Feature 6: Built-in Resilience */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 flex items-start gap-3.5">
                                        <div className="h-9 w-9 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 mt-0.5">
                                            <RefreshCw className="h-4 w-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-bold text-foreground">Resilience & Recovery</h3>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                Automated exponential backoff retries, provider rate limiting, ghost detection, and 1-click admin retry resolution.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Step 2 Navigation */}
                                <div className="flex items-center justify-between pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="lg"
                                        onClick={() => setCurrentStep(1)}
                                        className="h-11 px-5 text-sm font-medium gap-2 cursor-pointer"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        Back
                                    </Button>
                                    <Button
                                        type="button"
                                        size="lg"
                                        onClick={() => setCurrentStep(3)}
                                        className="h-11 px-6 text-sm font-semibold gap-2 cursor-pointer"
                                    >
                                        Create Admin Account
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* ================= STEP 3: ADMIN SETUP ================= */}
                        {currentStep === 3 && (
                            <motion.div
                                key="step-3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-6"
                            >
                                <div className="space-y-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                        <Lock className="h-3.5 w-3.5" />
                                        Step 3 of 4 &bull; Master Account
                                    </div>
                                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                                        Create Administrator
                                    </h1>
                                    <p className="text-muted-foreground text-sm leading-relaxed">
                                        Configure your master administrator credentials to secure and manage this SimpleNS instance.
                                    </p>
                                </div>

                                {/* Setup Form */}
                                <form onSubmit={handleAdminSubmit} className="space-y-4 pt-1">
                                    {error && (
                                        <div className="flex items-center gap-3 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900">
                                            <AlertTriangle className="h-4 w-4 shrink-0" />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    {/* Username */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                                            Administrator Username
                                        </label>
                                        <Input
                                            id="username"
                                            type="text"
                                            placeholder="admin"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                            minLength={3}
                                            maxLength={50}
                                            disabled={isLoading}
                                            className="h-11 bg-background text-sm font-medium"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Between 3 and 50 characters.
                                        </p>
                                    </div>

                                    {/* Password */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                            Master Password
                                        </label>
                                        <div className="relative">
                                            <Input
                                                id="password"
                                                type={showPassword ? "text" : "password"}
                                                placeholder="Enter secure password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                minLength={8}
                                                maxLength={64}
                                                disabled={isLoading}
                                                className="h-11 bg-background text-sm font-medium pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                                tabIndex={-1}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>

                                        {/* Minimalist Password Strength Bar */}
                                        {password.length > 0 && (
                                            <div className="space-y-1 pt-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="text-muted-foreground">Password strength</span>
                                                    <span className={`font-semibold ${strengthTextColor}`}>
                                                        {strengthLabel}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-300 ${strengthBarColor}`}
                                                        style={{ width: `${Math.max(15, (score / 4) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <p className="text-[11px] text-muted-foreground">
                                            8 to 64 characters with letters, numbers, and symbols.
                                        </p>
                                    </div>

                                    {/* Confirm Password */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                                            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                                            Confirm Password
                                        </label>
                                        <div className="relative">
                                            <Input
                                                id="confirmPassword"
                                                type={showConfirmPassword ? "text" : "password"}
                                                placeholder="Re-enter password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                required
                                                minLength={8}
                                                maxLength={64}
                                                disabled={isLoading}
                                                className="h-11 bg-background text-sm font-medium pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                                tabIndex={-1}
                                            >
                                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        {confirmPassword.length > 0 && (
                                            <p className={`text-[11px] flex items-center gap-1 font-medium ${passwordsMatch ? "text-emerald-500" : "text-red-500"}`}>
                                                {passwordsMatch ? (
                                                    <>
                                                        <Check className="h-3 w-3" /> Passwords match
                                                    </>
                                                ) : (
                                                    "Passwords do not match"
                                                )}
                                            </p>
                                        )}
                                    </div>

                                    {/* Step 3 Navigation Buttons */}
                                    <div className="flex items-center justify-between pt-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="lg"
                                            onClick={() => setCurrentStep(2)}
                                            disabled={isLoading}
                                            className="h-11 px-5 text-sm font-medium gap-2 cursor-pointer"
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                            Back
                                        </Button>

                                        <Button
                                            type="submit"
                                            size="lg"
                                            disabled={isLoading || (confirmPassword.length > 0 && !passwordsMatch)}
                                            className="h-11 px-6 text-sm font-semibold gap-2 cursor-pointer"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Setting Up Account...
                                                </>
                                            ) : (
                                                <>
                                                    Create Account
                                                    <ArrowRight className="h-4 w-4" />
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </motion.div>
                        )}

                        {/* ================= STEP 4: OPTIONAL PLUGINS & PROVIDERS ================= */}
                        {currentStep === 4 && (
                            <motion.div
                                key="step-4"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-6"
                            >
                                {/* Top Banner with Skip button */}
                                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Admin Created &bull; Optional Setup
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleSkipToDashboard}
                                        className="text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
                                    >
                                        Skip to Dashboard
                                        <SkipForward className="h-3.5 w-3.5" />
                                    </Button>
                                </div>

                                {/* ================= PHASE 4A: DISCOVER & INSTALL ================= */}
                                {pluginPhase === "install" && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                                                Install Notification Plugins
                                            </h1>
                                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                                SimpleNS uses plugins to deliver messages to real-world services. Install one or more official plugins to get started, or skip and install them later in the dashboard.
                                            </p>
                                        </div>

                                        {isCatalogLoading ? (
                                            <div className="py-12 flex flex-col items-center justify-center gap-3">
                                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                <span className="text-xs text-muted-foreground">Loading plugin catalog...</span>
                                            </div>
                                        ) : (
                                            <div className="space-y-3 pt-1">
                                                {catalog.map((item) => {
                                                    const isInstalled = installedPackages.has(item.package);
                                                    const isInstalling = installingPkg === item.package;

                                                    return (
                                                        <div
                                                            key={item.package}
                                                            className="p-4 rounded-xl bg-card border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-border"
                                                        >
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <Package className="h-4 w-4 text-primary" />
                                                                    <span className="text-sm font-bold text-foreground">
                                                                        {item.name}
                                                                    </span>
                                                                    <code className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded">
                                                                        {item.package}
                                                                    </code>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                                                                    {item.description}
                                                                </p>
                                                            </div>

                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant={isInstalled ? "secondary" : "default"}
                                                                disabled={isInstalled || isInstalling}
                                                                onClick={() => handleInstallPlugin(item)}
                                                                className="shrink-0 gap-1.5 text-xs font-semibold cursor-pointer"
                                                            >
                                                                {isInstalled ? (
                                                                    <>
                                                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                                                        Installed
                                                                    </>
                                                                ) : isInstalling ? (
                                                                    <>
                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                        Installing...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Download className="h-3.5 w-3.5" />
                                                                        Install
                                                                    </>
                                                                )}
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Bottom Action Bar */}
                                        <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleSkipToDashboard}
                                                className="text-xs font-medium cursor-pointer"
                                            >
                                                Skip & Go to Dashboard
                                            </Button>

                                            <Button
                                                type="button"
                                                onClick={handleStartConfigure}
                                                disabled={installedPackages.size === 0}
                                                className="gap-2 text-xs font-semibold cursor-pointer"
                                            >
                                                Configure Providers ({installedPackages.size})
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* ================= PHASE 4B: CONFIGURE PROVIDER ================= */}
                                {pluginPhase === "configure" && currentConfiguringPlugin && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] font-mono">
                                                    Provider {configureIndex + 1} of {newlyInstalledPlugins.length}
                                                </Badge>
                                                <span className="text-xs font-bold text-primary">
                                                    {currentConfiguringPlugin.manifest?.displayName || currentConfiguringPlugin.name}
                                                </span>
                                            </div>
                                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                                                Configure Provider Credentials
                                            </h1>
                                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                                Set up connection credentials for this provider, or skip to configure it later in the dashboard.
                                            </p>
                                        </div>

                                        <form onSubmit={handleSaveProvider} className="space-y-4 pt-2">
                                            {providerError && (
                                                <div className="flex items-center gap-3 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900">
                                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                                    <span>{providerError}</span>
                                                </div>
                                            )}

                                            {/* Provider ID */}
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-foreground/80">
                                                    Provider Identifier
                                                </label>
                                                <Input
                                                    type="text"
                                                    value={providerId}
                                                    onChange={(e) => setProviderId(e.target.value)}
                                                    placeholder="my-provider-id"
                                                    required
                                                    disabled={isSavingProvider}
                                                    className="h-10 text-sm font-mono"
                                                />
                                                <p className="text-[11px] text-muted-foreground">
                                                    Unique identifier used when sending notifications through this provider.
                                                </p>
                                            </div>

                                            {/* Required Credentials from Manifest */}
                                            {currentConfiguringPlugin.manifest?.requiredCredentials &&
                                            currentConfiguringPlugin.manifest.requiredCredentials.length > 0 ? (
                                                <div className="space-y-3 pt-1">
                                                    <span className="text-xs font-semibold text-foreground/80">
                                                        Required Credentials
                                                    </span>
                                                    {currentConfiguringPlugin.manifest.requiredCredentials.map((credKey) => (
                                                        <div key={credKey} className="space-y-1">
                                                            <label className="text-[11px] font-mono text-muted-foreground">
                                                                {credKey}
                                                            </label>
                                                            <Input
                                                                type="password"
                                                                placeholder={`Enter ${credKey}`}
                                                                value={credentials[credKey] || ""}
                                                                onChange={(e) =>
                                                                    setCredentials((prev) => ({
                                                                        ...prev,
                                                                        [credKey]: e.target.value,
                                                                    }))
                                                                }
                                                                disabled={isSavingProvider}
                                                                className="h-10 text-sm"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                /* Default generic API Key / Secret for mock or simple providers */
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-foreground/80">
                                                        API Key / Secret (Optional)
                                                    </label>
                                                    <Input
                                                        type="password"
                                                        placeholder="Optional API token or secret"
                                                        value={credentials.apiKey || ""}
                                                        onChange={(e) =>
                                                            setCredentials((prev) => ({
                                                                ...prev,
                                                                apiKey: e.target.value,
                                                            }))
                                                        }
                                                        disabled={isSavingProvider}
                                                        className="h-10 text-sm"
                                                    />
                                                </div>
                                            )}

                                            {/* Provider Buttons */}
                                            <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={handleSkipCurrentProvider}
                                                    disabled={isSavingProvider}
                                                    className="text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground"
                                                >
                                                    Skip This Provider
                                                </Button>

                                                <Button
                                                    type="submit"
                                                    disabled={isSavingProvider || !providerId.trim()}
                                                    className="gap-2 text-xs font-semibold cursor-pointer"
                                                >
                                                    {isSavingProvider ? (
                                                        <>
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            Saving...
                                                        </>
                                                    ) : (
                                                        <>
                                                            Save & Continue
                                                            <ArrowRight className="h-3.5 w-3.5" />
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                {/* ================= PHASE 4C: COMPLETE ================= */}
                                {pluginPhase === "complete" && (
                                    <div className="space-y-6 text-center py-8">
                                        <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
                                            <CheckCircle2 className="h-8 w-8" />
                                        </div>

                                        <div className="space-y-2">
                                            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                                                You&apos;re All Set!
                                            </h2>
                                            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                                                Your master account and initial providers are configured. You are ready to start sending notifications with SimpleNS.
                                            </p>
                                        </div>

                                        <div className="pt-4">
                                            <Button
                                                type="button"
                                                size="lg"
                                                onClick={handleSkipToDashboard}
                                                className="h-11 px-8 text-sm font-semibold gap-2 cursor-pointer"
                                            >
                                                Launch Dashboard
                                                <ArrowRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Bottom Step Dots on Mobile */}
                <div className="lg:hidden flex justify-center items-center gap-2 pt-6">
                    {steps.map((s) => (
                        <div
                            key={s.number}
                            className={`h-2 rounded-full transition-all duration-300 ${
                                currentStep === s.number
                                    ? "w-6 bg-primary"
                                    : currentStep > s.number
                                    ? "w-2 bg-primary/50"
                                    : "w-2 bg-muted"
                            }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
