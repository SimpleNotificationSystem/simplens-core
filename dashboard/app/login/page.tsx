"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Lock, User, Bell, Shield, Zap } from "lucide-react";

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
        <div className="min-h-screen flex justify-center items-center">
            <div className="w-full sm:w-[70%] h-full flex">
                {/* Left Side - Decorative */}
                <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-zinc-900 dark:bg-zinc-950">
                    {/* Subtle pattern overlay */}
                    <div className="absolute inset-0 opacity-5">
                        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
                    </div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col justify-center px-12 text-white">
                        <div className="mb-8">
                            <Image
                                src="/SimpleNSLogo.png"
                                alt="SimpleNS Logo"
                                width={350}
                                height={150}
                                // className="brightness-0 invert"
                            />
                        </div>

                        <h1 className="text-4xl font-bold mb-4">
                            Admin Dashboard
                        </h1>

                        <p className="text-lg text-white/70 mb-12 max-w-md">
                            Monitor, manage, and optimize your notification delivery pipeline with real-time insights.
                        </p>
                    </div>
                </div>

                {/* Right Side - Login Form */}
                <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
                    <div className="w-full max-w-md">
                        {/* Mobile Logo */}
                        <div className="lg:hidden flex justify-center mb-8">
                            <Image
                                src="/SimpleNSLogo.png"
                                alt="SimpleNS Logo"
                                width={220}
                                height={100}
                                // className="brightness-0 invert"

                            />
                        </div>

                        {/* Form Header */}
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
                            <p className="text-muted-foreground mt-2">
                                Sign in to access the admin dashboard
                            </p>
                        </div>

                        {/* Login Form */}
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="flex items-center gap-3 p-4 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800">
                                    <AlertTriangle className="h-5 w-5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="Enter your username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                        disabled={isLoading}
                                        className="pl-10 h-12 text-base"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        disabled={isLoading}
                                        className="pl-10 h-12 text-base"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-12 text-base font-semibold"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    "Sign In"
                                )}
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
