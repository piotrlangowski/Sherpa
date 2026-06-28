<script lang="ts">
  import { page, navigating } from '$app/stores';
  import { untrack } from 'svelte';
  import type { Component } from 'svelte';
  import { appState } from '../../stores/app.svelte';

  // Lucide Icons
  import Server from '@lucide/svelte/icons/server';
import Layers from '@lucide/svelte/icons/layers';
import CreditCard from '@lucide/svelte/icons/credit-card';
import Coins from '@lucide/svelte/icons/coins';
import GitFork from '@lucide/svelte/icons/git-fork';
import Globe from '@lucide/svelte/icons/globe';
import Users from '@lucide/svelte/icons/users';
import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
import DollarSign from '@lucide/svelte/icons/dollar-sign';
import Settings from '@lucide/svelte/icons/settings';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import Compass from '@lucide/svelte/icons/compass';
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
import Database from '@lucide/svelte/icons/database';

  // Helper to determine if link is active
  function isActive(path: string, exact = false): boolean {
    const currentPath = $page.url.pathname;
    if (exact) {
      return currentPath === path;
    }
    return currentPath.startsWith(path);
  }

  // Recalculating state tracking
  let isUpdating = $derived(!!$navigating);
  let wasUpdating = $state(false);
  let showCompletedGlow = $state(false);

  $effect(() => {
    const updating = isUpdating;
    let timer: NodeJS.Timeout | undefined;

    untrack(() => {
      if (updating) {
        wasUpdating = true;
        showCompletedGlow = false;
      } else if (wasUpdating) {
        wasUpdating = false;
        showCompletedGlow = true;
        timer = setTimeout(() => {
          showCompletedGlow = false;
        }, 1500);
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  });
</script>

{#snippet navLink(href: string, label: string, Icon: Component<any>, active: boolean)}
  <a
    {href}
    class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
      {active
        ? 'bg-primary/10 text-primary font-semibold'
        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
  >
    <div class="flex items-center space-x-3">
      <Icon class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
      <span>{label}</span>
    </div>
    <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
  </a>
{/snippet}

<aside
  class="w-64 h-screen border-r border-border bg-sidebar/70 backdrop-blur-xl backdrop-saturate-150 text-sidebar-foreground flex flex-col justify-between shrink-0 select-none"
>
  <!-- Top Branding Area -->
  <div class="glass-inset p-5 flex flex-col border-b border-border">
    <div class="flex items-center space-x-2.5">
      <div class="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-[0_0_12px_rgba(var(--color-primary),0.3)]">
        <Compass class="h-5 w-5" />
      </div>
      <div>
        <h1 class="text-base font-bold tracking-tight text-foreground">Sherpa</h1>
        <span class="text-xs text-muted-foreground/80 font-medium truncate max-w-[140px] block">
          {appState.companyName}
        </span>
      </div>
    </div>
  </div>

  <!-- Navigation Links -->
  <div class="flex-1 py-4 overflow-y-auto px-3 space-y-5">
    <!-- Group: Planning -->
    <div class="space-y-1">
      <h3 class="px-3 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider select-none">
        Planning
      </h3>
      <div class="mt-1 space-y-0.5">
        {@render navLink(
          '/scenarios',
          'Scenarios',
          Compass,
          isActive('/scenarios') && !isActive('/scenarios/compare', true) && !isActive('/scenarios/', false)
        )}
        {@render navLink('/scenarios/compare', 'Compare', ArrowLeftRight, isActive('/scenarios/compare'))}
      </div>
    </div>

    <!-- Group: Catalog -->
    <div class="space-y-1">
      <h3 class="px-3 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider select-none">
        Catalog
      </h3>
      <div class="mt-1 space-y-0.5">
        {@render navLink('/catalog/services', 'AI Services', BrainCircuit, isActive('/catalog/services'))}
        {@render navLink('/catalog/packs', 'Feature Packs', Layers, isActive('/catalog/packs'))}
        {@render navLink('/catalog/plans', 'Pricing Plans', CreditCard, isActive('/catalog/plans'))}
        {@render navLink('/catalog/pools', 'Credit Pools', Coins, isActive('/catalog/pools'))}
        {@render navLink('/catalog/dependencies', 'Dependencies', GitFork, isActive('/catalog/dependencies'))}
      </div>
    </div>

    <!-- Group: Market -->
    <div class="space-y-1">
      <h3 class="px-3 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider select-none">
        Market
      </h3>
      <div class="mt-1 space-y-0.5">
        {@render navLink('/market/client-base', 'Client Base', Database, isActive('/market/client-base'))}
        {@render navLink('/market/verticals', 'Verticals', Globe, isActive('/market/verticals'))}
        {@render navLink('/market/cohorts', 'Cohorts', Users, isActive('/market/cohorts'))}
      </div>
    </div>

    <!-- Group: Costs -->
    <div class="space-y-1">
      <h3 class="px-3 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider select-none">
        Costs
      </h3>
      <div class="mt-1 space-y-0.5">
        {@render navLink('/costs/providers', 'AI Providers', Server, isActive('/costs/providers'))}
        {@render navLink('/costs/items', 'Cost Items', DollarSign, isActive('/costs/items'))}
      </div>
    </div>
  </div>

  <!-- Bottom Panel: Settings & Active Scenario Widget -->
  <div class="glass-inset p-3 border-t border-border space-y-2">
    <!-- Active Scenario Widget -->
    {#if appState.activeScenarioName}
      <a
        href="/scenarios/{appState.activeScenarioId}"
        class="group p-2.5 rounded-lg border flex flex-col space-y-1 transition-all duration-300 ease-in-out hover:scale-[1.02] hover:bg-primary/15 hover:border-primary/35 hover:shadow-md hover:shadow-primary/5 cursor-pointer relative overflow-hidden
          {showCompletedGlow
            ? 'border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
            : 'border-primary/20 bg-primary/10'}"
      >
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-primary font-bold uppercase tracking-wider">Active Scenario</span>
          <ChevronRight class="h-3 w-3 text-primary/60 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
        </div>
        <span class="text-xs text-foreground font-semibold truncate block pr-4">
          {appState.activeScenarioName}
        </span>
        <div class="flex items-center space-x-1.5 pt-0.5">
          {#if isUpdating}
            <span class="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
            <span class="text-[10px] text-indigo-400 font-medium">Recalculating...</span>
          {:else}
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[10px] text-muted-foreground">Running projections</span>
          {/if}
        </div>
      </a>
    {/if}

    <a
      href="/settings"
      class="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
        {isActive('/settings')
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
    >
      <Settings class="h-4.5 w-4.5 group-hover:rotate-45 transition-transform duration-300" />
      <span>Workspace Settings</span>
    </a>
  </div>
</aside>
