# Crash Test Scripts

Scripts to test the notification service's resilience by simulating various crash scenarios.

## Prerequisites

- Docker and Docker Compose running
- All services started: `docker compose up -d`

## Individual Service Crash Tests

| Script | Description |
|--------|-------------|
| `crash-email-processor.sh` | Crash and restart the email processor |
| `crash-whatsapp-processor.sh` | Crash and restart the WhatsApp processor |
| `crash-worker.sh` | Crash and restart the background worker |
| `crash-delayed-processor.sh` | Crash and restart the delayed processor |

## Multi-Service Crash Tests

| Script | Description |
|--------|-------------|
| `crash-all-processors.sh` | Crash all processors simultaneously |
| `crash-complete-outage.sh` | Crash worker + all processors (API stays up) |
| `crash-cascading.sh` | Simulate cascading failure with staggered crashes |

## Usage

### Bash (Linux/Mac/Git Bash)
```bash
cd scripts/crash-tests

# Crash email processor, wait 30s, restart
./crash-email-processor.sh

# Custom delay (60 seconds)
./crash-email-processor.sh 60
```

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
   node scripts/client.js
   # or
   node scripts/load-test.js
   ```

2. **Run a crash script** while notifications are being processed

3. **Monitor the dashboard** to see how the system handles it

## Service Restart Behavior

When services crash and restart:
- **Kafka consumers** will resume from their last committed offset
- **Outbox processor** will reclaim unprocessed entries
- **Delayed processor** will continue processing scheduled notifications
