# SimpleNS Admin Dashboard

The Admin Dashboard is a **Next.js** web application that provides a modern interface for monitoring, managing, and operating your SimpleNS notification infrastructure.

> **Default URL:** [http://localhost:3002](http://localhost:3002)

---

## Features

### Core Pages

| Page | Description |
|------|-------------|
| **Dashboard Home** | Overview with status cards (total, delivered, pending, failed) and recent activity feed |
| **Events Explorer** | Paginated event table with filtering, search, and live status indicators |
| **Failed Events** | Dedicated view for failed notifications with one-click retry |
| **Alerts** | System alerts for orphaned notifications, ghost deliveries, and stuck processing |
| **Analytics** | Charts and visualizations for notification status and channel distribution |
| **Plugins** | View installed plugins, their channels, and provider configurations |
| **Payload Studio** | Interactive schema explorer for building notification payloads |
| **Send** | Send test notifications directly from the dashboard |
| **Admin Alert Channels** | Configure external channels to receive system health alerts |
| **Notification Templates** | Create, manage, and preview reusable notification templates |

### Admin Alert Channels

Configure external notification channels (Discord, Telegram, etc.) to receive real-time system alerts directly in your team's communication tools.

- **Multi-Provider Support** — Connect via Discord, Telegram, and other supported providers
- **Granular Alert Filters** — Choose which alert types each channel receives:
  - Failed Notifications — Notifications that exceeded max retry attempts
  - Service Health — MongoDB, Redis, Kafka connection issues
  - Stuck Processing — Notifications stuck in processing state
  - Orphaned Pending — Pending notifications without outbox records
  - Ghost Delivery — Processed notifications without corresponding records
- **Test Before Saving** — Send a test message to verify channel configuration before going live
- **Per-Channel Toggle** — Enable or disable individual channels without deleting their configuration
- **Delete Channels** — Remove channels with a confirmation dialog

### Notification Templates

Create and manage reusable notification templates directly from the dashboard.

- **Visual Template Editor** — Full-screen editor with side-by-side live HTML preview
- **Monaco Code Editor** — Toggle an integrated code editor with syntax highlighting for HTML content fields
- **Provider-Aware Schemas** — Content fields are dynamically loaded based on the selected provider package
- **Template Variables** — Use `{{variable}}` syntax for per-recipient personalization; detected variables are displayed automatically
- **CRUD Operations** — Create, view, edit, and delete templates with a card-based grid UI
- **Filter by Package** — Quickly find templates by filtering on provider package name
- **Use with API** — Reference templates by `template_id` when sending notifications via the API instead of inline content

---

## Getting Started

### Prerequisites

The dashboard is included in the default SimpleNS Docker Compose setup and runs automatically on port **3002**.

### Development

To run the dashboard locally for development:

```bash
npm install
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) with your browser to see the result.

### Environment Variables

Copy `.env.example` to `.env` and configure the required variables:

```bash
cp .env.example .env
```

Refer to `.env.example` for the full list of available configuration options.

---

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org) (App Router)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com)
- **Code Editor:** [Monaco Editor](https://microsoft.github.io/monaco-editor/) (for template editing)
- **Data Fetching:** [SWR](https://swr.vercel.app)
- **Charts:** Analytics visualizations for notification metrics
- **Typography:** [Geist](https://vercel.com/font) font family

---

## Project Structure

```
dashboard/
├── app/                    # Next.js App Router pages
│   ├── admin-alerts/       # Admin alert channel management
│   ├── alerts/             # System alerts page
│   ├── analytics/          # Analytics and charts
│   ├── api/                # API route handlers
│   ├── dashboard/          # Dashboard home page
│   ├── events/             # Events explorer
│   ├── failed/             # Failed events page
│   ├── login/              # Authentication page
│   ├── payload-studio/     # Payload schema explorer
│   ├── plugins/            # Plugin viewer
│   ├── send/               # Send notification page
│   ├── settings/           # Settings page
│   └── templates/          # Notification templates (list + editor)
├── components/             # Reusable UI components
│   ├── admin-alerts/       # Admin alert channel components
│   ├── dashboard/          # Dashboard-specific components
│   ├── events/             # Event table components
│   ├── layout/             # Layout and navigation
│   ├── send/               # Send form components
│   ├── templates/          # Template components
│   ├── tour/               # Onboarding tour
│   └── ui/                 # shadcn/ui primitives
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities and type definitions
└── public/                 # Static assets
```
