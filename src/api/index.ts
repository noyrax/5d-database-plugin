/**
 * Public API for @noyrax/5d-database-plugin
 * 
 * This file exports all APIs that can be used from npm package installations.
 */

export { ModuleApi } from './module-api';
export { SymbolApi } from './symbol-api';
export { DependencyApi } from './dependency-api';
export { AdrApi } from './adr-api';
export { ChangeApi } from './change-api';
export { CrossDimensionApi } from './cross-dimension-api';
export { SemanticSearchApi } from './semantic-search-api';
export { SearchApi } from './search-api';
export { BootstrapApi } from './bootstrap-api';
export { SelfExplanationApi } from './self-explanation-api';
export { LearningPathApi } from './learning-path-api';
export { VectorApi } from './vector-api';
export { IngestionApi } from './ingestion-api';
export { ContextBuilder } from './context-builder';

// Core classes needed for API initialization
export { MultiDbManager, Dimension } from '../core/multi-db-manager';
export { IdMapper } from '../core/id-mapper';
export { DocsPathResolver } from '../core/docs-path-resolver';

// Models
export type { Module } from '../models/module';
export type { Symbol } from '../models/symbol';
export type { Dependency } from '../models/dependency';
export type { Adr } from '../models/adr';
export type { ChangeReport } from '../models/change';
export type { EntityReference } from '../models/entity-reference';

