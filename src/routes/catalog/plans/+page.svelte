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
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import Layers from '@lucide/svelte/icons/layers';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import Search from '@lucide/svelte/icons/search';

  let { data } = $props();

  // State
  let viewMode = $state<'card' | 'list'>('card');
  let searchQuery = $state('');
  let sortBy = $state('name_asc');

  onMount(() => {
    const saved = localStorage.getItem('sherpa_view_mode_plans');
    if (saved === 'card' || saved === 'list') {
      viewMode = saved;
    }
  });

  function setViewMode(mode: 'card' | 'list') {
    viewMode = mode;
    localStorage.setItem('sherpa_view_mode_plans', mode);
  }

  // Derived array
  let filteredPlans = $derived(
    data.plans
      .filter((plan: any) => {
        const matchesSearch = 
          plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (plan.description && plan.description.toLowerCase().includes(searchQuery.toLowerCase()));

        return matchesSearch;
      })
      .sort((a: any, b: any) => {
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'price_desc') return b.base_price - a.base_price;
        if (sortBy === 'price_asc') return a.base_price - b.base_price;
        return 0;
      })
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Pricing Plans</h2>
      <p class="text-muted-foreground text-sm font-normal">Manage license pricing packages and target tiers.</p>
    </div>
    <Button href="/catalog/plans/new">
      <Plus class="h-4 w-4 mr-2" /> Create Pricing Plan
    </Button>
  </div>

  {#if data.plans.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <CreditCard class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">No Pricing Plans</h3>
          <p class="text-sm text-muted-foreground">Click "Create Pricing Plan" to set up pricing structures.</p>
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
            placeholder="Quick find plans..."
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
          <option value="price_desc">Price (Highest)</option>
          <option value="price_asc">Price (Lowest)</option>
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
    {#if filteredPlans.length === 0}
      <div class="py-16 text-center border border-dashed border-border rounded-lg bg-card/5">
        <p class="text-sm text-muted-foreground select-none">No pricing plans found matching the search criteria.</p>
      </div>
    {:else if viewMode === 'card'}
      <!-- Card Grid View -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
        {#each filteredPlans as plan (plan.id)}
          <Card class="glass border flex flex-col justify-between hover:border-primary/30 transition-all duration-300 group">
            <CardHeader class="pb-3 border-b border-border glass-inset">
              <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2.5 text-primary">
                  <CreditCard class="h-5 w-5 group-hover:scale-105 transition-transform" />
                  <CardTitle class="text-base font-bold text-foreground line-clamp-1">{plan.name}</CardTitle>
                </div>
                <span class="text-base font-black text-primary">
                  {formatCurrency(plan.base_price, appState.currency, 2)}/mo
                </span>
              </div>
              {#if plan.description}
                <CardDescription class="mt-2 line-clamp-2 h-10 select-none text-muted-foreground/90 leading-snug">
                  {plan.description}
                </CardDescription>
              {/if}
            </CardHeader>

            <CardContent class="py-4 space-y-4 select-none flex-1">
              <!-- Included Packs -->
              {#if plan.packs && plan.packs.length > 0}
                <div>
                  <span class="text-xs text-muted-foreground font-semibold block mb-2">Feature Packs:</span>
                  <div class="flex flex-wrap gap-1.5 font-sans">
                    {#each plan.packs as pack}
                      <span class="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-muted border border-border text-foreground">
                        <Layers class="h-3 w-3 mr-1 text-primary" />
                        {pack.name}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Included Services -->
              {#if plan.services && plan.services.length > 0}
                <div>
                  <span class="text-xs text-muted-foreground font-semibold block mb-2">Direct AI Services:</span>
                  <div class="flex flex-wrap gap-1.5 font-sans">
                    {#each plan.services as service}
                      <span class="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-muted border border-border text-foreground">
                        <BrainCircuit class="h-3 w-3 mr-1 text-primary" />
                        {service.name}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if (!plan.packs || plan.packs.length === 0) && (!plan.services || plan.services.length === 0)}
                <span class="text-xs text-muted-foreground/45 italic block">No features mapped to this plan.</span>
              {/if}
            </CardContent>

            <CardFooter class="border-t border-border glass-inset py-3.5 flex justify-end space-x-2">
              <Button variant="outline" size="sm" href="/catalog/plans/{plan.id}">
                <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
              <form method="POST" action="?/deletePlan" use:enhance class="inline-block">
                <input type="hidden" name="id" value={plan.id} />
                <Button type="submit" variant="outline" size="sm" class="text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 class="h-3.5 w-3.5 mr-1.5" /> Delete
                </Button>
              </form>
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
              <TableHead class="text-foreground font-bold">Plan Name</TableHead>
              <TableHead class="text-foreground font-bold text-right">Base License Price</TableHead>
              <TableHead class="text-foreground font-bold">Description</TableHead>
              <TableHead class="text-foreground font-bold">Feature Packs</TableHead>
              <TableHead class="text-foreground font-bold">Direct AI Services</TableHead>
              <TableHead class="text-foreground font-bold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each filteredPlans as plan (plan.id)}
              <TableRow class="hover:bg-foreground/5 transition-all">
                <TableCell class="font-semibold">{plan.name}</TableCell>
                <TableCell class="text-right font-mono font-bold text-primary">
                  {formatCurrency(plan.base_price, appState.currency, 2)}/mo
                </TableCell>
                <TableCell class="text-muted-foreground text-xs max-w-xs truncate">{plan.description || 'No description'}</TableCell>
                <TableCell>
                  {#if !plan.packs || plan.packs.length === 0}
                    <span class="text-xs text-muted-foreground/45 italic">None</span>
                  {:else}
                    <div class="flex flex-wrap gap-1">
                      {#each plan.packs as pack}
                        <span class="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted border border-border text-foreground">
                          {pack.name}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </TableCell>
                <TableCell>
                  {#if !plan.services || plan.services.length === 0}
                    <span class="text-xs text-muted-foreground/45 italic">None</span>
                  {:else}
                    <div class="flex flex-wrap gap-1">
                      {#each plan.services as service}
                        <span class="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted border border-border text-foreground">
                          {service.name}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" class="h-8 px-2.5" href="/catalog/plans/{plan.id}">
                      <Edit2 class="h-3 w-3" />
                    </Button>
                    <form method="POST" action="?/deletePlan" use:enhance class="inline-block">
                      <input type="hidden" name="id" value={plan.id} />
                      <Button type="submit" variant="outline" size="sm" class="h-8 px-2.5 text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground">
                        <Trash2 class="h-3 w-3" />
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
</div>

