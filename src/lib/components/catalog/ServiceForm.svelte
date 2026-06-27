<script lang="ts">
  import { enhance } from '$app/forms';
  import { formatCurrency } from '$lib/utils/format';
  import { NumberField } from '$lib/components/forms';
  import type { Currency } from '$lib/shared/types';
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
  import Info from '@lucide/svelte/icons/info';
  import MonetizationFields from '$lib/components/catalog/MonetizationFields.svelte';

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
  let fixedCostCurrency = $state<Currency>(service.fixed_cost_currency || 'USD');
  let isSaving = $state(false);

  // Agent archetype fields
  let serviceType = $state(service.service_type || 'copilot');
  let interactionDriverType = $state(service.interaction_driver_type || 'flat');
  let monthlyVolume = $state(service.monthly_volume || 0);
  let volumeGrowthRate = $state(service.volume_growth_rate || 0);
  let interactionsPerCustomerMonth = $state(service.interactions_per_customer_month || 0);
  let fullyLoadedCostPerFteMonth = $state(service.fully_loaded_cost_per_fte_month || 0);
  let productiveHoursPerFteMonth = $state(service.productive_hours_per_fte_month || 120);
  let averageHandleTimeSeconds = $state(service.average_handle_time_seconds || 0);
  let baselineFte = $state(service.baseline_fte || 0);
  let staffingRealizationLagMonths = $state(service.staffing_realization_lag_months || 0);
  let containmentRate = $state(service.containment_rate || 0);
  let containmentStartRate = $state(service.containment_start_rate || 0);
  let containmentRampMonths = $state(service.containment_ramp_months || 0);
  let escalationRate = $state(service.escalation_rate || 0);
  let failedDeflectionPenalty = $state(service.failed_deflection_penalty || 0);
  let churnRateUplift = $state(service.churn_rate_uplift || 0);

  // Find active provider and calculate cost estimations
  let activeProvider = $derived(providers.find(p => p.id === providerId));
  
  let costPerRequest = $derived.by(() => {
    if (!activeProvider) return 0;
    const inputCost = (avgInputTokens * activeProvider.input_price) / 1_000_000;
    const outputCost = (avgOutputTokens * activeProvider.output_price) / 1_000_000;
    return inputCost + outputCost;
  });

  let estMonthlyCostPerUser = $derived(costPerRequest * avgRequests);

  // Agent Preview Calculator calculations
  let agentPreview = $derived.by(() => {
    const baselineCustomers = 1000;
    let interactions = 0;
    let label = '';
    
    if (interactionDriverType === 'flat') {
      interactions = monthlyVolume;
      label = 'Based on Flat Monthly Volume';
    } else {
      interactions = baselineCustomers * interactionsPerCustomerMonth;
      label = `Based on ${baselineCustomers.toLocaleString()} customers (${interactionsPerCustomerMonth}/customer)`;
    }

    const deflected = interactions * containmentRate;
    const failed = interactions * Math.max(0, 1 - containmentRate - escalationRate);
    
    const averageHandleTime = averageHandleTimeSeconds;
    const productiveHours = productiveHoursPerFteMonth || 120;
    const baseline = baselineFte;
    const fullyLoadedCost = fullyLoadedCostPerFteMonth;
    
    const hoursSaved = (deflected * averageHandleTime) / 3600;
    const fteSaved = hoursSaved / productiveHours;
    const realizable = baseline > 0 ? Math.min(fteSaved, baseline) : fteSaved;
    
    const cashFtes = Math.floor(realizable);
    const capacityFtes = realizable - cashFtes;
    
    const cashSavings = cashFtes * fullyLoadedCost;
    const capacitySavings = capacityFtes * fullyLoadedCost;
    const penaltyCost = failed * failedDeflectionPenalty;

    // Token costs
    let tokenCostPerInteraction = 0;
    if (activeProvider) {
      const inputCost = (avgInputTokens * activeProvider.input_price) / 1_000_000;
      const outputCost = (avgOutputTokens * activeProvider.output_price) / 1_000_000;
      tokenCostPerInteraction = inputCost + outputCost;
    }
    const monthlyTokenCosts = (interactions * tokenCostPerInteraction) + (fixedCost || 0);

    return {
      interactions,
      deflected,
      failed,
      fteSaved,
      realizable,
      cashFtes,
      capacityFtes,
      cashSavings,
      capacitySavings,
      penaltyCost,
      monthlyTokenCosts,
      label
    };
  });
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
      <div class="glass border rounded-xl p-6 space-y-4">
        <div class="flex items-center space-x-2.5 text-primary mb-2 select-none">
          <BrainCircuit class="h-5 w-5" />
          <span class="text-xs font-bold uppercase tracking-wider">Service Configurations</span>
        </div>

        <input type="hidden" name="id" value={service.id || ''} />

        <!-- Service Archetype (Copilot vs Agent) -->
        <div class="space-y-1.5">
          <Label>Service Archetype</Label>
          <div class="flex rounded-lg bg-muted p-1 w-full max-w-md">
            <button
              type="button"
              class="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all {serviceType === 'copilot' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => serviceType = 'copilot'}
            >
              Copilot (User-driven)
            </button>
            <button
              type="button"
              class="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all {serviceType === 'agent' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => serviceType = 'agent'}
            >
              Platform Agent (Interaction-driven)
            </button>
          </div>
          <input type="hidden" name="service_type" value={serviceType} />
        </div>

        <!-- Name -->
        <div class="space-y-1.5">
          <Label for="name">Service Name</Label>
          <Input id="name" name="name" placeholder="e.g. Code Autocomplete" bind:value={name} required class="bg-(--glass-inset-bg)" />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <Label for="description">Description</Label>
          <Textarea id="description" name="description" placeholder="Describe the purpose of this AI feature..." bind:value={description} class="bg-(--glass-inset-bg)" />
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
              <NumberField id="avgInputTokens" name="avgInputTokens" min="0" bind:value={avgInputTokens} required raw={true} grouped={true} decimals={0} class="text-right" />
            </div>

            <div class="space-y-1.5">
              <Label for="avgOutputTokens">Avg. Output Tokens</Label>
              <NumberField id="avgOutputTokens" name="avgOutputTokens" min="0" bind:value={avgOutputTokens} required raw={true} grouped={true} decimals={0} class="text-right" />
            </div>

            {#if serviceType === 'copilot'}
              <div class="space-y-1.5">
                <Label for="avgRequests">Requests / User / Month</Label>
                <NumberField id="avgRequests" name="avgRequests" min="0" bind:value={avgRequests} required raw={true} grouped={true} decimals={0} class="text-right" />
              </div>
            {/if}
          </div>

          <!-- Interactive Calculator Card (Copilot only) -->
          {#if serviceType === 'copilot'}
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
                      {formatCurrency(costPerRequest, activeProvider?.currency || 'USD', 4)}
                    </span>
                  </div>
                  <div>
                    <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Monthly per-user cost</span>
                    <span class="text-sm font-bold text-primary mt-0.5 block">
                      {formatCurrency(estMonthlyCostPerUser, activeProvider?.currency || 'USD', 2)}/user
                    </span>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        {/if}

        <!-- Fixed cost override -->
        <div class="space-y-1.5 max-w-md">
          <Label for="fixedCost">Fixed Cost Override</Label>
          <div class="grid grid-cols-3 gap-3">
            <select
              id="fixedCostCurrency"
              name="fixedCostCurrency"
              bind:value={fixedCostCurrency}
              class="col-span-1 bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="PLN">PLN (zł)</option>
              <option value="GBP">GBP (£)</option>
            </select>
            <NumberField id="fixedCost" name="fixedCost" min="0" step="0.01" placeholder="Flat cost" bind:value={fixedCost} required={false} raw={true} grouped={true} decimals={2} class="col-span-2 text-right" />
          </div>
          <p class="text-xs text-muted-foreground">
            Optional. Use this if you pay a flat monthly fee for this service rather than per token.
          </p>
        </div>

        <!-- Platform Agent Parameters -->
        {#if serviceType === 'agent'}
          <div class="border-t border-border pt-4 space-y-4">
            <div class="flex items-center space-x-2 text-primary font-semibold text-sm select-none">
              <BrainCircuit class="h-4 w-4" />
              <span>Platform Agent Parameters</span>
            </div>

            <!-- Volume Driver Type -->
            <div class="space-y-1.5">
              <Label>Interaction Volume Driver</Label>
              <div class="flex space-x-6">
                <label class="flex items-center space-x-2 cursor-pointer text-sm">
                  <input type="radio" name="interaction_driver_type" value="flat" bind:group={interactionDriverType} class="text-primary focus:ring-primary/50 h-4 w-4 border-gray-300" />
                  <span class="text-foreground">Flat Monthly Volume (Compounding growth)</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer text-sm">
                  <input type="radio" name="interaction_driver_type" value="per_customer" bind:group={interactionDriverType} class="text-primary focus:ring-primary/50 h-4 w-4 border-gray-300" />
                  <span class="text-foreground">Per-Customer Interactions (Scales with cohort)</span>
                </label>
              </div>
            </div>

            <!-- Driver Fields -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {#if interactionDriverType === 'flat'}
                <div class="space-y-1.5">
                  <Label for="monthly_volume">Monthly Volume (interactions)</Label>
                  <NumberField id="monthly_volume" name="monthly_volume" min="0" bind:value={monthlyVolume} required raw={true} grouped={true} decimals={0} class="text-right" />
                </div>
                <div class="space-y-1.5">
                  <Label for="volume_growth_rate">Monthly Volume Growth Rate (e.g. 0.02 for 2%)</Label>
                  <Input id="volume_growth_rate" name="volume_growth_rate" type="number" step="0.0001" min="0" bind:value={volumeGrowthRate} class="bg-(--glass-inset-bg) text-right font-mono" />
                </div>
              {:else}
                <div class="space-y-1.5">
                  <Label for="interactions_per_customer_month">Interactions / Customer / Month</Label>
                  <Input id="interactions_per_customer_month" name="interactions_per_customer_month" type="number" min="0" step="0.1" bind:value={interactionsPerCustomerMonth} class="bg-(--glass-inset-bg) text-right font-mono" />
                </div>
              {/if}
            </div>

            <!-- Labor Offsets Section -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border/40 pt-4">
              <div class="space-y-1.5">
                <Label for="fully_loaded_cost_per_fte_month">Fully Loaded FTE Cost / Month</Label>
                <NumberField id="fully_loaded_cost_per_fte_month" name="fully_loaded_cost_per_fte_month" min="0" step="0.01" bind:value={fullyLoadedCostPerFteMonth} required raw={true} grouped={true} decimals={2} class="text-right" />
              </div>
              <div class="space-y-1.5">
                <Label for="productive_hours_per_fte_month">Productive Hours / FTE / Month</Label>
                <Input id="productive_hours_per_fte_month" name="productive_hours_per_fte_month" type="number" min="1" bind:value={productiveHoursPerFteMonth} class="bg-(--glass-inset-bg) text-right font-mono" />
              </div>
              <div class="space-y-1.5">
                <Label for="average_handle_time_seconds">Avg Handle Time (seconds)</Label>
                <Input id="average_handle_time_seconds" name="average_handle_time_seconds" type="number" min="0" bind:value={averageHandleTimeSeconds} class="bg-(--glass-inset-bg) text-right font-mono" />
              </div>
              <div class="space-y-1.5">
                <Label for="baseline_fte">Max FTE Cap (Baseline FTE)</Label>
                <Input id="baseline_fte" name="baseline_fte" type="number" min="0" step="0.1" placeholder="0 for uncapped" bind:value={baselineFte} class="bg-(--glass-inset-bg) text-right font-mono" />
                <span class="text-[10px] text-muted-foreground">Limits maximum FTEs that can be offset.</span>
              </div>
              <div class="space-y-1.5">
                <Label for="staffing_realization_lag_months">Staffing Realization Lag (months)</Label>
                <Input id="staffing_realization_lag_months" name="staffing_realization_lag_months" type="number" min="0" bind:value={staffingRealizationLagMonths} class="bg-(--glass-inset-bg) text-right font-mono" />
                <span class="text-[10px] text-muted-foreground">Delay in realizing cash staffing savings.</span>
              </div>
            </div>

            <!-- Quality & Containment Section -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border/40 pt-4">
              <div class="space-y-1.5">
                <Label for="containment_rate">Target Containment Rate (0-1)</Label>
                <Input id="containment_rate" name="containment_rate" type="number" min="0" max="1" step="0.01" bind:value={containmentRate} class="bg-(--glass-inset-bg) text-right font-mono" />
              </div>
              <div class="space-y-1.5">
                <Label for="containment_start_rate">Start Containment Rate (0-1)</Label>
                <Input id="containment_start_rate" name="containment_start_rate" type="number" min="0" max="1" step="0.01" bind:value={containmentStartRate} class="bg-(--glass-inset-bg) text-right font-mono" />
              </div>
              <div class="space-y-1.5">
                <Label for="containment_ramp_months">Containment Ramp Period (months)</Label>
                <Input id="containment_ramp_months" name="containment_ramp_months" type="number" min="0" bind:value={containmentRampMonths} class="bg-(--glass-inset-bg) text-right font-mono" />
              </div>
              <div class="space-y-1.5">
                <Label for="escalation_rate">Escalation Rate (0-1)</Label>
                <Input id="escalation_rate" name="escalation_rate" type="number" min="0" max="1" step="0.01" bind:value={escalationRate} class="bg-(--glass-inset-bg) text-right font-mono" />
              </div>
              <div class="space-y-1.5">
                <Label for="failed_deflection_penalty">Failed Deflection Penalty Cost</Label>
                <Input id="failed_deflection_penalty" name="failed_deflection_penalty" type="number" min="0" step="0.01" bind:value={failedDeflectionPenalty} class="bg-(--glass-inset-bg) text-right font-mono" />
              </div>
              <div class="space-y-1.5">
                <Label for="churn_rate_uplift">Monthly Churn Uplift (0-1)</Label>
                <Input id="churn_rate_uplift" name="churn_rate_uplift" type="number" min="0" max="1" step="0.0001" bind:value={churnRateUplift} class="bg-(--glass-inset-bg) text-right font-mono" />
              </div>
            </div>

            <!-- Client-side validation warning -->
            {#if containmentRate + escalationRate > 1}
              <Alert class="border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                <AlertTitle>Warning: Invalid Quality Rates</AlertTitle>
                <AlertDescription>
                  Containment Rate ({containmentRate}) + Escalation Rate ({escalationRate}) exceeds 1.0 ({containmentRate + escalationRate}). The remaining portion will be negative, resulting in no failed deflections, or the Zod validation will fail on submit.
                </AlertDescription>
              </Alert>
            {/if}

            <!-- Live Calculator Preview Card -->
            <div class="p-5 bg-primary/5 border border-primary/10 rounded-xl space-y-3.5 shadow-sm">
              <div class="flex items-center justify-between border-b border-primary/10 pb-2">
                <div class="flex items-center space-x-2 text-primary font-semibold text-sm">
                  <Calculator class="h-4 w-4" />
                  <span>Platform Agent Live Preview Calculator</span>
                </div>
                <span class="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
                  {agentPreview.label}
                </span>
              </div>
              
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Deflected / Month</span>
                  <span class="text-sm font-bold text-foreground mt-0.5 block">
                    {Math.round(agentPreview.deflected).toLocaleString()} / {Math.round(agentPreview.interactions).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">FTEs Saved</span>
                  <span class="text-sm font-bold text-foreground mt-0.5 block">
                    {agentPreview.realizable.toFixed(2)} FTE
                    {#if baselineFte > 0 && agentPreview.fteSaved > baselineFte}
                      <span class="text-yellow-500 font-normal text-xs">(capped)</span>
                    {/if}
                  </span>
                </div>
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">FTEs Realized (Cash)</span>
                  <span class="text-sm font-bold text-primary mt-0.5 block">
                    {agentPreview.cashFtes} FTE
                  </span>
                </div>
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Capacity Released</span>
                  <span class="text-sm font-bold text-foreground mt-0.5 block">
                    {agentPreview.capacityFtes.toFixed(2)} FTE
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-primary/5">
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Monthly Labor Savings (Cash)</span>
                  <span class="text-base font-extrabold text-emerald-500 block font-mono">
                    {formatCurrency(agentPreview.cashSavings, fixedCostCurrency, 2)}
                  </span>
                </div>
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Monthly Capacity Value (Memo)</span>
                  <span class="text-base font-extrabold text-blue-500 block font-mono">
                    {formatCurrency(agentPreview.capacitySavings, fixedCostCurrency, 2)}
                  </span>
                </div>
                <div>
                  <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Failed Deflection Penalty</span>
                  <span class="text-base font-extrabold text-red-500 block font-mono">
                    {formatCurrency(agentPreview.penaltyCost, fixedCostCurrency, 2)}
                  </span>
                </div>
              </div>

              {#if activeProvider || fixedCost}
                <div class="pt-2 border-t border-primary/5 text-xs text-muted-foreground flex justify-between items-center">
                  <span>Estimated Model Token + Fixed Cost:</span>
                  <span class="font-bold text-foreground font-mono">
                    {formatCurrency(agentPreview.monthlyTokenCosts, fixedCostCurrency, 2)} / month
                  </span>
                </div>
              {/if}

              {#if staffingRealizationLagMonths > 0}
                <div class="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded border border-border/50">
                  Note: A lag of {staffingRealizationLagMonths} month(s) will be applied to the cash labor savings in the scenario timeline, while the capacity releases immediately.
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Monetization model notice for Agent archetype -->
      {#if serviceType === 'agent'}
        <div class="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-2">
          <p class="text-xs text-yellow-600 dark:text-yellow-400 font-medium flex items-center gap-1.5">
            <Info class="h-4 w-4 shrink-0" />
            Monetization Recommendation for Platform Agents
          </p>
          <p class="text-xs text-muted-foreground leading-relaxed">
            Platform Agents typically generate value through labor cost offsets (FTE savings) rather than user-based direct subscription models. It is recommended to keep <strong>Billing model</strong> set to <em>None</em>, unless you explicitly want to charge a per-user fee in addition to labor deflection savings.
          </p>
        </div>
      {/if}

      <MonetizationFields monetization={service.monetization} inheritedFromLabel="from its Pack or Plan" />

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
