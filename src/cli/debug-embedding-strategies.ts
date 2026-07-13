#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleApi } from '../api/module-api';
import { EmbeddingPipeline } from '../embedding/embedding-pipeline';
import { EmbeddingGenerator } from '../embedding/embedding-generator';
import { ModuleSummarizer } from '../embedding/module-summarizer';
import { DocsPathResolver } from '../core/docs-path-resolver';

/**
 * Loads .env file from workspace root or parent directories.
 */
function loadEnvFile(workspaceRoot: string): void {
    let currentPath = workspaceRoot;
    const maxDepth = 5;
    
    for (let depth = 0; depth < maxDepth; depth++) {
        const envPath = path.join(currentPath, '.env');
        if (fs.existsSync(envPath)) {
            config({ path: envPath });
            return;
        }
        
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
}

/**
 * Validates that docs/ directory exists.
 */
function validateDocsDirectory(workspaceRoot: string): boolean {
    const docsPath = DocsPathResolver.findDocsDirectoryFromPath(workspaceRoot);
    if (!docsPath) {
        console.error('ERROR: docs/ directory not found in workspace or parent directories.');
        console.error('Please run Documentation System Plugin (Noyrax) first to generate docs/ directory.');
        return false;
    }
    return true;
}

/**
 * Estimates token count from content length.
 * Rough estimate: 1 token ≈ 4 characters (konservativ)
 */
function estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
}

/**
 * Tests optimize strategy (simulates what optimizeModuleContentForEmbedding does).
 */
function testOptimizeStrategy(content: string, maxTokens: number): { optimized: string; tokens: number; reduction: number } {
    // Simplified version - just truncate for testing
    const maxChars = maxTokens * 4;
    const optimized = content.length > maxChars ? content.substring(0, maxChars) + '\n\n[... optimized ...]' : content;
    const tokens = estimateTokens(optimized);
    const reduction = estimateTokens(content) - tokens;
    return { optimized, tokens, reduction };
}

/**
 * Tests hierarchical strategy (simulates what extractModuleStructure does).
 */
function testHierarchicalStrategy(content: string): { structure: string; tokens: number; reduction: number } {
    const lines = content.split('\n');
    const structure: string[] = [];
    
    for (const line of lines) {
        // Keep headers
        if (line.startsWith('#') || line.startsWith('##') || line.startsWith('###')) {
            structure.push(line);
            continue;
        }
        
        // Skip tables
        if (line.startsWith('|')) {
            continue;
        }
        
        // Keep code blocks (first line only)
        if (line.startsWith('```')) {
            structure.push(line);
            continue;
        }
        
        // Keep important comments
        if (line.trim().startsWith('<!--') && line.includes('change:')) {
            structure.push(line);
            continue;
        }
        
        // Keep empty lines
        if (line.trim() === '') {
            structure.push(line);
            continue;
        }
    }
    
    const structureContent = structure.join('\n');
    const tokens = estimateTokens(structureContent);
    const reduction = estimateTokens(content) - tokens;
    return { structure: structureContent, tokens, reduction };
}

/**
 * CLI tool for debugging embedding strategies.
 * Tests all three strategies and shows results.
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Auto-detect workspace root if not provided
    let workspaceRoot: string;
    
    if (args.length === 0) {
        workspaceRoot = process.cwd();
    } else {
        workspaceRoot = path.resolve(args[0]);
    }
    
    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        console.error(`ERROR: Workspace root does not exist: ${workspaceRoot}`);
        console.error('');
        console.error('Usage: debug-embedding-strategies [<workspace-root>]');
        console.error('If <workspace-root> is omitted, current working directory is used.');
        process.exit(1);
    }
    
    // Load .env file
    loadEnvFile(workspaceRoot);
    
    // Validate docs/ directory
    if (!validateDocsDirectory(workspaceRoot)) {
        process.exit(1);
    }
    
    try {
        console.log(`[Debug Embedding Strategies] Analyzing workspace: ${workspaceRoot}`);
        console.log('');
        
        const dbManager = new MultiDbManager(workspaceRoot);
        const pluginId = dbManager.getPluginId();
        const moduleApi = new ModuleApi(dbManager);
        
        // Get all modules
        const modules = await moduleApi.getAllModules(pluginId);
        console.log(`[Debug Embedding Strategies] Found ${modules.length} modules`);
        console.log('');
        
        const maxTokens = 8000; // Same as in embedding-pipeline.ts
        const largeModules: Array<{
            filePath: string;
            originalTokens: number;
            optimizeTokens: number;
            optimizeReduction: number;
            hierarchicalTokens: number;
            hierarchicalReduction: number;
            summarizeAvailable: boolean;
        }> = [];
        
        // Analyze each module
        for (const module of modules) {
            const content = module.content_markdown;
            const originalTokens = estimateTokens(content);
            
            if (originalTokens > maxTokens) {
                // Test optimize strategy
                const optimizeResult = testOptimizeStrategy(content, maxTokens);
                
                // Test hierarchical strategy
                const hierarchicalResult = testHierarchicalStrategy(content);
                
                // Check if summarize is available
                const summarizer = new ModuleSummarizer();
                const summarizeAvailable = summarizer.isConfigured();
                
                largeModules.push({
                    filePath: module.file_path,
                    originalTokens,
                    optimizeTokens: optimizeResult.tokens,
                    optimizeReduction: optimizeResult.reduction,
                    hierarchicalTokens: hierarchicalResult.tokens,
                    hierarchicalReduction: hierarchicalResult.reduction,
                    summarizeAvailable
                });
            }
        }
        
        // Print results
        console.log('=== Token-Limit Analysis ===');
        console.log('');
        
        if (largeModules.length === 0) {
            console.log('✅ No modules exceed token limit (8000 tokens)');
            console.log(`   All ${modules.length} modules are within limits`);
        } else {
            console.log(`⚠️  Found ${largeModules.length} modules exceeding token limit:`);
            console.log('');
            
            // Sort by original tokens (largest first)
            largeModules.sort((a, b) => b.originalTokens - a.originalTokens);
            
            for (const module of largeModules) {
                console.log(`📄 ${module.filePath}`);
                console.log(`   Original: ~${module.originalTokens} tokens`);
                console.log(`   Optimize: ~${module.optimizeTokens} tokens (reduction: ${module.optimizeReduction} tokens, ${Math.round(module.optimizeReduction / module.originalTokens * 100)}%)`);
                console.log(`   Hierarchical: ~${module.hierarchicalTokens} tokens (reduction: ${module.hierarchicalReduction} tokens, ${Math.round(module.hierarchicalReduction / module.originalTokens * 100)}%)`);
                console.log(`   Summarize: ${module.summarizeAvailable ? '✅ Available' : '❌ Not available (OPENAI_API_KEY required)'}`);
                console.log('');
            }
            
            // Summary
            console.log('=== Strategy Recommendations ===');
            console.log('');
            console.log('Current EMBEDDING_STRATEGY:', process.env.EMBEDDING_STRATEGY || 'optimize (default)');
            console.log('');
            
            const avgOptimizeReduction = largeModules.reduce((sum, m) => sum + m.optimizeReduction, 0) / largeModules.length;
            const avgHierarchicalReduction = largeModules.reduce((sum, m) => sum + m.hierarchicalReduction, 0) / largeModules.length;
            
            console.log(`Average token reduction:`);
            console.log(`  Optimize: ${Math.round(avgOptimizeReduction)} tokens (${Math.round(avgOptimizeReduction / largeModules[0].originalTokens * 100)}% of largest module)`);
            console.log(`  Hierarchical: ${Math.round(avgHierarchicalReduction)} tokens (${Math.round(avgHierarchicalReduction / largeModules[0].originalTokens * 100)}% of largest module)`);
            console.log('');
            
            if (largeModules.some(m => m.summarizeAvailable)) {
                console.log('💡 Tip: Set EMBEDDING_STRATEGY=summarize in .env for LLM-based summarization');
            } else {
                console.log('💡 Tip: Set OPENAI_API_KEY in .env to enable summarize strategy');
            }
            console.log('💡 Tip: Set EMBEDDING_STRATEGY=hierarchical in .env for hierarchical embeddings');
            console.log('💡 Tip: Default (optimize) is recommended for most cases');
        }
        
        console.log('');
        console.log('=== Test Complete ===');
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            console.error(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Fatal error: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            console.error(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    });
}

