import { Router, Request, Response } from 'express';
import { extractProjectsFromProfile } from '../../services/resumeProjects.js';
import { getProfile, clearProfileCache } from '../../services/profile.js';
import { getSetting } from '../../repositories/settings.js';
import { getResume, RxResumeCredentialsError } from '../../services/rxresume-v4.js';

export const profileRouter = Router();

/**
 * GET /api/profile/projects - Get all projects available in the base resume
 */
profileRouter.get('/projects', async (req: Request, res: Response) => {
  try {
    const profile = await getProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    res.json({ success: true, data: catalog });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/profile - Get the full base resume profile
 */
profileRouter.get('/', async (req: Request, res: Response) => {
  try {
    const profile = await getProfile();
    res.json({ success: true, data: profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/profile/status - Check if base resume is configured and accessible
 */
profileRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const rxresumeBaseResumeId = await getSetting('rxresumeBaseResumeId');

    if (!rxresumeBaseResumeId) {
      res.json({
        success: true,
        data: {
          exists: false,
          error: 'No base resume selected. Please select a resume from your RxResume account in Settings.'
        }
      });
      return;
    }

    // Verify the resume is accessible
    try {
      const resume = await getResume(rxresumeBaseResumeId);
      if (!resume.data || typeof resume.data !== 'object') {
        res.json({
          success: true,
          data: {
            exists: false,
            error: 'Selected resume is empty or invalid.'
          }
        });
        return;
      }

      res.json({ success: true, data: { exists: true, error: null } });
    } catch (error) {
      if (error instanceof RxResumeCredentialsError) {
        res.json({
          success: true,
          data: {
            exists: false,
            error: 'RxResume credentials not configured.'
          }
        });
        return;
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.json({ success: true, data: { exists: false, error: message } });
  }
});

/**
 * POST /api/profile/refresh - Clear profile cache and refetch from RxResume v4 API
 */
profileRouter.post('/refresh', async (_req: Request, res: Response) => {
  try {
    clearProfileCache();
    const profile = await getProfile(true);
    res.json({ success: true, data: profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});
