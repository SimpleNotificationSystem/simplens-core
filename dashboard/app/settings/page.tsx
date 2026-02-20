"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useGlassmorphism } from "@/components/glassmorphism-provider";

export default function SettingsPage() {
    const { enabled, setEnabled } = useGlassmorphism();

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
                                <Badge variant={enabled ? "default" : "secondary"}>
                                    {enabled ? "Enabled" : "Disabled"}
                                </Badge>
                                <Switch
                                    checked={enabled}
                                    onCheckedChange={setEnabled}
                                    aria-label="Toggle glassmorphism layer"
                                />
                            </div>
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
                            <Badge variant="secondary">1.0.0</Badge>
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
