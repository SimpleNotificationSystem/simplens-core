import inquirer from 'inquirer';
import { APP_COMPOSE_TEMPLATE, APP_NGINX_SERVICE_TEMPLATE } from './templates.js';
import { writeFile, logInfo, logSuccess } from './utils.js';
import path from 'path';
import type { InfraService } from './types/domain.js';

const INFRA_SERVICES: InfraService[] = [
    { name: 'MongoDB (Database)', value: 'mongo', checked: true },
    { name: 'Kafka (Message Queue)', value: 'kafka', checked: true },
    { name: 'Kafka UI (Dashboard)', value: 'kafka-ui', checked: true },
    { name: 'Redis (Cache)', value: 'redis', checked: true },
    { name: 'Nginx (Reverse Proxy)', value: 'nginx', checked: false },
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
    return promptInfraServicesWithBasePath({ allowNginx: true });
}

/**
 * Prompts infrastructure services with optional nginx availability.
 * If nginx is disabled, it is removed from choices and from result safety-check.
 */
export async function promptInfraServicesWithBasePath(options: {
    allowNginx: boolean;
}): Promise<string[]> {
    const choices = options.allowNginx
        ? INFRA_SERVICES
        : INFRA_SERVICES.filter(service => service.value !== 'nginx');

    const answer = await inquirer.prompt<{ services: string[] }>([
        {
            type: 'checkbox',
            name: 'services',
            message: options.allowNginx
                ? 'Select infrastructure services to run (Space to toggle, Enter to confirm):'
                : 'Select infrastructure services to run (nginx disabled because BASE_PATH is empty):',
            choices,
            validate: (input: string[]) => {
                if (input.length === 0) {
                    return 'Please select at least one service';
                }
                return true;
            },
        },
    ]);

    if (options.allowNginx) {
        return answer.services;
    }

    return answer.services.filter(service => service !== 'nginx');
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
    healthcheck:
      test: echo "try { rs.status() } catch (err) { rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]}) }" | mongosh --port 27017 --quiet
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
      KAFKA_ADVERTISED_LISTENERS: HOST://kafka:9092,DOCKER://kafka:9093
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
    
    'nginx': `  nginx:
    image: nginx:alpine
    container_name: nginx
    ports:
      - "80:80"
    volumes:
      - "./nginx.conf:/etc/nginx/conf.d/default.conf:ro"
    restart: unless-stopped`,
};

/**
 * Service-to-volumes mapping
 */
const SERVICE_VOLUMES: Record<string, string[]> = {
    'mongo': ['mongo_data', 'mongo_config'],
    'kafka': ['kafka_data'],
    'kafka-ui': [],
    'redis': ['redis_data'],
    'nginx': [],
    'loki': ['loki_data'],
    'grafana': ['grafana_data'],
};

/**
 * Build docker-compose content from selected services
 */
function buildInfraCompose(selectedServices: string[]): string {
    // Header
    const header = `# ============================================
# SimpleNS Infrastructure Services
# All services use Docker service names for container-to-container communication.
# This ensures cross-platform compatibility (Windows, Linux, macOS).
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
 * Generate and write docker-compose.infra.yaml
 */
export async function generateInfraCompose(
    targetDir: string,
    selectedServices: string[]
): Promise<void> {
    logInfo('Generating docker-compose.infra.yaml...');

    // Build compose content from service chunks
    const infraContent = buildInfraCompose(selectedServices);

    // Write infrastructure compose file
    const infraPath = path.join(targetDir, 'docker-compose.infra.yaml');
    await writeFile(infraPath, infraContent);
    logSuccess('Generated docker-compose.infra.yaml');
}

/**
 * Build app docker-compose content.
 * Optionally inject nginx reverse-proxy service before the volumes section.
 */
export function buildAppComposeContent(includeNginx: boolean): string {
    if (!includeNginx) {
        return APP_COMPOSE_TEMPLATE;
    }

    const marker = '\nvolumes:';
    if (!APP_COMPOSE_TEMPLATE.includes(marker)) {
        return APP_COMPOSE_TEMPLATE;
    }

    return APP_COMPOSE_TEMPLATE.replace(marker, `\n${APP_NGINX_SERVICE_TEMPLATE}\n${marker}`);
}

/**
 * Write app docker-compose.yaml
 */
export async function writeAppCompose(
    targetDir: string,
    options: { includeNginx?: boolean } = {}
): Promise<void> {
    const appPath = path.join(targetDir, 'docker-compose.yaml');
    const appContent = buildAppComposeContent(options.includeNginx === true);
    await writeFile(appPath, appContent);
    logSuccess('Generated docker-compose.yaml');
}

/**
 * Generate nginx.conf based on basePath configuration
 * 
 * @param targetDir - Target directory to write nginx.conf
 * @param basePath - Base path for dashboard (e.g., '/dashboard' or empty for root)
 * 
 * @remarks
 * This function generates an nginx reverse proxy configuration that:
 * - Routes API requests to the SimpleNS API server
 * - Serves the dashboard at the configured basePath
 * - Handles static assets (_next, public files)
 * - Properly proxies all requests to the appropriate services
 */
export async function generateNginxConfig(
    targetDir: string,
    basePath: string
): Promise<void> {
    logInfo('Generating nginx.conf...');

    // Normalize basePath (remove leading/trailing slashes for template)
    const normalizedPath = basePath.trim().replace(/^\/|\/$/g, '');
    const hasBasePath = normalizedPath.length > 0;

    // Template for nginx.conf
    const nginxTemplate = `server {
    listen 80;
    server_name localhost;

    location /api/notification/ {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /runtime-config.js {
        proxy_pass http://dashboard:3002/runtime-config.js;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # optional: prevent caching if config is dynamic
        add_header Cache-Control "no-store";
    }

    location ^~ /_next/ {
        proxy_pass http://dashboard:3002/_next/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        expires 1y;
        add_header Cache-Control "public, immutable";
    }
${hasBasePath ? `
    location ^~ /${normalizedPath}/_next/ {
        proxy_pass http://dashboard:3002/_next/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        expires 1y;
        add_header Cache-Control "public, immutable";
    }
` : ''}
    location ~* \\.(png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot)$ {
        proxy_pass http://dashboard:3002;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        expires 1y;
        add_header Cache-Control "public, max-age=31536000";
    }
${hasBasePath ? `
    location ^~ /${normalizedPath} {
        proxy_pass http://dashboard:3002;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
` : `
    location / {
        proxy_pass http://dashboard:3002;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
`}
}
`;

    const nginxPath = path.join(targetDir, 'nginx.conf');
    await writeFile(nginxPath, nginxTemplate);
    logSuccess(`Generated nginx.conf${hasBasePath ? ` with base path: /${normalizedPath}` : ' (root path)'}`);
}
