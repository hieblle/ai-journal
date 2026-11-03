<script lang="ts">
  import { app } from "../lib/state.svelte";

  let {
    title,
    content,
    rows = 10,
    badge,
    onsave,
    ondelete,
  }: { title: string; content: string; rows?: number; badge?: string; onsave: (c: string) => Promise<void> | void; ondelete?: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let draft = $state(content);
  let open = $state(false);
  let busy = $state(false);

  $effect(() => {
    draft = content;
  });

  const dirty = $derived(draft !== content);

  async function save() {
    busy = true;
    try {
      await onsave(draft);
    } catch (err) {
      app.notify((err as Error).message, "error");
    } finally {
      busy = false;
    }
  }
</script>

<div class="card">
  <div class="row head">
    <button class="ghost small" onclick={() => (open = !open)}>{open ? "▾" : "▸"} <strong>{title}</strong></button>
    {#if badge}<span class="badge">{badge}</span>{/if}
    <span class="spacer"></span>
    {#if dirty}<button class="small primary" disabled={busy} onclick={save}>Speichern</button>{/if}
    {#if ondelete}<button class="small ghost" onclick={ondelete}>Löschen</button>{/if}
  </div>
  {#if open}
    <textarea bind:value={draft} {rows}></textarea>
  {/if}
</div>

<style>
  .head {
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .badge {
    font-size: 11px;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 999px;
    padding: 0 7px;
  }
  textarea {
    margin-top: 10px;
  }
</style>
