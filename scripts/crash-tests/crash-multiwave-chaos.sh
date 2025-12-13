#!/bin/bash
# ==============================================================================
# Multi-Wave Chaos Crash Test
# ==============================================================================
# Simulates multiple aggressive waves of crashes designed to maximally stress
# the notification system's recovery mechanisms.
#
# Wave Types:
#   1. Sustained Load Wave - Crashes under constant high load
#   2. Rapid Restart Wave - Quick crash-restart cycles
#   3. Split Brain Wave - Processors up/down in patterns
#   4. Total Blackout Wave - Everything down, staggered recovery
#   5. Rolling Chaos Wave - Random service kills with load
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

# Container names
CONTAINERS=(
    "backend-notification-service-worker-1"
    "backend-notification-service-email-processor-1"
    "backend-notification-service-whatsapp-processor-1"
    "backend-notification-service-delayed-processor-1"
)

SERVICES=(
    "worker"
    "email-processor"
    "whatsapp-processor"
    "delayed-processor"
)

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

# Restart all services
restart_all_services() {
    log_recover "Restarting all services..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d "${SERVICES[@]}"
    sleep 3
}

# Restart specific services
restart_services() {
    for service in "$@"; do
        log_recover "$service"
        docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d "$service"
    done
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

# Get random container(s)
random_containers() {
    local count=$1
    local shuffled=($(shuf -e "${CONTAINERS[@]}"))
    echo "${shuffled[@]:0:$count}"
}

# ==============================================================================
# WAVE 1: Sustained Load Crash
# Crashes services while under constant high load
# ==============================================================================
wave_sustained_load() {
    print_wave "1/5" "SUSTAINED LOAD CRASH"
    log_info "Strategy: Crash services sequentially while under constant load"
    log_info "This tests message loss and recovery under production-like conditions"
    echo ""
    
    # Start sustained load
    start_load $LOAD_REQUESTS
    
    # Crash services one by one with small delays
    sleep 5
    log_crash "Killing email-processor mid-processing..."
    kill_container "${CONTAINERS[1]}"
    
    sleep 3
    log_crash "Killing whatsapp-processor mid-processing..."
    kill_container "${CONTAINERS[2]}"
    
    sleep 3
    log_crash "Killing worker mid-outbox-poll..."
    kill_container "${CONTAINERS[0]}"
    
    # Let the chaos continue for a bit
    sleep 10
    
    # Restart in wrong order (processors before worker)
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
    print_wave "2/5" "RAPID RESTART CHAOS"
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
    print_wave "3/5" "SPLIT BRAIN ATTACK"
    log_info "Strategy: Create inconsistent states with partial service availability"
    log_info "This tests status reconciliation and orphaned message detection"
    echo ""
    
    # Start load
    start_load $((LOAD_REQUESTS / 2))
    
    # Pattern 1: Only email works
    log_info "Pattern 1: Only email processor alive..."
    kill_containers "${CONTAINERS[0]}" "${CONTAINERS[2]}" "${CONTAINERS[3]}"
    sleep 15
    restart_all_services
    sleep 5
    
    # Pattern 2: Only whatsapp works
    log_info "Pattern 2: Only whatsapp processor alive..."
    kill_containers "${CONTAINERS[0]}" "${CONTAINERS[1]}" "${CONTAINERS[3]}"
    sleep 15
    restart_all_services
    sleep 5
    
    # Pattern 3: Worker down, all processors up (messages accepted but not routed)
    log_info "Pattern 3: Worker down - messages queued but not routed..."
    kill_container "${CONTAINERS[0]}"
    sleep 20
    restart_services "worker"
    
    wait_for_load
    log_info "Wave 3 complete - checking for split brain artifacts..."
    sleep 15
}

# ==============================================================================
# WAVE 4: Total Blackout
# Everything dies, then comes back in various orders
# ==============================================================================
wave_total_blackout() {
    print_wave "4/5" "TOTAL BLACKOUT"
    log_info "Strategy: Complete infrastructure failure with staggered recovery"
    log_info "This tests system boot order dependencies and catchup processing"
    echo ""
    
    # Start load first
    start_load $((LOAD_REQUESTS / 3))
    sleep 5
    
    # BLACKOUT!
    echo ""
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     ⚡ TOTAL BLACKOUT INITIATED ⚡     ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    # Kill everything simultaneously
    kill_containers "${CONTAINERS[@]}"
    
    # Let messages pile up
    log_info "All processors down - messages accumulating..."
    sleep 30
    
    wait_for_load
    
    # Recovery in stages
    log_info "Stage 1: Bringing delayed processor online first..."
    restart_services "delayed-processor"
    sleep 10
    
    log_info "Stage 2: Bringing worker online..."
    restart_services "worker"
    sleep 10
    
    log_info "Stage 3: Bringing email processor online..."
    restart_services "email-processor"
    sleep 5
    
    log_info "Stage 4: Bringing whatsapp processor online..."
    restart_services "whatsapp-processor"
    
    log_info "Wave 4 complete - system recovering from total blackout..."
    sleep 20
}

# ==============================================================================
# WAVE 5: Rolling Chaos
# Continuous random crashes with concurrent load
# ==============================================================================
wave_rolling_chaos() {
    print_wave "5/5" "ROLLING CHAOS"
    log_info "Strategy: Unpredictable random crashes during sustained load"
    log_info "This is the ultimate stress test - pure chaos!"
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
        
        # Random action
        local action=$((RANDOM % 4))
        
        case $action in
            0)
                # Kill random single service
                local container=$(random_containers 1)
                log_crash "$container (random kill)"
                kill_container "$container"
                ;;
            1)
                # Kill two random services
                local containers=($(random_containers 2))
                for c in "${containers[@]}"; do
                    log_crash "$c (double kill)"
                    kill_container "$c"
                done
                ;;
            2)
                # Kill all then restart one
                log_crash "ALL SERVICES (chaos burst)"
                kill_containers "${CONTAINERS[@]}"
                sleep 2
                local service=${SERVICES[$((RANDOM % ${#SERVICES[@]}))]}
                log_recover "$service (single survivor)"
                restart_services "$service"
                ;;
            3)
                # Quick restart cycle
                local container=$(random_containers 1)
                log_crash "$container (restart cycle)"
                kill_container "$container"
                sleep 1
                restart_all_services
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
# Main Execution
# ==============================================================================
main() {
    print_header "🔥 MULTI-WAVE CHAOS CRASH TEST 🔥"
    
    echo "Configuration:"
    echo "  Load Requests per Wave: $LOAD_REQUESTS"
    echo "  Pause Between Waves: ${WAVE_PAUSE}s"
    echo "  Project Root: $PROJECT_ROOT"
    echo ""
    
    log_warn "This test WILL crash your services multiple times!"
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
    
    # Final summary
    print_header "🏁 CHAOS TEST COMPLETE 🏁"
    
    echo "All waves completed! Review the following:"
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
    
    log_info "Final service restart..."
    restart_all_services
    
    echo ""
    log_info "✅ All services restored. Monitor recovery for the next few minutes."
}

# Run main
main "$@"
