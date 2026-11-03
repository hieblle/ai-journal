<script lang="ts">
  import { app } from "../lib/state.svelte";
  let { children } = $props();
</script>

<div class="topbar">
  {#if !app.sidebarOpen}
    <button class="ghost small" onclick={() => app.toggleSidebar()} title="Menü einblenden" aria-label="Menü">☰</button>
  {/if}
  {@render children?.()}
</div>
