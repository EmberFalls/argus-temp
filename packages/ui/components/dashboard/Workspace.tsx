
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { activityRoles, demoFindings, evidenceFiles, runs, type Finding } from "@/lib/dashboard-content";

type Screen = "history" | "entry" | "parsing" | "running" | "results";
type Divider = "vertical" | "horizontal";

function StatusDot({ tone = "green" }: { tone?: "green" | "amber" | "gray" }) { return <i className={`dash-dot ${tone}`} aria-hidden="true" />; }

function Metric({ label, value, caption, tone = "" }: { label: string; value: string; caption?: string; tone?: string }) {
  return <article className="metric-card"><span>{label}</span><strong className={tone}>{value}</strong>{caption && <small>{caption}</small>}</article>;
}

function FindingRow({ finding, active, onClick }: { finding: Finding; active: boolean; onClick: () => void }) {
  const state = finding.status === "verified" ? "Verified" : finding.status === "pending" ? "Verifying" : "Rejected";
  return <button className={`finding-row ${active ? "selected" : ""}`} onClick={onClick}>
    <span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span>
    <span className="finding-copy"><strong>{finding.title}</strong><small><span className={`finding-state ${finding.status}`}>{state}</span><span>{finding.time}</span></small></span>
    <span className="finding-chevron" aria-hidden="true">›</span>
  </button>;
}

function Brand() { return <a className="dashboard-brand" href="/" aria-label="Argus home"><span className="brand-symbol">A</span><span>ARGUS</span></a>; }

export function Workspace() {
  const [screen, setScreen] = useState<Screen>("history");
  const [selectedRun, setSelectedRun] = useState<(typeof runs)[number]>(runs[0]);
  const [selectedFinding, setSelectedFinding] = useState<Finding>(demoFindings[0]);
  const [url, setUrl] = useState("");
  const [spec, setSpec] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [browserSplit, setBrowserSplit] = useState(60);
  const [topSplit, setTopSplit] = useState(70);
  const [dragging, setDragging] = useState<Divider | null>(null);
  const [copied, setCopied] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const running = screen === "running";
  const visibleFindings = useMemo(() => demoFindings, []);
  const findingArtifacts = selectedFinding.id === "f-01" ? evidenceFiles : [`${selectedFinding.id}-replay.png`, `${selectedFinding.id}-network.json`, `${selectedFinding.id}-console.txt`, `${selectedFinding.id}-repro.spec.ts`];

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      if (dragging === "vertical" && splitRef.current) {
        const rect = splitRef.current.getBoundingClientRect();
        setBrowserSplit(Math.max(30, Math.min(85, ((event.clientX - rect.left) / rect.width) * 100)));
      }
      if (dragging === "horizontal" && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        setTopSplit(Math.max(42, Math.min(82, ((event.clientY - rect.top) / rect.height) * 100)));
      }
    };
    const end = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
  }, [dragging]);

  const beginRun = useCallback(() => {
    setElapsed(0);
    setSelectedFinding(demoFindings[0]);
    setScreen("running");
  }, []);

  function startRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScreen("parsing");
    window.setTimeout(beginRun, 1500);
  }

  function chooseRun(run: (typeof runs)[number]) {
    setSelectedRun(run);
    setSelectedFinding(demoFindings[0]);
    setScreen("results");
  }

  function toggleSource(source: string) {
    setSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
  }

  function handleSplitKey(event: React.KeyboardEvent<HTMLDivElement>, axis: Divider) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -3 : 3;
    if (axis === "vertical") setBrowserSplit((value) => Math.max(30, Math.min(85, value + delta)));
    else setTopSplit((value) => Math.max(42, Math.min(82, value + delta)));
  }

  async function copyReport() {
    const report = `${selectedFinding.severity} ${selectedFinding.title}\n\n${selectedFinding.detail}\n\nExpected: ${selectedFinding.expected}\nActual: ${selectedFinding.actual}`;
    try { await navigator.clipboard.writeText(report); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }

  const isLive = screen === "running";
  const isResults = screen === "results";

  return <main className={`dashboard-shell ${fullScreen ? "dashboard-fullscreen" : ""}`}>
    <header className="dashboard-topbar"><Brand/><div className="topbar-run-context">
      {screen === "history" && <span className="topbar-muted">Workspace <b>/</b> Runs</span>}
      {screen === "entry" && <span className="topbar-muted">Workspace <b>/</b> New run</span>}
      {(isLive || isResults) && <><button className="spec-toggle" onClick={() => setScreen("entry")} title="Edit run specification">{isLive ? "Spec: " + (spec || "Conduit user journeys").slice(0, 36) : `${selectedRun.name} · ${selectedRun.time}`} <span>⌄</span></button><span className={`run-state ${isLive ? "is-running" : "is-complete"}`}><StatusDot tone={isLive ? "amber" : "green"}/>{isLive ? "RUNNING" : "COMPLETE"}</span><span className="run-timer">{isLive ? `00:${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}` : "04:12"}</span><span className="run-cost">$0.38</span></>}
    </div><div className="topbar-actions">
      {isLive && <button className="button button-outline button-small" onClick={() => setScreen("results")}>Finish demo</button>}
      {isResults && <><button className="button button-outline button-small" onClick={() => setScreen("entry")}>↻ Re-run</button><button className="button button-cream button-small" onClick={() => void copyReport()}>↓ {copied ? "Copied" : "Export"}</button></>}
      <a className="topbar-home" href="/">Landing page <span>↗</span></a>
    </div></header>

    <aside className="dashboard-rail">
      <button className={`new-run-button ${screen === "entry" ? "active" : ""}`} onClick={() => setScreen("entry")}><span>＋</span> New Run <kbd>N</kbd></button>
      <div className="rail-label">Recent runs <span>···</span></div>
      <div className="run-list">{runs.map((run) => <button key={run.id} className={`run-list-item ${selectedRun.id === run.id && (isResults || isLive) ? "active" : ""}`} onClick={() => chooseRun(run)}><span className="run-item-top"><StatusDot/><strong>{run.name}</strong><span className="run-more">···</span></span><span className="run-item-score">{run.score} <span>✓</span></span><span className="run-item-time">{run.time}</span></button>)}</div>
      <div className="rail-bottom"><span className="avatar-small">P</span><span><strong>Parth</strong><small>Personal workspace</small></span><button aria-label="Workspace settings">⌄</button></div>
    </aside>

    <section className="dashboard-main">
      {screen === "history" && <div className="history-empty"><div className="empty-mark">◉</div><p className="eyebrow">YOUR QA RUNS</p><h1>Select a run to view<br/>its evidence</h1><p className="empty-description">Open a previous report from the sidebar, or start a new run to explore an app and find issues worth fixing.</p><button className="button button-cream" onClick={() => setScreen("entry")}>＋ Start a new run <span>→</span></button><div className="history-hint"><span>⌘</span><span>Recent run snapshots are sample data.</span></div></div>}

      {screen === "entry" && <div className="entry-layout"><div className="entry-heading"><p className="eyebrow">NEW QA RUN</p><h1>Test your web app<br/>like a careful human would.</h1><p>Give Argus an address and a description of what should work. This screen runs a local UI demo only.</p></div><form className="run-form" onSubmit={startRun}><label className="field-label" htmlFor="app-url">Application URL</label><div className="url-field"><span>↗</span><input id="app-url" type="url" placeholder="https://your-app.com" value={url} onChange={(event) => setUrl(event.target.value)} required/><span className="field-secure">⌑ HTTPS</span></div><label className="field-label" htmlFor="app-spec">What should the app do?</label><textarea id="app-spec" placeholder={'Describe the key journeys and rules you want Argus to check…\n\nExample: Users can sign up with email and password, log in, create articles, favorite them, and comment. Titles are required.'} value={spec} onChange={(event) => setSpec(event.target.value)} required rows={7}/><div className="field-footer"><span>Be specific about expected behavior and edge cases.</span><span>{spec.length} / 2,000</span></div><div className="source-options"><p className="field-label">Add context <span>Optional</span></p><div className="source-buttons">{["README", "OpenAPI", "Source repo"].map((source) => <button type="button" key={source} className={sources.includes(source) ? "chosen" : ""} onClick={() => toggleSource(source)}><i>{sources.includes(source) ? "✓" : "＋"}</i>{source}</button>)}</div></div><div className="form-actions"><span><StatusDot tone="green"/> Demo mode · no app will be contacted</span><button className="button button-cream" type="submit">Run Agent <span>→</span></button></div></form><div className="entry-footnote"><span>01</span><span>One URL</span><i/><span>02</span><span>Your requirements</span><i/><span>03</span><span>Evidence-backed report</span></div></div>}

      {(isLive || isResults) && <>
        <div className="run-overview"><div className="overview-title"><div><p className="eyebrow">{isLive ? "RUN IN PROGRESS" : "RUN REPORT"}</p><h1>{isLive ? "Exploring your app" : `${selectedRun.name} report`} <span className="sample-pill">Sample data</span></h1></div><span className="overview-url">◉ {url || selectedRun.url}</span></div>
          <div className="metrics-row">{isLive ? <><Metric label="FINDINGS" value={elapsed > 8 ? "4" : "3"} caption="of 25 checks"/><Metric label="FALSE POSITIVES" value="2"/><Metric label="PENDING" value="3" tone="amber-text"/><Metric label="COVERAGE" value={`${Math.min(72 + Math.floor(elapsed / 8), 86)}%`} caption="routes tested"/></> : <><Metric label="FINDINGS" value={selectedRun.score} caption="76% of checks"/><Metric label="PRECISION" value="90%"/><Metric label="REPRODUCED" value="19/19" caption="100%"/><Metric label="FALSE POSITIVES" value="2"/><Metric label="COVERAGE" value={selectedRun.coverage}/></>}</div>
        </div>

        <div ref={workspaceRef} className={`workspace-layout ${isResults ? "results-layout" : ""}`} style={{ gridTemplateRows: fullScreen ? "minmax(0, 1fr)" : `${topSplit}fr 10px ${100 - topSplit}fr` }}>
          <div ref={splitRef} className={`workspace-top ${fullScreen ? "is-fullscreen" : ""}`} style={{ gridTemplateColumns: fullScreen ? "1fr" : `${browserSplit}fr 10px ${100 - browserSplit}fr` }}>
            {isLive ? <section className="browser-panel"><div className="panel-heading"><div><span className="panel-icon">◉</span><strong>Live browser</strong><span className="live-label"><StatusDot tone="amber"/> Agent is working</span></div><div className="panel-controls"><button onClick={() => setFullScreen((value) => !value)} title={fullScreen ? "Exit fullscreen" : "Fullscreen browser"}>{fullScreen ? "⊠" : "⛶"}</button>{fullScreen && <button onClick={() => setFullScreen(false)} title="Exit fullscreen">×</button>}</div></div><div className="browser-frame-live"><div className="browser-chrome"><span>● ● ●</span><div>⌑{"\u3000"}{url ? url.replace(/^https?:\/\//, "") : "demo.realworld.io"}/profile</div><span>↻{"\u3000"}⋮</span></div><div className="fake-app"><nav className="fake-app-nav"><strong>conduit</strong><span>Home</span><span>Articles</span><span>Sign in</span></nav><div className="fake-app-content"><div className="fake-user"><span className="fake-avatar">JD</span><div><strong>Jane Developer</strong><small>QA demo workspace</small></div><button>＋ New Article</button></div><div className="fake-tabs"><span>My Feed</span><span>Global Feed</span><span>Favorites</span></div><article className="fake-article"><span className="fake-author">Jane Developer <small>May 12, 2026</small></span><h3>Building better web experiences</h3><p>A thoughtful product is made from hundreds of small details. We are exploring the flows that matter most to your customers.</p><div className="fake-tags"><span>product</span><span>testing</span><span>design</span></div><button>♡{"\u3000"}Favorite Article <small>(12)</small></button></article><article className="fake-article second"><span className="fake-author">Alex Morgan <small>May 11, 2026</small></span><h3>Making software more reliable</h3><p>Reliable experiences begin with clear expectations and useful feedback.</p></article></div><div className="agent-pointer"><span>↖</span><small>Argus agent</small></div></div><div className="browser-caption"><span className="cursor-ring">⌖</span><span>Hovering the favorite button to verify its counter…</span></div><div className="browser-meta"><span>URL{"\u3000"}<b>/profile</b></span><span>STATE{"\u3000"}<b>Logged in as Jane</b></span><span className="browser-sample">SIMULATED BROWSER</span></div></div><div className="browser-actions"><button className="text-action" onClick={() => setFullScreen(true)}>⛶ Expand browser</button><button className="text-action" onClick={() => setScreen("results")}>View sample results →</button></div>{fullScreen && <div className="floating-score-wrap" onMouseEnter={() => setScoreOpen(true)} onMouseLeave={() => setScoreOpen(false)}><button className="floating-score" aria-expanded={scoreOpen} aria-label="Open findings and scoreboard" onClick={() => setScoreOpen((value) => !value)}><strong>3</strong><span>findings</span><b>2 FP</b><i>72%</i></button>{scoreOpen && <div className="floating-findings"><div className="subpanel-heading"><strong>Findings feed</strong><span>3 new · 72% coverage</span></div><div className="finding-list">{visibleFindings.slice(0, 4).map((finding) => <FindingRow key={finding.id} finding={finding} active={selectedFinding.id === finding.id} onClick={() => setSelectedFinding(finding)}/>)}</div><button className="text-action" onClick={() => { setFullScreen(false); setScreen("results"); }}>Open full report →</button></div>}</div>}</section> : <section className="evidence-panel"><div className="panel-heading"><div><span className="panel-icon evidence-icon">✦</span><strong>Evidence</strong><span className="sample-tag">Selected finding</span></div><button className="panel-more" onClick={() => void copyReport()}>{copied ? "Copied ✓" : "⋯"}</button></div><div className="evidence-content"><div className="evidence-kicker"><span className={`severity ${selectedFinding.severity.toLowerCase()}`}>{selectedFinding.severity}</span><span>{selectedFinding.status === "verified" ? "VERIFIED FINDING" : selectedFinding.status === "pending" ? "PENDING REVIEW" : "REJECTED REPORT"}</span><span className="evidence-time">{selectedFinding.time}</span></div><h2>{selectedFinding.detail}</h2><p className="repro-count"><StatusDot tone={selectedFinding.status === "verified" ? "green" : selectedFinding.status === "pending" ? "amber" : "gray"}/> {selectedFinding.status === "verified" ? "Reproduced 5/5 in fresh contexts" : selectedFinding.status === "pending" ? "Replaying in fresh contexts" : "Rejected after fresh replay"}</p><div className="evidence-section"><h3>STEPS TO REPRODUCE</h3><ol>{selectedFinding.steps.map((step, i) => <li key={step}><span>{String(i + 1).padStart(2, "0")}</span>{step}</li>)}</ol></div><div className="expected-actual"><div><h3>EXPECTED</h3><p>{selectedFinding.expected}</p></div><div><h3>ACTUAL</h3><p>{selectedFinding.actual}</p></div></div><div className="evidence-section trace-section"><h3>NETWORK TRACE <span>{selectedFinding.network.method} {selectedFinding.network.path}</span></h3><div className="trace-line"><code>{selectedFinding.network.method}</code><span>{selectedFinding.network.path}</span><b className={selectedFinding.network.status.startsWith("5") ? "trace-error" : "trace-ok"}>{selectedFinding.network.status}</b><small>{selectedFinding.network.duration}</small></div><h3>CONSOLE</h3><pre>{selectedFinding.console}</pre></div><div className="artifact-row"><h3>ARTIFACTS</h3>{findingArtifacts.map((file, i) => <button key={file} onClick={() => setCopied(true)}><span>{["▧", "⌁", "≋", "‹›"][i]}</span>{file}<i>↗</i></button>)}</div><div className="evidence-actions"><button className="button button-outline button-small" onClick={() => void copyReport()}>{copied ? "Copied ✓" : "Copy report"}</button><button className="button button-cream button-small" onClick={() => setScreen("entry")}>Start new run →</button></div></div></section>}
            {!fullScreen && <div className="split-handle vertical" role="separator" aria-orientation="vertical" aria-label="Resize browser and findings panels" tabIndex={0} onPointerDown={() => setDragging("vertical")} onDoubleClick={() => setBrowserSplit(60)} onKeyDown={(event) => handleSplitKey(event, "vertical")}><span/></div>}
            {!fullScreen && <section className="findings-panel"><div className="panel-heading"><div><span className="panel-icon findings-icon">≋</span><strong>{isLive ? "Findings feed" : "Findings"}</strong><span className="panel-count">{isLive ? "3 new" : "19 found · 2 FP"}</span></div><button className="panel-more" aria-label="Findings options">⋯</button></div><div className="finding-list">{visibleFindings.slice(0, isLive ? 4 : 6).map((finding) => <FindingRow key={finding.id} finding={finding} active={selectedFinding.id === finding.id} onClick={() => setSelectedFinding(finding)}/>)}</div>{isLive && <div className="activity-box"><div className="subpanel-heading"><strong>Agent activity</strong><span>3 / 5 active</span></div>{activityRoles.map((role, i) => <div className="activity-row" key={role}><StatusDot tone={i < 3 ? (i === 1 ? "amber" : "green") : "gray"}/><span>{role}</span><div className={`activity-meter role-${i}`}><i/></div><small>{i < 3 ? (i === 1 ? "checking" : "active") : "idle"}</small></div>)}</div>}</section>}
          </div>
          {!fullScreen && <div className="split-handle horizontal" role="separator" aria-orientation="horizontal" aria-label="Resize coverage and tests panels" tabIndex={0} onPointerDown={() => setDragging("horizontal")} onDoubleClick={() => setTopSplit(70)} onKeyDown={(event) => handleSplitKey(event, "horizontal")}><span/></div>}
          {!fullScreen && <div className="workspace-bottom"><section className="coverage-panel"><div className="panel-heading"><div><span className="panel-icon coverage-icon">⌘</span><strong>Coverage map</strong><span className="sample-tag">Sample data</span></div><button className="panel-more">↗</button></div><div className="coverage-body"><div className="coverage-graph"><svg className="coverage-lines" viewBox="0 0 480 190" preserveAspectRatio="none" aria-hidden="true"><path d="M75 42H202M202 42H356M202 42V111M75 42V111M202 111H356M202 111V164M356 42V111"/><path className="line-done" d="M75 42H202M202 42V111M75 42V111"/></svg>{[["Home", "done"], ["Login", "done"], ["Profile", "partial"], ["Feed", "done"], ["Editor", "partial"], ["Settings", "todo"], ["Article", "partial"]].map(([name, state], i) => <div key={name} className={`coverage-node node-${i} ${state}`}><span>{state === "done" ? "✓" : state === "partial" ? "◐" : "○"}</span>{name}</div>)}</div><div className="coverage-legend"><p><i className="legend-dot done"/> Tested <b>28 / 30</b></p><p><i className="legend-dot partial"/> Journeys <b>5 / 6</b></p><p><i className="legend-dot todo"/> Elements <b>87 / 120</b></p><div className="coverage-bar"><i style={{ width: isLive ? `${Math.min(72 + elapsed, 91)}%` : "72%" }}/></div><small>{isLive ? `${Math.min(72 + elapsed, 91)}%` : "72%"} covered</small></div></div></section>
            <section className="tests-panel"><div className="panel-heading"><div><span className="panel-icon tests-icon">⌘</span><strong>Tests & exports</strong><span className="sample-tag">12 generated</span></div><button className="panel-more" onClick={() => setScreen("results")}>View report →</button></div><div className="tests-body"><div className="test-file-list">{[["Journey", "sign-up", "PASS"], ["Journey", "login", "PASS"], ["Edge", "empty-email", "PASS"], ["Edge", "long-title", "FAIL"], ["Security", "IDOR-check", "PASS"]].map(([kind, name, result]) => <div className="test-file" key={name}><span className="test-kind">{kind}</span><strong>{name}</strong><span className={`test-result ${result.toLowerCase()}`}>{result === "PASS" ? "✓" : "×"} {result}</span></div>)}</div><div className="tests-summary"><div><span>Exported Playwright tests</span><strong>12</strong></div><div><span>Repro tests generated</span><strong>5</strong></div><button onClick={() => setScreen("results")}>Open test suite <span>↗</span></button></div></div></section></div>}
        </div>
      </>}
    </section>

    {screen === "parsing" && <div className="parsing-overlay"><div className="parsing-card"><div className="parsing-spinner"/><p className="eyebrow">ARGUS SPEC PARSER</p><h2>Understanding your app…</h2><div className="parse-progress"><span><i/> 6 journeys identified</span><span><i/> 24 claims extracted</span><span><i/> 3 validation rules detected</span></div><div className="parsing-footer"><span>Preparing a sample run</span><b>DEMO MODE</b></div></div></div>}
    {dragging && <div className={`resize-cursor ${dragging}`} aria-hidden="true"/>}
  </main>;
}
