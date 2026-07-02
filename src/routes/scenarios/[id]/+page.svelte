<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount, tick } from 'svelte';
  import { formatCurrency, formatPercent, formatMonths, formatNumber, formatIrr, formatPI } from '$lib/utils/format';
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
  import DollarSign from '@lucide/svelte/icons/dollar-sign';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ExportButton from '$lib/components/dashboard/ExportButton.svelte';
  import DiagnosticsBanner from '$lib/components/dashboard/DiagnosticsBanner.svelte';

  import { appState } from '$lib/stores/app.svelte';
  import { mode } from 'mode-watcher';

  let { data } = $props();
  const scenario = $derived(data.scenario);
  const results = $derived(data.results);
  const timeline = $derived(data.timeline);
  const scopeSummary = $derived(data.scopeSummary);
  const resolvedConfigs = $derived(data.resolvedConfigs || []);

  const diagnostics = $derived(data.diagnostics ?? []);

  // ADR 0009 — per-archetype stream economics (mix signal)
  const driverProfile = $derived(data.driverProfile);
  const streamMargins = $derived(data.streamMargins);
  // ADR 0010 — credit pool (tier fee, breakage, EVC-based stream attribution)
  const poolEconomics = $derived(data.poolEconomics);
  const streamTotals = $derived.by(() => {
    const tl = timeline ?? [];
    return tl.reduce((acc: any, m: any) => {
      acc.copilotRevenue += m.copilotRevenue ?? 0;
      acc.copilotCogs += m.copilotCogs ?? 0;
      acc.agentRevenue += m.agentRevenue ?? 0;
      acc.agentCogs += m.agentCogs ?? 0;
      return acc;
    }, { copilotRevenue: 0, copilotCogs: 0, agentRevenue: 0, agentCogs: 0 });
  });

  const hasUplifts = $derived(
    (resolvedConfigs ?? []).some((c: any) =>
      (c.arpu_uplift_percent ?? 0) > 0 || (c.arpu_uplift ?? 0) > 0 ||
      (c.churn_reduction ?? 0) > 0 || (c.acquisition_uplift ?? 0) > 0
    )
  );

  // Generic "pure cost" nudge — only when no uplift levers exist at all.
  // The uplifts-set-but-zero-benefit case is handled by the `zero_benefit_despite_uplifts` diagnostic.
  const hasNoAiBenefit = $derived(
    !hasUplifts && (timeline && timeline.length > 0 ? timeline.every((t: any) => Math.abs(t.revenue) < 0.01) : true)
  );

  $effect(() => {
    if (scenario) {
      appState.setActiveScenario(scenario.id, scenario.name);
    }
  });

  // Chart state
  let activeTab = $state<'cashflow' | 'cumulative' | 'users' | 'value_split' | 'pricing_corridor' | 'margin_waterfall' | 'cost_to_serve'>('cashflow');
  let chartElement: HTMLDivElement | undefined = $state();
  let valuePieElement: HTMLDivElement | undefined = $state();
  let captureCurveElement: HTMLDivElement | undefined = $state();
  let pricingCorridorElement: HTMLDivElement | undefined = $state();
  let marginWaterfallElement: HTMLDivElement | undefined = $state();
  let costToServeElement: HTMLDivElement | undefined = $state();

  let chartInstance: any = null;
  let valuePieInstance: any = null;
  let captureCurveInstance: any = null;
  let pricingCorridorInstance: any = null;
  let marginWaterfallInstance: any = null;
  let costToServeInstance: any = null;

  let resizeListener: (() => void) | null = null;
  let splitResizeListener: (() => void) | null = null;
  let corridorResizeListener: (() => void) | null = null;
  let waterfallResizeListener: (() => void) | null = null;
  let costToServeResizeListener: (() => void) | null = null;
  let isMounted = false;
  let isExplainerOpen = $state(false);

  function cleanupChart() {
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
    if (valuePieInstance) {
      valuePieInstance.dispose();
      valuePieInstance = null;
    }
    if (captureCurveInstance) {
      captureCurveInstance.dispose();
      captureCurveInstance = null;
    }
    if (pricingCorridorInstance) {
      pricingCorridorInstance.dispose();
      pricingCorridorInstance = null;
    }
    if (marginWaterfallInstance) {
      marginWaterfallInstance.dispose();
      marginWaterfallInstance = null;
    }
    if (costToServeInstance) {
      costToServeInstance.dispose();
      costToServeInstance = null;
    }
    if (resizeListener) {
      window.removeEventListener('resize', resizeListener);
      resizeListener = null;
    }
    if (splitResizeListener) {
      window.removeEventListener('resize', splitResizeListener);
      splitResizeListener = null;
    }
    if (corridorResizeListener) {
      window.removeEventListener('resize', corridorResizeListener);
      corridorResizeListener = null;
    }
    if (waterfallResizeListener) {
      window.removeEventListener('resize', waterfallResizeListener);
      waterfallResizeListener = null;
    }
    if (costToServeResizeListener) {
      window.removeEventListener('resize', costToServeResizeListener);
      costToServeResizeListener = null;
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
    const hasOutcome = timeline.some((t: any) => (t.outcomeRevenue ?? 0) > 0);
    const hasAgent = timeline.some((t: any) => (t.totalInteractions ?? 0) > 0);
 
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
        data: [
          ...(hasMonetization ? ['AI Monetization'] : []),
          ...(hasOutcome ? ['Outcome Revenue'] : []),
          'Gross MRR',
          'Baseline MRR',
          'OPEX Costs',
          'CAPEX Costs',
          'AI Token Costs',
          'Net Cashflow',
          ...(hasAgent ? ['Labor Savings (Cash)', 'Labor Savings (Capacity) (Memo)', 'Failed Deflection Cost', 'Total Interactions'] : [])
        ],
        textStyle: { color: textColor, fontSize: 11 },
        bottom: 0
      },
      grid: { left: '3%', right: '5%', top: '12%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: monthsLabel,
        axisLabel: { color: axisColor, fontSize: 10 },
        axisLine: { lineStyle: { color: lineColor } }
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: {
            color: axisColor,
            fontSize: 10,
            formatter: (value: number) => formatCurrency(value, appState.currency, 0)
          },
          axisLine: { lineStyle: { color: lineColor } },
          splitLine: { lineStyle: { color: splitLineColor } }
        },
        ...(hasAgent ? [
          {
            type: 'value',
            name: 'Interactions',
            nameTextStyle: { color: textColor, fontSize: 10 },
            axisLabel: {
              color: axisColor,
              fontSize: 10,
              formatter: (value: number) => value.toLocaleString()
            },
            axisLine: { lineStyle: { color: lineColor } },
            splitLine: { show: false }
          }
        ] : [])
      ],
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
        ...(hasOutcome ? [{
          name: 'Outcome Revenue',
          type: 'line',
          data: timeline.map((t: any) => t.outcomeRevenue),
          itemStyle: { color: '#ec4899' },
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
        },
        ...(hasAgent ? [
          {
            name: 'Labor Savings (Cash)',
            type: 'line',
            data: timeline.map((t: any) => t.laborSavingsCash ?? 0),
            itemStyle: { color: '#059669' },
            lineStyle: { width: 2 },
            symbolSize: 4
          },
          {
            name: 'Labor Savings (Capacity) (Memo)',
            type: 'line',
            data: timeline.map((t: any) => t.laborSavingsCapacity ?? 0),
            itemStyle: { color: '#2563eb' },
            lineStyle: { width: 2, type: 'dashed' },
            symbolSize: 4
          },
          {
            name: 'Failed Deflection Cost',
            type: 'line',
            data: timeline.map((t: any) => t.failedDeflectionCost ?? 0),
            itemStyle: { color: '#dc2626' },
            lineStyle: { width: 2 },
            symbolSize: 4
          },
          {
            name: 'Total Interactions',
            type: 'line',
            yAxisIndex: 1,
            data: timeline.map((t: any) => t.totalInteractions ?? 0),
            itemStyle: { color: '#a855f7' },
            lineStyle: { width: 2, type: 'dotted' },
            symbolSize: 4
          }
        ] : [])
      ]
    };

    const hasLowerBound = timeline.some((t: any) =>
      t.cumulativeCashFlowLower !== undefined && t.cumulativeCashFlowLower !== t.cumulativeCashFlow
    );

    const cumulative = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText },
        formatter: (params: any) => {
          const upper = params.find((p: any) => p.seriesName === 'Full Attribution (upper)') ?? params[0];
          const lower = params.find((p: any) => p.seriesName === 'ARPU Uplift Only (lower)');
          const upperVal = upper?.value ?? 0;
          const lowerVal = lower?.value ?? upperVal;
          const isBand = hasLowerBound && lower;

          const breakeven = upperVal >= 0
            ? `<span style="color:#10b981;font-weight:bold">✓ ROI positive</span>`
            : `<span style="color:#f59e0b;font-weight:bold">⏳ Pre-break-even</span>`;

          return `<div style="padding:8px 10px;min-width:230px;font-size:11px;line-height:1.6">
            <div style="font-weight:700;margin-bottom:4px;color:${tooltipText}">${upper?.name ?? ''}</div>
            ${isBand ? `
            <div style="display:flex;justify-content:space-between;gap:12px">
              <span style="color:#06b6d4">▬ Full attribution</span>
              <span style="font-weight:700;font-family:monospace">${formatCurrency(upperVal, appState.currency)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:12px">
              <span style="color:#818cf8">▬ ARPU uplift only</span>
              <span style="font-weight:700;font-family:monospace">${formatCurrency(lowerVal, appState.currency)}</span>
            </div>
            <div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2);font-size:10px;color:${isDark ? '#94a3b8' : '#64748b'}">
              Band = attribution uncertainty range (V15 methodology)
            </div>
            ` : `
            <div style="display:flex;justify-content:space-between;gap:12px">
              <span style="color:#06b6d4">▬ Cumulative incremental margin</span>
              <span style="font-weight:700;font-family:monospace">${formatCurrency(upperVal, appState.currency)}</span>
            </div>
            `}
            <div style="margin-top:4px;font-size:10px">${breakeven}</div>
          </div>`;
        }
      },
      legend: {
        data: hasLowerBound
          ? ['Full Attribution (upper)', 'ARPU Uplift Only (lower)']
          : ['Cumulative Incremental Margin'],
        textStyle: { color: textColor, fontSize: 10 },
        bottom: 0,
        itemWidth: 20,
        itemHeight: 3,
        tooltip: {
          show: true,
          formatter: (params: any) => {
            if (params.name === 'Full Attribution (upper)') {
              return '<div style="max-width:220px;padding:6px 8px;font-size:10px;line-height:1.5">Upper bound: credits full incremental retention + acquisition + ARPU uplift effect (gross margin applied). Sherpa V15.</div>';
            }
            if (params.name === 'ARPU Uplift Only (lower)') {
              return '<div style="max-width:220px;padding:6px 8px;font-size:10px;line-height:1.5">Lower bound: credits only the per-seat price uplift (ARPU delta × retained customers). Conservative attribution. Sherpa V15.</div>';
            }
            return '<div style="max-width:220px;padding:6px 8px;font-size:10px;line-height:1.5">Cumulative incremental contribution margin minus total costs. Crosses $0 at break-even. Sherpa V15 methodology.</div>';
          }
        }
      },
      grid: { left: '3%', right: '4%', top: '8%', bottom: '15%', containLabel: true },
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
        // Lower bound rendered first so upper fills on top
        ...(hasLowerBound ? [{
          name: 'ARPU Uplift Only (lower)',
          type: 'line',
          data: timeline.map((t: any) => t.cumulativeCashFlowLower),
          smooth: true,
          lineStyle: { width: 2, color: '#818cf8', type: 'dashed' },
          itemStyle: { color: '#818cf8' },
          symbolSize: 3,
          areaStyle: {
            color: isDark ? 'rgba(6, 182, 212, 0.06)' : 'rgba(6, 182, 212, 0.04)'
          }
        }] : []),
        {
          name: hasLowerBound ? 'Full Attribution (upper)' : 'Cumulative Incremental Margin',
          type: 'line',
          data: timeline.map((t: any) => t.cumulativeCashFlow),
          smooth: true,
          lineStyle: { width: 3.5, color: '#06b6d4' },
          itemStyle: { color: '#06b6d4' },
          symbolSize: 4,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(6, 182, 212, 0.30)' },
                { offset: 1, color: 'rgba(6, 182, 212, 0.02)' }
              ]
            }
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
            label: {
              show: true,
              position: 'insideEndTop',
              color: '#ef4444',
              fontSize: 10,
              fontWeight: 'bold',
              formatter: 'Break-even'
            },
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

  let activeEffectId = 0;

  function renderSplitCharts(currentRunId: number) {
    if (!valuePieElement || !captureCurveElement) return;

    tick().then(() => {
      if (currentRunId !== activeEffectId) return;
      import('echarts').then((echarts) => {
        if (currentRunId !== activeEffectId) return;
        if (!isMounted || activeTab !== 'value_split' || !valuePieElement || !captureCurveElement) return;

        const isDark = mode.current === 'dark';
        const textColor = isDark ? '#cbd5e1' : '#475569';
        const axisColor = isDark ? '#94a3b8' : '#64748b';
        const lineColor = isDark ? '#475569' : '#e2e8f0';
        const splitLineColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.6)';
        const tooltipBg = isDark ? '#1e293b' : '#ffffff';
        const tooltipBorder = isDark ? '#475569' : '#e2e8f0';
        const tooltipText = isDark ? '#f8fafc' : '#0f172a';

        // 1. Value Pie Option
        const evcObj = results?.evc;
        const surplusVal = evcObj?.customerSurplusPerUserMonth ?? 0;
        const vendorProfit = evcObj?.vendorGrossProfitPerUserMonth ?? 0;
        const cogsVal = evcObj?.cogsPerUserMonth ?? 0;

        const pieOption = {
          title: {
            text: 'Value Creation Split',
            left: 'center',
            textStyle: { color: textColor, fontSize: 13, fontWeight: 'bold' }
          },
          tooltip: {
            trigger: 'item',
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            textStyle: { color: tooltipText },
            formatter: (params: any) => {
              return `${params.name}: <b>${formatCurrency(params.value, appState.currency, 0)}/mo</b> (${params.percent}%)`;
            }
          },
          legend: {
            orient: 'horizontal',
            bottom: '0%',
            left: 'center',
            textStyle: { color: textColor, fontSize: 9 }
          },
          series: [
            {
              name: 'Value Split',
              type: 'pie',
              radius: ['45%', '70%'],
              center: ['50%', '45%'],
              avoidLabelOverlap: false,
              itemStyle: {
                borderRadius: 4,
                borderColor: isDark ? '#1e293b' : '#fff',
                borderWidth: 2
              },
              label: {
                show: false,
                position: 'center'
              },
              emphasis: {
                label: {
                  show: true,
                  fontSize: 11,
                  fontWeight: 'bold',
                  formatter: '{b}\n{d}%'
                }
              },
              labelLine: {
                show: false
              },
              data: [
                { value: surplusVal, name: 'Customer Surplus', itemStyle: { color: '#3b82f6' } },
                { value: vendorProfit, name: 'Vendor Profit', itemStyle: { color: '#10b981' } },
                { value: cogsVal, name: 'COGS', itemStyle: { color: '#f43f5e' } }
              ]
            }
          ]
        };

        // 2. Capture Curve Option
        const curveData = data.captureCurve;
        const points = curveData?.points ?? [];
        const optimalCapture = curveData?.optimalCapture ?? 0.3;

        const lineOption = {
          title: {
            text: 'NPV Capture Curve',
            left: 'center',
            textStyle: { color: textColor, fontSize: 13, fontWeight: 'bold' }
          },
          tooltip: {
            trigger: 'axis',
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            textStyle: { color: tooltipText },
            formatter: (params: any) => {
              let res = `Capture Rate: <b>${params[0].name}</b><br/>`;
              params.forEach((item: any) => {
                res += `${item.marker} ${item.seriesName}: <b>${formatCurrency(item.value, appState.currency, 0)}</b><br/>`;
              });
              return res;
            }
          },
          legend: {
            bottom: '0%',
            left: 'center',
            textStyle: { color: textColor, fontSize: 9 }
          },
          grid: { left: '3%', right: '4%', top: '20%', bottom: '15%', containLabel: true },
          xAxis: {
            type: 'category',
            boundaryGap: false,
            data: points.map((p: any) => `${Math.round(p.capture * 100)}%`),
            axisLabel: { color: axisColor, fontSize: 9 },
            axisLine: { lineStyle: { color: lineColor } }
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              color: axisColor,
              fontSize: 9,
              formatter: (value: number) => formatCurrency(value, appState.currency, 0)
            },
            axisLine: { lineStyle: { color: lineColor } },
            splitLine: { lineStyle: { color: splitLineColor } }
          },
          series: [
            {
              name: 'Vendor NPV',
              type: 'line',
              smooth: true,
              data: points.map((p: any) => p.npvUpper),
              itemStyle: { color: '#10b981' },
              lineStyle: { width: 3 },
              markLine: {
                silent: true,
                symbol: ['none', 'none'],
                lineStyle: { color: '#8b5cf6', type: 'dashed', width: 1.5 },
                label: {
                  show: true,
                  position: 'middle',
                  color: '#8b5cf6',
                  fontSize: 9,
                  fontWeight: 'bold',
                  formatter: `Optimum (${Math.round(optimalCapture * 100)}%)`
                },
                data: [
                  { xAxis: `${Math.round(optimalCapture * 100)}%` }
                ]
              }
            },
            {
              name: 'Customer Surplus PV',
              type: 'line',
              smooth: true,
              data: points.map((p: any) => p.customerSurplus),
              itemStyle: { color: '#3b82f6' },
              lineStyle: { width: 2 }
            }
          ]
        };

        if (valuePieInstance) {
          valuePieInstance.setOption(pieOption, true);
        } else {
          valuePieInstance = echarts.init(valuePieElement);
          valuePieInstance.setOption(pieOption, true);
        }

        if (captureCurveInstance) {
          captureCurveInstance.setOption(lineOption, true);
        } else {
          captureCurveInstance = echarts.init(captureCurveElement);
          captureCurveInstance.setOption(lineOption, true);
        }

        if (!splitResizeListener) {
          splitResizeListener = () => {
            valuePieInstance?.resize();
            captureCurveInstance?.resize();
          };
          window.addEventListener('resize', splitResizeListener);
        }
      });
    });
  }

  function renderCorridorChart(currentRunId: number) {
    if (!pricingCorridorElement) return;

    tick().then(() => {
      if (currentRunId !== activeEffectId) return;
      import('echarts').then((echarts) => {
        if (currentRunId !== activeEffectId) return;
        if (!isMounted || activeTab !== 'pricing_corridor' || !pricingCorridorElement) return;

        const isDark = mode.current === 'dark';
        const textColor = isDark ? '#cbd5e1' : '#475569';
        const axisColor = isDark ? '#94a3b8' : '#64748b';
        const lineColor = isDark ? '#475569' : '#e2e8f0';
        const splitLineColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.6)';
        const tooltipBg = isDark ? '#1e293b' : '#ffffff';
        const tooltipBorder = isDark ? '#475569' : '#e2e8f0';
        const tooltipText = isDark ? '#f8fafc' : '#0f172a';

        const corridor = data.pricingCorridor;
        if (!corridor) return;
        const points = corridor.points;

        const xAxisData = points.map((p: any, index: number) => {
          const refSuffix = p.isReference ? ' ★ (reference)' : '';
          if (points.length === 1) {
            return `${p.cohortName}\n(Single Profile)${refSuffix}`;
          }
          if (index === 0) {
            return `Light: ${p.cohortName}${refSuffix}`;
          }
          if (index === points.length - 1) {
            return `Heavy: ${p.cohortName}${refSuffix}`;
          }
          return `${p.cohortName}${refSuffix}`;
        });

        // Conceptual ladder (mirrors the reference diagrams): fixed semantic tiers top->bottom
        // — Ceiling (EVC) / Realized Price / Target Floor / COGS Floor. The tier (y) encodes
        // role; each rung's actual value is its label, so values never collide. Not to scale:
        // a break (COGS > Price) is annotated rather than drawn by inverting the order.
        const isCohortBasis = corridor.points[0]?.priceBasis === 'cohort';
        const tierNames: Record<number, string> = {
          4: 'Ceiling (EVC)',
          3: isCohortBasis ? 'Cohort-Attributable Price' : 'Blended realized price (scenario-wide)',
          2: 'Target Floor',
          1: 'COGS Floor'
        };
        const realized = corridor.actualPrice;

        const rungData = points.flatMap((p: any, i: number) => {
          const pointPrice = p.pricePerCustomer ?? realized;
          const realizedColor = p.status === 'loss' ? '#f43f5e' : (p.status === 'over_ceiling' ? '#f59e0b' : '#3b82f6');
          const cogsColor = p.status === 'loss' ? '#f43f5e' : '#94a3b8';
          return [
            { value: [i, 4], _ci: i, itemStyle: { color: '#64748b' }, _lbl: formatCurrency(p.ceiling, appState.currency, 0) },
            { value: [i, 3], _ci: i, itemStyle: { color: realizedColor }, _lbl: formatCurrency(pointPrice, appState.currency, 0) },
            { value: [i, 2], _ci: i, itemStyle: { color: '#f59e0b' }, _lbl: formatCurrency(p.floorTarget, appState.currency, 0) },
            { value: [i, 1], _ci: i, itemStyle: { color: cogsColor }, _lbl: formatCurrency(p.cogs, appState.currency, 0) }
          ];
        });

        const breakMarks = points.flatMap((p: any, i: number) =>
          p.status === 'loss'
            ? [{ coord: [i, 2.5], itemStyle: { color: '#f43f5e' }, label: { show: true, formatter: '⚠ COGS > PRICE', color: '#fff', fontSize: 9, fontWeight: 'bold' } }]
            : []
        );

        const corridorOption = {
          title: {
            text: 'Pricing Corridor: COGS Floor → Price → EVC Ceiling',
            subtext: 'Conceptual ladder — rungs ordered by role (not to scale); values shown per rung',
            left: 'center',
            textStyle: { color: textColor, fontSize: 13, fontWeight: 'bold' },
            subtextStyle: { color: axisColor, fontSize: 9 }
          },
          tooltip: {
            trigger: 'item',
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            textStyle: { color: tooltipText },
            formatter: (params: any) => {
              const pt = points[params.data?._ci ?? 0];
              if (!pt) return '';
              const pointPrice = pt.pricePerCustomer ?? realized;
              const gap = pt.ceiling - pointPrice;
              const priceLabel = pt.priceBasis === 'cohort' ? 'Cohort Realized Price' : 'Blended Realized Price (scenario-wide)';
              let tooltipHtml = `
                <div style="font-weight: bold; margin-bottom: 4px;">${pt.cohortName}</div>
                Adoption Rate: <b>${Math.round(pt.adoptionRate * 100)}%</b><br/>
                Gross Margin Target: <b>${Math.round(pt.grossMargin * 100)}%</b><br/>
                <span style="color:#64748b">Ceiling (EVC):</span> <b>${formatCurrency(pt.ceiling, appState.currency, 2)}/mo</b><br/>
                <span style="color:#3b82f6">${priceLabel}:</span> <b>${formatCurrency(pointPrice, appState.currency, 2)}/mo</b>`;

              if (pt.priceBasis === 'cohort') {
                const hasPlanBridge = scenario.revenue_bridge === 'upsell_on_cohort' || scenario.revenue_bridge === 'separate_market';
                if (hasPlanBridge) {
                  tooltipHtml += `<br/><span style="font-size: 9px; color: #94a3b8;">* cohort-attributable price; excludes plan subscription revenue</span>`;
                }
              }

              tooltipHtml += `<br/>
                ${pt.targetPrice ? `<span style="color:#a855f7">Target Price:</span> <b>${formatCurrency(pt.targetPrice, appState.currency, 2)}/mo</b><br/>` : ''}
                <span style="color:#f59e0b">Target Floor:</span> <b>${formatCurrency(pt.floorTarget, appState.currency, 2)}/mo</b><br/>
                ${pt.floorPrice ? `<span style="color:#f97316">Floor (EVC):</span> <b>${formatCurrency(pt.floorPrice, appState.currency, 2)}/mo</b><br/>` : ''}
                <span style="color:#94a3b8">COGS Floor:</span> <b>${formatCurrency(pt.cogs, appState.currency, 2)}/mo</b><br/>
                Value headroom: <b>${formatCurrency(gap, appState.currency, 0)}/mo</b><br/>
                Status: <span style="font-weight: bold; color: ${pt.status === 'loss' ? '#f43f5e' : (pt.status === 'healthy' ? '#10b981' : '#f59e0b')};">${pt.status.toUpperCase().replace('_', ' ')}</span>
              `;
              return tooltipHtml;
            }
          },
          grid: { left: '3%', right: '8%', top: '24%', bottom: '12%', containLabel: true },
          xAxis: {
            type: 'category',
            data: xAxisData,
            axisLabel: { color: axisColor, fontSize: 9 },
            axisLine: { lineStyle: { color: lineColor } }
          },
          yAxis: {
            type: 'value',
            min: 0.5,
            max: 4.5,
            interval: 1,
            axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => tierNames[v] ?? '' },
            axisTick: { show: false },
            axisLine: { show: false },
            splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } }
          },
          series: [
            {
              name: 'Rungs',
              type: 'scatter',
              symbol: 'rect',
              symbolSize: [54, 8],
              data: rungData,
              label: {
                show: true,
                position: 'top',
                formatter: (params: any) => params.data?._lbl ?? '',
                color: textColor,
                fontSize: 9,
                fontWeight: 'bold'
              },
              markArea: {
                silent: true,
                itemStyle: { color: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.10)' },
                data: [[{ yAxis: 2 }, { yAxis: 4 }]]
              },
              markLine: {
                silent: true,
                symbol: ['none', 'none'],
                lineStyle: { color: axisColor, width: 1, opacity: 0.25 },
                label: { show: false },
                data: points.map((p: any, i: number) => [
                  { coord: [i, 1], lineStyle: p.isReference ? { color: '#a855f7', width: 2, opacity: 0.7, type: 'dashed' } : undefined },
                  { coord: [i, 4] }
                ])
              },
              markPoint: {
                symbol: 'pin',
                symbolSize: 46,
                data: breakMarks
              }
            }
          ]
        };

        if (pricingCorridorInstance) {
          pricingCorridorInstance.setOption(corridorOption, true);
        } else {
          pricingCorridorInstance = echarts.init(pricingCorridorElement);
          pricingCorridorInstance.setOption(corridorOption, true);
        }

        if (!corridorResizeListener) {
          corridorResizeListener = () => {
            pricingCorridorInstance?.resize();
          };
          window.addEventListener('resize', corridorResizeListener);
        }
      });
    });
  }

  function renderCostToServeChart(currentRunId: number) {
    if (!costToServeElement) return;

    tick().then(() => {
      if (currentRunId !== activeEffectId) return;
      import('echarts').then((echarts) => {
        if (currentRunId !== activeEffectId) return;
        if (!isMounted || activeTab !== 'cost_to_serve' || !costToServeElement) return;

        const isDark = mode.current === 'dark';
        const textColor = isDark ? '#cbd5e1' : '#475569';
        const axisColor = isDark ? '#94a3b8' : '#64748b';
        const lineColor = isDark ? '#475569' : '#e2e8f0';
        const splitLineColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.6)';
        const tooltipBg = isDark ? '#1e293b' : '#ffffff';
        const tooltipBorder = isDark ? '#475569' : '#e2e8f0';
        const tooltipText = isDark ? '#f8fafc' : '#0f172a';

        const corridor = data.agentDeflectionCorridor;
        if (!corridor) return;
        const points = corridor.points;

        const xAxisData = points.map((p: any) => p.cohortName);

        // 2-tier ladder (Avoided Value ceiling / Cost-to-Serve floor) — the Agent-archetype
        // analogue of the Copilot Pricing Corridor, but framed as displaced-labor economics
        // rather than a willingness-to-pay ceiling (ADR 0009 Track B).
        const tierNames: Record<number, string> = {
          2: 'Avoided Value',
          1: 'Cost to Serve'
        };

        const rungData = points.flatMap((p: any, i: number) => {
          const avoidedColor = p.status === 'loss' ? '#f43f5e' : '#10b981';
          const costColor = p.status === 'loss' ? '#f43f5e' : '#94a3b8';
          return [
            { value: [i, 2], _ci: i, itemStyle: { color: avoidedColor }, _lbl: formatCurrency(p.avoidedValue, appState.currency, 0) },
            { value: [i, 1], _ci: i, itemStyle: { color: costColor }, _lbl: formatCurrency(p.costToServe, appState.currency, 0) }
          ];
        });

        const breakMarks = points.flatMap((p: any, i: number) =>
          p.status === 'loss'
            ? [{ coord: [i, 1.5], itemStyle: { color: '#f43f5e' }, label: { show: true, formatter: '⚠ COST > VALUE', color: '#fff', fontSize: 9, fontWeight: 'bold' } }]
            : []
        );

        const corridorOption = {
          title: {
            text: 'Cost-to-Serve Corridor: Displaced-Labor Value vs. Deflection Cost',
            subtext: 'Conceptual ladder — rungs ordered by role (not to scale); values shown per rung, per customer/month\n(value created, capacity basis; cash marker = after baseline-FTE cap)',
            left: 'center',
            textStyle: { color: textColor, fontSize: 13, fontWeight: 'bold' },
            subtextStyle: { color: axisColor, fontSize: 9 }
          },
          tooltip: {
            trigger: 'item',
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            textStyle: { color: tooltipText },
            formatter: (params: any) => {
              const pt = points[params.data?._ci ?? 0];
              if (!pt) return '';
              let tooltipHtml = `
                <div style="font-weight: bold; margin-bottom: 4px;">${pt.cohortName}</div>
                Interactions/customer/mo: <b>${pt.interactions.toFixed(2)}</b><br/>
                Containment Rate: <b>${Math.round(pt.containmentRate * 100)}%</b><br/>
                <span style="color:#10b981">Avoided Value:</span> <b>${formatCurrency(pt.avoidedValue, appState.currency, 2)}/mo</b> (Capacity Basis)<br/>
              `;
              if (pt.realizationRatio < 1) {
                tooltipHtml += `
                <span style="color:#f59e0b">Realizable as cash:</span> <b>${formatCurrency(pt.realizableAvoidedValue, appState.currency, 2)}/mo</b> (${Math.round(pt.realizationRatio * 100)}% — FTE cap)<br/>
                `;
              }
              tooltipHtml += `
                <span style="color:#94a3b8">Cost to Serve:</span> <b>${formatCurrency(pt.costToServe, appState.currency, 2)}/mo</b><br/>
                &nbsp;&nbsp;• Tokens: <b>${formatCurrency(pt.costDecomposition.tokens, appState.currency, 2)}/mo</b><br/>
                &nbsp;&nbsp;• Fixed Allocation: <b>${formatCurrency(pt.costDecomposition.fixedAlloc, appState.currency, 2)}/mo</b><br/>
                &nbsp;&nbsp;• Failed Deflection: <b>${formatCurrency(pt.costDecomposition.failedDeflection, appState.currency, 2)}/mo</b><br/>
                Net Deflection Value: <b>${formatCurrency(pt.netDeflectionValue, appState.currency, 2)}/mo</b><br/>
                Status: <span style="font-weight: bold; color: ${pt.status === 'loss' ? '#f43f5e' : (pt.status === 'healthy' ? '#10b981' : '#f59e0b')};">${pt.status.toUpperCase().replace('_', ' ')}</span>
              `;
              return tooltipHtml;
            }
          },
          grid: { left: '3%', right: '8%', top: '24%', bottom: '12%', containLabel: true },
          xAxis: {
            type: 'category',
            data: xAxisData,
            axisLabel: { color: axisColor, fontSize: 9 },
            axisLine: { lineStyle: { color: lineColor } }
          },
          yAxis: {
            type: 'value',
            min: 0.5,
            max: 2.5,
            interval: 1,
            axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => tierNames[v] ?? '' },
            axisTick: { show: false },
            axisLine: { show: false },
            splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } }
          },
          series: [
            {
              name: 'Rungs',
              type: 'scatter',
              symbol: 'rect',
              symbolSize: [54, 8],
              data: rungData,
              label: {
                show: true,
                position: 'top',
                formatter: (params: any) => params.data?._lbl ?? '',
                color: textColor,
                fontSize: 9,
                fontWeight: 'bold'
              },
              markArea: {
                silent: true,
                itemStyle: { color: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.10)' },
                data: [[{ yAxis: 1 }, { yAxis: 2 }]]
              },
              markLine: {
                silent: true,
                symbol: ['none', 'none'],
                lineStyle: { color: axisColor, width: 1, opacity: 0.25 },
                label: { show: false },
                data: points.map((_p: any, i: number) => [{ coord: [i, 1] }, { coord: [i, 2] }])
              },
              markPoint: {
                symbol: 'pin',
                symbolSize: 46,
                data: breakMarks
              }
            },
            {
              name: 'Realizable Cash Marker',
              type: 'scatter',
              symbol: 'circle',
              symbolSize: 10,
              itemStyle: {
                color: '#f59e0b',
                borderColor: '#fff',
                borderWidth: 1
              },
              data: points.flatMap((p: any, i: number) => {
                if (p.realizationRatio < 1) {
                  return [{
                    value: [i, 2],
                    _ci: i,
                    label: {
                      show: true,
                      position: 'bottom',
                      formatter: () => formatCurrency(p.realizableAvoidedValue, appState.currency, 0),
                      color: textColor,
                      fontSize: 8,
                      fontWeight: 'bold'
                    }
                  }];
                }
                return [];
              })
            }
          ]
        };

        if (costToServeInstance) {
          costToServeInstance.setOption(corridorOption, true);
        } else {
          costToServeInstance = echarts.init(costToServeElement);
          costToServeInstance.setOption(corridorOption, true);
        }

        if (!costToServeResizeListener) {
          costToServeResizeListener = () => {
            costToServeInstance?.resize();
          };
          window.addEventListener('resize', costToServeResizeListener);
        }
      });
    });
  }

  function renderWaterfallChart(currentRunId: number) {
    if (!marginWaterfallElement) return;

    tick().then(() => {
      if (currentRunId !== activeEffectId) return;
      import('echarts').then((echarts) => {
        if (currentRunId !== activeEffectId) return;
        if (!isMounted || activeTab !== 'margin_waterfall' || !marginWaterfallElement) return;

        const isDark = mode.current === 'dark';
        const textColor = isDark ? '#cbd5e1' : '#475569';
        const axisColor = isDark ? '#94a3b8' : '#64748b';
        const lineColor = isDark ? '#475569' : '#e2e8f0';
        const splitLineColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.6)';
        const tooltipBg = isDark ? '#1e293b' : '#ffffff';
        const tooltipBorder = isDark ? '#475569' : '#e2e8f0';
        const tooltipText = isDark ? '#f8fafc' : '#0f172a';

        const waterfall = data.pocketMarginWaterfall;
        if (!waterfall) return;
        const steps = waterfall.steps;

        const helperData: number[] = [];
        const visibleData: number[] = [];
        let accumulated = 0;

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (step.type === 'base' || step.type === 'total') {
            helperData.push(0);
            visibleData.push(step.value);
            accumulated = step.value;
          } else if (step.type === 'delta') {
            const nextAccumulated = accumulated + step.value;
            helperData.push(Math.min(accumulated, nextAccumulated));
            visibleData.push(Math.abs(step.value));
            accumulated = nextAccumulated;
          }
        }

        const colors = [
          '#64748b', // EVC: Slate
          '#3b82f6', // Customer Surplus: Blue
          '#0284c7', // Target Price: Sky Blue
          '#f43f5e', // AI COGS: Rose
          '#f59e0b', // Cost-to-Serve: Amber
          '#10b981'  // Pocket Margin: Emerald
        ];

        const visibleDataColored = (steps as any).map((step: any, idx: number) => ({
          value: visibleData[idx],
          itemStyle: { color: colors[idx] }
        }));

        const waterfallOption = {
          title: {
            text: 'Pocket-Margin Waterfall (per Customer/Month)',
            left: 'center',
            textStyle: { color: textColor, fontSize: 13, fontWeight: 'bold' }
          },
          tooltip: {
            trigger: 'axis',
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            textStyle: { color: tooltipText },
            formatter: (params: any) => {
              const barParam = params.find((p: any) => p.seriesName === 'Waterfall');
              if (!barParam) return '';
              const idx = barParam.dataIndex;
              const step = steps[idx];
              const absVal = Math.abs(step.value);
              const sign = step.value < 0 ? '-' : '';
              return `
                <div style="font-weight: bold; margin-bottom: 4px;">${step.name}</div>
                Value: <b>${sign}${formatCurrency(absVal, appState.currency, 2)}/mo</b>
              `;
            }
          },
          grid: { left: '3%', right: '4%', top: '20%', bottom: '15%', containLabel: true },
          xAxis: {
            type: 'category',
            data: (steps as any).map((s: any) => s.name.replace('Economic Value to Customer (EVC)', 'EVC')),
            axisLabel: { color: axisColor, fontSize: 9, rotate: 15 },
            axisLine: { lineStyle: { color: lineColor } }
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              color: axisColor,
              fontSize: 9,
              formatter: (value: number) => formatCurrency(value, appState.currency, 0)
            },
            axisLine: { lineStyle: { color: lineColor } },
            splitLine: { lineStyle: { color: splitLineColor } }
          },
          series: [
            {
              name: 'Placeholder',
              type: 'bar',
              stack: 'all',
              itemStyle: { color: 'rgba(0,0,0,0)' },
              emphasis: { itemStyle: { color: 'rgba(0,0,0,0)' } },
              data: helperData
            },
            {
              name: 'Waterfall',
              type: 'bar',
              stack: 'all',
              data: visibleDataColored,
              label: {
                show: true,
                position: 'inside',
                formatter: (params: any) => {
                  const val = steps[params.dataIndex].value;
                  return formatCurrency(val, appState.currency, 0);
                },
                fontSize: 9,
                fontWeight: 'bold',
                color: '#ffffff'
              }
            },
            {
              name: 'Realized Price',
              type: 'scatter',
              symbol: 'diamond',
              symbolSize: 12,
              itemStyle: { color: '#2563eb', borderColor: '#ffffff', borderWidth: 2 },
              data: [
                {
                  value: [2, waterfall.actualPrice],
                  label: {
                    show: Math.abs(waterfall.actualPrice - waterfall.steps[2].value) > 0.01,
                    position: 'right',
                    formatter: `Realized: ${formatCurrency(waterfall.actualPrice, appState.currency, 0)}`,
                    color: textColor,
                    fontSize: 9,
                    fontWeight: 'bold'
                  }
                }
              ]
            }
          ]
        };

        if (marginWaterfallInstance) {
          marginWaterfallInstance.setOption(waterfallOption, true);
        } else {
          marginWaterfallInstance = echarts.init(marginWaterfallElement);
          marginWaterfallInstance.setOption(waterfallOption, true);
        }

        if (!waterfallResizeListener) {
          waterfallResizeListener = () => {
            marginWaterfallInstance?.resize();
          };
          window.addEventListener('resize', waterfallResizeListener);
        }
      });
    });
  }

  function renderChart(currentRunId: number) {
    if (!chartElement) return;

    tick().then(() => {
      if (currentRunId !== activeEffectId) return;
      import('echarts').then((echarts) => {
        if (currentRunId !== activeEffectId) return;
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
    const currentRunId = ++activeEffectId;
    if (activeTab === 'value_split') {
      cleanupChart();
      renderSplitCharts(currentRunId);
    } else if (activeTab === 'pricing_corridor') {
      cleanupChart();
      renderCorridorChart(currentRunId);
    } else if (activeTab === 'margin_waterfall') {
      cleanupChart();
      renderWaterfallChart(currentRunId);
    } else if (activeTab === 'cost_to_serve') {
      cleanupChart();
      renderCostToServeChart(currentRunId);
    } else if (activeTab || timeline || mode.current) {
      cleanupChart();
      renderChart(currentRunId);
    }
    return () => {
      cleanupChart();
    };
  });

  onMount(() => {
    isMounted = true;
    renderChart(++activeEffectId);
    return () => {
      isMounted = false;
      cleanupChart();
    };
  });

  function formatPaybackRange(upper: number | null | undefined, lower: number | null | undefined): string {
    if (upper === null || upper === undefined) {
      return 'Not within horizon';
    }
    if (upper === 0 && (lower === 0 || lower === null || lower === undefined)) {
      if (lower === 0) return 'Immediate';
      return `Immediate – ${lower === null || lower === undefined ? '∞' : formatMonths(lower)}`;
    }
    const upperStr = upper === 0 ? 'Immediate' : formatMonths(upper);
    const lowerStr = (lower === null || lower === undefined) ? '∞' : formatMonths(lower);
    if (upper === lower) {
      return upperStr;
    }
    return `${upperStr} – ${lowerStr}`;
  }
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
    {#if results.revenue_integrity_status === 'block'}
      <div id="scenario-dashboard-container" class="space-y-6">
        <Card class="border-rose-500/30 bg-rose-500/5 p-4 select-none">
          <CardContent class="flex items-start space-x-3 text-sm p-0">
            <Info class="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h4 class="font-bold text-rose-600 dark:text-rose-400">Revenue Integrity Blocked</h4>
              <p class="text-muted-foreground mt-1 text-xs">{results.revenue_integrity_message}</p>
              <div class="mt-2.5">
                <Button href="/scenarios/{scenario.id}/edit" size="sm" variant="outline" class="h-7 text-xs font-semibold px-3.5 border-rose-500/25 text-rose-600 dark:text-rose-400 hover:bg-rose-500/5">
                  Edit Scenario to Fix
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    {:else}
      <div id="scenario-dashboard-container" class="space-y-6">
        {#if results.revenue_integrity_status === 'warn'}
          <Card class="border-amber-500/30 bg-amber-500/5 p-4 select-none">
            <CardContent class="flex items-start space-x-3 text-sm p-0">
              <Info class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-amber-600 dark:text-amber-400">Revenue Integrity Warning</h4>
                <p class="text-muted-foreground mt-1 text-xs">{results.revenue_integrity_message}</p>
              </div>
            </CardContent>
          </Card>
        {/if}

        <DiagnosticsBanner {diagnostics} />

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
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 {results.evc ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}">
        <!-- EVC -->
        {#if results.evc}
          <Card class="glass border glass-glow [--glow-color:var(--primary)] select-none p-4 flex flex-col justify-between">
            <div>
              <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Economic Value (EVC)</span>
              <CardTitle class="text-base font-black text-primary mt-2 block">
                {formatCurrency(results.evc.evc, appState.currency, 0)}
              </CardTitle>
            </div>
            <div class="text-[9px] text-muted-foreground/80 mt-1">
              Target Price: <span class="font-bold text-foreground">{formatCurrency(results.evc.priceTarget, appState.currency, 0)}</span> (30%)
            </div>
          </Card>
        {/if}

        <!-- NPV -->
        <Card class="glass border glass-glow [--glow-color:var(--color-emerald-500)] select-none p-4 flex flex-col justify-between">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Incremental NPV Range</span>
            <CardTitle class="text-base font-black mt-2 block {results.npv >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
              {#if results.npv_lower !== undefined && results.npv_lower !== results.npv}
                {formatCurrency(results.npv_lower, appState.currency, 0)} – {formatCurrency(results.npv, appState.currency, 0)}
              {:else}
                {formatCurrency(results.npv, appState.currency, 0)}
              {/if}
            </CardTitle>
          </div>
          <div class="text-[10px] text-muted-foreground/80 mt-1">Discounted lifetime net value</div>
        </Card>

        <!-- IRR -->
        <Card class="glass border glass-glow [--glow-color:var(--primary)] select-none p-4 flex flex-col justify-between">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Nominal Guarded IRR</span>
            <span class="text-xl font-black mt-2 block {results.irr_status === 'ok' && results.irr_annual_nominal !== null && results.irr_annual_nominal !== undefined && results.irr_annual_nominal >= scenario.discount_rate ? 'text-emerald-600 dark:text-emerald-400' : results.irr_status === 'ok' ? 'text-amber-400' : 'text-muted-foreground'}">
              {formatIrr(results)}
            </span>
          </div>
          <div class="text-[10px] text-muted-foreground/80 mt-1">
            {#if results.irr_status && results.irr_status !== 'ok'}
              Status: <span class="capitalize font-medium text-amber-500">{results.irr_status.replace(/_/g, ' ')}</span>
            {:else}
              Hurdle rate: {formatPercent(scenario.discount_rate)}
            {/if}
          </div>
        </Card>

        <!-- Payback Period -->
        <Card class="glass border glass-glow [--glow-color:var(--color-cyan-500)] select-none p-4 flex flex-col justify-between">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Payback Period Range</span>
            <span class="text-sm font-black text-cyan-600 dark:text-cyan-400 mt-2 block">
              {formatPaybackRange(results.payback_months, results.payback_months_lower)}
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

        <!-- Profitability Index (PI) -->
        <Card class="glass border glass-glow [--glow-color:var(--color-emerald-500)] select-none p-4 flex flex-col justify-between col-span-2 lg:col-span-1">
          <div>
            <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Profitability Index (PI) Range</span>
            <span class="text-sm font-black mt-2 block {results.profitability_index >= 1.0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
              {#if results.profitability_index_lower !== undefined && results.profitability_index_lower !== results.profitability_index}
                {formatPI(results.profitability_index_lower)} – {formatPI(results.profitability_index)}
              {:else}
                {formatPI(results.profitability_index)}
              {/if}
            </span>
          </div>
          <div class="text-[10px] text-muted-foreground/80 mt-1">Present Value of benefits divided by Present Value of costs (mnożnik inwestycji)</div>
        </Card>
      </div>

      <!-- Two-stream economics (ADR 0009) — only shown when the scenario mixes copilot + agent services -->
      {#if driverProfile === 'mixed' && streamMargins}
        <Card class="glass border p-4 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center space-x-2 text-primary font-semibold text-sm select-none">
              <BrainCircuit class="h-4 w-4" />
              <span>Two-Stream Economics</span>
            </div>
            <span class="text-[10px] text-muted-foreground uppercase tracking-wider">Blended margin: <span class="font-bold text-foreground">{formatPercent(streamMargins.blended)}</span></span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Copilot stream -->
            <div class="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
              <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Copilot Stream (seat)</span>
              <div class="flex items-baseline justify-between">
                <span class="text-xs text-muted-foreground">Outcome revenue</span>
                <span class="text-sm font-bold font-mono">{formatCurrency(streamTotals.copilotRevenue, appState.currency, 0)}</span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="text-xs text-muted-foreground">COGS</span>
                <span class="text-sm font-mono">{formatCurrency(streamTotals.copilotCogs, appState.currency, 0)}</span>
              </div>
              <div class="flex items-baseline justify-between pt-1.5 border-t border-border/40">
                <span class="text-xs text-muted-foreground">Margin vs. threshold</span>
                {#if streamMargins.copilot === null}
                  <span class="text-xs text-muted-foreground">n/a</span>
                {:else}
                  <span class="text-sm font-bold {streamMargins.copilot >= streamMargins.copilotThreshold ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}">
                    {formatPercent(streamMargins.copilot)} <span class="text-muted-foreground font-normal">/ {formatPercent(streamMargins.copilotThreshold)}</span>
                  </span>
                {/if}
              </div>
            </div>
            <!-- Agent stream -->
            <div class="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
              <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Agent Stream (interaction)</span>
              <div class="flex items-baseline justify-between">
                <span class="text-xs text-muted-foreground">Revenue + labor savings</span>
                <span class="text-sm font-bold font-mono">{formatCurrency(streamTotals.agentRevenue, appState.currency, 0)}</span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="text-xs text-muted-foreground">COGS</span>
                <span class="text-sm font-mono">{formatCurrency(streamTotals.agentCogs, appState.currency, 0)}</span>
              </div>
              <div class="flex items-baseline justify-between pt-1.5 border-t border-border/40">
                <span class="text-xs text-muted-foreground">Margin vs. threshold</span>
                {#if streamMargins.agent === null}
                  <span class="text-xs text-muted-foreground">n/a</span>
                {:else}
                  <span class="text-sm font-bold {streamMargins.agent >= streamMargins.agentThreshold ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}">
                    {formatPercent(streamMargins.agent)} <span class="text-muted-foreground font-normal">/ {formatPercent(streamMargins.agentThreshold)}</span>
                  </span>
                {/if}
              </div>
            </div>
          </div>
          {#if (streamMargins.copilot !== null && streamMargins.copilot < streamMargins.copilotThreshold) || (streamMargins.agent !== null && streamMargins.agent < streamMargins.agentThreshold)}
            <div class="flex items-start space-x-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-md p-2">
              <AlertTriangle class="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>One or more streams are below their soft margin threshold — informational only, this does not block saving.</span>
            </div>
          {/if}
        </Card>
      {/if}

      <!-- Credit pool (ADR 0010) — tier MRR, breakage, EVC-based stream attribution -->
      {#if poolEconomics}
        <Card class="glass border p-4 space-y-3">
          <div class="flex items-center space-x-2 text-primary font-semibold text-sm select-none">
            <Wallet class="h-4 w-4" />
            <span>Credit Pool</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                Tier Fee ({poolEconomics.feeBasis === 'per_member' ? 'per member' : (poolEconomics.feeBasis === 'per_customer' ? 'per customer' : 'flat')})
              </span>
              <span class="text-sm font-bold font-mono block mt-0.5">{formatCurrency(poolEconomics.tierMonthlyFee, appState.currency, 0)}</span>
            </div>
            <div>
              <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                Pool Size ({poolEconomics.poolSizeBasis === 'per_member' ? 'per member' : 'absolute'})
              </span>
              <span class="text-sm font-bold font-mono block mt-0.5">{poolEconomics.poolSize.toLocaleString()} credits</span>
            </div>
            <div>
              <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Consumed (lifetime)</span>
              <span class="text-sm font-bold font-mono block mt-0.5">{poolEconomics.totalConsumedCredits.toLocaleString()} credits</span>
            </div>
            <div>
              <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Overage Revenue (lifetime)</span>
              <span class="text-sm font-bold font-mono block mt-0.5">{formatCurrency(poolEconomics.totalOverageRevenue, appState.currency, 0)}</span>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-2 border-t border-border/40 text-xs gap-2">
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <span class="text-muted-foreground">
                Total Fee Revenue: <span class="font-bold text-foreground">{formatCurrency(poolEconomics.totalTierFeeRevenue, appState.currency, 0)}</span>
              </span>
              <span class="text-muted-foreground">
                Breakage, lifetime (memo): <span class="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(poolEconomics.totalBreakage, appState.currency, 0)}</span>
              </span>
            </div>
            <span class="text-muted-foreground">
              Attribution ({poolEconomics.attribution.method === 'evc' ? 'by EVC' : (poolEconomics.attribution.method === 'profile_fallback' ? 'by profile' : 'even split — no value_per_outcome set')}):
              <span class="font-bold text-foreground">copilot {(poolEconomics.attribution.copilotShare * 100).toFixed(0)}%</span> /
              <span class="font-bold text-foreground">agent {(poolEconomics.attribution.agentShare * 100).toFixed(0)}%</span>
            </span>
          </div>
        </Card>
      {/if}

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
            <button
              class="px-2 py-1 rounded transition {activeTab === 'value_split' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => activeTab = 'value_split'}
            >
              Value Split
            </button>
            <button
              class="px-2 py-1 rounded transition {activeTab === 'pricing_corridor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => activeTab = 'pricing_corridor'}
            >
              Pricing Corridor
            </button>
            <button
              class="px-2 py-1 rounded transition {activeTab === 'margin_waterfall' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => activeTab = 'margin_waterfall'}
            >
              Margin Waterfall
            </button>
            {#if (driverProfile === 'interaction_only' || driverProfile === 'mixed') && data.agentDeflectionCorridor && data.agentDeflectionCorridor.points.length > 0}
              <button
                class="px-2 py-1 rounded transition {activeTab === 'cost_to_serve' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
                onclick={() => activeTab = 'cost_to_serve'}
              >
                Cost-to-Serve
              </button>
            {/if}
          </div>
        </CardHeader>

        <CardContent class="p-4 bg-background/5">
          {#if timeline.length === 0}
            <div class="h-[360px] flex items-center justify-center text-sm text-muted-foreground italic">
              No cashflow data available.
            </div>
          {:else}
            {#if activeTab === 'value_split'}
              <div class="space-y-6">
                {#if !scenario.evc_nba_annual_value}
                  <div class="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground italic space-y-2">
                    <DollarSign class="h-10 w-10 text-muted-foreground/50" />
                    <span>EVC parameters are not configured for this scenario.</span>
                    <a href="/scenarios/{scenario.id}/edit" class="text-xs text-primary underline hover:text-primary/80">Edit scenario to configure Next Best Alternative & EVC</a>
                  </div>
                {:else}
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div bind:this={valuePieElement} class="h-[280px] w-full"></div>
                    <div bind:this={captureCurveElement} class="h-[280px] w-full"></div>
                  </div>

                  <!-- Dual-Lens View -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/40 pt-4 text-xs select-none">
                    <!-- Customer Lens -->
                    <div class="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-2.5">
                      <h4 class="font-bold text-blue-600 dark:text-blue-400 flex items-center uppercase tracking-wider text-[10px]">
                        <Info class="h-3.5 w-3.5 mr-1" /> Customer Lens (Buying Driver)
                      </h4>
                      <p class="text-muted-foreground text-[11px]">
                        How the customer evaluates the purchase compared to doing nothing (Next Best Alternative).
                      </p>
                      <div class="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                        <div class="flex justify-between border-b border-border/40 pb-1">
                          <span class="text-muted-foreground">EVC (Annualized):</span>
                          <span class="font-semibold text-foreground">{formatCurrency((results?.evc?.evc ?? 0) * 12, appState.currency, 0)}</span>
                        </div>
                        <div class="flex justify-between border-b border-border/40 pb-1">
                          <span class="text-muted-foreground">EVC (Monthly/User):</span>
                          <span class="font-semibold text-foreground">{formatCurrency(results?.evc?.evc ?? 0, appState.currency, 0)}</span>
                        </div>
                        <div class="flex justify-between border-b border-border/40 pb-1 col-span-2 font-semibold">
                          <span class="text-muted-foreground">Customer Surplus (Target):</span>
                          <span class="text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(results?.evc?.customerSurplusPerUserMonth ?? 0, appState.currency, 0)}/mo ({results?.evc?.netCreatedValue ? Math.round(((results?.evc?.customerSurplusPerUserMonth ?? 0) / results?.evc?.netCreatedValue) * 100) : 0}% share)
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Vendor Lens -->
                    <div class="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-2.5">
                      <h4 class="font-bold text-emerald-600 dark:text-emerald-400 flex items-center uppercase tracking-wider text-[10px]">
                        <TrendingUp class="h-3.5 w-3.5 mr-1" /> Vendor Lens (Pricing Driver)
                      </h4>
                      <p class="text-muted-foreground text-[11px]">
                        How pricing captures value and impacts overall cohort NPV considering adoption elasticity.
                      </p>
                      <div class="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                        <div class="flex justify-between border-b border-border/40 pb-1">
                          <span class="text-muted-foreground">Optimal Capture Share:</span>
                          <span class="font-semibold text-foreground">
                            {data.captureCurve ? Math.round(data.captureCurve.optimalCapture * 100) : 0}%
                          </span>
                        </div>
                        <div class="flex justify-between border-b border-border/40 pb-1">
                          <span class="text-muted-foreground">Optimal Overlay Price:</span>
                          <span class="font-semibold text-primary">
                            {formatCurrency(data.captureCurve?.optimalOverlayPrice ?? 0, appState.currency, 0)}/mo
                          </span>
                        </div>
                        <div class="flex justify-between border-b border-border/40 pb-1 col-span-2 font-semibold">
                          <span class="text-muted-foreground">Elasticity Sensitivity Band:</span>
                          <span class="text-foreground">
                            {data.captureCurve?.epsilonBand ? Math.round(data.captureCurve.epsilonBand.low * 100) : 0}% &ndash; {data.captureCurve?.epsilonBand ? Math.round(data.captureCurve.epsilonBand.high * 100) : 0}% capture
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            {:else if activeTab === 'pricing_corridor'}
              <div class="space-y-6">
                {#if !scenario.evc_nba_annual_value}
                  <div class="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground italic space-y-2">
                    <DollarSign class="h-10 w-10 text-muted-foreground/50" />
                    <span>EVC parameters are not configured for this scenario.</span>
                    <a href="/scenarios/{scenario.id}/edit" class="text-xs text-primary underline hover:text-primary/80">Edit scenario to configure Next Best Alternative & EVC</a>
                  </div>
                {:else}
                  {#if !data.pricingCorridor || data.pricingCorridor.points.length === 0}
                    <div class="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground italic space-y-2">
                      <Info class="h-10 w-10 text-muted-foreground/50" />
                      <span>Pricing Corridor requires at least one cohort configuration to display.</span>
                    </div>
                  {:else}
                    <div bind:this={pricingCorridorElement} class="h-[360px] w-full"></div>
                    {#if data.pricingCorridor.points.some((p: any) => p.isReference)}
                      <p class="text-[11px] text-muted-foreground italic text-center -mt-2">
                        ★ marks the EVC reference cohort — other cohorts' ceilings are scaled from it via per-cohort multipliers (ADR 0011).
                      </p>
                    {/if}
                    {#if data.pricingCorridor && data.pricingCorridor.hasBreak}
                      <div class="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start space-x-2">
                        <AlertTriangle class="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <span class="font-bold block">Corridor Break Detected!</span>
                          <span class="text-muted-foreground">For heavy adoption cohorts, AI cost-to-serve exceeds the realized price per user, leading to a negative margin contribution.</span>
                        </div>
                      </div>
                    {/if}
                  {/if}
                {/if}
              </div>
            {:else if activeTab === 'margin_waterfall'}
              <div class="space-y-6">
                {#if !scenario.evc_nba_annual_value}
                  <div class="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground italic space-y-2">
                    <DollarSign class="h-10 w-10 text-muted-foreground/50" />
                    <span>EVC parameters are not configured for this scenario.</span>
                    <a href="/scenarios/{scenario.id}/edit" class="text-xs text-primary underline hover:text-primary/80">Edit scenario to configure Next Best Alternative & EVC</a>
                  </div>
                {:else}
                  {#if !data.pocketMarginWaterfall || data.pocketMarginWaterfall.steps.length === 0}
                    <div class="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground italic space-y-2">
                      <Info class="h-10 w-10 text-muted-foreground/50" />
                      <span>Failed to resolve Pocket-Margin Waterfall data.</span>
                    </div>
                  {:else}
                    <div bind:this={marginWaterfallElement} class="h-[360px] w-full"></div>
                  {/if}
                {/if}
              </div>
            {:else if activeTab === 'cost_to_serve'}
              <div class="space-y-6">
                {#if !data.agentDeflectionCorridor || data.agentDeflectionCorridor.points.length === 0}
                  <div class="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground italic space-y-2">
                    <Info class="h-10 w-10 text-muted-foreground/50" />
                    <span>Cost-to-Serve Corridor requires an agent-archetype service with a per-customer interaction driver.</span>
                  </div>
                {:else}
                  <div bind:this={costToServeElement} class="h-[360px] w-full"></div>
                  {#if data.agentDeflectionCorridor.hasBreak}
                    <div class="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start space-x-2">
                      <AlertTriangle class="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <span class="font-bold block">Cost-to-Serve Break Detected!</span>
                        <span class="text-muted-foreground">For at least one cohort, AI cost-to-serve plus failed-deflection cost exceeds the displaced-labor value avoided, leading to a negative deflection margin.</span>
                      </div>
                    </div>
                  {/if}
                {/if}
              </div>
            {:else}
              <div bind:this={chartElement} class="h-[360px] w-full"></div>
            {/if}
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
    {#if scenario.modeling_type !== 'gtm'}
      <div class="mt-6">
        <div class="glass border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            class="w-full flex items-center justify-between p-4 font-bold text-sm bg-muted/20 hover:bg-muted/40 transition select-none text-left"
            onclick={() => isExplainerOpen = !isExplainerOpen}
          >
            <div class="flex items-center space-x-2">
              <Info class="h-4 w-4 text-primary" />
              <span>How this is calculated (Cohort PI Methodology)</span>
            </div>
            <span class="text-xs text-muted-foreground font-semibold">{isExplainerOpen ? 'Hide' : 'Show Details'}</span>
          </button>

          {#if isExplainerOpen}
            <div class="p-4 border-t border-border space-y-4 text-xs leading-relaxed text-muted-foreground bg-background/5">
              <p>
                Sherpa uses a counterfactual <strong>cohort-based adopter/non-adopter split</strong> model.
                Instead of applying a blended average to the entire group, the target population is partitioned into two distinct sub-cohorts.
              </p>
              <p>
                To provide CFO-grade realism, Sherpa displays NPV, Payback, and Profitability Index (PI) as a range:
              </p>
              <ul class="list-disc list-inside pl-2 space-y-1">
                <li><strong>Lower Bound:</strong> Price/ARPU uplift effect only. Customer counts (churn, acquisition) follow the baseline projection.</li>
                <li><strong>Upper Bound:</strong> Full retention + acquisition + price effect (the standard model).</li>
              </ul>

              {#each resolvedConfigs || [] as cc}
                {@const targetA = cc.ai_adoption_rate || 0}
                {@const rampMonths = cc.adoption_ramp_months || 0}
                {@const a0 = rampMonths === 0 ? targetA : Math.min(1, 1 / rampMonths) * targetA}
                {@const grossMargin = cc.gross_margin !== undefined ? cc.gross_margin : 1.0}
                
                {@const startAdopters = Math.round(cc.current_users * a0)}
                {@const startNonAdopters = Math.round(cc.current_users * (1 - a0))}
                
                {@const acqUplift = cc.acquisition_uplift || 0}
                {@const churnRed = cc.churn_reduction || 0}
                {@const arpuUp = cc.arpu_uplift || 0}
                {@const arpuUpPct = cc.arpu_uplift_percent || 0}

                {@const baseAcq = cc.monthly_acquisition || 0}
                {@const withAiAcq = baseAcq * (1 + acqUplift)}
                {@const adopterAcq = withAiAcq * targetA}
                {@const nonAdopterAcq = withAiAcq * (1 - targetA)}
                
                {@const baseChurn = cc.monthly_churn_rate || 0}
                {@const adopterChurn = baseChurn * (1 - churnRed)}
                
                {@const baseArpu = cc.base_arpu || 0}
                {@const adopterArpu = baseArpu * (1 + arpuUpPct) + arpuUp}
                
                {@const m0AdopterRev = startAdopters * adopterArpu}
                {@const m0NonAdopterRev = startNonAdopters * baseArpu}
                {@const m0WithAi = m0AdopterRev + m0NonAdopterRev}
                {@const m0BaseRev = cc.current_users * baseArpu}
                {@const m0Net = m0WithAi - m0BaseRev}
                {@const m0NetMargin = m0Net * grossMargin}

                <div class="bg-muted/30 border border-border/50 rounded-lg p-3 space-y-3">
                  <h4 class="font-bold text-foreground text-sm flex items-center justify-between">
                    <span>Cohort: {cc.name}</span>
                    <div class="flex items-center space-x-1.5">
                      {#if rampMonths > 0}
                        <Badge variant="secondary" class="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">Ramp: {rampMonths} mos</Badge>
                      {/if}
                      <Badge variant="secondary" class="text-[10px]">Gross Margin: {formatPercent(grossMargin)}</Badge>
                      <Badge variant="secondary" class="text-[10px]">Target Adoption: {formatPercent(targetA)}</Badge>
                    </div>
                  </h4>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                      <span class="font-semibold text-foreground block text-[10px] uppercase tracking-wider">Sub-Cohort Partitioning (Month 0)</span>
                      <ul class="list-disc list-inside space-y-1">
                        <li><strong>AI Adopters ({formatPercent(a0)}):</strong> Starts with <span class="text-foreground font-bold">{formatNumber(startAdopters)}</span> customers.</li>
                        <li><strong>Non-Adopters ({formatPercent(1 - a0)}):</strong> Starts with <span class="text-foreground font-bold">{formatNumber(startNonAdopters)}</span> customers.</li>
                        {#if rampMonths > 0}
                          <li class="list-none pl-4 text-[10px] text-amber-500">
                            (Target {formatPercent(targetA)} scaled by Month 0 adoption ramp: 1/{rampMonths} = {formatPercent(1/rampMonths, 0)})
                          </li>
                        {/if}
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
                    <span class="font-semibold text-foreground block text-[10px] uppercase tracking-wider mb-1">Month 0 Revenue & Margin Hand-Check</span>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2 text-[11px]">
                      <div>Adopters: <span class="font-mono font-bold text-foreground">{formatCurrency(m0AdopterRev, appState.currency, 0)}</span></div>
                      <div>Non-Adopters: <span class="font-mono font-bold text-foreground">{formatCurrency(m0NonAdopterRev, appState.currency, 0)}</span></div>
                      <div>With-AI: <span class="font-mono font-bold text-foreground">{formatCurrency(m0WithAi, appState.currency, 0)}</span></div>
                      <div>Baseline: <span class="font-mono font-bold text-foreground">{formatCurrency(m0BaseRev, appState.currency, 0)}</span></div>
                      <div class="text-foreground font-semibold">Gross Incremental: <span class="font-mono font-bold">{formatCurrency(m0Net, appState.currency, 0)}</span></div>
                      <div class="text-emerald-600 dark:text-emerald-400 font-bold">Net Margin (x{formatPercent(grossMargin, 0)}): <span class="font-mono">{formatCurrency(m0NetMargin, appState.currency, 0)}</span></div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
    {/if}
  {/if}
</div>
