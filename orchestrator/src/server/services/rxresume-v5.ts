// rxresume-v5.ts
// Future-facing v5/OpenAPI implementation that uses API keys.
// - Kept alongside v4 files so we can swap imports when v5 is ready.
// - Uses RXRESUME_API_KEY and /api/openapi endpoints.
//
// NOTE: Not currently wired in; keep for migration.

import { resumeDataSchema } from "../../shared/rxresume-schema.js";

export interface RxResumeResponse {
    id: string;
    name: string;
    slug: string;
    data: any;
    [key: string]: any;
}

/**
 * Temporary helper to execute a fetch request with multiple API keys if in development.
 * THIS FUNCTION IS TEMPORARY AND WILL BE REMOVED.
 */

// Cache for last working key index (temporary, part of dev-only logic)
let lastWorkingKeyIndex = 0;

async function executeWithKeyRetries(url: string, options: RequestInit): Promise<any> {
    const rawApiKey = process.env.RXRESUME_API_KEY;
    if (!rawApiKey) {
        throw new Error('RXRESUME_API_KEY not configured in environment');
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const apiKeys = (isDev && rawApiKey.includes(','))
        ? rawApiKey.split(',').map(k => k.trim())
        : [rawApiKey];

    // Start from the last working key index
    for (let attempt = 0; attempt < apiKeys.length; attempt++) {
        const i = (lastWorkingKeyIndex + attempt) % apiKeys.length;
        const apiKey = apiKeys[i];
        try {
            const headers = {
                'x-api-key': apiKey,
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {}),
            } as Record<string, string>;

            const response = await fetch(url, {
                ...options,
                headers,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                const errorMsg = `Reactive Resume API error (${response.status}): ${errorData.message || response.statusText}`;

                // ONLY retry/rotation on 401 Unauthorized
                if (response.status === 401 && apiKeys.length > 1 && attempt < apiKeys.length - 1) {
                    console.warn(`[RxResume SDK] Key index ${i} was Unauthorized, trying next key...`);
                    continue;
                }

                throw new Error(errorMsg);
            }

            // Success! Cache this key index for future requests
            lastWorkingKeyIndex = i;

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return response.json();
            }
            return response.text();
        } catch (error) {
            // If it was already handled by the 401 check above, it won't reach here
            // because of the 'continue'. This catch is for network errors or unexpected throw.
            throw error;
        }
    }

    // Unmissable error block if all keys fail
    if (apiKeys.length > 1) {
        console.error(`
################################################################################
#                                                                              #
#   ❌ ALL REACTIVE RESUME API KEYS FAILED (${apiKeys.length} keys attempted)               #
#   Please check your .env configuration.                                      #
#                                                                              #
################################################################################
`);
    }

    throw new Error('All Reactive Resume API keys failed.');
}

/**
 * Generic fetch helper for Reactive Resume API
 */
export async function fetchRxResume(path: string, options: RequestInit = {}): Promise<any> {
    const baseUrl = process.env.RXRESUME_URL || 'https://rxresu.me';
    let cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    // Handle cases where the base URL already includes /api or /api/openapi
    if (cleanBaseUrl.endsWith('/api/openapi')) {
        cleanBaseUrl = cleanBaseUrl.slice(0, -12);
    } else if (cleanBaseUrl.endsWith('/api')) {
        cleanBaseUrl = cleanBaseUrl.slice(0, -4);
    }

    const url = `${cleanBaseUrl}/api/openapi${path}`;
    return executeWithKeyRetries(url, options);
}

/**
 * Fetch a resume by its ID.
 */
export async function getResume(id: string): Promise<RxResumeResponse> {
    return fetchRxResume(`/resume/${id}`);
}

/**
 * Import a resume.
 */
export async function importResume(payload: { name: string; slug: string; data: any }): Promise<string> {
    // Validate data against schema before sending
    try {
        payload.data = resumeDataSchema.parse(payload.data);
    } catch (error) {
        console.error("❌ Resume data validation failed:", error);
        throw error;
    }

    // DEBUG: Save payload to file for debugging (temporary)
    try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const debugDir = path.join(process.cwd(), 'debug');
        await fs.mkdir(debugDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(debugDir, `rxresume-import-${timestamp}.json`);
        await fs.writeFile(filename, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`📝 DEBUG: Saved import payload to ${filename}`);
    } catch (debugErr) {
        console.warn('⚠️ Could not save debug file:', debugErr);
    }

    const result = await fetchRxResume('/resume/import', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    // Reactive Resume returns the full resume object on import in v4+, or just ID in v5.
    return typeof result === 'string' ? result : result.id;
}

/**
 * Delete a resume.
 */
export async function deleteResume(id: string): Promise<void> {
    await fetchRxResume(`/resume/${id}`, { method: 'DELETE' });
}

/**
 * Export a resume as PDF. Returns the URL.
 */
export async function exportResumePdf(id: string): Promise<string> {
    const result = await fetchRxResume(`/printer/resume/${id}/pdf`);
    return result.url;
}

/**
 * List all resumes.
 * According to official OpenAPI spec, the endpoint is /resume/list
 */
export async function listResumes(): Promise<{ id: string; name: string }[]> {
    return fetchRxResume('/resume/list');
}
