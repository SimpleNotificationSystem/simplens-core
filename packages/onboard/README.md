# @simplens/onboard

> CLI tool to setup SimpleNS instances on any linux/amd64 and windows machine

## Overview

`@simplens/onboard` is an interactive CLI tool that guides you through setting up a complete SimpleNS (Simple Notification System) instance on your local machine or server. It handles infrastructure provisioning, environment configuration, plugin installation, and service orchestration.

## Features

- ✅ **Prerequisite Validation** - Checks Docker installation and availability
- 🏗️ **Infrastructure Setup** - Deploy MongoDB, Kafka, Redis, Loki, Grafana with one command
- 🐧 **OS-Aware Configuration** - Automatically detects and configures for Windows, Linux, or macOS
- ⚙️ **Smart Environment Config** - Default or interactive mode for environment variables
- 🔌 **Plugin Management** - Browse and install official SimpleNS plugins
- 🔐 **Optional SSL Setup** - Automatic Let's Encrypt setup with Dockerized Certbot (Windows/macOS/Linux)
- 🚀 **Service Orchestration** - Automatic health checks and sequential service startup
- 📊 **Service Dashboard** - View all running services and their access URLs

## Prerequisites

- **Docker** - Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- **Node.js** - Version 18 or higher
- **NPX** - Comes with npm 5.2+

## Installation

```bash
# Run directly with npx (recommended)
npx-y @simplens/onboard@latest

# Or install globally
npm install -g @simplens/onboard@latest
simplens-onboard
```

## Usage

### Basic Setup (Application Services Only)

```bash
npx @simplens/onboard
```

This will:
- Validate prerequisites
- Generate `docker-compose.yaml` for app services
- Configure environment variables (default mode)
- Prompt for plugin selection
- Optionally start services

### Full Setup (Infrastructure + Application)

```bash
npx @simplens/onboard --infra
```

Includes everything from basic setup plus:
- Interactive infrastructure service selection (MongoDB, Kafka, Redis, etc.)
- Generate `docker-compose.infra.yaml`
- OS-specific host configuration (handles Linux compatibility)
- Auto-configured connection URLs for infra services

### Interactive Environment Configuration

```bash
npx @simplens/onboard --env interactive
```

Prompts for every environment variable instead of using defaults.

### Custom Target Directory

```bash
npx @simplens/onboard --infra --dir /path/to/setup
```

### Non-Interactive Setup (Full Mode)

```bash
# Complete setup with all options via CLI (no prompts)
npx @simplens/onboard --full --infra mongo kafka redis nginx --env default --base-path /dashboard --plugin @simplens/mock @simplens/nodemailer-gmail --no-output
```

This mode:
- Requires `--full` flag to enable non-interactive mode
- Requires `--env <mode>` to specify environment mode
- **Auto-generates secure credentials** for NS_API_KEY, AUTH_SECRET, and ADMIN_PASSWORD
- **Auto-generates placeholder credentials** for plugins
- **Auto-generates version values** for CORE_VERSION and DASHBOARD_VERSION
- All other options are optional with sensible defaults
- Services are not auto-started (use `docker-compose up -d` manually)

**⚠️ IMPORTANT**: Auto-generated credentials are **NOT secure for production**. After setup completes, you **must** update the following in your `.env` file:
- `NS_API_KEY` - API authentication key
- `AUTH_SECRET` - Session secret for dashboard
- `ADMIN_PASSWORD` - Dashboard admin password
- Plugin credentials (if any plugins were installed)

The CLI will display a security notice with all credentials that need to be updated.

## Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--full` | Non-interactive mode - all options via CLI, no prompts | `false` |
| `--infra [services...]` | Infrastructure services: `mongo`, `kafka`, `kafka-ui`, `redis`, `nginx`, `loki`, `grafana` | `false` |
| `--env <mode>` | Environment setup mode: `default` or `interactive` | Prompted |
| `--dir <path>` | Target directory for setup files | Current directory |
| `--base-path <path>` | Dashboard base path (example: `/dashboard`) | Empty (root) |
| `--core-version <version>` | Override `CORE_VERSION` in generated `.env` (primarily for `--full`) | `latest` |
| `--dashboard-version <version>` | Override `DASHBOARD_VERSION` in generated `.env` (primarily for `--full`) | `latest` |
| `--plugin [plugins...]` | Plugins to install (e.g., `@simplens/mock @simplens/nodemailer-gmail`) | Prompted |
| `--ssl` | Enable optional SSL automation with Certbot | `false` |
| `--ssl-domain <domain>` | Public domain for SSL cert (required with `--ssl` in `--full`) | Prompted |
| `--ssl-email <email>` | Email for Let's Encrypt registration (required with `--ssl` in `--full`) | Prompted |
| `--no-output` | Suppress all console output (silent mode) | `false` |

### Valid Infrastructure Services

- `mongo` - MongoDB database
- `kafka` - Apache Kafka message queue
- `kafka-ui` - Kafka UI dashboard (optional)
- `redis` - Redis cache
- `nginx` - Nginx reverse proxy (optional, Required only is BASE_PATH or SSL is configured)
- `loki` - Loki log aggregation (optional)
- `grafana` - Grafana observability dashboard (optional)

## Workflow

1. **Prerequisites Check**
   - Validates Docker installation
   - Checks Docker daemon status
   - Detects operating system

2. **Infrastructure Setup** (if `--infra` flag is used)
   - Select infrastructure services
   - Auto-detect host configuration (Linux-aware)
   - Generate `docker-compose.infra.yaml`
   - Auto-include Nginx when `BASE_PATH` is non-empty
   - Nginx is disabled entirely when `BASE_PATH` is empty

3. **Environment Configuration**
   - Load defaults from `.env.example`
   - Auto-fill infra connection URLs
   - Ask for `BASE_PATH` first and reuse it throughout setup
   - Prompt for critical values (API keys, passwords)
   - Generate `.env` file

4. **Plugin Installation**
   - Fetch official plugins from registry
   - Interactive multi-select
   - Generate `simplens.config.yaml`
   - Extract and prompt for plugin credentials
   - Append credentials to `.env`

5. **Service Orchestration**
   - Optionally start infrastructure services
   - Wait for health checks
   - Start application services
   - Display service URLs and status

6. **Optional SSL Automation** (if enabled)
   - Auto-enables Nginx if required
   - Issues cert via Dockerized Certbot (`http-01` webroot challenge)
   - Configures auto-renew service and Nginx reload

## Generated Files

- `docker-compose.infra.yaml` - Infrastructure services (if `--infra` used)
- `docker-compose.yaml` - Application services
- `.env` - Environment variables and credentials
- `simplens.config.yaml` - Plugin configuration
- `nginx.conf` - Generated reverse proxy config (HTTP/HTTPS based on options)

## Service URLs

After successful setup, access these URLs:

- **API Server**: http://localhost:3000
- **API Health**: http://localhost:3000/health
- **Dashboard**: http://localhost:3002
- **Kafka UI**: http://localhost:8080 (if Kafka selected)
- **Grafana**: http://localhost:3001 (if Grafana selected)

## Examples

### Minimal Setup

```bash
# Basic setup with defaults (interactive)
npx @simplens/onboard

# Select plugins when prompted
# Choose "Start services" at the end
```

### Full Production Setup

```bash
# Infrastructure + interactive env config
npx @simplens/onboard --infra --env interactive

# Select all infrastructure services
# Provide production credentials
# Start services immediately
```

### Development Setup in Custom Directory

```bash
# Setup in specific directory
npx @simplens/onboard --infra --dir ~/simplens-dev

# Select only MongoDB, Kafka, Redis
# Use default env values
# Start services for testing
```

### Complete Non-Interactive Setup

```bash
# Full automated setup with specific services and plugins
npx @simplens/onboard \
  --full \
  --infra mongo kafka redis nginx \
  --env default \
  --core-version 1.2 \
  --dashboard-version 1.2 \
  --base-path /dashboard \
  --plugin @simplens/mock @simplens/nodemailer-gmail \
  --dir ./my-simplens-setup \
  --no-output

# No prompts - everything configured via CLI
# Services not auto-started in full mode
# Start manually with: docker-compose up -d
```

### CI/CD Pipeline Setup

```bash
# Minimal non-interactive setup for CI/CD
npx @simplens/onboard \
  --full \
  --env default \
  --core-version 1.2 \
  --dashboard-version 1.2 \
  --dir /app/simplens

# Then start services in CI:
cd /app/simplens
docker-compose up -d
```

### Full Setup With SSL Automation

```bash
npx @simplens/onboard \
  --full \
  --infra mongo kafka redis \
  --env default \
  --ssl \
  --ssl-domain app.example.com \
  --ssl-email ops@example.com
```

Notes:
- Your domain DNS must point to the host running onboarding.
- Ports 80 and 443 must be publicly reachable for Let's Encrypt validation.

### Silent Mode (No Console Output)

```bash
# Complete setup with no console output (useful for scripting/automation)
npx @simplens/onboard \
  --full \
  --no-output \
  --infra mongo kafka redis \
  --env default \
  --dir /app/simplens

# Exit code indicates success (0) or failure (non-zero)
# All setup is performed silently in background
```

**Note**: `--no-output` suppresses all console output including banners, progress steps, and warnings. Use with `--full` mode for completely automated setup. Errors are still logged to stderr.

## Troubleshooting

### Docker Not Running

```
❌ Docker daemon is not running.
Please start Docker Desktop or Docker daemon.
```

**Solution**: Start Docker Desktop (Windows/Mac) or `sudo systemctl start docker` (Linux)

### Updating Auto-Generated Credentials (Full Mode)

When using `--full` mode, credentials are auto-generated. To update them:

1. Open the `.env` file in your setup directory
2. Replace the auto-generated values:
   ```bash
   # Before (auto-generated)
   NS_API_KEY=sk_AbCdEf123456...
   AUTH_SECRET=XyZ789...
   ADMIN_PASSWORD=AdminRaNdOm123...
   
   # After (secure values)
   NS_API_KEY=your_secure_api_key_here
   AUTH_SECRET=your_secure_session_secret_here
   ADMIN_PASSWORD=YourSecurePassword123!
   ```
3. For plugin credentials, update the values at the end of the `.env` file
4. Restart services: `docker-compose restart`

**Tip**: Generate secure random values with:
```bash
# Linux/Mac
openssl rand -base64 32

# PowerShell (Windows)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### Plugin Installation Failed

```
❌ Failed to generate plugin configuration
```

**Solution**: 
- Check internet connection
- Verify plugin package name
- Try installing plugins manually with `@simplens/config-gen`

## Development

```bash
# Clone repository
cd packages/onboard

# Install dependencies
npm install

# Build TypeScript
npm run build

# Test locally
npm link
simplens-onboard --help
```

## License

ISC

## Support

For issues and questions:
- GitHub Issues: [SimpleNS Core Issues](https://github.com/SimpleNotificationSystem/simplens-core/issues)
- Documentation: [SimpleNS Docs](https://simplens.in)
