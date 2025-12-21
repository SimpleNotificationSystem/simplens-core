# Crash Test Scripts

Scripts to test the notification service's resilience by simulating various crash scenarios.

## Prerequisites

- Docker and Docker Compose running
- All services started: `docker compose up -d`

## Individual Service Crash Tests

| Script | Description |
|--------|-------------|
| `crash-notification-processor.sh` | Crash and restart the unified notification processor (plugin-based) |
| `crash-worker.sh` | Crash and restart the background worker |
| `crash-delayed-processor.sh` | Crash and restart the delayed processor |

## Multi-Service Crash Tests

| Script | Description |
|--------|-------------|
| `crash-all-processors.sh` | Crash all processors simultaneously |
| `crash-complete-outage.sh` | Crash worker + all processors (API stays up) |
| `crash-cascading.sh` | Simulate cascading failure with staggered crashes |

## Advanced Chaos Tests

| Script | Description |
|--------|-------------|
| `crash-multiwave-chaos.sh` | Multi-wave chaos test with 5 different crash patterns |
| `crash-multiwave-all.sh` | Complete infrastructure chaos (8 waves) including MongoDB, Redis, Kafka |

## Usage

### Bash (Linux/Mac/Git Bash)
```bash
cd scripts/crash-tests

# Crash notification processor, wait 30s, restart
./crash-notification-processor.sh

# Custom delay (60 seconds)
./crash-notification-processor.sh 60

# Run multi-wave chaos test with 500 requests per wave
./crash-multiwave-chaos.sh 500 30
```

## Architecture

The notification service uses a **unified notification-processor** with a plugin system:

- **notification-processor**: Handles all notification channels via plugins (e.g., `@simplens/mock`)
- **worker**: Polls the outbox and publishes messages to Kafka
- **delayed-processor**: Handles scheduled notifications

## What to Observe

1. **Dashboard**: Check `http://localhost:3002` to monitor notification states

2. **MongoDB State**: Check notification states directly
   ```bash
   docker exec -it mongo mongosh --eval "use notification_service; db.notifications.find({status: 'processing'})"
   ```

3. **Kafka Consumer Groups**: Check consumer lag
   ```bash
   docker exec -it kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups
   ```

## Testing Workflow

1. **Send test notifications** before crashing:
   ```bash
   node scripts/load-test.js
   ```

2. **Run a crash script** while notifications are being processed

3. **Monitor the dashboard** to see how the system handles it

## Service Restart Behavior

When services crash and restart:
- **Kafka consumers** will resume from their last committed offset
- **Outbox processor** will reclaim unprocessed entries
- **Delayed processor** will continue processing scheduled notifications
- **Plugin system** will re-initialize all configured providers

## Legacy Scripts (Deprecated)

The following scripts reference the old architecture with separate email/whatsapp processors and are deprecated:
- `crash-email-processor.sh` - Use `crash-notification-processor.sh` instead
- `crash-whatsapp-processor.sh` - Use `crash-notification-processor.sh` instead
