<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import { formatNumber } from '$lib/utils/format';
  import Button from '$lib/components/ui/button/button.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
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
  import Globe from '@lucide/svelte/icons/globe';
  import Users from '@lucide/svelte/icons/users';
  import Layers from '@lucide/svelte/icons/layers';
  import Landmark from '@lucide/svelte/icons/landmark';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import Search from '@lucide/svelte/icons/search';

  let { data } = $props();

  // State
  let viewMode = $state<'card' | 'list'>('card');
  let searchQuery = $state('');
  let sortBy = $state('name_asc');

  onMount(() => {
    const saved = localStorage.getItem('sherpa_view_mode_verticals');
    if (saved === 'card' || saved === 'list') {
      viewMode = saved;
    }
  });

  function setViewMode(mode: 'card' | 'list') {
    viewMode = mode;
    localStorage.setItem('sherpa_view_mode_verticals', mode);
  }

  // Derived array
  let filteredVerticals = $derived(
    data.verticals
      .filter((vertical: any) => {
        const matchesSearch = 
          vertical.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (vertical.description && vertical.description.toLowerCase().includes(searchQuery.toLowerCase()));

        return matchesSearch;
      })
      .sort((a: any, b: any) => {
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'tam_desc') return (b.tam_users || 0) - (a.tam_users || 0);
        if (sortBy === 'tam_asc') return (a.tam_users || 0) - (b.tam_users || 0);
        if (sortBy === 'sam_desc') return (b.sam_users || 0) - (a.sam_users || 0);
        if (sortBy === 'sam_asc') return (a.sam_users || 0) - (b.sam_users || 0);
        if (sortBy === 'som_desc') return (b.som_users || 0) - (a.som_users || 0);
        if (sortBy === 'som_asc') return (a.som_users || 0) - (b.som_users || 0);
        return 0;
      })
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Market Verticals</h2>
      <p class="text-muted-foreground text-sm font-normal">Define business segments, estimate market sizes, and link to plans and packs.</p>
    </div>
    <div class="flex items-center gap-2">
      <Button href="/market/verticals/new">
        <Plus class="h-4 w-4 mr-2" /> Add Vertical
      </Button>
    </div>
  </div>

  {#if data.verticals.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Globe class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">No Verticals Configured</h3>
          <p class="text-sm text-muted-foreground">Click "Add Vertical" to start segmenting your target markets.</p>
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
            placeholder="Quick find verticals..."
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
          <option value="tam_desc">TAM Size (Highest)</option>
          <option value="tam_asc">TAM Size (Lowest)</option>
          <option value="sam_desc">SAM Size (Highest)</option>
          <option value="sam_asc">SAM Size (Lowest)</option>
          <option value="som_desc">SOM Size (Highest)</option>
          <option value="som_asc">SOM Size (Lowest)</option>
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
    {#if filteredVerticals.length === 0}
      <div class="py-16 text-center border border-dashed border-border rounded-lg bg-card/5">
        <p class="text-sm text-muted-foreground select-none">No verticals found matching the search criteria.</p>
      </div>
    {:else if viewMode === 'card'}
      <!-- Card Grid View -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
        {#each filteredVerticals as vertical (vertical.id)}
          <Card class="glass border flex flex-col justify-between hover:border-primary/30 transition-all duration-300 group">
            <CardHeader class="pb-3 border-b border-border glass-inset">
              <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2 text-primary">
                  <Globe class="h-5 w-5 group-hover:scale-105 transition-transform" />
                  <CardTitle class="text-lg font-bold text-foreground line-clamp-1">{vertical.name}</CardTitle>
                </div>
              </div>
              {#if vertical.description}
                <CardDescription class="mt-2 line-clamp-2 h-10 select-none text-muted-foreground/90 leading-snug">
                  {vertical.description}
                </CardDescription>
              {/if}
            </CardHeader>

            <CardContent class="py-5 space-y-4 text-sm select-none flex-1">
              <!-- Market Size Breakdown -->
              <div>
                <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5 mb-3 font-semibold uppercase tracking-wider">
                  <Users class="h-3.5 w-3.5 opacity-60" />
                  <span>Market Sizing (Users)</span>
                </span>
                <div class="grid grid-cols-3 gap-4 bg-muted/40 p-3 rounded-lg border border-border/40">
                  <div class="text-center">
                    <div class="text-[10px] text-muted-foreground/80 uppercase font-medium">TAM</div>
                    <div class="text-sm font-bold text-foreground mt-0.5">{formatNumber(vertical.tam_users ?? 0)}</div>
                  </div>
                  <div class="text-center border-x border-border/50">
                    <div class="text-[10px] text-muted-foreground/80 uppercase font-medium">SAM</div>
                    <div class="text-sm font-bold text-primary mt-0.5">{formatNumber(vertical.sam_users ?? 0)}</div>
                  </div>
                  <div class="text-center">
                    <div class="text-[10px] text-muted-foreground/80 uppercase font-medium">SOM</div>
                    <div class="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatNumber(vertical.som_users ?? 0)}</div>
                  </div>
                </div>
                
                <!-- Sizing relative bar -->
                {#if vertical.tam_users !== undefined && vertical.tam_users > 0}
                  <div class="mt-3.5 h-2 w-full bg-muted rounded-full overflow-hidden flex">
                    <div class="h-full bg-emerald-500" style="width: {Math.max(1, ((vertical.som_users || 0) / (vertical.tam_users ?? 1)) * 100)}%" title="SOM"></div>
                    <div class="h-full bg-primary" style="width: {Math.max(0, (((vertical.sam_users || 0) - (vertical.som_users || 0)) / (vertical.tam_users ?? 1)) * 100)}%" title="SAM"></div>
                    <div class="h-full bg-muted-foreground/30" style="width: {Math.max(0, (((vertical.tam_users ?? 0) - (vertical.sam_users || 0)) / (vertical.tam_users ?? 1)) * 100)}%" title="TAM"></div>
                  </div>
                {/if}
              </div>

              <!-- Linked Plans -->
              <div class="space-y-1.5">
                <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5 font-semibold uppercase tracking-wider">
                  <Landmark class="h-3.5 w-3.5 opacity-60" />
                  <span>Assigned Pricing Plans</span>
                </span>
                <div class="flex flex-wrap gap-1.5 font-sans">
                  {#if vertical.plans && vertical.plans.length > 0}
                    {#each vertical.plans as plan}
                      <Badge variant="outline" class="glass-inset text-foreground border-border/80 font-mono py-0.5 px-2">{plan.name}</Badge>
                    {/each}
                  {:else}
                    <span class="text-xs text-muted-foreground italic">No plans assigned</span>
                  {/if}
                </div>
              </div>

              <!-- Linked Packs -->
              <div class="space-y-1.5">
                <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5 font-semibold uppercase tracking-wider">
                  <Layers class="h-3.5 w-3.5 opacity-60" />
                  <span>Assigned Feature Packs</span>
                </span>
                <div class="flex flex-wrap gap-1.5 font-sans">
                  {#if vertical.packs && vertical.packs.length > 0}
                    {#each vertical.packs as pack}
                      <Badge variant="secondary" class="bg-primary/10 text-primary hover:bg-primary/15 font-mono py-0.5 px-2">{pack.name}</Badge>
                    {/each}
                  {:else}
                    <span class="text-xs text-muted-foreground italic">No feature packs assigned</span>
                  {/if}
                </div>
              </div>
            </CardContent>

            <CardFooter class="border-t border-border glass-inset py-3.5 flex justify-end space-x-2">
              <Button variant="outline" size="sm" href="/market/verticals/{vertical.id}">
                <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
              <form method="POST" action="?/deleteVertical" use:enhance class="inline-block">
                <input type="hidden" name="id" value={vertical.id} />
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
              <TableHead class="text-foreground font-bold">Vertical Name</TableHead>
              <TableHead class="text-foreground font-bold text-right">TAM (Users)</TableHead>
              <TableHead class="text-foreground font-bold text-right">SAM (Users)</TableHead>
              <TableHead class="text-foreground font-bold text-right">SOM (Users)</TableHead>
              <TableHead class="text-foreground font-bold">Assigned Plans</TableHead>
              <TableHead class="text-foreground font-bold">Assigned Feature Packs</TableHead>
              <TableHead class="text-foreground font-bold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each filteredVerticals as vertical (vertical.id)}
              <TableRow class="hover:bg-foreground/5 transition-all">
                <TableCell class="font-semibold">{vertical.name}</TableCell>
                <TableCell class="text-right font-mono text-xs">{formatNumber(vertical.tam_users || 0)}</TableCell>
                <TableCell class="text-right font-mono text-xs text-primary font-medium">{formatNumber(vertical.sam_users || 0)}</TableCell>
                <TableCell class="text-right font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">{formatNumber(vertical.som_users || 0)}</TableCell>
                <TableCell>
                  {#if !vertical.plans || vertical.plans.length === 0}
                    <span class="text-xs text-muted-foreground/45 italic">None</span>
                  {:else}
                    <div class="flex flex-wrap gap-1">
                      {#each vertical.plans as plan}
                        <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border text-foreground">
                          {plan.name}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </TableCell>
                <TableCell>
                  {#if !vertical.packs || vertical.packs.length === 0}
                    <span class="text-xs text-muted-foreground/45 italic">None</span>
                  {:else}
                    <div class="flex flex-wrap gap-1">
                      {#each vertical.packs as pack}
                        <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {pack.name}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" class="h-8 px-2.5" href="/market/verticals/{vertical.id}">
                      <Edit2 class="h-3 w-3" />
                    </Button>
                    <form method="POST" action="?/deleteVertical" use:enhance class="inline-block">
                      <input type="hidden" name="id" value={vertical.id} />
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

