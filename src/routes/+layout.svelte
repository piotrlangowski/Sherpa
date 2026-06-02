<script lang="ts">
  import './layout.css';
  import { ModeWatcher, setMode } from 'mode-watcher';
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import SetupWizard from '$lib/components/wizard/SetupWizard.svelte';
  import { appState } from '$lib/stores/app.svelte';
  import { onMount } from 'svelte';

  interface Props {
    data: {
      settings: {
        companyName: string;
        currency: any;
        defaultDiscountRate: number;
        setupCompleted: boolean;
      };
    };
    children: import('svelte').Snippet;
  }

  let { data, children }: Props = $props();

  // Initialize global state store with server load data
  $effect(() => {
    if (data?.settings) {
      appState.init(data.settings);
    }
  });

  onMount(() => {
    // Respect system preference or user setting, defaulting to light mode
  });
</script>

<ModeWatcher defaultMode="light" />

{#if appState.setupCompleted}
  <AppShell>
    {@render children()}
  </AppShell>
{:else}
  <SetupWizard />
{/if}
