<script lang="ts">
  import Card from '$lib/components/ui/card/card.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import Info from '@lucide/svelte/icons/info';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import type { ScenarioDiagnostic } from '$lib/shared/types';

  let { items, diagnostics = [] }: { items?: ScenarioDiagnostic[]; diagnostics?: ScenarioDiagnostic[] } = $props();
  let expanded = $state(false);

  const displayItems = $derived(items ?? diagnostics);
  const warnCount = $derived(displayItems.filter(i => i.severity === 'warn').length);
  const infoCount = $derived(displayItems.filter(i => i.severity === 'info').length);
  const hasWarnings = $derived(warnCount > 0);
</script>

{#if displayItems.length > 0}
  <div class="space-y-3">
    <button
      type="button"
      onclick={() => expanded = !expanded}
      class="w-full flex items-center justify-between p-3 rounded-lg border text-sm font-medium transition-colors select-none text-left
        {hasWarnings
          ? 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-850 dark:text-amber-350'
          : 'border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 text-sky-850 dark:text-sky-350'}"
    >
      <div class="flex items-center space-x-3">
        {#if hasWarnings}
          <AlertTriangle class="h-4 w-4 text-amber-500 shrink-0" />
        {:else}
          <Info class="h-4 w-4 text-sky-500 shrink-0" />
        {/if}
        <div class="flex items-center space-x-2">
          {#if warnCount > 0}
            <span class="font-semibold">{warnCount} {warnCount === 1 ? 'warning' : 'warnings'}</span>
          {/if}
          {#if warnCount > 0 && infoCount > 0}
            <span class="opacity-50 font-semibold">•</span>
          {/if}
          {#if infoCount > 0}
            <span class="font-semibold">{infoCount} {infoCount === 1 ? 'note' : 'notes'}</span>
          {/if}
          <span class="text-xs font-normal text-muted-foreground/80 ml-1">
            ({expanded ? 'click to collapse' : 'click to expand'})
          </span>
        </div>
      </div>
      {#if expanded}
        <ChevronUp class="h-4 w-4 shrink-0 opacity-70" />
      {:else}
        <ChevronDown class="h-4 w-4 shrink-0 opacity-70" />
      {/if}
    </button>

    {#if expanded}
      <div class="space-y-3">
        {#each displayItems as d (d.code + (d.field ?? '') + d.message)}
          {#if d.severity === 'warn'}
            <Card class="border-amber-500/30 bg-amber-500/5 p-4 select-none">
              <CardContent class="flex items-start space-x-3 text-sm p-0">
                <AlertTriangle class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 class="font-bold text-amber-600 dark:text-amber-400">{d.title ?? 'Configuration warning'}</h4>
                  <p class="text-muted-foreground mt-1 text-xs">{d.message}</p>
                </div>
              </CardContent>
            </Card>
          {:else}
            <Card class="border-sky-500/30 bg-sky-500/5 p-4 select-none">
              <CardContent class="flex items-start space-x-3 text-sm p-0">
                <Info class="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />
                <div>
                  <h4 class="font-bold text-sky-600 dark:text-sky-400">{d.title ?? 'Note'}</h4>
                  <p class="text-muted-foreground mt-1 text-xs">{d.message}</p>
                </div>
              </CardContent>
            </Card>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}
