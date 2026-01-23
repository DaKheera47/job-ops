/**
 * Service for generating PDF resumes using RxResume v4 API.
 */

import { join } from 'path';
import { mkdir, access } from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { createId } from '@paralleldrive/cuid2';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

import { getSetting } from '../repositories/settings.js';
import { pickProjectIdsForJob } from './projectSelection.js';
import { extractProjectsFromProfile, resolveResumeProjectsSettings } from './resumeProjects.js';
import { getDataDir } from '../config/dataDir.js';
import { getProfile } from './profile.js';
import { RxResumeClient } from './rxresume-client.js';

const OUTPUT_DIR = join(getDataDir(), 'pdfs');

export interface PdfResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
}

export interface TailoredPdfContent {
  summary?: string | null;
  headline?: string | null;
  skills?: any | null; // Accept any for flexibility, expected to be items array or parsed JSON
}

/**
 * Get RxResume credentials from environment variables or database settings.
 */
async function getCredentials(): Promise<{ email: string; password: string; baseUrl: string }> {
  // First check environment variables
  let email = process.env.RXRESUME_EMAIL || '';
  let password = process.env.RXRESUME_PASSWORD || '';
  const baseUrl = process.env.RXRESUME_URL || 'https://v4.rxresu.me';

  // Fall back to database settings if env vars are not set
  if (!email) {
    email = (await getSetting('rxresumeEmail')) || '';
  }
  if (!password) {
    password = (await getSetting('rxresumePassword')) || '';
  }

  if (!email || !password) {
    throw new Error(
      'RxResume credentials not configured. Set RXRESUME_EMAIL and RXRESUME_PASSWORD environment variables or configure them in settings.'
    );
  }

  return { email, password, baseUrl };
}

/**
 * Download a file from a URL and save it to a local path.
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: HTTP ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body from PDF download');
  }

  // Convert Web ReadableStream to Node readable
  const nodeReadable = Readable.fromWeb(response.body as any);
  const fileStream = createWriteStream(outputPath);

  await pipeline(nodeReadable, fileStream);
}

/**
 * Generate a tailored PDF resume for a job using the RxResume v4 API.
 * 
 * Flow:
 * 1. Prepare resume data with tailored content and project selection
 * 2. Get auth token (uses cached token or logs in)
 * 3. Import/create resume on RxResume
 * 4. Request print to get PDF URL
 * 5. Download PDF locally
 * 6. Delete temporary resume from RxResume
 * 
 * Token refresh is handled automatically on 401 errors.
 */
export async function generatePdf(
  jobId: string,
  tailoredContent: TailoredPdfContent,
  jobDescription: string,
  _baseResumePath?: string, // Deprecated: now always uses getProfile() which fetches from v4 API
  selectedProjectIds?: string | null
): Promise<PdfResult> {
  console.log(`📄 Generating PDF for job ${jobId} using RxResume v4 API...`);

  try {
    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
      await mkdir(OUTPUT_DIR, { recursive: true });
    }

    // Get credentials and initialize client
    const { email, password, baseUrl } = await getCredentials();
    const client = new RxResumeClient(baseUrl);

    // Read base resume from profile (fetches from v4 API if configured)
    const baseResume = JSON.parse(JSON.stringify(await getProfile()));

    // Sanitize skills: Ensure all skills have required schema fields (visible, description, id, level, keywords)
    // This fixes issues where the base JSON uses a shorthand format (missing required fields)
    if (baseResume.sections?.skills?.items && Array.isArray(baseResume.sections.skills.items)) {
      baseResume.sections.skills.items = baseResume.sections.skills.items.map((skill: any) => ({
        ...skill,
        id: skill.id || createId(),
        visible: skill.visible ?? true,
        // Zod schema requires string, default to empty string if missing
        description: skill.description ?? '',
        level: skill.level ?? 1,
        keywords: skill.keywords || [],
      }));
    }

    // Inject tailored summary
    if (tailoredContent.summary) {
      if (baseResume.sections?.summary) {
        baseResume.sections.summary.content = tailoredContent.summary;
      } else if (baseResume.basics?.summary) {
        baseResume.basics.summary = tailoredContent.summary;
      }
    }

    // Inject tailored headline
    if (tailoredContent.headline) {
      if (baseResume.basics) {
        baseResume.basics.headline = tailoredContent.headline;
        baseResume.basics.label = tailoredContent.headline;
      }
    }

    // Inject tailored skills
    if (tailoredContent.skills) {
      const newSkills = Array.isArray(tailoredContent.skills)
        ? tailoredContent.skills
        : typeof tailoredContent.skills === 'string'
          ? JSON.parse(tailoredContent.skills)
          : null;

      if (newSkills && baseResume.sections?.skills) {
        // Ensure each skill item has required schema fields
        const existingSkills = baseResume.sections.skills.items || [];
        const skillsWithSchema = newSkills.map((newSkill: any) => {
          // Try to find matching existing skill to preserve id and other fields
          const existing = existingSkills.find((s: any) => s.name === newSkill.name);

          return {
            id: newSkill.id || existing?.id || createId(),
            visible: newSkill.visible !== undefined ? newSkill.visible : (existing?.visible ?? true),
            name: newSkill.name || existing?.name || '',
            description: newSkill.description !== undefined ? newSkill.description : (existing?.description || ''),
            level: newSkill.level !== undefined ? newSkill.level : (existing?.level ?? 1),
            keywords: newSkill.keywords || existing?.keywords || [],
          };
        });

        baseResume.sections.skills.items = skillsWithSchema;
      }
    }

    // Select projects and set visibility
    try {
      let selectedSet: Set<string>;

      if (selectedProjectIds) {
        selectedSet = new Set(selectedProjectIds.split(',').map(s => s.trim()).filter(Boolean));
      } else {
        const { catalog, selectionItems } = extractProjectsFromProfile(baseResume);
        const overrideResumeProjectsRaw = await getSetting('resumeProjects');
        const { resumeProjects } = resolveResumeProjectsSettings({ catalog, overrideRaw: overrideResumeProjectsRaw });

        const locked = resumeProjects.lockedProjectIds;
        const desiredCount = Math.max(0, resumeProjects.maxProjects - locked.length);
        const eligibleSet = new Set(resumeProjects.aiSelectableProjectIds);
        const eligibleProjects = selectionItems.filter((p) => eligibleSet.has(p.id));

        const picked = await pickProjectIdsForJob({
          jobDescription,
          eligibleProjects,
          desiredCount,
        });

        selectedSet = new Set([...locked, ...picked]);
      }

      const projectsSection = baseResume.sections?.projects;
      const projectItems = projectsSection?.items;
      if (Array.isArray(projectItems)) {
        for (const item of projectItems) {
          if (!item || typeof item !== 'object') continue;
          const id = typeof (item as any).id === 'string' ? (item as any).id : '';
          if (!id) continue;
          (item as any).visible = selectedSet.has(id);
        }
        projectsSection.visible = selectedSet.size > 0;
      }
    } catch (err) {
      console.warn(`   ⚠️ Project visibility step failed for job ${jobId}:`, err);
    }

    // Use withAutoRefresh to handle token caching and 401 retry automatically
    const outputPath = join(OUTPUT_DIR, `resume_${jobId}.pdf`);

    await client.withAutoRefresh(email, password, async (token) => {
      let resumeId: string | null = null;

      try {
        // Create resume on RxResume
        console.log(`   📤 Uploading resume to RxResume...`);
        resumeId = await client.create(baseResume, token);
        console.log(`   ✅ Resume created with ID: ${resumeId}`);

        // Get PDF URL
        console.log(`   🖨️ Requesting PDF generation...`);
        const pdfUrl = await client.print(resumeId, token);
        console.log(`   ✅ PDF URL received: ${pdfUrl}`);

        // Download PDF
        console.log(`   📥 Downloading PDF...`);
        await downloadFile(pdfUrl, outputPath);
        console.log(`   ✅ PDF saved to: ${outputPath}`);

        // Cleanup: delete temporary resume from RxResume
        console.log(`   🧹 Cleaning up temporary resume...`);
        await client.delete(resumeId, token);
        console.log(`   ✅ Temporary resume deleted from RxResume`);
        resumeId = null;
      } finally {
        // Attempt cleanup if resume was created but not deleted
        if (resumeId) {
          try {
            console.log(`   🧹 Attempting cleanup of orphaned resume...`);
            await client.delete(resumeId, token);
          } catch {
            console.warn(`   ⚠️ Failed to cleanup orphaned resume ${resumeId}`);
          }
        }
      }
    });

    console.log(`✅ PDF generated successfully: ${outputPath}`);
    return { success: true, pdfPath: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ PDF generation failed: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Check if a PDF exists for a job.
 */
export async function pdfExists(jobId: string): Promise<boolean> {
  const pdfPath = join(OUTPUT_DIR, `resume_${jobId}.pdf`);
  try {
    await access(pdfPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to a job's PDF.
 */
export function getPdfPath(jobId: string): string {
  return join(OUTPUT_DIR, `resume_${jobId}.pdf`);
}
