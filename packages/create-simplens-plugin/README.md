# @simplens/create-simplens-plugin

CLI tool to scaffold new SimpleNS notification plugins. Generates all required boilerplate so you can focus on writing the notification delivery logic.

## Installation

```bash
# Via npx (recommended)
npx @simplens/create-simplens-plugin

# Global installation
npm install -g @simplens/create-simplens-plugin
create-simplens-plugin
```

## Usage

### Interactive Mode

Simply run the CLI and answer the prompts:

```bash
npx @simplens/create-simplens-plugin
```

You'll be asked for:
- **Plugin name** - kebab-case identifier (e.g., `discord`, `telegram`, `twilio-sms`)
- **Display name** - Human readable name
- **Description** - What your plugin does
- **Channel** - Channel identifier for routing
- **Author** - Your name and email
- **Git/npm options** - Whether to initialize git and install dependencies

### Non-Interactive Mode

Use CLI flags for automation:

```bash
npx @simplens/create-simplens-plugin --name discord --channel discord --yes
```

### Command Line Options

```
Usage: create-simplens-plugin [options]

Options:
  -n, --name <name>       Plugin name (e.g., discord, telegram)
  -c, --channel <channel> Channel identifier
  -d, --directory <dir>   Output directory (default: plugin-<name>)
  -y, --yes               Use defaults, skip prompts
  --no-git                Skip git initialization
  --no-install            Skip npm install
  -h, --help              Show help
  -V, --version           Show version
```

## Generated Files

```
plugin-<name>/
├── package.json          # NPM package configuration
├── tsconfig.json         # TypeScript configuration
├── src/
│   ├── index.ts          # Provider class (implement send() here)
│   └── index.test.ts     # Test suite
├── README.md             # Plugin documentation
└── .gitignore            # Git ignore rules
```

## What to Implement

After scaffolding, you need to:

1. **Define schemas** in `src/index.ts`:
   - `recipientSchema` - Who receives notifications
   - `contentSchema` - What the notification contains

2. **Implement `send()` method**:
   - Add your API client initialization
   - Implement the delivery logic
   - Handle errors appropriately

3. **Add tests** in `src/index.test.ts`

4. **Update README.md** with your plugin's documentation

## Example

```bash
$ npx @simplens/create-simplens-plugin

🔌 Create SimpleNS Plugin

? Plugin name: discord
? Display name: Discord  
? Description: Send notifications via Discord webhooks
? Channel identifier: discord
? Author name: John Doe
? Author email: john@example.com
? Select required credentials: webhook_url
? Select recipient fields: channelId
? Select content fields: message, title
? Output directory: plugin-discord
? Initialize git repository? Yes
? Install dependencies after generation? Yes

✅ Plugin created successfully!

📁 Created plugin-discord/
   ├── package.json
   ├── tsconfig.json
   ├── src/
   │   ├── index.ts         ← Implement your send() logic here
   │   └── index.test.ts
   ├── README.md
   └── .gitignore

🚀 Next steps:
   1. cd plugin-discord
   2. Edit src/index.ts        # Add your delivery logic
   3. npm test                 # Run tests
   4. npm run build            # Build for publishing
   5. npm publish --access public # Publish to npm
```

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Run Locally

```bash
npm run dev
```

## License

MIT
