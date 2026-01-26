/**
 * Service for syncing with Notion.
 */

export interface NotionSyncResult {
  success: boolean;
  pageId?: string;
  error?: string;
}

/**
 * Create a job entry in Notion.
 *
 * This is a placeholder - implement based on your Notion setup.
 */
export async function createNotionEntry(job: {
  id: string;
  title: string;
  employer: string;
  applicationLink: string | null;
  deadline: string | null;
  salary: string | null;
  location: string | null;
  pdfPath: string | null;
  appliedAt: string;
}): Promise<NotionSyncResult> {
  const notionApiKey = process.env.NOTION_API_KEY;
  const notionDatabaseId = process.env.NOTION_DATABASE_ID;

  if (!notionApiKey || !notionDatabaseId) {
    console.log("ℹ️ Notion API not configured, skipping sync");
    return { success: true, pageId: undefined };
  }

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: notionDatabaseId },
        properties: {
          // Customize these based on your Notion database schema
          Name: {
            title: [{ text: { content: `${job.title} @ ${job.employer}` } }],
          },
          Company: {
            rich_text: [{ text: { content: job.employer } }],
          },
          "Application Link": job.applicationLink
            ? {
                url: job.applicationLink,
              }
            : undefined,
          Deadline: job.deadline
            ? {
                date: { start: job.deadline },
              }
            : undefined,
          Salary: job.salary
            ? {
                rich_text: [{ text: { content: job.salary } }],
              }
            : undefined,
          Location: job.location
            ? {
                rich_text: [{ text: { content: job.location } }],
              }
            : undefined,
          "Applied Date": {
            date: { start: job.appliedAt },
          },
          Status: {
            status: { name: "Applied" },
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Notion API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    console.log(`✅ Created Notion entry: ${data.id}`);
    return { success: true, pageId: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Notion sync failed: ${message}`);
    return { success: false, error: message };
  }
}
