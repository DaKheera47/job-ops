/**
 * Shared OpenRouter API helper for structured JSON responses.
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface JsonSchemaDefinition {
    name: string;
    schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: boolean;
    };
}

export interface OpenRouterRequestOptions<T> {
    /** The model to use (e.g., 'google/gemini-3-flash-preview') */
    model: string;
    /** The prompt messages to send */
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>;
    /** JSON schema for structured output */
    jsonSchema: JsonSchemaDefinition;
    /** Number of retries on parsing failures (default: 0) */
    maxRetries?: number;
    /** Delay between retries in ms (default: 500) */
    retryDelayMs?: number;
    /** Job ID for logging purposes */
    jobId?: string;
}

export interface OpenRouterResult<T> {
    success: true;
    data: T;
}

export interface OpenRouterError {
    success: false;
    error: string;
}

export type OpenRouterResponse<T> = OpenRouterResult<T> | OpenRouterError;

/**
 * Call OpenRouter API with structured JSON output.
 * 
 * @returns Parsed JSON response matching the schema, or an error object
 */
export async function callOpenRouter<T>(
    options: OpenRouterRequestOptions<T>
): Promise<OpenRouterResponse<T>> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        return { success: false, error: 'OPENROUTER_API_KEY not configured' };
    }

    const { model, messages, jsonSchema, maxRetries = 0, retryDelayMs = 500, jobId } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`🔄 [${jobId ?? 'unknown'}] Retry attempt ${attempt}/${maxRetries}...`);
                await sleep(retryDelayMs * attempt);
            }

            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'JobOps',
                    'X-Title': 'JobOpsOrchestrator',
                },
                body: JSON.stringify({
                    model,
                    messages,
                    response_format: {
                        type: 'json_schema',
                        json_schema: {
                            name: jsonSchema.name,
                            strict: true,
                            schema: jsonSchema.schema,
                        },
                    },
                }),
            });

            if (!response.ok) {
                // Throw error with status to allow specific retries
                const errorBody = await response.text().catch(() => 'No error body');
                const err = new Error(`OpenRouter API error: ${response.status}`);
                (err as any).status = response.status;
                (err as any).body = errorBody;
                throw err;
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('No content in response');
            }

            // Parse JSON - structured outputs should always return valid JSON
            const parsed = parseJsonContent<T>(content, jobId);

            return { success: true, data: parsed };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const status = (error as any).status;

            // Retry on:
            // 1. Parsing errors (AI returned malformed JSON)
            // 2. Rate limits (429)
            // 3. Server errors (5xx)
            // 4. Timeouts/Network issues
            const shouldRetry = 
                message.includes('parse') || 
                status === 429 || 
                (status >= 500 && status <= 599) ||
                message.toLowerCase().includes('timeout') ||
                message.toLowerCase().includes('fetch failed');

            if (attempt < maxRetries && shouldRetry) {
                console.warn(`⚠️ [${jobId ?? 'unknown'}] Attempt ${attempt + 1} failed (${status ?? 'no-status'}): ${message}. Retrying...`);
                continue;
            }

            return { success: false, error: message };
        }
    }

    return { success: false, error: 'All retry attempts failed' };
}

/**
 * Parse JSON content from OpenRouter response.
 * Handles common AI quirks like markdown code fences.
 */
export function parseJsonContent<T>(content: string, jobId?: string): T {
    let candidate = content.trim();

    // Remove markdown code fences if present
    candidate = candidate.replace(/```(?:json|JSON)?\s*/g, '').replace(/```/g, '').trim();

    // Try to extract JSON object if there's surrounding text
    // Use non-greedy match and find the outermost braces
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        candidate = candidate.substring(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(candidate) as T;
    } catch (error) {
        console.error(`❌ [${jobId ?? 'unknown'}] Failed to parse JSON:`, candidate.substring(0, 200));
        throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'unknown'}`);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
