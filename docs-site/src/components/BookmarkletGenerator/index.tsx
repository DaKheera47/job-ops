import { useEffect, useId, useRef, useState } from "react";
import styles from "./styles.module.css";

type NormalizedHostResult = {
  normalizedHost: string;
  warning: string;
};

function normalizeHost(rawValue: string): NormalizedHostResult {
  const trimmed = rawValue.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return { normalizedHost: "", warning: "" };
  }

  try {
    const url = new URL(trimmed);
    let warning = "";

    // In local development the browser app runs on :5173, but cross-origin
    // bookmarklets need to call the backend API server directly on :3001.
    if (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.port === "5173"
    ) {
      url.port = "3001";
      warning =
        "Local development detected: using the backend API origin on :3001 instead of the Vite client on :5173.";
    }

    return { normalizedHost: url.origin, warning };
  } catch {
    return { normalizedHost: "", warning: "" };
  }
}

function buildBookmarklet(host: string, token: string): string {
  if (!host) return "";

  const payload = JSON.stringify({
    host,
    token: token.trim(),
  });

  return `javascript:(async()=>{const c=${payload};const h={'Content-Type':'application/json'};if(c.token)h.Authorization='Bearer '+c.token;try{const r=await fetch(c.host+'/api/manual-jobs/ingest',{method:'POST',headers:h,body:JSON.stringify({url:window.location.href})});let b=null;try{b=await r.json()}catch{}if(r.ok&&b&&b.ok){const i=b.data&&b.data.ingestion;alert(i&&i.movedToReady===false?'Job captured in JobOps, but it still needs follow-up in the app.':'Job captured in JobOps.')}else if(r.status===401||r.status===403){alert('JobOps rejected the request. Check your host and Bearer token.')}else{const m=b&&b.error&&b.error.message?b.error.message:'Request failed.';alert('JobOps could not ingest this page. '+m)}}catch{alert('Could not reach JobOps. Check the host, network access, and CORS settings.')}})();`;
}

export default function BookmarkletGenerator() {
  const hostId = useId();
  const tokenId = useId();
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const [hostInput, setHostInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const { normalizedHost, warning } = normalizeHost(hostInput);
  const bookmarklet = buildBookmarklet(normalizedHost, tokenInput);
  const hostIsInvalid = hostInput.trim().length > 0 && normalizedHost.length === 0;

  useEffect(() => {
    if (!linkRef.current) return;
    if (!bookmarklet) {
      linkRef.current.removeAttribute("href");
      return;
    }

    // React blocks javascript: href props, so set the bookmarklet directly.
    linkRef.current.setAttribute("href", bookmarklet);
  }, [bookmarklet]);

  async function handleCopy() {
    if (!bookmarklet) {
      setStatusMessage("Enter a valid JobOps host to generate a bookmarklet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(bookmarklet);
      setStatusMessage("Bookmarklet copied. Save it as a bookmark or drag the link below.");
    } catch {
      setStatusMessage(
        "Copy failed in this browser. Select the generated bookmarklet text and copy it manually.",
      );
    }
  }

  return (
    <div className={styles.generator}>
      <p className={styles.lead}>
        Build a bookmarklet in your browser. The docs page does not send the
        host or token anywhere while you edit this form.
      </p>

      <div className={styles.grid}>
        <label className={styles.field} htmlFor={hostId}>
          <span className={styles.labelRow}>
            <span className={styles.label}>JobOps host</span>
            <span className={styles.hint}>Use an origin like https://jobops.example.com</span>
          </span>
          <input
            id={hostId}
            className={styles.input}
            type="text"
            placeholder="https://jobops.example.com"
            value={hostInput}
            onChange={(event) => setHostInput(event.target.value)}
          />
          {hostIsInvalid ? (
            <span className={`${styles.hint} ${styles.error}`}>
              Enter a full origin with protocol, such as https://jobops.example.com.
            </span>
          ) : warning ? (
            <span className={styles.hint}>{warning}</span>
          ) : null}
        </label>

        <label className={styles.field} htmlFor={tokenId}>
          <span className={styles.labelRow}>
            <span className={styles.label}>Bearer token</span>
            <span className={styles.hint}>Optional if your JobOps API is public</span>
          </span>
          <input
            id={tokenId}
            className={styles.input}
            type="text"
            placeholder="Paste a JobOps Bearer token"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Generated bookmarklet</span>
          <textarea
            className={styles.code}
            value={bookmarklet}
            readOnly
            placeholder="Enter a valid host to generate a bookmarklet."
          />
        </label>

        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={handleCopy}>
            Copy bookmarklet
          </button>
          <a
            ref={linkRef}
            className={`${styles.bookmarkletLink} ${!bookmarklet ? styles.disabled : ""}`}
            href={undefined}
          >
            Drag this to your bookmarks bar
          </a>
        </div>

        {statusMessage ? <p className={styles.status}>{statusMessage}</p> : null}
      </div>

      <p className={styles.privacy}>
        Privacy note: this page builds the bookmarklet locally in your browser.
        It does not submit the host or token to the docs site. If you save the
        bookmarklet, any embedded token is stored in that bookmark. When you
        click the bookmarklet later, it sends the current page URL to your own
        JobOps server.
      </p>
    </div>
  );
}
