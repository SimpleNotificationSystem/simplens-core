import { mkdir, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import Handlebars from 'handlebars';
import { spinner } from './ui.js';
import { logSuccess, logWarning, logInfo, logError, printCommandHints } from './utils.js';
import { pascalCase, camelCase, snakeCase, screamingSnakeCase } from './utils/case.js';
import { initGitRepository, isGitAvailable, isGitRepository } from './utils/git.js';
import type { PluginConfig, TemplateFile } from './types.js';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Register custom Handlebars helpers
 */
function registerHelpers(): void {
    Handlebars.registerHelper('pascalCase', (str: string) => pascalCase(str));
    Handlebars.registerHelper('camelCase', (str: string) => camelCase(str));
    Handlebars.registerHelper('snakeCase', (str: string) => snakeCase(str));
    Handlebars.registerHelper('screamingSnakeCase', (str: string) => screamingSnakeCase(str));
}

/**
 * List of template files to generate
 */
const TEMPLATE_FILES: TemplateFile[] = [
    { template: 'package.json.hbs', output: 'package.json' },
    { template: 'tsconfig.json.hbs', output: 'tsconfig.json' },
    { template: 'index.ts.hbs', output: 'src/index.ts' },
    { template: 'index.test.ts.hbs', output: 'src/index.test.ts' },
    { template: 'gitignore.hbs', output: '.gitignore' },
    { template: 'README.md.hbs', output: 'README.md' },
];

/**
 * Load and compile a Handlebars template
 * @param templateName - Name of the template file
 * @returns Compiled Handlebars template
 */
async function loadTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    const templatePath = join(__dirname, 'templates', templateName);
    const templateContent = await readFile(templatePath, 'utf-8');
    return Handlebars.compile(templateContent);
}

/**
 * Render a template with the given configuration
 * @param templateName - Name of the template file
 * @param config - Plugin configuration
 * @returns Rendered template content
 */
async function renderTemplate(templateName: string, config: PluginConfig): Promise<string> {
    const template = await loadTemplate(templateName);
    return template(config);
}

/**
 * Generate all plugin files
 * @param config - Plugin configuration
 */
export async function generatePlugin(config: PluginConfig): Promise<void> {
    registerHelpers();

    const outputDir = config.directory;

    const s = spinner();

    try {
        // Create directory structure
        s.start('Creating plugin files...');
        await mkdir(join(outputDir, 'src'), { recursive: true });

        // Generate files from templates
        for (const file of TEMPLATE_FILES) {
            const content = await renderTemplate(file.template, config);
            const outputPath = join(outputDir, file.output);

            // Ensure directory exists for nested files
            await mkdir(dirname(outputPath), { recursive: true });

            await writeFile(outputPath, content, 'utf-8');
        }

        s.stop('Plugin files created');

        // Git initialization
        if (config.initGit) {
            if (!isGitAvailable()) {
                logWarning('Git not found, skipping repository initialization');
            } else if (await isGitRepository(outputDir)) {
                logInfo('Git repository already exists');
            } else {
                s.start('Initializing git repository...');
                initGitRepository(outputDir);
                s.stop('Git repository initialized');
            }
        }

        // Install dependencies
        if (config.installDeps) {
            s.start('Installing dependencies...');

            try {
                execSync('npm install', {
                    cwd: outputDir,
                    stdio: 'pipe',
                });
                s.stop('Dependencies installed');
            } catch (error) {
                s.stop('Failed to install dependencies');
                logWarning('Run `npm install` manually in the plugin directory');
            }
        }

        // Print success message and next steps
        printSuccessMessage(config);

    } catch (error) {
        s.stop('Failed to create plugin');
        throw error;
    }
}

/**
 * Print success message with next steps
 * @param config - Plugin configuration
 */
function printSuccessMessage(config: PluginConfig): void {
    console.log('');
    logSuccess('Plugin created successfully!');
    
    console.log('');
    logInfo(`📁 Created ${config.directory}/`);
    console.log('   ├── package.json');
    console.log('   ├── tsconfig.json');
    console.log('   ├── src/');
    console.log('   │   ├── index.ts         ← Implement your send() logic here');
    console.log('   │   └── index.test.ts');
    console.log('   ├── README.md');
    console.log('   └── .gitignore');
    console.log('');

    const commands = config.installDeps
        ? [
              `cd ${config.directory}`,
              'Edit src/index.ts         # Add your delivery logic',
              'npm test                  # Run tests',
              'npm run build             # Build for publishing',
              'npm publish --access public # Publish to npm',
          ]
        : [
              `cd ${config.directory}`,
              'npm install               # Install dependencies',
              'Edit src/index.ts         # Add your delivery logic',
              'npm test                  # Run tests',
              'npm run build             # Build for publishing',
              'npm publish --access public # Publish to npm',
          ];

    printCommandHints('🚀 Next steps:', commands);
}
