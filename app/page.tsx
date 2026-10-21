"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
// YouTube and creator-supplied thumbnail URLs are dynamic; optimizing arbitrary remote hosts would require broader image-host configuration.
/* eslint-disable @next/next/no-img-element */
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Bookmark, CalendarDays, Check, ChevronDown,
  CircleHelp, Compass, FileText, FlaskConical, LayoutDashboard, Lightbulb, Menu, MoreHorizontal,
  Play, Search, Settings2, Sparkles, Tag, Target, TrendingUp, X,
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
  { label: "WORKSPACE", items: [{ id: "overview", name: "Overview", icon: LayoutDashboard }, { id: "research", name: "Idea research", icon: Lightbulb }, { id: "packaging", name: "Video packaging", icon: Target }] },
  { label: "YOUR STUDIO", items: [{ id: "library", name: "Saved work", icon: Bookmark }, { id: "calendar", name: "Content calendar", icon: CalendarDays }] },
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

  useEffect(() => {
    let current = true;
    fetch("/api/ideas", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { aiConfigured?: unknown; youtubeConfigured?: unknown }) => { if (current) { setAiConfigured(data.aiConfigured === true); setYoutubeConfigured(data.youtubeConfigured === true); } })
      .catch(() => { if (current) { setAiConfigured(false); setYoutubeConfigured(false); } });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!mobileNav) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        document.getElementById("mobile-nav-toggle")?.focus();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
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
      <aside id="studio-navigation" className={`sidebar ${mobileNav ? "sidebar-open" : ""}`} aria-label="Main navigation">
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setSection("overview"); closeMobileNavigation(); }} aria-label="Velnor Studio home">
          <span className="brand-mark"><span /><span /><span /></span><span className="brand-name">velnor<span>.</span></span>
        </a>
        <button className="workspace-switcher" type="button" aria-label="Workspace: Independent creator">
          <span className="workspace-avatar">S</span><span className="switcher-copy"><b>My studio</b><small>Independent creator</small></span><ChevronDown size={15} />
        </button>
        <nav className="nav-groups">
          {navGroups.map((group) => <div className="nav-group" key={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.items.map(({ id, name, icon: Icon }) => <button key={id} className={`nav-item ${section === id ? "active" : ""}`} onClick={() => { setSection(id); closeMobileNavigation(); }} aria-current={section === id ? "page" : undefined}>
              <Icon size={17} strokeWidth={1.8} /><span>{name}</span>{id === "library" && ideas.length > 0 && <span className="nav-count">{ideas.length}</span>}
            </button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="connect-card"><div className="connect-icon"><Play size={16} fill="currentColor" /></div><b>Your channel, when you’re ready.</b><p>Connect YouTube Studio analytics to see your own channel trends.</p><button onClick={() => { setSection("settings"); closeMobileNavigation(); }}>Explore connection <ArrowRight size={14} /></button></div>
          <button className={`nav-item ${section === "settings" ? "active" : ""}`} onClick={() => { setSection("settings"); closeMobileNavigation(); }}><Settings2 size={17} /><span>Settings</span></button>
          <div className="profile-row"><div className="profile-avatar">V</div><div><b>Creator workspace</b><small>Local account</small></div><MoreHorizontal size={18} className="muted-icon" /></div>
        </div>
      </aside>

      {mobileNav && <button className="mobile-scrim" onClick={closeMobileNavigation} aria-label="Close navigation" />}
      <main id="main-content" className="main-area">
        <header className="topbar">
          <button id="mobile-nav-toggle" className="mobile-menu" aria-label="Open navigation" aria-expanded={mobileNav} aria-controls="studio-navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="crumb"><span>My studio</span><span className="crumb-sep">/</span><b>{navGroups.flatMap((group) => group.items).find((item) => item.id === section)?.name ?? "Settings"}</b></div>
          <div className="topbar-actions"><span className="demo-badge"><span className="demo-dot" />Workspace preview</span><button className="icon-button" title="Help and guidance"><CircleHelp size={18} /></button></div>
        </header>

        <div className="page-wrap">
          <div className="page-heading"><div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="page-subtitle">{page.subtitle}</p></div>
            <div className="heading-actions">{section !== "overview" && <button className="button button-quiet" onClick={() => setSection("overview")}><ArrowDownRight size={15} /> Overview</button>}{section === "overview" && <button className="button button-primary" onClick={() => setSection("research")}><Sparkles size={15} /> Find an idea</button>}</div>
          </div>

          {section === "overview" && <Overview ideas={ideas} scheduled={scheduled} onOpen={setSection} />}
          {section === "research" && <Research topic={topic} setTopic={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setTopic(value); }} audience={audience} setAudience={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setAudience(value); }} videoFormat={videoFormat} setVideoFormat={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setVideoFormat(value); }} videoGoal={videoGoal} setVideoGoal={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setVideoGoal(value); }} constraints={constraints} setConstraints={(value) => { generationRef.current += 1; setGenerated([]); setIdeaStatus("idle"); setIdeaError(""); setConstraints(value); }} generated={generated} generatedSource={generatedSource} makePrompts={makePrompts} makeAiPrompts={makeAiPrompts} aiConfigured={aiConfigured} ideaStatus={ideaStatus} ideaError={ideaError} storageNotice={storageNotice} onSave={saveIdea} search={search} setSearch={setSearch} searchType={searchType} setSearchType={(type) => { setSearchType(type); setResults([]); setSearchAsOf(null); setSearchStatus("idle"); setSearchError(""); }} findVideos={findVideos} searchStatus={searchStatus} searchError={searchError} results={results} searchAsOf={searchAsOf} />}
          {section === "packaging" && <Packaging draft={packagingDraft} update={updatePackaging} checked={packagingChecked} setChecked={setPackagingChecked} storageNotice={storageNotice} />}
          {section === "library" && <Library ideas={ideas} setIdeas={setIdeas} scripts={scripts} setScripts={setScripts} onSchedule={scheduleIdea} onOpenCalendar={() => setSection("calendar")} storageNotice={storageNotice} />}
          {section === "calendar" && <Calendar ideas={ideas} onSchedule={scheduleIdea} onOpenLibrary={() => setSection("library")} storageNotice={storageNotice} />}
          {section === "settings" && <Settings aiConfigured={aiConfigured} youtubeConfigured={youtubeConfigured} />}

          <footer className="page-footer"><span>Thoughtful tools for the long game.</span><span>Velnor Studio <i>·</i> Preview</span></footer>
        </div>
      </main>
    </div>
  );
}

function Overview({ ideas, scheduled, onOpen }: { ideas: Idea[]; scheduled: Idea[]; onOpen: (section: Section) => void }) {
  return <>
    <div className="demo-note"><span className="demo-note-icon"><FlaskConical size={15} /></span><div><b>Your studio, ready for real data</b><span>Private channel analytics are not connected. This dashboard does not show example performance numbers.</span></div><button onClick={() => onOpen("settings")}>How it works <ArrowRight size={13} /></button></div>
    <section className="metric-grid" aria-label="Your saved work and channel connection status">
      {[{ label: "Subscribers", value: "—", note: "Connect a channel", icon: Play, color: "violet" }, { label: "Views this month", value: "—", note: "Your data, when linked", icon: TrendingUp, color: "cyan" }, { label: "Ideas in your studio", value: String(ideas.length).padStart(2, "0"), note: "Saved in this browser", icon: Lightbulb, color: "amber" }, { label: "On your calendar", value: String(scheduled.length).padStart(2, "0"), note: "Planned publishing days", icon: CalendarDays, color: "pink" }].map(({ label, value, note, icon: Icon, color }) => <article className="metric-card" key={label}><div className={`metric-icon ${color}`}><Icon size={17} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></article>)}
    </section>
    <div className="dashboard-grid">
      <section className="surface performance-panel"><div className="surface-heading"><div><p className="eyebrow">YOUR CHANNEL</p><h2>A clearer view starts here</h2></div><span className="soft-pill">No channel connected</span></div>
        <div className="chart-empty"><div className="chart-illustration"><svg viewBox="0 0 560 160" role="img" aria-label="Empty chart area; no channel analytics are connected"><path d="M12 40H548 M12 80H548 M12 120H548" fill="none" stroke="#292831" strokeWidth="1" strokeDasharray="3 6"/></svg><div className="chart-overlay"><span className="chart-star"><Sparkles size={17} /></span><b>Your channel data will appear here.</b><span>Connect an owner-authorized channel to see your own performance.</span><button className="button button-quiet" onClick={() => onOpen("settings")}>See connection options <ArrowRight size={14} /></button></div></div><div className="chart-labels"><span>Analytics unavailable</span><span>No channel connected</span></div></div>
      </section>
      <section className="surface next-panel"><div className="surface-heading"><div><p className="eyebrow">A GOOD NEXT STEP</p><h2>Start with a question</h2></div><span className="round-icon"><Compass size={16} /></span></div><p className="next-copy">The best ideas often begin with something your viewers keep wondering about.</p><button className="step-row" onClick={() => onOpen("research")}><span className="step-num">01</span><span><b>Explore an idea</b><small>Shape an audience question into a video</small></span><ArrowRight size={15} /></button><button className="step-row" onClick={() => onOpen("packaging")}><span className="step-num">02</span><span><b>Refine its packaging</b><small>Make the promise clear and human</small></span><ArrowRight size={15} /></button><button className="step-row" onClick={() => onOpen("calendar")}><span className="step-num">03</span><span><b>Give it a day</b><small>Save an idea for when the time is right</small></span><ArrowRight size={15} /></button></section>
    </div>
    <section className="surface ideas-panel"><div className="surface-heading"><div><p className="eyebrow">OPEN LOOPS</p><h2>Room for what’s next</h2></div><button className="text-link" onClick={() => onOpen("library")}>Your saved work <ArrowRight size={14} /></button></div>
      {ideas.length > 0 ? <div className="recent-ideas">{ideas.slice(0, 3).map((idea, index) => <div className="recent-idea" key={idea.id}><span className="idea-index">{String(index + 1).padStart(2, "0")}</span><div><b>{idea.title}</b><small>{idea.angle}</small></div><span className="saved-label"><Check size={12} /> Saved</span></div>)}</div> : <div className="empty-inline"><span className="empty-glyph"><Lightbulb size={18} /></span><div><b>No ideas saved yet.</b><span>Keep the good ones close when they arrive.</span></div><button className="button button-quiet" onClick={() => onOpen("research")}>Explore ideas <ArrowRight size={14} /></button></div>}
    </section>
    <div className="quote-strip"><span className="quote-mark">“</span><p>Make the kind of work that gives you a little more energy than it takes.</p><span className="quote-credit">A NOTE TO YOUR FUTURE SELF</span></div>
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
      <div className="surface-heading"><div><p className="eyebrow">01 — SHAPE A BRIEF</p><h2>Start with the viewer.</h2></div><span className="round-icon"><Sparkles size={16} /></span></div>
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
      {generated.length === 0 && <div className="prompt-guide"><div className="guide-head"><span><FlaskConical size={14} /> EDITORIAL STARTERS</span><span>NO SCORES OR PERFORMANCE PROMISES</span></div><div className="angle-pills">{suggestedAngles.slice(0, 3).map((angle) => <span key={angle}>{angle}</span>)}</div></div>}
    </section>
    <section className="surface video-search-panel"><div className="surface-heading"><div><p className="eyebrow">02 — RESEARCH IN PUBLIC</p><h2>{searchType === "channel" ? "Compare public profiles." : "Explore published videos."}</h2></div><span className="round-icon cyan">{searchType === "channel" ? <Compass size={15} /> : <Play size={15} />}</span></div><p className="section-copy">{searchType === "channel" ? "Public profile fields returned by YouTube Data API v3. A profile snapshot cannot show audience fit, quality or growth over time." : "Search public YouTube video metadata for context. Results are ordered by YouTube relevance, not view count, trend strength or likely performance."}</p>
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
  return <div className="packaging-layout"><section className="surface packaging-form"><div className="surface-heading"><div><p className="eyebrow">THE WORKING DRAFT</p><h2>Compare the promise.</h2></div><span className="round-icon"><FileText size={16} /></span></div><p className="section-copy">Edit two title options side by side, then review the description, tags and thumbnail against the video you plan to make. Velnor assigns no performance score.</p>
    <div className="title-input-grid"><div><label className="field-label" htmlFor="video-title">Title A <span className="field-count">{title.length}/100</span></label><input className="text-input" id="video-title" value={title} onChange={(event) => update({ title: event.target.value.slice(0, 100) })} maxLength={100} placeholder="State the clearest promise" /></div><div><label className="field-label" htmlFor="comparison-title">Title B <span className="field-count">{comparisonTitle.length}/100</span></label><input className="text-input" id="comparison-title" value={comparisonTitle} onChange={(event) => update({ comparisonTitle: event.target.value.slice(0, 100) })} maxLength={100} placeholder="Try a distinct angle" /></div></div>
    <div className="title-comparison" aria-live="polite"><div className="title-variant"><span>TITLE A · {title.length} CHARACTERS · {title.trim() ? title.trim().split(/\s+/).length : 0} WORDS</span><b>{title.trim() || "Your first title draft"}</b></div><div className="title-variant"><span>TITLE B · {comparisonTitle.length} CHARACTERS · {comparisonTitle.trim() ? comparisonTitle.trim().split(/\s+/).length : 0} WORDS</span><b>{comparisonTitle.trim() || "Your alternate title draft"}</b></div></div>
    <p className="comparison-reasoning">{comparisonNote}</p>
    <label className="field-label" htmlFor="description">Description <span className="field-count">{description.length}/5000</span></label><textarea className="text-area" id="description" rows={5} maxLength={5000} value={description} onChange={(event) => update({ description: event.target.value })} placeholder="What will a viewer understand, feel, or be able to do after watching?" /><div className="form-hint"><span>Make the first lines agree with the title.</span><span>{description.length}/5000</span></div>
    <label className="field-label" htmlFor="tags">Related tags <span className="optional-tag">OPTIONAL</span></label><div className="field-with-icon"><Tag size={16} /><input id="tags" value={tags} onChange={(event) => update({ tags: event.target.value.slice(0, 300) })} maxLength={300} placeholder="Separate topics with commas" /></div><div className="form-hint"><span>Tags are not a demand or ranking estimate.</span><span>{tagList.length} topics</span></div>
    <label className="field-label" htmlFor="thumb-url">Thumbnail image URL <span className="optional-tag">OPTIONAL</span></label><input className="text-input" id="thumb-url" value={thumbnailUrl} onChange={(event) => update({ thumbnailUrl: event.target.value.slice(0, 2000) })} maxLength={2000} type="url" placeholder="https://…" /><div className="form-hint"><span>HTTPS image URLs only. Your browser loads the image directly from its host.</span></div>
    {thumbnailUrl && !safeImage && <p className="form-error" role="status">Enter a valid HTTPS image URL to preview it.</p>}
    <button type="button" className="button button-primary check-button" onClick={() => setChecked(true)} disabled={!title.trim() && !comparisonTitle.trim()}>Review this draft <ArrowRight size={15} /></button>{storageNotice ? <p className="form-error" role="status">{storageNotice}</p> : <p className="provider-note">Edits save in this browser when local storage is available. Nothing is uploaded to Velnor or YouTube.</p>}
  </section><aside className="packaging-aside">
    <section className="surface feedback-card"><div className="surface-heading"><div><p className="eyebrow">EDITOR’S MARGIN</p><h2>{checked ? "A practical review." : "A quiet second look."}</h2></div><span className="round-icon cyan"><Target size={16} /></span></div><p className="section-copy">{checked ? "Use this human checklist to check clarity and accuracy. It does not predict clicks or rank titles." : "Look for a clear promise, a truthful opening and a thumbnail that adds useful context."}</p>{checked ? <ul className="feedback-list">{tips.map((tip) => <li key={tip}><span><Check size={13} /></span>{tip}</li>)}</ul> : <div className="mini-checklist"><span><Check size={13} /> Does the promise fit the actual video?</span><span><Check size={13} /> Can the thumbnail read at a glance?</span><span><Check size={13} /> Do tags match real topics?</span></div>}
    </section>
    <section className="surface thumb-card"><div className="surface-heading"><div><p className="eyebrow">AT A GLANCE</p><h2>Thumbnail preview</h2></div><span className="soft-pill">16:9</span></div><div className="thumbnail-preview">{safeImage ? <img src={safeImage} alt="Thumbnail preview supplied by you" referrerPolicy="no-referrer" /> : <div className="thumb-placeholder"><span className="thumb-shape" /><span className="thumb-shape small" /><span className="thumb-caption">Your image here</span></div>}<span className="thumb-preview-title">{title || comparisonTitle || "Your video title goes here"}</span></div><p className="image-caption">Layout preview only. Velnor doesn’t score or inspect image contents. The image host can see your browser request.</p></section>
  </aside></div>;
}

function Library({ ideas, setIdeas, scripts, setScripts, onSchedule, onOpenCalendar, storageNotice }: { ideas: Idea[]; setIdeas: (update: IdeasUpdate) => void; scripts: ScriptDraft[]; setScripts: (update: ScriptDraft[] | ((scripts: ScriptDraft[]) => ScriptDraft[])) => void; onSchedule: (id: string, date: string) => void; onOpenCalendar: () => void; storageNotice: string }) {
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

  return <section className="surface library-surface"><div className="surface-heading"><div><p className="eyebrow">KEPT CLOSE</p><h2>Your studio shelf <span className="count-pill">{ideas.length + scripts.length}</span></h2></div><span className="round-icon"><Bookmark size={16} /></span></div>
    <div className="library-tabs" role="group" aria-label="Saved work type"><button type="button" className={tab === "ideas" ? "selected" : ""} aria-pressed={tab === "ideas"} onClick={() => { setTab("ideas"); setScriptId(null); }}>Ideas <span>{ideas.length}</span></button><button type="button" className={tab === "scripts" ? "selected" : ""} aria-pressed={tab === "scripts"} onClick={() => { setTab("scripts"); setScriptId(null); }}>Scripts <span>{scripts.length}</span></button></div>
    {tab === "ideas" && (!ideas.length ? <div className="empty-large"><span className="empty-glyph large"><Bookmark size={22} /></span><h3>A clean page has its own kind of promise.</h3><p>When an idea feels worth keeping, save it from your research desk and it will meet you here.</p><div className="empty-actions"><button className="button button-primary" onClick={onOpenCalendar}><Lightbulb size={15} /> Explore an idea</button></div></div> : <div className="library-list">{ideas.map((idea, index) => <article className="library-item" key={idea.id}><span className="library-number">{String(index + 1).padStart(2, "0")}</span><div className="library-main"><h3>{idea.title}</h3><p>{idea.angle}</p>{idea.hook && <p className="saved-hook"><b>Hook:</b> {idea.hook}</p>}{idea.outline && <details className="outline-details saved-outline"><summary>Show outline and brief</summary><ol>{idea.outline.map((step, stepIndex) => <li key={`${stepIndex}-${step}`}>{step}</li>)}</ol>{idea.audience && <small>For {idea.audience}{idea.format ? ` · ${formatLabels[idea.format]}` : ""}{idea.goal ? ` · ${goalLabels[idea.goal]}` : ""}</small>}{idea.source && <small>Drafted with {idea.source === "local" ? "the local framework" : idea.source}</small>}</details>}<small>Saved {new Date(idea.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div><div className="library-controls"><label className="sr-only" htmlFor={`date-${idea.id}`}>Choose a publish date for {idea.title}</label><input id={`date-${idea.id}`} type="date" value={idea.date ?? ""} onChange={(event) => onSchedule(idea.id, event.target.value)} aria-label={`Schedule ${idea.title}`} /><button className="remove-button" onClick={() => setIdeas((items) => items.filter((item) => item.id !== idea.id))} aria-label={`Remove ${idea.title}`} title="Remove from saved work"><X size={15} /></button></div></article>)}</div>)}
    {tab === "scripts" && <div className="script-workspace"><form className="script-editor" onSubmit={saveScript}><div className="script-editor-heading"><b>{scriptId ? "Continue the draft" : "Start with a blank page"}</b><span>{scriptContent.length.toLocaleString()}/10,000</span></div><label className="sr-only" htmlFor="script-title">Script draft title</label><input id="script-title" className="text-input" maxLength={120} value={scriptTitle} onChange={(event) => setScriptTitle(event.target.value)} placeholder="Name this script" /><label className="sr-only" htmlFor="script-content">Script draft</label><textarea id="script-content" className="text-area script-textarea" maxLength={10000} rows={9} value={scriptContent} onChange={(event) => setScriptContent(event.target.value)} placeholder="Hook, outline, first line, the ending you haven’t found yet…" /><div className="script-editor-footer"><span>Saved on this device only.</span><div>{scriptId && <button className="button button-quiet" type="button" onClick={() => { setScriptId(null); setScriptTitle(""); setScriptContent(""); }}>Cancel edit</button>}<button className="button button-primary" type="submit" disabled={!scriptTitle.trim()}><Check size={14} /> {scriptId ? "Update script" : "Save script"}</button></div></div></form>
      {!scripts.length ? <div className="script-empty"><FileText size={16} /><span>Your first draft can start here.</span></div> : <div className="script-list">{scripts.map((draft) => <article className="script-item" key={draft.id}><div><h3>{draft.title}</h3><p>{draft.content || "An empty page, still full of possibilities."}</p><small>Updated {new Date(draft.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div><div className="script-controls"><button className="button button-quiet" onClick={() => editScript(draft)}>Edit</button><button className="remove-button" onClick={() => setScripts((items) => items.filter((item) => item.id !== draft.id))} aria-label={`Remove script ${draft.title}`} title="Remove script"><X size={15} /></button></div></article>)}</div>}</div>}
    <div className="local-storage-note"><span><CircleHelp size={14} /></span><p role={storageNotice ? "status" : undefined}>{storageNotice || "Saved ideas, scripts and dates live in this browser. Clear browser storage and this device’s copy will be removed."}</p></div>
  </section>;
}

function Calendar({ ideas, onSchedule, onOpenLibrary, storageNotice }: { ideas: Idea[]; onSchedule: (id: string, date: string) => void; onOpenLibrary: () => void; storageNotice: string }) {
  const unscheduled = ideas.filter((idea) => !idea.date);
  const scheduled = ideas.filter((idea) => idea.date).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return <div className="calendar-layout"><section className="surface calendar-main"><div className="surface-heading"><div><p className="eyebrow">THE NEXT FEW WEEKS</p><h2>A plan that can breathe.</h2></div><span className="round-icon"><CalendarDays size={16} /></span></div><p className="section-copy">A simple home for your publish dates. Nothing gets shared or published from this calendar.</p>{storageNotice && <p className="form-error" role="status">{storageNotice}</p>}
    {!scheduled.length ? <div className="empty-large calendar-empty"><span className="empty-glyph large"><CalendarDays size={22} /></span><h3>No publish days on the horizon.</h3><p>Add a date to any saved idea and it will appear here.</p><button className="button button-quiet" onClick={onOpenLibrary}>See saved work <ArrowRight size={14} /></button></div> : <div className="calendar-list">{scheduled.map((idea) => <div className="calendar-item" key={idea.id}><div className="date-block"><b>{new Date(`${idea.date}T12:00:00`).getDate()}</b><span>{new Date(`${idea.date}T12:00:00`).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span></div><div><h3>{idea.title}</h3><p>{idea.angle}</p></div><CalendarDays size={16} /></div>)}</div>}</section>
    <aside className="surface next-up"><p className="eyebrow">NOT ON THE CALENDAR YET</p><h2>Ideas with room to grow.</h2>{unscheduled.length ? unscheduled.slice(0, 4).map((idea) => <div className="unscheduled-item" key={idea.id}><div><b>{idea.title}</b><small>{idea.angle}</small></div><label className="sr-only" htmlFor={`cal-${idea.id}`}>Choose a date for {idea.title}</label><input id={`cal-${idea.id}`} type="date" onChange={(event) => event.target.value && onSchedule(idea.id, event.target.value)} /></div>) : <div className="calendar-nudge"><span className="empty-glyph"><Lightbulb size={17} /></span><p>Save an idea first and keep it close here.</p><button className="text-link" onClick={onOpenLibrary}>Go to saved work <ArrowRight size={13} /></button></div>}</aside></div>;
}

function Settings({ aiConfigured, youtubeConfigured }: { aiConfigured: boolean | null; youtubeConfigured: boolean }) {
  return <div className="settings-layout"><section className="surface settings-main"><div className="surface-heading"><div><p className="eyebrow">STUDIO PREFERENCES</p><h2>Your creative home base.</h2></div><span className="round-icon"><Settings2 size={16} /></span></div><div className="setting-row"><div className="setting-icon"><span>V</span></div><div><b>Independent creator</b><small>Workspace type · Local browser workspace</small></div><span className="soft-pill">Local</span></div>
    <div className="setting-row"><div className="setting-icon"><Play size={16} /></div><div><b>Public YouTube research</b><small>YouTube Data API key status</small></div><span className="soft-pill">{youtubeConfigured ? "Key present · unverified" : "Not configured"}</span></div><div className="setting-details"><b>Public catalog search</b><p>Set <code>YOUTUBE_API_KEY</code> in your local <code>.env.local</code> to enable public video and channel search. The key stays on the server. Search calls consume Google API quota; configure Google Cloud quota and restrictions before public deployment.</p><a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Open Google Cloud Console <ArrowUpRight size={13} /></a></div>
    <div className="setting-row"><div className="setting-icon cyan"><Sparkles size={16} /></div><div><b>Optional OpenAI idea drafting</b><small>Three ideas, hooks, reasoning and outlines</small></div><span className="soft-pill">{aiConfigured === null ? "Checking…" : aiConfigured ? "Key present · unverified" : "Not configured"}</span></div><div className="setting-details"><b>Only used after you choose OpenAI drafting</b><p>Set <code>OPENAI_API_KEY</code> on the server and optionally choose <code>OPENAI_IDEA_MODEL</code>. Selecting the OpenAI button sends the brief to OpenAI and may incur API usage charges. The local framework requires no account or key. Do not include private or sensitive details in a brief.</p></div>
    <div className="setting-row"><div className="setting-icon cyan"><Target size={16} /></div><div><b>Creator account analytics</b><small>Private channel performance and audience reports.</small></div><span className="soft-pill">Unavailable</span></div><div className="setting-details"><b>Requires an owner-authorized connection</b><p>No OAuth or YouTube Analytics integration is implemented. This workspace does not request channel permissions or show simulated private metrics.</p></div>
    <div className="setting-row"><div className="setting-icon"><CircleHelp size={16} /></div><div><b>Cloud save and sign-in</b><small>Sync your work across devices.</small></div><span className="soft-pill">Unavailable</span></div><div className="setting-details"><b>Supabase is not wired up</b><p>Supabase values in <code>.env.example</code> are reserved only. Saved ideas, scripts, dates and packaging drafts currently use this browser’s local storage.</p></div></section><aside className="surface settings-aside"><span className="setting-aside-glyph"><FlaskConical size={18} /></span><p className="eyebrow">A NOTE ABOUT THIS WORKSPACE</p><h2>Known sources, clear limits.</h2><p>Velnor does not invent analytics, search volumes, trends or title rankings. Public profile numbers come from YouTube when a key is configured; optional AI drafts are model suggestions, not research claims.</p><div className="settings-divider" /><p className="eyebrow">ON THIS DEVICE</p><h3>Your work stays local.</h3><p>Local browser storage is convenient for one device. Clearing browser data removes those saved drafts.</p></aside></div>;
}
