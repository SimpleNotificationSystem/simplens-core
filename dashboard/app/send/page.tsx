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
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="single" className="w-full">
          <TabsList className="mb-4 h-10 w-full border-0 shadow-none">
            <TabsTrigger
              value="single"
              className="flex h-full items-center gap-2 border-0 shadow-none data-[state=active]:border-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent"
            >
              <User className="h-4 w-4" />
              Single
            </TabsTrigger>
            <TabsTrigger
              value="batch"
              className="flex h-full items-center gap-2 border-0 shadow-none data-[state=active]:border-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent"
            >
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
