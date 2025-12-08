import { cn } from "@/lib/utils";
import { AlertCircle, Info, Lightbulb, AlertTriangle } from "lucide-react";

type CalloutType = "note" | "warning" | "tip" | "important";

interface DocsCalloutProps {
    type?: CalloutType;
    title?: string;
    children: React.ReactNode;
}

const calloutConfig = {
    note: {
        icon: Info,
        bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
        borderColor: "border-blue-500/50",
        iconColor: "text-blue-500",
        titleColor: "text-blue-700 dark:text-blue-400",
    },
    warning: {
        icon: AlertTriangle,
        bgColor: "bg-yellow-500/10 dark:bg-yellow-500/20",
        borderColor: "border-yellow-500/50",
        iconColor: "text-yellow-500",
        titleColor: "text-yellow-700 dark:text-yellow-400",
    },
    tip: {
        icon: Lightbulb,
        bgColor: "bg-green-500/10 dark:bg-green-500/20",
        borderColor: "border-green-500/50",
        iconColor: "text-green-500",
        titleColor: "text-green-700 dark:text-green-400",
    },
    important: {
        icon: AlertCircle,
        bgColor: "bg-purple-500/10 dark:bg-purple-500/20",
        borderColor: "border-purple-500/50",
        iconColor: "text-purple-500",
        titleColor: "text-purple-700 dark:text-purple-400",
    },
};

export function DocsCallout({
    type = "note",
    title,
    children,
}: DocsCalloutProps) {
    const config = calloutConfig[type];
    const Icon = config.icon;
    const defaultTitle = type.charAt(0).toUpperCase() + type.slice(1);

    return (
        <div
            className={cn(
                "my-6 rounded-lg border-l-4 p-4",
                config.bgColor,
                config.borderColor
            )}
        >
            <div className="flex items-start gap-3">
                <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", config.iconColor)} />
                <div className="flex-1 min-w-0">
                    <p className={cn("font-semibold mb-1", config.titleColor)}>
                        {title || defaultTitle}
                    </p>
                    <div className="text-sm text-foreground/80">{children}</div>
                </div>
            </div>
        </div>
    );
}
