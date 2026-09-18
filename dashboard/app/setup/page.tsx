"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, Check, Eye, EyeOff, KeyRound, Loader2, Lock, Radio, ShieldCheck, User, Zap } from "lucide-react";
import { ElegantShape } from "@/components/elegant-shape";
import { withBasePath } from "@/lib/utils";
import { authService } from "@/lib/api-client";
import { useEffect, useState } from "react";

export default function SetupPage() {
    const router = useRouter();
    const [username, setUsername] = useState("admin");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    const handleSubmit = async (e: React.FormEvent) => {
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
            const data = await authService.setup({ username: trimmedUser, password });
            setIsLoading(false);
            window.location.href = data.redirectUrl || withBasePath("/dashboard");
            return;
        } catch (err) {
            const errorObj = err as Error;
            setError(errorObj.message || "An error occurred during setup. Please try again.");
            setIsLoading(false);
        }
    };

    if (isCheckingStatus) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-white dark:bg-[#030303]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background text-foreground overflow-hidden">
            {/* Left Column: Brand Showcase Panel */}
            <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 lg:p-16 bg-muted/20 border-r border-border/50 overflow-hidden">
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
                        <ShieldCheck className="h-3.5 w-3.5" />
                        First-Time Workspace Onboarding
                    </div>
                </div>

                {/* Center Hero Copy */}
                <div className="relative z-10 max-w-lg space-y-6 my-auto py-12">
                    <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
                        Scalable, multi-channel notification engine.
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        Orchestrate email, SMS, push, and webhooks with guaranteed delivery, delayed queue scheduling, and live zero-downtime reconfiguration.
                    </p>

                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-3 text-xs text-foreground/80">
                            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <Zap className="h-4 w-4" />
                            </div>
                            <span>Instant zero-downtime hot-reload across all services</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-foreground/80">
                            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <Radio className="h-4 w-4" />
                            </div>
                            <span>Unified multi-channel routing and dead-letter recovery</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Footer Note */}
                <div className="relative z-10 text-xs text-muted-foreground">
                    SimpleNS &bull; Fast, Resilient, Open Architecture
                </div>
            </div>

            {/* Right Column: Clean Elegant Setup Form */}
            <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20 xl:px-24">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-md mx-auto space-y-8"
                >
                    {/* Mobile Logo */}
                    <div className="lg:hidden flex flex-col items-center text-center space-y-3 pb-2">
                        <Image
                            src="/SimpleNSLogo.png"
                            alt="SimpleNS Logo"
                            width={180}
                            height={70}
                            priority
                            className="object-contain"
                        />
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            <ShieldCheck className="h-3 w-3" /> Initial Setup
                        </div>
                    </div>

                    {/* Header */}
                    <div className="space-y-2">
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                            Create Administrator
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Set up your master credentials to secure and manage this SimpleNS instance.
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
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
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
                                    {/* Continuous sleek bar */}
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${strengthBarColor}`}
                                            style={{ width: `${Math.max(15, (score / 4) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <p className="text-[11px] text-muted-foreground">
                                8 to 64 characters with a mix of letters and numbers.
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
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            className="w-full h-11 text-sm font-semibold gap-2 mt-4"
                            disabled={isLoading || (confirmPassword.length > 0 && !passwordsMatch)}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Setting Up Account...
                                </>
                            ) : (
                                <>
                                    Complete Setup
                                    <ArrowRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}
