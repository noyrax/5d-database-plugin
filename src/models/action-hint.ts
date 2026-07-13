/**
 * Action hints for machine-readable fix recipes.
 * Used to provide OS-specific commands and instructions for resolving issues.
 */

/**
 * Supported operating systems for action hints.
 */
export type OperatingSystem = 'windows' | 'linux' | 'mac';

/**
 * Action hint structure for providing machine-readable fix instructions.
 */
export interface ActionHint {
    /** Operating system this hint applies to */
    os: OperatingSystem;
    
    /** Command to execute (OS-specific) */
    command: string;
    
    /** Prerequisites that must be met before running the command */
    prerequisites?: string[];
    
    /** Steps to verify the fix worked */
    verify_steps?: string[];
    
    /** Human-readable description of what this action does */
    description?: string;
}

/**
 * Helper function to create an action hint.
 */
export function createActionHint(
    os: OperatingSystem,
    command: string,
    prerequisites?: string[],
    verify_steps?: string[],
    description?: string
): ActionHint {
    return {
        os,
        command,
        prerequisites,
        verify_steps,
        description
    };
}

/**
 * Helper function to get action hints for a specific OS.
 */
export function getActionHintsForOS(hints: ActionHint[], os: OperatingSystem): ActionHint[] {
    return hints.filter(hint => hint.os === os);
}

/**
 * Helper function to get all action hints for all OSes.
 */
export function getAllActionHints(hints: ActionHint[]): Record<OperatingSystem, ActionHint[]> {
    return {
        windows: getActionHintsForOS(hints, 'windows'),
        linux: getActionHintsForOS(hints, 'linux'),
        mac: getActionHintsForOS(hints, 'mac')
    };
}

