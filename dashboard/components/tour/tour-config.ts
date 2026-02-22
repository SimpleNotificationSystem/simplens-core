import type { DriveStep } from "driver.js";

export const TOUR_STORAGE_KEY = "simplens-dashboard-tour-completed";

export const tourSteps: DriveStep[] = [
    {
        element: '[data-tour="sidebar-header"]',
        popover: {
            title: "Welcome to SimpleNS!",
            description:
                "This is your SimpleNS dashboard. Let's take a quick tour of what's available.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-dashboard"]',
        popover: {
            title: "Dashboard",
            description:
                "Your home base — view key metrics, delivery stats, and recent activity at a glance.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="stats-grid"]',
        popover: {
            title: "Quick Stats",
            description:
                "Overview cards showing total deliveries, success rates, failures, and per-channel activity.",
            side: "bottom",
            align: "center",
        },
    },
    {
        element: '[data-tour="recent-activity"]',
        popover: {
            title: "Recent Activity",
            description:
                "A live feed of the latest notification events — see what's been sent, delivered, or failed.",
            side: "top",
            align: "center",
        },
    },
    {
        element: '[data-tour="nav-send"]',
        popover: {
            title: "Send Notifications",
            description:
                "Compose and dispatch notifications through any configured channel — email, SMS, WhatsApp, and more.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-events"]',
        popover: {
            title: "Events",
            description:
                "Browse the full history of all notification events with detailed delivery status and metadata.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-failed"]',
        popover: {
            title: "Failed Notifications",
            description:
                "View failed deliveries with error details. You can retry individual notifications from here.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-alerts"]',
        popover: {
            title: "Alerts",
            description:
                "System-detected issues like ghost deliveries, stuck processing, and orphaned notifications.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-analytics"]',
        popover: {
            title: "Analytics",
            description:
                "Delivery metrics, success rates, and channel performance visualized with interactive charts.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-plugins"]',
        popover: {
            title: "Plugins",
            description:
                "View installed channel providers and their configuration — Email, SMS, WhatsApp, and custom plugins.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-templates"]',
        popover: {
            title: "Templates",
            description:
                "Create and manage reusable notification templates with variable interpolation support.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-payload-studio"]',
        popover: {
            title: "Payload Studio",
            description:
                "Get the request schema JSON for your required plugins for single and batch request api endpoints.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-admin-alerts"]',
        popover: {
            title: "Admin Alerts",
            description:
                "Configure which channels (email, Slack, etc.) receive system alert notifications.",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="nav-settings"]',
        popover: {
            title: "Settings",
            description:
                "Customize appearance, toggle visual effects, and view system information. You can also restart this tour from here!",
            side: "right",
            align: "start",
        },
    },
    {
        element: '[data-tour="theme-toggle"]',
        popover: {
            title: "Theme Toggle",
            description:
                "Switch between light, dark, and system themes to match your preference.",
            side: "right",
            align: "start",
        },
    },
];
