<script lang="ts">
  import { enhance } from '$app/forms';
  import { formatCurrency } from '$lib/utils/format';
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
  import Sparkles from '@lucide/svelte/icons/sparkles';

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

  function openCreate() {
    id = '';
    name = '';
    modelName = '';
    inputPrice = 0;
    outputPrice = 0;
    showEditDialog = true;
  }

  function openEdit(provider: any) {
    id = provider.id;
    name = provider.name;
    modelName = provider.model_name;
    inputPrice = provider.input_price;
    outputPrice = provider.output_price;
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
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">AI Provider Models</h2>
      <p class="text-muted-foreground text-sm">Configure token prices for calculating AI service execution costs.</p>
    </div>
    
    <div class="flex items-center space-x-3">
      <Button variant="outline" onclick={triggerUpdatePrices} disabled={isUpdatingPrices}>
        <RefreshCw class="h-4 w-4 mr-2 {isUpdatingPrices ? 'animate-spin' : ''}" />
        {#if isUpdatingPrices}Updating...{:else}Update Pricing (Opt-In){/if}
      </Button>
      <Button onclick={openCreate}>
        <Plus class="h-4 w-4 mr-2" /> Add Custom Model
      </Button>
    </div>
  </div>

  <Card class="border-border">
    <CardHeader>
      <CardTitle>Token Price Sheet</CardTitle>
      <CardDescription>Prices are defined per 1,000,000 (1M) tokens in USD.</CardDescription>
    </CardHeader>
    
    <CardContent class="p-0">
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left border-collapse">
          <thead class="bg-muted/40 border-y border-border text-xs text-muted-foreground font-semibold uppercase tracking-wider">
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
            {#each data.providers as provider}
              <tr class="hover:bg-muted/30 transition-colors">
                <td class="px-6 py-4 font-semibold text-foreground flex items-center space-x-2.5">
                  <Server class="h-4 w-4 text-primary" />
                  <span>{provider.name}</span>
                </td>
                <td class="px-6 py-4 font-mono text-muted-foreground">{provider.model_name}</td>
                <td class="px-6 py-4 text-right">{formatCurrency(provider.input_price, 'USD', 2)}</td>
                <td class="px-6 py-4 text-right">{formatCurrency(provider.output_price, 'USD', 2)}</td>
                <td class="px-6 py-4">
                  {#if provider.is_predefined}
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
</div>

<!-- Edit / Create Provider Dialog -->
{#if showEditDialog}
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <Card class="w-full max-w-md border-border shadow-2xl bg-card">
      <form method="POST" action="?/saveProvider" use:enhance={() => {
        isSaving = true;
        return async ({ update }) => {
          await update();
          isSaving = false;
          showEditDialog = false;
        };
      }}>
        <CardHeader class="border-b border-border bg-black/10">
          <CardTitle class="text-lg font-bold">
            {id ? 'Edit Model Pricing' : 'Add Custom AI Model'}
          </CardTitle>
          <CardDescription>
            Input pricing parameters below. Prices should be input in USD per million tokens.
          </CardDescription>
        </CardHeader>
        
        <CardContent class="py-4 space-y-4">
          <input type="hidden" name="id" value={id} />

          <div class="space-y-1.5">
            <Label for="name">Provider Name</Label>
            <Input id="name" name="name" placeholder="e.g. OpenAI, Anthropic, Custom" bind:value={name} required class="bg-background/50" />
          </div>

          <div class="space-y-1.5">
            <Label for="modelName">Model Name</Label>
            <Input id="modelName" name="modelName" placeholder="e.g. gpt-4o-custom" bind:value={modelName} required class="bg-background/50" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <Label for="inputPrice">Input Price ($/1M)</Label>
              <Input id="inputPrice" name="inputPrice" type="number" step="0.0001" min="0" bind:value={inputPrice} required class="bg-background/50 text-right" />
            </div>
            <div class="space-y-1.5">
              <Label for="outputPrice">Output Price ($/1M)</Label>
              <Input id="outputPrice" name="outputPrice" type="number" step="0.0001" min="0" bind:value={outputPrice} required class="bg-background/50 text-right" />
            </div>
          </div>
        </CardContent>
        
        <CardFooter class="border-t border-border bg-black/10 py-3 flex justify-end space-x-2">
          <Button variant="outline" onclick={() => showEditDialog = false} disabled={isSaving}>Cancel</Button>
          <Button type="submit" disabled={isSaving}>
            {#if isSaving}Saving...{:else}Save Model{/if}
          </Button>
        </CardFooter>
      </form>
    </Card>
  </div>
{/if}
