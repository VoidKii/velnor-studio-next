"use client";

import { startTransition, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
// YouTube and creator-supplied thumbnail URLs are dynamic; optimizing arbitrary remote hosts would require broader image-host configuration.
/* eslint-disable @next/next/no-img-element */
import {
  ArrowRight, ArrowUpRight, Bookmark, CalendarDays, Check,
  CircleHelp, Compass, FileText, LayoutDashboard, Lightbulb, Menu,
  Play, Search, Settings2, Sparkles, Tag, Target, X,
} from "lucide-react";

type Section = "overview" | "research" | "packaging" | "library" | "calendar" | "settings";
type VideoFormat = "long-form" | "short" | "tutorial" | "essay" | "interview";
type VideoGoal = "teach" | "grow" | "trust" | "entertain" | "leads";
type VideoIdea = { title: string; hook: string; reasoning: string; outline: string[] };
type Idea = { id: string; title: string; angle: string; savedAt: number; date?: string; hook?: string; outline?: string[]; audience?: string; format?: VideoFormat; goal?: VideoGoal; source?: "local" | "OpenAI API" };
type ScriptDraft = { id: string; title: string; content: string; updatedAt: number };
type SearchResult = { id: string; title: string; channel: string; publishedAt?: string; thumbnail?: string; description?: string; subscribers?: string | null; hiddenSubscriberCount?: boolean; videoCount?: string | null; viewCount?: string | null };
type PackagingDraft = { title: string; comparisonTitle: string; description: string; tags: string; thumbnailUrl: string };
type IdeasUpdate = Idea[] | ((ideas: Idea[]) => Idea[]);
type YoutubeAccount = {
  configured: boolean;
  connected: boolean;
  channel?: { id: string; title: string; thumbnail: string | null; subscriberCount: string | null };
  analytics?: { views28Days: number | null; subscribersGained28Days: number | null; startDate: string; endDate: string } | null;
  error?: string;
};

const IDEA_STORAGE_KEY = "velnor.ideas.v1";
const SCRIPT_STORAGE_KEY = "velnor.scripts.v1";
const PACKAGING_STORAGE_KEY = "velnor.packaging.v1";
const EMPTY_IDEAS = "[]";
const EMPTY_SCRIPTS = "[]";
const EMPTY_PACKAGING = JSON.stringify({ title: "", comparisonTitle: "", description: "", tags: "", thumbnailUrl: "" });
const DEFAULT_PACKAGING: PackagingDraft = { title: "", comparisonTitle: "", description: "", tags: "", thumbnailUrl: "" };

function subscribeToIdeas(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => { if (event.key === IDEA_STORAGE_KEY || event.key === SCRIPT_STORAGE_KEY || event.key === PACKAGING_STORAGE_KEY || event.key === null) onStoreChange(); };
  window.addEventListener("storage", handleStorage);
  window.addEventListener("velnor:ideas", onStoreChange);
  return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener("velnor:ideas", onStoreChange); };
}

function readIdeasSnapshot() {
  try { return window.localStorage.getItem(IDEA_STORAGE_KEY) ?? EMPTY_IDEAS; } catch { return EMPTY_IDEAS; }
}

function readScriptsSnapshot() {
  try { return window.localStorage.getItem(SCRIPT_STORAGE_KEY) ?? EMPTY_SCRIPTS; } catch { return EMPTY_SCRIPTS; }
}

function readPackagingSnapshot() {
  try { return window.localStorage.getItem(PACKAGING_STORAGE_KEY) ?? EMPTY_PACKAGING; } catch { return EMPTY_PACKAGING; }
}

function parsePackaging(snapshot: string): PackagingDraft {
  try {
    const value: unknown = JSON.parse(snapshot);
    if (!value || typeof value !== "object") return DEFAULT_PACKAGING;
    const draft = value as Record<string, unknown>;
    return {
      title: typeof draft.title === "string" ? draft.title.slice(0, 100) : "",
      comparisonTitle: typeof draft.comparisonTitle === "string" ? draft.comparisonTitle.slice(0, 100) : "",
      description: typeof draft.description === "string" ? draft.description.slice(0, 5000) : "",
      tags: typeof draft.tags === "string" ? draft.tags.slice(0, 300) : "",
      thumbnailUrl: typeof draft.thumbnailUrl === "string" ? draft.thumbnailUrl.slice(0, 2000) : "",
    };
  } catch { return DEFAULT_PACKAGING; }
}

function parseIdeas(snapshot: string): Idea[] {
  try {
    const data: unknown = JSON.parse(snapshot);
    return Array.isArray(data) ? data.filter((item): item is Idea => item !== null && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string" && typeof item.angle === "string" && typeof item.savedAt === "number" && (item.date === undefined || typeof item.date === "string")) : [];
  } catch { return []; }
}

function parseScripts(snapshot: string): ScriptDraft[] {
  try {
    const data: unknown = JSON.parse(snapshot);
    return Array.isArray(data) ? data.filter((item): item is ScriptDraft => item !== null && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string" && typeof item.updatedAt === "number") : [];
  } catch { return []; }
}

const navGroups: { label: string; items: { id: Section; name: string; icon: typeof LayoutDashboard }[] }[] = [
  { label: "STUDIO", items: [{ id: "overview", name: "Overview", icon: LayoutDashboard }, { id: "research", name: "Idea research", icon: Lightbulb }, { id: "packaging", name: "Video packaging", icon: Target }, { id: "library", name: "Saved work", icon: Bookmark }, { id: "calendar", name: "Content calendar", icon: CalendarDays }] },
];

const suggestedAngles = ["The part nobody explains", "A field test after 30 days", "What changed my mind", "A calmer, more honest guide", "The mistake I would skip"];
const formatLabels: Record<VideoFormat, string> = { "long-form": "Long-form video", short: "Short", tutorial: "Tutorial", essay: "Video essay", interview: "Interview" };
const goalLabels: Record<VideoGoal, string> = { teach: "Teach something", grow: "Reach new viewers", trust: "Build trust", entertain: "Entertain", leads: "Support a product or service" };

function localIdeas(niche: string, audience: string, format: VideoFormat, goal: VideoGoal, constraints: string): VideoIdea[] {
  const framing = goal === "teach" ? "Give the viewer one usable decision or skill." : goal === "trust" ? "Show trade-offs, uncertainty and who this is or is not for." : goal === "entertain" ? "Build the piece around a clear contrast, reveal or change of perspective." : goal === "leads" ? "Teach a useful decision framework before a relevant, low-pressure next step." : "Lead with a specific, understandable question; this is an editorial choice, not a prediction of reach.";
  const goalOpening = goal === "teach" ? "Name the outcome the viewer will learn." : goal === "trust" ? "Set the scope and the claim you can support." : goal === "entertain" ? "Open on the contrast that makes the viewer curious." : goal === "leads" ? "Frame a real decision before mentioning any offer." : "Make the intended viewer and question clear.";
  const goalMiddle = goal === "teach" ? "Show the decision or skill in steps." : goal === "trust" ? "Explain trade-offs and the limits of the example." : goal === "entertain" ? "Build through a change, reveal or reversal." : goal === "leads" ? "Compare options with criteria the viewer can apply." : "Use a concrete example that makes the premise easy to grasp.";
  const goalFinish = goal === "teach" ? "Recap the steps and give one action the viewer can try." : goal === "trust" ? "Separate what you know from what remains uncertain." : goal === "entertain" ? "Pay off the opening contrast and leave one memorable takeaway." : goal === "leads" ? "Offer a relevant next step without making the advice depend on buying." : "Close the question and suggest a useful follow-up topic, without predicting reach.";
  const lowerConstraints = constraints.toLowerCase();
  const budgetBound = /no (paid |expensive |new )?(gear|equipment|tools)|no-spend|without buying|low[ -]cost|small budget|tight budget/.test(lowerConstraints);
  const timeBound = /time|evening|weeknight|busy|schedule|minutes/.test(lowerConstraints);
  const exampleContext = `Use an example that fits ${audience}${budgetBound ? " and relies on tools the viewer already has" : ""}${timeBound ? " within the viewer's available time" : ""}.`;
  const concepts = [
    { title: `The first decision to make about ${niche}`, angle: "A practical first step", hook: `If you are exploring ${niche}, which first decision saves the most time or frustration?`, opening: "Name the viewer's first decision and why it matters.", middle: "Compare two realistic options and who each suits.", example: "Walk through one concrete scenario.", finish: "Summarize a next step and one trade-off to keep in mind." },
    { title: `A small, honest test of ${niche}`, angle: "A bounded experiment", hook: `Instead of taking another broad claim at face value, what could you test about ${niche} for yourself?`, opening: "State the question and what the test can and cannot answer.", middle: "Set a simple baseline, time window and observation method.", example: "Show the steps and any result only after you actually run the test.", finish: "Separate what you observed from what you still do not know." },
    { title: `What to check before choosing an approach to ${niche}`, angle: "A decision guide", hook: `Before you choose a ${niche} approach, what should someone in your situation check first?`, opening: `Describe ${audience} and the choice ahead.`, middle: "Explain three criteria with plain-language examples.", example: "Apply the criteria to a representative, clearly labeled example.", finish: "Give viewers a short checklist they can adapt to their own needs." },
  ];
  return concepts.map((concept) => ({
    title: concept.title,
    hook: concept.hook,
    reasoning: `${concept.angle}. ${framing}${constraints ? ` Shaped by your constraint: ${constraints}` : ""}`,
    outline: format === "short"
      ? [`0–3s · ${concept.opening} ${goalOpening}`, `3–15s · ${concept.middle} ${goalMiddle}`, `15–35s · ${concept.example} ${exampleContext}`, `35–45s · ${goalFinish}`]
      : format === "interview"
        ? [`Set up the viewer's question: ${concept.opening} ${goalOpening}`, `Ask the guest: ${concept.middle} ${goalMiddle}`, `Follow up for a specific example: ${concept.example} ${exampleContext}`, `Close by asking for one takeaway: ${goalFinish}`]
        : format === "tutorial"
          ? [`Show the finished outcome and who it is for: ${concept.opening}`, `Break the method into clear steps: ${concept.middle}`, `Demonstrate each step with a fitting example: ${concept.example} ${exampleContext}`, `Recap the steps and common trade-off: ${goalFinish}`]
          : format === "essay"
            ? [`Introduce the central tension: ${concept.opening} ${goalOpening}`, `Give context and the strongest case for one side: ${concept.middle}`, `Examine a counterexample or limitation: ${concept.example} ${goalMiddle}`, `Close with a considered takeaway: ${goalFinish}`]
            : [`${concept.opening} ${goalOpening}`, `${concept.middle} ${goalMiddle}`, `${concept.example} ${exampleContext}`, goalFinish],
  }));
}

function safeThumbnailUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}
const sectionTitle: Record<Section, { eyebrow: string; title: string; subtitle: string }> = {
  overview: { eyebrow: "YOUR CREATOR DESK", title: "Make room for your next good idea.", subtitle: "A little clarity for the work you want to put into the world." },
  research: { eyebrow: "THE EDITORIAL DESK", title: "Find the angle worth making.", subtitle: "Turn a clear brief into concepts you can validate with your audience." },
  packaging: { eyebrow: "THE LAST 10%", title: "Give the idea its best first impression.", subtitle: "Shape the promise, details and thumbnail before you publish." },
  library: { eyebrow: "YOUR STUDIO", title: "Good ideas deserve a home.", subtitle: "Your saved ideas stay in this browser, ready when you are." },
  calendar: { eyebrow: "A GENTLER PUBLISHING RHYTHM", title: "Make a little space on the calendar.", subtitle: "Turn a saved idea into a real next step, at your own pace." },
  settings: { eyebrow: "YOUR ACCOUNT", title: "Set up your studio.", subtitle: "Choose your creative home base and connect services when ready." },
};

function shortDate(date?: string) {
  if (!date) return "Choose a date";
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCount(value?: string | null) {
  if (!value) return "Not public";
  const count = Number(value);
  return Number.isFinite(count) ? new Intl.NumberFormat(undefined, { notation: count >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(count) : "Not public";
}

export default function Home() {
  const [section, setSection] = useState<Section>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const ideasSnapshot = useSyncExternalStore(subscribeToIdeas, readIdeasSnapshot, () => EMPTY_IDEAS);
  const ideas = useMemo(() => parseIdeas(ideasSnapshot), [ideasSnapshot]);
  const scriptsSnapshot = useSyncExternalStore(subscribeToIdeas, readScriptsSnapshot, () => EMPTY_SCRIPTS);
  const scripts = useMemo(() => parseScripts(scriptsSnapshot), [scriptsSnapshot]);
  const packagingSnapshot = useSyncExternalStore(subscribeToIdeas, readPackagingSnapshot, () => EMPTY_PACKAGING);
  const packagingDraft = useMemo(() => parsePackaging(packagingSnapshot), [packagingSnapshot]);
  const [storageNotice, setStorageNotice] = useState("");
  const setIdeas = (update: IdeasUpdate) => {
    const current = parseIdeas(readIdeasSnapshot());
    const next = typeof update === "function" ? update(current) : update;
    try { window.localStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(next)); setStorageNotice(""); } catch { setStorageNotice("Browser storage is unavailable. This change may not persist after the page closes."); }
    window.dispatchEvent(new Event("velnor:ideas"));
  };
  const setScripts = (update: ScriptDraft[] | ((scripts: ScriptDraft[]) => ScriptDraft[])) => {
    const current = parseScripts(readScriptsSnapshot());
    const next = typeof update === "function" ? update(current) : update;
    try { window.localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(next)); setStorageNotice(""); } catch { setStorageNotice("Browser storage is unavailable. This change may not persist after the page closes."); }
    window.dispatchEvent(new Event("velnor:ideas"));
  };
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("long-form");
  const [videoGoal, setVideoGoal] = useState<VideoGoal>("teach");
  const [constraints, setConstraints] = useState("");
  const [generated, setGenerated] = useState<VideoIdea[]>([]);
  const [generatedSource, setGeneratedSource] = useState<"local" | "OpenAI API">("local");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [ideaStatus, setIdeaStatus] = useState<"idle" | "loading" | "error">("idle");
  const [ideaError, setIdeaError] = useState("");
  const generationRef = useRef(0);
  const [youtubeConfigured, setYoutubeConfigured] = useState(false);
  const [search, setSearch] = useState("");
  const [searchType, setSearchType] = useState<"video" | "channel">("video");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [searchError, setSearchError] = useState("");
  const [searchAsOf, setSearchAsOf] = useState<string | null>(null);
  const [packagingChecked, setPackagingChecked] = useState(false);
  const [youtubeAccount, setYoutubeAccount] = useState<YoutubeAccount>({ configured: false, connected: false });
  const [youtubeAction, setYoutubeAction] = useState<"idle" | "connecting" | "disconnecting">("idle");
  const [youtubeNotice, setYoutubeNotice] = useState("");

  useEffect(() => {
    let current = true;
    fetch("/api/ideas", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { aiConfigured?: unknown; youtubeConfigured?: unknown }) => { if (current) { setAiConfigured(data.aiConfigured === true); setYoutubeConfigured(data.youtubeConfigured === true); } })
      .catch(() => { if (current) { setAiConfigured(false); setYoutubeConfigured(false); } });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    const oauthResult = new URLSearchParams(window.location.search).get("youtube");
    if (oauthResult) {
      const notices: Record<string, string> = {
        connected: "Your YouTube channel is connected. Velnor has read-only access to channel details and analytics.",
        cancelled: "You cancelled YouTube access. Nothing was connected.",
        invalid_state: "The connection link expired or could not be verified. Please try again.",
        channel_unavailable: "Google authorized access, but Velnor could not read the channel. Check that YouTube Data API v3 is enabled in your Google Cloud project.",
        failed: "YouTube could not be connected. Check the Google OAuth setup and try again.",
      };
      startTransition(() => {
        setSection("settings");
        setYoutubeNotice(notices[oauthResult] ?? "YouTube connection could not be completed.");
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
    fetch("/api/youtube/account", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() as YoutubeAccount }))
      .then(({ data }) => { if (current) setYoutubeAccount(data); })
      .catch(() => { if (current) setYoutubeAccount({ configured: false, connected: false, error: "status_unavailable" }); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
  }, [section]);

  useEffect(() => {
    if (!mobileNav) return;
    const navigation = document.getElementById("studio-navigation");
    navigation?.querySelector<HTMLElement>(".nav-item.active")?.focus();
    const handleNavigationKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        document.getElementById("mobile-nav-toggle")?.focus();
        return;
      }
      if (event.key === "Tab" && navigation) {
        const focusable = Array.from(navigation.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!navigation.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleNavigationKey);
    return () => window.removeEventListener("keydown", handleNavigationKey);
  }, [mobileNav]);

  const page = sectionTitle[section];
  const scheduled = useMemo(() => ideas.filter((idea) => idea.date).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")), [ideas]);

  function saveIdea(concept: VideoIdea) {
    const cleaned = concept.title.trim();
    if (!cleaned) return;
    setIdeas((items) => [{ id: crypto.randomUUID(), title: cleaned, angle: concept.reasoning, hook: concept.hook, outline: concept.outline, audience, format: videoFormat, goal: videoGoal, source: generatedSource, savedAt: Date.now() }, ...items]);
  }

  function makePrompts() {
    generationRef.current += 1;
    if (topic.trim().length < 2 || audience.trim().length < 2) { setIdeaError("Add a niche and a specific audience to shape these ideas."); setIdeaStatus("error"); return; }
    setGenerated(localIdeas(topic.trim(), audience.trim(), videoFormat, videoGoal, constraints.trim()));
    setGeneratedSource("local");
    setIdeaStatus("idle");
    setIdeaError("");
  }

  async function makeAiPrompts() {
    const requestId = ++generationRef.current;
    if (topic.trim().length < 2 || audience.trim().length < 2) { setIdeaError("Add a niche and a specific audience before drafting."); setIdeaStatus("error"); return; }
    if (!aiConfigured) { setIdeaError("OpenAI drafting is not configured. Use the local idea framework or add OPENAI_API_KEY on the server."); setIdeaStatus("error"); return; }
    setIdeaStatus("loading"); setIdeaError(""); setGenerated([]);
    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: topic.trim(), audience: audience.trim(), format: videoFormat, goal: videoGoal, constraints: constraints.trim() }),
      });
      const data: { error?: string; ideas?: unknown; source?: string } = await response.json();
      if (requestId !== generationRef.current) return;
      if (!response.ok) throw new Error(data.error ?? "AI drafting could not be completed.");
      if (!Array.isArray(data.ideas) || data.ideas.length !== 3) throw new Error("The provider returned an incomplete idea set. Try again.");
      setGenerated(data.ideas as VideoIdea[]);
      setGeneratedSource("OpenAI API");
      setIdeaStatus("idle");
    } catch (error) {
      if (requestId !== generationRef.current) return;
      setIdeaError(error instanceof Error ? error.message : "AI drafting could not be completed.");
      setIdeaStatus("error");
    }
  }

  function updatePackaging(patch: Partial<PackagingDraft>) {
    const current = parsePackaging(readPackagingSnapshot());
    const next = { ...current, ...patch };
    try { window.localStorage.setItem(PACKAGING_STORAGE_KEY, JSON.stringify(next)); setStorageNotice(""); } catch { setStorageNotice("Browser storage is unavailable. This change may not persist after the page closes."); }
    window.dispatchEvent(new Event("velnor:ideas"));
    setPackagingChecked(false);
  }

  async function findVideos(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (query.length < 2) { setSearchError("Add a little more detail to your search."); setSearchStatus("error"); return; }
    setSearchStatus("loading"); setSearchError(""); setResults([]); setSearchAsOf(null);
    try {
      const response = await fetch(`/api/youtube?q=${encodeURIComponent(query)}&type=${searchType}`);
      const data: { error?: string; results?: SearchResult[]; asOf?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search could not be completed.");
      setResults(Array.isArray(data.results) ? data.results : []); setSearchAsOf(typeof data.asOf === "string" ? data.asOf : null); setSearchStatus("success");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search could not be completed."); setSearchStatus("error");
    }
  }

  async function connectYoutube() {
    setYoutubeAction("connecting");
    setYoutubeNotice("");
    try {
      const response = await fetch("/api/youtube/oauth/start", { cache: "no-store" });
      const data = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error ?? "YouTube connection is not ready yet.");
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setYoutubeNotice(error instanceof Error ? error.message : "YouTube connection could not be started.");
      setYoutubeAction("idle");
    }
  }

  async function disconnectYoutube() {
    setYoutubeAction("disconnecting");
    setYoutubeNotice("");
    try {
      const response = await fetch("/api/youtube/account", { method: "DELETE" });
      if (!response.ok) throw new Error("The connection could not be cleared. Try again.");
      setYoutubeAccount((account) => ({ ...account, connected: false, channel: undefined, analytics: undefined, error: undefined }));
      setYoutubeNotice("Your YouTube connection was removed from this browser.");
    } catch (error) {
      setYoutubeNotice(error instanceof Error ? error.message : "The connection could not be removed.");
    } finally {
      setYoutubeAction("idle");
    }
  }

  function scheduleIdea(id: string, date: string) {
    setIdeas((items) => items.map((idea) => idea.id === id ? { ...idea, date } : idea));
  }

  function closeMobileNavigation() {
    setMobileNav(false);
    if (window.matchMedia("(max-width: 850px)").matches) document.getElementById("mobile-nav-toggle")?.focus();
  }

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside id="studio-navigation" className={`sidebar ${mobileNav ? "sidebar-open" : ""}`} aria-label="Main navigation" role={mobileNav ? "dialog" : undefined} aria-modal={mobileNav ? "true" : undefined}>
        {mobileNav && <button className="mobile-nav-close" onClick={closeMobileNavigation} aria-label="Close navigation"><X size={19} /></button>}
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setSection("overview"); closeMobileNavigation(); }} aria-label="Velnor Studio home">
          <span className="brand-mark"><span /><span /><span /></span><span className="brand-name">velnor<span>.</span></span>
        </a>
        <nav className="nav-groups">
          {navGroups.map((group) => <div className="nav-group" key={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.items.map(({ id, name, icon: Icon }) => <button key={id} className={`nav-item ${section === id ? "active" : ""}`} onClick={() => { setSection(id); closeMobileNavigation(); }} aria-current={section === id ? "page" : undefined}>
              <Icon size={17} strokeWidth={1.8} /><span>{name}</span>{id === "library" && ideas.length > 0 && <span className="nav-count">{ideas.length}</span>}
            </button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-item ${section === "settings" ? "active" : ""}`} onClick={() => { setSection("settings"); closeMobileNavigation(); }}><Settings2 size={17} /><span>Settings</span></button>
        </div>
      </aside>

      {mobileNav && <button className="mobile-scrim" onClick={closeMobileNavigation} aria-label="Close navigation" />}
      <main id="main-content" className="main-area" inert={mobileNav}>
        <header className="topbar">
          <button id="mobile-nav-toggle" className="mobile-menu" aria-label={mobileNav ? "Close navigation" : "Open navigation"} aria-expanded={mobileNav} aria-controls="studio-navigation" onClick={() => mobileNav ? closeMobileNavigation() : setMobileNav(true)}><Menu size={20} /></button>
          <div className="crumb"><b>{navGroups.flatMap((group) => group.items).find((item) => item.id === section)?.name ?? "Settings"}</b></div>
        </header>

        <div className="page-wrap">
          <div className="page-heading"><div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="page-subtitle">{page.subtitle}</p></div>
            <div className="heading-actions">{section === "overview" && <button className="button button-primary" onClick={() => setSection("research")}><Sparkles size={15} /> Find an idea</button>}</div>
          </div>

          {section === "overview" && <Overview ideas={ideas} scheduled={scheduled} youtubeAccount={youtubeAccount} onOpen={setSection} />}
          {section === "research" && <Research topic={topic} setTopic={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setTopic(value); }} audience={audience} setAudience={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setAudience(value); }} videoFormat={videoFormat} setVideoFormat={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setVideoFormat(value); }} videoGoal={videoGoal} setVideoGoal={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setVideoGoal(value); }} constraints={constraints} setConstraints={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setConstraints(value); }} generated={generated} generatedSource={generatedSource} makePrompts={makePrompts} makeAiPrompts={makeAiPrompts} aiConfigured={aiConfigured} ideaStatus={ideaStatus} ideaError={ideaError} storageNotice={storageNotice} onSave={saveIdea} search={search} setSearch={setSearch} searchType={searchType} setSearchType={(type) => { setSearchType(type); setResults([]); setSearchAsOf(null); setSearchStatus("idle"); setSearchError(""); }} findVideos={findVideos} searchStatus={searchStatus} searchError={searchError} results={results} searchAsOf={searchAsOf} />}
          {section === "packaging" && <Packaging draft={packagingDraft} update={updatePackaging} checked={packagingChecked} setChecked={setPackagingChecked} storageNotice={storageNotice} />}
          {section === "library" && <Library ideas={ideas} setIdeas={setIdeas} scripts={scripts} setScripts={setScripts} onSchedule={scheduleIdea} onOpenResearch={() => setSection("research")} storageNotice={storageNotice} />}
          {section === "calendar" && <Calendar ideas={ideas} onSchedule={scheduleIdea} onOpenLibrary={() => setSection("library")} storageNotice={storageNotice} />}
          {section === "settings" && <Settings aiConfigured={aiConfigured} youtubeConfigured={youtubeConfigured} youtubeAccount={youtubeAccount} youtubeAction={youtubeAction} youtubeNotice={youtubeNotice} onConnectYoutube={connectYoutube} onDisconnectYoutube={disconnectYoutube} />}

          <footer className="page-footer"><span>Saved work stays in this browser.</span></footer>
        </div>
      </main>
    </div>
  );
}

function Overview({ ideas, scheduled, youtubeAccount, onOpen }: { ideas: Idea[]; scheduled: Idea[]; youtubeAccount: YoutubeAccount; onOpen: (section: Section) => void }) {
  const connected = youtubeAccount.connected && Boolean(youtubeAccount.channel);
  const subscribers = connected ? formatCount(youtubeAccount.channel?.subscriberCount) : "—";
  const views = youtubeAccount.analytics?.views28Days;
  const viewCount = typeof views === "number" ? formatCount(String(views)) : "—";
  const period = youtubeAccount.analytics ? `${shortDate(youtubeAccount.analytics.startDate)} – ${shortDate(youtubeAccount.analytics.endDate)}` : "Waiting for channel data";
  return <>
    <div className="demo-note"><span className="demo-note-icon"><CircleHelp size={16} /></span><div><b>{connected ? `Connected · ${youtubeAccount.channel?.title}` : "Channel not connected"}</b><span>{connected ? "Read-only YouTube channel access is active in this browser." : "Connect your channel to see real analytics. This dashboard never shows sample performance figures."}</span></div><button className="text-link" onClick={() => onOpen("settings")}>{connected ? "Manage connection" : "Connect YouTube"} <ArrowRight size={14} /></button></div>
    <section className="metric-grid" aria-label="Your saved work and channel connection status">
      {[{ label: "Subscribers · public", value: subscribers, note: connected ? (youtubeAccount.channel?.subscriberCount ? "Rounded count from YouTube" : "Hidden by channel") : "Connect a channel" }, { label: "Views · 28 days", value: viewCount, note: youtubeAccount.analytics ? period : connected ? "Analytics unavailable" : "Connect a channel" }, { label: "Ideas saved", value: String(ideas.length), note: "In this browser" }, { label: "Scheduled", value: String(scheduled.length), note: "Planned publish dates" }].map(({ label, value, note }) => <article className="metric-card" key={label}><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></article>)}
    </section>
    <div className="dashboard-grid">
      <section className="surface performance-panel"><div className="surface-heading"><div><p className="eyebrow">YOUR CHANNEL</p><h2>Channel performance</h2></div></div>
        {connected ? <div className="chart-empty"><div className="youtube-profile">{youtubeAccount.channel?.thumbnail && <img src={youtubeAccount.channel.thumbnail} alt="" width="38" height="38" />}<div><b>{youtubeAccount.channel?.title}</b><span>Connected channel</span></div></div>{youtubeAccount.analytics ? <><span>In the last 28 complete days, the channel received {viewCount} views and {youtubeAccount.analytics.subscribersGained28Days === null ? "no subscribers gained reported" : `${formatCount(String(youtubeAccount.analytics.subscribersGained28Days))} subscribers gained`}. These are YouTube Analytics figures for {period}.</span><small className="metric-note">Analytics can take time to update. Figures come directly from YouTube.</small></> : <span>{youtubeAccount.error === "analytics_api_unavailable" ? "Enable the YouTube Analytics API in Google Cloud, then reload this dashboard." : "Channel connected. YouTube Analytics is not available yet; no sample figures are shown."}</span>}</div> : <div className="chart-empty"><b>Connect your channel to see your performance.</b><span>Owner-authorized analytics are not connected. No example figures are shown.</span><button className="text-link" onClick={() => onOpen("settings")}>Connect YouTube <ArrowRight size={14} /></button></div>}
      </section>
      <section className="surface next-panel"><div className="surface-heading"><div><p className="eyebrow">NEXT STEPS</p><h2>Keep the work moving</h2></div></div><button className="step-row" onClick={() => onOpen("research")}><span><b>Explore an idea</b><small>Shape an audience question into a video</small></span><ArrowRight size={15} /></button><button className="step-row" onClick={() => onOpen("packaging")}><span><b>Refine its packaging</b><small>Clarify the promise and details</small></span><ArrowRight size={15} /></button><button className="step-row" onClick={() => onOpen("calendar")}><span><b>Plan a publish date</b><small>Give a saved idea a next step</small></span><ArrowRight size={15} /></button></section>
    </div>
    <section className="surface ideas-panel"><div className="surface-heading"><div><p className="eyebrow">OPEN LOOPS</p><h2>Room for what’s next</h2></div><button className="text-link" onClick={() => onOpen("library")}>Your saved work <ArrowRight size={14} /></button></div>
      {ideas.length > 0 ? <div className="recent-ideas">{ideas.slice(0, 3).map((idea, index) => <div className="recent-idea" key={idea.id}><span className="idea-index">{String(index + 1).padStart(2, "0")}</span><div><b>{idea.title}</b><small>{idea.angle}</small></div><span className="saved-label"><Check size={12} /> Saved</span></div>)}</div> : <div className="empty-inline"><span className="empty-glyph"><Lightbulb size={18} /></span><div><b>No ideas saved yet.</b><span>Keep the good ones close when they arrive.</span></div><button className="button button-quiet" onClick={() => onOpen("research")}>Explore ideas <ArrowRight size={14} /></button></div>}
    </section>
    <span className="sr-only" aria-live="polite">{ideas.length} ideas saved</span>
  </>;
}

function Research({ topic, setTopic, audience, setAudience, videoFormat, setVideoFormat, videoGoal, setVideoGoal, constraints, setConstraints, generated, generatedSource, makePrompts, makeAiPrompts, aiConfigured, ideaStatus, ideaError, storageNotice, onSave, search, setSearch, searchType, setSearchType, findVideos, searchStatus, searchError, results, searchAsOf }: {
  topic: string; setTopic: (value: string) => void; audience: string; setAudience: (value: string) => void;
  videoFormat: VideoFormat; setVideoFormat: (value: VideoFormat) => void; videoGoal: VideoGoal; setVideoGoal: (value: VideoGoal) => void;
  constraints: string; setConstraints: (value: string) => void; generated: VideoIdea[]; generatedSource: "local" | "OpenAI API";
  makePrompts: () => void; makeAiPrompts: () => void; aiConfigured: boolean | null; ideaStatus: "idle" | "loading" | "error"; ideaError: string; storageNotice: string; onSave: (idea: VideoIdea) => void;
  search: string; setSearch: (search: string) => void; findVideos: (event: React.FormEvent<HTMLFormElement>) => void;
  searchType: "video" | "channel"; setSearchType: (type: "video" | "channel") => void; searchStatus: "idle" | "loading" | "error" | "success";
  searchError: string; results: SearchResult[]; searchAsOf: string | null;
}) {
  const dateLabel = searchAsOf ? new Date(searchAsOf).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  return <div className="research-layout">
    <section className="surface research-builder">
      <div className="surface-heading"><div><p className="eyebrow">BRIEF</p><h2>Start with the viewer.</h2></div></div>
      <p className="section-copy">Bring the audience, format and intent into the idea. Local drafts use a practical editorial framework; optional AI drafts use only the brief you submit.</p>
      <label className="field-label" htmlFor="topic">Niche or subject <span className="field-count">{topic.length}/100</span></label>
      <div className="field-with-icon"><Search size={17} /><input id="topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. slow travel, home cooking, creative coding" maxLength={100} /></div>
      <label className="field-label" htmlFor="audience">Who is this for? <span className="field-count">{audience.length}/120</span></label>
      <input className="text-input" id="audience" value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={120} placeholder="e.g. first-time solo travelers on a budget" />
      <div className="brief-selects">
        <div><label className="field-label" htmlFor="video-format">Video format</label><select className="text-input" id="video-format" value={videoFormat} onChange={(event) => setVideoFormat(event.target.value as VideoFormat)}>{Object.entries(formatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label className="field-label" htmlFor="video-goal">Primary goal</label><select className="text-input" id="video-goal" value={videoGoal} onChange={(event) => setVideoGoal(event.target.value as VideoGoal)}>{Object.entries(goalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      </div>
      <label className="field-label" htmlFor="constraints">Constraints or preferences <span className="optional-tag">OPTIONAL · {constraints.length}/500</span></label>
      <textarea className="text-area" id="constraints" rows={3} maxLength={500} value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="e.g. no expensive gear, suitable for beginners, avoid personal claims" />
      <div className="idea-actions"><button className="button button-primary" onClick={makePrompts} disabled={!topic.trim() || !audience.trim()}><Sparkles size={15} /> Make local drafts</button><button className="button button-secondary" onClick={makeAiPrompts} disabled={aiConfigured !== true || ideaStatus === "loading"}>{ideaStatus === "loading" ? <span className="loader" aria-label="Drafting with OpenAI" /> : <Sparkles size={14} />} Draft with OpenAI</button></div>
      <p className="provider-note" aria-live="polite">{aiConfigured === true ? "Selecting OpenAI sends this brief to your configured OpenAI API account and may incur API usage charges. No web research or performance data is included." : aiConfigured === null ? "Checking optional AI setup. Local drafts are ready without an account or API key." : "OpenAI is not configured. Add OPENAI_API_KEY on the server to enable it; local drafts remain available."}</p>
      {ideaStatus === "error" && <div className="form-error" role="alert">{ideaError}</div>}
      {storageNotice && <div className="form-error" role="status">{storageNotice}</div>}
      {generated.length > 0 && <div className="prompt-results"><div className="result-caption"><span>THREE EDITORIAL STARTING POINTS</span><span>{generatedSource === "local" ? "LOCAL FRAMEWORK" : "OPENAI API · AI DRAFT"}</span></div>{videoFormat === "short" && <p className="format-note">Short timings are suggested beats to edit freely, not performance rules.</p>}
        {generated.map((idea, index) => <article className="prompt-card" key={`${idea.title}-${index}`}><span className="prompt-number">0{index + 1}</span><div className="idea-copy"><h3>{idea.title}</h3><p className="idea-hook"><b>Opening hook</b> {idea.hook}</p><p className="idea-reasoning"><b>Why this angle</b> {idea.reasoning}</p><details className="outline-details"><summary>Practical outline</summary><ol>{idea.outline.map((step, stepIndex) => <li key={`${stepIndex}-${step}`}>{step}</li>)}</ol></details></div><button aria-label={`Save idea: ${idea.title}`} title="Save idea" className="save-icon" onClick={() => onSave(idea)}><Bookmark size={17} /></button></article>)}
      </div>}
      {generated.length === 0 && <div className="prompt-guide"><p>Editorial starting points</p><div className="angle-pills">{suggestedAngles.slice(0, 3).map((angle) => <span key={angle}>{angle}</span>)}</div></div>}
    </section>
    <section className="surface video-search-panel"><div className="surface-heading"><div><p className="eyebrow">PUBLIC RESEARCH</p><h2>{searchType === "channel" ? "Compare public profiles." : "Explore published videos."}</h2></div></div><p className="section-copy">{searchType === "channel" ? "Public profile fields returned by YouTube Data API v3. A profile snapshot cannot show audience fit, quality or growth over time." : "Search public YouTube video metadata for context. Results are ordered by YouTube relevance, not view count, trend strength or likely performance."}</p>
      <div className="search-mode" role="group" aria-label="Research type"><button type="button" aria-pressed={searchType === "video"} className={searchType === "video" ? "selected" : ""} onClick={() => setSearchType("video")}><Play size={13} /> Videos</button><button type="button" aria-pressed={searchType === "channel"} className={searchType === "channel" ? "selected" : ""} onClick={() => setSearchType("channel")}><Compass size={13} /> Channels</button></div>
      <form className="search-form" onSubmit={findVideos}><label className="sr-only" htmlFor="public-search">Search public {searchType === "channel" ? "channels" : "videos"}</label><div className="field-with-icon"><Search size={16} /><input id="public-search" value={search} onChange={(event) => setSearch(event.target.value)} minLength={2} maxLength={100} placeholder={`Search public ${searchType === "channel" ? "channels" : "videos"}…`} /></div><button className="button button-secondary" disabled={searchStatus === "loading"}>{searchStatus === "loading" ? <span className="loader" aria-label="Loading" /> : "Search"}</button></form>
      <div className="api-state" aria-live="polite">{searchStatus === "idle" && <><span className="state-dot" /> Search checks your server’s YouTube setup<span className="state-detail">YouTube API key required</span></>}{searchStatus === "loading" && <><span className="loader" /> Searching public results…</>}{searchStatus === "error" && <><span className="state-dot error-dot" /> {searchError}</>}{searchStatus === "success" && <><span className="state-dot success-dot" /> {results.length} {searchType === "channel" ? "public channels" : "public videos"} · YouTube relevance order</>}</div>
      {searchStatus === "success" && results.length > 0 && searchType === "video" && <div className="video-results">{results.map((result) => <a className="video-result" key={result.id} href={`https://www.youtube.com/watch?v=${result.id}`} target="_blank" rel="noreferrer">{result.thumbnail && <img src={result.thumbnail} alt="" width="100" height="56" />}<span><b>{result.title}</b><small>{result.channel} · {result.publishedAt ? shortDate(result.publishedAt.slice(0, 10)) : "Public video"}</small></span><ArrowUpRight size={14} /></a>)}</div>}
      {searchStatus === "success" && results.length > 0 && searchType === "channel" && <div className="channel-comparison"><div className="comparison-intro"><b>Observed public profile fields</b><span>Snapshot captured {dateLabel || "when this search completed"}. Source: YouTube Data API v3.</span></div><div className="comparison-list">{results.map((result) => <article className="comparison-channel" key={result.id}><div className="comparison-channel-head">{result.thumbnail && <img src={result.thumbnail} alt="" width="34" height="34" />}<a href={`https://www.youtube.com/channel/${result.id}`} target="_blank" rel="noreferrer"><b>{result.title}</b><small>Open public channel <ArrowUpRight size={11} /></small></a></div><div className="comparison-metrics"><div><span>SUBSCRIBERS</span><b>{formatCount(result.subscribers)}</b></div><div><span>PUBLIC VIDEOS</span><b>{formatCount(result.videoCount)}</b></div><div><span>TOTAL VIEWS</span><b>{formatCount(result.viewCount)}</b></div></div>{result.description && <p>{result.description}</p>}</article>)}</div><p className="metric-limits">YouTube rounds public subscriber counts down to three significant figures; some channels hide them. Video count covers public videos. Total views span YouTube formats and are lifetime profile counts, not growth over a period. Since Aug 24, 2026, YouTube counts a view from playback starting, including autoplay.</p></div>}
      {searchStatus === "success" && results.length === 0 && <div className="no-results"><Search size={18} /><span><b>No public {searchType === "channel" ? "channels" : "videos"} found</b><small>Try a different phrase or a broader topic.</small></span></div>}
      <div className="privacy-note"><span><CircleHelp size={14} /></span><p>Requests use the server’s YouTube Data API quota. Public search does not reveal private creator analytics, keyword volume, viewer retention or historical growth.</p></div>
    </section>
  </div>;
}

function Packaging({ draft, update, checked, setChecked, storageNotice }: { draft: PackagingDraft; update: (value: Partial<PackagingDraft>) => void; checked: boolean; setChecked: (value: boolean) => void; storageNotice: string }) {
  const { title, comparisonTitle, description, tags, thumbnailUrl } = draft;
  const tagList = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const safeImage = safeThumbnailUrl(thumbnailUrl);
  const opening = (value: string) => value.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  const comparisonNote = !title.trim() || !comparisonTitle.trim()
    ? "Add both drafts to compare their opening promise."
    : title.trim().toLowerCase() === comparisonTitle.trim().toLowerCase()
      ? "These drafts currently say the same thing. Change one to compare a different angle."
      : `A opens with “${opening(title)}”; B opens with “${opening(comparisonTitle)}”. Both are options, not a ranking. Choose the promise the video can actually deliver.`;
  const tips = [
    "Can a viewer understand the subject and promised takeaway from the title alone?",
    "Does the opening claim appear early in the video, with evidence or an example?",
    description.trim() ? "Do the first two description lines match the video and set clear expectations?" : "Draft the first two description lines around what viewers will actually get.",
    tagList.length ? `Check that each of the ${tagList.length} tags names a real topic in this video; extra tags are optional.` : "Use tags only for topics that genuinely describe the video; they are optional.",
    "At small size, can you read the thumbnail and tell what it adds beyond the title?",
  ];
  return <div className="packaging-layout"><section className="surface packaging-form"><div className="surface-heading"><div><p className="eyebrow">PACKAGING</p><h2>Compare the promise.</h2></div></div><p className="section-copy">Edit two title options side by side, then review the description, tags and thumbnail against the video you plan to make. Velnor assigns no performance score.</p>
    <div className="title-input-grid"><div><label className="field-label" htmlFor="video-title">Title A <span className="field-count">{title.length}/100</span></label><input className="text-input" id="video-title" value={title} onChange={(event) => update({ title: event.target.value.slice(0, 100) })} maxLength={100} placeholder="State the clearest promise" /></div><div><label className="field-label" htmlFor="comparison-title">Title B <span className="field-count">{comparisonTitle.length}/100</span></label><input className="text-input" id="comparison-title" value={comparisonTitle} onChange={(event) => update({ comparisonTitle: event.target.value.slice(0, 100) })} maxLength={100} placeholder="Try a distinct angle" /></div></div>
    <div className="title-comparison" aria-live="polite"><div className="title-variant"><span>TITLE A · {title.length} CHARACTERS · {title.trim() ? title.trim().split(/\s+/).length : 0} WORDS</span><b>{title.trim() || "Your first title draft"}</b></div><div className="title-variant"><span>TITLE B · {comparisonTitle.length} CHARACTERS · {comparisonTitle.trim() ? comparisonTitle.trim().split(/\s+/).length : 0} WORDS</span><b>{comparisonTitle.trim() || "Your alternate title draft"}</b></div></div>
    <p className="comparison-reasoning">{comparisonNote}</p>
    <label className="field-label" htmlFor="description">Description <span className="field-count">{description.length}/5000</span></label><textarea className="text-area" id="description" rows={5} maxLength={5000} value={description} onChange={(event) => update({ description: event.target.value })} placeholder="What will a viewer understand, feel, or be able to do after watching?" /><div className="form-hint"><span>Make the first lines agree with the title.</span><span>{description.length}/5000</span></div>
    <label className="field-label" htmlFor="tags">Related tags <span className="optional-tag">OPTIONAL</span></label><div className="field-with-icon"><Tag size={16} /><input id="tags" value={tags} onChange={(event) => update({ tags: event.target.value.slice(0, 300) })} maxLength={300} placeholder="Separate topics with commas" /></div><div className="form-hint"><span>Tags are not a demand or ranking estimate.</span><span>{tagList.length} topics</span></div>
    <label className="field-label" htmlFor="thumb-url">Thumbnail image URL <span className="optional-tag">OPTIONAL</span></label><input className="text-input" id="thumb-url" value={thumbnailUrl} onChange={(event) => update({ thumbnailUrl: event.target.value.slice(0, 2000) })} maxLength={2000} type="url" placeholder="https://…" /><div className="form-hint"><span>HTTPS image URLs only. Your browser loads the image directly from its host.</span></div>
    {thumbnailUrl && !safeImage && <p className="form-error" role="status">Enter a valid HTTPS image URL to preview it.</p>}
    <button type="button" className="button button-primary check-button" onClick={() => setChecked(true)} disabled={!title.trim() && !comparisonTitle.trim()}>Review this draft <ArrowRight size={15} /></button>{storageNotice ? <p className="form-error" role="status">{storageNotice}</p> : <p className="provider-note">Edits save in this browser when local storage is available. Nothing is uploaded to Velnor or YouTube.</p>}
  </section><aside className="packaging-aside">
    <section className="surface feedback-card"><div className="surface-heading"><div><p className="eyebrow">REVIEW</p><h2>{checked ? "A practical review." : "A second look."}</h2></div></div><p className="section-copy">{checked ? "Use this human checklist to check clarity and accuracy. It does not predict clicks or rank titles." : "Check for a clear promise, a truthful opening and a thumbnail that adds useful context."}</p>{checked ? <ul className="feedback-list">{tips.map((tip) => <li key={tip}><span><Check size={13} /></span>{tip}</li>)}</ul> : <div className="mini-checklist"><span><Check size={13} /> Does the promise fit the actual video?</span><span><Check size={13} /> Can the thumbnail read at a glance?</span><span><Check size={13} /> Do tags match real topics?</span></div>}
    </section>
    <section className="surface thumb-card"><div className="surface-heading"><div><p className="eyebrow">PREVIEW</p><h2>Thumbnail</h2></div><span className="aspect-ratio">16:9</span></div><div className="thumbnail-preview">{safeImage ? <img src={safeImage} alt="Thumbnail preview supplied by you" referrerPolicy="no-referrer" /> : <div className="thumb-placeholder"><span>Your image preview</span></div>}<span className="thumb-preview-title">{title || comparisonTitle || "Your video title goes here"}</span></div><p className="image-caption">Velnor doesn’t score or inspect image contents. The image host can see your browser request.</p></section>
  </aside></div>;
}

function Library({ ideas, setIdeas, scripts, setScripts, onSchedule, onOpenResearch, storageNotice }: { ideas: Idea[]; setIdeas: (update: IdeasUpdate) => void; scripts: ScriptDraft[]; setScripts: (update: ScriptDraft[] | ((scripts: ScriptDraft[]) => ScriptDraft[])) => void; onSchedule: (id: string, date: string) => void; onOpenResearch: () => void; storageNotice: string }) {
  const [tab, setTab] = useState<"ideas" | "scripts">("ideas");
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptTitle, setScriptTitle] = useState("");
  const [scriptContent, setScriptContent] = useState("");
  function saveScript(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = scriptTitle.trim();
    if (!cleanTitle) return;
    if (scriptId) setScripts((items) => items.map((draft) => draft.id === scriptId ? { ...draft, title: cleanTitle, content: scriptContent, updatedAt: Date.now() } : draft));
    else setScripts((items) => [{ id: crypto.randomUUID(), title: cleanTitle, content: scriptContent, updatedAt: Date.now() }, ...items]);
    setScriptId(null); setScriptTitle(""); setScriptContent("");
  }

  function editScript(draft: ScriptDraft) {
    setScriptId(draft.id); setScriptTitle(draft.title); setScriptContent(draft.content);
  }

  return <section className="surface library-surface"><div className="surface-heading"><div><p className="eyebrow">LIBRARY</p><h2>Saved work</h2></div></div>
    <div className="library-tabs" role="group" aria-label="Saved work type"><button type="button" className={tab === "ideas" ? "selected" : ""} aria-pressed={tab === "ideas"} onClick={() => { setTab("ideas"); setScriptId(null); }}>Ideas <span>{ideas.length}</span></button><button type="button" className={tab === "scripts" ? "selected" : ""} aria-pressed={tab === "scripts"} onClick={() => { setTab("scripts"); setScriptId(null); }}>Scripts <span>{scripts.length}</span></button></div>
    {tab === "ideas" && (!ideas.length ? <div className="empty-large"><h3>No saved ideas yet.</h3><p>Save an idea from research and it will appear here.</p><div className="empty-actions"><button className="button button-primary" onClick={onOpenResearch}><Lightbulb size={15} /> Explore ideas</button></div></div> : <div className="library-list">{ideas.map((idea, index) => <article className="library-item" key={idea.id}><span className="library-number">{String(index + 1).padStart(2, "0")}</span><div className="library-main"><h3>{idea.title}</h3><p>{idea.angle}</p>{idea.hook && <p className="saved-hook"><b>Hook:</b> {idea.hook}</p>}{idea.outline && <details className="outline-details saved-outline"><summary>Show outline and brief</summary><ol>{idea.outline.map((step, stepIndex) => <li key={`${stepIndex}-${step}`}>{step}</li>)}</ol>{idea.audience && <small>For {idea.audience}{idea.format ? ` · ${formatLabels[idea.format]}` : ""}{idea.goal ? ` · ${goalLabels[idea.goal]}` : ""}</small>}{idea.source && <small>Drafted with {idea.source === "local" ? "the local framework" : idea.source}</small>}</details>}<small>Saved {new Date(idea.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div><div className="library-controls"><label className="sr-only" htmlFor={`date-${idea.id}`}>Choose a publish date for {idea.title}</label><input id={`date-${idea.id}`} type="date" value={idea.date ?? ""} onChange={(event) => onSchedule(idea.id, event.target.value)} aria-label={`Schedule ${idea.title}`} /><button className="remove-button" onClick={() => setIdeas((items) => items.filter((item) => item.id !== idea.id))} aria-label={`Remove ${idea.title}`} title="Remove from saved work"><X size={15} /></button></div></article>)}</div>)}
    {tab === "scripts" && <div className="script-workspace"><form className="script-editor" onSubmit={saveScript}><div className="script-editor-heading"><b>{scriptId ? "Continue the draft" : "Start with a blank page"}</b><span>{scriptContent.length.toLocaleString()}/10,000</span></div><label className="sr-only" htmlFor="script-title">Script draft title</label><input id="script-title" className="text-input" maxLength={120} value={scriptTitle} onChange={(event) => setScriptTitle(event.target.value)} placeholder="Name this script" /><label className="sr-only" htmlFor="script-content">Script draft</label><textarea id="script-content" className="text-area script-textarea" maxLength={10000} rows={9} value={scriptContent} onChange={(event) => setScriptContent(event.target.value)} placeholder="Hook, outline, first line, the ending you haven’t found yet…" /><div className="script-editor-footer"><span>Saved on this device only.</span><div>{scriptId && <button className="button button-quiet" type="button" onClick={() => { setScriptId(null); setScriptTitle(""); setScriptContent(""); }}>Cancel edit</button>}<button className="button button-primary" type="submit" disabled={!scriptTitle.trim()}><Check size={14} /> {scriptId ? "Update script" : "Save script"}</button></div></div></form>
      {!scripts.length ? <div className="script-empty"><FileText size={16} /><span>Your first draft can start here.</span></div> : <div className="script-list">{scripts.map((draft) => <article className="script-item" key={draft.id}><div><h3>{draft.title}</h3><p>{draft.content || "An empty page, still full of possibilities."}</p><small>Updated {new Date(draft.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div><div className="script-controls"><button className="button button-quiet" onClick={() => editScript(draft)}>Edit</button><button className="remove-button" onClick={() => setScripts((items) => items.filter((item) => item.id !== draft.id))} aria-label={`Remove script ${draft.title}`} title="Remove script"><X size={15} /></button></div></article>)}</div>}</div>}
    <div className="local-storage-note"><span><CircleHelp size={14} /></span><p role={storageNotice ? "status" : undefined}>{storageNotice || "Saved ideas, scripts and dates live in this browser. Clear browser storage and this device’s copy will be removed."}</p></div>
  </section>;
}

function Calendar({ ideas, onSchedule, onOpenLibrary, storageNotice }: { ideas: Idea[]; onSchedule: (id: string, date: string) => void; onOpenLibrary: () => void; storageNotice: string }) {
  const unscheduled = ideas.filter((idea) => !idea.date);
  const scheduled = ideas.filter((idea) => idea.date).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return <div className="calendar-layout"><section className="calendar-main"><div className="surface-heading"><div><p className="eyebrow">THE NEXT FEW WEEKS</p><h2>A plan that can breathe.</h2></div></div><p className="section-copy">A simple home for your publish dates. Nothing gets shared or published from this calendar.</p>{storageNotice && <p className="form-error" role="status">{storageNotice}</p>}
    {!scheduled.length ? <div className="empty-large calendar-empty"><h3>No publish days on the horizon.</h3><p>Add a date to any saved idea and it will appear here.</p><button className="button button-quiet" onClick={onOpenLibrary}>See saved work <ArrowRight size={14} /></button></div> : <div className="calendar-list">{scheduled.map((idea) => <div className="calendar-item" key={idea.id}><div className="date-block"><b>{new Date(`${idea.date}T12:00:00`).getDate()}</b><span>{new Date(`${idea.date}T12:00:00`).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span></div><div><h3>{idea.title}</h3><p>{idea.angle}</p></div><CalendarDays size={16} /></div>)}</div>}</section>
    <aside className="next-up"><p className="eyebrow">NOT ON THE CALENDAR YET</p><h2>Ideas with room to grow.</h2>{unscheduled.length ? unscheduled.slice(0, 4).map((idea) => <div className="unscheduled-item" key={idea.id}><div><b>{idea.title}</b><small>{idea.angle}</small></div><label className="sr-only" htmlFor={`cal-${idea.id}`}>Choose a date for {idea.title}</label><input id={`cal-${idea.id}`} type="date" onChange={(event) => event.target.value && onSchedule(idea.id, event.target.value)} /></div>) : <div className="calendar-nudge"><p>Save an idea first and keep it close here.</p><button className="text-link" onClick={onOpenLibrary}>Go to saved work <ArrowRight size={13} /></button></div>}</aside></div>;
}

function Settings({ aiConfigured, youtubeConfigured, youtubeAccount, youtubeAction, youtubeNotice, onConnectYoutube, onDisconnectYoutube }: { aiConfigured: boolean | null; youtubeConfigured: boolean; youtubeAccount: YoutubeAccount; youtubeAction: "idle" | "connecting" | "disconnecting"; youtubeNotice: string; onConnectYoutube: () => void; onDisconnectYoutube: () => void }) {
  const connected = youtubeAccount.connected && Boolean(youtubeAccount.channel);
  return <div className="settings-layout"><section className="settings-main" aria-label="Studio settings">
    <div className="setting-group"><h2>Workspace</h2><div className="setting-row"><div><b>Independent creator</b><small>Your workspace is stored locally in this browser.</small></div><span className="setting-status">Active</span></div></div>
    <div className="setting-group"><h2>Public research</h2><div className="setting-row"><div><b>YouTube Data API</b><small>Search public videos and channel profiles.</small></div><span className="setting-status">{youtubeConfigured ? "Key present · unverified" : "Not configured"}</span></div><div className="setting-details"><p>Set <code>YOUTUBE_API_KEY</code> in your local <code>.env.local</code> file to enable search. The key stays on the server. Search calls use Google API quota.</p><a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console <ArrowUpRight size={14} /></a></div>
      <div className="setting-row"><div><b>OpenAI idea drafting</b><small>Optional brief-based AI suggestions.</small></div><span className="setting-status">{aiConfigured === null ? "Checking…" : aiConfigured ? "Key present · unverified" : "Not configured"}</span></div><div className="setting-details"><p>Set <code>OPENAI_API_KEY</code> on the server to enable it. You can also set <code>OPENAI_IDEA_MODEL</code>. A brief is sent only when you select OpenAI drafting and may incur API charges. Local idea drafts need no key.</p></div></div>
    <div className="setting-group"><h2>Channel and storage</h2><div className="setting-row"><div><b>YouTube channel</b><small>{connected ? youtubeAccount.channel?.title : "Connect your own channel to see its analytics."}</small></div><span className="setting-status">{connected ? "Connected" : youtubeAccount.configured ? "Not connected" : "Needs setup"}</span></div><div className="setting-details"><p>Velnor requests read-only access to your channel profile and YouTube Analytics. It does not edit videos, publish content or access revenue data. Your encrypted sign-in stays in this browser, not in local storage, and the dashboard displays figures returned by YouTube.</p>{!youtubeAccount.configured && <p className="youtube-setup-note">To enable connection, configure Google OAuth on the server: <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REDIRECT_URI</code>, and <code>YOUTUBE_TOKEN_ENCRYPTION_KEY</code>. Enable YouTube Data API v3 and YouTube Analytics API in the same Google Cloud project. For this live site, the Google callback URL is <code>https://velnor-studio-next.vercel.app/api/youtube/oauth/callback</code>.</p>}{youtubeAccount.error === "analytics_api_unavailable" && <p className="youtube-setup-note">The channel is connected, but the YouTube Analytics API is not responding. Confirm that it is enabled for your Google Cloud project and that your account granted analytics access.</p>}{youtubeAccount.error === "reconnect_required" && <p className="youtube-setup-note">Google access expired or was revoked. Reconnect your channel to continue seeing analytics.</p>}{youtubeNotice && <p className={youtubeNotice.includes("connected") ? "youtube-message" : "youtube-message youtube-message-error"} role="status">{youtubeNotice}</p>}<div className="youtube-actions">{connected ? <button className="button button-secondary" onClick={onDisconnectYoutube} disabled={youtubeAction !== "idle"}>{youtubeAction === "disconnecting" ? "Disconnecting…" : "Disconnect YouTube"}</button> : <button className="button button-primary" onClick={onConnectYoutube} disabled={!youtubeAccount.configured || youtubeAction !== "idle"}>{youtubeAction === "connecting" ? "Opening Google…" : "Connect YouTube"}</button>}</div><small className="metric-note">Access is read-only. Disconnecting removes Velnor’s saved connection and asks Google to revoke its token.</small></div>
      <div className="setting-row"><div><b>Cloud save and sign-in</b><small>Sync your work across devices.</small></div><span className="setting-status">Unavailable</span></div><div className="setting-details"><p>Supabase is not wired up. Ideas, scripts, publish dates and packaging drafts stay in this browser. Velnor does not invent analytics, search volumes or title rankings.</p></div></div>
  </section></div>;
}
