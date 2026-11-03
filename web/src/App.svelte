<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "./lib/state.svelte";
  import Lock from "./components/Lock.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import EntryView from "./components/EntryView.svelte";
  import ReportsView from "./components/ReportsView.svelte";
  import SearchView from "./components/SearchView.svelte";
  import SettingsView from "./components/SettingsView.svelte";

  let ready = $state(false);

  onMount(async () => {
    try {
      await app.refreshAuth();
    } catch (err) {
      app.notify((err as Error).message, "error");
    }
    ready = true;
  });
</script>

{#if !ready}
  <div class="boot muted">Lade …</div>
{:else if app.locked || !app.pinSet}
  <Lock />
{:else}
  <div class="shell">
    <Sidebar />
    <div class="main">
      {#if app.route.view === "entry"}
        <EntryView date={app.route.date} />
      {:else if app.route.view === "reports"}
        <ReportsView kind={app.route.kind} key={app.route.key} />
      {:else if app.route.view === "search"}
        <SearchView q={app.route.q} />
      {:else if app.route.view === "settings"}
        <SettingsView tab={app.route.tab} />
      {/if}
    </div>
  </div>
{/if}

{#if app.toast}
  <div class="toast {app.toast.kind}">{app.toast.text}</div>
{/if}

<style>
  .boot {
    display: grid;
    place-items: center;
    height: 100%;
  }
</style>
