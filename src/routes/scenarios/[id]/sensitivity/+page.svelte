<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { mode } from 'mode-watcher';
  import { formatCurrency, formatPercent, formatNumber, formatMonths, getCurrencySymbol } from '$lib/utils/format';
  import { appState } from '$lib/stores/app.svelte';
  import { CURRENCIES } from '$lib/utils/constants';
  import Button from '$lib/components/ui/button/button.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Table from '$lib/components/ui/table/table.svelte';
  import TableHeader from '$lib/components/ui/table/table-header.svelte';
  import TableRow from '$lib/components/ui/table/table-row.svelte';
  import TableHead from '$lib/components/ui/table/table-head.svelte';
  import TableBody from '$lib/components/ui/table/table-body.svelte';
  import TableCell from '$lib/components/ui/table/table-cell.svelte';

  // Lucide Icons
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Info from '@lucide/svelte/icons/info';

  let { data } = $props();
  let scenario = $derived(data.scenario);
  let sensitivityData = $derived(data.sensitivityData);
  let variationPct = $derived(data.variationPct);

  let chartElement: HTMLDivElement | undefined = $state();
  let chartInstance: any = null;
  let resizeListener: (() => void) | null = null;
  let isMounted = false;

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

  // Compute ECharts option for Tornado Chart
  const chartOption = $derived.by(() => {
    if (!sensitivityData || sensitivityData.results.length === 0) return {};

    const baseNpv = sensitivityData.baseNpv;
    
    // Reverse arrays so standard ECharts vertical category rendering lists largest impact at top
    const resultsCopy = [...sensitivityData.results].reverse();
    const categories = resultsCopy.map(r => r.parameter);

    // Deviation of low parameter value NPV from base case
    const lowDeviation = resultsCopy.map(r => r.lowNpv - baseNpv);
    // Deviation of high parameter value NPV from base case
    const highDeviation = resultsCopy.map(r => r.highNpv - baseNpv);

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
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText },
        formatter: (params: any[]) => {
          let tooltipContent = `<div class="px-2 py-1.5 text-xs font-sans select-none">
            <span class="font-bold block mb-1.5" style="color: ${textColor}">${params[0].name}</span>`;
          
          params.forEach(p => {
            const resultItem = resultsCopy.find(r => r.parameter === p.name);
            if (!resultItem) return;

            const isLowSeries = p.seriesIndex === 0;
            const actualNpv = isLowSeries ? resultItem.lowNpv : resultItem.highNpv;
            const valText = isLowSeries ? resultItem.lowValueText : resultItem.highValueText;
            const directionText = isLowSeries ? `Reduced (${valText})` : `Increased (${valText})`;
            const deviationText = p.value >= 0 ? `+${formatCurrency(p.value, appState.currency, 0)}` : formatCurrency(p.value, appState.currency, 0);
            const color = p.color;

            tooltipContent += `
              <div class="flex items-center justify-between gap-5 mt-1 font-medium">
                <span class="flex items-center" style="color: ${axisColor}">
                  <span class="inline-block h-2 w-2 rounded-full mr-2" style="background-color: ${color}"></span>
                  ${directionText}
                </span>
                <span class="font-mono text-right font-bold" style="color: ${tooltipText}">
                  ${formatCurrency(actualNpv, appState.currency, 0)} <span class="text-[10px]" style="color: ${textColor}">(${deviationText})</span>
                </span>
              </div>`;
          });

          tooltipContent += `</div>`;
          return tooltipContent;
        }
      },
      legend: {
        data: [`Decreased Param (-${variationPct}%)`, `Increased Param (+${variationPct}%)`],
        textStyle: { color: textColor, fontSize: 11 },
        bottom: 0
      },
      grid: { left: '3%', right: '4%', top: '5%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: {
          color: axisColor,
          fontSize: 10,
          formatter: (value: number) => {
            const actualVal = baseNpv + value;
            const symbol = getCurrencySymbol(appState.currency);
            const position = CURRENCIES.find(c => c.value === appState.currency)?.position || 'prefix';
            const kVal = formatNumber(Math.round(actualVal / 1000));
            return position === 'prefix' ? `${symbol}${kVal}k` : `${kVal}k ${symbol}`;
          }
        },
        axisLine: { lineStyle: { color: lineColor } },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLabel: { color: textColor, fontSize: 11, fontWeight: 'bold' },
        axisLine: { lineStyle: { color: lineColor } },
        splitLine: { show: false }
      },
      series: [
        {
          name: `Decreased Param (-${variationPct}%)`,
          type: 'bar',
          stack: 'total',
          data: lowDeviation,
          // Color coding: Churn decreased -> positive (emerald), ARPU decreased -> negative (coral)
          itemStyle: {
            color: (params: any) => {
              const val = params.value;
              return val >= 0 ? '#10b981' : '#f43f5e';
            },
            borderRadius: 4
          }
        },
        {
          name: `Increased Param (+${variationPct}%)`,
          type: 'bar',
          stack: 'total',
          data: highDeviation,
          itemStyle: {
            color: (params: any) => {
              const val = params.value;
              return val >= 0 ? '#059669' : '#e11d48';
            },
            borderRadius: 4
          }
        }
      ]
    };
  });

  function renderChart() {
    if (!chartElement || typeof window === 'undefined' || !sensitivityData) return;

    tick().then(() => {
      import('echarts').then((echarts) => {
        if (!isMounted || !chartElement) return;
        cleanupChart();

        chartInstance = echarts.init(chartElement);
        chartInstance.setOption(chartOption);

        resizeListener = () => {
          chartInstance?.resize();
        };
        window.addEventListener('resize', resizeListener);
      });
    });
  }

  $effect(() => {
    if ((chartOption && chartElement) || mode.current) {
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
  <!-- Back link & header -->
  <div class="flex items-center justify-between">
    <Button href="/scenarios/{scenario.id}" variant="ghost" size="sm">
      <ArrowLeft class="h-4 w-4 mr-2" /> Back to Dashboard
    </Button>

    <!-- Variation Selector -->
    <div class="flex items-center space-x-2 bg-muted/40 p-1.5 rounded-lg border border-border/40 select-none">
      <span class="text-xs font-semibold text-muted-foreground px-2">Vary Params:</span>
      {#each [5, 10, 15, 20] as val}
        <Button
          href="?variation={val}"
          variant={variationPct === val ? 'default' : 'ghost'}
          size="sm"
          class="h-7 px-3 text-xs"
        >
          ±{val}%
        </Button>
      {/each}
    </div>
  </div>

  <!-- Title section -->
  <div class="space-y-1">
    <div class="flex items-center space-x-2 text-primary">
      <TrendingUp class="h-5 w-5" />
      <span class="text-xs font-bold uppercase tracking-wider">NPV Sensitivity Analysis</span>
    </div>
    <h2 class="text-2xl font-bold tracking-tight text-foreground">Sensitivity: {scenario.name}</h2>
    <p class="text-muted-foreground text-sm font-normal max-w-3xl leading-relaxed">
      This tornado chart ranks parameters based on their impact on Net Present Value (NPV). 
      We vary each parameter by <strong class="text-foreground">±{variationPct}%</strong> while holding all other variables constant. 
      Emerald bars indicate positive NPV deviation; red bars indicate negative NPV deviation.
    </p>
  </div>

  {#if !sensitivityData || sensitivityData.results.length === 0}
    <Card class="border-dashed border-destructive/30 bg-destructive/5 p-6 select-none">
      <CardContent class="flex items-start space-x-3 text-sm">
        <Info class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h4 class="font-bold text-destructive">Sensitivity Calculation Error</h4>
          <p class="text-muted-foreground mt-1 leading-relaxed">Could not compute parameter sensitivity. Check that this scenario has services, cost items, and a cohort configuration mapped correctly.</p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Tornado Chart Card -->
      <Card class="border-border lg:col-span-2 glass border flex flex-col justify-between">
        <CardHeader class="pb-2 border-b border-border glass-inset select-none">
          <CardTitle class="text-base font-bold text-foreground">NPV Tornado Chart Impact Analysis</CardTitle>
          <CardDescription class="text-xs">Bars show deviation in NPV from the base case of {formatCurrency(sensitivityData.baseNpv, appState.currency, 0)}.</CardDescription>
        </CardHeader>
        <CardContent class="p-4 bg-background/5">
          <div bind:this={chartElement} class="h-[400px] w-full"></div>
        </CardContent>
        <CardFooter class="border-t border-border glass-inset py-2.5 select-none flex items-start space-x-2 text-[10px] text-muted-foreground">
          <Info class="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
          <p>Tornado width represents the volatility of NPV under the specified variance range. Longer bars identify the highest risk variables.</p>
        </CardFooter>
      </Card>

      <!-- Parameters detail card -->
      <Card class="border-border glass border flex flex-col justify-between">
        <CardHeader class="pb-3 border-b border-border glass-inset select-none">
          <CardTitle class="text-base font-bold text-foreground">Base Scenario Reference</CardTitle>
          <CardDescription>Current calculated indicators.</CardDescription>
        </CardHeader>
        <CardContent class="py-4 space-y-4 select-none">
          <!-- Small KPIs list -->
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-muted/40 p-2 rounded border border-border/40">
              <span class="text-[9px] text-muted-foreground uppercase font-bold block">Base NPV</span>
              <span class="text-xs font-mono font-bold text-foreground block mt-0.5">{formatCurrency(sensitivityData.baseNpv, appState.currency, 0)}</span>
            </div>
            <div class="bg-muted/40 p-2 rounded border border-border/40">
              <span class="text-[9px] text-muted-foreground uppercase font-bold block">Base IRR</span>
              <span class="text-xs font-mono font-bold text-primary block mt-0.5">{sensitivityData.baseIrr !== null ? formatPercent(sensitivityData.baseIrr) : 'N/A'}</span>
            </div>
            <div class="bg-muted/40 p-2 rounded border border-border/40">
              <span class="text-[9px] text-muted-foreground uppercase font-bold block">Base Payback</span>
              <span class="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 block mt-0.5">{sensitivityData.basePayback === 0 ? 'Immediate' : sensitivityData.basePayback === null ? 'Never' : formatMonths(sensitivityData.basePayback)}</span>
            </div>
          </div>

          <hr class="border-border/40" />

          <!-- Explanation box -->
          <div class="p-3.5 rounded-lg bg-primary/10 border border-primary/20 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
            <h4 class="font-bold text-foreground flex items-center">
              <Sparkles class="h-3.5 w-3.5 mr-1 text-primary animate-pulse" /> Sensitivity Insights
            </h4>
            {#if sensitivityData.results.length > 0}
              {@const topParam = sensitivityData.results[0]}
              <p>
                The NPV is most sensitive to changes in <strong class="text-foreground">{topParam.parameter}</strong>.
                Varying it by ±{variationPct}% changes the NPV by up to 
                <strong class="text-primary">{formatCurrency(topParam.impactRange, appState.currency, 0)}</strong>.
              </p>
              <p>
                To maximize ROI, prioritize optimizing conversion/acquisition rates or pricing structures related to this factor.
              </p>
            {/if}
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Parameter impact table -->
    <Card class="border-border glass border select-none">
      <CardHeader class="pb-2 border-b border-border glass-inset">
        <CardTitle class="text-base font-bold text-foreground">Detailed Parameter Deviations</CardTitle>
        <CardDescription class="text-xs">NPV, IRR and Payback results under parameter modifications.</CardDescription>
      </CardHeader>
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <Table class="w-full text-left border-collapse text-xs">
            <TableHeader>
              <TableRow class="glass-inset border-b border-border font-semibold text-muted-foreground">
                <TableHead class="p-3">Variable Name</TableHead>
                <TableHead class="p-3 text-right">Decreased Value</TableHead>
                <TableHead class="p-3 text-right">Decreased NPV</TableHead>
                <TableHead class="p-3 text-center">Decreased IRR / Payback</TableHead>
                <TableHead class="p-3 text-right">Increased Value</TableHead>
                <TableHead class="p-3 text-right">Increased NPV</TableHead>
                <TableHead class="p-3 text-center">Increased IRR / Payback</TableHead>
                <TableHead class="p-3 text-right">Max Delta NPV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody class="divide-y divide-border/60">
              {#each sensitivityData.results as item}
                <TableRow class="hover:bg-foreground/5 transition-all duration-150">
                  <TableCell class="p-3 font-bold text-foreground">{item.parameter}</TableCell>
                  
                  <!-- Decreased Values -->
                  <TableCell class="p-3 text-right font-mono text-muted-foreground">{item.lowValueText}</TableCell>
                  <TableCell class="p-3 text-right font-mono font-medium {item.lowNpv >= sensitivityData.baseNpv ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                    {formatCurrency(item.lowNpv, appState.currency, 0)}
                  </TableCell>
                  <TableCell class="p-3 text-center font-mono text-muted-foreground text-[10px]">
                    {item.lowIrr !== null ? formatPercent(item.lowIrr) : 'N/A'} / {item.lowPayback === 0 ? 'Immediate' : item.lowPayback === null ? 'Never' : formatMonths(item.lowPayback)}
                  </TableCell>
                  
                  <!-- Increased Values -->
                  <TableCell class="p-3 text-right font-mono text-muted-foreground">{item.highValueText}</TableCell>
                  <TableCell class="p-3 text-right font-mono font-medium {item.highNpv >= sensitivityData.baseNpv ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                    {formatCurrency(item.highNpv, appState.currency, 0)}
                  </TableCell>
                  <TableCell class="p-3 text-center font-mono text-muted-foreground text-[10px]">
                    {item.highIrr !== null ? formatPercent(item.highIrr) : 'N/A'} / {item.highPayback === 0 ? 'Immediate' : item.highPayback === null ? 'Never' : formatMonths(item.highPayback)}
                  </TableCell>

                  <!-- Delta -->
                  <TableCell class="p-3 text-right font-mono font-bold text-primary">
                    {formatCurrency(item.impactRange, appState.currency, 0)}
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
