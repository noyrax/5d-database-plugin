import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

/**
 * Status information about the docs/ directory.
 */
export interface DocsStatus {
    exists: boolean;
    isUpToDate: boolean;
    hasModules: boolean;
    hasSymbols: boolean;
    hasDependencies: boolean;
    hasAdrs: boolean;
    hasChanges: boolean;
    lastModified?: Date;
}

/**
 * Service for integrating with Noyrax Documentation System Plugin.
 * Provides functionality to generate documentation and check docs status.
 */
export class NoyraxIntegrationService {
    constructor(private workspaceRoot: string) {}

    /**
     * Gets the path to the documentation-system-plugin directory.
     */
    private getNoyraxPath(): string {
        return path.join(this.workspaceRoot, 'documentation-system-plugin');
    }

    /**
     * Gets the path to the docs directory.
     */
    private getDocsPath(): string {
        return path.join(this.workspaceRoot, 'docs');
    }

    /**
     * Checks if the documentation-system-plugin exists.
     */
    private async checkNoyraxExists(): Promise<boolean> {
        const noyraxPath = this.getNoyraxPath();
        try {
            const stats = await fs.promises.stat(noyraxPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Runs a Noyrax CLI tool.
     */
    private async runNoyraxCli(tool: 'scan' | 'validate' | 'generate', workspaceRoot?: string): Promise<void> {
        const noyraxPath = this.getNoyraxPath();
        const targetWorkspace = workspaceRoot || this.workspaceRoot;

        // Check if Noyrax exists
        if (!(await this.checkNoyraxExists())) {
            throw new Error(
                `Documentation System Plugin not found at ${noyraxPath}. ` +
                `Please ensure documentation-system-plugin is installed in the workspace.`
            );
        }

        // Check if CLI tool exists
        const cliPath = path.join(noyraxPath, 'out', 'cli', `${tool}-cli.js`);
        try {
            await fs.promises.access(cliPath);
        } catch {
            throw new Error(
                `Noyrax CLI tool not found at ${cliPath}. ` +
                `Please compile the Documentation System Plugin first: cd documentation-system-plugin && npm run compile`
            );
        }

        // Run the CLI tool
        try {
            const { stdout, stderr } = await execAsync(`node "${cliPath}" "${targetWorkspace}"`, {
                cwd: noyraxPath,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });

            if (stderr && !stderr.includes('WARN')) {
                // Log warnings but don't fail
                console.warn(`[Noyrax ${tool}] Warnings:`, stderr);
            }
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            throw new Error(
                `Failed to run Noyrax ${tool}: ${errorMessage}`
            );
        }
    }

    /**
     * Generates documentation using Noyrax.
     * Runs scan, validate, and generate in sequence.
     */
    async generateDocumentation(workspaceRoot?: string): Promise<void> {
        const targetWorkspace = workspaceRoot || this.workspaceRoot;

        console.log('[NoyraxIntegration] Starting documentation generation...');
        
        try {
            // Step 1: Scan
            console.log('[NoyraxIntegration] Running scan...');
            await this.runNoyraxCli('scan', targetWorkspace);

            // Step 2: Validate
            console.log('[NoyraxIntegration] Running validate...');
            await this.runNoyraxCli('validate', targetWorkspace);

            // Step 3: Generate
            console.log('[NoyraxIntegration] Running generate...');
            await this.runNoyraxCli('generate', targetWorkspace);

            console.log('[NoyraxIntegration] Documentation generation completed successfully.');
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            throw new Error(
                `Documentation generation failed: ${errorMessage}`
            );
        }
    }

    /**
     * Checks the status of the docs/ directory.
     */
    async checkDocsStatus(): Promise<DocsStatus> {
        const docsPath = this.getDocsPath();

        const status: DocsStatus = {
            exists: false,
            isUpToDate: false,
            hasModules: false,
            hasSymbols: false,
            hasDependencies: false,
            hasAdrs: false,
            hasChanges: false
        };

        try {
            const stats = await fs.promises.stat(docsPath);
            status.exists = stats.isDirectory();
            status.lastModified = stats.mtime;

            if (status.exists) {
                // Check for required subdirectories and files
                const modulesPath = path.join(docsPath, 'modules');
                const symbolsPath = path.join(docsPath, 'index', 'symbols.jsonl');
                const dependenciesPath = path.join(docsPath, 'system', 'DEPENDENCY_GRAPH.md');
                const adrsPath = path.join(docsPath, 'adr');
                const changesPath = path.join(docsPath, 'system', 'CHANGE_REPORT.md');

                try {
                    const modulesStats = await fs.promises.stat(modulesPath);
                    status.hasModules = modulesStats.isDirectory();
                } catch {
                    status.hasModules = false;
                }

                try {
                    await fs.promises.access(symbolsPath);
                    status.hasSymbols = true;
                } catch {
                    status.hasSymbols = false;
                }

                try {
                    await fs.promises.access(dependenciesPath);
                    status.hasDependencies = true;
                } catch {
                    status.hasDependencies = false;
                }

                try {
                    const adrsStats = await fs.promises.stat(adrsPath);
                    status.hasAdrs = adrsStats.isDirectory();
                } catch {
                    status.hasAdrs = false;
                }

                try {
                    await fs.promises.access(changesPath);
                    status.hasChanges = true;
                } catch {
                    status.hasChanges = false;
                }

                // Consider docs up-to-date if all required components exist
                status.isUpToDate = status.hasModules && status.hasSymbols && 
                                   status.hasDependencies && status.hasAdrs && status.hasChanges;
            }
        } catch {
            // docs/ doesn't exist
            status.exists = false;
        }

        return status;
    }

    /**
     * Checks if documentation needs to be regenerated.
     */
    async needsRegeneration(): Promise<boolean> {
        const status = await this.checkDocsStatus();
        return !status.exists || !status.isUpToDate;
    }
}

