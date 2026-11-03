<script lang="ts">
  import { api, type Settings } from "../lib/api";
  import { app, navigate } from "../lib/state.svelte";
  import TopBar from "./TopBar.svelte";
  import FileEditor from "./FileEditor.svelte";

  let { tab = "general" }: { tab?: string } = $props();

  let s = $state<Settings | null>(null);
  let saving = $state(false);
  let testResult = $state<{ ok: boolean; message: string } | null>(null);
  let testing = $state(false);

  let templates = $state<{ name: string; content: string }[]>([]);
  let newTemplate = $state("");
  let memory = $state<{ name: string; content: string }[]>([]);
  let persona = $state("");

  let oldPin = $state("");
  let newPin = $state("");
  let newPin2 = $state("");

  const tabs = [
    ["general", "Allgemein"],
    ["ai", "KI"],
    ["schedule", "Zeitplan"],
    ["templates", "Templates"],
    ["persona", "Persona"],
    ["memory", "Gedächtnis"],
    ["pin", "PIN"],
  ];

  $effect(() => {
    void load();
  });

  $effect(() => {
    if (tab === "templates") void loadTemplates();
    if (tab === "memory") void loadMemory();
    if (tab === "persona") void loadPersona();
  });

  async function load() {
    try {
      s = await api.get<Settings>("/api/settings");
    } catch (err) {
      app.notify((err as Error).message, "error");
    }
  }

  async function save(patch: Partial<Settings>) {
    saving = true;
    try {
      s = await api.put<Settings>("/api/settings", patch);
      app.notify("Gespeichert.");
      void app.refreshOverview();
      void app.refreshAuth();
    } catch (err) {
      app.notify((err as Error).message, "error");
    } finally {
      saving = false;
    }
  }

  async function testProvider() {
    if (!s) return;
    testing = true;
    testResult = null;
    try {
      await save({ provider: s.provider, providers: s.providers });
      testResult = await api.post<{ ok: boolean; message: string }>("/api/settings/test-provider", { provider: s.provider });
    } catch (err) {
      testResult = { ok: false, message: (err as Error).message };
    } finally {
      testing = false;
    }
  }

  async function loadTemplates() {
    const r = await api.get<{ templates: typeof templates }>("/api/templates");
    templates = r.templates;
  }

  async function saveTemplate(name: string, content: string) {
    await api.put(`/api/templates/${encodeURIComponent(name)}`, { content });
    app.notify("Template gespeichert.");
    await loadTemplates();
    void app.refreshOverview();
  }

  async function createTemplate() {
    const name = newTemplate.trim().toLowerCase().replace(/[^a-z0-9äöüß_-]+/g, "-");
    if (!name) return;
    await saveTemplate(name, "## \n");
    newTemplate = "";
  }

  async function deleteTemplate(name: string) {
    if (!confirm(`Template „${name}“ löschen?`)) return;
    try {
      await api.del(`/api/templates/${encodeURIComponent(name)}`);
      await loadTemplates();
      await load();
    } catch (err) {
      app.notify((err as Error).message, "error");
    }
  }

  async function loadMemory() {
    memory = (await api.get<{ files: typeof memory }>("/api/memory")).files;
  }

  async function loadPersona() {
    persona = (await api.get<{ content: string }>("/api/persona")).content;
  }

  async function changePin(e: Event) {
    e.preventDefault();
    if (newPin !== newPin2) {
      app.notify("Die neuen PINs stimmen nicht überein.", "error");
      return;
    }
    try {
      await api.post("/api/auth/change", { oldPin, pin: newPin });
      oldPin = newPin = newPin2 = "";
      app.notify("PIN geändert.");
    } catch (err) {
      app.notify((err as Error).message, "error");
    }
  }

  const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
</script>

<TopBar>
  <span class="title">Einstellungen</span>
</TopBar>

<div class="content">
  <div class="tabs">
    {#each tabs as [id, label]}
      <button class="small" class:primary={tab === id} onclick={() => navigate({ view: "settings", tab: id })}>{label}</button>
    {/each}
  </div>

  {#if !s}
    <p class="muted">Lade …</p>
  {:else if tab === "general"}
    <div class="form">
      <label>
        <span>Journal-Ordner</span>
        <input type="text" bind:value={s.journalDir} />
        <small class="faint">Markdown-Dateien liegen hier. Kann in OneDrive liegen. Wird beim Speichern angelegt, falls nötig.</small>
      </label>
      <label>
        <span>Sperren nach Inaktivität (Minuten)</span>
        <input type="number" min="1" bind:value={s.lockAfterMinutes} />
      </label>
      <label>
        <span>Standard-Template für neue Tage</span>
        <select bind:value={s.defaultTemplate}>
          {#each app.overview?.templates ?? [s.defaultTemplate] as t}<option value={t}>{t}</option>{/each}
        </select>
      </label>
      <label>
        <span>Berichtssprache</span>
        <input type="text" bind:value={s.language} />
        <small class="faint">„de“ für Deutsch. Andere Werte werden der KI als Sprachname mitgegeben.</small>
      </label>
      <div class="row">
        <button class="primary" disabled={saving} onclick={() => save({ journalDir: s!.journalDir, lockAfterMinutes: Number(s!.lockAfterMinutes), defaultTemplate: s!.defaultTemplate, language: s!.language })}>Speichern</button>
      </div>
      <p class="faint">Server: {s.host}:{s.port}. Port und Host änderst du über die Umgebungsvariablen AI_JOURNAL_PORT und AI_JOURNAL_HOST im Startskript.</p>
    </div>
  {:else if tab === "ai"}
    <div class="form">
      <label>
        <span>Anbieter</span>
        <select bind:value={s.provider}>
          <option value="claude-cli">Claude Code CLI (Abo, kein API-Key)</option>
          <option value="claude-api">Claude API (API-Key)</option>
          <option value="ollama">Ollama (lokal)</option>
        </select>
      </label>

      {#if s.provider === "claude-cli"}
        <label>
          <span>Befehl</span>
          <input type="text" bind:value={s.providers["claude-cli"].command} placeholder="claude" />
          <small class="faint">Pfad oder Name der Claude-Code-CLI. Sie muss auf diesem Rechner eingeloggt sein.</small>
        </label>
        <label>
          <span>Modell (optional)</span>
          <input type="text" bind:value={s.providers["claude-cli"].model} placeholder="leer = Standard der CLI, z.B. opus oder sonnet" />
        </label>
      {:else if s.provider === "claude-api"}
        <label>
          <span>API-Key</span>
          <input type="password" bind:value={s.providers["claude-api"].apiKey} placeholder="sk-ant-…" autocomplete="off" />
          <small class="faint">Wird in ~/.ai-journal/config.json gespeichert, nicht im Journal-Ordner.</small>
        </label>
        <label>
          <span>Modell</span>
          <input type="text" bind:value={s.providers["claude-api"].model} placeholder="claude-opus-5-5" />
        </label>
      {:else}
        <label>
          <span>Adresse</span>
          <input type="text" bind:value={s.providers.ollama.baseUrl} placeholder="http://127.0.0.1:11434" />
        </label>
        <label>
          <span>Modell</span>
          <input type="text" bind:value={s.providers.ollama.model} placeholder="llama3.1" />
          <small class="faint">Muss in Ollama installiert sein. Für Monats- und Quartalsberichte braucht es ein Modell mit großem Kontext.</small>
        </label>
      {/if}

      <div class="row">
        <button class="primary" disabled={saving} onclick={() => save({ provider: s!.provider, providers: s!.providers })}>Speichern</button>
        <button disabled={testing || saving} onclick={testProvider}>{testing ? "Teste …" : "Speichern und testen"}</button>
      </div>
      {#if testResult}
        <p class={testResult.ok ? "ok" : "error"}>{testResult.message}</p>
      {/if}
    </div>
  {:else if tab === "schedule"}
    <div class="form">
      <p class="muted">Berichte werden zur eingestellten Zeit erzeugt, wenn der Server läuft, sonst beim nächsten Start nachgeholt.</p>
      {#each [["daily", "Täglich"], ["weekly", "Wöchentlich"], ["monthly", "Monatlich (am 1.)"], ["quarterly", "Quartal (am 1. des Quartals)"]] as [k, label]}
        {@const sc = s.schedule[k as keyof Settings["schedule"]]}
        <div class="sched">
          <label class="inline"><input type="checkbox" bind:checked={sc.enabled} /> <strong>{label}</strong></label>
          {#if k === "weekly"}
            <select bind:value={s.schedule.weekly.weekday}>
              {#each weekdays as wd, i}<option value={i}>{wd}</option>{/each}
            </select>
          {/if}
          <input type="number" min="0" max="23" bind:value={sc.hour} class="num" /> :
          <input type="number" min="0" max="59" bind:value={sc.minute} class="num" />
        </div>
      {/each}
      <small class="faint">Wochenbericht an Samstag oder Sonntag: die laufende Woche. An Montag bis Freitag: die Vorwoche.</small>
      <div class="row">
        <button class="primary" disabled={saving} onclick={() => save({ schedule: s!.schedule })}>Speichern</button>
      </div>
    </div>
  {:else if tab === "templates"}
    <div class="form">
      <p class="muted">Templates füllen neue Tage vor. Markdown-Dateien in <code>templates/</code> im Journal-Ordner.</p>
      {#each templates as t (t.name)}
        <FileEditor title={t.name} content={t.content} onsave={(c) => saveTemplate(t.name, c)} ondelete={t.name === "standard" ? undefined : () => deleteTemplate(t.name)} badge={t.name === s.defaultTemplate ? "Standard" : undefined} />
      {/each}
      <form class="row" onsubmit={(e) => { e.preventDefault(); void createTemplate(); }}>
        <input type="text" bind:value={newTemplate} placeholder="Name für neues Template" />
        <button type="submit" disabled={!newTemplate.trim()}>Anlegen</button>
      </form>
    </div>
  {:else if tab === "persona"}
    <div class="form">
      <p class="muted">Der Charakter der KI. Geht als System-Prompt in jeden Bericht. Datei: <code>ai/persona.md</code>.</p>
      <FileEditor title="persona.md" content={persona} rows={28} onsave={async (c) => { await api.put("/api/persona", { content: c }); persona = c; app.notify("Persona gespeichert."); }} />
    </div>
  {:else if tab === "memory"}
    <div class="form">
      <p class="muted">Langzeitgedächtnis der KI. Sie pflegt diese Dateien nach jedem Bericht. Was du hier änderst, gilt beim nächsten Bericht.</p>
      {#each memory as m (m.name)}
        <FileEditor title={m.name} content={m.content} rows={14} onsave={async (c) => { await api.put(`/api/memory/${encodeURIComponent(m.name)}`, { content: c }); app.notify("Gespeichert."); await loadMemory(); }} />
      {/each}
    </div>
  {:else if tab === "pin"}
    <form class="form" onsubmit={changePin}>
      <label><span>Aktuelle PIN</span><input type="password" inputmode="numeric" bind:value={oldPin} autocomplete="current-password" /></label>
      <label><span>Neue PIN</span><input type="password" inputmode="numeric" bind:value={newPin} autocomplete="new-password" /></label>
      <label><span>Neue PIN wiederholen</span><input type="password" inputmode="numeric" bind:value={newPin2} autocomplete="new-password" /></label>
      <div class="row"><button class="primary" type="submit">PIN ändern</button></div>
    </form>
  {/if}
</div>

<style>
  .title {
    font-weight: 600;
  }
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .form {
    max-width: 680px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label > span {
    font-size: 13px;
    color: var(--fg-2);
  }
  label.inline {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    min-width: 220px;
  }
  .sched {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .num {
    width: 64px;
  }
  .ok {
    color: var(--accent);
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.9em;
  }
</style>
