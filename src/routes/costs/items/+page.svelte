<script lang="ts">
  import { enhance } from '$app/forms';
  import { untrack } from 'svelte';
  import { formatCurrency, getCurrencySymbol } from '$lib/utils/format';
  import { FormDialog, FormSection, FormField, NumberField } from '$lib/components/forms';
  import { COST_SUBCATEGORIES } from '$lib/utils/constants';
  import { appState } from '$lib/stores/app.svelte';
  import { convertAmount } from '$lib/shared/currency.js';
  import type { Currency } from '$lib/shared/types';
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
  let currency = $state<Currency>('USD');
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
        const converted = convertAmount(c.amount, c.currency || 'USD', appState.currency, appState.exchangeRates);
        if (c.frequency === 'one_time') return sum + converted;
        if (c.frequency === 'monthly') return sum + converted * 12; // annualized/standardized
        return sum + converted;
      }, 0)
  );

  let totalMonthlyOpex = $derived(
    data.costs
      .filter(c => c.category === 'opex')
      .reduce((sum, c) => {
        const converted = convertAmount(c.amount, c.currency || 'USD', appState.currency, appState.exchangeRates);
        if (c.frequency === 'monthly') return sum + converted;
        if (c.frequency === 'yearly') return sum + converted / 12;
        return sum + converted; // one-time opex (rare)
      }, 0)
  );

  function openCreate() {
    id = '';
    name = '';
    category = 'opex';
    subcategory = 'personnel';
    amount = 0;
    frequency = 'monthly';
    currency = appState.currency;
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
    currency = cost.currency || 'USD';
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
    <Card class="glass border">
      <CardHeader class="pb-2">
        <CardDescription class="text-xs uppercase font-bold tracking-wider">Total CAPEX (One-Time)</CardDescription>
        <CardTitle class="text-3xl font-black text-primary">{formatCurrency(totalCapex, appState.currency, 0)}</CardTitle>
      </CardHeader>
      <CardContent class="text-xs text-muted-foreground">
        Sum of setup, custom model training, and integration expenses.
      </CardContent>
    </Card>

    <Card class="glass border">
      <CardHeader class="pb-2">
        <CardDescription class="text-xs uppercase font-bold tracking-wider">Total OPEX (Monthly Recurring)</CardDescription>
        <CardTitle class="text-3xl font-black text-cyan-600 dark:text-cyan-400">{formatCurrency(totalMonthlyOpex, appState.currency, 0)}/mo</CardTitle>
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
                <thead class="glass-inset border-y border-border text-xs text-muted-foreground font-semibold uppercase tracking-wider">
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
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
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
                          {formatCurrency(cost.amount, cost.currency || 'USD', 2)}
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
<FormDialog
  bind:open={showEditDialog}
  bind:busy={isSaving}
  size="md"
  icon={DollarSign}
  title={id ? 'Edit Cost Item' : 'Add Cost Item'}
  description="Configure investment budgets or monthly operational expenditures."
  action="?/saveCost"
  submitLabel="Save Cost Item"
>
  <input type="hidden" name="id" value={id} />

  <FormSection title="Identity" hero columns={1}>
    <FormField label="Cost Name" forId="name" required>
      <Input
        id="name"
        name="name"
        placeholder="e.g. ML Platform Subscription"
        bind:value={name}
        required
        class="h-11 bg-(--glass-inset-bg) text-base"
      />
    </FormField>
  </FormSection>

  <FormSection title="Type" columns={1}>
    <div class="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Cost category">
      <label class="cursor-pointer">
        <input type="radio" name="category" value="opex" bind:group={category} class="peer sr-only" />
        <div
          class="h-full rounded-xl border border-border bg-(--glass-inset-bg) p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:ring-1 peer-checked:ring-primary/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
        >
          <div class="text-sm font-bold">OPEX</div>
          <div class="text-xs text-muted-foreground">Operational, recurring spend</div>
        </div>
      </label>
      <label class="cursor-pointer">
        <input type="radio" name="category" value="capex" bind:group={category} class="peer sr-only" />
        <div
          class="h-full rounded-xl border border-border bg-(--glass-inset-bg) p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:ring-1 peer-checked:ring-primary/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
        >
          <div class="text-sm font-bold">CAPEX</div>
          <div class="text-xs text-muted-foreground">Capital, one-time investment</div>
        </div>
      </label>
    </div>

    <FormField label="Subcategory" forId="subcategory">
      <select
        id="subcategory"
        name="subcategory"
        bind:value={subcategory}
        class="h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {#each availableSubcategories as sub}
          <option value={sub.value}>{sub.label}</option>
        {/each}
      </select>
    </FormField>
  </FormSection>

  <FormSection title="Amount & timing">
    <NumberField
      id="amount"
      name="amount"
      bind:value={amount}
      label="Amount"
      prefix={getCurrencySymbol(currency)}
      size="lg"
      step={0.01}
      min={0.01}
      span={2}
    />
    <FormField label="Currency" forId="currency">
      <select
        id="currency"
        name="currency"
        bind:value={currency}
        class="h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="USD">USD ($)</option>
        <option value="EUR">EUR (€)</option>
        <option value="PLN">PLN (zł)</option>
        <option value="GBP">GBP (£)</option>
      </select>
    </FormField>
    <FormField label="Frequency" forId="frequency">
      <select
        id="frequency"
        name="frequency"
        bind:value={frequency}
        class="h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="one_time">One-Time</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
    </FormField>
  </FormSection>

  <FormSection title="Allocation" columns={1}>
    <FormField
      label="Allocated to Service"
      forId="serviceId"
      help="Optional — attributes this cost to one AI service"
    >
      <select
        id="serviceId"
        name="serviceId"
        bind:value={serviceId}
        class="h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="">No Allocation (General Overhead)</option>
        {#each data.services as service}
          <option value={service.id}>{service.name} ({service.status})</option>
        {/each}
      </select>
    </FormField>
  </FormSection>
</FormDialog>
