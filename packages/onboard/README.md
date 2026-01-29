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
- 🚀 **Service Orchestration** - Automatic health checks and sequential service startup
- 📊 **Service Dashboard** - View all running services and their access URLs

## Prerequisites

- **Docker** - Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- **Node.js** - Version 18 or higher
- **NPX** - Comes with npm 5.2+

## Installation

```bash
# Run directly with npx (recommended)
npx @simplens/onboard

# Or install globally
npm install -g @simplens/onboard
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

## Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--infra` | Setup infrastructure services (MongoDB, Kafka, Redis, Loki, Grafana) | `false` |
| `--env <mode>` | Environment setup mode: `default` or `interactive` | `default` |
| `--dir <path>` | Target directory for setup files | Current directory |

## Workflow

1. **Prerequisites Check**
   - Validates Docker installation
   - Checks Docker daemon status
   - Detects operating system

2. **Infrastructure Setup** (if `--infra` flag is used)
   - Select infrastructure services
   - Auto-detect host configuration (Linux-aware)
   - Generate `docker-compose.infra.yaml`

3. **Environment Configuration**
   - Load defaults from `.env.example`
   - Auto-fill infra connection URLs
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

## Generated Files

- `docker-compose.infra.yaml` - Infrastructure services (if `--infra` used)
- `docker-compose.yaml` - Application services
- `.env` - Environment variables and credentials
- `simplens.config.yaml` - Plugin configuration

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
# Basic setup with defaults
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

## Troubleshooting

### Docker Not Running

```
❌ Docker daemon is not running.
Please start Docker Desktop or Docker daemon.
```

**Solution**: Start Docker Desktop (Windows/Mac) or `sudo systemctl start docker` (Linux)

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
- Documentation: [SimpleNS Docs](https://simplens.vercel.app)
