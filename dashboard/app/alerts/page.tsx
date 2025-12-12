"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AlertsList } from "@/components/alerts";

export default function AlertsPage() {
    return (
        <DashboardLayout
            title="System Alerts"
            description="Recovery alerts and system health notifications"
        >
            <AlertsList />
        </DashboardLayout>
    );
}
