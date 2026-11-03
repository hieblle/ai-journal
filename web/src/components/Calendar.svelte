<script lang="ts">
  import { routeHref } from "../lib/state.svelte";

  let { selected, dates, today, onselect }: { selected: string | null; dates: string[]; today: string; onselect?: () => void } = $props();

  const base = $derived(selected ?? today);
  let offset = $state(0);
  let lastBase = $state("");

  $effect(() => {
    if (base !== lastBase) {
      lastBase = base;
      offset = 0;
    }
  });

  const view = $derived.by(() => {
    const [y, m] = base.split("-").map(Number);
    const first = new Date(y, m - 1 + offset, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday first
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    while (cells.length % 7) cells.push(null);
    const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    return { title: `${months[month]} ${year}`, cells };
  });

  const has = $derived(new Set(dates));
</script>

<div class="cal">
  <div class="nav">
    <button class="ghost small" onclick={() => (offset -= 1)} aria-label="Vorheriger Monat">‹</button>
    <span>{view.title}</span>
    <button class="ghost small" onclick={() => (offset += 1)} aria-label="Nächster Monat">›</button>
  </div>
  <div class="grid">
    {#each ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as wd}
      <span class="wd">{wd}</span>
    {/each}
    {#each view.cells as c, i (i)}
      {#if c}
        <a
          href={routeHref({ view: "entry", date: c })}
          class="day"
          class:has={has.has(c)}
          class:today={c === today}
          class:sel={c === selected}
          class:future={c > today}
          onclick={onselect}>{Number(c.slice(8))}</a
        >
      {:else}
        <span></span>
      {/if}
    {/each}
  </div>
</div>

<style>
  .cal {
    padding: 0 4px;
    font-size: 12px;
  }
  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    text-align: center;
  }
  .wd {
    color: var(--fg-3);
    font-size: 11px;
  }
  .day {
    color: var(--fg-3);
    border-radius: 6px;
    padding: 3px 0;
    position: relative;
  }
  .day.has {
    color: var(--fg);
    font-weight: 600;
  }
  .day.has::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: 1px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
    transform: translateX(-50%);
  }
  .day.today {
    outline: 1px solid var(--accent);
  }
  .day.sel {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .day.sel::after {
    background: var(--accent-fg);
  }
  .day.future {
    opacity: 0.4;
  }
  .day:hover {
    background: var(--bg-3);
  }
</style>
