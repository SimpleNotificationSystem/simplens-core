import inquirer from 'inquirer';
import { detectOS } from './validators.js';
import { INFRA_COMPOSE_TEMPLATE, APP_COMPOSE_TEMPLATE } from './templates.js';
import { writeFile, logInfo, logSuccess, logWarning } from './utils.js';
import path from 'path';
import type { InfraService } from './types/domain.js';

const INFRA_SERVICES: InfraService[] = [
    { name: 'MongoDB (Database)', value: 'mongo', checked: true },
    { name: 'Kafka (Message Queue)', value: 'kafka', checked: true },
    { name: 'Kafka UI (Dashboard)', value: 'kafka-ui', checked: true },
    { name: 'Redis (Cache)', value: 'redis', checked: true },
    { name: 'Loki (Log Aggregation)', value: 'loki', checked: false },
    { name: 'Grafana (Observability Dashboard)', value: 'grafana', checked: false },
];

/**
 * Prompts user to select which infrastructure services to deploy.
 * Services include MongoDB, Kafka, Redis, Loki, and Grafana.
 * 
 * @returns Array of selected service IDs (e.g., ['mongo', 'kafka', 'redis'])
 * @throws Error if no services are selected
 * 
 * @example
 * ```ts
 * const services = await promptInfraServices();
 * // Returns: ['mongo', 'kafka', 'kafka-ui', 'redis']
 * ```
 */
export async function promptInfraServices(): Promise<string[]> {
    const answer = await inquirer.prompt<{ services: string[] }>([
        {
            type: 'checkbox',
            name: 'services',
            message: 'Select infrastructure services to run:',
            choices: INFRA_SERVICES,
            validate: (input: string[]) => {
                if (input.length === 0) {
                    return 'Please select at least one service';
                }
                return true;
            },
        },
    ]);

    return answer.services;
}

/**
 * Get infrastructure host based on OS
 */
export function getInfraHost(): string {
    // const os = detectOS();

    // if (os === 'linux') {
    //     logWarning('Linux detected: host.docker.internal does not work by default.');
        
    //     const answer = await inquirer.prompt<{ hostChoice: string; customHost?: string }>([
    //         {
    //             type: 'list',
    //             name: 'hostChoice',
    //             message: 'Select host configuration:',
    //             choices: [
    //                 { name: 'Use Docker bridge IP (172.17.0.1)', value: '172.17.0.1' },
    //                 { name: 'Enter custom IP/hostname', value: 'custom' },
    //             ],
    //         },
    //         {
    //             type: 'input',
    //             name: 'customHost',
    //             message: 'Enter your machine IP or hostname:',
    //             when: (answers) => answers.hostChoice === 'custom',
    //             validate: (input: string) => {
    //                 if (!input || input.trim().length === 0) {
    //                     return 'Please enter a valid IP or hostname';
    //                 }
    //                 return true;
    //             },
    //         },
    //     ]);

    //     return answer.hostChoice === 'custom' ? answer.customHost! : answer.hostChoice;
    // }

    // For Windows, linux and macOS, use host.docker.internal
    return 'host.docker.internal';
}

/**
 * Service chunk definitions - each service as a complete block
 */
const SERVICE_CHUNKS: Record<string, string> = {
    'mongo': `  mongo:
    image: mongo:7.0
    container_name: mongo
    command: [ "--replSet", "rs0", "--bind_ip_all", "--port", "27017" ]
    ports:
      - 27017:27017
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: echo "try { rs.status() } catch (err) { rs.initiate({_id:'rs0',members:[{_id:0,host:'{{INFRA_HOST}}:27017'}]}) }" | mongosh --port 27017 --quiet
      interval: 5s
      timeout: 30s
      start_period: 0s
      start_interval: 1s
      retries: 30
    volumes:
      - "mongo_data:/data/db"
      - "mongo_config:/data/configdb"`,
    
    'kafka': `  kafka:
    image: apache/kafka-native
    container_name: kafka
    ports:
      - "9092:9092"
    environment:
      # Configure listeners for both docker and host communication
      KAFKA_LISTENERS: CONTROLLER://localhost:9091,HOST://0.0.0.0:9092,DOCKER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: HOST://{{INFRA_HOST}}:9092,DOCKER://kafka:9093
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,DOCKER:PLAINTEXT,HOST:PLAINTEXT

      # Settings required for KRaft mode
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9091

      # Listener to use for broker-to-broker communication
      KAFKA_INTER_BROKER_LISTENER_NAME: DOCKER

      # Required for a single node cluster
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

      # Disable auto-topic creation - API server will create topics with correct partitions
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
    volumes:
      - "kafka_data:/var/lib/kafka/data"`,
    
    'kafka-ui': `  kafka-ui:
    image: kafbat/kafka-ui:main
    container_name: kafka-ui
    ports:
      - 8080:8080
    environment:
      DYNAMIC_CONFIG_ENABLED: "true"
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9093
    depends_on:
      - kafka`,
    
    'redis': `  redis:
    image: redis:7-alpine
    container_name: redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - "redis_data:/data"
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 5s
      timeout: 3s
      retries: 5`,
    
    'loki': `  loki:
    image: grafana/loki:2.9.0
    container_name: loki
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml
    volumes:
      - "loki_data:/loki"
    healthcheck:
      test: [ "CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3100/ready || exit 1" ]
      interval: 10s
      timeout: 5s
      retries: 5`,
    
    'grafana': `  grafana:
    image: grafana/grafana:10.2.0
    container_name: grafana
    ports:
      - "3001:3000"
    environment:
      - GF_PATHS_PROVISIONING=/etc/grafana/provisioning
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - "grafana_data:/var/lib/grafana"
    depends_on:
      loki:
        condition: service_healthy`,
};

/**
 * Service-to-volumes mapping
 */
const SERVICE_VOLUMES: Record<string, string[]> = {
    'mongo': ['mongo_data', 'mongo_config'],
    'kafka': ['kafka_data'],
    'kafka-ui': [],
    'redis': ['redis_data'],
    'loki': ['loki_data'],
    'grafana': ['grafana_data'],
};

/**
 * Build docker-compose content from selected services
 */
function buildInfraCompose(selectedServices: string[]): string {
    // Header
    const header = `# ============================================
# INFRA_HOST: Set this in .env to your machine's IP/hostname when running
#             infrastructure on a separate system from application services.
#             Default: host.docker.internal (for same-system deployment)
# ============================================

services:
  # ============================================
  # Infrastructure Services
  # ============================================`;
    
    // Assemble selected service chunks
    const serviceBlocks: string[] = [];
    for (const service of selectedServices) {
        if (SERVICE_CHUNKS[service]) {
            serviceBlocks.push(SERVICE_CHUNKS[service]);
        }
    }
    
    // Collect volumes for selected services
    const volumeSet = new Set<string>();
    for (const service of selectedServices) {
        const volumes = SERVICE_VOLUMES[service] || [];
        volumes.forEach(v => volumeSet.add(v));
    }
    
    // Build volumes section
    const volumeLines: string[] = ['', 'volumes:'];
    for (const volume of Array.from(volumeSet).sort()) {
        volumeLines.push(`  ${volume}:`);
    }
    
    // Build networks section with custom default network name
    const networkLines: string[] = ['', 'networks:', '  default:', '    name: simplens'];
    
    // Combine all parts
    return [
        header,
        serviceBlocks.join('\n\n'),
        volumeLines.join('\n'),
        networkLines.join('\n'),
    ].join('\n');
}

/**
 * Replace INFRA_HOST placeholder in template
 */
export function replaceInfraHost(template: string, infraHost: string): string {
    return template.replace(/\{\{INFRA_HOST\}\}/g, infraHost);
}

/**
 * Generate and write docker-compose.infra.yaml
 */
export async function generateInfraCompose(
    targetDir: string,
    selectedServices: string[]
): Promise<string> {
    logInfo('Generating docker-compose.infra.yaml...');

    // Get infrastructure host
    const infraHost = getInfraHost();
    logSuccess(`Using infrastructure host: ${infraHost}`);

    // Build compose content from service chunks
    let infraContent = buildInfraCompose(selectedServices);
    
    // Replace host placeholder
    infraContent = replaceInfraHost(infraContent, infraHost);

    // Write infrastructure compose file
    const infraPath = path.join(targetDir, 'docker-compose.infra.yaml');
    await writeFile(infraPath, infraContent);
    logSuccess('Generated docker-compose.infra.yaml');

    // Return infraHost for env configuration
    return infraHost;
}

/**
 * Write app docker-compose.yaml
 */
export async function writeAppCompose(targetDir: string): Promise<void> {
    const appPath = path.join(targetDir, 'docker-compose.yaml');
    await writeFile(appPath, APP_COMPOSE_TEMPLATE);
    logSuccess('Generated docker-compose.yaml');
}
