#!/usr/bin/env node

/**
 * SimpleNS Unified Development Runner
 *
 * Spawns and manages all development services concurrently:
 * - api (nodemon + tsx)
 * - worker (nodemon + tsx)
 * - notification_processor (nodemon + tsx)
 * - delayed_processor (nodemon + tsx)
 * - recovery (nodemon + tsx)
 * - dashboard (next dev)
 *
 * Loads root .env into all child processes and watches respective directories.
 */

import { spawn, exec } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Load Root .env
const envFile = path.join(ROOT_DIR, '.env.dev');
const envExampleFile = path.join(ROOT_DIR, '.env.example');

let parsedEnv = {};
if (fs.existsSync(envFile)) {
  const result = dotenv.config({ path: envFile });
  parsedEnv = result.parsed || {};
  console.log(`\x1b[32m[dev-runner]\x1b[0m Loaded environment from ${envFile}`);
} else if (fs.existsSync(envExampleFile)) {
  console.warn(`\x1b[33m[dev-runner] Warning: .env not found at root. Falling back to .env.example\x1b[0m`);
  const result = dotenv.config({ path: envExampleFile });
  parsedEnv = result.parsed || {};
} else {
  console.warn(`\x1b[33m[dev-runner] Warning: No .env or .env.example found. Running with host environment.\x1b[0m`);
}

// Ensure development NODE_ENV by default
const sharedEnv = {
  ...process.env,
  ...parsedEnv,
  FORCE_COLOR: '1',
  NODE_ENV: process.env.NODE_ENV || parsedEnv.NODE_ENV || 'development'
};

// Common directories shared across backend services
const SHARED_WATCH = [
  '-w', 'src/config',
  '-w', 'src/database',
  '-w', 'src/types',
  '-w', 'src/utils',
  '-w', 'src/plugins',
  '-w', 'src/storage',
  '-w', 'src/admin-alerts',
  '-w', '.env.dev'
];

const COMMON_NODEMON_ARGS = [
  ...SHARED_WATCH,
  '-e', 'ts,json,env',
  '-d', '0.1' // 100ms debounce for instant reload
];

// ANSI Color definitions
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  orange: '\x1b[38;5;208m',
  dim: '\x1b[2m',
  red: '\x1b[31m'
};

// 2. Service Definitions
const ALL_SERVICES = [
  {
    name: 'api',
    color: C.cyan,
    cmd: 'npx',
    args: [
      'nodemon',
      '-w', 'src/api',
      ...COMMON_NODEMON_ARGS,
      '--exec', 'tsx src/api/server.ts'
    ],
    cwd: ROOT_DIR,
    env: {
      ...sharedEnv,
      PORT: sharedEnv.PORT || '3000'
    }
  },
  {
    name: 'worker',
    color: C.green,
    cmd: 'npx',
    args: [
      'nodemon',
      '-w', 'src/workers',
      '-i', 'src/workers/recovery',
      ...COMMON_NODEMON_ARGS,
      '--exec', 'tsx src/workers/worker.ts'
    ],
    cwd: ROOT_DIR,
    env: sharedEnv
  },
  {
    name: 'notification_processor',
    color: C.yellow,
    cmd: 'npx',
    args: [
      'nodemon',
      '-w', 'src/processors/unified',
      '-w', 'src/processors/shared',
      ...COMMON_NODEMON_ARGS,
      '--exec', 'tsx src/processors/unified/unified.processor.ts'
    ],
    cwd: ROOT_DIR,
    env: sharedEnv
  },
  {
    name: 'delayed_processor',
    color: C.magenta,
    cmd: 'npx',
    args: [
      'nodemon',
      '-w', 'src/processors/delayed',
      '-w', 'src/processors/shared',
      ...COMMON_NODEMON_ARGS,
      '--exec', 'tsx src/processors/delayed/delayed.processor.ts'
    ],
    cwd: ROOT_DIR,
    env: sharedEnv
  },
  {
    name: 'recovery',
    color: C.blue,
    cmd: 'npx',
    args: [
      'nodemon',
      '-w', 'src/workers/recovery',
      '-w', 'src/workers/utils',
      ...COMMON_NODEMON_ARGS,
      '--exec', 'tsx src/workers/recovery/recovery.service.ts'
    ],
    cwd: ROOT_DIR,
    env: sharedEnv
  },
  {
    name: 'dashboard',
    color: C.orange,
    cmd: 'npm',
    args: ['run', 'dev', '--prefix', 'dashboard'],
    cwd: ROOT_DIR,
    env: {
      ...sharedEnv,
      PORT: sharedEnv.DASHBOARD_PORT || '3002'
    }
  }
];

// CLI argument parsing (supports --only=api,worker or --no-dashboard)
const cliArgs = process.argv.slice(2);
let servicesToRun = ALL_SERVICES;

const onlyArg = cliArgs.find(arg => arg.startsWith('--only='));
const noDashboard = cliArgs.includes('--no-dashboard');

if (onlyArg) {
  const allowed = onlyArg.replace('--only=', '').split(',').map(s => s.trim().toLowerCase());
  servicesToRun = ALL_SERVICES.filter(s => allowed.includes(s.name.toLowerCase()));
} else if (noDashboard) {
  servicesToRun = ALL_SERVICES.filter(s => s.name !== 'dashboard');
}

console.log(`${C.bold}🚀 Starting ${servicesToRun.length} SimpleNS services in development mode...${C.reset}\n`);

const spawnedProcesses = [];
let isShuttingDown = false;

// 3. Process Tree Killer (handles Windows taskkill and POSIX process kill)
function terminateChild(child, name) {
  if (!child || !child.pid) return;

  if (process.platform === 'win32') {
    try {
      exec(`taskkill /pid ${child.pid} /T /F`, () => {});
    } catch {
      // Ignore errors if process already exited
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGINT');
    } catch {
      try {
        child.kill('SIGINT');
      } catch {}
    }
  }
}

function handleShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n\x1b[33m[dev-runner] Gracefully shutting down all services...\x1b[0m`);

  for (const item of spawnedProcesses) {
    terminateChild(item.child, item.name);
  }

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('exit', handleShutdown);

// 4. Spawn Services
const MAX_PREFIX_LENGTH = 23;

for (const service of servicesToRun) {
  const prefix = `${service.color}[${service.name.padEnd(MAX_PREFIX_LENGTH)}]${C.reset} | `;

  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd,
    env: service.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    detached: process.platform !== 'win32' // allows process group kill on POSIX
  });

  spawnedProcesses.push({ child, name: service.name });

  if (child.stdout) {
    const rlOut = readline.createInterface({ input: child.stdout });
    rlOut.on('line', line => {
      console.log(`${prefix}${line}`);
    });
  }

  if (child.stderr) {
    const rlErr = readline.createInterface({ input: child.stderr });
    rlErr.on('line', line => {
      console.error(`${prefix}${line}`);
    });
  }

  child.on('close', code => {
    if (!isShuttingDown) {
      console.warn(`${prefix}${C.yellow}Process exited with code ${code}.${C.reset}`);
    }
  });

  child.on('error', err => {
    console.error(`${prefix}${C.red}Failed to start: ${err.message}${C.reset}`);
  });
}
