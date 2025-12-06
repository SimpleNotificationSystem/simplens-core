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
            <div className="w-full sm:w-[80%] mx-auto">
                <Tabs defaultValue="single" className=" w-fullspace-y-6">
                    <TabsList className="w-full mb-4">
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
                        <div className="flex justify-center">
                            <SingleNotificationForm />
                        </div>
                    </TabsContent>

                    <TabsContent value="batch">
                        <div className="flex justify-center">
                            <BatchNotificationForm />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
