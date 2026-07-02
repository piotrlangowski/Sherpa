<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import { formatCurrency } from '$lib/utils/format';
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
  import Edit2 from '@lucide/svelte/icons/edit-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Coins from '@lucide/svelte/icons/coins';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import Search from '@lucide/svelte/icons/search';

  let { data } = $props();

  // State
  let viewMode = $state<'card' | 'list'>('card');
  let searchQuery = $state('');
  let sortBy = $state('name_asc');

  onMount(() => {
    const saved = localStorage.getItem('sherpa_view_mode_pools');
    if (saved === 'card' || saved === 'list') {
      viewMode = saved;
    }
  });

  function setViewMode(mode: 'card' | 'list') {
    viewMode = mode;
    localStorage.setItem('sherpa_view_mode_pools', mode);
  }

  // Derived filtered & sorted array
  let filteredPools = $derived(
    data.pools
      .filter((pool: any) => {
        return pool.name.toLowerCase().includes(searchQuery.toLowerCase());
      })
      .sort((a: any, b: any) => {
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'fee_desc') return b.monthly_fee - a.monthly_fee;
        if (sortBy === 'fee_asc') return a.monthly_fee - b.monthly_fee;
        if (sortBy === 'credits_desc') return b.credit_pool_size - a.credit_pool_size;
        if (sortBy === 'credits_asc') return a.credit_pool_size - b.credit_pool_size;
        return 0;
      })
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Credit Pools</h2>
      <p class="text-muted-foreground text-sm font-normal">Manage unified credit-pool subscription tiers and service burn rates (ADR 0010 Approach B).</p>
    </div>
    <Button href="/catalog/pools/new">
      <Plus class="h-4 w-4 mr-2" /> Create Credit Pool
    </Button>
  </div>

  {#if data.pools.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Coins class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">No Credit Pools</h3>
          <p class="text-sm text-muted-foreground">Click "Create Credit Pool" to set up unified credit-pool tiers.</p>
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
            placeholder="Quick find pools..."
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
          <option value="fee_desc">Monthly Fee (Highest)</option>
          <option value="fee_asc">Monthly Fee (Lowest)</option>
          <option value="credits_desc">Pool Size (Highest)</option>
          <option value="credits_asc">Pool Size (Lowest)</option>
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
    {#if filteredPools.length === 0}
      <div class="py-16 text-center border border-dashed border-border rounded-lg bg-card/5">
        <p class="text-sm text-muted-foreground select-none">No credit pools found matching the search criteria.</p>
      </div>
    {:else}
      {#if viewMode === 'card'}
        <!-- Card Grid View -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each filteredPools as pool}
            <Card class="border-border bg-card/40 backdrop-blur-md flex flex-col justify-between group hover:border-primary/40 hover:shadow-lg transition-all duration-300 relative overflow-hidden">
              <CardHeader class="pb-3 border-b border-border/40 select-none">
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <CardTitle class="text-lg font-bold group-hover:text-primary transition-colors">{pool.name}</CardTitle>
                    <CardDescription class="text-xs">
                      {pool.credit_pool_size.toLocaleString()} credits / mo {pool.pool_size_basis === 'per_member' ? ' / member' : ''}
                    </CardDescription>
                  </div>
                  <div class="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                    <Coins class="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>

              <CardContent class="py-4 space-y-3.5 flex-1">
                <div class="flex justify-between items-baseline border-b border-border/20 pb-2">
                  <span class="text-xs text-muted-foreground">Monthly Fee</span>
                  <span class="text-lg font-bold font-mono text-foreground">
                    {formatCurrency(pool.monthly_fee, appState.currency, 2)}{pool.fee_basis === 'per_member' ? ' / member' : (pool.fee_basis === 'per_customer' ? ' / customer' : '')}
                  </span>
                </div>

                <div class="flex justify-between items-baseline border-b border-border/20 pb-2">
                  <span class="text-xs text-muted-foreground">EVC Capture Override</span>
                  <span class="text-xs font-semibold text-foreground">
                    {pool.capture !== null && pool.capture !== undefined ? `${Math.round(pool.capture * 100)}%` : 'Scenario Default'}
                  </span>
                </div>

                <div class="space-y-1.5">
                  <span class="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Service Burn Rates</span>
                  {#if !pool.burn_rates || pool.burn_rates.length === 0}
                    <span class="text-xs text-muted-foreground italic block">No services configured.</span>
                  {:else}
                    <div class="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {#each pool.burn_rates as br}
                        <div class="flex justify-between text-xs font-semibold bg-muted/30 border border-border/40 p-1.5 rounded-md">
                          <span class="text-foreground truncate max-w-[150px]">{br.service_name}</span>
                          <span class="font-mono text-primary">{br.burn_rate.toLocaleString()} credits</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              </CardContent>

              <CardFooter class="bg-muted/10 border-t border-border/40 py-3 px-6 flex items-center justify-end space-x-2 select-none">
                <Button variant="ghost" size="icon" href="/catalog/pools/{pool.id}/edit" class="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <Edit2 class="h-3.5 w-3.5" />
                </Button>
                <form
                  method="POST"
                  action="?/deletePoolTier"
                  use:enhance={() => {
                    return async ({ update }) => {
                      if (confirm(`Are you sure you want to delete ${pool.name}?`)) {
                        await update();
                      }
                    };
                  }}
                >
                  <input type="hidden" name="id" value={pool.id} />
                  <Button type="submit" variant="ghost" size="icon" class="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10">
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </form>
              </CardFooter>
            </Card>
          {/each}
        </div>
      {:else}
        <!-- List / Table View -->
        <div class="border border-border rounded-xl overflow-hidden glass">
          <Table>
            <TableHeader class="bg-muted/40 select-none">
              <TableRow>
                <TableHead>Pool Tier Name</TableHead>
                <TableHead class="text-right">Monthly Fee</TableHead>
                <TableHead class="text-right">Credit Pool Size</TableHead>
                <TableHead class="text-center">EVC Capture</TableHead>
                <TableHead>Service Burn Rates</TableHead>
                <TableHead class="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each filteredPools as pool}
                <TableRow class="hover:bg-muted/10 transition-colors">
                  <TableCell class="font-semibold text-foreground">{pool.name}</TableCell>
                  <TableCell class="text-right font-mono font-bold">
                    {formatCurrency(pool.monthly_fee, appState.currency, 2)}{pool.fee_basis === 'per_member' ? ' / member' : (pool.fee_basis === 'per_customer' ? ' / customer' : '')}
                  </TableCell>
                  <TableCell class="text-right font-mono">
                    {pool.credit_pool_size.toLocaleString()} credits {pool.pool_size_basis === 'per_member' ? '/ member' : ''}
                  </TableCell>
                  <TableCell class="text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border">
                      {pool.capture !== null && pool.capture !== undefined ? `${Math.round(pool.capture * 100)}%` : 'Scenario Default'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {#if !pool.burn_rates || pool.burn_rates.length === 0}
                      <span class="text-xs text-muted-foreground italic">None</span>
                    {:else}
                      <div class="flex flex-wrap gap-1">
                        {#each pool.burn_rates as br}
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/5 text-primary border border-primary/10">
                            {br.service_name} ({br.burn_rate})
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex items-center justify-end space-x-1">
                      <Button variant="ghost" size="icon" href="/catalog/pools/{pool.id}/edit" class="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Edit2 class="h-3.5 w-3.5" />
                      </Button>
                      <form
                        method="POST"
                        action="?/deletePoolTier"
                        use:enhance={() => {
                          return async ({ update }) => {
                            if (confirm(`Are you sure you want to delete ${pool.name}?`)) {
                              await update();
                            }
                          };
                        }}
                      >
                        <input type="hidden" name="id" value={pool.id} />
                        <Button type="submit" variant="ghost" size="icon" class="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10">
                          <Trash2 class="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </div>
      {/if}
    {/if}
  {/if}
</div>
