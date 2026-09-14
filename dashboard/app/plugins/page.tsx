"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageToolbar, PageToolbarSection, PageToolbarSpacer } from "@/components/ui/page-toolbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Puzzle, Server, Package, GitBranch } from "lucide-react";
import { ProvidersTab } from "@/components/plugins/providers-tab";
import { InstalledPluginsTab } from "@/components/plugins/installed-plugins-tab";
import { ChannelRoutingTab } from "@/components/plugins/channel-routing-tab";

export default function PluginsPage() {
  const [activeTab, setActiveTab] = useState("providers");

  return (
    <DashboardLayout
      title="Plugins & Providers"
      description="Manage installed plugins and providers"
    >
      <div className="space-y-6">
        {/* Page Toolbar */}
        <PageToolbar>
          <PageToolbarSection>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Puzzle className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Plugin & Provider Hub</h1>
                <p className="text-sm text-muted-foreground">
                  Dynamically manage provider plugins, encrypted credentials, and cascading routing.
                </p>
              </div>
            </div>
          </PageToolbarSection>
          <PageToolbarSpacer />
        </PageToolbar>

        {/* 3-Tab Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-xl">
            <TabsTrigger value="providers" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              <span>Providers</span>
            </TabsTrigger>
            <TabsTrigger value="plugins" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span>Installed Plugins</span>
            </TabsTrigger>
            <TabsTrigger value="routing" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>Channel Routing</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-4">
            <ProvidersTab />
          </TabsContent>

          <TabsContent value="plugins" className="space-y-4">
            <InstalledPluginsTab />
          </TabsContent>

          <TabsContent value="routing" className="space-y-4">
            <ChannelRoutingTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
