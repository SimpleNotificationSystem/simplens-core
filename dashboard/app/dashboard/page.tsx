"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatsGrid } from "@/components/dashboard/stats-cards";
import { RecentActivity } from "@/components/dashboard/recent-activity";

export default function DashboardPage() {
    return (
        <DashboardLayout
            title="Dashboard"
            description="Overview of your notification service"
        >
            <div className="space-y-6">
                {/* Stats Grid: 7 cards in 2 rows, Alerts spans 2 rows */}
                <div data-tour="stats-grid">
                    <StatsGrid />
                </div>

                {/* Recent Activity (full width) */}
                <div data-tour="recent-activity">
                    <RecentActivity />
                </div>
            </div>
        </DashboardLayout>
    );
}
