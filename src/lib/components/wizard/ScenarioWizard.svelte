<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import { NumberField } from '$lib/components/forms';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Slider from '$lib/components/ui/slider/slider.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import ScenarioMonetizationOverrides from '$lib/components/catalog/ScenarioMonetizationOverrides.svelte';
  import ScenarioEntityOverrides from '$lib/components/catalog/ScenarioEntityOverrides.svelte';

  // Lucide Icons
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Save from '@lucide/svelte/icons/save';
  import Compass from '@lucide/svelte/icons/compass';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import DollarSign from '@lucide/svelte/icons/dollar-sign';
  import Edit2 from '@lucide/svelte/icons/edit-2';
  import Info from '@lucide/svelte/icons/info';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import DiagnosticsBanner from '$lib/components/dashboard/DiagnosticsBanner.svelte';

  import { resolveScenarioCohortsClient, buildDraftScenario } from '$lib/shared/scenario-preview';
  import Switch from '$lib/components/ui/switch/switch.svelte';
  import {
    calculateScenario,
    resolveCarrier,
    validateRevenueIntegrity,
    validateScenarioConfig,
    buildPenetrationCurve,
    deriveModelingType
  } from '$lib/shared/financial-math';
  import type { ModelingType, RevenueCarrier, RevenueBridge, ScopeOverride, CohortConfig } from '$lib/shared/types';
  import { normalizeScenarioCurrency } from '$lib/shared/currency';
  import { formatCurrency, formatPercent, formatMonths, formatIrr, formatPI, getCurrencySymbol } from '$lib/utils/format';
  import { mode } from 'mode-watcher';
  import { appState } from '$lib/stores/app.svelte';

  let { data, mode: wizardMode, action, form } = $props();

  // Wizard Navigation
  let currentStep = $state(1);

  // Step 1: Details & Scope
  let name = $state('');
  let description = $state('');
  let projectionMonths = $state(36);
  let discountRateArr = $state([10]); // slider
  const discountRate = $derived(discountRateArr[0]);
  let capexContingencyPctArr = $state([0]); // slider
  const capexContingencyPct = $derived(capexContingencyPctArr[0]);

  let scopeType = $state<'all_clients' | 'cohorts'>('all_clients');
  let modelingType = $state<ModelingType>('incremental');
  let revenueCarrier = $state<RevenueCarrier | null>('cohort');
  let revenueBridge = $state<RevenueBridge | null>(null);
  let poolTierId = $state<string>('');
  let selectedCohorts = $state<Record<string, boolean>>({});
  
  // Cohort picker filter
  let selectedVerticalFilter = $state<string>('');

  // S-Curve Expansion parameters (Phase 3)
  let expansion_vertical_id = $state<string | null>(null);
  let penetration_baseline_months = $state(12);
  let ai_acceleration_factor_arr = $state([0.6]);
  const ai_acceleration_factor = $derived(ai_acceleration_factor_arr[0]);
  let ai_som_lift_pct_arr = $state([25]);
  const ai_som_lift_pct = $derived(ai_som_lift_pct_arr[0]);

  // EVC inputs
  let evc_nba_annual_value = $state<number | null>(null);
  let evc_extra_positive_value = $state<number | null>(null);
  let evc_negative_value = $state<number | null>(null);
  let evc_capture_ceiling_pct_arr = $state([50]);
  const evc_capture_ceiling_pct = $derived(evc_capture_ceiling_pct_arr[0] / 100);
  let evc_capture_target_pct_arr = $state([30]);
  const evc_capture_target_pct = $derived(evc_capture_target_pct_arr[0] / 100);
  let evc_capture_floor_pct_arr = $state([15]);
  const evc_capture_floor_pct = $derived(evc_capture_floor_pct_arr[0] / 100);
  let price_from_evc = $state(false);
  let adoption_elasticity_arr = $state([0.0]);
  const adoption_elasticity = $derived(adoption_elasticity_arr[0]);

  // Derived resolved carrier
  const resolvedCarrier = $derived(resolveCarrier(modelingType, revenueCarrier));

  // Step 2: Overrides
  type OverrideRow = {
    target_type: 'all_clients' | 'cohort';
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

  // Sync overrides structure to selection
  $effect(() => {
    const _scopeType = scopeType;
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
  let seatsPlans = $state<Record<string, number>>({});

  const totalSeatsScheduled = $derived.by(() => {
    if (expansion_vertical_id) {
      // Dynamic seats from curve at the end of projection
      const curves = currentExpansionCurves;
      if (curves) {
        return Math.round(curves.withAiUpper[projectionMonths - 1]);
      }
    }
    return Object.keys(seatsPlans)
      .filter(id => selectedPlans[id])
      .reduce((sum, id) => sum + (seatsPlans[id] || 0), 0);
  });

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

  // S-Curve calculations preview (Phase 3)
  const currentSelectedVerticalObj = $derived(data.verticals.find((v: any) => v.id === expansion_vertical_id));
  const currentExpansionCurves = $derived.by(() => {
    if (!expansion_vertical_id || !currentSelectedVerticalObj) return null;
    const v = currentSelectedVerticalObj;
    return buildPenetrationCurve({
      tam: v.tam_users || 0,
      sam: v.sam_users || 0,
      som: v.som_users || 0,
      baselineMonths: penetration_baseline_months,
      accelerationFactor: ai_acceleration_factor,
      somLiftPct: ai_som_lift_pct / 100,
      projectionMonths
    });
  });

  // Hydration state for edit mode
  let hydrated = $state(false);

  $effect(() => {
    const s = data.scenario;
    if (!s || hydrated || wizardMode !== 'edit') return;
    untrack(() => {
      name = s.name;
      description = s.description || '';
      projectionMonths = s.projection_months;
      discountRateArr = [Math.round(s.discount_rate * 100)];
      capexContingencyPctArr = [Math.round((s.capex_contingency_pct || 0) * 100)];
      scopeType = s.scope_type === 'verticals' ? 'cohorts' : s.scope_type;
      modelingType = s.modeling_type ?? 'appraisal';
      revenueCarrier = s.revenue_carrier ?? 'cohort';
      revenueBridge = s.revenue_bridge ?? null;
      poolTierId = s.pool_tier_id ?? '';
      expansion_vertical_id = s.expansion_vertical_id ?? null;
      penetration_baseline_months = s.penetration_baseline_months ?? 12;
      ai_acceleration_factor_arr = [s.ai_acceleration_factor ?? 0.6];
      ai_som_lift_pct_arr = [Math.round((s.ai_som_lift_pct ?? 0.25) * 100)];
      evc_nba_annual_value = s.evc_nba_annual_value ?? null;
      evc_extra_positive_value = s.evc_extra_positive_value ?? null;
      evc_negative_value = s.evc_negative_value ?? null;
      evc_capture_ceiling_pct_arr = [Math.round((s.evc_capture_ceiling_pct ?? 0.50) * 100)];
      evc_capture_target_pct_arr = [Math.round((s.evc_capture_target_pct ?? 0.30) * 100)];
      evc_capture_floor_pct_arr = [Math.round((s.evc_capture_floor_pct ?? 0.15) * 100)];
      price_from_evc = !!s.price_from_evc;
      adoption_elasticity_arr = [s.adoption_elasticity ?? 0.0];

      selectedCohorts = {};
      if (s.scope_cohorts) {
        for (const c of s.scope_cohorts) {
          selectedCohorts[c.id] = true;
        }
      }

      if (s.scope_overrides) {
        overrides = s.scope_overrides.map((ov: any) => {
          let targetName = 'Global Client Base';
          if (ov.target_type === 'vertical') {
            targetName = data.verticals.find((v: any) => v.id === ov.target_id)?.name || ov.target_id;
          } else if (ov.target_type === 'cohort') {
            targetName = data.cohorts.find((c: any) => c.id === ov.target_id)?.name || ov.target_id;
          }
          return {
            target_type: ov.target_type === 'vertical' ? 'cohort' : ov.target_type, // fallback vertical scope
            target_id: ov.target_id,
            name: targetName,
            monthly_churn_rate: ov.monthly_churn_rate !== null ? Math.round(ov.monthly_churn_rate * 1000) / 10 : null,
            monthly_acquisition: ov.monthly_acquisition,
            acquisition_growth_rate: ov.acquisition_growth_rate !== null ? Math.round(ov.acquisition_growth_rate * 1000) / 10 : null,
            ai_adoption_rate: ov.ai_adoption_rate !== null ? Math.round(ov.ai_adoption_rate * 1000) / 10 : null,
            retention_floor: ov.retention_floor !== null ? Math.round(ov.retention_floor * 1000) / 10 : null,
            expansion_rate: ov.expansion_rate !== null ? Math.round(ov.expansion_rate * 1000) / 10 : null,
            arpu_override: ov.arpu_override,
            arpu_uplift: ov.arpu_uplift,
            arpu_uplift_percent: ov.arpu_uplift_percent !== null ? Math.round(ov.arpu_uplift_percent * 1000) / 10 : null,
            churn_reduction: ov.churn_reduction !== null ? Math.round(ov.churn_reduction * 1000) / 10 : null,
            acquisition_uplift: ov.acquisition_uplift !== null ? Math.round(ov.acquisition_uplift * 1000) / 10 : null
          };
        });
      } else {
        overrides = [];
      }

      selectedServices = {};
      rolloutServices = {};
      if (s.services) {
        for (const srv of s.services) {
          selectedServices[srv.id] = true;
          rolloutServices[srv.id] = srv.rollout_month;
        }
      }

      selectedPacks = {};
      rolloutPacks = {};
      if (s.packs) {
        for (const p of s.packs) {
          selectedPacks[p.id] = true;
          rolloutPacks[p.id] = p.rollout_month;
        }
      }

      selectedPlans = {};
      rolloutPlans = {};
      seatsPlans = {};
      if (s.plans) {
        for (const pl of s.plans) {
          selectedPlans[pl.id] = true;
          rolloutPlans[pl.id] = pl.rollout_month;
          seatsPlans[pl.id] = pl.seats ?? 0;
        }
      }

      selectedCosts = {};
      if (s.costs) {
        for (const c of s.costs) {
          selectedCosts[c.id] = true;
        }
      }
      hydrated = true;
    });
  });

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
    return resolveScenarioCohortsClient(scopeType, data.cohorts, selectedCohorts, formattedOverrides as any[]);
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
        scopeType,
        capexContingencyPct: capexContingencyPct / 100,
        modelingType,
        revenueCarrier: resolvedCarrier,
        revenueBridge,
        expansion_vertical_id,
        penetration_baseline_months,
        ai_acceleration_factor,
        ai_som_lift_pct: ai_som_lift_pct / 100,
        evc_nba_annual_value,
        evc_extra_positive_value,
        evc_negative_value,
        evc_capture_ceiling_pct,
        evc_capture_target_pct,
        evc_capture_floor_pct,
        price_from_evc,
        adoption_elasticity
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
      data.costs,
      currentSelectedVerticalObj
    );
  });

  const integrityResult = $derived(validateRevenueIntegrity(draftScenario as any));

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

  const diagnostics = $derived(
    validateScenarioConfig(draftScenario as any, data.settings, data.providers, undefined, previewResult ?? undefined)
  );

  // Field-specific validation mapping
  const fieldDiagnostics = $derived.by(() => {
    const map: Record<string, string[]> = {};
    for (const d of diagnostics) {
      if (d.field) {
        if (!map[d.field]) map[d.field] = [];
        map[d.field].push(d.message);
      }
    }
    return map;
  });

  // Global diagnostics that don't belong to a specific input field
  const globalDiagnostics = $derived(
    diagnostics.filter(d => !d.field || d.code === 'mixed_currency' || d.code === 'zero_benefit_despite_uplifts')
  );

  const hasUplifts = $derived(
    (draftScenario.scope_cohorts ?? []).some((c: any) =>
      (c.arpu_uplift_percent ?? 0) > 0 || (c.arpu_uplift ?? 0) > 0 ||
      (c.churn_reduction ?? 0) > 0 || (c.acquisition_uplift ?? 0) > 0
    )
  );

  const hasNoAiBenefit = $derived(
    resolvedCarrier === 'cohort' && !hasUplifts && (previewResult && previewResult.timeline && previewResult.timeline.length > 0
      ? previewResult.timeline.every((t: any) => Math.abs(t.revenue) < 0.01)
      : true)
  );

  // ECharts Logic
  let chartElement: HTMLDivElement | undefined = $state();
  let chartInstance: any = null;
  let resizeListener: (() => void) | null = null;

  let expansionChartElement: HTMLDivElement | undefined = $state();
  let expansionChartInstance: any = null;
  let expansionResizeListener: (() => void) | null = null;

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

    const monthsLabel = previewResult.timeline.map((t: any) => `Month ${t.month + 1}`);

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

  const expansionChartOptions = $derived.by(() => {
    if (!currentExpansionCurves) return {};
    const isDark = mode.current === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const axisColor = isDark ? '#94a3b8' : '#64748b';
    const lineColor = isDark ? '#475569' : '#e2e8f0';
    const splitLineColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.6)';
    const tooltipBg = isDark ? '#1e293b' : '#ffffff';
    const tooltipBorder = isDark ? '#475569' : '#e2e8f0';
    const tooltipText = isDark ? '#f8fafc' : '#0f172a';

    const monthsLabel = Array.from({ length: projectionMonths }, (_, i) => `Month ${i + 1}`);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tooltipText }
      },
      legend: {
        data: ['Baseline (No AI)', 'AI Lower (Speed only)', 'AI Upper (Speed + SOM Lift)'],
        textStyle: { color: textColor, fontSize: 10 },
        bottom: 0
      },
      grid: { left: '3%', right: '4%', top: '10%', bottom: '20%', containLabel: true },
      xAxis: {
        type: 'category',
        data: monthsLabel,
        axisLabel: { color: axisColor, fontSize: 9 },
        axisLine: { lineStyle: { color: lineColor } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: axisColor, fontSize: 9 },
        axisLine: { lineStyle: { color: lineColor } },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      series: [
        {
          name: 'Baseline (No AI)',
          type: 'line',
          data: currentExpansionCurves.withoutAi.map(v => Math.round(v)),
          itemStyle: { color: '#94a3b8' },
          lineStyle: { width: 1.5, type: 'dashed' },
          symbol: 'none'
        },
        {
          name: 'AI Lower (Speed only)',
          type: 'line',
          data: currentExpansionCurves.withAiLower.map(v => Math.round(v)),
          itemStyle: { color: '#fb923c' },
          lineStyle: { width: 2 },
          symbol: 'none'
        },
        {
          name: 'AI Upper (Speed + SOM Lift)',
          type: 'line',
          data: currentExpansionCurves.withAiUpper.map(v => Math.round(v)),
          itemStyle: { color: '#10b981' },
          lineStyle: { width: 2.5 },
          symbol: 'none'
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

  function cleanupExpansionChart() {
    if (expansionChartInstance) {
      expansionChartInstance.dispose();
      expansionChartInstance = null;
    }
    if (expansionResizeListener) {
      window.removeEventListener('resize', expansionResizeListener);
      expansionResizeListener = null;
    }
  }

  let activeEffectId = 0;
  let activeExpansionEffectId = 0;

  function renderChart(currentRunId: number) {
    if (!chartElement || currentStep !== 5 || !previewResult) return;
    import('echarts').then((echarts) => {
      if (currentRunId !== activeEffectId) return;
      if (!chartElement || currentStep !== 5 || !previewResult) return;
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

  function renderExpansionChart(currentRunId: number) {
    if (!expansionChartElement || currentStep !== 3 || !currentExpansionCurves) return;
    import('echarts').then((echarts) => {
      if (currentRunId !== activeExpansionEffectId) return;
      if (!expansionChartElement || currentStep !== 3 || !currentExpansionCurves) return;
      if (expansionChartInstance) {
        expansionChartInstance.setOption(expansionChartOptions, true);
      } else {
        expansionChartInstance = echarts.init(expansionChartElement);
        expansionChartInstance.setOption(expansionChartOptions, true);
        expansionResizeListener = () => {
          expansionChartInstance?.resize();
        };
        window.addEventListener('resize', expansionResizeListener);
      }
    });
  }

  $effect(() => {
    const _options = chartOptions;
    const currentRunId = ++activeEffectId;
    if (((wizardMode === 'create' && currentStep === 6) || (wizardMode === 'edit' && currentStep === 5)) && previewResult && mode.current) {
      renderChart(currentRunId);
    } else {
      cleanupChart();
    }
    return () => {
      cleanupChart();
    };
  });

  $effect(() => {
    const _options = expansionChartOptions;
    const currentRunId = ++activeExpansionEffectId;
    if (currentStep === 3 && currentExpansionCurves && mode.current) {
      renderExpansionChart(currentRunId);
    } else {
      cleanupExpansionChart();
    }
    return () => {
      cleanupExpansionChart();
    };
  });

  const nextStep = () => {
    if (currentStep === 1) {
      if (!name.trim()) return alert('Scenario name is required.');
      if (scopeType === 'cohorts' && !Object.values(selectedCohorts).some(Boolean)) return alert('Select at least one cohort.');
    }
    currentStep += 1;
  };

  const prevStep = () => {
    currentStep -= 1;
  };

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

  // Per-entity monetization overrides (Step 3 edit-only)
  const monetizationEntities = $derived.by(() => {
    const rows: { type: 'plan' | 'pack' | 'service'; id: string; name: string; catalog: any; override: any }[] = [];
    const cat: Record<string, any> = data.monetizationCatalog ?? {};
    const ovr: Record<string, any> = data.monetizationOverrides ?? {};
    for (const p of data.plans) if (selectedPlans[p.id]) rows.push({ type: 'plan', id: p.id, name: p.name, catalog: cat[`plan:${p.id}`] ?? null, override: ovr[`plan:${p.id}`] ?? null });
    for (const p of data.packs) if (selectedPacks[p.id]) rows.push({ type: 'pack', id: p.id, name: p.name, catalog: cat[`pack:${p.id}`] ?? null, override: ovr[`pack:${p.id}`] ?? null });
    for (const s of data.services) if (selectedServices[s.id]) rows.push({ type: 'service', id: s.id, name: s.name, catalog: cat[`service:${s.id}`] ?? null, override: ovr[`service:${s.id}`] ?? null });
    return rows;
  });
  const monetizationKey = $derived(monetizationEntities.map((e) => `${e.type}:${e.id}`).join(','));

  // Live overrides state
  let liveEntityOverrides = $state<Record<string, any>>({ ...(data.entityOverrides ?? {}) });
  function handleOverrideSaved(type: string, id: string, override: any) {
    liveEntityOverrides[`${type}:${id}`] = override;
    offeringOverrideKey += 1;
    costOverrideKey += 1;
  }
  let offeringOverrideKey = $state(0);
  let costOverrideKey = $state(0);

  const offeringOverrideRows = $derived.by(() => {
    const ovr: Record<string, any> = liveEntityOverrides;
    const rows: any[] = [];
    for (const s of data.services) if (selectedServices[s.id]) rows.push({
      type: 'service', id: s.id, name: s.name,
      service_type: s.service_type,
      interaction_driver_type: s.interaction_driver_type,
      catalog: {
        avg_input_tokens: s.avg_input_tokens,
        avg_output_tokens: s.avg_output_tokens,
        avg_requests_per_user_month: s.avg_requests_per_user_month,
        fixed_cost_per_month: s.fixed_cost_per_month,
        monthly_volume: s.monthly_volume,
        interactions_per_customer_month: s.interactions_per_customer_month,
        containment_rate: s.containment_rate,
        average_handle_time_seconds: s.average_handle_time_seconds,
        fully_loaded_cost_per_fte_month: s.fully_loaded_cost_per_fte_month,
        baseline_fte: s.baseline_fte,
        churn_rate_uplift: s.churn_rate_uplift
      },
      override: ovr[`service:${s.id}`] ?? null
    });
    const providerIds = new Set<string>();
    for (const s of data.services) if (selectedServices[s.id] && s.provider_id) providerIds.add(s.provider_id);
    for (const p of data.providers) if (providerIds.has(p.id)) rows.push({
      type: 'provider', id: p.id, name: `${p.name} · ${p.model_name}`,
      catalog: { input_price: p.input_price, output_price: p.output_price },
      override: ovr[`provider:${p.id}`] ?? null
    });
    for (const pl of data.plans) if (selectedPlans[pl.id]) rows.push({
      type: 'plan', id: pl.id, name: pl.name,
      catalog: { base_price: pl.base_price },
      override: ovr[`plan:${pl.id}`] ?? null
    });
    return rows;
  });

  const costOverrideRows = $derived.by(() => {
    const ovr: Record<string, any> = liveEntityOverrides;
    return data.costs.filter((c: any) => selectedCosts[c.id]).map((c: any) => ({
      type: 'cost' as const, id: c.id, name: c.name,
      catalog: { amount: c.amount, frequency: c.frequency },
      override: ovr[`cost:${c.id}`] ?? null
    }));
  });

  // Cascade Inspector
  let selectedCohortIdForInspector = $state<Record<string, string>>({});
  let activeInspectorParam = $state<Record<string, string | null>>({});

  const paramMeta: Record<string, { label: string, chip: string, isPercent: boolean, symbol: string }> = {
    arpu_override: { label: 'ARPU Override', chip: 'ARPU', isPercent: false, symbol: '$' },
    monthly_acquisition: { label: 'Monthly Acquisition', chip: 'Acquisition', isPercent: false, symbol: '' },
    monthly_churn_rate: { label: 'Monthly Churn Rate', chip: 'Churn', isPercent: true, symbol: '%' },
    ai_adoption_rate: { label: 'AI Adoption Rate', chip: 'Adoption', isPercent: true, symbol: '%' },
    arpu_uplift: { label: 'AI ARPU Uplift ($ Flat)', chip: 'ARPU Uplift $', isPercent: false, symbol: '$' },
    arpu_uplift_percent: { label: 'AI ARPU Uplift (%)', chip: 'ARPU Uplift %', isPercent: true, symbol: '%' },
    churn_reduction: { label: 'AI Churn Reduction', chip: 'Churn Reduction', isPercent: true, symbol: '%' },
    acquisition_uplift: { label: 'AI Acquisition Uplift', chip: 'Acquisition Uplift', isPercent: true, symbol: '%' }
  };

  function getCohortListForTarget(ov: OverrideRow) {
    if (ov.target_type === 'cohort') {
      return data.cohorts.filter((c: any) => c.id === ov.target_id);
    } else {
      return data.cohorts;
    }
  }

  function getParameterCascade(cohortId: string, paramKey: string) {
    const cohort = data.cohorts.find((c: any) => c.id === cohortId);
    if (!cohort) return null;

    const meta = paramMeta[paramKey];
    if (!meta) return null;

    let baseKey: string = paramKey;
    if (paramKey === 'arpu_override') baseKey = 'base_arpu';
    if (paramKey === 'expansion_rate') baseKey = 'monthly_expansion_rate';

    const getRawBaseValue = (c: any, key: string) => c[key] !== undefined ? c[key] : null;
    const baseValRaw = getRawBaseValue(cohort, baseKey);

    const globalOv = overrides.find(o => o.target_type === 'all_clients');
    const cohortOv = overrides.find(o => o.target_type === 'cohort' && o.target_id === cohort.id);

    const formatValForDisplay = (val: number | null) => val;
    const formatBaseValForDisplay = (val: number | null) => {
      if (val === null || val === undefined) return null;
      return meta.isPercent ? val * 100 : val;
    };

    const baseVal = formatBaseValForDisplay(baseValRaw);
    const globalVal = globalOv ? formatValForDisplay(globalOv[paramKey as keyof OverrideRow] as number | null) : null;
    const cohortVal = cohortOv ? formatValForDisplay(cohortOv[paramKey as keyof OverrideRow] as number | null) : null;

    let winner: 'Cohort Base' | 'Global Override' | 'Cohort Override' = 'Cohort Base';
    let effVal = baseVal || 0;

    const isDefined = (val: any) => val !== null && val !== undefined && val !== '';

    if (isDefined(cohortVal)) {
      winner = 'Cohort Override';
      effVal = cohortVal!;
    } else if (isDefined(globalVal)) {
      winner = 'Global Override';
      effVal = globalVal!;
    } else if (isDefined(baseVal)) {
      winner = 'Cohort Base';
      effVal = baseVal!;
    }

    const nodes = [
      { level: 'Cohort Base', value: baseVal, isDefined: isDefined(baseVal), isWinner: winner === 'Cohort Base', label: `Base (${cohort.name})` },
      { level: 'Global Override', value: globalVal, isDefined: isDefined(globalVal), isWinner: winner === 'Global Override', label: 'Global Override' },
      { level: 'Cohort Override', value: cohortVal, isDefined: isDefined(cohortVal), isWinner: winner === 'Cohort Override', label: 'Cohort Override' }
    ];

    return { nodes, effectiveValue: effVal, meta };
  }

  function toggleInspector(targetId: string, paramKey: string) {
    if (activeInspectorParam[targetId] === paramKey) {
      activeInspectorParam[targetId] = null;
    } else {
      activeInspectorParam[targetId] = paramKey;
      if (!selectedCohortIdForInspector[targetId]) {
        const ov = overrides.find(o => o.target_id === targetId);
        if (ov) {
          const cohortsList = getCohortListForTarget(ov);
          if (cohortsList.length > 0) {
            selectedCohortIdForInspector[targetId] = cohortsList[0].id;
          }
        }
      }
    }
  }

  function formatValueForInspector(val: number | null, isPercent: boolean, symbol: string) {
    if (val === null || val === undefined) return '—';
    if (isPercent) return `${val}%`;
    if (symbol === '$') return `$${val.toFixed(2)}`;
    return val.toString();
  }

  // Branch routing question helpers
  function selectRevenueCarrierOption(opt: 'cohort' | 'plan' | 'monetization') {
    if (opt === 'cohort') {
      modelingType = 'incremental';
      revenueCarrier = 'cohort';
      revenueBridge = null;
    } else if (opt === 'plan') {
      modelingType = 'gtm';
      revenueCarrier = 'plan';
    } else {
      modelingType = 'appraisal';
      revenueCarrier = 'feature';
    }
  }

  const selectedRouteOption = $derived.by(() => {
    // Route from the RESOLVED carrier, not modeling_type alone: a stored
    // (appraisal, plan) pair is invariant-consistent, and keying on
    // modeling_type would open the wrong route on edit.
    if (resolvedCarrier === 'cohort') return 'cohort';
    if (resolvedCarrier === 'plan') return 'plan';
    return 'monetization';
  });

  // Filter cohorts by vertical selection
  const filteredCohorts = $derived.by(() => {
    if (!selectedVerticalFilter) return data.cohorts;
    return data.cohorts.filter((c: any) => c.vertical_id === selectedVerticalFilter);
  });
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <!-- Top Navigation & Progress -->
  <div class="flex items-center justify-between">
    <Button href="/scenarios" variant="ghost" size="sm">
      <ArrowLeft class="h-4 w-4 mr-2" /> Back to Scenarios
    </Button>

    <div class="flex items-center space-x-2 text-xs select-none">
      {#each (wizardMode === 'create' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]) as step}
        <span class="px-2.5 py-1 rounded-full font-bold {currentStep === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">{step}</span>
        {#if step < (wizardMode === 'create' ? 6 : 5)}<span class="text-muted-foreground font-medium">➔</span>{/if}
      {/each}
    </div>
  </div>

  <!-- Scope Banner context -->
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
        <CardTitle class="text-xl font-bold">{wizardMode === 'create' ? 'Create Scenario' : 'Edit Scenario'}</CardTitle>
      </div>
      <CardDescription>
        {#if currentStep === 1}
          Define scenario meta info, modeling route, and baseline target scope.
        {:else}
          {#if currentStep === 2}
            Configure baseline parameters and AI benefits for the targeted segment.
          {:else}
            {#if currentStep === 3}
              Set pricing plans, services rollout offsets, and S-curve expansion pacing.
            {:else}
              {#if currentStep === 4}
                Map OPEX / CAPEX expenses and review final overrides.
              {:else}
                {#if currentStep === 5}
                  Configure EVC parameters (Next Best Alternative, extra value, negative value) and review capture bands.
                {:else}
                  Review provisional forecast, net cashflows, and aggregate ROI.
                {/if}
              {/if}
            {/if}
          {/if}
        {/if}
      </CardDescription>
    </CardHeader>

    <form method="POST" {action} use:enhance>
      <!-- Hidden state fields -->
      <input type="hidden" name="scopeOverridesJSON" value={scopeOverridesJSON} />
      <input type="hidden" name="modelingType" value={modelingType} />
      <input type="hidden" name="revenueCarrier" value={resolvedCarrier} />
      <input type="hidden" name="revenueBridge" value={revenueBridge || ''} />
      <input type="hidden" name="pool_tier_id" value={resolvedCarrier === 'pool' ? poolTierId : ''} />

      <!-- Step 1: Details, Route & Scope selection -->
      <div class={currentStep === 1 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-6">
          <div class="space-y-4">
            <div class="space-y-2">
              <Label for="name" class="font-semibold text-sm">Scenario Name</Label>
              <Input id="name" name="name" bind:value={name} placeholder="e.g. Is it worth deploying an AI customer support agent?" required class="bg-(--glass-inset-bg) border-border" />
              {#if fieldDiagnostics.name}
                {#each fieldDiagnostics.name as msg}
                  <p class="text-rose-500 text-[10px]">{msg}</p>
                {/each}
              {/if}
            </div>
            <div class="space-y-2">
              <Label for="description" class="font-semibold text-sm">Description</Label>
              <Textarea id="description" name="description" bind:value={description} placeholder="Goal, hypotheses, or general context..." rows={2} class="bg-(--glass-inset-bg) border-border" />
            </div>
          </div>

          <hr class="border-border/60" />

          <!-- Projection & Discount Rate -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="projectionMonths" class="font-semibold text-sm">Projection Horizon</Label>
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
                <Label for="discountRateSlider" class="font-semibold text-sm">Discount Rate (Annual)</Label>
                <span class="text-sm font-semibold text-primary">{discountRate}%</span>
              </div>
              <Slider id="discountRateSlider" bind:value={discountRateArr} min={0} max={30} step={1} type="multiple" />
              <input type="hidden" name="discountRate" value={discountRate} />
              {#if fieldDiagnostics.discount_rate}
                {#each fieldDiagnostics.discount_rate as msg}
                  <p class="text-rose-500 text-[10px]">{msg}</p>
                {/each}
              {/if}
            </div>
          </div>

          <!-- Capex Contingency -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-3 pt-2">
              <div class="flex justify-between items-center">
                <Label for="capexContingencySlider" class="font-semibold text-sm">CAPEX Contingency Buffer</Label>
                <span class="text-sm font-semibold text-primary">{capexContingencyPct}%</span>
              </div>
              <Slider id="capexContingencySlider" bind:value={capexContingencyPctArr} min={0} max={100} step={5} type="multiple" />
              <input type="hidden" name="capexContingencyPct" value={capexContingencyPct / 100} />
              <p class="text-[10px] text-muted-foreground mt-1">Inflation/overrun buffer multiplier applied to all CAPEX cost items.</p>
              {#if fieldDiagnostics.capex_contingency_pct}
                {#each fieldDiagnostics.capex_contingency_pct as msg}
                  <p class="text-rose-500 text-[10px]">{msg}</p>
                {/each}
              {/if}
            </div>
          </div>

          <hr class="border-border/60" />

          <!-- Revenue Dial: How does it earn? (Carrier-First branching) -->
          <div class="space-y-3">
            <Label class="font-semibold text-sm">How does this initiative earn revenue?</Label>
            <p class="text-xs text-muted-foreground -mt-1">
              Select the primary revenue mechanism. This branches the parameters and wizard inputs.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <button type="button" onclick={() => selectRevenueCarrierOption('cohort')} class="text-left flex flex-col p-4 border rounded-lg hover:glass-inset transition duration-150 {selectedRouteOption === 'cohort' ? 'border-primary bg-primary/5' : 'border-border'}">
                <span class="text-sm font-bold text-foreground">Improve existing clients</span>
                <span class="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                  Revenue is driven by optimizing retention, churn reduction, or flat ARPU uplifts on your baseline cohorts. (No plans or monetization add-ons as revenue).
                </span>
              </button>

              <button type="button" onclick={() => selectRevenueCarrierOption('plan')} class="text-left flex flex-col p-4 border rounded-lg hover:glass-inset transition duration-150 {selectedRouteOption === 'plan' ? 'border-primary bg-primary/5' : 'border-border'}">
                <span class="text-sm font-bold text-foreground">Sell a new plan (Seats)</span>
                <span class="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                  Revenue is driven by licensing subscriptions (pricing plan seats × base price). Optional new-market expansion curves.
                </span>
              </button>

              <button type="button" onclick={() => selectRevenueCarrierOption('monetization')} class="text-left flex flex-col p-4 border rounded-lg hover:glass-inset transition duration-150 {selectedRouteOption === 'monetization' ? 'border-primary bg-primary/5' : 'border-border'}">
                <span class="text-sm font-bold text-foreground">Charge for usage / add-on</span>
                <span class="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                  Revenue is carried by usage models or hybrid add-on features (credit-based billing, per-request, flat add-ons).
                </span>
              </button>
            </div>
          </div>

          <!-- Appraisal sub-toggle if Monetization route is selected -->
          {#if selectedRouteOption === 'monetization'}
            <div class="space-y-3 glass-inset border border-border p-4 rounded-lg">
              <Label class="font-semibold text-xs text-muted-foreground">Appraisal Carrier Level</Label>
              <div class="grid grid-cols-3 gap-3 mt-1">
                <label class="flex items-center space-x-2 text-xs cursor-pointer hover:bg-foreground/5 p-2 border rounded border-border/40 {revenueCarrier === 'feature' ? 'bg-primary/5 border-primary/50' : ''}">
                  <input type="radio" name="revenueCarrierOption" value="feature" checked={revenueCarrier === 'feature'} onclick={() => { revenueCarrier = 'feature'; }} class="accent-primary" />
                  <span class="font-medium">Atomic Service</span>
                </label>
                <label class="flex items-center space-x-2 text-xs cursor-pointer hover:bg-foreground/5 p-2 border rounded border-border/40 {revenueCarrier === 'pack' ? 'bg-primary/5 border-primary/50' : ''}">
                  <input type="radio" name="revenueCarrierOption" value="pack" checked={revenueCarrier === 'pack'} onclick={() => { revenueCarrier = 'pack'; }} class="accent-primary" />
                  <span class="font-medium">Feature Pack</span>
                </label>
                <label class="flex items-center space-x-2 text-xs cursor-pointer hover:bg-foreground/5 p-2 border rounded border-border/40 {revenueCarrier === 'pool' ? 'bg-primary/5 border-primary/50' : ''}">
                  <input type="radio" name="revenueCarrierOption" value="pool" checked={revenueCarrier === 'pool'} onclick={() => { revenueCarrier = 'pool'; }} class="accent-primary" />
                  <span class="font-medium">Unified Credit Pool</span>
                </label>
              </div>
            </div>

            {#if revenueCarrier === 'pool'}
              <div class="space-y-2 glass-inset border border-border p-4 rounded-lg mt-3">
                <div class="flex items-center justify-between">
                  <Label for="pool_tier_select" class="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Select Credit Pool Tier</Label>
                  <a href="/catalog/pools" class="text-[10px] text-primary hover:underline">Manage Pools</a>
                </div>
                {#if !data.poolTiers || data.poolTiers.length === 0}
                  <div class="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 p-3 rounded-md">
                    No credit pool tiers found in the catalog. Please <a href="/catalog/pools/new" class="underline font-semibold hover:text-rose-600">create a credit pool tier</a> first.
                  </div>
                {:else}
                  <select
                    id="pool_tier_select"
                    bind:value={poolTierId}
                    required
                    class="w-full bg-background border border-input rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground font-medium font-sans"
                  >
                    <option value="">-- Choose Pool Tier --</option>
                    {#each data.poolTiers as tier}
                      <option value={tier.id}>{tier.name} ({tier.credit_pool_size.toLocaleString()} credits/mo, {formatCurrency(tier.monthly_fee, appState.currency, 0)}/mo)</option>
                    {/each}
                  </select>
                  <p class="text-[10px] text-muted-foreground mt-1">This scenario will draw usage from this credit pool under Approach B billing.</p>
                {/if}
              </div>
            {/if}
          {/if}

          <!-- Opt-in Revenue Bridge: Only visible in Cohort carrier and when plans are selected -->
          {#if resolvedCarrier === 'cohort' && totalSeatsScheduled > 0}
            <div class="space-y-2 glass-inset border border-border p-4 rounded-lg">
              <div class="flex items-center space-x-2 text-amber-500 mb-1">
                <Info class="h-4 w-4" />
                <Label for="revenueBridge" class="font-semibold text-xs uppercase tracking-wider">Plan Seats Overlap Warning</Label>
              </div>
              <p class="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                You selected existing cohort uplift revenue, but pricing plan seats are also scheduled. To prevent double-counting, declare the bridge relationship:
              </p>
              <select id="revenueBridge" name="revenueBridge" bind:value={revenueBridge} class="w-full bg-background border border-input rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground font-medium font-sans">
                <option value={null}>-- Select Revenue Bridge --</option>
                <option value="upsell_on_cohort">Upsell on Cohort (Plan seats represent a subset of cohort; plan subscription revenue is ignored)</option>
                <option value="separate_market">Separate Market (Plan seats represent a new independent market; plan subscription is additive)</option>
              </select>
            </div>
          {/if}

          <hr class="border-border/60" />

          <!-- Target Selection picker (All clients vs Cohorts) -->
          <div class="space-y-4">
            <Label class="font-semibold text-sm">Who does this target? (Client Scope)</Label>
            <div class="flex items-center space-x-4 mb-4">
              <label class="flex items-center space-x-2 cursor-pointer p-2 border rounded-md hover:glass-inset {scopeType === 'all_clients' ? 'border-primary bg-primary/5' : 'border-border'}">
                <input type="radio" name="scopeType" value="all_clients" bind:group={scopeType} class="accent-primary" />
                <span class="text-xs font-semibold">Entire Client Base ({data.cohorts.length} Cohorts)</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer p-2 border rounded-md hover:glass-inset {scopeType === 'cohorts' ? 'border-primary bg-primary/5' : 'border-border'}">
                <input type="radio" name="scopeType" value="cohorts" bind:group={scopeType} class="accent-primary" />
                <span class="text-xs font-semibold">Selected Cohorts</span>
              </label>
            </div>

            <!-- Cohort Selector with Vertical Tag Filter -->
            {#if scopeType === 'cohorts'}
              <div class="glass-inset border border-border p-4 rounded-lg space-y-4">
                <div class="flex justify-between items-center">
                  <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Cohorts</h4>
                  <div class="flex items-center space-x-2">
                    <span class="text-[10px] text-muted-foreground">Filter Vertical:</span>
                    <select bind:value={selectedVerticalFilter} class="text-[10px] bg-background border border-border rounded px-1.5 py-0.5">
                      <option value="">All Verticals</option>
                      {#each data.verticals as v}
                        <option value={v.id}>{v.name}</option>
                      {/each}
                    </select>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[30vh] overflow-y-auto">
                  {#each filteredCohorts as c}
                    <label class="flex items-center space-x-3 text-xs cursor-pointer hover:bg-foreground/5 p-2 border border-border/40 rounded-md">
                      <input type="checkbox" name="cohortConfigIds" value={c.id} bind:checked={selectedCohorts[c.id]} class="accent-primary" />
                      <div>
                        <span class="block font-semibold">{c.name}</span>
                        <span class="text-[9px] text-muted-foreground">{c.vertical_name || 'No Vertical'}</span>
                      </div>
                    </label>
                  {/each}
                  {#if filteredCohorts.length === 0}
                    <p class="text-xs text-muted-foreground italic text-center py-4 col-span-2">No cohorts match this vertical filter.</p>
                  {/if}
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

      <!-- Step 2: Overrides (cohort-only vs none in plan) -->
      <div class={currentStep === 2 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div class="flex items-center text-amber-500 mb-2 space-x-2">
            <Edit2 class="h-5 w-5" />
            <h3 class="text-sm font-bold uppercase tracking-wider">Parameter Overrides</h3>
          </div>

          {#if resolvedCarrier !== 'cohort'}
            <Card class="border border-border/60 bg-muted/10 p-6 text-center space-y-2">
              <Info class="h-8 w-8 text-muted-foreground mx-auto" />
              <h4 class="text-sm font-bold text-foreground">Cohort Uplifts Disabled</h4>
              <p class="text-xs text-muted-foreground max-w-md mx-auto">
                Under the chosen <b>{resolvedCarrier}</b> revenue route, cohort uplifts (ARPU, acquisition, churn) do not carry revenue. This prevents contradictory configuration. Proceed to rollout offerings.
              </p>
            </Card>
          {:else}
            <p class="text-xs text-muted-foreground mb-4">Enter Flat ARPU uplifts, Churn reductions, or Acquisition gains to model AI value. Leave blank to inherit defaults.</p>
            {#if overrides.length === 0}
              <p class="text-sm text-muted-foreground italic text-center py-6">No client targets selected in Step 1.</p>
            {:else}
              <div class="space-y-4">
                {#each overrides as ov}
                  {@const isOpen = !!openOverrides[ov.target_id]}
                  <Card class="border border-border/60 bg-muted/20">
                    <button type="button" onclick={() => openOverrides[ov.target_id] = !openOverrides[ov.target_id]} class="w-full text-left p-4 flex justify-between items-center hover:bg-foreground/5 transition duration-150 rounded-t-lg">
                      <div class="flex flex-col">
                        <span class="text-sm font-bold text-foreground">{ov.name}</span>
                        <span class="text-[10px] text-muted-foreground uppercase mt-0.5">{ov.target_type === 'all_clients' ? 'Global Scope' : 'Cohort Override'} assumptions</span>
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
                              <NumberField id="arpu_override" required={false} bind:value={ov.arpu_override} min="0" step="0.01" placeholder="Inherit" raw={true} grouped={true} decimals={2} class="bg-background text-xs font-mono" />
                            </div>
                            <div class="space-y-1">
                              <Label class="text-xs font-semibold">Monthly Acquisition (/mo)</Label>
                              <NumberField id="monthly_acquisition" required={false} bind:value={ov.monthly_acquisition} min="0" placeholder="Inherit" raw={true} grouped={true} decimals={0} class="bg-background text-xs font-mono" />
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
                              <NumberField id="arpu_uplift" required={false} bind:value={ov.arpu_uplift} min="0" step="0.01" placeholder="Inherit" raw={true} grouped={true} decimals={2} class="bg-background text-xs font-mono" />
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

                        <!-- Cascade Inspector -->
                        {#if wizardMode === 'edit'}
                          <div class="pt-3 border-t border-border/40">
                            <div class="flex items-center justify-between">
                              <span class="text-[10px] font-bold text-muted-foreground uppercase">Override Cascade Inspector</span>
                              <div class="flex items-center space-x-2">
                                {#each Object.keys(paramMeta) as paramKey}
                                  <Button type="button" variant="outline" size="sm" class="text-[9px] py-0.5 px-2" onclick={() => toggleInspector(ov.target_id, paramKey)}>
                                    {paramMeta[paramKey].chip}
                                  </Button>
                                {/each}
                              </div>
                            </div>

                            {#if activeInspectorParam[ov.target_id]}
                              {@const paramKey = activeInspectorParam[ov.target_id]!}
                              {@const cohortsList = getCohortListForTarget(ov)}
                              <div class="mt-3 p-3 bg-muted/40 rounded border border-border/40 space-y-2">
                                <div class="flex justify-between items-center text-xs">
                                  <span class="font-bold text-foreground">Inspecting: {paramMeta[paramKey].label}</span>
                                  {#if cohortsList.length > 1}
                                    <select bind:value={selectedCohortIdForInspector[ov.target_id]} class="text-[10px] bg-background border border-border rounded px-1.5 py-0.5">
                                      {#each cohortsList as c}
                                        <option value={c.id}>{c.name}</option>
                                      {/each}
                                    </select>
                                  {/if}
                                </div>

                                {#if selectedCohortIdForInspector[ov.target_id]}
                                  {@const cascade = getParameterCascade(selectedCohortIdForInspector[ov.target_id], paramKey)}
                                  {#if cascade}
                                    <div class="space-y-1.5">
                                      <div class="flex items-center justify-between text-[11px] font-bold pb-1 border-b border-border/30">
                                        <span class="text-muted-foreground">Hierarchy Level</span>
                                        <span>Value</span>
                                      </div>
                                      {#each cascade.nodes as node}
                                        <div class="flex justify-between items-center text-[10px] {node.isWinner ? 'text-primary font-bold' : 'text-muted-foreground/80'}">
                                          <div class="flex items-center space-x-1.5">
                                            <span>{node.label}</span>
                                            {#if node.isWinner}
                                              <Badge variant="outline" class="text-[8px] py-0 px-1 border-primary/50 text-primary">Winner</Badge>
                                            {/if}
                                          </div>
                                          <span class="font-mono">{formatValueForInspector(node.value, cascade.meta.isPercent, cascade.meta.symbol)}</span>
                                        </div>
                                      {/each}
                                      <div class="flex justify-between items-center text-xs pt-1.5 border-t border-border/30 font-bold text-foreground">
                                        <span>Resolved Effective Value:</span>
                                        <span class="font-mono text-primary">{formatValueForInspector(cascade.effectiveValue, cascade.meta.isPercent, cascade.meta.symbol)}</span>
                                      </div>
                                    </div>
                                  {/if}
                                {/if}
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </Card>
                {/each}
              </div>
            {/if}
          {/if}
        </CardContent>

        <CardFooter class="border-t border-border glass-inset py-4 flex justify-between">
          <Button type="button" variant="outline" onclick={prevStep}>
            <ArrowLeft class="h-4 w-4 mr-2" /> Back
          </Button>
          <Button type="button" onclick={nextStep}>
            Next: Offerings & Expansion <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </div>

      <!-- Step 3: Rollout Offerings & Expansion -->
      <div class={currentStep === 3 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {#if modelingType === 'incremental' || resolvedCarrier === 'cohort'}
            <p class="text-xs text-muted-foreground italic bg-muted/10 p-2.5 rounded border border-border/20 select-none">
              Selections from other perspectives are kept but inactive.
            </p>
          {/if}
          
          <!-- S-Curve Market Expansion (Phase 3) - Only GTM/plan carrier -->
          {#if resolvedCarrier === 'plan'}
            <Card class="border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div class="flex items-center space-x-2 text-primary">
                <TrendingUp class="h-5 w-5" />
                <h3 class="text-sm font-bold uppercase tracking-wider">New Market Expansion (S-Curve)</h3>
              </div>
              <p class="text-[11px] text-muted-foreground -mt-2 leading-relaxed">
                Define the new market to acquire. If selected, seats are computed dynamically using a normalized S-curve (logistic diffusion model) instead of manual input.
              </p>

              <div class="space-y-3">
                <div class="space-y-1.5">
                  <Label for="expansion_vertical" class="text-xs font-semibold">Expansion Target Market (Vertical)</Label>
                  <select id="expansion_vertical" name="expansion_vertical_id" bind:value={expansion_vertical_id} class="w-full bg-background border border-input rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground font-sans">
                    <option value={null}>-- Static Plan Seats (No Expansion Curve) --</option>
                    {#each data.verticals as v}
                      <option value={v.id}>{v.name} (TAM: {v.tam_users?.toLocaleString()} · SOM: {v.som_users?.toLocaleString()})</option>
                    {/each}
                  </select>
                </div>

                {#if expansion_vertical_id && currentSelectedVerticalObj}
                  {@const v = currentSelectedVerticalObj}
                  <!-- TAM SAM SOM Funnel -->
                  <div class="grid grid-cols-3 gap-2 bg-background/50 border border-border/40 p-2.5 rounded text-center">
                    <div>
                      <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">TAM Users</span>
                      <span class="text-xs font-mono font-bold text-foreground mt-0.5 block">{v.tam_users?.toLocaleString()}</span>
                    </div>
                    <div>
                      <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">SAM Users</span>
                      <span class="text-xs font-mono font-bold text-foreground mt-0.5 block">{v.sam_users?.toLocaleString()}</span>
                    </div>
                    <div>
                      <span class="text-[9px] text-primary uppercase font-bold tracking-wider block">SOM Users (Ceiling)</span>
                      <span class="text-xs font-mono font-bold text-primary mt-0.5 block">{v.som_users?.toLocaleString()}</span>
                    </div>
                  </div>

                  <!-- Sliders -->
                  <div class="space-y-4 pt-2 border-t border-border/40">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="space-y-2">
                        <div class="flex justify-between items-center">
                          <Label for="baseline_months_input" class="text-xs font-semibold">Months to 50% SOM (Pace)</Label>
                          <span class="text-xs font-mono font-bold text-primary">{penetration_baseline_months} mo</span>
                        </div>
                        <input id="baseline_months_input" name="penetration_baseline_months" type="number" min="1" max={projectionMonths * 2} bind:value={penetration_baseline_months} class="w-full bg-background border border-input rounded px-3 py-1.5 text-xs text-foreground font-mono" />
                      </div>
                      <div class="space-y-2">
                        <div class="flex justify-between items-center font-sans">
                          <Label class="text-xs font-semibold">AI Acceleration Multiplier</Label>
                          <span class="text-xs font-mono font-bold text-primary">{ai_acceleration_factor}x</span>
                        </div>
                        <Slider bind:value={ai_acceleration_factor_arr} min={0.1} max={1.0} step={0.05} type="multiple" />
                        <input type="hidden" name="ai_acceleration_factor" value={ai_acceleration_factor} />
                        <p class="text-[9px] text-muted-foreground">Lower value = faster penetration under AI (e.g. 0.6 = 40% faster).</p>
                      </div>
                    </div>

                    <div class="space-y-2">
                      <div class="flex justify-between items-center">
                        <Label class="text-xs font-semibold">AI SOM Expansion Lift</Label>
                        <span class="text-xs font-mono font-bold text-primary">+{ai_som_lift_pct}%</span>
                      </div>
                      <Slider bind:value={ai_som_lift_pct_arr} min={0} max={100} step={5} type="multiple" />
                      <input type="hidden" name="ai_som_lift_pct" value={ai_som_lift_pct / 100} />
                      <p class="text-[9px] text-muted-foreground">Increases the SOM limit (clamped strictly to SAM ceiling).</p>
                    </div>
                  </div>

                  <!-- Small ECharts Preview -->
                  <div class="border border-border/40 p-2.5 rounded bg-background/30">
                    <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">S-Curve Market Penetration Preview</span>
                    <div bind:this={expansionChartElement} class="h-[180px] w-full mt-2"></div>
                  </div>
                {/if}
              </div>
            </Card>
          {/if}

          <!-- Pricing Plans — hidden for the pure 'Improve existing clients' (incremental) route,
               where plan seats can never carry revenue. Still shown for appraisal+cohort bridge
               scenarios (separate_market), so plan seats are never silently dropped on edit-save. -->
          {#if modelingType !== 'incremental'}
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

                        {#if resolvedCarrier === 'plan'}
                          {#if expansion_vertical_id}
                            <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold ml-1">Seats: derived</span>
                            <input type="hidden" name="seats_plan_{plan.id}" value={seatsPlans[plan.id] ?? 0} />
                          {:else}
                            <Label class="text-xs text-muted-foreground shrink-0 ml-1">Seats:</Label>
                            <NumberField id="seats_plan_{plan.id}" name="seats_plan_{plan.id}" required={false} bind:value={seatsPlans[plan.id]} min="0" raw={true} grouped={true} decimals={0} class="w-20 bg-background text-foreground border border-input rounded text-center text-xs py-0.5 font-mono" />
                          {/if}
                        {:else}
                          <input type="hidden" name="seats_plan_{plan.id}" value={seatsPlans[plan.id] ?? 0} />
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <hr class="border-border/60" />
          {:else}
            <!-- Render hidden inputs to keep perspective data -->
            {#each data.plans as plan}
              {#if selectedPlans[plan.id]}
                <input type="hidden" name="planIds" value={plan.id} />
                <input type="hidden" name="rollout_month_plan_{plan.id}" value={rolloutPlans[plan.id] ?? 0} />
                <input type="hidden" name="seats_plan_{plan.id}" value={seatsPlans[plan.id] ?? 0} />
              {/if}
            {/each}
          {/if}

          <!-- Feature Packs (only if carrier !== cohort) -->
          {#if resolvedCarrier !== 'cohort'}
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
          {:else}
            <!-- Render hidden inputs to keep perspective data -->
            {#each data.packs as pack}
              {#if selectedPacks[pack.id]}
                <input type="hidden" name="packIds" value={pack.id} />
                <input type="hidden" name="rollout_month_pack_{pack.id}" value={rolloutPacks[pack.id] ?? 0} />
              {/if}
            {/each}
          {/if}

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
                        <span class="text-[10px] text-muted-foreground uppercase">{service.service_type}</span>
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

          <!-- Edit-only Monetization & Entity Overrides -->
          {#if wizardMode === 'edit' && data.scenario}
            <div class="mt-6">
              {#key monetizationKey}
                <ScenarioMonetizationOverrides
                  scenarioId={data.scenario.id}
                  entities={monetizationEntities}
                  modelingType={modelingType}
                  resolvedCarrier={resolvedCarrier}
                />
              {/key}
            </div>

            {#if offeringOverrideRows.length > 0}
              <div class="mt-6">
                {#key offeringOverrideKey}
                  <ScenarioEntityOverrides
                    scenarioId={data.scenario.id}
                    entities={offeringOverrideRows}
                    onSaved={handleOverrideSaved}
                    title="Service, provider & plan overrides"
                    subtitle="Vary token usage, fixed costs, provider prices, or plan base price for THIS scenario only. Saves immediately; the shared catalog is untouched."
                  />
                {/key}
              </div>
            {/if}
          {/if}
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

          <!-- Cost Overrides (edit mode) -->
          {#if wizardMode === 'edit' && data.scenario && costOverrideRows.length > 0}
            <div class="mt-6 border-t border-border/45 pt-4">
              {#key costOverrideKey}
                <ScenarioEntityOverrides
                  scenarioId={data.scenario.id}
                  entities={costOverrideRows}
                  onSaved={handleOverrideSaved}
                  title="Cost overrides"
                  subtitle="Vary the amount or frequency of a cost for THIS scenario only. Saves immediately."
                />
              {/key}
            </div>
          {/if}

          {#if wizardMode === 'edit'}
            <!-- Server-Side Integrity Banner on edit page step 4 -->
            {#if integrityResult.status !== 'ok'}
              <Card class="mt-4 border-{integrityResult.status === 'block' ? 'rose' : 'amber'}-500/30 bg-{integrityResult.status === 'block' ? 'rose' : 'amber'}-500/5 p-4 select-none">
                <CardContent class="flex items-start space-x-3 text-sm p-0">
                  <Info class="h-5 w-5 text-{integrityResult.status === 'block' ? 'rose' : 'amber'}-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 class="font-bold text-{integrityResult.status === 'block' ? 'rose' : 'amber'}-600 dark:text-{integrityResult.status === 'block' ? 'rose' : 'amber'}-400">
                      {integrityResult.status === 'block' ? 'Revenue Integrity Block' : 'Revenue Integrity Warning'}
                    </h4>
                    <p class="text-muted-foreground mt-1 text-xs">{integrityResult.message}</p>
                  </div>
                </CardContent>
              </Card>
            {/if}

            <DiagnosticsBanner {diagnostics} />
          {/if}
        </CardContent>

        <CardFooter class="border-t border-border glass-inset py-4 flex justify-between">
          <Button type="button" variant="outline" onclick={prevStep}>
            <ArrowLeft class="h-4 w-4 mr-2" /> Back
          </Button>
          <Button type="button" onclick={nextStep}>
            Next: EVC Modeling <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </div>

      <!-- Step 5: EVC Modeling -->
      <div class={currentStep === 5 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-6 max-h-[60vh] overflow-y-auto select-none">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider flex items-center mb-3">
            <DollarSign class="h-4 w-4 mr-1.5 text-primary" /> Economic Value to Customer (EVC) & Capture Bands
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <div class="space-y-1.5">
                <Label for="evc_nba_annual_value" class="font-semibold text-xs">Next Best Alternative (Annual Reference Value/Customer, {getCurrencySymbol(data.settings.currency)})</Label>
                <NumberField id="evc_nba_annual_value" name="evc_nba_annual_value" required={false} min="0" step="0.01" bind:value={evc_nba_annual_value} placeholder="e.g. 50000.00" raw={true} grouped={true} decimals={2} class="text-right" />
                <p class="text-[10px] text-muted-foreground">Per single average customer (not your total base) — the annual cost/value of their current non-AI alternative (e.g. human labor, legacy vendor).</p>
              </div>

              <div class="space-y-1.5">
                <Label for="evc_extra_positive_value" class="font-semibold text-xs">Extra Positive Value (Annual/Customer, {getCurrencySymbol(data.settings.currency)})</Label>
                <NumberField id="evc_extra_positive_value" name="evc_extra_positive_value" required={false} min="0" step="0.01" bind:value={evc_extra_positive_value} placeholder="e.g. 10000.00" raw={true} grouped={true} decimals={2} class="text-right" />
                <p class="text-[10px] text-muted-foreground">Per single average customer. Other soft/hard annual benefits (e.g., higher quality, CSAT lift, risk reduction) not captured in labor/margin savings.</p>
              </div>

              <div class="space-y-1.5">
                <Label for="evc_negative_value" class="font-semibold text-xs">Negative Value / Switching Costs (per Customer, {getCurrencySymbol(data.settings.currency)})</Label>
                <NumberField id="evc_negative_value" name="evc_negative_value" required={false} min="0" step="0.01" bind:value={evc_negative_value} placeholder="e.g. 5000.00" raw={true} grouped={true} decimals={2} class="text-right" />
                <p class="text-[10px] text-muted-foreground">Per single average customer. Implementation fees, training costs, or any disadvantage compared to the Next Best Alternative.</p>
              </div>

              <div class="space-y-4 pt-4 border-t border-border/40">
                <div class="flex items-center justify-between space-x-2">
                  <div class="space-y-0.5">
                    <Label for="price_from_evc" class="font-semibold text-xs">Drive Price from EVC</Label>
                    <p class="text-[10px] text-muted-foreground">
                      {#if resolvedCarrier === 'cohort'}
                        Override cohort ARPU uplift with the target EVC capture rate (target capture/customer/month).
                      {:else if resolvedCarrier === 'plan'}
                        Override plan base price with the target EVC capture rate (target capture/customer/month).
                      {:else}
                        Override addon monthly fee with the target EVC capture rate (target capture/customer/month).
                      {/if}
                    </p>
                  </div>
                  <Switch id="price_from_evc" bind:checked={price_from_evc} />
                  <input type="hidden" name="price_from_evc" value={price_from_evc ? '1' : '0'} />
                </div>

                {#if price_from_evc}
                  <div class="space-y-2 pt-2">
                    <div class="flex justify-between text-xs font-semibold">
                      <span class="text-muted-foreground">Adoption Price Elasticity (&epsilon;)</span>
                      <span class="text-primary font-mono">{adoption_elasticity.toFixed(1)}</span>
                    </div>
                    <Slider bind:value={adoption_elasticity_arr} min={0.0} max={3.0} step={0.1} type="multiple" />
                    <p class="text-[10px] text-muted-foreground">Determines how customer adoption drops if capture rate exceeds base. At &epsilon; = 0, adoption is inelastic.</p>
                  </div>
                {/if}
                <!-- Always submit adoption_elasticity so a saved value isn't silently reset to 0 -->
                <input type="hidden" name="adoption_elasticity" value={adoption_elasticity} />
              </div>
            </div>

            <!-- Live Calculation & Projections Box -->
            <div class="space-y-4">
              <div class="glass border rounded-xl p-5 space-y-4 bg-primary/5">
                <h4 class="text-xs font-bold text-primary uppercase tracking-wider">Live EVC Projections (per Customer, Monthly)</h4>
                
                {#if previewResult && previewResult.evc}
                  {@const evcObj = previewResult.evc}
                  {#if price_from_evc}
                    <div class="p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between">
                      <span>EVC Pricing Overlay Active:</span>
                      <span class="font-mono font-bold text-sm">{formatCurrency(evcObj.targetCapturePerUserMonth, data.settings.currency, 0)}/user/mo</span>
                    </div>
                  {/if}
                  <div class="space-y-2 text-xs">
                    <div class="flex justify-between border-b border-border/40 pb-1.5">
                      <span class="text-muted-foreground">Reference Value (NBA)</span>
                      <span class="font-mono font-semibold">{formatCurrency(evcObj.referenceValue, data.settings.currency, 0)}</span>
                    </div>
                    <div class="flex justify-between border-b border-border/40 pb-1.5">
                      <span class="text-muted-foreground">Labor Savings (Cash + Capacity)</span>
                      <span class="font-mono text-emerald-600 dark:text-emerald-400">+{formatCurrency(evcObj.laborSavings, data.settings.currency, 0)}</span>
                    </div>
                    <div class="flex justify-between border-b border-border/40 pb-1.5">
                      <span class="text-muted-foreground">Extra Positive Value</span>
                      <span class="font-mono text-emerald-600 dark:text-emerald-400">+{formatCurrency(evcObj.extraPositiveValue, data.settings.currency, 0)}</span>
                    </div>
                    <div class="flex justify-between border-b border-border/40 pb-1.5 font-semibold text-foreground">
                      <span class="text-muted-foreground">Positive Value Total</span>
                      <span class="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(evcObj.positiveValueTotal, data.settings.currency, 0)}</span>
                    </div>
                    <div class="flex justify-between border-b border-border/40 pb-1.5">
                      <span class="text-muted-foreground">Negative Value / Switching Costs</span>
                      <span class="font-mono text-rose-600 dark:text-rose-400">-{formatCurrency(evcObj.negativeValueTotal, data.settings.currency, 0)}</span>
                    </div>
                    <div class="flex justify-between border-b border-border/40 pb-1.5 font-semibold text-foreground">
                      <span>Net Created Value</span>
                      <span class="font-mono">{formatCurrency(evcObj.netCreatedValue, data.settings.currency, 0)}</span>
                    </div>
                    <div class="flex justify-between pt-1 text-sm font-bold text-primary">
                      <span>Economic Value to Customer (EVC)</span>
                      <span class="font-mono">{formatCurrency(evcObj.evc, data.settings.currency, 0)}</span>
                    </div>
                  </div>

                  <hr class="border-border/40" />

                  <!-- Value Capture Bands -->
                  <div class="space-y-2">
                    <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Recommended Pricing Capture Bands</span>
                    
                    <div class="grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div class="p-2 rounded bg-background/50 border border-border">
                        <span class="text-muted-foreground block">Floor ({(evc_capture_floor_pct * 100).toFixed(0)}%)</span>
                        <span class="font-mono font-bold text-sm block mt-1">{formatCurrency(evcObj.priceFloor, data.settings.currency, 0)}</span>
                      </div>
                      <div class="p-2 rounded bg-primary/10 border border-primary/20">
                        <span class="text-primary block font-bold">Target ({(evc_capture_target_pct * 100).toFixed(0)}%)</span>
                        <span class="font-mono font-black text-sm block mt-1 text-primary">{formatCurrency(evcObj.priceTarget, data.settings.currency, 0)}</span>
                      </div>
                      <div class="p-2 rounded bg-background/50 border border-border">
                        <span class="text-muted-foreground block">Ceiling ({(evc_capture_ceiling_pct * 100).toFixed(0)}%)</span>
                        <span class="font-mono font-bold text-sm block mt-1">{formatCurrency(evcObj.priceCeiling, data.settings.currency, 0)}</span>
                      </div>
                    </div>
                  </div>
                {:else}
                  <p class="text-xs text-muted-foreground italic text-center py-6">Enter reference Next Best Alternative value to calculate EVC bands.</p>
                {/if}
              </div>

              <!-- Tuning sliders for capture bands (Optional/Custom share) -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <div class="flex justify-between text-xs font-semibold">
                    <span class="text-muted-foreground">Capture Floor Share</span>
                    <span class="text-primary font-mono">{evc_capture_floor_pct_arr[0]}%</span>
                  </div>
                  <Slider bind:value={evc_capture_floor_pct_arr} min={0} max={100} step={1} type="multiple" />
                  <input type="hidden" name="evc_capture_floor_pct" value={evc_capture_floor_pct} />
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between text-xs font-semibold">
                    <span class="text-muted-foreground">Capture Target Share</span>
                    <span class="text-primary font-mono">{evc_capture_target_pct_arr[0]}%</span>
                  </div>
                  <Slider bind:value={evc_capture_target_pct_arr} min={0} max={100} step={1} type="multiple" />
                  <input type="hidden" name="evc_capture_target_pct" value={evc_capture_target_pct} />
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between text-xs font-semibold">
                    <span class="text-muted-foreground">Capture Ceiling Share</span>
                    <span class="text-primary font-mono">{evc_capture_ceiling_pct_arr[0]}%</span>
                  </div>
                  <Slider bind:value={evc_capture_ceiling_pct_arr} min={0} max={100} step={1} type="multiple" />
                  <input type="hidden" name="evc_capture_ceiling_pct" value={evc_capture_ceiling_pct} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter class="border-t border-border glass-inset py-4 flex flex-col items-stretch gap-3">
          {#if wizardMode === 'edit' && form?.error}
            <div class="flex items-start space-x-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <Info class="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <p class="text-rose-600 dark:text-rose-400 text-xs font-semibold">{form.error}</p>
            </div>
          {/if}
          <div class="flex justify-between items-center">
            <Button type="button" variant="outline" onclick={prevStep}>
              <ArrowLeft class="h-4 w-4 mr-2" /> Back
            </Button>
            {#if wizardMode === 'create'}
              <Button type="button" onclick={nextStep}>
                Next: Review & Save <ArrowRight class="h-4 w-4 ml-2" />
              </Button>
            {:else}
              <Button type="submit" disabled={integrityResult.status === 'block'}>
                <Save class="h-4 w-4 mr-2" /> Save Changes
              </Button>
            {/if}
          </div>
        </CardFooter>
      </div>

      <!-- Step 6: Review & Save (Create mode only) -->
      {#if wizardMode === 'create'}
        <div class={currentStep === 6 ? 'block' : 'hidden'}>
          <CardContent class="py-6 space-y-6 max-h-[60vh] overflow-y-auto">
            
            {#if integrityResult.status !== 'ok'}
              <Card class="border-{integrityResult.status === 'block' ? 'rose' : 'amber'}-500/30 bg-{integrityResult.status === 'block' ? 'rose' : 'amber'}-500/5 p-4 select-none">
                <CardContent class="flex items-start space-x-3 text-sm p-0">
                  <Info class="h-5 w-5 text-{integrityResult.status === 'block' ? 'rose' : 'amber'}-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 class="font-bold text-{integrityResult.status === 'block' ? 'rose' : 'amber'}-600 dark:text-{integrityResult.status === 'block' ? 'rose' : 'amber'}-400">
                      {integrityResult.status === 'block' ? 'Revenue Integrity Block' : 'Revenue Integrity Warning'}
                    </h4>
                    <p class="text-muted-foreground mt-1 text-xs">{integrityResult.message}</p>
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
                    <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Provisional NPV Range</span>
                    <span class="text-sm font-mono font-black mt-1 block {previewResult.npvUpper >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                      {#if previewResult.npvLower !== undefined && previewResult.npvLower !== previewResult.npvUpper}
                        {formatCurrency(previewResult.npvLower, data.settings.currency, 0)} – {formatCurrency(previewResult.npvUpper, data.settings.currency, 0)}
                      {:else}
                        {formatCurrency(previewResult.npvUpper, data.settings.currency, 0)}
                      {/if}
                    </span>
                  </div>
                  <p class="text-[9px] text-muted-foreground/80 mt-1">Discounted lifetime net value</p>
                </Card>
                <Card class="glass border p-4 flex flex-col justify-between">
                  <div>
                    <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Provisional IRR</span>
                    <span class="text-lg font-mono font-black mt-1 block {previewResult.irr && previewResult.irr.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}">
                      {formatIrr(previewResult.irr)}
                    </span>
                  </div>
                  <p class="text-[9px] text-muted-foreground/80 mt-1">
                    {#if previewResult.irr && previewResult.irr.status !== 'ok'}
                      Status: <span class="capitalize font-medium text-amber-500">{previewResult.irr.status.replace(/_/g, ' ')}</span>
                    {:else}
                      AI internal rate of return
                    {/if}
                  </p>
                </Card>
                <Card class="glass border p-4 flex flex-col justify-between">
                  <div>
                    <span class="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Provisional Payback Range</span>
                    <span class="text-xs font-mono font-black text-cyan-600 dark:text-cyan-400 mt-1 block">
                      {formatPaybackRange(previewResult.paybackUpper, previewResult.paybackLower)}
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

          <CardFooter class="border-t border-border glass-inset py-4 flex flex-col items-stretch gap-3">
            {#if form?.error}
              <div class="flex items-start space-x-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <Info class="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <p class="text-rose-600 dark:text-rose-400 text-xs font-semibold">{form.error}</p>
              </div>
            {/if}
            <div class="flex justify-between items-center">
              <Button type="button" variant="outline" onclick={prevStep}>
                <ArrowLeft class="h-4 w-4 mr-2" /> Back
              </Button>
              <Button type="submit" disabled={integrityResult.status === 'block'}>
                <Save class="h-4 w-4 mr-2" /> Calculate & Save Scenario
              </Button>
            </div>
          </CardFooter>
        </div>
      {/if}
    </form>
  </Card>
</div>
