<script lang="ts">
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  
  // Lucide Icons
  import Save from '@lucide/svelte/icons/save';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import Layers from '@lucide/svelte/icons/layers';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';

  interface Props {
    plan?: any;
    services: any[];
    packs: any[];
    action: string;
  }

  let { plan = {}, services, packs, action }: Props = $props();

  let name = $state(plan.name || '');
  let description = $state(plan.description || '');
  let basePrice = $state(plan.base_price || 0);
  let selectedServiceIds = $state<string[]>(plan.services?.map((s: any) => s.id) || []);
  let selectedPackIds = $state<string[]>(plan.packs?.map((p: any) => p.id) || []);
  let isSaving = $state(false);

  function toggleService(id: string) {
    if (selectedServiceIds.includes(id)) {
      selectedServiceIds = selectedServiceIds.filter(sId => sId !== id);
    } else {
      selectedServiceIds = [...selectedServiceIds, id];
    }
  }

  function togglePack(id: string) {
    if (selectedPackIds.includes(id)) {
      selectedPackIds = selectedPackIds.filter(pId => pId !== id);
    } else {
      selectedPackIds = [...selectedPackIds, id];
    }
  }
</script>

<div class="max-w-2xl space-y-6">
  <div class="flex items-center space-x-3">
    <Button variant="outline" size="icon" href="/catalog/plans" class="h-9 w-9">
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div>
      <h2 class="text-2xl font-bold tracking-tight">
        {plan.id ? 'Edit Pricing Plan' : 'Create Pricing Plan'}
      </h2>
      <p class="text-muted-foreground text-sm font-normal">
        {plan.id ? 'Update plan rates and feature inclusions.' : 'Create a pricing tier offering with bundled AI capabilities.'}
      </p>
    </div>
  </div>

  <form method="POST" {action} use:enhance={() => {
    isSaving = true;
    return async ({ update }) => {
      await update();
      isSaving = false;
    };
  }}>
    <div class="space-y-6">
      <div class="p-6 bg-card rounded-lg border border-border space-y-4 shadow-sm">
        <div class="flex items-center space-x-2.5 text-primary mb-2 select-none">
          <CreditCard class="h-5 w-5" />
          <span class="text-xs font-bold uppercase tracking-wider">Plan Configurations</span>
        </div>

        <input type="hidden" name="id" value={plan.id || ''} />

        <!-- Name -->
        <div class="space-y-1.5">
          <Label for="name">Plan Name</Label>
          <Input id="name" name="name" placeholder="e.g. Enterprise Tier" bind:value={name} required class="bg-background/50" />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <Label for="description">Description</Label>
          <Textarea id="description" name="description" placeholder="Describe the target segment and license terms..." bind:value={description} class="bg-background/50" />
        </div>

        <!-- Base Price -->
        <div class="space-y-1.5 max-w-xs">
          <Label for="basePrice">Base License Price ($ / month)</Label>
          <Input id="basePrice" name="basePrice" type="number" step="0.01" min="0" bind:value={basePrice} required class="bg-background/50 text-right" />
        </div>

        <!-- Packs Checkbox List -->
        <div class="space-y-2 pt-2">
          <Label>Select Feature Packs to Include</Label>
          {#if packs.length === 0}
            <div class="text-xs text-muted-foreground bg-muted border border-border rounded-md p-3 text-center">
              No feature packs found in catalog. Create packs first.
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-40 overflow-y-auto p-1">
              {#each packs as pack}
                <label 
                  class="flex items-center space-x-3 p-3 rounded-lg border border-border bg-background/50 hover:bg-muted/40 cursor-pointer select-none transition-colors"
                >
                  <input
                    type="checkbox"
                    name="pack_ids"
                    value={pack.id}
                    checked={selectedPackIds.includes(pack.id)}
                    onclick={() => togglePack(pack.id)}
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/50"
                  />
                  <div class="flex items-center space-x-2">
                    <Layers class="h-4 w-4 text-muted-foreground" />
                    <span class="text-sm font-semibold text-foreground">{pack.name}</span>
                  </div>
                </label>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Services Checkbox List -->
        <div class="space-y-2 pt-2">
          <Label>Select Individual AI Services to Include (Direct Addition)</Label>
          {#if services.length === 0}
            <div class="text-xs text-muted-foreground bg-muted border border-border rounded-md p-3 text-center">
              No services found in catalog. Create services first.
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-40 overflow-y-auto p-1">
              {#each services as service}
                <label 
                  class="flex items-center space-x-3 p-3 rounded-lg border border-border bg-background/50 hover:bg-muted/40 cursor-pointer select-none transition-colors"
                >
                  <input
                    type="checkbox"
                    name="service_ids"
                    value={service.id}
                    checked={selectedServiceIds.includes(service.id)}
                    onclick={() => toggleService(service.id)}
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/50"
                  />
                  <div class="flex items-center space-x-2">
                    <BrainCircuit class="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span class="text-sm font-semibold text-foreground block">{service.name}</span>
                      <span class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mt-0.5">{service.status}</span>
                    </div>
                  </div>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex items-center justify-end space-x-3">
        <Button variant="outline" href="/catalog/plans" disabled={isSaving}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>
          <Save class="h-4 w-4 mr-2" />
          {#if isSaving}Saving...{:else}Save Pricing Plan{/if}
        </Button>
      </div>
    </div>
  </form>
</div>
