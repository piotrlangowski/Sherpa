<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import { formatCurrency, getCurrencySymbol } from '$lib/utils/format';
  import { FormDialog, FormSection, FormField, NumberField } from '$lib/components/forms';
  import { PROVIDER_PRICES_AS_OF } from '$lib/utils/constants';
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
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Server from '@lucide/svelte/icons/server';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import Search from '@lucide/svelte/icons/search';

  let { data, form } = $props();

  let showEditDialog = $state(false);
  let isSaving = $state(false);
  let isUpdatingPrices = $state(false);

  // Form State
  let id = $state('');
  let name = $state('');
  let modelName = $state('');
  let inputPrice = $state(0);
  let outputPrice = $state(0);
  let currency = $state<Currency>('USD');
  let isPredefined = $state(false);

  function openCreate() {
    id = '';
    name = '';
    modelName = '';
    inputPrice = 0;
    outputPrice = 0;
    currency = 'USD';
    isPredefined = false;
    showEditDialog = true;
  }

  function openEdit(provider: any) {
    id = provider.id;
    name = provider.name;
    modelName = provider.model_name;
    inputPrice = provider.input_price;
    outputPrice = provider.output_price;
    currency = provider.currency || 'USD';
    isPredefined = provider.is_predefined;
    showEditDialog = true;
  }

  async function triggerUpdatePrices() {
    isUpdatingPrices = true;
    try {
      const response = await fetch('/api/providers/update-prices', { method: 'POST' });
      if (response.ok) {
        window.location.reload();
      } else {
        console.error('Failed to update provider pricing');
      }
    } catch (err) {
      console.error('Error updating pricing:', err);
    } finally {
      isUpdatingPrices = false;
    }
  }

  // State controls for collection
  let viewMode = $state<'card' | 'list'>('list');
  let searchQuery = $state('');
  let sortBy = $state('provider_asc');
  let typeFilter = $state('all');

  onMount(() => {
    const saved = localStorage.getItem('sherpa_view_mode_providers');
    if (saved === 'card' || saved === 'list') {
      viewMode = saved;
    }
  });

  function setViewMode(mode: 'card' | 'list') {
    viewMode = mode;
    localStorage.setItem('sherpa_view_mode_providers', mode);
  }

  // Derived filtered array
  let filteredProviders = $derived(
    data.providers
      .filter((provider: any) => {
        const matchesSearch = 
          provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          provider.model_name.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesType = 
          typeFilter === 'all' ||
          (typeFilter === 'standard' && provider.is_predefined) ||
          (typeFilter === 'custom' && !provider.is_predefined);

        return matchesSearch && matchesType;
      })
      .sort((a: any, b: any) => {
        if (sortBy === 'provider_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'provider_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'model_asc') return a.model_name.localeCompare(b.model_name);
        if (sortBy === 'model_desc') return b.model_name.localeCompare(a.model_name);
        if (sortBy === 'input_desc') return b.input_price - a.input_price;
        if (sortBy === 'input_asc') return a.input_price - b.input_price;
        if (sortBy === 'output_desc') return b.output_price - a.output_price;
        if (sortBy === 'output_asc') return a.output_price - b.output_price;
        if (sortBy === 'updated_desc') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        return 0;
      })
  );
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">AI Provider Models</h2>
      <p class="text-muted-foreground text-sm">
        Configure token prices for calculating AI service execution costs.
        Bundled price list as of <span class="font-semibold text-foreground">{PROVIDER_PRICES_AS_OF}</span> — verify against provider pricing pages before relying on it.
      </p>
    </div>

    <div class="flex items-center space-x-3">
      <Button variant="outline" onclick={triggerUpdatePrices} disabled={isUpdatingPrices}>
        <RefreshCw class="h-4 w-4 mr-2 {isUpdatingPrices ? 'animate-spin' : ''}" />
        {#if isUpdatingPrices}Syncing...{:else}Sync Bundled Prices{/if}
      </Button>
      <Button onclick={openCreate}>
        <Plus class="h-4 w-4 mr-2" /> Add Custom Model
      </Button>
    </div>
  </div>

  <!-- Controls Row -->
  <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between glass border p-3 rounded-xl select-none">
    <div class="flex flex-1 flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
      <!-- Quick Find Search -->
      <div class="relative flex-1 max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Quick find providers or models..."
          class="pl-9 bg-(--glass-inset-bg) border-border"
          bind:value={searchQuery}
        />
      </div>

      <!-- Sort Select -->
      <select
        bind:value={sortBy}
        class="bg-(--glass-inset-bg) border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="provider_asc">Provider (A - Z)</option>
        <option value="provider_desc">Provider (Z - A)</option>
        <option value="model_asc">Model Name (A - Z)</option>
        <option value="model_desc">Model Name (Z - A)</option>
        <option value="input_desc">Input Price (Highest)</option>
        <option value="input_asc">Input Price (Lowest)</option>
        <option value="output_desc">Output Price (Highest)</option>
        <option value="output_asc">Output Price (Lowest)</option>
        <option value="updated_desc">Last Updated (Newest)</option>
      </select>

      <!-- Type Filter -->
      <select
        bind:value={typeFilter}
        class="bg-(--glass-inset-bg) border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="all">All Types</option>
        <option value="standard">Standard</option>
        <option value="custom">Custom</option>
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
  {#if filteredProviders.length === 0}
    <div class="py-16 text-center border border-dashed border-border rounded-lg bg-card/5">
      <p class="text-sm text-muted-foreground select-none">No custom or standard models found matching search criteria.</p>
    </div>
  {:else if viewMode === 'card'}
    <!-- Card Grid View -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
      {#each filteredProviders as provider (provider.id)}
        <Card class="glass border flex flex-col justify-between hover:border-primary/20 transition-all duration-300 group">
          <CardHeader class="pb-3 border-b border-border glass-inset">
            <div class="flex justify-between items-start">
              <div class="flex items-center space-x-2.5 text-primary">
                <Server class="h-5 w-5 group-hover:scale-105 transition-transform" />
                <CardTitle class="text-base font-bold text-foreground line-clamp-1">{provider.name}</CardTitle>
              </div>
              {#if provider.is_predefined}
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider select-none">
                  Standard
                </span>
              {:else}
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider select-none">
                  Custom
                </span>
              {/if}
            </div>
            <CardDescription class="mt-1 font-mono text-xs text-muted-foreground truncate select-all">{provider.model_name}</CardDescription>
          </CardHeader>

          <CardContent class="py-4 space-y-3.5 text-sm select-none flex-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted-foreground">Input Price</span>
              <span class="font-mono text-xs font-bold text-foreground">
                {formatCurrency(provider.input_price, provider.currency || 'USD', 2)}
                <span class="text-[10px] text-muted-foreground font-normal">/1M</span>
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted-foreground">Output Price</span>
              <span class="font-mono text-xs font-bold text-foreground">
                {formatCurrency(provider.output_price, provider.currency || 'USD', 2)}
                <span class="text-[10px] text-muted-foreground font-normal">/1M</span>
              </span>
            </div>
            <div class="flex items-center justify-between pt-1 border-t border-border/40">
              <span class="text-xs text-muted-foreground">Last Updated</span>
              <span class="text-xs text-muted-foreground/80">{new Date(provider.updated_at).toLocaleDateString()}</span>
            </div>
          </CardContent>

          <CardFooter class="border-t border-border glass-inset py-3 flex justify-end space-x-2">
            <Button variant="outline" size="sm" onclick={() => openEdit(provider)}>
              <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            {#if !provider.is_predefined}
              <form method="POST" action="?/deleteProvider" use:enhance class="inline-block">
                <input type="hidden" name="id" value={provider.id} />
                <Button type="submit" variant="outline" size="sm" class="text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 class="h-3.5 w-3.5 mr-1.5" /> Delete
                </Button>
              </form>
            {/if}
          </CardFooter>
        </Card>
      {/each}
    </div>
  {:else}
    <!-- Dense List (Table) View -->
    <Card class="border-border animate-in fade-in duration-200">
      <CardHeader>
        <CardTitle>Token Price Sheet</CardTitle>
        <CardDescription>Prices are defined per 1,000,000 (1M) tokens in USD. Standard models reflect the bundled price list as of {PROVIDER_PRICES_AS_OF}.</CardDescription>
      </CardHeader>
      
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left border-collapse">
            <thead class="glass-inset border-y border-border text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              <tr>
                <th class="px-6 py-4">Provider</th>
                <th class="px-6 py-4">Model Name</th>
                <th class="px-6 py-4 text-right">Input Price (per 1M)</th>
                <th class="px-6 py-4 text-right">Output Price (per 1M)</th>
                <th class="px-6 py-4">Type</th>
                <th class="px-6 py-4">Last Updated</th>
                <th class="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#each filteredProviders as provider}
                <tr class="hover:bg-muted/30 transition-colors">
                  <td class="px-6 py-4 font-semibold text-foreground flex items-center space-x-2.5">
                    <Server class="h-4 w-4 text-primary" />
                    <span>{provider.name}</span>
                  </td>
                  <td class="px-6 py-4 font-mono text-muted-foreground">{provider.model_name}</td>
                  <td class="px-6 py-4 text-right">{formatCurrency(provider.input_price, provider.currency || 'USD', 2)}</td>
                  <td class="px-6 py-4 text-right">{formatCurrency(provider.output_price, provider.currency || 'USD', 2)}</td>
                  <td class="px-6 py-4">
                    {#if provider.is_predefined}
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Standard
                      </span>
                    {:else}
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Custom
                      </span>
                    {/if}
                  </td>
                  <td class="px-6 py-4 text-xs text-muted-foreground/80">
                    {new Date(provider.updated_at).toLocaleDateString()}
                  </td>
                  <td class="px-6 py-4 text-right space-x-1">
                    <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-foreground" onclick={() => openEdit(provider)}>
                      <Edit2 class="h-4 w-4" />
                    </Button>
                    {#if !provider.is_predefined}
                      <form method="POST" action="?/deleteProvider" use:enhance class="inline-block">
                        <input type="hidden" name="id" value={provider.id} />
                        <Button type="submit" variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      </form>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>

<!-- Edit / Create Provider Dialog -->
<FormDialog
  bind:open={showEditDialog}
  bind:busy={isSaving}
  size="sm"
  icon={Server}
  title={id ? 'Edit Model Pricing' : 'Add Custom AI Model'}
  description="Token prices per million tokens."
  action="?/saveProvider"
  submitLabel="Save Model"
>
  <input type="hidden" name="id" value={id} />

  <FormSection title="Identity" hero columns={1}>
    <FormField label="Provider Name" forId="name" required>
      <Input
        id="name"
        name="name"
        placeholder="e.g. OpenAI, Anthropic, Custom"
        bind:value={name}
        required
        class="h-11 bg-(--glass-inset-bg) text-base"
      />
    </FormField>
    <FormField label="Model Name" forId="modelName" required help="Exact API model id">
      <Input
        id="modelName"
        name="modelName"
        placeholder="e.g. gpt-4o-custom"
        bind:value={modelName}
        required
        class="bg-(--glass-inset-bg) font-mono"
      />
    </FormField>
  </FormSection>

  <FormSection title="Token pricing" description="Prices per 1,000,000 (1M) tokens.">
    <FormField label="Currency" forId="currency" span={2}>
      <select
        id="currency"
        name="currency"
        bind:value={currency}
        disabled={isPredefined}
        class="h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="USD">USD ($)</option>
        <option value="EUR">EUR (€)</option>
        <option value="PLN">PLN (zł)</option>
        <option value="GBP">GBP (£)</option>
      </select>
      {#if isPredefined}
        <p class="text-[10px] text-muted-foreground">Predefined models are always priced in USD.</p>
      {/if}
    </FormField>
    <NumberField
      id="inputPrice"
      name="inputPrice"
      bind:value={inputPrice}
      label="Input Price"
      prefix={getCurrencySymbol(currency)}
      suffix="/1M"
      step={0.0001}
      min={0}
    />
    <NumberField
      id="outputPrice"
      name="outputPrice"
      bind:value={outputPrice}
      label="Output Price"
      prefix={getCurrencySymbol(currency)}
      suffix="/1M"
      step={0.0001}
      min={0}
    />
  </FormSection>
</FormDialog>

