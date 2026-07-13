import * as os from 'os';
import { MultiDbManager } from '../core/multi-db-manager';
import { VectorDatabase } from '../core/vector-database-interface';
import { ChromaDbVectorDatabase } from '../core/chromadb-vector-database';
import { VssVectorDatabase } from '../core/vss-vector-database';
import { ReasonCode, getReasonCodeDescription } from '../models/reason-codes';
import { ActionHint, createActionHint } from '../models/action-hint';

/**
 * Vector backend status information.
 */
export interface VectorBackendStatus {
    /** Type of backend (chromadb, vss, or fallback) */
    backend: 'chromadb' | 'vss' | 'fallback' | 'none';
    
    /** Mode (expected backend for this platform) */
    mode: 'chromadb' | 'vss' | 'fallback';
    
    /** Whether the expected backend is available */
    expected_available: boolean;
    
    /** Whether the backend is reachable */
    reachable: boolean;
    
    /** Whether fallback is active */
    fallback: boolean;
    
    /** Reason code for the current status */
    reason_code: ReasonCode;
    
    /** Human-readable description */
    description: string;
    
    /** Action hints for resolving issues (if any) */
    action_hints?: ActionHint[];
    
    /** Platform information */
    platform: string;
}

/**
 * Vector backend healthcheck result.
 */
export interface VectorBackendHealthcheck {
    /** Whether the healthcheck passed */
    healthy: boolean;
    
    /** Reason code */
    reason_code: ReasonCode;
    
    /** Latency in milliseconds (if measurable) */
    latency_ms?: number;
    
    /** Error code (if any) */
    error_code?: string;
    
    /** Human-readable description */
    description: string;
    
    /** Action hints for resolving issues (if any) */
    action_hints?: ActionHint[];
}

/**
 * API for checking vector backend status and health.
 */
export class VectorBackendStatusApi {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Gets the current vector backend status.
     * 
     * @returns Promise that resolves to vector backend status
     */
    async getVectorBackendStatus(): Promise<VectorBackendStatus> {
        const platform = os.platform();
        const arch = os.arch();
        
        // Determine expected mode based on platform
        let expectedMode: 'chromadb' | 'vss' | 'fallback' = 'fallback';
        if (platform === 'win32') {
            expectedMode = 'chromadb';
        } else if (platform === 'darwin' || platform === 'linux') {
            expectedMode = 'vss';
        }

        // Get vector database instance
        const vectorDb = this.dbManager.getVectorDatabase();
        
        if (!vectorDb) {
            // Vector database not initialized
            return {
                backend: 'none',
                mode: expectedMode,
                expected_available: false,
                reachable: false,
                fallback: true,
                reason_code: ReasonCode.NOT_INSTALLED,
                description: 'Vector database not initialized. V-dimension database may not be opened yet.',
                platform: `${platform}/${arch}`,
                action_hints: this.getActionHintsForReason(ReasonCode.NOT_INSTALLED, expectedMode, platform)
            };
        }

        const isAvailable = vectorDb.isAvailable();
        const isChromaDb = vectorDb instanceof ChromaDbVectorDatabase;
        const isVss = vectorDb instanceof VssVectorDatabase;

        // Determine actual backend
        let actualBackend: 'chromadb' | 'vss' | 'fallback' | 'none' = 'none';
        if (isChromaDb) {
            actualBackend = 'chromadb';
        } else if (isVss) {
            actualBackend = 'vss';
        } else {
            actualBackend = 'fallback';
        }

        // Determine if fallback is active
        const isFallback = (expectedMode === 'chromadb' && actualBackend !== 'chromadb') ||
                          (expectedMode === 'vss' && actualBackend !== 'vss');

        // Determine reason code
        let reasonCode = ReasonCode.OK;
        let description = 'Vector backend is available and reachable.';
        
        if (!isAvailable) {
            if (expectedMode === 'chromadb' && actualBackend === 'chromadb') {
                reasonCode = ReasonCode.VECTOR_BACKEND_UNREACHABLE;
                description = 'ChromaDB backend is not reachable. Check if ChromaDB server is running on localhost:8000.';
            } else if (expectedMode === 'vss' && actualBackend === 'vss') {
                reasonCode = ReasonCode.DEPENDENCY_MISSING;
                description = 'VSS extension is not available. SQLite VSS extension may not be installed.';
            } else if (isFallback) {
                reasonCode = ReasonCode.VECTOR_BACKEND_UNREACHABLE;
                description = 'Expected vector backend is not available, using fallback.';
            } else {
                reasonCode = ReasonCode.NOT_INSTALLED;
                description = 'Vector backend is not available.';
            }
        }

        const status: VectorBackendStatus = {
            backend: actualBackend,
            mode: expectedMode,
            expected_available: isAvailable && !isFallback,
            reachable: isAvailable,
            fallback: isFallback,
            reason_code: reasonCode,
            description,
            platform: `${platform}/${arch}`
        };

        // Add action hints if there are issues
        if (reasonCode !== ReasonCode.OK) {
            status.action_hints = this.getActionHintsForReason(reasonCode, expectedMode, platform);
        }

        return status;
    }

    /**
     * Performs a healthcheck on the vector backend.
     * Attempts to perform a simple query to verify the backend is responsive.
     * 
     * @returns Promise that resolves to healthcheck result
     */
    async healthcheckVectorBackend(): Promise<VectorBackendHealthcheck> {
        const startTime = Date.now();
        
        const vectorDb = this.dbManager.getVectorDatabase();
        
        if (!vectorDb) {
            return {
                healthy: false,
                reason_code: ReasonCode.NOT_INSTALLED,
                description: 'Vector database not initialized.',
                action_hints: this.getActionHintsForReason(ReasonCode.NOT_INSTALLED, 'fallback', os.platform())
            };
        }

        if (!vectorDb.isAvailable()) {
            const platform = os.platform();
            const expectedMode = platform === 'win32' ? 'chromadb' : (platform === 'darwin' || platform === 'linux' ? 'vss' : 'fallback');
            return {
                healthy: false,
                reason_code: ReasonCode.VECTOR_BACKEND_UNREACHABLE,
                description: 'Vector backend is not available.',
                action_hints: this.getActionHintsForReason(ReasonCode.VECTOR_BACKEND_UNREACHABLE, expectedMode, platform)
            };
        }

        // Try to perform a simple search query to verify backend is responsive
        try {
            // Use a zero vector for testing (will return empty results, but tests connectivity)
            const testVector = new Array(1024).fill(0);
            await vectorDb.search(testVector, 1);
            
            const latencyMs = Date.now() - startTime;
            
            return {
                healthy: true,
                reason_code: ReasonCode.OK,
                latency_ms: latencyMs,
                description: 'Vector backend is healthy and responsive.'
            };
        } catch (error: any) {
            const latencyMs = Date.now() - startTime;
            const errorMsg = error?.message || String(error);
            const platform = os.platform();
            const expectedMode = platform === 'win32' ? 'chromadb' : (platform === 'darwin' || platform === 'linux' ? 'vss' : 'fallback');
            
            // Determine error code
            let errorCode = 'UNKNOWN_ERROR';
            let reasonCode = ReasonCode.VECTOR_BACKEND_UNREACHABLE;
            
            if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('connect')) {
                errorCode = 'CONNECTION_REFUSED';
                reasonCode = ReasonCode.VECTOR_BACKEND_UNREACHABLE;
            } else if (errorMsg.includes('timeout')) {
                errorCode = 'TIMEOUT';
                reasonCode = ReasonCode.TIMEOUT;
            } else if (errorMsg.includes('ENOTFOUND')) {
                errorCode = 'DNS_ERROR';
                reasonCode = ReasonCode.WRONG_PATH;
            }

            return {
                healthy: false,
                reason_code: reasonCode,
                latency_ms: latencyMs,
                error_code: errorCode,
                description: `Healthcheck failed: ${errorMsg}`,
                action_hints: this.getActionHintsForReason(reasonCode, expectedMode, platform)
            };
        }
    }

    /**
     * Gets action hints for a specific reason code.
     */
    private getActionHintsForReason(
        reasonCode: ReasonCode,
        expectedMode: 'chromadb' | 'vss' | 'fallback',
        platform: string
    ): ActionHint[] {
        const hints: ActionHint[] = [];

        if (reasonCode === ReasonCode.VECTOR_BACKEND_UNREACHABLE && expectedMode === 'chromadb') {
            // ChromaDB is not reachable
            if (platform === 'win32') {
                hints.push(createActionHint(
                    'windows',
                    'chroma run --host localhost --port 8000',
                    ['ChromaDB must be installed (pip install chromadb)', 'Python must be in PATH'],
                    ['Open browser to http://localhost:8000/api/v1/heartbeat', 'Check if process is running: Get-Process | Where-Object {$_.ProcessName -like "*chroma*"}'],
                    'Start ChromaDB server on localhost:8000'
                ));
            } else if (platform === 'linux') {
                hints.push(createActionHint(
                    'linux',
                    'chroma run --host localhost --port 8000',
                    ['ChromaDB must be installed (pip install chromadb)', 'Python must be in PATH'],
                    ['curl http://localhost:8000/api/v1/heartbeat', 'Check if process is running: ps aux | grep chroma'],
                    'Start ChromaDB server on localhost:8000'
                ));
            } else if (platform === 'darwin') {
                hints.push(createActionHint(
                    'mac',
                    'chroma run --host localhost --port 8000',
                    ['ChromaDB must be installed (pip install chromadb)', 'Python must be in PATH'],
                    ['curl http://localhost:8000/api/v1/heartbeat', 'Check if process is running: ps aux | grep chroma'],
                    'Start ChromaDB server on localhost:8000'
                ));
            }
        } else if (reasonCode === ReasonCode.DEPENDENCY_MISSING && expectedMode === 'vss') {
            // VSS extension is missing
            if (platform === 'linux') {
                hints.push(createActionHint(
                    'linux',
                    'sudo apt-get install sqlite3-vss',
                    ['SQLite3 must be installed', 'Package manager access (apt-get)'],
                    ['sqlite3 :memory: "SELECT load_extension(\'vss0\');"', 'Check if extension loads without errors'],
                    'Install SQLite VSS extension'
                ));
            } else if (platform === 'darwin') {
                hints.push(createActionHint(
                    'mac',
                    'brew install sqlite-vss',
                    ['Homebrew must be installed', 'SQLite3 must be installed'],
                    ['sqlite3 :memory: "SELECT load_extension(\'vss0\');"', 'Check if extension loads without errors'],
                    'Install SQLite VSS extension via Homebrew'
                ));
            }
        } else if (reasonCode === ReasonCode.NOT_INSTALLED) {
            // Component is not installed
            if (platform === 'win32') {
                hints.push(createActionHint(
                    'windows',
                    'npm install chromadb',
                    ['Node.js and npm must be installed'],
                    ['node -e "require(\'chromadb\')"', 'Check if chromadb package is available'],
                    'Install chromadb npm package'
                ));
            }
        }

        return hints;
    }
}

