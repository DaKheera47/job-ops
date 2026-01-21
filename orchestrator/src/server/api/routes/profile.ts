import { Router, Request, Response } from 'express';
import { extractProjectsFromProfile } from '../../services/resumeProjects.js';
import { getProfile } from '../../services/profile.js';

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
