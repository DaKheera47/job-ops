import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import zhCN from "./zh-CN.json";

type UiLanguage = "en" | "zh-CN";
const STORAGE_KEY = "jobops.uiLanguage";
const translations: Record<string, string> = zhCN;

function translate(text: string, language: UiLanguage): string {
  if (language === "en") return text;
  return translations[text] ?? translations[text.trim()] ?? text;
}

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEXTAREA",
  "INPUT",
  "CODE",
  "PRE",
  "KBD",
  "NOSCRIPT",
]);

type TranslatedEntry = { original: string; output: string };

/**
 * Translates literal English text that is rendered without going through
 * `useUiTranslation().t`. Matching is exact (after whitespace normalisation),
 * so untranslated or dynamic strings are left untouched.
 */
function startDomTranslator(language: UiLanguage): () => void {
  if (typeof document === "undefined") return () => {};
  const textEntries = new Map<Text, TranslatedEntry>();
  const attrEntries = new Map<string, TranslatedEntry>();
  const attrKey = (el: Element, attr: string) => {
    const id = (el as HTMLElement & { __i18nId?: string }).__i18nId;
    return `${id}:${attr}`;
  };
  let idCounter = 0;
  const attrElements = new Map<string, Element>();

  const lookup = (raw: string): string | null => {
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (!normalized || !/[A-Za-z]/.test(normalized)) return null;
    const hit = translate(normalized, "zh-CN");
    return hit !== normalized ? hit : null;
  };

  const translateText = (node: Text) => {
    const parent = node.parentElement;
    if (!parent || SKIPPED_TAGS.has(parent.tagName)) return;
    if (parent.closest("[data-no-translate],[contenteditable='true']")) return;
    const current = node.nodeValue ?? "";
    const entry = textEntries.get(node);
    if (entry && entry.output === current) return;
    const zh = lookup(current);
    if (zh === null) return;
    const lead = current.match(/^\s*/)?.[0] ?? "";
    const trail = current.match(/\s*$/)?.[0] ?? "";
    const output = `${lead}${zh}${trail}`;
    textEntries.set(node, { original: current, output });
    node.nodeValue = output;
  };

  const translateAttributes = (el: Element) => {
    for (const attr of TRANSLATABLE_ATTRIBUTES) {
      const value = el.getAttribute(attr);
      if (value === null) continue;
      const holder = el as HTMLElement & { __i18nId?: string };
      if (!holder.__i18nId) holder.__i18nId = String(++idCounter);
      const key = attrKey(el, attr);
      const entry = attrEntries.get(key);
      if (entry && entry.output === value) continue;
      const zh = lookup(value);
      if (zh === null) continue;
      attrEntries.set(key, { original: value, output: zh });
      attrElements.set(key, el);
      el.setAttribute(attr, zh);
    }
  };

  const walk = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) {
      translateText(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    translateAttributes(el);
    const textWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textNode = textWalker.nextNode();
    while (textNode) {
      translateText(textNode as Text);
      textNode = textWalker.nextNode();
    }
    for (const child of Array.from(
      el.querySelectorAll("[placeholder],[title],[aria-label],[alt]"),
    )) {
      translateAttributes(child);
    }
  };

  if (language !== "zh-CN") return () => {};
  walk(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const added of Array.from(mutation.addedNodes)) walk(added);
      } else if (mutation.type === "characterData") {
        translateText(mutation.target as Text);
      } else if (mutation.type === "attributes") {
        translateAttributes(mutation.target as Element);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRIBUTES,
  });

  return () => {
    observer.disconnect();
    for (const [node, entry] of textEntries) {
      if (node.isConnected && node.nodeValue === entry.output) {
        node.nodeValue = entry.original;
      }
    }
    for (const [key, entry] of attrEntries) {
      const el = attrElements.get(key);
      const attr = key.slice(key.indexOf(":") + 1);
      if (el?.isConnected && el.getAttribute(attr) === entry.output) {
        el.setAttribute(attr, entry.original);
      }
    }
  };
}

const LanguageContext = createContext({
  language: "en" as UiLanguage,
  setLanguage: (_language: UiLanguage) => {},
  t: (text: string) => text,
});

export function UiLanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState<UiLanguage>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "zh-CN" ? "zh-CN" : "en";
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* Private browsing may block storage. */
    }
  }, [language]);
  useEffect(() => startDomTranslator(language), [language]);
  const t = useCallback(
    (text: string) => translate(text, language),
    [language],
  );
  const value = useMemo(() => ({ language, setLanguage, t }), [language, t]);
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useUiTranslation() {
  return useContext(LanguageContext);
}

export function LanguageSelector() {
  const { language, setLanguage } = useUiTranslation();
  return (
    <select
      aria-label="界面语言 / Interface language"
      value={language}
      onChange={(event) =>
        setLanguage(event.target.value === "zh-CN" ? "zh-CN" : "en")
      }
      className="h-8 max-w-32 rounded-md border border-border bg-background px-2 text-xs text-foreground"
    >
      <option value="en">English</option>
      <option value="zh-CN">简体中文</option>
    </select>
  );
}
