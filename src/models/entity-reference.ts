import { Dimension } from '../core/multi-db-manager';

/**
 * Entity reference for cross-dimension linking.
 * Stores both internal (UUID) and external (fachliche) IDs.
 */
export interface EntityReference {
    dimension: Dimension;
    entity_id: string;  // Internal UUID
    external_id: string;  // External ID (symbol_id, adr_number, etc.)
}

/**
 * Creates an entity reference.
 * 
 * @param dimension The dimension
 * @param entityId The internal UUID
 * @param externalId The external ID
 * @returns Entity reference
 */
export function createEntityReference(
    dimension: Dimension,
    entityId: string,
    externalId: string
): EntityReference {
    return {
        dimension,
        entity_id: entityId,
        external_id: externalId
    };
}

