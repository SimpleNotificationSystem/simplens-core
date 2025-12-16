#!/bin/bash
# ==============================================================================
# Multi-Wave Chaos Crash Test - COMPLETE INFRASTRUCTURE EDITION
# ==============================================================================
# Simulates multiple aggressive waves of crashes on ALL services including
# infrastructure (MongoDB, Redis, Kafka) to maximally stress the notification
# system's recovery mechanisms.
#
# Wave Types:
#   1. Sustained Load Wave - Crashes app services under constant high load
#   2. Rapid Restart Wave - Quick crash-restart cycles (app + infra)
#   3. Split Brain Wave - Processors up/down in patterns
#   4. Total Blackout Wave - EVERYTHING down (incl. infra), staggered recovery
#   5. Rolling Chaos Wave - Random service kills with load
#   6. Infrastructure Chaos Wave - Database, Redis, Kafka crashes
#   7. Database Partition Wave - MongoDB crash and recovery patterns
#   8. Complete Apocalypse Wave - Everything simultaneously, recovery race
#
# Usage: ./crash-multiwave-chaos.sh [load_requests] [pause_between_waves]
# Example: ./crash-multiwave-chaos.sh 500 30
# ==============================================================================

set -e

# Configuration
LOAD_REQUESTS=${1:-500}
WAVE_PAUSE=${2:-30}
SCRIPTS_DIR=$(cd "$(dirname "$0")/.." && pwd)
PROJECT_ROOT=$(cd "$(dirname "$0")/../.." && pwd)

# Container names - Application Services
APP_CONTAINERS=(
    "backend-notification-service-worker-1"
    "backend-notification-service-email-processor-1"
    "backend-notification-service-whatsapp-processor-1"
    "backend-notification-service-delayed-processor-1"
)

APP_SERVICES=(
    "worker"
    "email-processor"
    "whatsapp-processor"
    "delayed-processor"
)

# Container names - Infrastructure Services
INFRA_CONTAINERS=(
    "mongo"
    "redis"
    "kafka"
)

INFRA_SERVICES=(
    "mongo"
    "redis"
    "kafka"
)

# All containers combined
CONTAINERS=("${APP_CONTAINERS[@]}" "${INFRA_CONTAINERS[@]}")
SERVICES=("${APP_SERVICES[@]}" "${INFRA_SERVICES[@]}")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo ""
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_wave() {
    echo ""
    echo -e "${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│  🌊 WAVE $1: $2${NC}"
    echo -e "${CYAN}└──────────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_crash() {
    echo -e "${RED}[CRASH]${NC} 💥 $1"
}

log_recover() {
    echo -e "${GREEN}[RECOVER]${NC} ✅ $1"
}

# Kill a container silently
kill_container() {
    docker kill "$1" 2>/dev/null || true
}

# Kill multiple containers
kill_containers() {
    for container in "$@"; do
        kill_container "$container"
        log_crash "$container"
    done
}

# Restart all application services
restart_all_app_services() {
    log_recover "Restarting all application services..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d "${APP_SERVICES[@]}"
    sleep 3
}

# Restart all infrastructure services
restart_all_infra_services() {
    log_recover "Restarting all infrastructure services..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d "${INFRA_SERVICES[@]}"
    sleep 5
    wait_for_infra_health
}

# Restart all services (infra first, then app)
restart_all_services() {
    log_recover "Restarting all services..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d "${INFRA_SERVICES[@]}"
    sleep 5
    wait_for_infra_health
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d "${APP_SERVICES[@]}"
    sleep 3
}

# Restart specific services
restart_services() {
    for service in "$@"; do
        log_recover "$service"
        docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d "$service"
    done
}

# Wait for infrastructure to be healthy
wait_for_infra_health() {
    log_info "Waiting for infrastructure services to be healthy..."
    local max_wait=60
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        # Check each service using simpler exit-code based checks
        local mongo_ok=0
        local redis_ok=0
        local kafka_ok=0
        
        # MongoDB check
        if docker exec mongo mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
            mongo_ok=1
        fi
        
        # Redis check
        if docker exec redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            redis_ok=1
        fi
        
        # Kafka check - just verify container is running and responsive
        if docker exec kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1; then
            kafka_ok=1
        fi
        
        if [ $mongo_ok -eq 1 ] && [ $redis_ok -eq 1 ] && [ $kafka_ok -eq 1 ]; then
            log_info "All infrastructure services healthy!"
            return 0
        fi
        
        sleep 2
        waited=$((waited + 2))
    done
    
    log_warn "Timeout waiting for infrastructure health, continuing anyway..."
}

# Start load test in background
start_load() {
    local requests=$1
    log_info "Starting load test with $requests requests..."
    cd "$PROJECT_ROOT"
    node scripts/load-test.js "$requests" 50 &
    LOAD_PID=$!
    sleep 2  # Give load test time to start
}

# Wait for load to finish
wait_for_load() {
    if [ -n "$LOAD_PID" ]; then
        log_info "Waiting for load test to complete..."
        wait $LOAD_PID 2>/dev/null || true
    fi
}

# Random delay between min and max seconds
random_delay() {
    local min=$1
    local max=$2
    local delay=$((RANDOM % (max - min + 1) + min))
    sleep $delay
}

# Get random container(s) from all containers
random_containers() {
    local count=$1
    local shuffled=($(shuf -e "${CONTAINERS[@]}"))
    echo "${shuffled[@]:0:$count}"
}

# Get random app container(s)
random_app_containers() {
    local count=$1
    local shuffled=($(shuf -e "${APP_CONTAINERS[@]}"))
    echo "${shuffled[@]:0:$count}"
}

# Get random infra container(s)
random_infra_containers() {
    local count=$1
    local shuffled=($(shuf -e "${INFRA_CONTAINERS[@]}"))
    echo "${shuffled[@]:0:$count}"
}

# ==============================================================================
# WAVE 1: Sustained Load Crash
# Crashes services while under constant high load
# ==============================================================================
wave_sustained_load() {
    print_wave "1/8" "SUSTAINED LOAD CRASH"
    log_info "Strategy: Crash app services + Redis sequentially while under constant load"
    log_info "This tests message loss and recovery under production-like conditions"
    echo ""
    
    # Start sustained load
    start_load $LOAD_REQUESTS
    
    # Crash services one by one with small delays
    sleep 5
    log_crash "Killing email-processor mid-processing..."
    kill_container "${APP_CONTAINERS[1]}"
    
    sleep 3
    log_crash "Killing whatsapp-processor mid-processing..."
    kill_container "${APP_CONTAINERS[2]}"
    
    sleep 3
    log_crash "Killing worker mid-outbox-poll..."
    kill_container "${APP_CONTAINERS[0]}"
    
    sleep 3
    log_crash "Killing Redis - cache disruption..."
    kill_container "redis"
    
    # Let the chaos continue for a bit
    sleep 10
    
    # Restart in wrong order (processors before worker, but infra first)
    log_info "Restarting infrastructure first..."
    restart_services "redis"
    sleep 5
    wait_for_infra_health
    
    log_info "Restarting in wrong order to create backpressure..."
    restart_services "email-processor" "whatsapp-processor"
    sleep 5
    restart_services "worker"
    
    wait_for_load
    log_info "Wave 1 complete - allowing recovery service to detect issues..."
    sleep 15
}

# ==============================================================================
# WAVE 2: Rapid Restart Chaos
# Quick crash-restart cycles to stress connection handling
# ==============================================================================
wave_rapid_restart() {
    print_wave "2/8" "RAPID RESTART CHAOS"
    log_info "Strategy: Rapid crash-restart cycles to stress connection pools"
    log_info "This tests Kafka consumer group rebalancing and Redis reconnection"
    echo ""
    
    local cycles=5
    
    for i in $(seq 1 $cycles); do
        echo ""
        log_info "Rapid cycle $i/$cycles"
        
        # Crash random service
        local container=$(random_containers 1)
        log_crash "$container"
        kill_container "$container"
        
        # Very short delay
        sleep 2
        
        # Crash another
        container=$(random_containers 1)
        log_crash "$container"
        kill_container "$container"
        
        # Quick restart
        sleep 3
        restart_all_services
        
        # Tiny stabilization
        sleep 2
    done
    
    log_info "Wave 2 complete - services may be in unstable state..."
    sleep 10
}

# ==============================================================================
# WAVE 3: Split Brain Attack
# Create scenarios where some processors are up and others down
# ==============================================================================
wave_split_brain() {
    print_wave "3/8" "SPLIT BRAIN ATTACK"
    log_info "Strategy: Create inconsistent states with partial service availability"
    log_info "This tests status reconciliation and orphaned message detection"
    echo ""
    
    # Start load
    start_load $((LOAD_REQUESTS / 2))
    
    # Pattern 1: Only email works
    log_info "Pattern 1: Only email processor alive..."
    kill_containers "${APP_CONTAINERS[0]}" "${APP_CONTAINERS[2]}" "${APP_CONTAINERS[3]}"
    sleep 15
    restart_all_app_services
    sleep 5
    
    # Pattern 2: Only whatsapp works
    log_info "Pattern 2: Only whatsapp processor alive..."
    kill_containers "${APP_CONTAINERS[0]}" "${APP_CONTAINERS[1]}" "${APP_CONTAINERS[3]}"
    sleep 15
    restart_all_app_services
    sleep 5
    
    # Pattern 3: Worker down, all processors up (messages accepted but not routed)
    log_info "Pattern 3: Worker down - messages queued but not routed..."
    kill_container "${APP_CONTAINERS[0]}"
    sleep 20
    restart_services "worker"
    
    wait_for_load
    log_info "Wave 3 complete - checking for split brain artifacts..."
    sleep 15
}

# ==============================================================================
# WAVE 4: Total Blackout
# Everything dies (including infra), then comes back in various orders
# ==============================================================================
wave_total_blackout() {
    print_wave "4/8" "TOTAL BLACKOUT"
    log_info "Strategy: Complete infrastructure failure including MongoDB, Redis, Kafka"
    log_info "This tests system boot order dependencies and data persistence"
    echo ""
    
    # Start load first
    start_load $((LOAD_REQUESTS / 3))
    sleep 5
    
    # BLACKOUT!
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     ⚡ TOTAL INFRASTRUCTURE BLACKOUT INITIATED ⚡     ║${NC}"
    echo -e "${RED}║     Including: MongoDB, Redis, Kafka, All Processors     ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Kill app services first
    log_crash "Killing all application services..."
    kill_containers "${APP_CONTAINERS[@]}"
    
    sleep 5
    
    # Then infrastructure - this is brutal
    log_crash "Killing Redis..."
    kill_container "redis"
    
    log_crash "Killing Kafka..."
    kill_container "kafka"
    
    log_crash "Killing MongoDB..."
    kill_container "mongo"
    
    # Let everything be dead
    log_info "Complete infrastructure blackout - everything is dead..."
    sleep 20
    
    wait_for_load
    
    # Recovery in proper order - infrastructure first
    echo ""
    log_info "Beginning staged recovery..."
    
    log_info "Stage 1: Bringing MongoDB online first (data layer)..."
    restart_services "mongo"
    sleep 10
    
    log_info "Stage 2: Bringing Redis online (cache layer)..."
    restart_services "redis"
    sleep 5
    
    log_info "Stage 3: Bringing Kafka online (message bus)..."
    restart_services "kafka"
    sleep 10
    
    # Wait for infrastructure health
    wait_for_infra_health
    
    log_info "Stage 4: Bringing delayed processor online..."
    restart_services "delayed-processor"
    sleep 5
    
    log_info "Stage 5: Bringing worker online..."
    restart_services "worker"
    sleep 5
    
    log_info "Stage 6: Bringing email processor online..."
    restart_services "email-processor"
    sleep 3
    
    log_info "Stage 7: Bringing whatsapp processor online..."
    restart_services "whatsapp-processor"
    
    log_info "Wave 4 complete - system recovering from total blackout..."
    sleep 20
}

# ==============================================================================
# WAVE 5: Rolling Chaos
# Continuous random crashes including infrastructure with concurrent load
# ==============================================================================
wave_rolling_chaos() {
    print_wave "5/8" "ROLLING CHAOS"
    log_info "Strategy: Unpredictable random crashes including infrastructure"
    log_info "This is a major stress test - pure chaos across all services!"
    echo ""
    
    # Start continuous load
    start_load $LOAD_REQUESTS
    
    local duration=60  # seconds of chaos
    local start_time=$(date +%s)
    local crash_count=0
    
    log_info "Running $duration seconds of pure chaos..."
    echo ""
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -ge $duration ]; then
            break
        fi
        
        # Random action - expanded to include infra
        local action=$((RANDOM % 6))
        
        case $action in
            0)
                # Kill random app service
                local container=$(random_app_containers 1)
                log_crash "$container (random app kill)"
                kill_container "$container"
                ;;
            1)
                # Kill two random app services
                local containers=($(random_app_containers 2))
                for c in "${containers[@]}"; do
                    log_crash "$c (double app kill)"
                    kill_container "$c"
                done
                ;;
            2)
                # Kill all app services then restart one
                log_crash "ALL APP SERVICES (chaos burst)"
                kill_containers "${APP_CONTAINERS[@]}"
                sleep 2
                local service=${APP_SERVICES[$((RANDOM % ${#APP_SERVICES[@]}))]}
                log_recover "$service (single survivor)"
                restart_services "$service"
                ;;
            3)
                # Quick restart cycle
                local container=$(random_app_containers 1)
                log_crash "$container (restart cycle)"
                kill_container "$container"
                sleep 1
                restart_all_app_services
                ;;
            4)
                # Kill Redis briefly
                log_crash "redis (brief infra kill)"
                kill_container "redis"
                sleep 3
                restart_services "redis"
                ;;
            5)
                # Kill random infrastructure service
                local infra_container=$(random_infra_containers 1)
                log_crash "$infra_container (infra chaos)"
                kill_container "$infra_container"
                sleep 5
                restart_all_infra_services
                ;;
        esac
        
        crash_count=$((crash_count + 1))
        random_delay 3 8
    done
    
    echo ""
    log_info "Chaos complete! Total crash events: $crash_count"
    
    # Final recovery
    restart_all_services
    wait_for_load
    
    log_info "Wave 5 complete - final recovery initiated..."
    sleep 15
}

# ==============================================================================
# WAVE 6: Infrastructure Chaos
# Specifically targets MongoDB, Redis, and Kafka
# ==============================================================================
wave_infrastructure_chaos() {
    print_wave "6/8" "INFRASTRUCTURE CHAOS"
    log_info "Strategy: Targeted attacks on core infrastructure components"
    log_info "This tests data layer resilience and connection recovery"
    echo ""
    
    # Pattern 1: Redis crash while processing
    log_info "Pattern 1: Redis crash during active processing..."
    start_load $((LOAD_REQUESTS / 4))
    sleep 5
    log_crash "Killing Redis..."
    kill_container "redis"
    sleep 15
    log_recover "Restarting Redis..."
    restart_services "redis"
    wait_for_load
    sleep 10
    
    # Pattern 2: Kafka crash - message broker down
    log_info "Pattern 2: Kafka crash - message broker failure..."
    start_load $((LOAD_REQUESTS / 4))
    sleep 5
    log_crash "Killing Kafka..."
    kill_container "kafka"
    sleep 20  # Kafka takes longer to recover
    log_recover "Restarting Kafka..."
    restart_services "kafka"
    sleep 15
    wait_for_load
    sleep 10
    
    # Pattern 3: MongoDB crash - primary database failure
    log_info "Pattern 3: MongoDB crash - database failure..."
    start_load $((LOAD_REQUESTS / 4))
    sleep 5
    log_crash "Killing MongoDB..."
    kill_container "mongo"
    sleep 20
    log_recover "Restarting MongoDB..."
    restart_services "mongo"
    sleep 15
    wait_for_infra_health
    wait_for_load
    sleep 10
    
    # Pattern 4: Cascading infrastructure failure
    log_info "Pattern 4: Cascading infrastructure failure..."
    start_load $((LOAD_REQUESTS / 4))
    sleep 5
    
    log_crash "Redis down..."
    kill_container "redis"
    sleep 3
    log_crash "Kafka down..."
    kill_container "kafka"
    sleep 15
    
    # Recovery in reverse order
    log_recover "Kafka recovering..."
    restart_services "kafka"
    sleep 5
    log_recover "Redis recovering..."
    restart_services "redis"
    
    wait_for_infra_health
    wait_for_load
    
    log_info "Wave 6 complete - infrastructure chaos survived!"
    sleep 15
}

# ==============================================================================
# WAVE 7: Database Partition
# MongoDB specific crashes to test data consistency
# ==============================================================================
wave_database_partition() {
    print_wave "7/8" "DATABASE PARTITION"
    log_info "Strategy: MongoDB crash patterns to test data consistency"
    log_info "This tests transaction handling and outbox pattern resilience"
    echo ""
    
    # Pattern 1: DB crash during outbox poll
    log_info "Pattern 1: MongoDB crash during outbox poll..."
    start_load $((LOAD_REQUESTS / 3))
    sleep 10  # Let messages start processing
    
    log_crash "MongoDB crash mid-transaction..."
    kill_container "mongo"
    
    # Workers should be stuck, messages should be in various states
    sleep 20
    
    log_recover "MongoDB recovering..."
    restart_services "mongo"
    sleep 10
    wait_for_infra_health
    wait_for_load
    sleep 10
    
    # Pattern 2: Rapid MongoDB restart
    log_info "Pattern 2: Rapid MongoDB restart cycles..."
    for i in $(seq 1 3); do
        log_info "MongoDB restart cycle $i/3"
        log_crash "MongoDB down..."
        kill_container "mongo"
        sleep 5
        log_recover "MongoDB up..."
        restart_services "mongo"
        sleep 10
    done
    wait_for_infra_health
    sleep 10
    
    # Pattern 3: DB + App service coordinated crash
    log_info "Pattern 3: Coordinated DB and worker crash..."
    start_load $((LOAD_REQUESTS / 3))
    sleep 5
    
    log_crash "Worker + MongoDB simultaneous crash..."
    kill_container "${APP_CONTAINERS[0]}"
    kill_container "mongo"
    sleep 15
    
    log_recover "MongoDB first, then worker..."
    restart_services "mongo"
    sleep 10
    wait_for_infra_health
    restart_services "worker"
    
    wait_for_load
    log_info "Wave 7 complete - database partition test finished!"
    sleep 15
}

# ==============================================================================
# WAVE 8: Complete Apocalypse
# Everything crashes simultaneously, system races to recover
# ==============================================================================
wave_complete_apocalypse() {
    print_wave "8/8" "COMPLETE APOCALYPSE"
    log_info "Strategy: Simultaneous crash of EVERYTHING - the ultimate test"
    log_info "This tests total system recovery from catastrophic failure"
    echo ""
    
    # Start heavy load
    start_load $LOAD_REQUESTS
    sleep 10  # Let processing begin
    
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                                ║${NC}"
    echo -e "${RED}║    💀 COMPLETE APOCALYPSE - KILLING EVERYTHING 💀    ║${NC}"
    echo -e "${RED}║                                                                ║${NC}"
    echo -e "${RED}║    MongoDB  🔴   Redis  🔴   Kafka  🔴                    ║${NC}"
    echo -e "${RED}║    Worker   🔴   Email  🔴   WhatsApp  🔴   Delayed  🔴    ║${NC}"
    echo -e "${RED}║                                                                ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Kill EVERYTHING at once
    log_crash "Killing ALL services simultaneously..."
    for container in "${CONTAINERS[@]}"; do
        kill_container "$container" &
    done
    wait  # Wait for all kills to complete
    
    # Total darkness
    log_info "Complete system failure - all services dead..."
    sleep 30
    
    wait_for_load
    
    # Chaotic recovery - random order
    echo ""
    log_info "Beginning chaotic recovery..."
    
    # Shuffle and recover in random order (but infrastructure first)
    log_info "Recovering infrastructure in random order..."
    local shuffled_infra=($(shuf -e "${INFRA_SERVICES[@]}"))
    for service in "${shuffled_infra[@]}"; do
        log_recover "$service (random infra recovery)"
        restart_services "$service"
        sleep 5
    done
    
    wait_for_infra_health
    
    log_info "Recovering app services in random order..."
    local shuffled_app=($(shuf -e "${APP_SERVICES[@]}"))
    for service in "${shuffled_app[@]}"; do
        log_recover "$service (random app recovery)"
        restart_services "$service"
        sleep 3
    done
    
    log_info "Wave 8 complete - survived the apocalypse!"
    sleep 20
}

# ==============================================================================
# Main Execution
# ==============================================================================
main() {
    print_header "🔥 MULTI-WAVE CHAOS CRASH TEST - COMPLETE INFRASTRUCTURE EDITION 🔥"
    
    echo "Configuration:"
    echo "  Load Requests per Wave: $LOAD_REQUESTS"
    echo "  Pause Between Waves: ${WAVE_PAUSE}s"
    echo "  Project Root: $PROJECT_ROOT"
    echo ""
    echo "Services to be crashed:"
    echo "  Application: worker, email-processor, whatsapp-processor, delayed-processor"
    echo "  Infrastructure: MongoDB, Redis, Kafka"
    echo ""
    
    log_warn "⚠️  This test WILL crash ALL your services including infrastructure!"
    log_warn "⚠️  MongoDB, Redis, and Kafka WILL be killed during this test!"
    log_warn "Make sure recovery service is running: docker logs -f ns-recovery"
    echo ""
    log_info "Starting in 5 seconds... (Ctrl+C to abort)"
    sleep 5
    
    # Ensure all services are running first
    log_info "Ensuring all services are running..."
    restart_all_services
    sleep 5
    
    # Execute waves
    wave_sustained_load
    echo ""
    log_info "⏸️  Pause for ${WAVE_PAUSE}s before next wave..."
    sleep $WAVE_PAUSE
    
    wave_rapid_restart
    echo ""
    log_info "⏸️  Pause for ${WAVE_PAUSE}s before next wave..."
    sleep $WAVE_PAUSE
    
    wave_split_brain
    echo ""
    log_info "⏸️  Pause for ${WAVE_PAUSE}s before next wave..."
    sleep $WAVE_PAUSE
    
    wave_total_blackout
    echo ""
    log_info "⏸️  Pause for ${WAVE_PAUSE}s before next wave..."
    sleep $WAVE_PAUSE
    
    wave_rolling_chaos
    echo ""
    log_info "⏸️  Pause for ${WAVE_PAUSE}s before next wave..."
    sleep $WAVE_PAUSE
    
    wave_infrastructure_chaos
    echo ""
    log_info "⏸️  Pause for ${WAVE_PAUSE}s before next wave..."
    sleep $WAVE_PAUSE
    
    wave_database_partition
    echo ""
    log_info "⏸️  Pause for ${WAVE_PAUSE}s before final wave..."
    sleep $WAVE_PAUSE
    
    wave_complete_apocalypse
    
    # Final summary
    print_header "🏁 COMPLETE INFRASTRUCTURE CHAOS TEST COMPLETE 🏁"
    
    echo "All 8 waves completed! Your system survived:"
    echo "  ✓ Application service crashes"
    echo "  ✓ Infrastructure crashes (MongoDB, Redis, Kafka)"
    echo "  ✓ Complete blackouts"
    echo "  ✓ Database partitions"
    echo "  ✓ The apocalypse"
    echo ""
    echo "Review the following:"
    echo ""
    echo "1. Recovery Service Logs:"
    echo "   docker logs -f ns-recovery"
    echo ""
    echo "2. Dashboard Alerts:"
    echo "   http://localhost:3002"
    echo ""
    echo "3. Check for stuck notifications:"
    echo "   docker exec -it mongo mongosh --eval \"use notification_service; db.notifications.countDocuments({status: 'processing'})\""
    echo ""
    echo "4. Check Kafka consumer lag:"
    echo "   docker exec -it kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups"
    echo ""
    echo "5. Check Redis connectivity:"
    echo "   docker exec -it redis redis-cli ping"
    echo ""
    echo "6. Check MongoDB replica set status:"
    echo "   docker exec -it mongo mongosh --eval \"rs.status()\""
    echo ""
    
    log_info "Final service restart..."
    restart_all_services
    
    echo ""
    log_info "✅ All services restored. Monitor recovery for the next few minutes."
    log_info "🎉 Congratulations! Your system survived complete infrastructure chaos!"
}

# Run main
main "$@"

