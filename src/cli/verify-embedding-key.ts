#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { EmbeddingGenerator } from '../embedding/embedding-generator';

/**
 * Loads .env file from workspace root or parent directories.
 */
function loadEnvFile(workspaceRoot: string): void {
    // Try to find .env file in workspace root or parent directories
    let currentPath = workspaceRoot;
    const maxDepth = 5; // Prevent infinite loops

    for (let depth = 0; depth < maxDepth; depth++) {
        const envPath = path.join(currentPath, '.env');
        if (fs.existsSync(envPath)) {
            config({ path: envPath });
            console.log(`[Verify Voyage Key] Loaded .env file from: ${envPath}`);
            return;
        }

        // Try parent directory
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break; // Reached filesystem root
        }
        currentPath = parentPath;
    }

    console.warn('[Verify Voyage Key] No .env file found. Using environment variables only.');
}

/**
 * CLI tool to verify Voyage AI API key configuration for embedding generation.
 * Usage: node verify-embedding-key.js <workspace-root>
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: verify-embedding-key <workspace-root>');
        process.exit(1);
    }

    const workspaceRoot = path.resolve(args[0]);

    console.log('=== Voyage AI API Key Verification ===');
    console.log(`Workspace root: ${workspaceRoot}`);
    console.log('');

    // Load .env file
    loadEnvFile(workspaceRoot);

    // Check if API key is set
    const apiKey = process.env.VOYAGE_API_KEY;

    if (!apiKey) {
        console.error('❌ ERROR: VOYAGE_API_KEY not found in .env file or environment variables');
        console.log('');
        console.log('💡 Next steps:');
        console.log('   1. Create a .env file in the workspace root');
        console.log('   2. Add: VOYAGE_API_KEY=your-api-key-here');
        console.log('   3. Run this script again');
        process.exit(1);
    }

    console.log(`✓ Voyage API key found (length: ${apiKey.length} characters)`);
    console.log('');

    // Verify EmbeddingGenerator can be initialized
    try {
        const generator = new EmbeddingGenerator();
        const isConfigured = generator.isConfigured();

        if (!isConfigured) {
            console.error('❌ ERROR: EmbeddingGenerator reports API key not configured');
            process.exit(1);
        }

        console.log('✓ EmbeddingGenerator initialized successfully');
        console.log('');

        // Try to generate a test embedding
        console.log('Testing embedding generation with a simple query...');
        const expectedDimensions = generator.getDimensions();
        try {
            const testEmbedding = await generator.generateEmbedding(
                'X',
                'test',
                'This is a test query for verification.'
            );

            if (testEmbedding && testEmbedding.length === expectedDimensions) {
                console.log(`✓ Test embedding generated successfully (dimensions: ${testEmbedding.length})`);
                console.log('');
                console.log('=== Verification Summary ===');
                console.log('✅ Voyage API key: CONFIGURED');
                console.log('✅ EmbeddingGenerator: WORKING');
                console.log('✅ Embedding generation: WORKING');
                console.log('');
                console.log('The system is ready for V-Dimension operations!');
            } else {
                console.error(`❌ ERROR: Invalid embedding dimensions (expected ${expectedDimensions}, got ${testEmbedding?.length || 0})`);
                process.exit(1);
            }
        } catch (embeddingError) {
            console.error(`❌ ERROR: Failed to generate test embedding: ${embeddingError}`);
            console.log('');
            console.log('💡 This might indicate:');
            console.log('   - Invalid API key');
            console.log('   - Network connectivity issues');
            console.log('   - Voyage AI API service problems');
            process.exit(1);
        }
    } catch (error) {
        console.error(`❌ ERROR: Failed to initialize EmbeddingGenerator: ${error}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
