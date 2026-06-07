<script lang="ts">
  import { page, navigating } from '$app/stores';
  import { appState } from '../../stores/app.svelte';
  
  // Lucide Icons
  import Server from '@lucide/svelte/icons/server';
  import Layers from '@lucide/svelte/icons/layers';
  import CreditCard from '@lucide/svelte/icons/credit-card';
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
    if (isUpdating) {
      wasUpdating = true;
      showCompletedGlow = false;
    } else if (wasUpdating) {
      wasUpdating = false;
      showCompletedGlow = true;
      const timer = setTimeout(() => {
        showCompletedGlow = false;
      }, 1500);
      return () => clearTimeout(timer);
    }
  });
</script>

<aside class="w-64 h-screen border-r border-border bg-sidebar text-sidebar-foreground flex flex-col justify-between shrink-0 select-none">
  <!-- Top Branding Area -->
  <div class="p-5 flex flex-col border-b border-border bg-black/10">
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
        <a
          href="/scenarios"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/scenarios') && !isActive('/scenarios/compare', true) && !isActive('/scenarios/', false)
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <Compass class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Scenarios</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>

        <a
          href="/scenarios/compare"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/scenarios/compare')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <ArrowLeftRight class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Compare</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>

    <!-- Group: Catalog -->
    <div class="space-y-1">
      <h3 class="px-3 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider select-none">
        Catalog
      </h3>
      <div class="mt-1 space-y-0.5">
        <a
          href="/catalog/services"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/catalog/services')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <BrainCircuit class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>AI Services</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>

        <a
          href="/catalog/packs"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/catalog/packs')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <Layers class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Feature Packs</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>

        <a
          href="/catalog/plans"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/catalog/plans')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <CreditCard class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Pricing Plans</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>

        <a
          href="/catalog/dependencies"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/catalog/dependencies')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <GitFork class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Dependencies</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>

    <!-- Group: Market -->
    <div class="space-y-1">
      <h3 class="px-3 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider select-none">
        Market
      </h3>
      <div class="mt-1 space-y-0.5">
        <a
          href="/market/client-base"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/market/client-base')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <Database class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Client Base</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>

        <a
          href="/market/verticals"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/market/verticals')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <Globe class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Verticals</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>

        <a
          href="/market/cohorts"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/market/cohorts')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <Users class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Cohorts</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>

    <!-- Group: Costs -->
    <div class="space-y-1">
      <h3 class="px-3 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider select-none">
        Costs
      </h3>
      <div class="mt-1 space-y-0.5">
        <a
          href="/costs/providers"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/costs/providers')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <Server class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>AI Providers</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>

        <a
          href="/costs/items"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-200
            {isActive('/costs/items')
              ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
        >
          <div class="flex items-center space-x-3">
            <DollarSign class="h-4.5 w-4.5 group-hover:scale-105 transition-transform" />
            <span>Cost Items</span>
          </div>
          <ChevronRight class="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>


  </div>

  <!-- Bottom Panel: Settings & Active Scenario Widget -->
  <div class="p-3 border-t border-border bg-black/10 space-y-2">
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
          ? 'bg-secondary text-foreground font-semibold border-l-2 border-primary'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}"
    >
      <Settings class="h-4.5 w-4.5 group-hover:rotate-45 transition-transform duration-300" />
      <span>Workspace Settings</span>
    </a>
  </div>
</aside>
