"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatsRowOne, StatsRowTwo } from "@/components/dashboard/stats-cards";
import { RecentActivity } from "@/components/dashboard/recent-activity";

export default function DashboardPage() {
  return (
    <DashboardLayout
      title="Dashboard"
      description="Overview of your notification service"
    >
      <div className="space-y-6">
        {/* Row 1: Total Notifications | Delivered | Pending/Processing */}
        <StatsRowOne />

        {/* Row 2: Failed | Email | WhatsApp */}
        <StatsRowTwo />

        {/* Row 3: Recent Activity (full width) */}
        <RecentActivity />
      </div>
    </DashboardLayout>
  );
}
