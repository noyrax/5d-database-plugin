import { MultiDbManager } from '../core/multi-db-manager';
import { SelfExplanationApi } from './self-explanation-api';
import { EntityReference } from '../models/entity-reference';

/**
 * Bootstrap information for first-time system understanding.
 * Provides everything an agent needs to start without prior knowledge.
 */
export interface BootstrapInfo {
    what_am_i: string;
    how_do_i_work: string;
    where_to_start: Array<{
        entity: EntityReference;
        reason: string;
    }>;
    how_to_navigate: string;
    example_queries: string[];
    dimensions_overview: Array<{
        id: 'X' | 'Y' | 'Z' | 'W' | 'T';
        name: string;
        description: string;
    }>;
    tools_available: Array<{
        name: string;
        description: string;
        example: any;
    }>;
}

/**
 * Bootstrap API - first point of contact for agents without prior knowledge.
 * Provides system description, entry points, and example queries.
 */
export class BootstrapApi {
    private dbManager: MultiDbManager;
    private selfExplanationApi: SelfExplanationApi;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.selfExplanationApi = new SelfExplanationApi(dbManager);
    }

    /**
     * Gets bootstrap information for first-time system understanding.
     * 
     * @param pluginId Plugin ID
     * @returns Promise that resolves to bootstrap information
     */
    async getBootstrapInfo(pluginId: string): Promise<BootstrapInfo> {
        // Get system explanation
        const systemExplanation = await this.selfExplanationApi.explainSystem(pluginId);

        // Get entry points with reasons
        const entryPoints = systemExplanation.entry_points.map(ep => ({
            entity: {
                dimension: ep.dimension,
                entity_id: ep.entity_id,
                external_id: ep.external_id
            },
            reason: ep.reason || 'Entry point'
        }));

        return {
            what_am_i: systemExplanation.what_am_i,
            how_do_i_work: systemExplanation.how_do_i_work,
            where_to_start: entryPoints,
            how_to_navigate: 'Use semantic_discovery tool with natural language queries. The system will find relevant entities and provide structured context from all 5 dimensions.',
            example_queries: [
                'How does ingestion work?',
                'What are the main components?',
                'How do I add a new dimension?',
                'What is the architecture?',
                'How do dependencies work?',
                'How does the database system work?',
                'What are the entry points?',
                'How do I navigate the codebase?'
            ],
            dimensions_overview: systemExplanation.dimensions.map(dim => ({
                id: dim.id,
                name: dim.name,
                description: dim.description
            })),
            tools_available: [
                {
                    name: 'semantic_discovery',
                    description: 'Semantic search and context retrieval for LLM understanding',
                    example: {
                        query: 'How does ingestion work?',
                        pluginId
                    }
                },
                {
                    name: 'system_explanation',
                    description: 'Get system overview, entry points, and architecture ADRs',
                    example: {
                        pluginId
                    }
                },
                {
                    name: 'learning_path',
                    description: 'Generate guided learning path for understanding a topic',
                    example: {
                        topic: 'ingestion',
                        pluginId
                    }
                },
                {
                    name: 'bootstrap',
                    description: 'Get bootstrap information for first-time system understanding (no prior knowledge required)',
                    example: {
                        pluginId
                    }
                }
            ]
        };
    }
}


