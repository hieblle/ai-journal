<script lang="ts">
  import { api, KIND_LABEL, type ReportKind, type ReportListItem } from "../lib/api";
  import { app, navigate, routeHref } from "../lib/state.svelte";
  import Markdown from "./Markdown.svelte";
  import TopBar from "./TopBar.svelte";

  let { kind, key }: { kind?: string; key?: string } = $props();

  let reports = $state<ReportListItem[]>([]);
  let filter = $state<ReportKind | "all">("all");
  let current = $state<{ kind: ReportKind; key: string; label: string; content: string } | null>(null);
  let editing = $state(false);
  let draft = $state("");
  let status = $state<{ running: { kind: ReportKind; key: string } | null; log: string[]; lastError: { kind: string; key: string; message: string } | null } | null>(null);
  let showLog = $state(false);
  let context = $state<{ entries: string[]; previousReports: string[]; memory: string[]; stats: string | null } | null>(null);
  let pollTimer: number | undefined;

  const kinds: ReportKind[] = ["daily", "weekly", "monthly", "quarterly"];
  const visible = $derived(filter === "all" ? reports : reports.filter((r) => r.kind === filter));

  async function loadList() {
    try {
      reports = (await api.get<{ reports: ReportListItem[] }>("/api/reports")).reports;
    } catch (err) {
      app.notify((err as Error).message, "error");
    }
  }

  async function loadStatus() {
    try {
      status = await api.get("/api/reports/status");
      const running = Boolean(status?.running);
      if (running && !pollTimer) pollTimer = window.setInterval(() => void loadStatus(), 3000);
      if (!running && pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
        await loadList();
        await app.refreshOverview();
        if (kind && key && !current) await loadReport(kind as ReportKind, key);
      }
    } catch {
      /* ignore */
    }
  }

  async function loadReport(k: ReportKind, id: string) {
    editing = false;
    context = null;
    try {
      current = await api.get(`/api/reports/${k}/${encodeURIComponent(id)}`);
      reports = reports.map((r) => (r.kind === k && r.key === id ? { ...r, unread: false } : r));
      void app.refreshOverview();
    } catch (err) {
      current = null;
      if ((err as { status?: number }).status === 404) {
        try {
          context = await api.get(`/api/reports/${k}/${encodeURIComponent(id)}/context`);
        } catch {
          /* ignore */
        }
      } else app.notify((err as Error).message, "error");
    }
  }

  async function generate(k: ReportKind, id: string, force: boolean) {
    if (force && !confirm(`Bericht ${id} wirklich neu erzeugen? Der bisherige wird überschrieben.`)) return;
    try {
      await api.post(`/api/reports/${k}/${encodeURIComponent(id)}/generate`, { force });
      app.notify("Bericht wird erzeugt …");
      await loadStatus();
      if (!pollTimer) pollTimer = window.setInterval(() => void loadStatus(), 3000);
    } catch (err) {
      app.notify((err as Error).message, "error");
    }
  }

  async function saveEdit() {
    if (!current) return;
    try {
      await api.put(`/api/reports/${current.kind}/${encodeURIComponent(current.key)}`, { content: draft });
      current = { ...current, content: draft };
      editing = false;
      app.notify("Gespeichert.");
    } catch (err) {
      app.notify((err as Error).message, "error");
    }
  }

  $effect(() => {
    void loadList();
    void loadStatus();
    return () => {
      if (pollTimer) window.clearInterval(pollTimer);
    };
  });

  $effect(() => {
    if (kind && key) void loadReport(kind as ReportKind, key);
    else {
      current = null;
      context = null;
    }
  });

  const ov = $derived(app.overview);
</script>

<TopBar>
  <span class="title">Berichte</span>
  {#if current}
    <span class="faint">› {KIND_LABEL[current.kind]} {current.key}</span>
  {/if}
  <span class="spacer"></span>
  {#if status?.running}
    <span class="faint running">läuft: {status.running.kind} {status.running.key}</span>
  {/if}
  <button class="ghost small" onclick={() => (showLog = !showLog)}>Protokoll</button>
</TopBar>

<div class="content">
  {#if showLog && status}
    <div class="card log">
      {#if status.lastError}<div class="error">Letzter Fehler ({status.lastError.kind} {status.lastError.key}): {status.lastError.message}</div>{/if}
      {#if status.log.length === 0}<span class="faint">Noch nichts protokolliert.</span>{/if}
      {#each status.log as line}<div class="mono">{line}</div>{/each}
    </div>
  {/if}

  {#if current}
    <div class="report">
      <div class="row actions">
        <a href={routeHref({ view: "reports" })}>‹ Alle Berichte</a>
        <span class="spacer"></span>
        {#if editing}
          <button class="small" onclick={() => (editing = false)}>Abbrechen</button>
          <button class="small primary" onclick={saveEdit}>Speichern</button>
        {:else}
          <button class="small" onclick={() => { draft = current!.content; editing = true; }}>Bearbeiten</button>
          <button class="small" disabled={Boolean(status?.running)} onclick={() => generate(current!.kind, current!.key, true)}>Neu erzeugen</button>
        {/if}
      </div>
      {#if editing}
        <textarea bind:value={draft} rows={30}></textarea>
      {:else}
        <Markdown source={current.content} />
      {/if}
    </div>
  {:else if kind && key && context}
    <div class="report">
      <a href={routeHref({ view: "reports" })}>‹ Alle Berichte</a>
      <h2 class="mt">Noch kein {KIND_LABEL[kind as ReportKind]}-Bericht für {key}</h2>
      <p class="muted">Kontext, den die KI bekommen würde:</p>
      <ul class="muted">
        <li>{context.entries.length} Einträge/Berichte im Zeitraum{context.entries.length ? `: ${context.entries.join(", ")}` : ""}</li>
        <li>{context.previousReports.length} frühere Berichte</li>
        <li>{context.memory.length} Gedächtnisdateien</li>
      </ul>
      <button class="primary" disabled={Boolean(status?.running) || context.entries.length === 0} onclick={() => generate(kind as ReportKind, key!, false)}>Jetzt erzeugen</button>
    </div>
  {:else}
    {#if ov}
      <div class="card now">
        <h3>Aktuelle Zeiträume</h3>
        <div class="grid">
          {#each kinds as k}
            {@const cur = ov.current[k]}
            {@const due = ov.due[k]}
            {@const has = reports.some((r) => r.kind === k && r.key === cur)}
            {@const hasDue = due ? reports.some((r) => r.kind === k && r.key === due) : true}
            <div class="cell">
              <div class="row">
                <strong>{KIND_LABEL[k]}</strong>
                {#if due && !hasDue}<span class="badge warn">fällig: {due}</span>{/if}
              </div>
              <div class="row">
                <span class="faint">{k === "daily" ? "gestern" : "laufend"}: {cur}</span>
                {#if has}
                  <a href={routeHref({ view: "reports", kind: k, key: cur })}>öffnen</a>
                {:else}
                  <button class="small" disabled={Boolean(status?.running)} onclick={() => generate(k, cur, false)}>jetzt erzeugen</button>
                {/if}
                {#if due && due !== cur && !hasDue}
                  <button class="small" disabled={Boolean(status?.running)} onclick={() => generate(k, due, false)}>{due} erzeugen</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        {#if ov.lastError}
          <p class="error">Letzter Fehler ({ov.lastError.kind} {ov.lastError.key}): {ov.lastError.message}</p>
        {/if}
      </div>
    {/if}

    <div class="row filters">
      <button class="small" class:primary={filter === "all"} onclick={() => (filter = "all")}>Alle</button>
      {#each kinds as k}
        <button class="small" class:primary={filter === k} onclick={() => (filter = k)}>{KIND_LABEL[k]}</button>
      {/each}
    </div>

    {#if visible.length === 0}
      <p class="muted">Noch keine Berichte. Der erste Wochenbericht entsteht automatisch, sobald eine Woche mit Einträgen vorbei ist, oder oben per Knopf.</p>
    {/if}
    <ul class="list">
      {#each visible as r (r.kind + r.key)}
        <li>
          <a href={routeHref({ view: "reports", kind: r.kind, key: r.key })} class:unread={r.unread}>
            <span class="kind">{KIND_LABEL[r.kind]}</span>
            <span>{r.label}</span>
            {#if r.unread}<span class="badge">neu</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .title {
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .running {
    font-size: 13px;
  }
  .log {
    margin-bottom: 16px;
    font-size: 13px;
    max-height: 240px;
    overflow: auto;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .report {
    max-width: 820px;
    margin: 0 auto;
  }
  .actions {
    margin-bottom: 14px;
  }
  .mt {
    margin-top: 12px;
  }
  .now {
    margin-bottom: 18px;
    max-width: 820px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px 20px;
    font-size: 14px;
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .filters {
    margin: 6px 0 12px;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-width: 820px;
  }
  .list a {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 9px 10px;
    border-radius: 8px;
    color: var(--fg);
    border-bottom: 1px solid var(--border);
  }
  .list a:hover {
    background: var(--bg-2);
  }
  .list a.unread {
    font-weight: 600;
  }
  .kind {
    color: var(--fg-3);
    font-size: 12px;
    width: 80px;
    flex: 0 0 80px;
  }
  .badge {
    background: var(--accent);
    color: var(--accent-fg);
    border-radius: 999px;
    font-size: 11px;
    padding: 1px 7px;
    font-weight: 600;
  }
  .badge.warn {
    background: var(--warn);
    color: #fff;
  }
  textarea {
    min-height: 60vh;
  }
</style>
