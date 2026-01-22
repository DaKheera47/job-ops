/**
 * Service for generating PDF resumes using RXResume.
 * Wraps the existing Python rxresume_automation.py script.
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, mkdir, access, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { createId } from '@paralleldrive/cuid2';

import { getSetting } from '../repositories/settings.js';
import { pickProjectIdsForJob } from './projectSelection.js';
import { extractProjectsFromProfile, resolveResumeProjectsSettings } from './resumeProjects.js';
import { getDataDir } from '../config/dataDir.js';
import { getProfile } from './profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths - can be overridden via env for Docker
const RESUME_GEN_DIR = process.env.RESUME_GEN_DIR || join(__dirname, '../../../../resume-generator');
const OUTPUT_DIR = join(getDataDir(), 'pdfs');

export interface PdfResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
}

export interface TailoredPdfContent {
  summary?: string | null;
  headline?: string | null;
  skills?: any | null;  // Accept any for flexibility, expected to be items array or parsed JSON
}

/**
 * Generate a tailored PDF resume for a job.
 * 
 * @param jobId - Unique job identifier
 * @param tailoredContent - Content to inject (summary, headline, skills)
 * @param jobDescription - Job description (for project selection)
 * @param baseResumePath - Optional path to base JSON
 * @param selectedProjectIds - Optional overrides
 */
export async function generatePdf(
  jobId: string,
  tailoredContent: TailoredPdfContent,
  jobDescription: string,
  baseResumePath?: string,
  selectedProjectIds?: string | null
): Promise<PdfResult> {
  console.log(`📄 Generating PDF for job ${jobId}...`);

  const resumeJsonPath = baseResumePath || join(RESUME_GEN_DIR, 'base.json');

  try {
    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
      await mkdir(OUTPUT_DIR, { recursive: true });
    }

    // Read base resume
    const baseResume = baseResumePath
      ? JSON.parse(await readFile(baseResumePath, 'utf-8'))
      : JSON.parse(JSON.stringify(await getProfile())); // Deep copy from cache

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
        // Support both standard JSON Resume 'label' and RxResume 'headline'
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

    // Select projects (manual override OR locked + AI-picked) and set visibility for RXResume
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

      const projectsSection = (baseResume as any)?.sections?.projects;
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

    // Write modified resume to temp file
    const tempResumePath = join(RESUME_GEN_DIR, `temp_resume_${jobId}.json`);
    await writeFile(tempResumePath, JSON.stringify(baseResume, null, 2));

    // Generate PDF using Python script - output directly to our data folder
    const outputFilename = `resume_${jobId}.pdf`;
    const outputPath = join(OUTPUT_DIR, outputFilename);

    // Ensure regeneration overwrites the old file if it exists.
    try {
      await unlink(outputPath);
    } catch {
      // Ignore if it doesn't exist or cannot be removed.
    }

    await runPythonPdfGenerator(tempResumePath, outputFilename, OUTPUT_DIR);

    // Cleanup temp file
    try {
      const { unlink } = await import('fs/promises');
      await unlink(tempResumePath);
    } catch {
      // Ignore cleanup errors
    }

    console.log(`✅ PDF generated: ${outputPath}`);
    return { success: true, pdfPath: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ PDF generation failed: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Run the Python RXResume automation script.
 */
async function runPythonPdfGenerator(
  jsonPath: string,
  outputFilename: string,
  outputDir: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use the virtual environment's Python (or system python in Docker)
    const pythonPath = process.env.PYTHON_PATH || join(RESUME_GEN_DIR, '.venv', 'bin', 'python');

    const child = spawn(pythonPath, ['rxresume_automation.py'], {
      cwd: RESUME_GEN_DIR,
      env: {
        ...process.env,
        RESUME_JSON_PATH: jsonPath,
        OUTPUT_FILENAME: outputFilename,
        OUTPUT_DIR: outputDir,
      },
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Python script exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
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
