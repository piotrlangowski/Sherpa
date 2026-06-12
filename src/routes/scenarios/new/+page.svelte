<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Slider from '$lib/components/ui/slider/slider.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  // Lucide Icons
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Save from '@lucide/svelte/icons/save';
  import Compass from '@lucide/svelte/icons/compass';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import DollarSign from '@lucide/svelte/icons/dollar-sign';
  import Edit2 from '@lucide/svelte/icons/edit-2';
  import Info from '@lucide/svelte/icons/info';

  import { resolveScenarioCohortsClient, buildDraftScenario } from '$lib/shared/scenario-preview';
  import { calculateScenario } from '$lib/shared/financial-math';
  import { normalizeScenarioCurrency } from '$lib/shared/currency';
  import { formatCurrency, formatPercent, formatMonths } from '$lib/utils/format';
  import { mode } from 'mode-watcher';

  let { data } = $props();

  // Wizard Navigation
  let currentStep = $state(1);

  // Step 1: Details & Scope
  let name = $state('');
  let description = $state('');
  let projectionMonths = $state(36);
  let discountRateArr = $state([10]); // slider
  const discountRate = $derived(discountRateArr[0]);

  let scopeType = $state<'all_clients' | 'verticals' | 'cohorts'>('all_clients');
  let selectedVerticals = $state<Record<string, boolean>>({});
  let selectedCohorts = $state<Record<string, boolean>>({});

  // Step 2: Overrides
  type OverrideRow = {
    target_type: 'all_clients' | 'vertical' | 'cohort';
    target_id: string;
    name: string;
    monthly_churn_rate: number | null;
    monthly_acquisition: number | null;
    acquisition_growth_rate: number | null;
    ai_adoption_rate: number | null;
    retention_floor: number | null;
    expansion_rate: number | null;
    arpu_override: number | null;
    arpu_uplift: number | null;
    arpu_uplift_percent: number | null;
    churn_reduction: number | null;
    acquisition_uplift: number | null;
  };
  let overrides = $state<OverrideRow[]>([]);
  let openOverrides = $state<Record<string, boolean>>({});

  let scopeOverridesJSON = $derived(JSON.stringify(overrides.map(o => ({
    ...o,
    monthly_churn_rate: o.monthly_churn_rate !== null ? o.monthly_churn_rate / 100 : null,
    acquisition_growth_rate: o.acquisition_growth_rate !== null ? o.acquisition_growth_rate / 100 : null,
    ai_adoption_rate: o.ai_adoption_rate !== null ? o.ai_adoption_rate / 100 : null,
    retention_floor: o.retention_floor !== null ? o.retention_floor / 100 : null,
    expansion_rate: o.expansion_rate !== null ? o.expansion_rate / 100 : null,
    arpu_uplift: o.arpu_uplift !== null ? parseFloat(o.arpu_uplift as any) : null,
    arpu_uplift_percent: o.arpu_uplift_percent !== null ? o.arpu_uplift_percent / 100 : null,
    churn_reduction: o.churn_reduction !== null ? o.churn_reduction / 100 : null,
    acquisition_uplift: o.acquisition_uplift !== null ? o.acquisition_uplift / 100 : null
  }))));

  $effect(() => {
    const _scopeType = scopeType;
    const _selectedVerticals = Object.keys(selectedVerticals).filter(k => selectedVerticals[k]);
    const _selectedCohorts = Object.keys(selectedCohorts).filter(k => selectedCohorts[k]);

    untrack(() => {
      const newOverrides: OverrideRow[] = [];
      
      if (_scopeType === 'all_clients') {
        const existing = overrides.find(o => o.target_type === 'all_clients');
        newOverrides.push(existing || {
          target_type: 'all_clients', target_id: 'all', name: 'Global Client Base',
          monthly_churn_rate: null, monthly_acquisition: null, acquisition_growth_rate: null,
          ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null,
          arpu_uplift: null, arpu_uplift_percent: null, churn_reduction: null, acquisition_uplift: null
        });
      } else if (_scopeType === 'verticals') {
        for (const v of data.verticals) {
          if (selectedVerticals[v.id]) {
            const existing = overrides.find(o => o.target_type === 'vertical' && o.target_id === v.id);
            newOverrides.push(existing || {
              target_type: 'vertical', target_id: v.id, name: v.name,
              monthly_churn_rate: null, monthly_acquisition: null, acquisition_growth_rate: null,
              ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null,
              arpu_uplift: null, arpu_uplift_percent: null, churn_reduction: null, acquisition_uplift: null
            });
          }
        }
      } else if (_scopeType === 'cohorts') {
        for (const c of data.cohorts) {
          if (selectedCohorts[c.id]) {
            const existing = overrides.find(o => o.target_type === 'cohort' && o.target_id === c.id);
            newOverrides.push(existing || {
              target_type: 'cohort', target_id: c.id, name: c.name,
              monthly_churn_rate: null, monthly_acquisition: null, acquisition_growth_rate: null,
              ai_adoption_rate: null, retention_floor: null, expansion_rate: null, arpu_override: null,
              arpu_uplift: null, arpu_uplift_percent: null, churn_reduction: null, acquisition_uplift: null
            });
          }
        }
      }
      overrides = newOverrides;
    });
  });

  // Step 3: Rollout Offerings
  let selectedServices = $state<Record<string, boolean>>({});
  let rolloutServices = $state<Record<string, number>>({});
  let selectedPacks = $state<Record<string, boolean>>({});
  let rolloutPacks = $state<Record<string, number>>({});
  let selectedPlans = $state<Record<string, boolean>>({});
  let rolloutPlans = $state<Record<string, number>>({});

  $effect(() => {
    const services = data.services;
    const packs = data.packs;
    const plans = data.plans;

    untrack(() => {
      if (services) {
        for (const s of services) if (rolloutServices[s.id] === undefined) rolloutServices[s.id] = 0;
      }
      if (packs) {
        for (const p of packs) if (rolloutPacks[p.id] === undefined) rolloutPacks[p.id] = 0;
      }
      if (plans) {
        for (const pl of plans) if (rolloutPlans[pl.id] === undefined) rolloutPlans[pl.id] = 0;
      }
    });
  });

  // Step 4: Cost Items
  let selectedCosts = $state<Record<string, boolean>>({});

  // Client-side Preview Derivations
  const resolvedCohortsClient = $derived.by(() => {
    const formattedOverrides = overrides.map(o => ({
      ...o,
      monthly_churn_rate: o.monthly_churn_rate !== null ? o.monthly_churn_rate / 100 : null,
      acquisition_growth_rate: o.acquisition_growth_rate !== null ? o.acquisition_growth_rate / 100 : null,
      ai_adoption_rate: o.ai_adoption_rate !== null ? o.ai_adoption_rate / 100 : null,
      retention_floor: o.retention_floor !== null ? o.retention_floor / 100 : null,
      expansion_rate: o.expansion_rate !== null ? o.expansion_rate / 100 : null,
      arpu_uplift: o.arpu_uplift !== null ? parseFloat(o.arpu_uplift as any) : null,
      arpu_uplift_percent: o.arpu_uplift_percent !== null ? o.arpu_uplift_percent / 100 : null,
      churn_reduction: o.churn_reduction !== null ? o.churn_reduction / 100 : null,
      acquisition_uplift: o.acquisition_uplift !== null ? o.acquisition_uplift / 100 : null
    }));
    return resolveScenarioCohortsClient(scopeType, data.cohorts, selectedVerticals, selectedCohorts, formattedOverrides as any[]);
  });

  const draftScenario = $derived.by(() => {
    const formattedOverrides = overrides.map(o => ({
      ...o,
      monthly_churn_rate: o.monthly_churn_rate !== null ? o.monthly_churn_rate / 100 : null,
      acquisition_growth_rate: o.acquisition_growth_rate !== null ? o.acquisition_growth_rate / 100 : null,
      ai_adoption_rate: o.ai_adoption_rate !== null ? o.ai_adoption_rate / 100 : null,
      retention_floor: o.retention_floor !== null ? o.retention_floor / 100 : null,
      expansion_rate: o.expansion_rate !== null ? o.expansion_rate / 100 : null,
      arpu_uplift: o.arpu_uplift !== null ? parseFloat(o.arpu_uplift as any) : null,
      arpu_uplift_percent: o.arpu_uplift_percent !== null ? o.arpu_uplift_percent / 100 : null,
      churn_reduction: o.churn_reduction !== null ? o.churn_reduction / 100 : null,
      acquisition_uplift: o.acquisition_uplift !== null ? o.acquisition_uplift / 100 : null
    }));

    return buildDraftScenario(
      {
        name,
        description,
        projectionMonths,
        discountRate: discountRate / 100,
        scopeType
      },
      resolvedCohortsClient,
      formattedOverrides as any[],
      selectedServices,
      rolloutServices,
      selectedPacks,
      rolloutPacks,
      selectedPlans,
      rolloutPlans,
      selectedCosts,
      data.services,
      data.packs,
      data.plans,
      data.costs
    );
  });

  const previewResult = $derived.by(() => {
    if (!name.trim()) return null;
    try {
      const { scenario: normalizedScenario, providers: normalizedProviders } = normalizeScenarioCurrency(
        draftScenario as any,
        data.providers,
        data.settings.currency,
        data.settings.exchange_rates
      );
      return calculateScenario(normalizedScenario, normalizedProviders);
    } catch (e) {
      console.error('Preview calculations error', e);
      return null;
    }
  });

  const hasNoAiBenefit = $derived(
    previewResult && previewResult.timeline && previewResult.timeline.length > 0
      ? previewResult.timeline.every((t: any) => Math.abs(t.revenue) < 0.01)
      : true
  );

  // ECharts Logic
  let chartElement: HTMLDivElement | undefined = $state();
  let chartInstance: any = null;
  let resizeListener: (() => void) | null = null;

  const chartOptions = $derived.by(() => {
    if (!previewResult || !previewResult.timeline || previewResult.timeline.length === 0) return {};
    const isDark = mode.current === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const axisColor = isDark ? '#94a3b8' : '#64748b';
    const lineColor = isDark ? '#475569' : '#e2e8f0';
    const splitLineColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.6)';
    const tooltipBg = isDark ? '#1e293b' : '#ffffff';
    const tooltipBorder = isDark ? '#475569' : '#e2e8f0';
    const tooltipText = isDark ? '#f8fafc' : '#0f172a';

    const monthsLabel = previewResult.timeline.map((t: any) => `Month ${t.month}`);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText }
      },
      legend: {
        data: ['Gross MRR', 'Baseline MRR', 'Net Cashflow'],
        textStyle: { color: textColor, fontSize: 11 },
        bottom: 0
      },
      grid: { left: '3%', right: '4%', top: '10%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: monthsLabel,
        axisLabel: { color: axisColor, fontSize: 10 },
        axisLine: { lineStyle: { color: lineColor } }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: axisColor,
          fontSize: 10,
          formatter: (value: number) => formatCurrency(value, data.settings.currency, 0)
        },
        axisLine: { lineStyle: { color: lineColor } },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      series: [
        {
          name: 'Baseline MRR',
          type: 'line',
          data: previewResult.timeline.map((t: any) => t.baselineRevenue),
          itemStyle: { color: '#94a3b8' },
          lineStyle: { width: 2, type: 'dashed' },
          symbolSize: 4
        },
        {
          name: 'Gross MRR',
          type: 'line',
          data: previewResult.timeline.map((t: any) => t.grossRevenue),
          itemStyle: { color: '#10b981' },
          lineStyle: { width: 3 },
          symbolSize: 4
        },
        {
          name: 'Net Cashflow',
          type: 'line',
          data: previewResult.timeline.map((t: any) => t.netCashFlow),
          itemStyle: { color: '#38bdf8' },
          lineStyle: { width: 2.5 },
          symbolSize: 4
        }
      ]
    };
  });

  function cleanupChart() {
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
    if (resizeListener) {
      window.removeEventListener('resize', resizeListener);
      resizeListener = null;
    }
  }

  function renderChart() {
    if (!chartElement || currentStep !== 5 || !previewResult) return;
    import('echarts').then((echarts) => {
      if (!chartElement) return;
      if (chartInstance) {
        chartInstance.setOption(chartOptions, true);
      } else {
        chartInstance = echarts.init(chartElement);
        chartInstance.setOption(chartOptions, true);
        resizeListener = () => {
          chartInstance?.resize();
        };
        window.addEventListener('resize', resizeListener);
      }
    });
  }

  $effect(() => {
    const _options = chartOptions; // Synchronous read registers dependency
    if (currentStep === 5 && previewResult && mode.current) {
      renderChart();
    } else {
      cleanupChart();
    }
  });

  onMount(() => {
    return () => {
      cleanupChart();
    };
  });

  const nextStep = () => {
    if (currentStep === 1) {
      if (!name.trim()) return alert('Scenario name is required.');
      if (scopeType === 'verticals' && !Object.values(selectedVerticals).some(Boolean)) return alert('Select at least one vertical.');
      if (scopeType === 'cohorts' && !Object.values(selectedCohorts).some(Boolean)) return alert('Select at least one cohort.');
    }
    currentStep += 1;
  };

  const prevStep = () => {
    currentStep -= 1;
  };
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <Button href="/scenarios" variant="ghost" size="sm">
      <ArrowLeft class="h-4 w-4 mr-2" /> Back to Scenarios
    </Button>

    <div class="flex items-center space-x-2 text-xs select-none">
      <span class="px-2.5 py-1 rounded-full font-bold {currentStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">1</span>
      <span class="text-muted-foreground font-medium">➔</span>
      <span class="px-2.5 py-1 rounded-full font-bold {currentStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">2</span>
      <span class="text-muted-foreground font-medium">➔</span>
      <span class="px-2.5 py-1 rounded-full font-bold {currentStep === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">3</span>
      <span class="text-muted-foreground font-medium">➔</span>
      <span class="px-2.5 py-1 rounded-full font-bold {currentStep === 4 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">4</span>
      <span class="text-muted-foreground font-medium">➔</span>
      <span class="px-2.5 py-1 rounded-full font-bold {currentStep === 5 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">5</span>
    </div>
  </div>

  {#if currentStep >= 2 && resolvedCohortsClient.length > 0}
    <div class="sticky top-0 z-10 glass border border-border bg-background/80 backdrop-blur px-4 py-2.5 rounded-lg flex items-center space-x-2 text-xs select-none">
      <span class="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Targeting Scope ({resolvedCohortsClient.length} Cohorts):</span>
      <div class="flex flex-wrap gap-1">
        {#each resolvedCohortsClient as c}
          <Badge variant="outline" class="glass-inset py-0 px-2 text-[10px]">{c.name}</Badge>
        {/each}
      </div>
    </div>
  {/if}

  <Card class="glass border">
    <CardHeader class="border-b border-border glass-inset">
      <div class="flex items-center space-x-2.5 text-primary">
        <Compass class="h-6 w-6" />
        <CardTitle class="text-xl font-bold">Create Scenario</CardTitle>
      </div>
      <CardDescription>
        {#if currentStep === 1}
          Define scenario meta info, projection horizon, and target scope.
        {:else if currentStep === 2}
          Optionally override baseline and AI impact assumptions for the selected scope.
        {:else if currentStep === 3}
          Map services and pricing offerings with scheduling rollout month offsets.
        {:else if currentStep === 4}
          Map OPEX and CAPEX expenses to be included in cash flow projections.
        {:else}
          Review the provisional results, KPIs, and charts before saving the scenario.
        {/if}
      </CardDescription>
    </CardHeader>

    <form method="POST" action="?/createScenario" use:enhance>
      <!-- Hidden fields -->
      <input type="hidden" name="scopeOverridesJSON" value={scopeOverridesJSON} />

      <!-- Step 1: Details & Scope -->
      <div class={currentStep === 1 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-6">
          <div class="space-y-4">
            <div class="space-y-2">
              <Label for="name" class="font-semibold">Scenario Name</Label>
              <Input id="name" name="name" bind:value={name} placeholder="e.g. Enterprise LegalTech Rollout" required class="bg-(--glass-inset-bg) border-border" />
            </div>
            <div class="space-y-2">
              <Label for="description" class="font-semibold">Description</Label>
              <Textarea id="description" name="description" bind:value={description} placeholder="Goal, hypotheses, or general context..." rows={2} class="bg-(--glass-inset-bg) border-border" />
            </div>
          </div>

          <hr class="border-border/60" />

          <!-- Projection & Discount -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="projectionMonths" class="font-semibold">Projection Horizon</Label>
              <select id="projectionMonths" name="projectionMonths" bind:value={projectionMonths} class="w-full glass-inset border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground font-mono">
                <option value={12}>12 Months (1 Year)</option>
                <option value={24}>24 Months (2 Years)</option>
                <option value={36}>36 Months (3 Years)</option>
                <option value={48}>48 Months (4 Years)</option>
                <option value={60}>60 Months (5 Years)</option>
              </select>
            </div>
            <div class="space-y-3 pt-2">
              <div class="flex justify-between items-center">
                <Label for="discountRateSlider" class="font-semibold">Discount Rate</Label>
                <span class="text-sm font-semibold text-primary">{discountRate}%</span>
              </div>
              <Slider id="discountRateSlider" bind:value={discountRateArr} min={0} max={30} step={1} type="multiple" />
              <input type="hidden" name="discountRate" value={discountRate} />
            </div>
          </div>

          <hr class="border-border/60" />

          <!-- Scope Selection -->
          <div class="space-y-4">
            <Label class="font-semibold text-base">Target Scope</Label>
            <p class="text-xs text-muted-foreground -mt-1">Choose which segment of your audience this scenario targets.</p>
            
            <div class="flex items-center space-x-4 mb-4">
              <label class="flex items-center space-x-2 cursor-pointer p-2 border rounded-md hover:glass-inset {scopeType === 'all_clients' ? 'border-primary bg-primary/5' : 'border-border'}">
                <input type="radio" name="scopeType" value="all_clients" bind:group={scopeType} class="accent-primary" />
                <span class="text-sm font-medium">Entire Client Base</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer p-2 border rounded-md hover:glass-inset {scopeType === 'verticals' ? 'border-primary bg-primary/5' : 'border-border'}">
                <input type="radio" name="scopeType" value="verticals" bind:group={scopeType} class="accent-primary" />
                <span class="text-sm font-medium">Specific Verticals</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer p-2 border rounded-md hover:glass-inset {scopeType === 'cohorts' ? 'border-primary bg-primary/5' : 'border-border'}">
                <input type="radio" name="scopeType" value="cohorts" bind:group={scopeType} class="accent-primary" />
                <span class="text-sm font-medium">Specific Cohorts</span>
              </label>
            </div>

            <!-- Verticals Multi-select -->
            {#if scopeType === 'verticals'}
              <div class="glass-inset border border-border p-4 rounded-lg">
                <h4 class="text-xs font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Select Verticals</h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {#each data.verticals as v}
                    <label class="flex items-center space-x-2 text-sm cursor-pointer hover:bg-foreground/5 p-1 rounded">
                      <input type="checkbox" name="verticalIds" value={v.id} bind:checked={selectedVerticals[v.id]} class="accent-primary" />
                      <span>{v.name}</span>
                    </label>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Cohorts Multi-select -->
            {#if scopeType === 'cohorts'}
              <div class="glass-inset border border-border p-4 rounded-lg">
                <h4 class="text-xs font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Select Cohorts</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {#each data.cohorts as c}
                    <label class="flex items-center space-x-3 text-sm cursor-pointer hover:bg-foreground/5 p-2 border border-border/40 rounded-md">
                      <input type="checkbox" name="cohortConfigIds" value={c.id} bind:checked={selectedCohorts[c.id]} class="accent-primary" />
                      <div>
                        <span class="block font-medium">{c.name}</span>
                        <span class="text-[10px] text-muted-foreground">{c.vertical_name || 'No Vertical'}</span>
                      </div>
                    </label>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </CardContent>

        <CardFooter class="border-t border-border glass-inset py-4 flex justify-end">
          <Button type="button" onclick={nextStep}>
            Next: Parameter Overrides <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </div>

      <!-- Step 2: Overrides -->
      <div class={currentStep === 2 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div class="flex items-center text-amber-500 mb-2 space-x-2">
            <Edit2 class="h-5 w-5" />
            <h3 class="text-sm font-bold uppercase tracking-wider">Parameter Overrides</h3>
          </div>
          <p class="text-xs text-muted-foreground mb-4">Leave fields blank to inherit from defaults. Values entered here will only apply to this scenario.</p>

          {#if overrides.length === 0}
            <p class="text-sm text-muted-foreground italic">No targets selected in Step 1.</p>
          {:else}
            <div class="space-y-4">
              {#each overrides as ov}
                {@const isOpen = !!openOverrides[ov.target_id]}
                <Card class="border border-border/60 bg-muted/20">
                  <button
                    type="button"
                    onclick={() => openOverrides[ov.target_id] = !openOverrides[ov.target_id]}
                    class="w-full text-left p-4 flex justify-between items-center hover:bg-foreground/5 transition duration-150 rounded-t-lg"
                  >
                    <div class="flex flex-col">
                      <span class="text-sm font-bold text-foreground">{ov.name}</span>
                      <span class="text-[10px] text-muted-foreground uppercase mt-0.5">{ov.target_type === 'all_clients' ? 'Global Scope' : ov.target_type} override assumptions</span>
                    </div>
                    <span class="text-xs font-mono font-bold text-primary">
                      {isOpen ? 'Collapse [-]' : 'Expand [+]'}
                    </span>
                  </button>
                  {#if isOpen}
                    <div class="p-4 border-t border-border/60 bg-background/5 space-y-6">
                      <!-- Section 1: Base parameter overrides -->
                      <div class="space-y-3">
                        <h4 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Base Parameter Overrides</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div class="space-y-1">
                            <Label class="text-xs font-semibold">ARPU Override ($)</Label>
                            <Input type="number" step="0.01" min="0" placeholder="Inherit" bind:value={ov.arpu_override} class="bg-background text-xs font-mono" />
                          </div>
                          <div class="space-y-1">
                            <Label class="text-xs font-semibold">Monthly Acquisition (/mo)</Label>
                            <Input type="number" min="0" placeholder="Inherit" bind:value={ov.monthly_acquisition} class="bg-background text-xs font-mono" />
                          </div>
                          <div class="space-y-1">
                            <Label class="text-xs font-semibold">Monthly Churn (%)</Label>
                            <Input type="number" step="0.1" min="0" max="100" placeholder="Inherit" bind:value={ov.monthly_churn_rate} class="bg-background text-xs font-mono" />
                          </div>
                          <div class="space-y-1">
                            <Label class="text-xs font-semibold">AI Adoption Rate (%)</Label>
                            <Input type="number" step="0.1" min="0" max="100" placeholder="Inherit" bind:value={ov.ai_adoption_rate} class="bg-background text-xs font-mono" />
                          </div>
                        </div>
                      </div>

                      <!-- Section 2: AI impact assumptions -->
                      <div class="space-y-3">
                        <h4 class="text-[10px] font-bold uppercase tracking-wider text-primary">AI Impact Assumptions (vs. Baseline)</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div class="space-y-1">
                            <Label class="text-xs font-semibold">AI ARPU Uplift ($ Flat)</Label>
                            <Input type="number" step="0.01" min="0" placeholder="Inherit" bind:value={ov.arpu_uplift} class="bg-background text-xs font-mono" />
                          </div>
                          <div class="space-y-1">
                            <Label class="text-xs font-semibold">AI ARPU Uplift (%)</Label>
                            <Input type="number" step="0.1" min="0" max="200" placeholder="Inherit" bind:value={ov.arpu_uplift_percent} class="bg-background text-xs font-mono" />
                          </div>
                          <div class="space-y-1">
                            <Label class="text-xs font-semibold">AI Churn Reduction (%)</Label>
                            <Input type="number" step="0.1" min="0" max="100" placeholder="Inherit" bind:value={ov.churn_reduction} class="bg-background text-xs font-mono" />
                          </div>
                          <div class="space-y-1">
                            <Label class="text-xs font-semibold">AI Acquisition Uplift (%)</Label>
                            <Input type="number" step="0.1" min="0" max="200" placeholder="Inherit" bind:value={ov.acquisition_uplift} class="bg-background text-xs font-mono" />
                          </div>
                        </div>
                      </div>
                    </div>
                  {/if}
                </Card>
              {/each}
            </div>
          {/if}
        </CardContent>
        <CardFooter class="border-t border-border glass-inset py-4 flex justify-between">
          <Button type="button" variant="outline" onclick={prevStep}>
            <ArrowLeft class="h-4 w-4 mr-2" /> Back
          </Button>
          <Button type="button" onclick={nextStep}>
            Next: Offerings & Rollout <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </div>

      <!-- Step 3: Rollout Offerings -->
      <div class={currentStep === 3 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-6 max-h-[60vh] overflow-y-auto">
          <!-- Pricing Plans -->
          <div class="space-y-3">
            <h3 class="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
              <CalendarRange class="h-4 w-4 mr-1.5 text-primary" /> Pricing Plans & Rollout Offsets
            </h3>
            {#if data.plans.length === 0}
              <p class="text-xs text-muted-foreground italic pl-6">No pricing plans available.</p>
            {:else}
              <div class="space-y-3 pl-6">
                {#each data.plans as plan}
                  <div class="glass-inset border border-border/40 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <label class="flex items-center space-x-3 cursor-pointer select-none">
                      <input type="checkbox" name="planIds" value={plan.id} bind:checked={selectedPlans[plan.id]} class="h-4 w-4 accent-primary rounded border-border" />
                      <div>
                        <span class="text-sm font-bold text-foreground block">{plan.name}</span>
                        {#if plan.base_price > 0}
                          <span class="text-[10px] text-muted-foreground">${plan.base_price}/user/mo</span>
                        {/if}
                      </div>
                    </label>
                    {#if selectedPlans[plan.id]}
                      <div class="flex items-center space-x-3 bg-muted/30 px-3 py-1.5 rounded border border-border/20">
                        <Label class="text-xs text-muted-foreground shrink-0">Rollout Month:</Label>
                        <input type="number" name="rollout_month_plan_{plan.id}" min="0" max={projectionMonths} bind:value={rolloutPlans[plan.id]} class="w-16 bg-background text-foreground border border-input rounded text-center text-xs py-0.5 font-mono" />
                        <span class="text-[10px] text-muted-foreground">M{rolloutPlans[plan.id]}</span>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <hr class="border-border/60" />

          <!-- Feature Packs -->
          <div class="space-y-3">
            <h3 class="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
              <CalendarRange class="h-4 w-4 mr-1.5 text-primary" /> Feature Packs & Rollout Offsets
            </h3>
            {#if data.packs.length === 0}
              <p class="text-xs text-muted-foreground italic pl-6">No feature packs available.</p>
            {:else}
              <div class="space-y-3 pl-6">
                {#each data.packs as pack}
                  <div class="glass-inset border border-border/40 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <label class="flex items-center space-x-3 cursor-pointer select-none">
                      <input type="checkbox" name="packIds" value={pack.id} bind:checked={selectedPacks[pack.id]} class="h-4 w-4 accent-primary rounded border-border" />
                      <div>
                        <span class="text-sm font-bold text-foreground block">{pack.name}</span>
                      </div>
                    </label>
                    {#if selectedPacks[pack.id]}
                      <div class="flex items-center space-x-3 bg-muted/30 px-3 py-1.5 rounded border border-border/20">
                        <Label class="text-xs text-muted-foreground shrink-0">Rollout Month:</Label>
                        <input type="number" name="rollout_month_pack_{pack.id}" min="0" max={projectionMonths} bind:value={rolloutPacks[pack.id]} class="w-16 bg-background text-foreground border border-input rounded text-center text-xs py-0.5 font-mono" />
                        <span class="text-[10px] text-muted-foreground">M{rolloutPacks[pack.id]}</span>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <hr class="border-border/60" />

          <!-- AI Services -->
          <div class="space-y-3">
            <h3 class="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
              <CalendarRange class="h-4 w-4 mr-1.5 text-primary" /> Atomic AI Services & Rollout Offsets
            </h3>
            {#if data.services.length === 0}
              <p class="text-xs text-muted-foreground italic pl-6">No AI services available.</p>
            {:else}
              <div class="space-y-3 pl-6">
                {#each data.services as service}
                  <div class="glass-inset border border-border/40 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <label class="flex items-center space-x-3 cursor-pointer select-none">
                      <input type="checkbox" name="serviceIds" value={service.id} bind:checked={selectedServices[service.id]} class="h-4 w-4 accent-primary rounded border-border" />
                      <div>
                        <span class="text-sm font-bold text-foreground block">{service.name}</span>
                      </div>
                    </label>
                    {#if selectedServices[service.id]}
                      <div class="flex items-center space-x-3 bg-muted/30 px-3 py-1.5 rounded border border-border/20">
                        <Label class="text-xs text-muted-foreground shrink-0">Rollout Month:</Label>
                        <input type="number" name="rollout_month_service_{service.id}" min="0" max={projectionMonths} bind:value={rolloutServices[service.id]} class="w-16 bg-background text-foreground border border-input rounded text-center text-xs py-0.5 font-mono" />
                        <span class="text-[10px] text-muted-foreground">M{rolloutServices[service.id]}</span>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </CardContent>

        <CardFooter class="border-t border-border glass-inset py-4 flex justify-between">
          <Button type="button" variant="outline" onclick={prevStep}>
            <ArrowLeft class="h-4 w-4 mr-2" /> Back
          </Button>
          <Button type="button" onclick={nextStep}>
            Next: OPEX & CAPEX Costs <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </div>

      <!-- Step 4: Cost Items -->
      <div class={currentStep === 4 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-5 max-h-[60vh] overflow-y-auto select-none">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider flex items-center mb-3">
            <DollarSign class="h-4 w-4 mr-1.5 text-primary" /> Map OPEX & CAPEX Expense Items
          </h3>
          {#if data.costs.length === 0}
            <p class="text-xs text-muted-foreground italic pl-6">No cost items configured.</p>
          {:else}
            <div class="space-y-3 pl-6">
              {#each data.costs as cost}
                <label class="flex items-start space-x-3 cursor-pointer p-3 glass-inset border border-border/40 rounded-lg hover:bg-foreground/5 transition duration-150">
                  <input type="checkbox" name="costIds" value={cost.id} bind:checked={selectedCosts[cost.id]} class="mt-1 h-4 w-4 accent-primary rounded border-border" />
                  <div class="flex-1 grid gap-0.5 leading-none">
                    <div class="flex justify-between items-center">
                      <span class="text-sm font-bold text-foreground">{cost.name}</span>
                      <span class="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                        ${cost.amount.toLocaleString()} ({cost.frequency})
                      </span>
                    </div>
                  </div>
                </label>
              {/each}
            </div>
          {/if}
        </CardContent>

        <CardFooter class="border-t border-border glass-inset py-4 flex justify-between">
          <Button type="button" variant="outline" onclick={prevStep}>
            <ArrowLeft class="h-4 w-4 mr-2" /> Back
          </Button>
          <Button type="button" onclick={nextStep}>
            Next: Review & Save <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </div>

      <!-- Step 5: Review & Save -->
      <div class={currentStep === 5 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {#if hasNoAiBenefit}
            <Card class="border-amber-500/30 bg-amber-500/5 p-4 select-none">
              <CardContent class="flex items-start space-x-3 text-sm p-0">
                <Info class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 class="font-bold text-amber-600 dark:text-amber-400">No AI benefit is modeled</h4>
                  <p class="text-muted-foreground mt-1 text-xs">Set AI uplift assumptions on your overrides in Step 2 to see incremental ROI. Otherwise, the scenario will generate only costs.</p>
                </div>
              </CardContent>
            </Card>
          {/if}

          {#if !previewResult}
            <p class="text-sm text-muted-foreground italic text-center py-12">Enter scenario name and selections to see review calculations.</p>
          {:else}
            <!-- Provisional KPIs -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card class="glass border p-4 flex flex-col justify-between">
                <div>
                  <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Provisional Incremental NPV</span>
                  <span class="text-lg font-mono font-black mt-1 block {previewResult.npv >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                    {formatCurrency(previewResult.npv, data.settings.currency, 0)}
                  </span>
                </div>
                <p class="text-[9px] text-muted-foreground/80 mt-1">Discounted lifetime net value</p>
              </Card>
              <Card class="glass border p-4 flex flex-col justify-between">
                <div>
                  <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Provisional IRR</span>
                  <span class="text-lg font-mono font-black mt-1 block {previewResult.irrAnnual !== null ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}">
                    {previewResult.irrAnnual !== null ? formatPercent(previewResult.irrAnnual) : 'N/A'}
                  </span>
                </div>
                <p class="text-[9px] text-muted-foreground/80 mt-1">AI internal rate of return</p>
              </Card>
              <Card class="glass border p-4 flex flex-col justify-between">
                <div>
                  <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Provisional Payback</span>
                  <span class="text-lg font-mono font-black text-cyan-600 dark:text-cyan-400 mt-1 block">
                    {previewResult.paybackMonths === 0 ? 'Immediate' : previewResult.paybackMonths === null ? 'Not within horizon' : formatMonths(previewResult.paybackMonths)}
                  </span>
                </div>
                <p class="text-[9px] text-muted-foreground/80 mt-1">Months to recover investment</p>
              </Card>
            </div>

            <!-- Mini preview chart -->
            <Card class="border border-border/40 p-4">
              <CardHeader class="p-0 pb-2 flex justify-between items-center border-b border-border/40 mb-3">
                <div>
                  <CardTitle class="text-xs font-bold text-foreground">Provisional Revenue Forecast (Preview)</CardTitle>
                  <CardDescription class="text-[9px]">With-AI Gross vs. Baseline MRR and Net Cashflow</CardDescription>
                </div>
              </CardHeader>
              <div bind:this={chartElement} class="h-[220px] w-full bg-background/5 rounded-md"></div>
            </Card>
          {/if}
        </CardContent>

        <CardFooter class="border-t border-border glass-inset py-4 flex justify-between">
          <Button type="button" variant="outline" onclick={prevStep}>
            <ArrowLeft class="h-4 w-4 mr-2" /> Back
          </Button>
          <Button type="submit">
            <Save class="h-4 w-4 mr-2" /> Calculate & Save Scenario
          </Button>
        </CardFooter>
      </div>
    </form>
  </Card>
</div>
