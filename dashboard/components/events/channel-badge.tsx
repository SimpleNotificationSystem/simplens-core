"use client";

import { CHANNEL } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelBadgeProps {
    channel: CHANNEL;
    className?: string;
}

const channelConfig = {
    [CHANNEL.email]: {
        label: "Email",
        icon: Mail,
        className: "bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400",
    },
    [CHANNEL.whatsapp]: {
        label: "WhatsApp",
        icon: MessageCircle,
        className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400",
    },
};

export function ChannelBadge({ channel, className }: ChannelBadgeProps) {
    const config = channelConfig[channel];
    const Icon = config.icon;

    return (
        <Badge
            variant="secondary"
            className={cn(config.className, "gap-1", className)}
        >
            <Icon className="h-3 w-3" />
            {config.label}
        </Badge>
    );
}
