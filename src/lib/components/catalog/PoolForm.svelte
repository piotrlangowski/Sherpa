<script lang="ts">
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import { NumberField } from '$lib/components/forms';
  
  // Lucide Icons
  import Save from '@lucide/svelte/icons/save';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Coins from '@lucide/svelte/icons/coins';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Plus from '@lucide/svelte/icons/plus';

  interface Props {
    pool?: any;
    services: any[];
    action: string;
  }

  let { pool = {}, services, action }: Props = $props();

  let name = $state(pool.name || '');
  let monthlyFee = $state(pool.monthly_fee || 0);
  let creditPoolSize = $state(pool.credit_pool_size || 0);
  let capturePercent = $state(pool.capture !== undefined && pool.capture !== null ? Math.round(pool.capture * 100) : '');
  let feeBasis = $state<'flat' | 'per_member' | 'per_customer'>(
    pool.fee_basis === 'per_member' ? 'per_member' : (pool.fee_basis === 'per_customer' ? 'per_customer' : 'flat')
  );
  let poolSizeBasis = $state<'absolute' | 'per_member'>(pool.pool_size_basis === 'per_member' ? 'per_member' : 'absolute');

  // Burn rates list: [{ service_id, burn_rate, service_name }]
  let burnRates = $state<Array<{ service_id: string; burn_rate: number; service_name: string }>>(
    pool.burn_rates || []
  );

  let selectedServiceId = $state('');
  let isSaving = $state(false);

  // Available services to add (those not already in the burnRates list)
  let availableServices = $derived(
    services.filter(s => !burnRates.some(br => br.service_id === s.id))
  );

  function addService() {
    if (!selectedServiceId) return;
    const svc = services.find(s => s.id === selectedServiceId);
    if (svc) {
      burnRates = [...burnRates, { service_id: svc.id, burn_rate: 1, service_name: svc.name }];
      selectedServiceId = '';
    }
  }

  function removeService(serviceId: string) {
    burnRates = burnRates.filter(br => br.service_id !== serviceId);
  }
</script>

<div class="max-w-2xl space-y-6">
  <div class="flex items-center space-x-3">
    <Button variant="outline" size="icon" href="/catalog/pools" class="h-9 w-9">
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div>
      <h2 class="text-2xl font-bold tracking-tight">
        {pool.id ? 'Edit Credit Pool' : 'Create Credit Pool'}
      </h2>
      <p class="text-muted-foreground text-sm font-normal">
        {pool.id ? 'Update credit pool tier and service burn rates.' : 'Create a unified credit-pool tier with shared inclusions.'}
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
      <div class="glass border rounded-xl p-6 space-y-4">
        <div class="flex items-center space-x-2.5 text-primary mb-2 select-none">
          <Coins class="h-5 w-5" />
          <span class="text-xs font-bold uppercase tracking-wider">Pool Configurations</span>
        </div>

        <input type="hidden" name="id" value={pool.id || ''} />
        <input type="hidden" name="burn_rates_json" value={JSON.stringify(burnRates.map(br => ({ service_id: br.service_id, burn_rate: br.burn_rate })))} />
        <input type="hidden" name="capture" value={capturePercent === '' || capturePercent === null ? '' : capturePercent} />

        <!-- Name -->
        <div class="space-y-1.5">
          <Label for="name">Pool Tier Name</Label>
          <Input id="name" name="name" placeholder="e.g. Gold Pool" bind:value={name} required class="bg-(--glass-inset-bg)" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Monthly Fee -->
          <div class="space-y-1.5">
            <Label for="monthlyFee">Monthly Subscription Fee ($ / month)</Label>
            <NumberField id="monthlyFee" name="monthlyFee" min="0" step="0.01" bind:value={monthlyFee} required raw={true} grouped={true} decimals={2} class="text-right" />
          </div>

          <!-- Credit Pool Size -->
          <div class="space-y-1.5">
            <Label for="creditPoolSize">Credit Pool Size (Credits / month)</Label>
            <NumberField id="creditPoolSize" name="creditPoolSize" min="0" step="1" bind:value={creditPoolSize} required raw={true} grouped={true} decimals={0} class="text-right" />
          </div>
        </div>

        <!-- Fee Basis (ADR 0012 Decision 1 / Amendment 2026-07) -->
        <div class="space-y-1.5 max-w-xs">
          <Label for="feeBasis">Fee Basis</Label>
          <select
            id="feeBasis"
            name="feeBasis"
            bind:value={feeBasis}
            class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
          >
            <option value="flat">Flat — once per tier</option>
            <option value="per_member">Per Member — × active AI users</option>
            <option value="per_customer">Per Customer — × active customers</option>
          </select>
          <p class="text-[10px] text-muted-foreground">
            Flat fits a B2B org-wide tier. Per Member fits a B2C per-subscriber plan (scales with active AI users). Per Customer scales the fee with all active customers in the cohort.
          </p>
        </div>

        <!-- Pool Size Basis (ADR 0012 Decision 1 / Amendment 2026-07) -->
        <div class="space-y-1.5 max-w-xs">
          <Label for="poolSizeBasis">Pool Size Basis</Label>
          <select
            id="poolSizeBasis"
            name="poolSizeBasis"
            bind:value={poolSizeBasis}
            class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
          >
            <option value="absolute">Absolute — credits per pool</option>
            <option value="per_member">Per Member — credits × active AI users</option>
          </select>
          <p class="text-[10px] text-muted-foreground">
            Absolute is a fixed monthly credit pool for the entire cohort. Per Member scales the pool size dynamically by multiplying it by active AI users (e.g. 2.5 credits per active user).
          </p>
        </div>

        <!-- EVC Capture Rate override -->
        <div class="space-y-1.5 max-w-xs">
          <Label for="capturePercent">EVC Capture Override (%)</Label>
          <Input id="capturePercent" type="number" min="0" max="100" placeholder="Scenario Default" bind:value={capturePercent} class="bg-(--glass-inset-bg)" />
          <p class="text-[10px] text-muted-foreground">Optional override. Falls back to scenario's target capture if left blank.</p>
        </div>

        <hr class="border-border/60" />

        <!-- Burn Rates Configuration -->
        <div class="space-y-3 pt-2">
          <div class="flex items-center justify-between">
            <Label class="font-semibold">Service Burn Rates</Label>
            <span class="text-xs text-muted-foreground">{burnRates.length} service(s) configured</span>
          </div>

          <!-- Add Service to Pool -->
          <div class="flex gap-2 items-end">
            <div class="flex-1 space-y-1.5">
              <Label for="add_service_id" class="text-xs text-muted-foreground">Add Service to Pool</Label>
              <select
                id="add_service_id"
                bind:value={selectedServiceId}
                class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              >
                <option value="">-- Select AI Service --</option>
                {#each availableServices as svc}
                  <option value={svc.id}>{svc.name} ({svc.service_type === 'copilot' ? 'Copilot' : 'Agent'})</option>
                {/each}
              </select>
            </div>
            <Button type="button" variant="secondary" onclick={addService} disabled={!selectedServiceId} class="shrink-0 h-9">
              <Plus class="h-4 w-4 mr-1.5" /> Add Service
            </Button>
          </div>

          <!-- Burn Rates List -->
          {#if burnRates.length === 0}
            <div class="text-xs text-muted-foreground bg-muted/40 border border-border/60 border-dashed rounded-md p-4 text-center">
              No services drawing from this pool tier. Add a service above.
            </div>
          {:else}
            <div class="border border-border rounded-lg overflow-hidden bg-(--glass-inset-bg)">
              <table class="w-full text-sm text-left border-collapse">
                <thead>
                  <tr class="bg-muted/40 border-b border-border text-xs text-muted-foreground uppercase font-bold select-none">
                    <th class="px-4 py-2.5">Service Name</th>
                    <th class="px-4 py-2.5 text-right w-36">Burn Rate (Credits)</th>
                    <th class="px-4 py-2.5 text-center w-16">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {#each burnRates as br, i}
                    <tr class="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                      <td class="px-4 py-3 font-semibold text-foreground">{br.service_name}</td>
                      <td class="px-4 py-3 text-right">
                        <NumberField id="burn_rate_{i}" min="0.0001" step="any" bind:value={br.burn_rate} required raw={true} grouped={false} decimals={4} class="text-right w-full bg-transparent border-0 focus:ring-0 p-0 text-foreground font-mono" />
                      </td>
                      <td class="px-4 py-3 text-center">
                        <Button type="button" variant="ghost" size="icon" onclick={() => removeService(br.service_id)} class="h-8 w-8 text-destructive hover:bg-destructive/10">
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex items-center justify-end space-x-3">
        <Button variant="outline" href="/catalog/pools" disabled={isSaving}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>
          <Save class="h-4 w-4 mr-2" />
          {#if isSaving}Saving...{:else}Save Credit Pool{/if}
        </Button>
      </div>
    </div>
  </form>
</div>
