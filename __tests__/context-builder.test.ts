import { ContextBuilder } from '../src/api/context-builder';
import { MultiDbManager } from '../src/core/multi-db-manager';
import { IdMapper } from '../src/core/id-mapper';
import { NavigationRepository, NavigationMetadata } from '../src/repositories/navigation-repository';
import { ModuleApi } from '../src/api/module-api';
import { Module } from '../src/models/module';

// Mock NavigationRepository
jest.mock('../src/repositories/navigation-repository');

describe('ContextBuilder', () => {
    let contextBuilder: ContextBuilder;
    let mockDbManager: jest.Mocked<MultiDbManager>;
    let mockIdMapper: jest.Mocked<IdMapper>;
    let mockNavRepo: jest.Mocked<NavigationRepository>;
    let mockModuleApi: jest.Mocked<ModuleApi>;
    const pluginId = 'b02b521a82a5108c';

    beforeEach(() => {
        // Mock MultiDbManager
        mockDbManager = {
            getDatabase: jest.fn()
        } as any;

        // Mock IdMapper
        mockIdMapper = {} as any;

        // Mock NavigationRepository instance
        mockNavRepo = {
            getEntryPoints: jest.fn()
        } as any;

        // Mock ModuleApi
        mockModuleApi = {
            getModuleById: jest.fn()
        } as any;

        // Mock NavigationRepository constructor to return our mock
        (NavigationRepository as jest.Mock).mockImplementation(() => mockNavRepo);

        // Setup getDatabase to return a mock database
        (mockDbManager.getDatabase as jest.Mock).mockResolvedValue({
            // Mock V database
        } as any);

        // Create ContextBuilder instance
        contextBuilder = new ContextBuilder(mockDbManager, mockIdMapper);

        // Replace the private moduleApi with our mock
        (contextBuilder as any).moduleApi = mockModuleApi;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getEntryPoints', () => {
        test('should return entry points with non-empty external_id', async () => {
            // Mock NavigationMetadata from NavigationRepository.getEntryPoints
            const mockEntryPoints: NavigationMetadata[] = [
                {
                    id: 'nav-1',
                    plugin_id: pluginId,
                    dimension: 'X',
                    entity_id: 'entity-1',
                    is_entry_point: true,
                    cluster_id: null,
                    related_adrs: '[]',
                    created_at: new Date()
                },
                {
                    id: 'nav-2',
                    plugin_id: pluginId,
                    dimension: 'X',
                    entity_id: 'entity-2',
                    is_entry_point: true,
                    cluster_id: null,
                    related_adrs: '[]',
                    created_at: new Date()
                }
            ];

            // Mock modules from ModuleApi
            const mockModules: Module[] = [
                {
                    id: 'entity-1',
                    plugin_id: pluginId,
                    file_path: 'src/module1.ts',
                    content_hash: 'hash1',
                    content_markdown: '# Module 1',
                    deleted_at: null,
                    created_at: new Date(),
                    updated_at: new Date()
                },
                {
                    id: 'entity-2',
                    plugin_id: pluginId,
                    file_path: 'src/module2.ts',
                    content_hash: 'hash2',
                    content_markdown: '# Module 2',
                    deleted_at: null,
                    created_at: new Date(),
                    updated_at: new Date()
                }
            ];

            // Setup mocks
            (mockNavRepo.getEntryPoints as jest.Mock).mockResolvedValue(mockEntryPoints);
            (mockModuleApi.getModuleById as jest.Mock)
                .mockResolvedValueOnce(mockModules[0])
                .mockResolvedValueOnce(mockModules[1]);

            // Access private method
            const entryPoints = await (contextBuilder as any).getEntryPoints(pluginId);

            // Verify results
            expect(entryPoints.length).toBe(2);
            expect(entryPoints.every((ep: any) => 
                typeof ep.external_id === 'string' && ep.external_id.length > 0
            )).toBe(true);

            // Verify that all entry points have valid external_id
            expect(entryPoints[0].external_id).toBe('src/module1.ts');
            expect(entryPoints[1].external_id).toBe('src/module2.ts');
        });

        test('should filter out entry points without corresponding modules', async () => {
            // Mock NavigationMetadata
            const mockEntryPoints: NavigationMetadata[] = [
                {
                    id: 'nav-1',
                    plugin_id: pluginId,
                    dimension: 'X',
                    entity_id: 'entity-1',
                    is_entry_point: true,
                    cluster_id: null,
                    related_adrs: '[]',
                    created_at: new Date()
                },
                {
                    id: 'nav-2',
                    plugin_id: pluginId,
                    dimension: 'X',
                    entity_id: 'entity-not-found',
                    is_entry_point: true,
                    cluster_id: null,
                    related_adrs: '[]',
                    created_at: new Date()
                }
            ];

            // Mock module for entity-1 only
            const mockModule: Module = {
                id: 'entity-1',
                plugin_id: pluginId,
                file_path: 'src/module1.ts',
                content_hash: 'hash1',
                content_markdown: '# Module 1',
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date()
            };

            // Setup mocks
            (mockNavRepo.getEntryPoints as jest.Mock).mockResolvedValue(mockEntryPoints);
            (mockModuleApi.getModuleById as jest.Mock)
                .mockImplementation(async (entityId: string) => {
                    if (entityId === 'entity-1') {
                        return mockModule;
                    }
                    return null;
                });

            // Access private method
            const entryPoints = await (contextBuilder as any).getEntryPoints(pluginId);

            // Verify that only entry points with modules are returned
            expect(entryPoints.length).toBe(1);
            expect(entryPoints[0].entity_id).toBe('entity-1');
            expect(entryPoints[0].external_id).toBe('src/module1.ts');
        });
    });
});

