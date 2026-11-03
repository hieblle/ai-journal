<script lang="ts">
  import { api } from "../lib/api";
  import { app } from "../lib/state.svelte";

  let pin = $state("");
  let confirm = $state("");
  let error = $state("");
  let busy = $state(false);
  let input: HTMLInputElement | undefined = $state();

  const setup = $derived(!app.pinSet);

  $effect(() => {
    input?.focus();
  });

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    if (!/^\d{4,12}$/.test(pin)) {
      error = "4 bis 12 Ziffern.";
      return;
    }
    if (setup && pin !== confirm) {
      error = "Die beiden PINs stimmen nicht überein.";
      confirm = "";
      return;
    }
    busy = true;
    try {
      await api.post(setup ? "/api/auth/setup" : "/api/auth/login", { pin });
      pin = "";
      confirm = "";
      await app.refreshAuth();
    } catch (err) {
      error = (err as Error).message;
      pin = "";
      confirm = "";
      input?.focus();
    } finally {
      busy = false;
    }
  }
</script>

<div class="lock">
  <form class="box" onsubmit={submit}>
    <div class="logo">
      <img src="/icon.svg" alt="" width="44" height="44" />
    </div>
    <h1>{setup ? "PIN festlegen" : "Journal"}</h1>
    {#if setup}
      <p class="muted">Die PIN sperrt die Oberfläche. Die Dateien bleiben unverschlüsselt im Journal-Ordner.</p>
    {/if}
    <input
      bind:this={input}
      bind:value={pin}
      type="password"
      inputmode="numeric"
      autocomplete={setup ? "new-password" : "current-password"}
      pattern="[0-9]*"
      placeholder="PIN"
      disabled={busy}
    />
    {#if setup}
      <input bind:value={confirm} type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]*" placeholder="PIN wiederholen" disabled={busy} />
    {/if}
    {#if error}<div class="error">{error}</div>{/if}
    <button class="primary" type="submit" disabled={busy}>{setup ? "Festlegen" : "Entsperren"}</button>
  </form>
</div>

<style>
  .lock {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .box {
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
  .logo {
    margin-bottom: 4px;
  }
  h1 {
    margin: 0;
  }
  p {
    margin: 0;
    font-size: 14px;
  }
  input {
    text-align: center;
    font-size: 22px;
    letter-spacing: 0.3em;
    padding: 10px;
  }
  button {
    padding: 10px;
  }
</style>
