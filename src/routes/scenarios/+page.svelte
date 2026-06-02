<script lang="ts">
  import { formatCurrency, formatPercent, formatMonths } from '$lib/utils/format';
  import Button from '$lib/components/ui/button/button.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';

  // Lucide Icons
  import Plus from '@lucide/svelte/icons/plus';
  import Compass from '@lucide/svelte/icons/compass';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Percent from '@lucide/svelte/icons/percent';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Upload from '@lucide/svelte/icons/upload';

  import * as Dialog from '$lib/components/ui/dialog/index.js';

  let { data } = $props();

  let importDialogOpen = $state(false);
  let importFile = $state<File | null>(null);
  let isImporting = $state(false);
  let importError = $state('');

  async function handleImport() {
    if (!importFile) return;
    isImporting = true;
    importError = '';

    try {
      const text = await importFile.text();
      const jsonPayload = JSON.parse(text);

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonPayload)
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.message || 'Import failed');
      }

      importDialogOpen = false;
      // Redirect to the newly created scenario dashboard
      window.location.href = `/scenarios/${resData.scenarioId}`;
    } catch (err: any) {
      importError = err.message || 'An error occurred during import.';
    } finally {
      isImporting = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Financial Projections & Scenarios</h2>
      <p class="text-muted-foreground text-sm">Create and evaluate different rollout scenarios to see simulated ROI.</p>
    </div>
    <div class="flex items-center space-x-2">
      <Button variant="outline" onclick={() => { importDialogOpen = true; importFile = null; importError = ''; }}>
        <Upload class="h-4 w-4 mr-2" /> Import Scenario
      </Button>
      <Button href="/scenarios/new">
        <Plus class="h-4 w-4 mr-2" /> New Scenario
      </Button>
    </div>
  </div>

  {#if data.scenarios.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Compass class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">No Scenarios Evaluated</h3>
          <p class="text-sm text-muted-foreground">Complete workspace configuration to build new scenarios.</p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      {#each data.scenarios as scenario}
        <Card class="border-border bg-card/45 backdrop-blur-sm shadow-sm flex flex-col justify-between hover:border-primary/20 transition-all duration-300">
          <CardHeader class="pb-3 border-b border-border bg-black/5">
            <div class="flex items-center space-x-2.5 text-primary">
              <Compass class="h-5 w-5" />
              <CardTitle class="text-base font-bold text-foreground truncate">{scenario.name}</CardTitle>
            </div>
            {#if scenario.description}
              <CardDescription class="mt-2 line-clamp-2 h-10 select-none text-muted-foreground/90 leading-snug">
                {scenario.description}
              </CardDescription>
            {/if}
          </CardHeader>

          <CardContent class="py-4 space-y-4 select-none">
            <!-- Details -->
            <div class="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div class="flex items-center space-x-1.5">
                <Calendar class="h-4 w-4 shrink-0 text-muted-foreground/50" />
                <span>Horizon: <strong>{scenario.projection_months} months</strong></span>
              </div>
              <div class="flex items-center space-x-1.5">
                <Percent class="h-4 w-4 shrink-0 text-muted-foreground/50" />
                <span>Discount Rate: <strong>{formatPercent(scenario.discount_rate)}</strong></span>
              </div>
            </div>

            <!-- Seed Results Preview -->
            {#if scenario.results}
              <div class="p-3 bg-muted/40 rounded-lg border border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-center shadow-inner">
                <div>
                  <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">NPV</span>
                  <span class="text-xs font-black text-emerald-400 mt-0.5 block">
                    {formatCurrency(scenario.results.npv, 'USD', 0)}
                  </span>
                </div>
                <div>
                  <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">IRR (Ann.)</span>
                  <span class="text-xs font-black text-emerald-400 mt-0.5 block">
                    {formatPercent(scenario.results.irr_annual || 0)}
                  </span>
                </div>
                <div>
                  <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Payback</span>
                  <span class="text-xs font-black text-cyan-400 mt-0.5 block">
                    {formatMonths(scenario.results.payback_months)}
                  </span>
                </div>
                <div>
                  <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">TCO</span>
                  <span class="text-xs font-black text-foreground mt-0.5 block">
                    {formatCurrency(scenario.results.tco, 'USD', 0)}
                  </span>
                </div>
              </div>
            {/if}
          </CardContent>

          <CardFooter class="border-t border-border bg-black/5 py-3 flex justify-between items-center text-xs select-none">
            <span class="text-muted-foreground/60">
              Created {new Date(scenario.created_at).toLocaleDateString()}
            </span>
            <Button size="sm" variant="outline" href="/scenarios/{scenario.id}">
              <TrendingUp class="h-3.5 w-3.5 mr-1" /> View Dashboard
            </Button>
          </CardFooter>
        </Card>
      {/each}
    </div>
  {/if}

  <Dialog.Root bind:open={importDialogOpen}>
    <Dialog.Content class="sm:max-w-[425px] bg-card border-border text-foreground">
      <Dialog.Header>
        <Dialog.Title>Import ROI Scenario</Dialog.Title>
        <Dialog.Description>
          Upload a JSON scenario configuration file to import it into your workspace.
        </Dialog.Description>
      </Dialog.Header>
      <div class="grid gap-4 py-4">
        <div class="flex flex-col gap-2">
          <label for="import-file" class="text-sm font-medium">Select JSON File</label>
          <input 
            id="import-file" 
            type="file" 
            accept=".json"
            class="flex h-10 w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onchange={(e) => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files.length > 0) {
                importFile = files[0];
              }
            }}
          />
        </div>
        {#if importError}
          <div class="text-sm text-destructive font-medium bg-destructive/10 border border-destructive/20 p-2.5 rounded-md">
            {importError}
          </div>
        {/if}
      </div>
      <Dialog.Footer>
        <Button variant="outline" onclick={() => importDialogOpen = false} disabled={isImporting}>
          Cancel
        </Button>
        <Button onclick={handleImport} disabled={!importFile || isImporting}>
          {#if isImporting}
            Importing...
          {:else}
            Upload & Import
          {/if}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
</div>
