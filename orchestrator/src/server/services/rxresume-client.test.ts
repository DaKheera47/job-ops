import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RxResumeClient } from './rxresume-client.js';

describe('RxResumeClient', () => {
    describe('verifyCredentials (static)', () => {
        it('returns ok: true for successful login', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await RxResumeClient.verifyCredentials(
                'test@example.com',
                'password123',
                'https://mock.rxresume.test'
            );

            expect(result.ok).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                'https://mock.rxresume.test/api/auth/login',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({ identifier: 'test@example.com', password: 'password123' }),
                })
            );

            vi.unstubAllGlobals();
        });

        it('returns ok: false with status 401 for invalid credentials', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ message: 'InvalidCredentials' }),
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await RxResumeClient.verifyCredentials(
                'wrong@example.com',
                'badpassword',
                'https://mock.rxresume.test'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(401);
                expect(result.message).toBe('InvalidCredentials');
            }

            vi.unstubAllGlobals();
        });

        it('returns ok: false with error message for other HTTP errors', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => JSON.stringify({ error: 'Internal Server Error' }),
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await RxResumeClient.verifyCredentials(
                'test@example.com',
                'password123',
                'https://mock.rxresume.test'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(500);
                expect(result.message).toBe('Internal Server Error');
            }

            vi.unstubAllGlobals();
        });

        it('returns ok: false with statusMessage from response', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                text: async () => JSON.stringify({ statusMessage: 'Account suspended' }),
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await RxResumeClient.verifyCredentials(
                'test@example.com',
                'password123',
                'https://mock.rxresume.test'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(403);
                expect(result.message).toBe('Account suspended');
            }

            vi.unstubAllGlobals();
        });

        it('handles network errors gracefully', async () => {
            const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
            vi.stubGlobal('fetch', mockFetch);

            const result = await RxResumeClient.verifyCredentials(
                'test@example.com',
                'password123',
                'https://mock.rxresume.test'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(0);
                expect(result.message).toBe('Network timeout');
            }

            vi.unstubAllGlobals();
        });

        it('handles non-JSON error response body', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 502,
                text: async () => 'Bad Gateway',
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await RxResumeClient.verifyCredentials(
                'test@example.com',
                'password123',
                'https://mock.rxresume.test'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(502);
                // Should handle gracefully even if body is not JSON
                expect(result).toBeDefined();
            }

            vi.unstubAllGlobals();
        });

        it('handles empty response body', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                text: async () => '',
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await RxResumeClient.verifyCredentials(
                'test@example.com',
                'password123',
                'https://mock.rxresume.test'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(404);
            }

            vi.unstubAllGlobals();
        });

        it('handles string response directly', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                text: async () => '"Direct string error"',
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await RxResumeClient.verifyCredentials(
                'test@example.com',
                'password123',
                'https://mock.rxresume.test'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(400);
                expect(result.message).toBe('Direct string error');
            }

            vi.unstubAllGlobals();
        });

        it('uses default baseURL when not provided', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
            });
            vi.stubGlobal('fetch', mockFetch);

            await RxResumeClient.verifyCredentials('test@example.com', 'password123');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://v4.rxresu.me/api/auth/login',
                expect.any(Object)
            );

            vi.unstubAllGlobals();
        });
    });

    describe('instance methods', () => {
        let client: RxResumeClient;

        beforeEach(() => {
            client = new RxResumeClient('https://mock.rxresume.test');
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        describe('login', () => {
            it('returns access token on successful login', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ accessToken: 'mock-token-123' }),
                });
                vi.stubGlobal('fetch', mockFetch);

                const token = await client.login('test@example.com', 'password123');

                expect(token).toBe('mock-token-123');
            });

            it('handles token in data.accessToken format', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ data: { accessToken: 'nested-token' } }),
                });
                vi.stubGlobal('fetch', mockFetch);

                const token = await client.login('test@example.com', 'password123');

                expect(token).toBe('nested-token');
            });

            it('handles token field instead of accessToken', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ token: 'alt-token-field' }),
                });
                vi.stubGlobal('fetch', mockFetch);

                const token = await client.login('test@example.com', 'password123');

                expect(token).toBe('alt-token-field');
            });

            it('throws error on login failure', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: false,
                    status: 401,
                    text: async () => 'Unauthorized',
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.login('wrong@example.com', 'badpass')).rejects.toThrow(
                    'Login failed: HTTP 401'
                );
            });

            it('throws error when token is not found in response', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ user: { id: '123' } }),
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.login('test@example.com', 'password123')).rejects.toThrow(
                    'could not locate access token'
                );
            });
        });

        describe('create', () => {
            it('returns resume id on successful creation', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'resume-id-123' }),
                });
                vi.stubGlobal('fetch', mockFetch);

                const id = await client.create({ basics: { name: 'Test' } }, 'mock-token');

                expect(id).toBe('resume-id-123');
                expect(mockFetch).toHaveBeenCalledWith(
                    'https://mock.rxresume.test/api/resume/import',
                    expect.objectContaining({
                        method: 'POST',
                        headers: expect.objectContaining({
                            Authorization: 'Bearer mock-token',
                        }),
                    })
                );
            });

            it('handles id in nested data.resume.id format', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ data: { resume: { id: 'nested-resume-id' } } }),
                });
                vi.stubGlobal('fetch', mockFetch);

                const id = await client.create({}, 'mock-token');

                expect(id).toBe('nested-resume-id');
            });

            it('throws error on creation failure', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: false,
                    status: 400,
                    text: async () => 'Invalid resume data',
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.create({}, 'mock-token')).rejects.toThrow('Create failed: HTTP 400');
            });

            it('throws error when id is not found in response', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ success: true }),
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.create({}, 'mock-token')).rejects.toThrow(
                    'could not locate resume id'
                );
            });
        });

        describe('print', () => {
            it('returns print URL on success', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ url: 'https://pdf.rxresume.test/print/123' }),
                });
                vi.stubGlobal('fetch', mockFetch);

                const url = await client.print('resume-123', 'mock-token');

                expect(url).toBe('https://pdf.rxresume.test/print/123');
                expect(mockFetch).toHaveBeenCalledWith(
                    'https://mock.rxresume.test/api/resume/print/resume-123',
                    expect.objectContaining({
                        method: 'GET',
                        headers: expect.objectContaining({
                            Authorization: 'Bearer mock-token',
                        }),
                    })
                );
            });

            it('handles href field instead of url', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ href: 'https://alt-url.test' }),
                });
                vi.stubGlobal('fetch', mockFetch);

                const url = await client.print('resume-123', 'mock-token');

                expect(url).toBe('https://alt-url.test');
            });

            it('throws error on print failure', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: false,
                    status: 404,
                    text: async () => 'Resume not found',
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.print('nonexistent', 'mock-token')).rejects.toThrow(
                    'Print failed: HTTP 404'
                );
            });

            it('throws error when URL is not found in response', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ status: 'queued' }),
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.print('resume-123', 'mock-token')).rejects.toThrow(
                    'could not locate URL'
                );
            });

            it('encodes resume ID in URL', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({ url: 'https://test.com' }),
                });
                vi.stubGlobal('fetch', mockFetch);

                await client.print('resume with spaces', 'mock-token');

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://mock.rxresume.test/api/resume/print/resume%20with%20spaces',
                    expect.any(Object)
                );
            });
        });

        describe('delete', () => {
            it('completes successfully on 200 response', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.delete('resume-123', 'mock-token')).resolves.toBeUndefined();
                expect(mockFetch).toHaveBeenCalledWith(
                    'https://mock.rxresume.test/api/resume/resume-123',
                    expect.objectContaining({
                        method: 'DELETE',
                        headers: expect.objectContaining({
                            Authorization: 'Bearer mock-token',
                        }),
                    })
                );
            });

            it('completes successfully on 204 No Content', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: false, // 204 is technically not "ok" in some implementations
                    status: 204,
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.delete('resume-123', 'mock-token')).resolves.toBeUndefined();
            });

            it('throws error on delete failure', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: false,
                    status: 403,
                    text: async () => 'Forbidden',
                });
                vi.stubGlobal('fetch', mockFetch);

                await expect(client.delete('resume-123', 'mock-token')).rejects.toThrow(
                    'Delete failed: HTTP 403'
                );
            });

            it('encodes resume ID in URL', async () => {
                const mockFetch = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                });
                vi.stubGlobal('fetch', mockFetch);

                await client.delete('resume/with/slashes', 'mock-token');

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://mock.rxresume.test/api/resume/resume%2Fwith%2Fslashes',
                    expect.any(Object)
                );
            });
        });
    });

    describe('default baseURL', () => {
        it('uses https://v4.rxresu.me by default', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ accessToken: 'token' }),
            });
            vi.stubGlobal('fetch', mockFetch);

            const client = new RxResumeClient();
            await client.login('test@example.com', 'password');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://v4.rxresu.me/api/auth/login',
                expect.any(Object)
            );

            vi.unstubAllGlobals();
        });
    });
});
