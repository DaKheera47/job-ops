import {
  createLaunchOptions,
  isChallengePage,
  loadCookies,
  readPageContentIfReady,
  saveCookies,
} from "browser-utils";
import {
  type Browser,
  type BrowserContext,
  firefox,
  type Page,
} from "playwright";

export interface BrowserPageResult {
  status: number;
  html: string;
  challenged: boolean;
}

type ViewerLease = { display?: string; release: () => void };

export class HiringCafeBrowserPages {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private viewerLease: ViewerLease | null = null;
  private headed = false;
  private pendingUrl: string | null = null;

  constructor(
    private readonly options: {
      cookieStorageDir: string;
      promoteToHeaded: () => Promise<ViewerLease | null>;
      allowedOrigin?: string;
      initialHeadless?: boolean;
    },
  ) {}

  private validateUrl(url: string): void {
    const parsed = new URL(url);
    const origin = this.options.allowedOrigin ?? "https://hiringcafe.com";
    if (
      parsed.origin !== origin ||
      !(parsed.pathname === "/" || /^\/job\/[^/]+$/.test(parsed.pathname))
    ) {
      throw new Error(
        "Hiring Cafe browser navigation is limited to search and job pages",
      );
    }
  }

  private async launch(headless: boolean, display?: string): Promise<void> {
    const { launchOptions } = await createLaunchOptions({ headless });
    const browser = await firefox.launch({
      ...launchOptions,
      ...(display ? { env: { ...process.env, DISPLAY: display } } : {}),
    });
    try {
      const context = await browser.newContext();
      await loadCookies(context, "hiringcafe", this.options.cookieStorageDir);
      const page = await context.newPage();
      this.browser = browser;
      this.context = context;
      this.page = page;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  private async navigate(url: string): Promise<BrowserPageResult> {
    if (!this.page) throw new Error("Hiring Cafe browser page is unavailable");
    const response = await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const html = await this.page.content();
    const challenged = await isChallengePage(this.page);
    return { status: response?.status() ?? 0, html, challenged };
  }

  async read(url: string): Promise<BrowserPageResult> {
    this.validateUrl(url);
    if (!this.page) {
      const headless = this.options.initialHeadless !== false;
      await this.launch(headless);
      this.headed = !headless;
    }
    let result = await this.navigate(url);
    if (result.challenged && !this.headed) {
      const lease = await this.options.promoteToHeaded();
      if (!lease) {
        this.pendingUrl = url;
        return result;
      }
      await this.browser?.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.viewerLease = lease;
      try {
        await this.launch(false, this.viewerLease.display);
      } catch (error) {
        this.viewerLease.release();
        this.viewerLease = null;
        throw error;
      }
      this.headed = true;
      result = await this.navigate(url);
    }
    this.pendingUrl = result.challenged ? url : null;
    return result;
  }

  canWaitForChallenge(url: string): boolean {
    return this.pendingUrl === url && this.headed && this.page !== null;
  }

  async waitForChallenge(
    url: string,
    timeoutMs: number,
  ): Promise<"clear" | "timeout"> {
    this.validateUrl(url);
    if (!this.page || this.pendingUrl !== url || !this.headed) {
      throw new Error("No matching Hiring Cafe browser challenge is open");
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!(await isChallengePage(this.page))) {
        const html = await readPageContentIfReady(this.page);
        if (html === null) {
          await this.page.waitForTimeout(1_000);
          continue;
        }
        let parseable = false;
        try {
          const json = html.match(
            /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
          )?.[1];
          const data = JSON.parse(json ?? "null") as {
            props?: { pageProps?: { ssrHits?: unknown; job?: unknown } };
          } | null;
          const props = data?.props?.pageProps;
          parseable = new URL(url).pathname.startsWith("/job/")
            ? Boolean(props?.job)
            : Array.isArray(props?.ssrHits);
        } catch {
          // Wait for the actual SSR page, not a navigation intermediary.
        }
        if (parseable) {
          this.pendingUrl = null;
          if (this.context) {
            try {
              await saveCookies(
                this.context,
                "hiringcafe",
                this.options.cookieStorageDir,
              );
            } catch {
              // A usable page completes Solve even when persistence fails.
            }
          }
          return "clear";
        }
      }
      await this.page.waitForTimeout(1_000);
    }
    return "timeout";
  }

  async close(): Promise<void> {
    this.pendingUrl = null;
    this.page = null;
    this.context = null;
    try {
      await this.browser?.close();
    } finally {
      this.browser = null;
      this.viewerLease?.release();
      this.viewerLease = null;
    }
  }
}
