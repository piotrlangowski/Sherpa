<script lang="ts">
  import { enhance } from '$app/forms';
  import { formatCurrency } from '$lib/utils/format';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Alert from '$lib/components/ui/alert/alert.svelte';
  import AlertTitle from '$lib/components/ui/alert/alert-title.svelte';
  import AlertDescription from '$lib/components/ui/alert/alert-description.svelte';
  
  // Lucide Icons
  import Save from '@lucide/svelte/icons/save';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Calculator from '@lucide/svelte/icons/calculator';

  interface Props {
    service?: any;
    providers: any[];
    action: string;
  }

  let { service = {}, providers, action }: Props = $props();

  let name = $state(service.name || '');
  let description = $state(service.description || '');
  let status = $state(service.status || 'planned');
  let providerId = $state(service.provider_id || '');
  let avgInputTokens = $state(service.avg_input_tokens || 0);
  let avgOutputTokens = $state(service.avg_output_tokens || 0);
  let avgRequests = $state(service.avg_requests_per_user_month || 0);
  let fixedCost = $state(service.fixed_cost_per_month || null);
  let isSaving = $state(false);

  // Find active provider and calculate cost estimations
  let activeProvider = $derived(providers.find(p => p.id === providerId));
  
  let costPerRequest = $derived.by(() => {
    if (!activeProvider) return 0;
    const inputCost = (avgInputTokens * activeProvider.input_price) / 1_000_000;
    const outputCost = (avgOutputTokens * activeProvider.output_price) / 1_000_000;
    return inputCost + outputCost;
  });

  let estMonthlyCostPerUser = $derived(costPerRequest * avgRequests);
</script>

<div class="max-w-2xl space-y-6">
  <div class="flex items-center space-x-3">
    <Button variant="outline" size="icon" href="/catalog/services" class="h-9 w-9">
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div>
      <h2 class="text-2xl font-bold tracking-tight">
        {service.id ? 'Edit AI Service' : 'Create New AI Service'}
      </h2>
      <p class="text-muted-foreground text-sm">
        {service.id ? 'Modify parameters and token sizes.' : 'Configure a new feature for your catalog.'}
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
          <BrainCircuit class="h-5 w-5" />
          <span class="text-xs font-bold uppercase tracking-wider">Service Configurations</span>
        </div>

        <input type="hidden" name="id" value={service.id || ''} />

        <!-- Name -->
        <div class="space-y-1.5">
          <Label for="name">Service Name</Label>
          <Input id="name" name="name" placeholder="e.g. Code Autocomplete" bind:value={name} required class="bg-background/50" />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <Label for="description">Description</Label>
          <Textarea id="description" name="description" placeholder="Describe the purpose of this AI feature..." bind:value={description} class="bg-background/50" />
        </div>

        <!-- Status -->
        <div class="space-y-2">
          <Label>Status</Label>
          <div class="flex space-x-6">
            <label class="flex items-center space-x-2 cursor-pointer text-sm">
              <input type="radio" name="status" value="existing" bind:group={status} class="text-primary focus:ring-primary/50 h-4 w-4 border-gray-300" />
              <span class="text-foreground">Existing (Already launched, baseline cost)</span>
            </label>
            <label class="flex items-center space-x-2 cursor-pointer text-sm">
              <input type="radio" name="status" value="planned" bind:group={status} class="text-primary focus:ring-primary/50 h-4 w-4 border-gray-300" />
              <span class="text-foreground">Planned (New feature evaluation)</span>
            </label>
          </div>
        </div>

        <!-- Provider Selection -->
        <div class="space-y-1.5">
          <Label for="providerId">AI Token Model Provider</Label>
          <select
            id="providerId"
            name="providerId"
            bind:value={providerId}
            class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">No Provider (Fixed Cost Override Only)</option>
            {#each providers as prov}
              <option value={prov.id}>{prov.name} — {prov.model_name}</option>
            {/each}
          </select>
        </div>

        <!-- Token Parameters -->
        {#if providerId}
          <div class="p-4 rounded-lg bg-muted/30 border border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="space-y-1.5">
              <Label for="avgInputTokens">Avg. Input Tokens</Label>
              <Input id="avgInputTokens" name="avgInputTokens" type="number" min="0" bind:value={avgInputTokens} class="bg-background/50 text-right font-mono" />
            </div>

            <div class="space-y-1.5">
              <Label for="avgOutputTokens">Avg. Output Tokens</Label>
              <Input id="avgOutputTokens" name="avgOutputTokens" type="number" min="0" bind:value={avgOutputTokens} class="bg-background/50 text-right font-mono" />
            </div>

            <div class="space-y-1.5">
              <Label for="avgRequests">Requests / User / Month</Label>
              <Input id="avgRequests" name="avgRequests" type="number" min="0" bind:value={avgRequests} class="bg-background/50 text-right font-mono" />
            </div>
          </div>

          <!-- Interactive Calculator Card -->
          <div class="p-4 bg-primary/5 border border-primary/10 rounded-lg flex items-start space-x-3.5 select-none shadow-sm">
            <div class="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Calculator class="h-5 w-5" />
            </div>
            <div class="space-y-1.5 flex-1 min-w-0">
              <h4 class="text-sm font-semibold text-foreground">Estimated Usage Cost Allocation</h4>
              <div class="grid grid-cols-2 gap-4 pt-0.5">
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Cost per request</span>
                  <span class="text-sm font-bold text-foreground mt-0.5 block">
                    {formatCurrency(costPerRequest, 'USD', 4)}
                  </span>
                </div>
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Monthly per-user cost</span>
                  <span class="text-sm font-bold text-primary mt-0.5 block">
                    {formatCurrency(estMonthlyCostPerUser, 'USD', 2)}/user
                  </span>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Fixed cost override -->
        <div class="space-y-1.5">
          <Label for="fixedCost">Fixed Cost Override ($ / month)</Label>
          <Input id="fixedCost" name="fixedCost" type="number" step="0.01" min="0" placeholder="e.g. flat model hosting fee" bind:value={fixedCost} class="max-w-xs bg-background/50 text-right" />
          <p class="text-xs text-muted-foreground">
            Optional. Use this if you pay a flat monthly fee for this service rather than per token.
          </p>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex items-center justify-end space-x-3">
        <Button variant="outline" href="/catalog/services" disabled={isSaving}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>
          <Save class="h-4 w-4 mr-2" />
          {#if isSaving}Saving...{:else}Save Service{/if}
        </Button>
      </div>
    </div>
  </form>
</div>
