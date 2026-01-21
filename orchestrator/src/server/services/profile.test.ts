
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'fs/promises';
import { getProfile } from './profile.js';

vi.mock('fs/promises', async () => {
    const fn = vi.fn();
    return {
        readFile: fn,
        default: {
            readFile: fn
        }
    };
});

describe('getProfile failure', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should throw an error if the profile file does not exist', async () => {
        vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: no such file or directory'));

        await expect(getProfile('/non/existent/path.json', true)).rejects.toThrow('ENOENT: no such file or directory');
    });

    it('should throw an error if the profile file is invalid JSON', async () => {
        vi.mocked(readFile).mockResolvedValue('invalid json');

        await expect(getProfile('/invalid/json.json', true)).rejects.toThrow();
    });
});
