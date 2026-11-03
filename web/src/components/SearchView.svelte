<script lang="ts">
  import { api, KIND_LABEL, type ReportKind } from "../lib/api";
  import { app, navigate, routeHref } from "../lib/state.svelte";
  import TopBar from "./TopBar.svelte";

  let { q }: { q?: string } = $props();

  // svelte-ignore state_referenced_locally
  let query = $state(q ?? "");
  let results = $state<{ type: "entry" | "report"; key: string; kind?: ReportKind; snippet: string }[]>([]);
  let searched = $state(false);
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (q !== undefined && q !== query) query = q;
    if (q) void run(q);
    input?.focus();
  });

  async function run(text: string) {
    try {
      results = (await api.get<{ results: typeof results }>(`/api/search?q=${encodeURIComponent(text)}`)).results;
      searched = true;
    } catch (err) {
      app.notify((err as Error).message, "error");
    }
  }

  function submit(e: Event) {
    e.preventDefault();
    const t = query.trim();
    if (!t) return;
    navigate({ view: "search", q: t });
  }

  function highlight(s: string): string {
    const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const t = query.trim();
    if (!t) return esc(s);
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    return esc(s).replace(re, (m) => `<mark>${m}</mark>`);
  }
</script>

<TopBar>
  <span class="title">Suche</span>
</TopBar>

<div class="content narrow">
  <form class="row" onsubmit={submit}>
    <input bind:this={input} type="search" bind:value={query} placeholder="Einträge und Berichte durchsuchen …" class="q" />
    <button type="submit" class="primary">Suchen</button>
  </form>

  {#if searched}
    <p class="faint">{results.length} Treffer{results.length >= 50 ? " (max. 50)" : ""}</p>
    <ul class="list">
      {#each results as r}
        <li>
          <a href={r.type === "entry" ? routeHref({ view: "entry", date: r.key }) : routeHref({ view: "reports", kind: r.kind, key: r.key })}>
            <span class="head">{r.type === "entry" ? "Eintrag" : KIND_LABEL[r.kind!]} · {r.key}</span>
            <span class="snippet">{@html highlight(r.snippet)}</span>
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
  .q {
    flex: 1;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .list a {
    display: block;
    padding: 10px;
    border-radius: 8px;
    color: var(--fg);
    border-bottom: 1px solid var(--border);
  }
  .list a:hover {
    background: var(--bg-2);
  }
  .head {
    display: block;
    font-size: 13px;
    color: var(--fg-2);
    margin-bottom: 2px;
  }
  .snippet {
    font-family: var(--font-write);
  }
  :global(mark) {
    background: color-mix(in srgb, var(--warn) 35%, transparent);
    color: inherit;
    border-radius: 3px;
  }
</style>
