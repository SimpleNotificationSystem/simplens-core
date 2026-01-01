"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
    return (
        <DashboardLayout
            title="Settings"
            description="System configuration and information"
        >
            <div className="space-y-6 max-w-4xl">
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
