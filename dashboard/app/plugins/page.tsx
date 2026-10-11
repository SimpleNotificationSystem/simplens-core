"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, Package, GitBranch } from "lucide-react";
import { ProvidersTab } from "@/components/plugins/providers-tab";
import { InstalledPluginsTab } from "@/components/plugins/installed-plugins-tab";
import { ChannelRoutingTab } from "@/components/plugins/channel-routing-tab";

export default function PluginsPage() {
  const [activeTab, setActiveTab] = useState("plugins");

  return (
    <DashboardLayout
      title="Plugins & Providers"
      description="Manage installed plugins and providers"
    >
      <div className="space-y-6">
        {/* 3-Tab Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 mx-auto">
          <TabsList className="grid grid-cols-3 w-full max-w-xl mx-auto">
            <TabsTrigger value="plugins" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span>Installed Plugins</span>
            </TabsTrigger>
            <TabsTrigger value="providers" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              <span>Providers</span>
            </TabsTrigger>
            <TabsTrigger value="routing" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>Channel Routing</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plugins" className="space-y-4">
            <InstalledPluginsTab />
          </TabsContent>

          <TabsContent value="providers" className="space-y-4">
            <ProvidersTab />
          </TabsContent>

          <TabsContent value="routing" className="space-y-4">
            <ChannelRoutingTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
