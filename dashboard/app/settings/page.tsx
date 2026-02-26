"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useGlassmorphism } from "@/components/glassmorphism-provider";
import { useTour } from "@/components/tour/tour-provider";
import { RotateCcw } from "lucide-react";
import packageJson from "../../package.json";

export default function SettingsPage() {
    const { enabled, setEnabled } = useGlassmorphism();
    const { restartTour } = useTour();

    return (
        <DashboardLayout
            title="Settings"
            description="System configuration and information"
        >
            <div className="mx-auto w-full max-w-4xl space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Appearance</CardTitle>
                        <CardDescription>Visual effects and UI rendering</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Glassmorphism Layer</p>
                                <p className="text-xs text-muted-foreground">
                                    Applies frosted-glass styling to dashboard UI components.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch
                                    checked={enabled}
                                    onCheckedChange={setEnabled}
                                    aria-label="Toggle glassmorphism layer"
                                />
                            </div>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Dashboard Tour</p>
                                <p className="text-xs text-muted-foreground">
                                    Replay the guided walkthrough of the dashboard and its features.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={restartTour}
                                className="gap-2"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Restart Tour
                            </Button>
                        </div>
                    </CardContent>
                </Card>


                {/* System Info */}
                <Card>
                    <CardHeader>
                        <CardTitle>System Information</CardTitle>
                        <CardDescription>Current system configuration</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Dashboard Version</span>
                            <Badge variant="secondary">{packageJson.version}</Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Environment</span>
                            <Badge variant="outline">
                                {process.env.NODE_ENV === "production" ? "Production" : "Development"}
                            </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Database</span>
                            <span className="text-sm font-mono">MongoDB</span>
                        </div>
                    </CardContent>
                </Card>

                {/* About */}
                <Card>
                    <CardHeader>
                        <CardTitle>About SimpleNS</CardTitle>
                        <CardDescription>Notification service information</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            SimpleNS is an open-source, self-hosted notification orchestration engine that manages
                            delivery workflows—retries, scheduling, crash recovery, and scaling—while delegating
                            the actual sending to plugins. Build your own providers or use community plugins to
                            support any channel: Email, SMS, WhatsApp, Push, and beyond.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
