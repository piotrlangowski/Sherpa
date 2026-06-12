<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCurrency, formatPercent, formatMonths } from '$lib/utils/format';
  import { appState } from '$lib/stores/app.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Input from '$lib/components/ui/input/input.svelte';

  // Table components
  import Table from '$lib/components/ui/table/table.svelte';
  import TableBody from '$lib/components/ui/table/table-body.svelte';
  import TableCell from '$lib/components/ui/table/table-cell.svelte';
  import TableHead from '$lib/components/ui/table/table-head.svelte';
  import TableHeader from '$lib/components/ui/table/table-header.svelte';
  import TableRow from '$lib/components/ui/table/table-row.svelte';

  // Lucide Icons
  import Plus from '@lucide/svelte/icons/plus';
  import Compass from '@lucide/svelte/icons/compass';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Percent from '@lucide/svelte/icons/percent';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Upload from '@lucide/svelte/icons/upload';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import Search from '@lucide/svelte/icons/search';

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

  // State controls
  let viewMode = $state<'card' | 'list'>('card');
  let searchQuery = $state('');
  let sortBy = $state('name_asc');
  let resultsFilter = $state('all');

  onMount(() => {
    const saved = localStorage.getItem('sherpa_view_mode_scenarios');
    if (saved === 'card' || saved === 'list') {
      viewMode = saved;
    }
  });

  function setViewMode(mode: 'card' | 'list') {
    viewMode = mode;
    localStorage.setItem('sherpa_view_mode_scenarios', mode);
  }

  // Derived filtered scenarios
  let filteredScenarios = $derived(
    data.scenarios
      .filter((scenario: any) => {
        const matchesSearch = 
          scenario.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (scenario.description && scenario.description.toLowerCase().includes(searchQuery.toLowerCase()));

        const hasResults = scenario.results !== null;
        const matchesFilter = 
          resultsFilter === 'all' ||
          (resultsFilter === 'has_results' && hasResults) ||
          (resultsFilter === 'no_results' && !hasResults);

        return matchesSearch && matchesFilter;
      })
      .sort((a: any, b: any) => {
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'npv_desc') return (b.results?.npv || 0) - (a.results?.npv || 0);
        if (sortBy === 'npv_asc') return (a.results?.npv || 0) - (b.results?.npv || 0);
        if (sortBy === 'horizon_desc') return b.projection_months - a.projection_months;
        if (sortBy === 'horizon_asc') return a.projection_months - b.projection_months;
        return 0;
      })
  );
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
    <!-- Controls Row -->
    <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between glass border p-3 rounded-xl select-none">
      <div class="flex flex-1 flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <!-- Quick Find Search -->
        <div class="relative flex-1 max-w-md">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Quick find scenarios..."
            class="pl-9 bg-(--glass-inset-bg) border-border"
            bind:value={searchQuery}
          />
        </div>

        <!-- Sort Select -->
        <select
          bind:value={sortBy}
          class="bg-(--glass-inset-bg) border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="name_asc">Name (A - Z)</option>
          <option value="name_desc">Name (Z - A)</option>
          <option value="npv_desc">Incremental NPV (Highest)</option>
          <option value="npv_asc">Incremental NPV (Lowest)</option>
          <option value="horizon_desc">Horizon (Longest)</option>
          <option value="horizon_asc">Horizon (Shortest)</option>
        </select>

        <!-- Results Filter -->
        <select
          bind:value={resultsFilter}
          class="bg-(--glass-inset-bg) border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Scenarios</option>
          <option value="has_results">Has Simulated Results</option>
          <option value="no_results">Pending Simulation</option>
        </select>
      </div>

      <!-- View Toggle -->
      <div class="flex items-center space-x-1 border border-border rounded-lg p-1 bg-muted/20 self-end md:self-auto">
        <Button
          variant={viewMode === 'card' ? 'secondary' : 'ghost'}
          size="sm"
          class="h-8 px-3.5"
          onclick={() => setViewMode('card')}
        >
          <LayoutGrid class="h-4 w-4 mr-1.5 opacity-80" /> Card
        </Button>
        <Button
          variant={viewMode === 'list' ? 'secondary' : 'ghost'}
          size="sm"
          class="h-8 px-3.5"
          onclick={() => setViewMode('list')}
        >
          <List class="h-4 w-4 mr-1.5 opacity-80" /> List
        </Button>
      </div>
    </div>

    <!-- Display -->
    {#if filteredScenarios.length === 0}
      <div class="py-16 text-center border border-dashed border-border rounded-lg bg-card/5">
        <p class="text-sm text-muted-foreground select-none">No scenarios found matching the search criteria.</p>
      </div>
    {:else if viewMode === 'card'}
      <!-- Card Grid View -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-200">
        {#each filteredScenarios as scenario (scenario.id)}
          <Card class="glass border flex flex-col justify-between hover:border-primary/20 transition-all duration-300">
            <CardHeader class="pb-3 border-b border-border glass-inset">
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

            <CardContent class="py-4 space-y-4 select-none flex-1">
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
                <div class="p-3 bg-muted/40 rounded-lg border border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-center shadow-inner font-sans">
                  <div>
                    <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Inc. NPV</span>
                    <span class="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                      {formatCurrency(scenario.results.npv, appState.currency, 0)}
                    </span>
                  </div>
                  <div>
                    <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">IRR (AI)</span>
                    <span class="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                      {scenario.results.irr_annual !== null ? formatPercent(scenario.results.irr_annual) : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Payback</span>
                    <span class="text-xs font-black text-cyan-600 dark:text-cyan-400 mt-0.5 block">
                      {scenario.results.payback_months === 0 ? 'Immediate' : scenario.results.payback_months === null ? 'Never' : formatMonths(scenario.results.payback_months)}
                    </span>
                  </div>
                  <div>
                    <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">TCO</span>
                    <span class="text-xs font-black text-foreground mt-0.5 block">
                      {formatCurrency(scenario.results.tco, appState.currency, 0)}
                    </span>
                  </div>
                </div>
              {/if}
            </CardContent>

            <CardFooter class="border-t border-border glass-inset py-3 flex justify-between items-center text-xs select-none">
              <span class="text-muted-foreground/60">
                Created {scenario.created_at ? new Date(scenario.created_at).toLocaleDateString() : 'N/A'}
              </span>
              <Button size="sm" variant="outline" href="/scenarios/{scenario.id}">
                <TrendingUp class="h-3.5 w-3.5 mr-1" /> View Dashboard
              </Button>
            </CardFooter>
          </Card>
        {/each}
      </div>
    {:else}
      <!-- Dense List (Table) View -->
      <div class="border border-border rounded-lg overflow-hidden glass border animate-in fade-in duration-200">
        <Table>
          <TableHeader class="glass-inset">
            <TableRow>
              <TableHead class="text-foreground font-bold">Scenario Name</TableHead>
              <TableHead class="text-foreground font-bold text-right">Horizon</TableHead>
              <TableHead class="text-foreground font-bold text-right">Discount Rate</TableHead>
              <TableHead class="text-foreground font-bold text-right">Incremental NPV</TableHead>
              <TableHead class="text-foreground font-bold text-right">IRR (AI)</TableHead>
              <TableHead class="text-foreground font-bold text-right">Payback</TableHead>
              <TableHead class="text-foreground font-bold text-right">TCO</TableHead>
              <TableHead class="text-foreground font-bold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each filteredScenarios as scenario (scenario.id)}
              <TableRow class="hover:bg-foreground/5 transition-all">
                <TableCell>
                  <div class="font-semibold">{scenario.name}</div>
                  <div class="text-[10px] text-muted-foreground truncate max-w-xs">{scenario.description || 'No description'}</div>
                </TableCell>
                <TableCell class="text-right font-mono text-xs">{scenario.projection_months} months</TableCell>
                <TableCell class="text-right font-mono text-xs">{formatPercent(scenario.discount_rate)}</TableCell>
                <TableCell class="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {#if scenario.results}
                    {formatCurrency(scenario.results.npv, appState.currency, 0)}
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell class="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {#if scenario.results}
                    {formatPercent(scenario.results.irr_annual || 0)}
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell class="text-right font-mono font-medium text-cyan-600 dark:text-cyan-400">
                  {#if scenario.results}
                    {scenario.results.payback_months === 0 ? 'Immediate' : scenario.results.payback_months === null ? 'Never' : formatMonths(scenario.results.payback_months)}
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell class="text-right font-mono text-xs text-foreground">
                  {#if scenario.results}
                    {formatCurrency(scenario.results.tco, appState.currency, 0)}
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end">
                    <Button size="sm" variant="outline" class="h-8 px-2.5" href="/scenarios/{scenario.id}">
                      <TrendingUp class="h-3 w-3 mr-1" /> View Dashboard
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    {/if}
  {/if}

  <Dialog.Root bind:open={importDialogOpen}>
    <Dialog.Content class="sm:max-w-[425px] text-foreground">
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
            class="glass-inset flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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

