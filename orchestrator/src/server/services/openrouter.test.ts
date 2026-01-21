/**
 * Tests for the shared OpenRouter API helper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callOpenRouter, parseJsonContent, type JsonSchemaDefinition } from './openrouter.js';

// Mock fetch globally
const originalFetch = global.fetch;

const testSchema: JsonSchemaDefinition = {
    name: 'test_schema',
    schema: {
        type: 'object',
        properties: {
            value: { type: 'string', description: 'A test value' },
            count: { type: 'integer', description: 'A test count' },
        },
        required: ['value', 'count'],
        additionalProperties: false,
    },
};

describe('callOpenRouter', () => {
    beforeEach(() => {
        process.env.OPENROUTER_API_KEY = 'test-api-key';
        global.fetch = vi.fn();
    });

    afterEach(() => {
        delete process.env.OPENROUTER_API_KEY;
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('should return error when API key is not set', async () => {
        delete process.env.OPENROUTER_API_KEY;

        const result = await callOpenRouter({
            model: 'test-model',
            messages: [{ role: 'user', content: 'test' }],
            jsonSchema: testSchema,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('API_KEY');
        }
    });

    it('should return parsed data on successful response', async () => {
        vi.mocked(global.fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: JSON.stringify({ value: 'hello', count: 42 }) } }],
            }),
        } as Response);

        const result = await callOpenRouter<{ value: string; count: number }>({
            model: 'test-model',
            messages: [{ role: 'user', content: 'test' }],
            jsonSchema: testSchema,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.value).toBe('hello');
            expect(result.data.count).toBe(42);
        }
    });

    it('should handle API errors gracefully', async () => {
        vi.mocked(global.fetch).mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
        } as Response);

        const result = await callOpenRouter({
            model: 'test-model',
            messages: [{ role: 'user', content: 'test' }],
            jsonSchema: testSchema,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('500');
        }
    });

    it('should handle empty response content', async () => {
        vi.mocked(global.fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '' } }],
            }),
        } as Response);

        const result = await callOpenRouter({
            model: 'test-model',
            messages: [{ role: 'user', content: 'test' }],
            jsonSchema: testSchema,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('No content');
        }
    });

    it('should include json_schema in request body', async () => {
        vi.mocked(global.fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"value": "test", "count": 1}' } }],
            }),
        } as Response);

        await callOpenRouter({
            model: 'test-model',
            messages: [{ role: 'user', content: 'test prompt' }],
            jsonSchema: testSchema,
        });

        const fetchCall = vi.mocked(global.fetch).mock.calls[0];
        const body = JSON.parse(fetchCall[1]?.body as string);

        expect(body.response_format.type).toBe('json_schema');
        expect(body.response_format.json_schema.name).toBe('test_schema');
        expect(body.response_format.json_schema.strict).toBe(true);
    });

    it('should retry on parsing failures when maxRetries is set', async () => {
        let callCount = 0;
        vi.mocked(global.fetch).mockImplementation(async () => {
            callCount++;
            if (callCount < 3) {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'invalid json' } }],
                    }),
                } as Response;
            }
            return {
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: '{"value": "success", "count": 3}' } }],
                }),
            } as Response;
        });

        // Suppress console output during test
        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });

        const result = await callOpenRouter<{ value: string; count: number }>({
            model: 'test-model',
            messages: [{ role: 'user', content: 'test' }],
            jsonSchema: testSchema,
            maxRetries: 2,
            retryDelayMs: 10, // Fast retries for tests
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.value).toBe('success');
        }
        expect(callCount).toBe(3);
    });
});

describe('parseJsonContent', () => {
    it('should parse clean JSON', () => {
        const result = parseJsonContent<{ foo: string }>('{"foo": "bar"}');
        expect(result.foo).toBe('bar');
    });

    it('should handle markdown code fences', () => {
        const result = parseJsonContent<{ foo: string }>('```json\n{"foo": "bar"}\n```');
        expect(result.foo).toBe('bar');
    });

    it('should handle json without language specifier', () => {
        const result = parseJsonContent<{ foo: string }>('```\n{"foo": "bar"}\n```');
        expect(result.foo).toBe('bar');
    });

    it('should extract JSON from surrounding text', () => {
        const result = parseJsonContent<{ foo: string }>('Here is the result: {"foo": "bar"} as requested.');
        expect(result.foo).toBe('bar');
    });

    it('should throw on completely invalid content', () => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => parseJsonContent('not json at all')).toThrow();
    });
});
