"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SingleNotificationForm } from "@/components/send/single-notification-form";
import { BatchNotificationForm } from "@/components/send/batch-notification-form";
import { User, Users } from "lucide-react";

export default function SendPage() {
    return (
        <DashboardLayout
            title="Send Notification"
            description="Send single or batch notifications"
        >
            <Tabs defaultValue="single" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="single" className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Single
                    </TabsTrigger>
                    <TabsTrigger value="batch" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Batch
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="single">
                    <SingleNotificationForm />
                </TabsContent>

                <TabsContent value="batch">
                    <BatchNotificationForm />
                </TabsContent>
            </Tabs>
        </DashboardLayout>
    );
}
