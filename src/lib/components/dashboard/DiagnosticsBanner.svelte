<script lang="ts">
  import Card from '$lib/components/ui/card/card.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import Info from '@lucide/svelte/icons/info';
  import type { ScenarioDiagnostic } from '$lib/shared/types';

  let { diagnostics = [] }: { diagnostics?: ScenarioDiagnostic[] } = $props();
</script>

{#if diagnostics.length > 0}
  <div class="space-y-3">
    {#each diagnostics as d (d.code + (d.field ?? '') + d.message)}
      {#if d.severity === 'warn'}
        <Card class="border-amber-500/30 bg-amber-500/5 p-4 select-none">
          <CardContent class="flex items-start space-x-3 text-sm p-0">
            <Info class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 class="font-bold text-amber-600 dark:text-amber-400">Configuration warning</h4>
              <p class="text-muted-foreground mt-1 text-xs">{d.message}</p>
            </div>
          </CardContent>
        </Card>
      {:else}
        <Card class="border-sky-500/30 bg-sky-500/5 p-4 select-none">
          <CardContent class="flex items-start space-x-3 text-sm p-0">
            <Info class="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />
            <div>
              <h4 class="font-bold text-sky-600 dark:text-sky-400">Note</h4>
              <p class="text-muted-foreground mt-1 text-xs">{d.message}</p>
            </div>
          </CardContent>
        </Card>
      {/if}
    {/each}
  </div>
{/if}
