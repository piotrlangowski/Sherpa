<script lang="ts">
  import { onMount } from 'svelte';
  import { mode } from 'mode-watcher';
  import { formatCurrency, formatPercent, formatNumber, formatMonths } from '$lib/utils/format';
  import Button from '$lib/components/ui/button/button.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
  import Label from '$lib/components/ui/label/label.svelte';

  // Lucide Icons
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import Info from '@lucide/svelte/icons/info';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Wallet from '@lucide/svelte/icons/wallet';

  let { data } = $props();
  const scenarios = data.scenarios;

  // Selected scenarios state
  let selectedIds = $state<string[]>([]);
  let activeTab = $state<'cashflow' | 'mrr' | 'customers'>('cashflow');
  
  let chartElement: HTMLDivElement | undefined = $state();
  let chartInstance: any = null;

  // Set default selection: first two scenarios
  $effect(() => {
    if (selectedIds.length === 0 && scenarios.length >= 2) {
      selectedIds = [scenarios[0].id, scenarios[1].id];
    } else if (selectedIds.length === 0 && scenarios.length === 1) {
      selectedIds = [scenarios[0].id];
    }
  });

  // Get selected scenario objects
  const selectedScenarios = $derived(
    scenarios.filter(s => selectedIds.includes(s.id) && s.results !== null)
  );

  // Determine the best scenario for each metric (for visual highlights)
  const bestMetrics = $derived.by(() => {
    if (selectedScenarios.length < 2) return {};
    
    let maxNpvId = '';
    let maxNpv = -Infinity;

    let maxIrrId = '';
    let maxIrr = -Infinity;

    let minPaybackId = '';
    let minPayback = Infinity;

    let minTcoId = '';
    let minTco = Infinity;

    let maxRoiId = '';
    let maxRoi = -Infinity;

    selectedScenarios.forEach(s => {
      const res = s.results!;
      
      if (res.npv > maxNpv) {
        maxNpv = res.npv;
        maxNpvId = s.id;
      }
      if (res.irr_annual !== null && res.irr_annual > maxIrr) {
        maxIrr = res.irr_annual;
        maxIrrId = s.id;
      }
      if (res.payback_months !== null && res.payback_months < minPayback) {
        minPayback = res.payback_months;
        minPaybackId = s.id;
      }
      if (res.tco < minTco) {
        minTco = res.tco;
        minTcoId = s.id;
      }
      if (res.roi_percent > maxRoi) {
        maxRoi = res.roi_percent;
        maxRoiId = s.id;
      }
    });

    return { maxNpvId, maxIrrId, minPaybackId, minTcoId, maxRoiId };
  });

  // Checkbox toggling handler
  const handleToggle = (id: string, checked: boolean) => {
    if (checked) {
      if (!selectedIds.includes(id)) {
        selectedIds = [...selectedIds, id];
      }
    } else {
      selectedIds = selectedIds.filter(x => x !== id);
    }
  };

  // Derive ECharts Overlaid Timeline options
  const chartOption = $derived.by(() => {
    if (selectedScenarios.length === 0) return {};

    // Use the maximum projection horizon among selected scenarios
    const maxMonths = Math.max(...selectedScenarios.map(s => s.projection_months));
    const xAxisData = Array.from({ length: maxMonths }, (_, i) => `Month ${i}`);

    const colors = ['#38bdf8', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#ec4899'];

    const series = selectedScenarios.map((s, index) => {
      const res = s.results!;
      let rawData: number[] = [];

      if (activeTab === 'cashflow') {
        rawData = res.monthly_cashflows || [];
      } else if (activeTab === 'mrr') {
        rawData = res.monthly_mrr || [];
      } else {
        rawData = res.monthly_customers || [];
      }

      // Pad timeline with nulls if a scenario has shorter horizon than maxMonths
      const dataFilled = Array.from({ length: maxMonths }, (_, i) => {
        return i < rawData.length ? rawData[i] : null;
      });

      return {
        name: s.name,
        type: 'line',
        data: dataFilled,
        smooth: true,
        symbolSize: 4,
        lineStyle: { width: 3 },
        itemStyle: { color: colors[index % colors.length] }
      };
    });

    const isDark = mode.current === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const axisColor = isDark ? '#94a3b8' : '#64748b';
    const lineColor = isDark ? '#475569' : '#e2e8f0';
    const splitLineColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.6)';
    const tooltipBg = isDark ? '#1e293b' : '#ffffff';
    const tooltipBorder = isDark ? '#475569' : '#e2e8f0';
    const tooltipText = isDark ? '#f8fafc' : '#0f172a';

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText },
        formatter: (params: any[]) => {
          let tooltipContent = `<div class="px-2 py-1.5 text-xs font-sans select-none">
            <span class="font-bold block mb-1.5" style="color: ${textColor}">${params[0].name}</span>`;
          
          params.forEach(p => {
            const formattedVal = activeTab === 'customers' 
              ? formatNumber(Math.round(p.value))
              : formatCurrency(p.value, 'USD', 0);
              
            tooltipContent += `
              <div class="flex items-center justify-between gap-5 mt-1 font-medium">
                <span class="flex items-center" style="color: ${axisColor}">
                  <span class="inline-block h-2 w-2 rounded-full mr-2" style="background-color: ${p.color}"></span>
                  ${p.seriesName}
                </span>
                <span class="font-mono text-right font-bold" style="color: ${tooltipText}">
                  ${formattedVal}
                </span>
              </div>`;
          });

          tooltipContent += `</div>`;
          return tooltipContent;
        }
      },
      legend: {
        data: selectedScenarios.map(s => s.name),
        textStyle: { color: textColor, fontSize: 11 },
        bottom: 0
      },
      grid: { left: '3%', right: '4%', top: '5%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: { color: axisColor, fontSize: 10 },
        axisLine: { lineStyle: { color: lineColor } }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: axisColor,
          fontSize: 10,
          formatter: (value: number) => {
            if (activeTab === 'customers') return formatNumber(value);
            return `$${formatNumber(Math.round(value / 1000))}k`;
          }
        },
        axisLine: { lineStyle: { color: lineColor } },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      series
    };
  });

  function renderChart() {
    if (!chartElement || typeof window === 'undefined' || selectedScenarios.length === 0) return;

    import('echarts').then((echarts) => {
      if (chartInstance) {
        chartInstance.dispose();
      }

      chartInstance = echarts.init(chartElement);
      chartInstance.setOption(chartOption);

      const handleResize = () => {
        chartInstance?.resize();
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    });
  }

  $effect(() => {
    if ((chartOption && chartElement && selectedScenarios.length > 0) || mode.current) {
      renderChart();
    }
  });

  onMount(() => {
    renderChart();
    return () => {
      chartInstance?.dispose();
    };
  });
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="space-y-1">
    <div class="flex items-center space-x-2 text-primary">
      <ArrowLeftRight class="h-5 w-5" />
      <span class="text-xs font-bold uppercase tracking-wider">ROI Planning Tools</span>
    </div>
    <h2 class="text-2xl font-bold tracking-tight text-foreground">Scenario Comparison</h2>
    <p class="text-muted-foreground text-sm font-normal max-w-3xl leading-relaxed">
      Select multiple rollout scenarios side-by-side to analyze differences in payback horizons, Net Present Value, cash flow curves, and quantify opportunity costs.
    </p>
  </div>

  {#if scenarios.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <ArrowLeftRight class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">No Scenarios Configured</h3>
          <p class="text-sm text-muted-foreground mb-4">You need to create at least two scenarios to compare them.</p>
          <Button href="/scenarios/new">Create Scenario</Button>
        </div>
      </CardContent>
    </Card>
  {:else}
    <!-- Selector bar -->
    <Card class="border-border bg-card/45 backdrop-blur-sm select-none">
      <CardHeader class="pb-3 border-b border-border bg-black/5">
        <CardTitle class="text-sm font-bold text-foreground">Select Rollout Scenarios to Compare</CardTitle>
      </CardHeader>
      <CardContent class="p-4 flex flex-wrap gap-5">
        {#each scenarios as s}
          <label class="flex items-start space-x-3 cursor-pointer p-2.5 rounded-lg border border-border/40 hover:bg-white/5 transition duration-150 shrink-0 bg-black/10">
            <input
              type="checkbox"
              checked={selectedIds.includes(s.id)}
              disabled={selectedIds.length <= 1 && selectedIds.includes(s.id)}
              onchange={(e) => handleToggle(s.id, (e.target as HTMLInputElement).checked)}
              class="mt-1 h-4 w-4 rounded accent-primary text-primary focus:ring-primary/50"
            />
            <div>
              <span class="text-sm font-bold text-foreground block">{s.name}</span>
              {#if s.results}
                <span class="text-[10px] text-muted-foreground block mt-0.5">
                  NPV: <strong class="text-emerald-400 font-mono font-bold">${formatNumber(Math.round(s.results.npv))}</strong> • Payback: <strong class="text-cyan-400 font-mono font-bold">{s.results.payback_months !== null ? s.results.payback_months + 'm' : 'N/A'}</strong>
                </span>
              {:else}
                <span class="text-[10px] text-rose-400 font-medium italic block mt-0.5">No results (run calculations)</span>
              {/if}
            </div>
          </label>
        {/each}
      </CardContent>
    </Card>

    {#if selectedScenarios.length === 0}
      <Card class="border-dashed border-border py-12 text-center select-none bg-card/10">
        <CardContent class="flex flex-col items-center justify-center space-y-2">
          <AlertCircle class="h-6 w-6 text-muted-foreground" />
          <p class="text-sm text-muted-foreground">Select at least one scenario with calculated results to show comparison data.</p>
        </CardContent>
      </Card>
    {:else}
      <!-- Side-by-side KPI grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- Overlaid visual chart -->
        <Card class="border-border bg-card/35 backdrop-blur-sm shadow-sm flex flex-col justify-between md:col-span-2">
          <CardHeader class="pb-2 border-b border-border bg-black/5 flex flex-row items-center justify-between">
            <div>
              <CardTitle class="text-base font-bold text-foreground">Timeline Comparison Curves</CardTitle>
              <CardDescription class="text-xs">Overlaid cash flows and customer timelines.</CardDescription>
            </div>

            <!-- Tab Toggles -->
            <div class="flex items-center space-x-1 bg-black/30 p-0.5 rounded border border-border/40 text-[10px] uppercase font-bold tracking-wider">
              <button
                class="px-2 py-1 rounded transition {activeTab === 'cashflow' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
                onclick={() => activeTab = 'cashflow'}
              >
                Net Cashflow
              </button>
              <button
                class="px-2 py-1 rounded transition {activeTab === 'mrr' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
                onclick={() => activeTab = 'mrr'}
              >
                MRR
              </button>
              <button
                class="px-2 py-1 rounded transition {activeTab === 'customers' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
                onclick={() => activeTab = 'customers'}
              >
                Customers
              </button>
            </div>
          </CardHeader>

          <CardContent class="p-4 bg-background/5">
            <div bind:this={chartElement} class="h-[360px] w-full"></div>
          </CardContent>
        </Card>

        <!-- KPI Table Card -->
        <Card class="border-border bg-card/35 backdrop-blur-sm shadow-sm flex flex-col justify-between {selectedScenarios.length === 2 ? 'lg:col-span-2' : 'md:col-span-2'}">
          <CardHeader class="pb-2 border-b border-border bg-black/5">
            <CardTitle class="text-base font-bold text-foreground">Indicator Matrix</CardTitle>
            <CardDescription class="text-xs">Side-by-side financial metric comparison. Bold green values indicate the best performer.</CardDescription>
          </CardHeader>
          <CardContent class="p-0">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-black/10 border-b border-border font-semibold text-muted-foreground">
                    <th class="p-3">Scenario Name</th>
                    <th class="p-3 text-right">Horizon</th>
                    <th class="p-3 text-right">Discount Rate</th>
                    <th class="p-3 text-right">NPV</th>
                    <th class="p-3 text-right">IRR (Annual)</th>
                    <th class="p-3 text-right">Payback Period</th>
                    <th class="p-3 text-right">TCO</th>
                    <th class="p-3 text-right">ROI (%)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border/60">
                  {#each selectedScenarios as s}
                    {@const res = s.results!}
                    <tr class="hover:bg-white/5 transition-all duration-150">
                      <td class="p-3 font-bold text-foreground truncate max-w-[150px]">{s.name}</td>
                      <td class="p-3 text-right font-mono text-muted-foreground">{s.projection_months}m</td>
                      <td class="p-3 text-right font-mono text-muted-foreground">{formatPercent(s.discount_rate)}</td>
                      
                      <!-- NPV -->
                      <td class="p-3 text-right font-mono font-bold {bestMetrics.maxNpvId === s.id && selectedScenarios.length >= 2 ? 'text-emerald-400 font-extrabold' : ''}">
                        {formatCurrency(res.npv, 'USD', 0)}
                      </td>
                      
                      <!-- IRR -->
                      <td class="p-3 text-right font-mono font-bold {bestMetrics.maxIrrId === s.id && selectedScenarios.length >= 2 ? 'text-emerald-400 font-extrabold' : ''}">
                        {res.irr_annual !== null ? formatPercent(res.irr_annual) : 'N/A'}
                      </td>

                      <!-- Payback -->
                      <td class="p-3 text-right font-mono font-bold {bestMetrics.minPaybackId === s.id && selectedScenarios.length >= 2 ? 'text-emerald-400 font-extrabold' : ''}">
                        {formatMonths(res.payback_months)}
                      </td>

                      <!-- TCO -->
                      <td class="p-3 text-right font-mono font-bold {bestMetrics.minTcoId === s.id && selectedScenarios.length >= 2 ? 'text-emerald-400 font-extrabold' : ''}">
                        {formatCurrency(res.tco, 'USD', 0)}
                      </td>

                      <!-- ROI -->
                      <td class="p-3 text-right font-mono font-bold {bestMetrics.maxRoiId === s.id && selectedScenarios.length >= 2 ? 'text-emerald-400 font-extrabold' : ''}">
                        {formatPercent(res.roi_percent)}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <!-- Opportunity Cost Card (Only shown if exactly two scenarios selected) -->
        {#if selectedScenarios.length === 2}
          {@const sA = selectedScenarios[0]}
          {@const sB = selectedScenarios[1]}
          {@const rA = sA.results!}
          {@const rB = sB.results!}
          
          <Card class="border-border bg-card/35 backdrop-blur-sm shadow-sm flex flex-col justify-between">
            <CardHeader class="pb-2 border-b border-border bg-black/5">
              <CardTitle class="text-base font-bold text-foreground">Opportunity Cost Analysis</CardTitle>
              <CardDescription class="text-xs">Delta metrics showing incremental value of choosing one scenario over the other.</CardDescription>
            </CardHeader>
            <CardContent class="py-4 space-y-4 text-xs select-none leading-relaxed">
              {#if Math.abs(rA.npv - rB.npv) < 0.1}
                <div class="flex items-center space-x-2 text-muted-foreground p-3 rounded-lg bg-black/10 border border-border/40">
                  <Info class="h-5 w-5 text-primary shrink-0" />
                  <p>Both scenarios generate identical Net Present Value ({formatCurrency(rA.npv, 'USD', 0)}).</p>
                </div>
              {:else}
                {@const betterSc = rA.npv > rB.npv ? sA : sB}
                {@const worseSc = rA.npv > rB.npv ? sB : sA}
                {@const rBetter = betterSc.results!}
                {@const rWorse = worseSc.results!}
                {@const deltaNpv = rBetter.npv - rWorse.npv}
                {@const deltaTco = rBetter.tco - rWorse.tco}

                <div class="space-y-3.5">
                  <div class="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-start space-x-2.5">
                    <Sparkles class="h-5 w-5 mt-0.5 shrink-0 animate-pulse" />
                    <div>
                      <h4 class="font-bold text-foreground">Recommended Selection: {betterSc.name}</h4>
                      <p class="text-muted-foreground mt-1">
                        Choosing <strong class="text-foreground">{betterSc.name}</strong> instead of <strong class="text-foreground">{worseSc.name}</strong> delivers an additional <strong class="text-emerald-400 font-mono font-extrabold">{formatCurrency(deltaNpv, 'USD', 0)}</strong> in discounted net value (NPV) to the organization.
                      </p>
                    </div>
                  </div>

                  <!-- Delta metrics list -->
                  <div class="space-y-1.5 pl-2 border-l border-border/80">
                    <div class="flex justify-between items-center text-muted-foreground">
                      <span>NPV Increase (Delta NPV):</span>
                      <strong class="text-emerald-400 font-mono font-bold">+{formatCurrency(deltaNpv, 'USD', 0)}</strong>
                    </div>

                    <div class="flex justify-between items-center text-muted-foreground">
                      <span>Investment Cost Delta (Delta TCO):</span>
                      <strong class="font-mono font-bold {deltaTco >= 0 ? 'text-rose-400' : 'text-emerald-400'}">
                        {deltaTco >= 0 ? '+' : ''}{formatCurrency(deltaTco, 'USD', 0)}
                      </strong>
                    </div>

                    {#if rBetter.irr_annual !== null && rWorse.irr_annual !== null}
                      <div class="flex justify-between items-center text-muted-foreground">
                        <span>Hurdle Rate Cushion (Delta IRR):</span>
                        <strong class="text-emerald-400 font-mono font-bold">+{formatPercent(rBetter.irr_annual - rWorse.irr_annual)}</strong>
                      </div>
                    {/if}
                    
                    {#if rBetter.payback_months !== null && rWorse.payback_months !== null}
                      {@const paybackDiff = rBetter.payback_months - rWorse.payback_months}
                      <div class="flex justify-between items-center text-muted-foreground">
                        <span>Payback Speed Diff:</span>
                        <strong class="font-mono font-bold {paybackDiff <= 0 ? 'text-emerald-400' : 'text-amber-400'}">
                          {paybackDiff <= 0 ? '' : '+'}{paybackDiff.toFixed(1)} months
                        </strong>
                      </div>
                    {/if}
                  </div>

                  <div class="p-3 rounded bg-black/10 border border-border/40 flex items-start space-x-2 text-[10px] text-muted-foreground">
                    <AlertCircle class="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p>The **opportunity cost** of implementing {worseSc.name} instead of {betterSc.name} is {formatCurrency(deltaNpv, 'USD', 0)}. Ensure the qualitative benefits of {worseSc.name} (e.g. strategic alignment, brand equity) exceed this financial deficit.</p>
                  </div>
                </div>
              {/if}
            </CardContent>
          </Card>
        {/if}
      </div>
    {/if}
  {/if}
</div>
