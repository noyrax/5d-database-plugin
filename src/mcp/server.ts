import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MultiDbManager } from '../core/multi-db-manager';
import { IdMapper } from '../core/id-mapper';
import { ModuleApi } from '../api/module-api';
import { SymbolApi } from '../api/symbol-api';
import { DependencyApi } from '../api/dependency-api';
import { AdrApi } from '../api/adr-api';
import { ChangeApi } from '../api/change-api';
import { CrossDimensionApi } from '../api/cross-dimension-api';
import { executeSemanticDiscovery } from './tools/semantic-discovery';
import { executeSystemExplanation } from './tools/system-explanation';
import { executeLearningPath } from './tools/learning-path';
import { executeBootstrap } from './tools/bootstrap';
import { GapAnalysisTool } from './tools/gap-analysis';
import { ArchitectureMiningTool } from './tools/architecture-mining';
import { AdrGeneratorTool } from './tools/adr-generator';
import { NoyraxIntegrationService } from '../services/noyrax-integration-service';

/**
 * MCP Server for 5D Database Plugin
 * Provides access to all 5 dimensions via MCP protocol
 */
export class DatabaseMcpServer {
    private server: Server;
    private dbManager: MultiDbManager;
    private idMapper: IdMapper;
    private moduleApi: ModuleApi;
    private symbolApi: SymbolApi;
    private dependencyApi: DependencyApi;
    private adrApi: AdrApi;
    private changeApi: ChangeApi;
    private crossDimensionApi: CrossDimensionApi;
    private workspaceRoot: string;
    private noyraxService: NoyraxIntegrationService;
    private adrGeneratorTool: AdrGeneratorTool;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.dbManager = new MultiDbManager(workspaceRoot);
        this.idMapper = new IdMapper(this.dbManager);
        
        this.moduleApi = new ModuleApi(this.dbManager);
        this.symbolApi = new SymbolApi(this.dbManager);
        this.dependencyApi = new DependencyApi(this.dbManager);
        this.adrApi = new AdrApi(this.dbManager);
        this.changeApi = new ChangeApi(this.dbManager);
        this.crossDimensionApi = new CrossDimensionApi(this.dbManager, this.idMapper);
        this.noyraxService = new NoyraxIntegrationService(workspaceRoot);
        this.adrGeneratorTool = new AdrGeneratorTool(this.dbManager, this.idMapper, workspaceRoot);

        this.server = new Server(
            {
                name: '5d-database-plugin',
                version: '0.1.0'
            },
            {
                capabilities: {
                    resources: {},
                    tools: {}
                }
            }
        );

        this.setupResources();
        this.setupTools();
    }

    /**
     * Sets up MCP resources.
     */
    private setupResources(): void {
        const ListResourcesRequestSchema = z.object({
            method: z.literal('resources/list'),
            params: z.object({})
        });

        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            const pluginId = this.dbManager.getPluginId();
            return {
                resources: [
                    {
                        uri: `db://modules/${pluginId}`,
                        name: 'Modules (X-Dimension)',
                        description: 'All modules in the database'
                    },
                    {
                        uri: `db://symbols/${pluginId}`,
                        name: 'Symbols (Y-Dimension)',
                        description: 'All symbols in the database'
                    },
                    {
                        uri: `db://dependencies/${pluginId}`,
                        name: 'Dependencies (Z-Dimension)',
                        description: 'All dependencies in the database'
                    },
                    {
                        uri: `db://adrs/${pluginId}`,
                        name: 'ADRs (W-Dimension)',
                        description: 'All ADRs in the database'
                    },
                    {
                        uri: `db://changes/${pluginId}`,
                        name: 'Changes (T-Dimension)',
                        description: 'All change reports in the database'
                    }
                ]
            };
        });

        const ReadResourceRequestSchema = z.object({
            method: z.literal('resources/read'),
            params: z.object({
                uri: z.string()
            })
        });

        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const uri = request.params.uri;
            if (uri.startsWith('db://modules/')) {
                const pluginId = uri.replace('db://modules/', '');
                const modules = await this.moduleApi.getAllModules(pluginId);
                return {
                    contents: [
                        {
                            uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(modules, null, 2)
                        }
                    ]
                };
            }
            throw new Error(`Unknown resource: ${uri}`);
        });
    }

    /**
     * Sets up MCP tools.
     */
    private setupTools(): void {
        const ListToolsRequestSchema = z.object({
            method: z.literal('tools/list'),
            params: z.object({})
        });

        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'query_modules',
                        description: 'Query modules by file path',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                filePath: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['filePath', 'pluginId']
                        }
                    },
                    {
                        name: 'query_symbols',
                        description: 'Query symbols by path or symbol ID',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                path: { type: 'string' as const },
                                symbolId: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'query_dependencies',
                        description: 'Query dependencies by module',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                fromModule: { type: 'string' as const },
                                toModule: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'cross_analysis',
                        description: 'Perform cross-dimension analysis',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                filePath: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['filePath', 'pluginId']
                        }
                    },
                    {
                        name: 'semantic_discovery',
                        description: 'Semantic search and context retrieval for LLM understanding',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                query: { type: 'string' as const, description: 'Natural language query' },
                                pluginId: { type: 'string' as const },
                                limit: { type: 'number' as const, default: 10 }
                            },
                            required: ['query', 'pluginId']
                        }
                    },
                    {
                        name: 'system_explanation',
                        description: 'Get system overview, entry points, and architecture ADRs',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'learning_path',
                        description: 'Generate guided learning path for understanding a topic',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                topic: { type: 'string' as const, description: 'Topic to learn about (e.g., "ingestion", "dependencies")' },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['topic', 'pluginId']
                        }
                    },
                    {
                        name: 'bootstrap',
                        description: 'Get bootstrap information for first-time system understanding (no prior knowledge required)',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'gap_analysis',
                        description: 'Find documentation gaps by analyzing modules with many dependencies but few/no ADRs',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                minDependencies: { type: 'number' as const, default: 5 },
                                pluginId: { type: 'string' as const },
                                limit: { type: 'number' as const, default: 50 },
                                autoGenerateAdrs: { type: 'boolean' as const, default: false }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'architecture_mining',
                        description: 'Mine architectural decisions from code structure and patterns',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                filePath: { type: 'string' as const },
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'generate_documentation',
                        description: 'Generate documentation using Noyrax (scan → validate → generate)',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'check_docs_status',
                        description: 'Check if docs/ directory exists and is up-to-date',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const }
                            },
                            required: ['pluginId']
                        }
                    },
                    {
                        name: 'adr_generator',
                        description: 'Reconstruct ADRs from 5D dimensions for modules with documentation gaps. Use LLM for "Why" reconstruction (--use-llm).',
                        inputSchema: {
                            type: 'object' as const,
                            properties: {
                                pluginId: { type: 'string' as const },
                                minDependencies: { type: 'number' as const, default: 5 },
                                limit: { type: 'number' as const, default: 10 },
                                dryRun: { type: 'boolean' as const, default: false },
                                useLLM: { type: 'boolean' as const, default: false },
                                llmModel: { type: 'string' as const, default: 'gpt-4o-mini' }
                            },
                            required: ['pluginId']
                        }
                    }
                ]
            };
        });

        const CallToolRequestSchema = z.object({
            method: z.literal('tools/call'),
            params: z.object({
                name: z.string(),
                arguments: z.any()
            })
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case 'query_modules':
                    const module = await this.moduleApi.getModuleByPath(args.filePath, args.pluginId);
                    return { content: [{ type: 'text', text: JSON.stringify(module, null, 2) }] };

                case 'query_symbols': {
                    let symbolResults;
                    if (args.symbolId) {
                        const symbol = await this.symbolApi.getSymbolById(args.symbolId, args.pluginId);
                        symbolResults = symbol ? [symbol] : [];
                    } else if (args.path) {
                        symbolResults = await this.symbolApi.getSymbolsByPath(args.path, args.pluginId);
                    } else {
                        symbolResults = await this.symbolApi.getAllSymbols(args.pluginId);
                    }
                    return { content: [{ type: 'text', text: JSON.stringify(symbolResults, null, 2) }] };
                }

                case 'query_dependencies': {
                    let deps;
                    if (args.fromModule) {
                        deps = await this.dependencyApi.getDependenciesByFromModule(args.fromModule, args.pluginId);
                    } else if (args.toModule) {
                        deps = await this.dependencyApi.getDependenciesByToModule(args.toModule, args.pluginId);
                    } else {
                        deps = await this.dependencyApi.getAllDependencies(args.pluginId);
                    }
                    return { content: [{ type: 'text', text: JSON.stringify(deps, null, 2) }] };
                }

                case 'cross_analysis': {
                    const adrs = await this.crossDimensionApi.getAdrsForFilePath(args.filePath, args.pluginId);
                    const moduleSymbols = await this.crossDimensionApi.getSymbolsForModule(args.filePath, args.pluginId);
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({ adrs, symbols: moduleSymbols }, null, 2)
                        }]
                    };
                }

                case 'semantic_discovery': {
                    const result = await executeSemanticDiscovery(args, this.dbManager, this.idMapper);
                    return { content: [{ type: 'text', text: result }] };
                }

                case 'system_explanation': {
                    const result = await executeSystemExplanation(args, this.dbManager);
                    return { content: [{ type: 'text', text: result }] };
                }

                case 'learning_path': {
                    const result = await executeLearningPath(args, this.dbManager);
                    return { content: [{ type: 'text', text: result }] };
                }

                case 'bootstrap': {
                    const result = await executeBootstrap(args, this.dbManager);
                    return { content: [{ type: 'text', text: result }] };
                }

                case 'gap_analysis': {
                    const gapAnalysisTool = new GapAnalysisTool(this.dbManager, this.idMapper, this.workspaceRoot);
                    const result = await gapAnalysisTool.execute(args);
                    return { content: [{ type: 'text', text: result }] };
                }

                case 'architecture_mining': {
                    const architectureMiningTool = new ArchitectureMiningTool(this.dbManager, this.idMapper);
                    const result = await architectureMiningTool.execute(args);
                    return { content: [{ type: 'text', text: result }] };
                }

                case 'generate_documentation': {
                    try {
                        await this.noyraxService.generateDocumentation();
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: true,
                                    message: 'Documentation generated successfully'
                                }, null, 2)
                            }]
                        };
                    } catch (error: any) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: error.message || String(error)
                                }, null, 2)
                            }],
                            isError: true
                        };
                    }
                }

                case 'check_docs_status': {
                    try {
                        const status = await this.noyraxService.checkDocsStatus();
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify(status, null, 2)
                            }]
                        };
                    } catch (error: any) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    exists: false,
                                    error: error.message || String(error)
                                }, null, 2)
                            }],
                            isError: true
                        };
                    }
                }

                case 'adr_generator': {
                    const result = await this.adrGeneratorTool.execute({
                        pluginId: args.pluginId,
                        minDependencies: args.minDependencies,
                        limit: args.limit,
                        dryRun: args.dryRun,
                        useLLM: args.useLLM,
                        llmModel: args.llmModel
                    });
                    return { content: [{ type: 'text', text: result }] };
                }

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    /**
     * Starts the MCP server.
     */
    public async start(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}

