/**
 * Type conversion utilities for safely converting unknown values to specific types.
 *
 * These functions handle edge cases like null, undefined, empty strings,
 * and non-finite numbers consistently across the codebase.
 */
/**
 * Converts a value to a string or null.
 * - Returns null for null, undefined, or empty/whitespace-only strings
 * - Trims whitespace from string values
 * - Converts numbers and booleans to their string representation
 * - Returns null for other types (objects, arrays, etc.)
 */
export function toStringOrNull(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    return null;
}
/**
 * Converts a value to a number or null.
 * - Returns null for null, undefined, or empty strings
 * - Returns the value as-is for finite numbers
 * - Parses string values to numbers, returning null if parsing fails or result is non-finite
 * - Returns null for other types (booleans, objects, arrays, etc.)
 */
export function toNumberOrNull(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === "number")
        return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
