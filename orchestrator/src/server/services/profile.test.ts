import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProfile, clearProfileCache } from './profile.js';

// Mock the dependencies
vi.mock('../repositories/settings.js', () => ({
    getSetting: vi.fn(),
}));

vi.mock('./rxresume-v4.js', () => ({
    getResume: vi.fn(),
    RxResumeCredentialsError: class RxResumeCredentialsError extends Error {
        constructor() {
            super('RxResume credentials not configured.');
            this.name = 'RxResumeCredentialsError';
        }
    },
}));

import { getSetting } from '../repositories/settings.js';
import { getResume, RxResumeCredentialsError } from './rxresume-v4.js';

describe('getProfile', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        clearProfileCache();
    });

    it('should throw an error if rxresumeBaseResumeId is not configured', async () => {
        vi.mocked(getSetting).mockResolvedValue(null);

        await expect(getProfile()).rejects.toThrow(
            'Base resume not configured. Please select a base resume from your RxResume account in Settings.'
        );
    });

    it('should fetch profile from RxResume v4 API when configured', async () => {
        const mockResumeData = { basics: { name: 'Test User' } };
        vi.mocked(getSetting).mockResolvedValue('test-resume-id');
        vi.mocked(getResume).mockResolvedValue({
            id: 'test-resume-id',
            data: mockResumeData
        } as any);

        const profile = await getProfile();

        expect(getSetting).toHaveBeenCalledWith('rxresumeBaseResumeId');
        expect(getResume).toHaveBeenCalledWith('test-resume-id');
        expect(profile).toEqual(mockResumeData);
    });

    it('should cache the profile and not refetch on subsequent calls', async () => {
        const mockResumeData = { basics: { name: 'Test User' } };
        vi.mocked(getSetting).mockResolvedValue('test-resume-id');
        vi.mocked(getResume).mockResolvedValue({
            id: 'test-resume-id',
            data: mockResumeData
        } as any);

        await getProfile();
        await getProfile();

        // getSetting is called each time to check resumeId
        expect(getSetting).toHaveBeenCalledTimes(2);
        // But getResume should only be called once due to caching
        expect(getResume).toHaveBeenCalledTimes(1);
    });

    it('should refetch when forceRefresh is true', async () => {
        const mockResumeData = { basics: { name: 'Test User' } };
        vi.mocked(getSetting).mockResolvedValue('test-resume-id');
        vi.mocked(getResume).mockResolvedValue({
            id: 'test-resume-id',
            data: mockResumeData
        } as any);

        await getProfile();
        await getProfile(true);

        expect(getResume).toHaveBeenCalledTimes(2);
    });

    it('should throw user-friendly error on credential issues', async () => {
        vi.mocked(getSetting).mockResolvedValue('test-resume-id');
        vi.mocked(getResume).mockRejectedValue(new RxResumeCredentialsError());

        await expect(getProfile()).rejects.toThrow(
            'RxResume credentials not configured. Set RXRESUME_EMAIL and RXRESUME_PASSWORD in settings.'
        );
    });

    it('should throw error if resume data is empty', async () => {
        vi.mocked(getSetting).mockResolvedValue('test-resume-id');
        vi.mocked(getResume).mockResolvedValue({
            id: 'test-resume-id',
            data: null
        } as any);

        await expect(getProfile()).rejects.toThrow('Resume data is empty or invalid');
    });
});
