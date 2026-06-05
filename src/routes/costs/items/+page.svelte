<script lang="ts">
  import { enhance } from '$app/forms';
  import { untrack } from 'svelte';
  import { formatCurrency } from '$lib/utils/format';
  import { COST_SUBCATEGORIES } from '$lib/utils/constants';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Tabs from '$lib/components/ui/tabs/tabs.svelte';
  import TabsList from '$lib/components/ui/tabs/tabs-list.svelte';
  import TabsTrigger from '$lib/components/ui/tabs/tabs-trigger.svelte';
  import TabsContent from '$lib/components/ui/tabs/tabs-content.svelte';

  // Lucide Icons
  import Plus from '@lucide/svelte/icons/plus';
  import Edit2 from '@lucide/svelte/icons/edit-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import DollarSign from '@lucide/svelte/icons/dollar-sign';
  import Tag from '@lucide/svelte/icons/tag';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';

  let { data } = $props();

  let showEditDialog = $state(false);
  let isSaving = $state(false);

  // Form State
  let id = $state('');
  let name = $state('');
  let category = $state<'capex' | 'opex'>('opex');
  let subcategory = $state('personnel');
  let amount = $state(0);
  let frequency = $state<'one_time' | 'monthly' | 'yearly'>('monthly');
  let serviceId = $state('');

  // Derived subcategories list
  let availableSubcategories = $derived(
    category === 'capex' ? COST_SUBCATEGORIES.capex : COST_SUBCATEGORIES.opex
  );

  // Auto-adjust default frequency and subcategory when category changes
  $effect(() => {
    // Only track `category` as a dependency — the trigger
    const _category = category;

    // Wrap writes to frequency and subcategory in untrack() so they don't
    // re-trigger this effect (frequency and subcategory are $state too)
    untrack(() => {
      if (_category === 'capex') {
        frequency = 'one_time';
        subcategory = 'development';
      } else {
        frequency = 'monthly';
        subcategory = 'personnel';
      }
    });
  });

  // Derived Totals
  let totalCapex = $derived(
    data.costs
      .filter(c => c.category === 'capex')
      .reduce((sum, c) => {
        if (c.frequency === 'one_time') return sum + c.amount;
        if (c.frequency === 'monthly') return sum + c.amount * 12; // annualized/standardized (though capex is usually one_time)
        return sum + c.amount;
      }, 0)
  );

  let totalMonthlyOpex = $derived(
    data.costs
      .filter(c => c.category === 'opex')
      .reduce((sum, c) => {
        if (c.frequency === 'monthly') return sum + c.amount;
        if (c.frequency === 'yearly') return sum + c.amount / 12;
        return sum + c.amount; // one-time opex (rare, treated as monthly here for simplicity)
      }, 0)
  );

  function openCreate() {
    id = '';
    name = '';
    category = 'opex';
    subcategory = 'personnel';
    amount = 0;
    frequency = 'monthly';
    serviceId = '';
    showEditDialog = true;
  }

  function openEdit(cost: any) {
    id = cost.id;
    name = cost.name;
    category = cost.category;
    subcategory = cost.subcategory;
    amount = cost.amount;
    frequency = cost.frequency;
    serviceId = cost.service_id || '';
    showEditDialog = true;
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Cost Items</h2>
      <p class="text-muted-foreground text-sm">Manage development overheads (CAPEX) and recurring operations (OPEX).</p>
    </div>
    <Button onclick={openCreate}>
      <Plus class="h-4 w-4 mr-2" /> Add Cost Item
    </Button>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 select-none">
    <Card class="border-border bg-card/40 backdrop-blur-sm shadow-md">
      <CardHeader class="pb-2">
        <CardDescription class="text-xs uppercase font-bold tracking-wider">Total CAPEX (One-Time)</CardDescription>
        <CardTitle class="text-3xl font-black text-primary">{formatCurrency(totalCapex, 'USD', 0)}</CardTitle>
      </CardHeader>
      <CardContent class="text-xs text-muted-foreground">
        Sum of setup, custom model training, and integration expenses.
      </CardContent>
    </Card>

    <Card class="border-border bg-card/40 backdrop-blur-sm shadow-md">
      <CardHeader class="pb-2">
        <CardDescription class="text-xs uppercase font-bold tracking-wider">Total OPEX (Monthly Recurring)</CardDescription>
        <CardTitle class="text-3xl font-black text-cyan-400">{formatCurrency(totalMonthlyOpex, 'USD', 0)}/mo</CardTitle>
      </CardHeader>
      <CardContent class="text-xs text-muted-foreground">
        Sum of salary allocations, cloud monitoring, and fixed server overheads.
      </CardContent>
    </Card>
  </div>

  <Card class="border-border">
    <CardContent class="p-6">
      <Tabs value="all" class="w-full">
        <div class="flex justify-between items-center border-b border-border pb-3 mb-4">
          <TabsList class="bg-muted/50 border border-border">
            <TabsTrigger value="all">All Costs</TabsTrigger>
            <TabsTrigger value="capex">CAPEX</TabsTrigger>
            <TabsTrigger value="opex">OPEX</TabsTrigger>
          </TabsList>
        </div>

        {#each ['all', 'capex', 'opex'] as tab}
          {@const filteredCosts = tab === 'all' 
            ? data.costs 
            : data.costs.filter(c => c.category === tab)}
          <TabsContent value={tab} class="m-0 focus:outline-none">
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left border-collapse">
                <thead class="bg-muted/40 border-y border-border text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  <tr>
                    <th class="px-6 py-4">Name</th>
                    <th class="px-6 py-4">Category</th>
                    <th class="px-6 py-4">Subcategory</th>
                    <th class="px-6 py-4">Frequency</th>
                    <th class="px-6 py-4">Allocated Service</th>
                    <th class="px-6 py-4 text-right">Amount</th>
                    <th class="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  {#if filteredCosts.length === 0}
                    <tr>
                      <td colspan="7" class="text-center py-10 text-muted-foreground select-none">
                        No cost items configured. Click "Add Cost Item" to define one.
                      </td>
                    </tr>
                  {:else}
                    {#each filteredCosts as cost}
                      <tr class="hover:bg-muted/30 transition-colors">
                        <td class="px-6 py-4 font-semibold text-foreground flex items-center space-x-2.5">
                          <DollarSign class="h-4 w-4 text-muted-foreground" />
                          <span>{cost.name}</span>
                        </td>
                        <td class="px-6 py-4">
                          {#if cost.category === 'capex'}
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                              CAPEX
                            </span>
                          {:else}
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              OPEX
                            </span>
                          {/if}
                        </td>
                        <td class="px-6 py-4 text-muted-foreground flex items-center space-x-1.5 capitalize">
                          <Tag class="h-3.5 w-3.5 opacity-60" />
                          <span>{cost.subcategory}</span>
                        </td>
                        <td class="px-6 py-4 text-muted-foreground capitalize">{cost.frequency.replace('_', ' ')}</td>
                        <td class="px-6 py-4">
                          {#if cost.service_name}
                            <span class="inline-flex items-center text-xs text-foreground bg-muted border border-border px-2 py-0.5 rounded-md">
                              <BrainCircuit class="h-3 w-3 mr-1 text-primary" />
                              {cost.service_name}
                            </span>
                          {:else}
                            <span class="text-muted-foreground/40 text-xs">—</span>
                          {/if}
                        </td>
                        <td class="px-6 py-4 text-right font-semibold text-foreground">
                          {formatCurrency(cost.amount, 'USD', 2)}
                        </td>
                        <td class="px-6 py-4 text-right space-x-1">
                          <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-foreground" onclick={() => openEdit(cost)}>
                            <Edit2 class="h-4 w-4" />
                          </Button>
                          <form method="POST" action="?/deleteCost" use:enhance class="inline-block">
                            <input type="hidden" name="id" value={cost.id} />
                            <Button type="submit" variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 class="h-4 w-4" />
                            </Button>
                          </form>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </TabsContent>
        {/each}
      </Tabs>
    </CardContent>
  </Card>
</div>

<!-- Edit / Create Cost Item Dialog -->
{#if showEditDialog}
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <Card class="w-full max-w-md border-border shadow-2xl bg-card">
      <form method="POST" action="?/saveCost" use:enhance={() => {
        isSaving = true;
        return async ({ update }) => {
          await update();
          isSaving = false;
          showEditDialog = false;
        };
      }}>
        <CardHeader class="border-b border-border bg-black/10">
          <CardTitle class="text-lg font-bold">
            {id ? 'Edit Cost Item' : 'Add Cost Item'}
          </CardTitle>
          <CardDescription>
            Configure investment budgets or monthly operational expenditures.
          </CardDescription>
        </CardHeader>
        
        <CardContent class="py-4 space-y-4">
          <input type="hidden" name="id" value={id} />

          <!-- Name -->
          <div class="space-y-1.5">
            <Label for="name">Cost Name</Label>
            <Input id="name" name="name" placeholder="e.g. ML Platform Subscription" bind:value={name} required class="bg-background/50" />
          </div>

          <!-- Category (CAPEX / OPEX) -->
          <div class="space-y-1.5">
            <Label for="category">Category</Label>
            <select
              id="category"
              name="category"
              bind:value={category}
              class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="opex">OPEX (Operational / Recurring)</option>
              <option value="capex">CAPEX (Capital / One-Time)</option>
            </select>
          </div>

          <!-- Subcategory -->
          <div class="space-y-1.5">
            <Label for="subcategory">Subcategory</Label>
            <select
              id="subcategory"
              name="subcategory"
              bind:value={subcategory}
              class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {#each availableSubcategories as sub}
                <option value={sub.value}>{sub.label}</option>
              {/each}
            </select>
          </div>

          <!-- Amount & Frequency -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <Label for="amount">Amount ($)</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" bind:value={amount} required class="bg-background/50 text-right" />
            </div>
            
            <div class="space-y-1.5">
              <Label for="frequency">Frequency</Label>
              <select
                id="frequency"
                name="frequency"
                bind:value={frequency}
                class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="one_time">One-Time</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <!-- Allocated Service -->
          <div class="space-y-1.5">
            <Label for="serviceId">Allocated to Service (Optional)</Label>
            <select
              id="serviceId"
              name="serviceId"
              bind:value={serviceId}
              class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">No Allocation (General Overhead)</option>
              {#each data.services as service}
                <option value={service.id}>{service.name} ({service.status})</option>
              {/each}
            </select>
          </div>
        </CardContent>
        
        <CardFooter class="border-t border-border bg-black/10 py-3 flex justify-end space-x-2">
          <Button variant="outline" onclick={() => showEditDialog = false} disabled={isSaving}>Cancel</Button>
          <Button type="submit" disabled={isSaving}>
            {#if isSaving}Saving...{:else}Save Cost Item{/if}
          </Button>
        </CardFooter>
      </form>
    </Card>
  </div>
{/if}
