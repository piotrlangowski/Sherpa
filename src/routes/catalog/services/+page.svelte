<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import { formatNumber, formatCurrency } from '$lib/utils/format';
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
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Cpu from '@lucide/svelte/icons/cpu';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Compass from '@lucide/svelte/icons/compass';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import Search from '@lucide/svelte/icons/search';

  let { data } = $props();

  // State controls
  let viewMode = $state<'card' | 'list'>('card');
  let searchQuery = $state('');
  let sortBy = $state('name_asc');
  let statusFilter = $state('all');
  let providerFilter = $state('all');

  onMount(() => {
    const saved = localStorage.getItem('sherpa_view_mode_services');
    if (saved === 'card' || saved === 'list') {
      viewMode = saved;
    }
  });

  function setViewMode(mode: 'card' | 'list') {
    viewMode = mode;
    localStorage.setItem('sherpa_view_mode_services', mode);
  }

  // Derived arrays
  let providers = $derived([
    ...new Set(
      data.services
        .map((s: any) => s.provider?.name)
        .filter(Boolean)
    )
  ] as string[]);

  let filteredServices = $derived(
    data.services
      .filter((service: any) => {
        const matchesSearch = 
          service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (service.description && service.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (service.provider?.name && service.provider.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (service.provider?.model_name && service.provider.model_name.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesStatus = statusFilter === 'all' || service.status === statusFilter;
        
        const matchesProvider = 
          providerFilter === 'all' || 
          (providerFilter === 'fixed' && !service.provider) ||
          (service.provider?.name === providerFilter);

        return matchesSearch && matchesStatus && matchesProvider;
      })
      .sort((a: any, b: any) => {
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'requests_desc') return (b.avg_requests_per_user_month || 0) - (a.avg_requests_per_user_month || 0);
        if (sortBy === 'requests_asc') return (a.avg_requests_per_user_month || 0) - (b.avg_requests_per_user_month || 0);
        if (sortBy === 'cost_desc') {
          const costA = a.fixed_cost_per_month || 0;
          const costB = b.fixed_cost_per_month || 0;
          return costB - costA;
        }
        if (sortBy === 'cost_asc') {
          const costA = a.fixed_cost_per_month || 0;
          const costB = b.fixed_cost_per_month || 0;
          return costA - costB;
        }
        return 0;
      })
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">AI Service Catalog</h2>
      <p class="text-muted-foreground text-sm font-normal">Manage atomic AI services and feature configurations.</p>
    </div>
    <Button href="/catalog/services/new">
      <Plus class="h-4 w-4 mr-2" /> Add AI Service
    </Button>
  </div>

  {#if data.services.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <BrainCircuit class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">Catalog is Empty</h3>
          <p class="text-sm text-muted-foreground">Click "Add AI Service" to start building your feature portfolio.</p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <!-- Controls Row -->
    <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-card/20 border border-border/80 p-3 rounded-xl backdrop-blur-xs select-none">
      <div class="flex flex-1 flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <!-- Quick Find Search -->
        <div class="relative flex-1 max-w-md">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Quick find services..."
            class="pl-9 bg-background/50 border-border"
            bind:value={searchQuery}
          />
        </div>

        <!-- Sort Select -->
        <select
          bind:value={sortBy}
          class="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="name_asc">Name (A - Z)</option>
          <option value="name_desc">Name (Z - A)</option>
          <option value="requests_desc">Requests (Highest)</option>
          <option value="requests_asc">Requests (Lowest)</option>
          <option value="cost_desc">Fixed Cost (Highest)</option>
          <option value="cost_asc">Fixed Cost (Lowest)</option>
        </select>

        <!-- Status Filter -->
        <select
          bind:value={statusFilter}
          class="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Statuses</option>
          <option value="existing">Existing</option>
          <option value="planned">Planned</option>
        </select>

        <!-- Provider Filter -->
        <select
          bind:value={providerFilter}
          class="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Providers</option>
          <option value="fixed">Fixed Cost Only</option>
          {#each providers as provider}
            <option value={provider}>{provider}</option>
          {/each}
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

    <!-- Collection Display -->
    {#if filteredServices.length === 0}
      <div class="py-16 text-center border border-dashed border-border rounded-lg bg-card/5">
        <p class="text-sm text-muted-foreground select-none">No services found matching the selected filters.</p>
      </div>
    {:else if viewMode === 'card'}
      <!-- Card Grid View -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
        {#each filteredServices as service (service.id)}
          <Card class="border-border bg-card/40 backdrop-blur-sm shadow-sm flex flex-col justify-between hover:border-primary/30 transition-all duration-300 group">
            <CardHeader class="pb-3 border-b border-border bg-black/5">
              <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2 text-primary">
                  <BrainCircuit class="h-5 w-5 group-hover:scale-105 transition-transform" />
                  <CardTitle class="text-base font-bold text-foreground line-clamp-1">{service.name}</CardTitle>
                </div>
                
                {#if service.status === 'existing'}
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider select-none">
                    Existing
                  </span>
                {:else}
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider select-none">
                    Planned
                  </span>
                {/if}
              </div>
              {#if service.description}
                <CardDescription class="mt-2 line-clamp-2 h-10 select-none text-muted-foreground/90 leading-snug">
                  {service.description}
                </CardDescription>
              {/if}
            </CardHeader>

            <CardContent class="py-4 space-y-3.5 text-sm select-none">
              <!-- Model info -->
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5">
                  <Cpu class="h-3.5 w-3.5 opacity-60" />
                  <span>AI Model</span>
                </span>
                <span class="font-mono text-xs font-semibold text-foreground truncate max-w-[140px]">
                  {service.provider ? `${service.provider.name} ${service.provider.model_name}` : 'Fixed cost only'}
                </span>
              </div>

              {#if service.provider}
                <!-- Token inputs/outputs -->
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5">
                    <KeyRound class="h-3.5 w-3.5 opacity-60" />
                    <span>Tokens (In / Out)</span>
                  </span>
                  <span class="font-mono text-xs text-muted-foreground font-medium">
                    {formatNumber(service.avg_input_tokens)} / {formatNumber(service.avg_output_tokens)}
                  </span>
                </div>

                <!-- Requests frequency -->
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5">
                    <Compass class="h-3.5 w-3.5 opacity-60" />
                    <span>Volume (Requests)</span>
                  </span>
                  <span class="text-xs font-semibold text-foreground">
                    {formatNumber(service.avg_requests_per_user_month)} /user/mo
                  </span>
                </div>
              {/if}

              {#if service.fixed_cost_per_month !== null && service.fixed_cost_per_month !== undefined}
                <!-- Fixed cost display -->
                <div class="flex items-center justify-between pt-1 border-t border-border/40">
                  <span class="text-xs text-muted-foreground/75">Fixed Expense</span>
                  <span class="text-xs font-bold text-foreground">
                    {formatCurrency(service.fixed_cost_per_month, service.fixed_cost_currency || 'USD', 2)}/mo
                  </span>
                </div>
              {/if}
            </CardContent>

            <CardFooter class="border-t border-border bg-black/5 py-3.5 flex justify-end space-x-2">
              <Button variant="outline" size="sm" href="/catalog/services/{service.id}">
                <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
              <form method="POST" action="?/deleteService" use:enhance class="inline-block">
                <input type="hidden" name="id" value={service.id} />
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
      <div class="border border-border rounded-lg overflow-hidden bg-card/25 backdrop-blur-sm shadow-sm animate-in fade-in duration-200">
        <Table>
          <TableHeader class="bg-black/15">
            <TableRow>
              <TableHead class="text-foreground font-bold">Service Name</TableHead>
              <TableHead class="text-foreground font-bold">Status</TableHead>
              <TableHead class="text-foreground font-bold">AI Model / Provider</TableHead>
              <TableHead class="text-foreground font-bold text-right">Tokens (In/Out)</TableHead>
              <TableHead class="text-foreground font-bold text-right">Volume</TableHead>
              <TableHead class="text-foreground font-bold text-right">Fixed Cost</TableHead>
              <TableHead class="text-foreground font-bold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each filteredServices as service (service.id)}
              <TableRow class="hover:bg-white/5 transition-all">
                <TableCell class="font-semibold">{service.name}</TableCell>
                <TableCell>
                  {#if service.status === 'existing'}
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                      Existing
                    </span>
                  {:else}
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                      Planned
                    </span>
                  {/if}
                </TableCell>
                <TableCell class="font-mono text-xs text-muted-foreground">
                  {service.provider ? `${service.provider.name} (${service.provider.model_name})` : 'Fixed cost only'}
                </TableCell>
                <TableCell class="text-right font-mono text-xs">
                  {#if service.provider}
                    {formatNumber(service.avg_input_tokens)} / {formatNumber(service.avg_output_tokens)}
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell class="text-right font-mono text-xs">
                  {#if service.provider}
                    {formatNumber(service.avg_requests_per_user_month)} /user/mo
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell class="text-right font-semibold text-foreground font-mono">
                  {#if service.fixed_cost_per_month !== null && service.fixed_cost_per_month !== undefined}
                    {formatCurrency(service.fixed_cost_per_month, service.fixed_cost_currency || 'USD', 2)}/mo
                  {:else}
                    —
                  {/if}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" class="h-8 px-2.5" href="/catalog/services/{service.id}">
                      <Edit2 class="h-3 w-3" />
                    </Button>
                    <form method="POST" action="?/deleteService" use:enhance class="inline-block">
                      <input type="hidden" name="id" value={service.id} />
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

