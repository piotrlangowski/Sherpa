<script lang="ts">
  import { formatCurrency, formatPercent, formatNumber } from '$lib/utils/format';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Users2 from '@lucide/svelte/icons/users-2';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Wallet from '@lucide/svelte/icons/wallet';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import { appState } from '$lib/stores/app.svelte';

  let { scenario }: { scenario: any } = $props();
</script>

<div class="space-y-5">
  <!-- Horizon -->
  <div class="grid grid-cols-2 gap-4 bg-muted/40 p-2.5 rounded border border-border/40">
    <div>
      <span class="text-muted-foreground font-semibold block text-[10px] uppercase">Horizon</span>
      <span class="font-mono text-sm font-bold text-foreground mt-0.5 block">{scenario.projection_months} months</span>
    </div>
    <div>
      <span class="text-muted-foreground font-semibold block text-[10px] uppercase">Discount Rate</span>
      <span class="font-mono text-sm font-bold text-primary mt-0.5 block">{formatPercent(scenario.discount_rate)}</span>
    </div>
  </div>

  <!-- Target Scope -->
  <div class="space-y-2">
    <span class="text-[10px] uppercase font-bold text-muted-foreground/80 flex items-center">
      <Users2 class="h-3.5 w-3.5 mr-1 text-primary opacity-80" /> Target Audience Scope
    </span>
    <div class="pl-4.5 border-l border-border/60 space-y-2 text-muted-foreground font-medium">
      <div>
        Scope Type:
        <strong class="text-foreground capitalize">
          {#if scenario.scope_type === 'all_clients'}
            Global Client Base
          {:else}
            {scenario.scope_type}
          {/if}
        </strong>
      </div>

      {#if scenario.scope_type === 'verticals' && scenario.scope_verticals && scenario.scope_verticals.length > 0}
        <div class="text-xs">
          <div class="mb-1 text-muted-foreground">Targeted Verticals:</div>
          <div class="flex flex-wrap gap-1">
            {#each scenario.scope_verticals as v}
              <Badge variant="outline" class="glass-inset py-0 text-[10px]">{v.name}</Badge>
            {/each}
          </div>
        </div>
      {/if}

      {#if scenario.scope_type === 'cohorts' && scenario.scope_cohorts && scenario.scope_cohorts.length > 0}
        <div class="text-xs">
          <div class="mb-1 text-muted-foreground">Targeted Cohorts:</div>
          <div class="flex flex-wrap gap-1">
            {#each scenario.scope_cohorts as c}
              <Badge variant="outline" class="glass-inset py-0 text-[10px]">{c.name}</Badge>
            {/each}
          </div>
        </div>
      {/if}

      {#if scenario.scope_overrides && scenario.scope_overrides.length > 0}
        {#snippet renderComparison(label: string, baseVal: number | null | undefined, ovVal: number | null | undefined, formatFn: (val: number) => string)}
          {#if ovVal !== null && ovVal !== undefined}
            <div class="flex justify-between items-center text-[10px] py-1 border-b border-border/10 last:border-b-0">
              <span class="text-muted-foreground/85">{label}</span>
              <span class="font-mono text-foreground flex items-center">
                {#if baseVal !== null && baseVal !== undefined && Math.abs(baseVal - ovVal) > 0.00001}
                  <span class="opacity-40 line-through mr-1 text-muted-foreground">{formatFn(baseVal)}</span>
                  <span class="text-amber-500 dark:text-amber-400 font-bold mr-1 text-[9px]">➔</span>
                {/if}
                <span class="text-foreground font-semibold">{formatFn(ovVal)}</span>
              </span>
            </div>
          {/if}
        {/snippet}

        <div class="mt-2 text-xs">
          <div class="mb-1.5 text-amber-500 font-bold flex items-center select-none text-[10px] uppercase tracking-wider">
            <TrendingUp class="h-3.5 w-3.5 mr-1" /> Parameter Overrides Applied
          </div>
          <div class="space-y-2">
            {#each scenario.scope_overrides as ov}
              <div class="bg-muted/30 p-2.5 rounded border border-border/40 border-l-2 border-l-amber-500/80 space-y-1.5">
                <div class="flex justify-between items-center border-b border-border/45 pb-1 select-none">
                  <span class="font-bold text-foreground truncate max-w-[170px]" title={ov.target_name}>{ov.target_name}</span>
                  <Badge variant="outline" class="text-[8px] px-1 py-0 uppercase tracking-wider font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                    {ov.target_type === 'all_clients' ? 'Global' : ov.target_type}
                  </Badge>
                </div>
                <div class="space-y-0">
                  {@render renderComparison('ARPU Base', ov.base_values?.arpu_override, ov.arpu_override, (v: number) => formatCurrency(v, appState.currency, 0))}
                  {@render renderComparison('Monthly Churn', ov.base_values?.monthly_churn_rate, ov.monthly_churn_rate, formatPercent)}
                  {@render renderComparison('Adoption Rate', ov.base_values?.ai_adoption_rate, ov.ai_adoption_rate, formatPercent)}
                  {@render renderComparison('New Customers', ov.base_values?.monthly_acquisition, ov.monthly_acquisition, (v: number) => `${formatNumber(v)}/mo`)}
                  {@render renderComparison('Acquisition Growth', ov.base_values?.acquisition_growth_rate, ov.acquisition_growth_rate, formatPercent)}
                  {@render renderComparison('Retention Floor', ov.base_values?.retention_floor, ov.retention_floor, formatPercent)}
                  {@render renderComparison('Expansion Rate', ov.base_values?.expansion_rate, ov.expansion_rate, formatPercent)}
                  {@render renderComparison('AI ARPU Uplift ($)', ov.base_values?.arpu_uplift, ov.arpu_uplift, (v: number) => formatCurrency(v, appState.currency, 0))}
                  {@render renderComparison('AI ARPU Uplift (%)', ov.base_values?.arpu_uplift_percent, ov.arpu_uplift_percent, formatPercent)}
                  {@render renderComparison('AI Churn Reduction', ov.base_values?.churn_reduction, ov.churn_reduction, formatPercent)}
                  {@render renderComparison('AI Acquisition Uplift', ov.base_values?.acquisition_uplift, ov.acquisition_uplift, formatPercent)}
                  {@render renderComparison('Gross Margin', ov.base_values?.gross_margin, ov.gross_margin, formatPercent)}
                  {@render renderComparison('Adoption Ramp', ov.base_values?.adoption_ramp_months, ov.adoption_ramp_months, (v: number) => `${v} mo`)}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Rollout scheduler items -->
  <div class="space-y-2">
    <span class="text-[10px] uppercase font-bold text-muted-foreground/80 flex items-center">
      <BrainCircuit class="h-3.5 w-3.5 mr-1 text-primary opacity-80" /> Offerings Rollout Month
    </span>
    <div class="pl-4.5 border-l border-border/60 space-y-1 text-muted-foreground font-medium">
      {#if (!scenario.plans || scenario.plans.length === 0) && (!scenario.packs || scenario.packs.length === 0) && (!scenario.services || scenario.services.length === 0)}
        <div class="italic">No offerings rolled out.</div>
      {:else}
        {#each scenario.plans || [] as plan}
          <div class="flex justify-between items-center">
            <span>Plan: <strong>{plan.name}</strong></span>
            <Badge variant="outline" class="font-mono glass-inset py-0 px-1.5 text-[10px]">M{plan.rollout_month}</Badge>
          </div>
        {/each}
        {#each scenario.packs || [] as pack}
          <div class="flex justify-between items-center">
            <span>Pack: <strong>{pack.name}</strong></span>
            <Badge variant="outline" class="font-mono glass-inset py-0 px-1.5 text-[10px]">M{pack.rollout_month}</Badge>
          </div>
        {/each}
        {#each scenario.services || [] as service}
          <div class="flex justify-between items-center">
            <span>Service: <strong>{service.name}</strong></span>
            <Badge variant="outline" class="font-mono glass-inset py-0 px-1.5 text-[10px]">M{service.rollout_month}</Badge>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Capex / Opex itemized -->
  <div class="space-y-2">
    <span class="text-[10px] uppercase font-bold text-muted-foreground/80 flex items-center">
      <Wallet class="h-3.5 w-3.5 mr-1 text-primary opacity-80" /> Capital & Operating Expenses
    </span>
    <div class="pl-4.5 border-l border-border/60 space-y-1 text-muted-foreground font-medium">
      {#if !scenario.costs || scenario.costs.length === 0}
        <div class="italic">No expense items mapped.</div>
      {:else}
        {#each scenario.costs as cost}
          <div class="flex justify-between items-center">
            <span class="truncate pr-2">{cost.name} ({cost.category})</span>
            <span class="font-mono text-rose-600 dark:text-rose-400 font-bold shrink-0">{formatCurrency(cost.amount, cost.currency || 'USD', 0)}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>
