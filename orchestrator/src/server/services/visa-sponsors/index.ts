/**
 * UK Visa Sponsors Service
 * 
 * Manages downloading, storing, and searching the UK visa sponsor list.
 */

import fs from 'fs';
import path from 'path';
import { getDataDir } from '../../config/dataDir.js';

const DATA_DIR = path.join(getDataDir(), 'visa-sponsors');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface VisaSponsor {
  organisationName: string;
  townCity: string;
  county: string;
  typeRating: string;
  route: string;
}

export interface VisaSponsorSearchResult {
  sponsor: VisaSponsor;
  score: number;
  matchedName: string;
}

export interface VisaSponsorStatus {
  lastUpdated: string | null;
  csvPath: string | null;
  totalSponsors: number;
  isUpdating: boolean;
  nextScheduledUpdate: string | null;
  error: string | null;
}

// Common company suffixes to strip during comparison
const COMPANY_SUFFIXES = [
  'limited', 'ltd', 'llp', 'plc', 'inc', 'incorporated',
  'corporation', 'corp', 'company', 'co', 'llc',
  'uk', 'international', 'intl', 'group', 'holdings',
  't/a', 'trading as', '&', 'the'
];

// Cache for loaded sponsors
let sponsorsCache: VisaSponsor[] | null = null;
let cacheLoadedAt: Date | null = null;
let isUpdating = false;
let updateError: string | null = null;

/**
 * Normalize a company name for comparison (strips suffixes, punctuation, etc.)
 */
export function normalizeCompanyName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Remove common punctuation and special chars
  normalized = normalized.replace(/[.,'"()[\]{}!?@#$%^&*+=|\\/<>:;`~]/g, ' ');

  // Remove suffixes
  for (const suffix of COMPANY_SUFFIXES) {
    // Word boundary matching
    const regex = new RegExp(`\\b${suffix}\\b`, 'gi');
    normalized = normalized.replace(regex, '');
  }

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Calculate similarity score between two strings (0-100)
 * Uses Levenshtein distance with some optimizations
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const longerLen = Math.max(s1.length, s2.length);
    const shorterLen = Math.min(s1.length, s2.length);
    return Math.round((shorterLen / longerLen) * 100);
  }

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);

  return Math.round(((maxLen - distance) / maxLen) * 100);
}

/**
 * Parse CSV content into VisaSponsor array
 */
export function parseCsv(content: string): VisaSponsor[] {
  const lines = content.split('\n');
  const sponsors: VisaSponsor[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV with proper quote handling
    const fields = parseCSVLine(line);
    if (fields.length >= 5) {
      sponsors.push({
        organisationName: fields[0] || '',
        townCity: fields[1] || '',
        county: fields[2] || '',
        typeRating: fields[3] || '',
        route: fields[4] || '',
      });
    }
  }

  return sponsors;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Get list of CSV files sorted by date (newest first)
 */
function getCsvFiles(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];

  return fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.csv'))
    .sort()
    .reverse();
}

/**
 * Get metadata file path
 */
function getMetadataPath(): string {
  return path.join(DATA_DIR, 'metadata.json');
}

/**
 * Read metadata
 */
function readMetadata(): { lastUpdated: string | null; csvFile: string | null } {
  const metaPath = getMetadataPath();
  if (!fs.existsSync(metaPath)) {
    return { lastUpdated: null, csvFile: null };
  }
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return { lastUpdated: null, csvFile: null };
  }
}

/**
 * Write metadata
 */
function writeMetadata(data: { lastUpdated: string; csvFile: string }): void {
  fs.writeFileSync(getMetadataPath(), JSON.stringify(data, null, 2));
}

/**
 * Clean up old CSV files (keep only 2)
 */
function cleanupOldCsvFiles(): void {
  const files = getCsvFiles();
  if (files.length > 2) {
    for (const file of files.slice(2)) {
      const filePath = path.join(DATA_DIR, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Removed old visa sponsor CSV: ${file}`);
      } catch (err) {
        console.warn(`⚠️ Failed to remove old CSV: ${file}`, err);
      }
    }
  }
}

/**
 * Extract the CSV download URL from the gov.uk page
 */
async function extractCsvUrl(): Promise<string> {
  const pageUrl = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';

  console.log('📄 Fetching gov.uk page to find CSV link...');
  const response = await fetch(pageUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch gov.uk page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Look for the Worker and Temporary Worker CSV link
  const csvMatch = html.match(
    /href="(https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"]+Worker_and_Temporary_Worker\.csv)"/
  );

  if (!csvMatch) {
    throw new Error('Could not find Worker and Temporary Worker CSV link on gov.uk page');
  }

  return csvMatch[1];
}

/**
 * Download the latest visa sponsor CSV
 */
export async function downloadLatestCsv(): Promise<{ success: boolean; message: string }> {
  if (isUpdating) {
    return { success: false, message: 'Update already in progress' };
  }

  isUpdating = true;
  updateError = null;

  try {
    // Extract the CSV URL from the page
    const csvUrl = await extractCsvUrl();
    console.log(`📥 Downloading CSV from: ${csvUrl}`);

    const response = await fetch(csvUrl);

    if (!response.ok) {
      throw new Error(`Failed to download CSV: ${response.status} ${response.statusText}`);
    }

    const csvContent = await response.text();

    // Validate CSV has content
    const sponsors = parseCsv(csvContent);
    if (sponsors.length === 0) {
      throw new Error('Downloaded CSV appears to be empty or invalid');
    }

    // Generate filename with date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `visa_sponsors_${dateStr}.csv`;
    const filepath = path.join(DATA_DIR, filename);

    // Save the CSV
    fs.writeFileSync(filepath, csvContent);

    // Update metadata
    writeMetadata({
      lastUpdated: new Date().toISOString(),
      csvFile: filename,
    });

    // Cleanup old files
    cleanupOldCsvFiles();

    // Clear cache so next search loads new data
    sponsorsCache = null;
    cacheLoadedAt = null;

    console.log(`✅ Downloaded visa sponsor list: ${sponsors.length} sponsors`);

    return {
      success: true,
      message: `Successfully downloaded ${sponsors.length} sponsors`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    updateError = message;
    console.error('❌ Failed to download visa sponsor list:', message);
    return { success: false, message };
  } finally {
    isUpdating = false;
  }
}

/**
 * Load sponsors from the latest CSV file
 */
export function loadSponsors(): VisaSponsor[] {
  // Return cache if valid (less than 1 hour old)
  if (sponsorsCache && cacheLoadedAt) {
    const cacheAge = Date.now() - cacheLoadedAt.getTime();
    if (cacheAge < 60 * 60 * 1000) {
      return sponsorsCache;
    }
  }

  const metadata = readMetadata();
  if (!metadata.csvFile) {
    return [];
  }

  const csvPath = path.join(DATA_DIR, metadata.csvFile);
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(csvPath, 'utf-8');
    sponsorsCache = parseCsv(content);
    cacheLoadedAt = new Date();
    return sponsorsCache;
  } catch (error) {
    console.error('Failed to load sponsors:', error);
    return [];
  }
}

/**
 * Search for sponsors by company name
 */
export function searchSponsors(
  query: string,
  options: { limit?: number; minScore?: number } = {}
): VisaSponsorSearchResult[] {
  const { limit = 50, minScore = 30 } = options;

  const sponsors = loadSponsors();
  if (sponsors.length === 0 || !query.trim()) {
    return [];
  }

  const normalizedQuery = normalizeCompanyName(query);
  const results: VisaSponsorSearchResult[] = [];
  const seen = new Set<string>(); // Dedupe by org name

  for (const sponsor of sponsors) {
    // Skip if we've already seen this org name
    if (seen.has(sponsor.organisationName)) continue;
    seen.add(sponsor.organisationName);

    const normalizedSponsor = normalizeCompanyName(sponsor.organisationName);

    // Calculate similarity
    const score = calculateSimilarity(normalizedQuery, normalizedSponsor);

    if (score >= minScore) {
      results.push({
        sponsor,
        score,
        matchedName: normalizedSponsor,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

/**
 * Calculate match summary from search results
 */
export function calculateSponsorMatchSummary(
  results: VisaSponsorSearchResult[]
): { sponsorMatchScore: number; sponsorMatchNames: string | null } {
  if (results.length === 0) {
    return { sponsorMatchScore: 0, sponsorMatchNames: null };
  }

  const topScore = results[0].score;
  // Get all 100% matches, or just the top match
  const perfectMatches = results.filter(r => r.score === 100);
  const matchesToReport = perfectMatches.length >= 2
    ? perfectMatches.slice(0, 2)
    : [results[0]];

  return {
    sponsorMatchScore: topScore,
    sponsorMatchNames: JSON.stringify(matchesToReport.map(r => r.sponsor.organisationName)),
  };
}

/**
 * Get status of the visa sponsor service
 */
export function getStatus(): VisaSponsorStatus {
  const metadata = readMetadata();
  const sponsors = loadSponsors();

  return {
    lastUpdated: metadata.lastUpdated,
    csvPath: metadata.csvFile ? path.join(DATA_DIR, metadata.csvFile) : null,
    totalSponsors: sponsors.length,
    isUpdating,
    nextScheduledUpdate: getNextScheduledUpdate(),
    error: updateError,
  };
}

/**
 * Get all entries for a specific organization (they may have multiple routes)
 */
export function getOrganizationDetails(organisationName: string): VisaSponsor[] {
  const sponsors = loadSponsors();
  return sponsors.filter(s => s.organisationName === organisationName);
}

// ============================================================================
// Scheduled Updates (Cron-style)
// ============================================================================

let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
let nextScheduledUpdateTime: Date | null = null;

/**
 * Calculate the next update time (default: 2 AM daily)
 */
function calculateNextUpdateTime(hour = 2): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  // If we've passed the time today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Get the next scheduled update time as ISO string
 */
function getNextScheduledUpdate(): string | null {
  return nextScheduledUpdateTime?.toISOString() || null;
}

/**
 * Schedule the next update
 */
function scheduleNextUpdate(hour = 2): void {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
  }

  nextScheduledUpdateTime = calculateNextUpdateTime(hour);
  const delay = nextScheduledUpdateTime.getTime() - Date.now();

  console.log(`⏰ Next visa sponsor update scheduled for: ${nextScheduledUpdateTime.toISOString()}`);

  scheduledTimer = setTimeout(async () => {
    console.log('🔄 Running scheduled visa sponsor update...');
    await downloadLatestCsv();
    scheduleNextUpdate(hour); // Schedule the next one
  }, delay);
}

/**
 * Start the scheduler
 */
export function startScheduler(hour = 2): void {
  console.log('🚀 Starting visa sponsor update scheduler...');
  scheduleNextUpdate(hour);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
    nextScheduledUpdateTime = null;
    console.log('⏹️ Stopped visa sponsor update scheduler');
  }
}

/**
 * Initialize the service (download if no data exists)
 */
export async function initialize(): Promise<void> {
  const metadata = readMetadata();

  if (!metadata.csvFile) {
    console.log('📥 No visa sponsor data found, downloading...');
    await downloadLatestCsv();
  } else {
    const sponsors = loadSponsors();
    console.log(`✅ Visa sponsor service initialized with ${sponsors.length} sponsors`);
  }

  // Start the scheduler for automatic daily updates at 2 AM
  startScheduler(2);
}
