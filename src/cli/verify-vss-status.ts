#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { VssLoader } from '../core/vss-loader';

/**
 * CLI tool to verify VSS Extension status and diagnose issues.
 * Usage: node verify-vss-status.js
 */
async function main(): Promise<void> {
    console.log('=== VSS Extension Status Check ===');
    console.log('');

    // 1. Check if sqlite-vss package is installed
    console.log('1. Checking sqlite-vss package...');
    const sqliteVssPath = path.join(__dirname, '..', '..', 'node_modules', 'sqlite-vss');
    const packageExists = fs.existsSync(sqliteVssPath);
    
    if (packageExists) {
        console.log('   ✓ sqlite-vss package found');
        const packageJsonPath = path.join(sqliteVssPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            console.log(`   Version: ${packageJson.version || 'unknown'}`);
        }
    } else {
        console.log('   ✗ sqlite-vss package not found');
        console.log('   → Run: npm install sqlite-vss');
        process.exit(1);
    }
    console.log('');

    // 2. Try to require sqlite-vss
    console.log('2. Loading sqlite-vss module...');
    let sqliteVss: any = null;
    try {
        sqliteVss = require('sqlite-vss');
        console.log('   ✓ sqlite-vss module loaded');
        console.log('   Available keys:', Object.keys(sqliteVss).join(', '));
    } catch (error: any) {
        console.log(`   ✗ Failed to load sqlite-vss: ${error.message}`);
        process.exit(1);
    }
    console.log('');

    // 3. Check for getVssLoadablePath method
    console.log('3. Checking getVssLoadablePath() method...');
    if (typeof sqliteVss.getVssLoadablePath === 'function') {
        console.log('   ✓ getVssLoadablePath() method exists');
        try {
            const vssPath = sqliteVss.getVssLoadablePath();
            console.log(`   Path returned: ${vssPath}`);
            if (fs.existsSync(vssPath)) {
                console.log('   ✓ Path exists');
                const stats = fs.statSync(vssPath);
                console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
            } else {
                console.log('   ✗ Path does not exist');
            }
        } catch (error: any) {
            console.log(`   ✗ Error calling getVssLoadablePath(): ${error.message}`);
            if (error.message.includes('unsupported')) {
                console.log('   → Your platform (Windows) is not supported by sqlite-vss');
                console.log('   → Supported platforms: darwin-x64, darwin-arm64, linux-x64');
            }
        }
    } else {
        console.log('   ✗ getVssLoadablePath() method not available');
        console.log('   → sqlite-vss package may need to be rebuilt or is not compatible');
    }
    console.log('');

    // 4. Check VssLoader
    console.log('4. Testing VssLoader...');
    const vssLoader = new VssLoader();
    const isAvailable = vssLoader.isAvailable();
    
    if (isAvailable) {
        console.log('   ✓ VSS Extension is available');
    } else {
        console.log('   ✗ VSS Extension is not available');
        console.log('   → System will use fallback cosine similarity');
    }
    console.log('');

    // 5. Manual path check
    console.log('5. Manual path check...');
    const platform = process.platform;
    const arch = process.arch;
    console.log(`   Platform: ${platform}`);
    console.log(`   Architecture: ${arch}`);
    
    const possiblePaths = [
        path.join(sqliteVssPath, 'lib', `vss0.${platform}.${arch}.node`),
        path.join(sqliteVssPath, `vss0.${platform}.${arch}.node`),
        path.join(sqliteVssPath, 'lib', platform === 'win32' ? 'vss0.dll' : 'vss0.so'),
        path.join(sqliteVssPath, platform === 'win32' ? 'vss0.dll' : 'vss0.so')
    ];

    let foundPath: string | null = null;
    for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
            foundPath = possiblePath;
            console.log(`   ✓ Found: ${possiblePath}`);
            const stats = fs.statSync(possiblePath);
            console.log(`     Size: ${(stats.size / 1024).toFixed(2)} KB`);
            break;
        } else {
            console.log(`   ✗ Not found: ${possiblePath}`);
        }
    }

    if (!foundPath) {
        console.log('   → No VSS binary found in expected locations');
    }
    console.log('');

    // 6. Summary
    console.log('=== Summary ===');
    if (isAvailable) {
        console.log('✅ VSS Extension: AVAILABLE');
        console.log('   Semantic search will use optimized VSS queries');
    } else {
        console.log('⚠️  VSS Extension: NOT AVAILABLE');
        console.log('   Semantic search will use fallback cosine similarity');
        console.log('');
        console.log('💡 Reason:');
        if (platform === 'win32') {
            console.log('   - Windows is not supported by sqlite-vss');
            console.log('   - Supported platforms: macOS (darwin-x64/arm64), Linux (linux-x64)');
        } else {
            console.log('   - Platform may not be supported or binaries not installed');
        }
        console.log('');
        console.log('💡 Next steps:');
        if (platform === 'win32') {
            console.log('   1. Use WSL (Windows Subsystem for Linux) for VSS support');
            console.log('   2. Use fallback cosine similarity (works but slower)');
            console.log('   3. Wait for Windows support in sqlite-vss: https://github.com/asg017/sqlite-vss');
        } else {
            console.log('   1. Check if sqlite-vss needs to be rebuilt: npm rebuild sqlite-vss');
            console.log('   2. Check platform compatibility: https://github.com/asg017/sqlite-vss');
            console.log('   3. Fallback cosine similarity works, but is slower for large datasets');
        }
    }
    console.log('');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

