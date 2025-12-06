"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "motion/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Loader2, Lock, User } from "lucide-react";
import { ElegantShape } from "@/components/elegant-shape";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const result = await signIn("credentials", {
                username,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("Invalid username or password");
                setIsLoading(false);
            } else {
                router.push("/");
                router.refresh();
            }
        } catch {
            setError("An error occurred. Please try again.");
            setIsLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-white dark:bg-[#030303]">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-linear-to-br from-indigo-500/[0.02] via-transparent to-rose-500/[0.02] dark:from-indigo-500/[0.05] dark:via-transparent dark:to-rose-500/[0.05] blur-3xl" />

            {/* Animated shapes background */}
            <div className="absolute inset-0 overflow-hidden">
                <ElegantShape
                    delay={0.3}
                    width={300}
                    height={500}
                    rotate={-8}
                    borderRadius={24}
                    gradient="from-indigo-500/[0.15] dark:from-indigo-500/[0.25]"
                    className="left-[-15%] top-[-10%]"
                />
                <ElegantShape
                    delay={0.5}
                    width={600}
                    height={200}
                    rotate={15}
                    borderRadius={20}
                    gradient="from-rose-500/[0.15] dark:from-rose-500/[0.25]"
                    className="right-[-20%] bottom-[-5%]"
                />
                <ElegantShape
                    delay={0.4}
                    width={300}
                    height={300}
                    rotate={24}
                    borderRadius={32}
                    gradient="from-violet-500/[0.15] dark:from-violet-500/[0.25]"
                    className="left-[-5%] top-[40%]"
                />
                <ElegantShape
                    delay={0.6}
                    width={250}
                    height={100}
                    rotate={-20}
                    borderRadius={12}
                    gradient="from-amber-500/[0.15] dark:from-amber-500/[0.25]"
                    className="right-[10%] top-[5%]"
                />
                <ElegantShape
                    delay={0.7}
                    width={400}
                    height={150}
                    rotate={35}
                    borderRadius={16}
                    gradient="from-emerald-500/[0.15] dark:from-emerald-500/[0.25]"
                    className="right-[-10%] top-[45%]"
                />
                <ElegantShape
                    delay={0.2}
                    width={200}
                    height={200}
                    rotate={-25}
                    borderRadius={28}
                    gradient="from-blue-500/[0.15] dark:from-blue-500/[0.25]"
                    className="left-[20%] bottom-[10%]"
                />
            </div>

            {/* Top/Bottom fade overlay */}
            <div className="absolute inset-0 bg-linear-to-t from-white via-transparent to-white/80 dark:from-[#030303] dark:via-transparent dark:to-[#030303]/80 pointer-events-none" />

            {/* Login Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="relative z-10 w-full max-w-md mx-4"
            >
                <Card className="shadow-xl border-border/50 bg-card/80 backdrop-blur-sm">
                    <CardHeader className="text-center pb-2">
                        <div className="flex justify-center mb-4">
                            <Image
                                src="/SimpleNSLogo.png"
                                alt="SimpleNS Logo"
                                width={200}
                                height={80}
                                priority
                            />
                        </div>
                        <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
                        <CardDescription>
                            Sign in to access the admin dashboard
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="flex items-center gap-3 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="Username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                        disabled={isLoading}
                                        className="pl-10 h-11 bg-background/50"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        disabled={isLoading}
                                        className="pl-10 h-11 bg-background/50"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-11 font-semibold"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    "Sign In"
                                )}
                            </Button>
                        </form>

                        <div className="space-y-4">
                            <Separator />
                            <p className="text-xs text-center text-muted-foreground">
                                Monitor, manage, and optimize your notification delivery pipeline with real-time insights.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
