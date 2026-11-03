<script lang="ts">
  import { app, localToday, routeHref } from "../lib/state.svelte";
  import Calendar from "./Calendar.svelte";

  const today = $derived(app.overview?.today ?? localToday());
  const recent = $derived((app.overview?.dates ?? []).filter((d) => d !== today).slice(0, 7));
  const unreadCount = $derived(app.overview?.unread.length ?? 0);
  const activeDate = $derived(app.route.view === "entry" ? app.route.date : null);

  function label(d: string): string {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    const diff = Math.round((new Date(today).getTime() - dt.getTime()) / 86400000);
    const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][dt.getDay()];
    if (diff === 1) return "Gestern";
    return `${wd} ${String(day).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
  }

  function closeOnMobile() {
    if (window.innerWidth <= 800) app.toggleSidebar();
  }
</script>

{#if app.sidebarOpen}
  <button class="backdrop" aria-label="Menü schließen" onclick={() => app.toggleSidebar()}></button>
{/if}
<nav class="sidebar" class:closed={!app.sidebarOpen}>
  <div class="head">
    <span class="title">Journal</span>
    <button class="ghost small" title="Menü ausblenden" onclick={() => app.toggleSidebar()}>‹</button>
  </div>

  <div class="scroll">
    <a class="item" class:active={activeDate === today} href={routeHref({ view: "entry", date: today })} onclick={closeOnMobile}>
      <span>Heute</span>
      <span class="faint">{today.slice(8)}.{today.slice(5, 7)}.</span>
    </a>
    {#each recent as d (d)}
      <a class="item" class:active={activeDate === d} href={routeHref({ view: "entry", date: d })} onclick={closeOnMobile}>
        <span>{label(d)}</span>
      </a>
    {/each}

    <div class="section">
      <Calendar selected={activeDate} dates={app.overview?.dates ?? []} {today} onselect={closeOnMobile} />
    </div>

    <div class="section">
      <a class="item" class:active={app.route.view === "reports"} href={routeHref({ view: "reports" })} onclick={closeOnMobile}>
        <span>Berichte</span>
        {#if unreadCount > 0}<span class="badge">{unreadCount}</span>{/if}
      </a>
      <a class="item" class:active={app.route.view === "search"} href={routeHref({ view: "search" })} onclick={closeOnMobile}>
        <span>Suche</span>
      </a>
      <a class="item" class:active={app.route.view === "settings"} href={routeHref({ view: "settings" })} onclick={closeOnMobile}>
        <span>Einstellungen</span>
      </a>
    </div>
  </div>

  <div class="foot">
    {#if app.overview?.running}
      <span class="faint">Bericht läuft: {app.overview.running.key}</span>
    {:else if app.overview?.lastError}
      <a class="error" href={routeHref({ view: "reports" })}>Berichtsfehler</a>
    {/if}
    <button class="ghost small" onclick={() => app.lock()} title="Sperren">Sperren</button>
  </div>
</nav>

<style>
  .backdrop {
    display: none;
  }
  @media (max-width: 800px) {
    .backdrop {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 19;
      background: rgba(0, 0, 0, 0.35);
      border: 0;
      border-radius: 0;
      padding: 0;
    }
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 10px 8px 16px;
    min-height: 48px;
  }
  .title {
    font-weight: 600;
  }
  .scroll {
    flex: 1;
    overflow: auto;
    padding: 0 8px 12px;
  }
  .section {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-radius: 8px;
    color: var(--fg);
    font-size: 14px;
  }
  .item:hover {
    background: var(--bg-3);
  }
  .item.active {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .item.active .faint {
    color: inherit;
    opacity: 0.8;
  }
  .badge {
    background: var(--warn);
    color: #fff;
    border-radius: 999px;
    font-size: 11px;
    padding: 1px 7px;
  }
  .item.active .badge {
    background: var(--accent-fg);
    color: var(--accent);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px 10px 16px;
    border-top: 1px solid var(--border);
    font-size: 13px;
    gap: 8px;
  }
</style>
