<script lang="ts">
  import { syncState } from "../js/sync.svelte";
  import SyncChoice from "./SyncChoice.svelte";
  import HostView from "./HostView.svelte";
  import ClientView from "./ClientView.svelte";
  import DiscardPileModal from "./DiscardPileModal.svelte";
  import InspectModal from "./InspectModal.svelte";

  let showDiscardPile = $state(false);
  let inspectingPlayerId = $state<string | null>(null);
  let showPassMenu = $state(false);
</script>

<div id="view-table" class="view active">
  {#if syncState.role === "none"}
    <SyncChoice />
  {:else if syncState.role === "host"}
    <HostView bind:showDiscardPile bind:inspectingPlayerId />
  {:else if syncState.role === "client"}
    <ClientView bind:showDiscardPile bind:showPassMenu />
  {/if}

  {#if showDiscardPile}
    <DiscardPileModal bind:showDiscardPile />
  {/if}

  {#if inspectingPlayerId}
    <InspectModal bind:inspectingPlayerId />
  {/if}
</div>
