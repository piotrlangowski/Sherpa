<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount, tick } from 'svelte';
  import { formatCurrency, formatPercent, formatMonths, formatNumber } from '$lib/utils/format';
  import Button from '$lib/components/ui/button/button.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  // Lucide Icons
  import Compass from '@lucide/svelte/icons/compass';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Percent from '@lucide/svelte/icons/percent';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Info from '@lucide/svelte/icons/info';
  import Users2 from '@lucide/svelte/icons/users-2';
  import Wallet from '@lucide/svelte/icons/wallet';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Edit2 from '@lucide/svelte/icons/edit-2';
  import ExportButton from '$lib/components/dashboard/ExportButton.svelte';

  import { appState } from '$lib/stores/app.svelte';
  import { mode } from 'mode-watcher';

  let { data } = $props();
  const scenario = $derived(data.scenario);
  const results = $derived(data.results);
  const timeline = $derived(data.timeline);
  const scopeSummary = $derived(data.scopeSummary);
  const resolvedConfigs = $derived(data.resolvedConfigs || []);

  const hasNoAiBenefit = $derived(
    timeline && timeline.length > 0 ? timeline.every((t: any) => Math.abs(t.revenue) < 0.01) : true
  );

  $effect(() => {
    if (scenario) {
      appState.setActiveScenario(scenario.id, scenario.name);
    }
  });

  // Chart state
  let activeTab = $state<'cashflow' | 'cumulative' | 'users'>('cashflow');
  let chartElement: HTMLDivElement | undefined = $state();
  let chartInstance: any = null;
  let resizeListener: (() => void) | null = null;
  let isMounted = false;
  let isExplainerOpen = $state(false);

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

  // Derive ECharts Options based on timeline data
  const chartOptions = $derived.by(() => {
    if (!timeline || timeline.length === 0) return {};

    const isDark = mode.current === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const axisColor = isDark ? '#94a3b8' : '#64748b';
    const lineColor = isDark ? '#475569' : '#e2e8f0';
    const splitLineColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.6)';
    const tooltipBg = isDark ? '#1e293b' : '#ffffff';
    const tooltipBorder = isDark ? '#475569' : '#e2e8f0';
    const tooltipText = isDark ? '#f8fafc' : '#0f172a';

    const monthsLabel = timeline.map((t: any) => `Month ${t.month}`);
    const hasMonetization = timeline.some((t: any) => (t.monetizationRevenue ?? 0) > 0);

    const cashflow = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText }
      },
      legend: {
        data: [...(hasMonetization ? ['AI Monetization'] : []), 'Gross MRR', 'Baseline MRR', 'OPEX Costs', 'CAPEX Costs', 'AI Token Costs', 'Net Cashflow'],
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
          formatter: (value: number) => formatCurrency(value, appState.currency, 0)
        },
        axisLine: { lineStyle: { color: lineColor } },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      series: [
        {
          name: 'Baseline MRR',
          type: 'line',
          data: timeline.map((t: any) => t.baselineRevenue),
          itemStyle: { color: '#94a3b8' },
          lineStyle: { width: 2, type: 'dashed' },
          symbolSize: 4
        },
        {
          name: 'Gross MRR',
          type: 'line',
          data: timeline.map((t: any) => t.grossRevenue),
          itemStyle: { color: '#10b981' },
          lineStyle: { width: 3 },
          symbolSize: 4
        },
        ...(hasMonetization ? [{
          name: 'AI Monetization',
          type: 'line',
          data: timeline.map((t: any) => t.monetizationRevenue),
          itemStyle: { color: '#a855f7' },
          lineStyle: { width: 2 },
          symbolSize: 4
        }] : []),
        {
          name: 'Baseline MRR Area Helper',
          type: 'line',
          stack: 'mrr_shading',
          data: timeline.map((t: any) => t.baselineRevenue),
          lineStyle: { width: 0 },
          showSymbol: false,
          tooltip: { show: false },
          areaStyle: { opacity: 0 }
        },
        {
          name: 'Gross MRR Area Helper',
          type: 'line',
          stack: 'mrr_shading',
          data: timeline.map((t: any) => t.revenue),
          lineStyle: { width: 0 },
          showSymbol: false,
          tooltip: { show: false },
          areaStyle: { color: 'rgba(16, 185, 129, 0.15)' }
        },
        {
          name: 'OPEX Costs',
          type: 'bar',
          stack: 'costs',
          data: timeline.map((t: any) => t.opex),
          itemStyle: { color: '#f59e0b' }
        },
        {
          name: 'CAPEX Costs',
          type: 'bar',
          stack: 'costs',
          data: timeline.map((t: any) => t.capex),
          itemStyle: { color: '#ef4444' }
        },
        {
          name: 'AI Token Costs',
          type: 'bar',
          stack: 'costs',
          data: timeline.map((t: any) => t.tokenCosts),
          itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] }
        },
        {
          name: 'Net Cashflow',
          type: 'line',
          data: timeline.map((t: any) => t.netCashFlow),
          itemStyle: { color: '#38bdf8' },
          lineStyle: { width: 3 },
          symbolSize: 6
        }
      ]
    };

    const cumulative = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText },
        formatter: (params: any) => {
          const p = params[0];
          return `<div class="px-2 py-1 select-none text-xs">
            <span class="text-muted-foreground">${p.name}</span><br/>
            <span class="font-bold text-foreground">Cumulative: ${formatCurrency(p.value, appState.currency)}</span>
          </div>`;
        }
      },
      grid: { left: '3%', right: '4%', top: '10%', bottom: '8%', containLabel: true },
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
          formatter: (value: number) => formatCurrency(value, appState.currency, 0)
        },
        axisLine: { lineStyle: { color: lineColor } },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      series: [
        {
          name: 'Cumulative Cash Flow',
          type: 'line',
          data: timeline.map((t: any) => t.cumulativeCashFlow),
          smooth: true,
          lineStyle: { width: 3.5, color: '#06b6d4' },
          symbolSize: 4,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(6, 182, 212, 0.35)' },
                { offset: 1, color: 'rgba(6, 182, 212, 0)' }
              ]
            }
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
            data: [{ yAxis: 0 }]
          }
        }
      ]
    };

    const users = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText }
      },
      legend: {
        data: ['Active Customers', 'AI-Adopting Users', 'Baseline Customers'],
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
        axisLabel: { color: axisColor, fontSize: 10 },
        axisLine: { lineStyle: { color: lineColor } },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      series: [
        {
          name: 'Active Customers',
          type: 'line',
          smooth: true,
          data: timeline.map((t: any) => t.customers),
          itemStyle: { color: '#3b82f6' },
          lineStyle: { width: 2.5 }
        },
        {
          name: 'AI-Adopting Users',
          type: 'line',
          smooth: true,
          data: timeline.map((t: any) => t.aiUsers),
          itemStyle: { color: '#8b5cf6' },
          lineStyle: { width: 2.5, type: 'dashed' }
        },
        {
          name: 'Baseline Customers',
          type: 'line',
          smooth: true,
          data: timeline.map((t: any) => t.baselineCustomers),
          itemStyle: { color: '#94a3b8' },
          lineStyle: { width: 2, type: 'dashed' }
        }
      ]
    };

    return { cashflow, cumulative, users };
  });

  function renderChart() {
    if (!chartElement) return;

    tick().then(() => {
      import('echarts').then((echarts) => {
        if (!isMounted || !chartElement) return;
        
        const options = chartOptions as any;
        let selectedOption = options.cashflow;
        if (activeTab === 'cumulative') {
          selectedOption = options.cumulative;
        } else if (activeTab === 'users') {
          selectedOption = options.users;
        }

        if (chartInstance) {
          chartInstance.setOption(selectedOption, true);
        } else {
          chartInstance = echarts.init(chartElement);
          chartInstance.setOption(selectedOption, true);
          resizeListener = () => {
            chartInstance?.resize();
          };
          window.addEventListener('resize', resizeListener);
        }
      });
    });
  }

  $effect(() => {
    const _options = chartOptions; // Synchronous read registers dependency
    if (activeTab || timeline || mode.current) {
      renderChart();
    }
  });

  onMount(() => {
    isMounted = true;
    renderChart();
    return () => {
      isMounted = false;
      cleanupChart();
    };
  });
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="space-y-1">
      <div class="flex items-center space-x-2 text-primary">
        <Compass class="h-5 w-5" />
        <span class="text-xs font-bold uppercase tracking-wider">Scenario Projections</span>
      </div>
      <h2 class="text-2xl font-bold tracking-tight text-foreground">{scenario.name}</h2>
      {#if scenario.description}
        <p class="text-muted-foreground text-sm font-normal max-w-2xl">{scenario.description}</p>
      {/if}
    </div>

    <!-- Actions -->
    <div class="flex items-center space-x-2 shrink-0">
      <ExportButton scenarioId={scenario.id} elementId="scenario-dashboard-container" filename="sherpa-scenario-{scenario.name.toLowerCase().replace(/\s+/g, '-')}" />
      <Button href="/scenarios/{scenario.id}/edit" variant="outline">
        <Edit2 class="h-4 w-4 mr-2" /> Edit Scenario
      </Button>
      <Button href="/scenarios/{scenario.id}/sensitivity" variant="outline">
        <TrendingUp class="h-4 w-4 mr-2" /> Run Sensitivity
      </Button>
      <form method="POST" action="?/deleteScenario" use:enhance class="inline-block">
        <Button type="submit" variant="outline" class="text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground">
          <Trash2 class="h-4 w-4 mr-2" /> Delete Scenario
        </Button>
      </form>
    </div>
  </div>

  {#if scopeSummary}
    <div class="glass border border-border px-4 py-2.5 rounded-lg flex items-center space-x-2 text-xs select-none">
      <Users2 class="h-4 w-4 text-primary shrink-0" />
      <span class="text-muted-foreground font-semibold">Scope Targeting:</span>
      <Badge variant="outline" class="glass-inset py-0.5 px-2 capitalize font-semibold">
        {scenario.scope_type.replace('_', ' ')}
      </Badge>
      <span class="text-muted-foreground font-medium">➔</span>
      <span class="text-foreground font-bold">{scopeSummary.cohortsCount} {scopeSummary.cohortsCount === 1 ? 'Cohort' : 'Cohorts'}</span>
      <span class="text-muted-foreground/60">•</span>
      <span class="text-foreground font-bold">~{formatNumber(scopeSummary.totalUsers)} users</span>
    </div>
  {/if}

  {#if !results}
    <Card class="border-dashed border-destructive/30 bg-destructive/5 p-6 select-none">
      <CardContent class="flex items-start space-x-3 text-sm">
        <Info class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h4 class="font-bold text-destructive">Calculation Failure</h4>
          <p class="text-muted-foreground mt-1 leading-relaxed">Could not execute financial models. This usually happens if the linked Customer Cohort is deleted or contains division-by-zero configuration rules.</p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <div id="scenario-dashboard-container" class="space-y-6">
      {#if hasNoAiBenefit}
        <Card class="border-amber-500/30 bg-amber-500/5 p-4 select-none">
          <CardContent class="flex items-start space-x-3 text-sm p-0">
            <Info class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 class="font-bold text-amber-600 dark:text-amber-400">No AI benefit is modeled</h4>
              <p class="text-muted-foreground mt-1 text-xs">No AI benefit is modeled — set uplift assumptions on cohorts or scenario overrides.</p>
            </div>
          </CardContent>
        </Card>
      {/if}

      <!-- KPI widgets grid -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <!-- NPV -->
        <Card class="glass border glass-glow [--glow-color:var(--color-emerald-500)] select-none p-4 flex flex-col justify-between">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Incremental NPV</span>
            <CardTitle class="text-xl font-black mt-2 block {results.npv >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
              {formatCurrency(results.npv, appState.currency, 0)}
            </CardTitle>
          </div>
          <div class="text-[10px] text-muted-foreground/80 mt-1">Discounted lifetime net value</div>
        </Card>

        <!-- IRR -->
        <Card class="glass border glass-glow [--glow-color:var(--primary)] select-none p-4 flex flex-col justify-between">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">IRR on AI Investment</span>
            <span class="text-xl font-black mt-2 block {results.irr_annual !== null && results.irr_annual >= scenario.discount_rate ? 'text-emerald-600 dark:text-emerald-400' : results.irr_annual !== null ? 'text-amber-400' : 'text-muted-foreground'}">
              {results.irr_annual !== null ? formatPercent(results.irr_annual) : 'N/A'}
            </span>
          </div>
          <div class="text-[10px] text-muted-foreground/80 mt-1">
            Hurdle rate: {formatPercent(scenario.discount_rate)}
          </div>
        </Card>

        <!-- Payback Period -->
        <Card class="glass border glass-glow [--glow-color:var(--color-cyan-500)] select-none p-4 flex flex-col justify-between">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Payback Period</span>
            <span class="text-xl font-black text-cyan-600 dark:text-cyan-400 mt-2 block">
              {results.payback_months === 0 ? 'Immediate' : results.payback_months === null ? 'Not within horizon' : formatMonths(results.payback_months)}
            </span>
          </div>
          <div class="text-[10px] text-muted-foreground/80 mt-1">Months to recover investment</div>
        </Card>

        <!-- TCO -->
        <Card class="glass border glass-glow [--glow-color:var(--primary)] select-none p-4 flex flex-col justify-between">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">TCO (T-Horizon)</span>
            <CardTitle class="text-xl font-black text-foreground mt-2 block">
              {formatCurrency(results.tco, appState.currency, 0)}
            </CardTitle>
          </div>
          <div class="text-[10px] text-muted-foreground/80 mt-1">Capex + opex + token totals</div>
        </Card>

        <!-- ROI% -->
        <Card class="glass border glass-glow [--glow-color:var(--color-emerald-500)] select-none p-4 flex flex-col justify-between col-span-2 lg:col-span-1">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Return on Investment</span>
            <span class="text-xl font-black mt-2 block {results.roi_percent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
              {formatPercent(results.roi_percent)}
            </span>
          </div>
          <div class="text-[10px] text-muted-foreground/80 mt-1">Net gain relative to total costs</div>
        </Card>
      </div>

    <!-- Charts & Offering breakdown -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Visual Projections -->
      <Card class="border-border lg:col-span-2 glass border flex flex-col justify-between">
        <CardHeader class="pb-2 border-b border-border glass-inset flex flex-row items-center justify-between">
          <div>
            <CardTitle class="text-base font-bold text-foreground">Forecast Timeline Visualization</CardTitle>
            <CardDescription class="text-xs">Interactive cashflow and customer graphs.</CardDescription>
          </div>

          <!-- Chart Toggle Tabs -->
          <div class="flex items-center space-x-1 bg-black/30 p-0.5 rounded border border-border/40 text-[10px] uppercase font-bold tracking-wider">
            <button
              class="px-2 py-1 rounded transition {activeTab === 'cashflow' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => activeTab = 'cashflow'}
            >
              Cashflow
            </button>
            <button
              class="px-2 py-1 rounded transition {activeTab === 'cumulative' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => activeTab = 'cumulative'}
            >
              ROI Area
            </button>
            <button
              class="px-2 py-1 rounded transition {activeTab === 'users' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => activeTab = 'users'}
            >
              Adoption
            </button>
          </div>
        </CardHeader>

        <CardContent class="p-4 bg-background/5">
          {#if timeline.length === 0}
            <div class="h-[360px] flex items-center justify-center text-sm text-muted-foreground italic">
              No cashflow data available.
            </div>
          {:else}
            <div bind:this={chartElement} class="h-[360px] w-full"></div>
          {/if}
        </CardContent>
      </Card>

      <!-- Sideline configuration breakdown -->
      <Card class="border-border glass border flex flex-col justify-between">
        <CardHeader class="pb-3 border-b border-border glass-inset select-none">
          <CardTitle class="text-base font-bold text-foreground">Scenario Configuration</CardTitle>
          <CardDescription>Setup details, rollout dates, and expenses.</CardDescription>
        </CardHeader>

        <CardContent class="py-4 space-y-5 overflow-y-auto max-h-[390px] select-none text-xs">
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
                <div class="mt-2 text-xs">
                  <div class="mb-1 text-amber-500 font-bold">Parameter Overrides Applied:</div>
                  <div class="space-y-1">
                    {#each scenario.scope_overrides as ov}
                      <div class="bg-muted/40 p-1.5 rounded text-[10px]">
                        <strong>{ov.target_type === 'all_clients' ? 'Global Base' : ov.target_id}</strong>
                        <div class="grid grid-cols-2 gap-x-2">
                          {#if ov.arpu_override !== null}<span>ARPU: {formatCurrency(ov.arpu_override, appState.currency, 0)}</span>{/if}
                          {#if ov.monthly_churn_rate !== null}<span>Churn: {ov.monthly_churn_rate * 100}%</span>{/if}
                          {#if ov.ai_adoption_rate !== null}<span>Adoption: {ov.ai_adoption_rate * 100}%</span>{/if}
                          {#if ov.monthly_acquisition !== null}<span>Acq: {ov.monthly_acquisition}/mo</span>{/if}
                          {#if ov.arpu_uplift !== null && ov.arpu_uplift !== undefined}<span>AI ARPU Up ($): {formatCurrency(ov.arpu_uplift, appState.currency, 0)}</span>{/if}
                          {#if ov.arpu_uplift_percent !== null && ov.arpu_uplift_percent !== undefined}<span>AI ARPU Up (%): {ov.arpu_uplift_percent * 100}%</span>{/if}
                          {#if ov.churn_reduction !== null && ov.churn_reduction !== undefined}<span>AI Churn Red: {ov.churn_reduction * 100}%</span>{/if}
                          {#if ov.acquisition_uplift !== null && ov.acquisition_uplift !== undefined}<span>AI Acq Up: {ov.acquisition_uplift * 100}%</span>{/if}
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
        </CardContent>

        <!-- Help Info -->
        <CardFooter class="border-t border-border glass-inset py-3 select-none flex items-start space-x-2 text-[10px] text-muted-foreground">
          <Info class="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
          <p>Discounting is calculated on a monthly compounding basis. Projections assume linear rollout starting points matching the specified month offsets.</p>
        </CardFooter>
      </Card>
    </div>
    </div>

    <!-- Explainer Card -->
    <div class="mt-6">
      <div class="glass border border-border rounded-lg overflow-hidden">
        <button
          type="button"
          class="w-full flex items-center justify-between p-4 font-bold text-sm bg-muted/20 hover:bg-muted/40 transition select-none text-left"
          onclick={() => isExplainerOpen = !isExplainerOpen}
        >
          <div class="flex items-center space-x-2">
            <Info class="h-4 w-4 text-primary" />
            <span>How this is calculated (Cohort ROI Methodology)</span>
          </div>
          <span class="text-xs text-muted-foreground font-semibold">{isExplainerOpen ? 'Hide' : 'Show Details'}</span>
        </button>

        {#if isExplainerOpen}
          <div class="p-4 border-t border-border space-y-4 text-xs leading-relaxed text-muted-foreground bg-background/5">
            <p>
              Sherpa uses a counterfactual <strong>cohort-based adopter/non-adopter split</strong> model.
              Instead of applying a blended average to the entire group, the target population is partitioned into two distinct sub-cohorts at the start.
            </p>

            {#each resolvedConfigs || [] as cc}
              {@const a = cc.ai_adoption_rate || 0}
              {@const acqUplift = cc.acquisition_uplift || 0}
              {@const churnRed = cc.churn_reduction || 0}
              {@const arpuUp = cc.arpu_uplift || 0}
              {@const arpuUpPct = cc.arpu_uplift_percent || 0}
              
              {@const startAdopters = Math.round(cc.current_users * a)}
              {@const startNonAdopters = Math.round(cc.current_users * (1 - a))}
              
              {@const baseAcq = cc.monthly_acquisition || 0}
              {@const withAiAcq = baseAcq * (1 + acqUplift)}
              {@const adopterAcq = withAiAcq * a}
              {@const nonAdopterAcq = withAiAcq * (1 - a)}
              
              {@const baseChurn = cc.monthly_churn_rate || 0}
              {@const adopterChurn = baseChurn * (1 - churnRed)}
              
              {@const baseArpu = cc.base_arpu || 0}
              {@const adopterArpu = baseArpu * (1 + arpuUpPct) + arpuUp}
              
              {@const m0AdopterRev = startAdopters * adopterArpu}
              {@const m0NonAdopterRev = startNonAdopters * baseArpu}
              {@const m0BaseRev = cc.current_users * baseArpu}
              {@const m0Net = m0AdopterRev + m0NonAdopterRev - m0BaseRev}

              <div class="bg-muted/30 border border-border/50 rounded-lg p-3 space-y-3">
                <h4 class="font-bold text-foreground text-sm flex items-center justify-between">
                  <span>Cohort: {cc.name}</span>
                  <Badge variant="secondary" class="text-[10px]">ai_adoption_rate: {formatPercent(a)}</Badge>
                </h4>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <span class="font-semibold text-foreground block text-[10px] uppercase tracking-wider">Sub-Cohort Partitioning</span>
                    <ul class="list-disc list-inside space-y-1">
                      <li><strong>AI Adopters ({formatPercent(a)}):</strong> Starts with <span class="text-foreground font-bold">{formatNumber(startAdopters)}</span> customers.</li>
                      <li><strong>Non-Adopters ({formatPercent(1 - a)}):</strong> Starts with <span class="text-foreground font-bold">{formatNumber(startNonAdopters)}</span> customers.</li>
                    </ul>
                  </div>

                  <div class="space-y-1.5">
                    <span class="font-semibold text-foreground block text-[10px] uppercase tracking-wider">Acquisition (Monthly Signups)</span>
                    <ul class="list-disc list-inside space-y-1">
                      <li><strong>Baseline:</strong> <span class="text-foreground font-semibold">{formatNumber(baseAcq)}</span> signups/mo.</li>
                      <li><strong>With-AI:</strong> <span class="text-foreground font-semibold">{formatNumber(withAiAcq)}</span> signups/mo (+{formatPercent(acqUplift)} uplift).</li>
                      <li class="pl-4 text-[11px] list-none">➔ <span class="text-foreground font-medium">{formatNumber(adopterAcq)}</span>/mo Adopters, <span class="text-foreground font-medium">{formatNumber(nonAdopterAcq)}</span>/mo Non-Adopters.</li>
                    </ul>
                  </div>

                  <div class="space-y-1.5">
                    <span class="font-semibold text-foreground block text-[10px] uppercase tracking-wider">Retention & Churn</span>
                    <ul class="list-disc list-inside space-y-1">
                      <li><strong>Non-Adopters & Baseline:</strong> <span class="text-foreground font-semibold">{formatPercent(baseChurn)}</span> monthly churn rate.</li>
                      <li><strong>AI Adopters:</strong> <span class="text-foreground font-semibold">{formatPercent(adopterChurn)}</span> monthly churn rate ({formatPercent(churnRed)} reduction).</li>
                    </ul>
                  </div>

                  <div class="space-y-1.5">
                    <span class="font-semibold text-foreground block text-[10px] uppercase tracking-wider">ARPU (Average Revenue Per User)</span>
                    <ul class="list-disc list-inside space-y-1">
                      <li><strong>Non-Adopters & Baseline:</strong> <span class="text-foreground font-semibold">{formatCurrency(baseArpu, appState.currency, 2)}</span>/mo.</li>
                      <li><strong>AI Adopters:</strong> <span class="text-foreground font-semibold">{formatCurrency(adopterArpu, appState.currency, 2)}</span>/mo (Includes {arpuUpPct > 0 ? `+${formatPercent(arpuUpPct)}` : ''}{arpuUp > 0 ? ` +${formatCurrency(arpuUp, appState.currency, 2)}` : ''} uplift).</li>
                    </ul>
                  </div>
                </div>

                <div class="border-t border-border/40 pt-2.5 mt-2 bg-muted/20 p-2 rounded">
                  <span class="font-semibold text-foreground block text-[10px] uppercase tracking-wider mb-1">Month 0 Revenue Hand-Check</span>
                  <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>Adopters MRR: <span class="font-mono font-bold text-foreground">{formatCurrency(m0AdopterRev, appState.currency, 0)}</span></div>
                    <div>Non-Adopters MRR: <span class="font-mono font-bold text-foreground">{formatCurrency(m0NonAdopterRev, appState.currency, 0)}</span></div>
                    <div>Baseline MRR: <span class="font-mono font-bold text-foreground">{formatCurrency(m0BaseRev, appState.currency, 0)}</span></div>
                    <div class="text-emerald-600 dark:text-emerald-400 font-bold">Net Incremental MRR: <span class="font-mono">{formatCurrency(m0Net, appState.currency, 0)}</span></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
