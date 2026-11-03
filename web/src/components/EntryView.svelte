<script lang="ts">
  import { api, type Entry } from "../lib/api";
  import { app, localToday, navigate } from "../lib/state.svelte";
  import Editor from "./Editor.svelte";
  import TopBar from "./TopBar.svelte";

  let { date }: { date: string } = $props();

  let entry = $state<Entry | null>(null);
  let body = $state("");
  let loadError = $state("");
  let saveState = $state<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  let quick = $state("");
  let quickBusy = $state(false);
  let loadedFor = "";
  let saveTimer: number | undefined;
  let pending: { body?: string; meta?: Record<string, unknown> } = {};

  const today = $derived(app.overview?.today ?? localToday());
  const isToday = $derived(date === today);
  const isFuture = $derived(date > today);

  const title = $derived.by(() => {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][dt.getDay()];
    return `${wd}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  });

  $effect(() => {
    const d = date;
    if (d === loadedFor) return;
    void flush().then(() => load(d));
  });

  async function load(d: string) {
    loadedFor = d;
    loadError = "";
    entry = null;
    try {
      const e = await api.get<Entry>(`/api/entries/${d}${d === today ? "?create=1" : ""}`);
      if (loadedFor !== d) return;
      entry = e;
      body = e.body;
      saveState = "idle";
      if (d === today && !app.overview?.dates.includes(d)) void app.refreshOverview();
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  function onBodyChange(v: string) {
    body = v;
    pending.body = v;
    schedule();
  }

  function setMeta(key: "energy" | "focus", value: number | null) {
    if (!entry) return;
    const cur = entry.meta[key] ?? null;
    const next = cur === value ? null : value;
    entry = { ...entry, meta: { ...entry.meta, [key]: next } };
    pending.meta = { ...(pending.meta ?? {}), [key]: next };
    if (!pending.body && !entry.exists) pending.body = body;
    schedule();
  }

  function schedule() {
    saveState = "dirty";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void flush(), 900);
  }

  async function flush() {
    window.clearTimeout(saveTimer);
    if (!pending.body && !pending.meta) return;
    const payload = pending;
    pending = {};
    const d = loadedFor;
    saveState = "saving";
    try {
      const saved = await api.put<Entry>(`/api/entries/${d}`, payload);
      if (loadedFor === d) {
        entry = { ...saved, body };
        saveState = pending.body || pending.meta ? "dirty" : "saved";
        if (saved.exists && !app.overview?.dates.includes(d)) void app.refreshOverview();
      }
    } catch (err) {
      saveState = "error";
      pending = { ...payload, ...pending };
      app.notify(`Speichern fehlgeschlagen: ${(err as Error).message}`, "error");
    }
  }

  async function sendQuick(e: Event) {
    e.preventDefault();
    const text = quick.trim();
    if (!text) return;
    quickBusy = true;
    try {
      await flush();
      const saved = await api.post<Entry>("/api/quicknote", { text, date: isToday ? undefined : date });
      quick = "";
      if (loadedFor === saved.date) {
        entry = saved;
        body = saved.body;
      }
      void app.refreshOverview();
    } catch (err) {
      app.notify((err as Error).message, "error");
    } finally {
      quickBusy = false;
    }
  }

  function startEntry() {
    void api.get<Entry>(`/api/entries/${date}?create=1`).then((e) => {
      entry = e;
      body = e.body;
      void app.refreshOverview();
    });
  }

  function shift(days: number) {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d + days);
    navigate({ view: "entry", date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}` });
  }

  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void flush();
    }
  }

  $effect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
      void flush();
    };
  });
</script>

<svelte:window onkeydown={onKey} />

<TopBar>
  <div class="row nav">
    <button class="ghost small" onclick={() => shift(-1)} title="Vortag">‹</button>
    <span class="title">{title}</span>
    <button class="ghost small" onclick={() => shift(1)} disabled={isFuture || isToday} title="Folgetag">›</button>
    {#if !isToday}<a class="small-link" href="#/entry/{today}">Heute</a>{/if}
  </div>
  <span class="state faint">
    {#if saveState === "saving"}speichert …{:else if saveState === "dirty"}ungespeichert{:else if saveState === "saved"}gespeichert{:else if saveState === "error"}<span class="error">Fehler</span>{/if}
  </span>
</TopBar>

<div class="content narrow">
  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if !entry}
    <p class="muted">Lade …</p>
  {:else if !entry.exists && !isToday}
    <div class="empty">
      <p class="muted">Für diesen Tag gibt es keinen Eintrag.</p>
      {#if !isFuture}<button onclick={startEntry}>Eintrag anlegen</button>{/if}
    </div>
  {:else}
    <div class="scores">
      {#each [["energy", "Energie"], ["focus", "Fokus"]] as const as [key, label]}
        {@const cur = Number(entry.meta[key] ?? 0)}
        <div class="score">
          <span class="faint">{label}</span>
          <div class="dots">
            {#each [1, 2, 3, 4, 5] as n}
              <button class="dot" class:on={cur >= n} class:exact={cur === n} onclick={() => setMeta(key, n)} title="{label} {n}">{n}</button>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <Editor value={body} onchange={onBodyChange} placeholder="Schreib." autofocus={isToday} />

    <form class="quick" onsubmit={sendQuick}>
      <input type="text" bind:value={quick} placeholder="Schnellnotiz mit Uhrzeit anhängen …" disabled={quickBusy} />
      <button type="submit" disabled={quickBusy || !quick.trim()}>Anhängen</button>
    </form>
  {/if}
</div>

<style>
  .nav {
    gap: 4px;
  }
  .title {
    font-weight: 600;
    margin: 0 6px;
  }
  .small-link {
    font-size: 13px;
    margin-left: 6px;
  }
  .state {
    margin-left: auto;
    font-size: 13px;
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
    margin-top: 20px;
  }
  .scores {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    margin-bottom: 14px;
    font-size: 13px;
  }
  .score {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dots {
    display: flex;
    gap: 3px;
  }
  .dot {
    width: 26px;
    height: 24px;
    padding: 0;
    font-size: 12px;
    border-radius: 6px;
    color: var(--fg-3);
    background: transparent;
  }
  .dot.on {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--fg);
    border-color: transparent;
  }
  .dot.exact {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .quick {
    display: flex;
    gap: 8px;
    margin-top: 30px;
    padding-top: 16px;
    border-top: 1px dashed var(--border);
  }
  .quick input {
    flex: 1;
  }
</style>
