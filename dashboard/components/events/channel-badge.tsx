"use client";

import { type Channel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle, Bell, Smartphone, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelBadgeProps {
    channel: Channel;
    className?: string;
}

// Deterministic color for unknown channels
const getChannelColorClass = (channel: string) => {
    const classes = [
        "bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400",
        "bg-pink-100 text-pink-800 hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400",
        "bg-indigo-100 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400",
        "bg-teal-100 text-teal-800 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400",
        "bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400",
    ];

    let hash = 0;
    for (let i = 0; i < channel.length; i++) {
        hash = channel.charCodeAt(i) + ((hash << 5) - hash);
    }

    return classes[Math.abs(hash) % classes.length];
};

// Channel configuration with fallback for unknown channels
const getChannelConfig = (channel: Channel) => {
    // Known channels
    if (channel === 'email') {
        return {
            label: "Email",
            icon: Mail,
            className: "bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400",
        };
    }

    if (channel === 'whatsapp') {
        return {
            label: "WhatsApp",
            icon: MessageCircle,
            className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400",
        };
    }

    if (channel === 'sms') {
        return {
            label: "SMS",
            icon: Smartphone,
            className: "bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
        };
    }

    // Default/Dynamic
    return {
        label: channel.charAt(0).toUpperCase() + channel.slice(1),
        icon: Zap,
        className: getChannelColorClass(channel),
    };
};

export function ChannelBadge({ channel, className }: ChannelBadgeProps) {
    const config = getChannelConfig(channel);
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
