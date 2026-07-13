import { SourceAccessContractApi } from '../src/api/source-access-contract-api';
import { MultiDbManager } from '../src/core/multi-db-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
jest.mock('fs');

describe('SourceAccessContractApi', () => {
    let api: SourceAccessContractApi;
    let mockDbManager: jest.Mocked<MultiDbManager>;
    let mockDb: any;

    beforeEach(() => {
        // Mock database
        mockDb = {
            get: jest.fn(),
            run: jest.fn()
        };

        // Mock MultiDbManager
        mockDbManager = {
            getDatabase: jest.fn().mockResolvedValue(mockDb)
        } as any;

        api = new SourceAccessContractApi(mockDbManager);

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('getContract', () => {
        test('should return UNAVAILABLE contract when no config exists', async () => {
            // Mock: No config in database
            (mockDb.get as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null, null);
            });

            // Mock: Initialize contract (UNAVAILABLE)
            (mockDb.run as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null);
            });

            // Mock: Workspace not accessible
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const contract = await api.getContract('/test/workspace');

            expect(contract.status).toBe('UNAVAILABLE');
            expect(contract.reason_codes).toContain('NOT_MOUNTED');
        });

        test('should return AVAILABLE contract when workspace is accessible', async () => {
            // Mock: Config exists
            (mockDb.get as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null, {
                    id: 'singleton',
                    status: 'AVAILABLE',
                    resolver_type: 'FILESYSTEM',
                    workspace_root: '/test/workspace',
                    max_bytes_per_request: 51200,
                    max_lines_per_request: 500,
                    max_concurrent_requests: 5,
                    redactions_json: '[]',
                    reason_codes_json: '[]',
                    verified_at: new Date().toISOString(),
                    evidence_grade: 'DETERMINISTIC'
                });
            });

            // Mock: Workspace accessible
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.accessSync as jest.Mock).mockImplementation(() => {});

            const contract = await api.getContract('/test/workspace');

            expect(contract.status).toBe('AVAILABLE');
            expect(contract.resolver_type).toBe('FILESYSTEM');
            expect(contract.constraints).toBeDefined();
            expect(contract.constraints?.max_bytes_per_request).toBe(51200);
        });

        test('should update contract to UNAVAILABLE when workspace no longer accessible', async () => {
            // Mock: Config exists with AVAILABLE status
            (mockDb.get as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null, {
                    id: 'singleton',
                    status: 'AVAILABLE',
                    resolver_type: 'FILESYSTEM',
                    workspace_root: '/test/workspace',
                    max_bytes_per_request: 51200,
                    max_lines_per_request: 500,
                    max_concurrent_requests: 5,
                    redactions_json: '[]',
                    reason_codes_json: '[]',
                    verified_at: new Date().toISOString(),
                    evidence_grade: 'DETERMINISTIC'
                });
            });

            // Mock: Workspace no longer accessible
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            // Mock: Update contract
            (mockDb.run as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null);
            });

            const contract = await api.getContract('/test/workspace');

            expect(contract.status).toBe('UNAVAILABLE');
            expect(contract.reason_codes).toContain('NOT_MOUNTED');
        });
    });

    describe('initializeContract', () => {
        test('should initialize as AVAILABLE when workspace is accessible', async () => {
            // Mock: No config exists
            (mockDb.get as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null, null);
            });

            // Mock: Workspace accessible
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.accessSync as jest.Mock).mockImplementation(() => {});

            // Mock: Insert contract
            (mockDb.run as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null);
            });

            // Mock: Get contract after insert
            (mockDb.get as jest.Mock)
                .mockImplementationOnce((sql, params, callback) => {
                    callback(null, null);
                })
                .mockImplementationOnce((sql, params, callback) => {
                    callback(null, {
                        id: 'singleton',
                        status: 'AVAILABLE',
                        resolver_type: 'FILESYSTEM',
                        workspace_root: '/test/workspace',
                        max_bytes_per_request: 51200,
                        max_lines_per_request: 500,
                        max_concurrent_requests: 5,
                        redactions_json: '[]',
                        reason_codes_json: '[]',
                        verified_at: new Date().toISOString(),
                        evidence_grade: 'DETERMINISTIC'
                    });
                });

            const contract = await api.initializeContract('/test/workspace');

            expect(contract.status).toBe('AVAILABLE');
            expect(contract.resolver_type).toBe('FILESYSTEM');
        });

        test('should initialize as UNAVAILABLE when workspace is not accessible', async () => {
            // Mock: No config exists
            (mockDb.get as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null, null);
            });

            // Mock: Workspace not accessible
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            // Mock: Insert contract
            (mockDb.run as jest.Mock).mockImplementation((sql, params, callback) => {
                callback(null);
            });

            // Mock: Get contract after insert
            (mockDb.get as jest.Mock)
                .mockImplementationOnce((sql, params, callback) => {
                    callback(null, null);
                })
                .mockImplementationOnce((sql, params, callback) => {
                    callback(null, {
                        id: 'singleton',
                        status: 'UNAVAILABLE',
                        resolver_type: null,
                        workspace_root: '/test/workspace',
                        max_bytes_per_request: null,
                        max_lines_per_request: null,
                        max_concurrent_requests: null,
                        redactions_json: '[]',
                        reason_codes_json: JSON.stringify(['NOT_MOUNTED']),
                        verified_at: new Date().toISOString(),
                        evidence_grade: 'DETERMINISTIC'
                    });
                });

            const contract = await api.initializeContract('/test/workspace');

            expect(contract.status).toBe('UNAVAILABLE');
            expect(contract.reason_codes).toContain('NOT_MOUNTED');
        });
    });
});

