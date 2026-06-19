<script lang="ts">
  import Label from '$lib/components/ui/label/label.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Cpu from '@lucide/svelte/icons/cpu';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import Receipt from '@lucide/svelte/icons/receipt';
  import type { EntityOverride, EntityOverrideType } from '$lib/types';

  export interface EntityOverrideRow {
    type: EntityOverrideType; // 'service' | 'cost' | 'provider' | 'plan'
    id: string;
    name: string;
    /** Catalog values for the overridable fields — shown as input placeholders. */
    catalog: EntityOverride;
    override: EntityOverride | null;
    service_type?: 'copilot' | 'agent';
    interaction_driver_type?: 'flat' | 'per_customer';
  }

  interface Props {
    scenarioId: string;
    entities: EntityOverrideRow[];
    title?: string;
    subtitle?: string;
    /** Notifies the parent of a persisted change so it survives a component remount (selection change). */
    onSaved?: (type: EntityOverrideType, id: string, override: EntityOverride | null) => void;
  }

  let {
    scenarioId,
    entities,
    title = 'Scenario overrides',
    subtitle = 'Override catalog values for this scenario only. Changes save immediately and do not affect the shared catalog.',
    onSaved
  }: Props = $props();

  type FieldDef = { key: keyof EntityOverride; label: string; step: string; kind: 'number' | 'frequency' };

  const FIELD_DEFS: Record<EntityOverrideType, FieldDef[]> = {
    service: [
      { key: 'avg_input_tokens', label: 'Avg input tokens / request', step: '1', kind: 'number' },
      { key: 'avg_output_tokens', label: 'Avg output tokens / request', step: '1', kind: 'number' },
      { key: 'avg_requests_per_user_month', label: 'Requests / user / month', step: '1', kind: 'number' },
      { key: 'fixed_cost_per_month', label: 'Fixed cost / month', step: '0.01', kind: 'number' }
    ],
    provider: [
      { key: 'input_price', label: 'Input price (per 1M tokens)', step: '0.01', kind: 'number' },
      { key: 'output_price', label: 'Output price (per 1M tokens)', step: '0.01', kind: 'number' }
    ],
    cost: [
      { key: 'amount', label: 'Amount', step: '0.01', kind: 'number' },
      { key: 'frequency', label: 'Frequency', step: '', kind: 'frequency' }
    ],
    plan: [{ key: 'base_price', label: 'Base price', step: '0.01', kind: 'number' }]
  };

  function getFieldDefs(e: EntityOverrideRow): FieldDef[] {
    if (e.type === 'service') {
      if (e.service_type === 'agent') {
        const fields: FieldDef[] = [
          { key: 'avg_input_tokens', label: 'Avg Input Tokens', step: '1', kind: 'number' },
          { key: 'avg_output_tokens', label: 'Avg Output Tokens', step: '1', kind: 'number' },
          { key: 'fixed_cost_per_month', label: 'Fixed Cost / Month', step: '0.01', kind: 'number' },
          { key: 'containment_rate', label: 'Target Containment Rate (0-1)', step: '0.01', kind: 'number' },
          { key: 'average_handle_time_seconds', label: 'Avg Handle Time (seconds)', step: '1', kind: 'number' },
          { key: 'fully_loaded_cost_per_fte_month', label: 'Fully Loaded FTE Cost / Month', step: '0.01', kind: 'number' },
          { key: 'baseline_fte', label: 'Max FTE Cap (Baseline FTE)', step: '0.1', kind: 'number' },
          { key: 'churn_rate_uplift', label: 'Monthly Churn Uplift (0-1)', step: '0.0001', kind: 'number' }
        ];

        if (e.interaction_driver_type === 'flat') {
          fields.push({ key: 'monthly_volume', label: 'Monthly Volume (interactions)', step: '1', kind: 'number' });
        } else {
          fields.push({ key: 'interactions_per_customer_month', label: 'Interactions / Customer / Month', step: '0.1', kind: 'number' });
        }

        return fields;
      } else {
        return FIELD_DEFS.service;
      }
    }
    return FIELD_DEFS[e.type];
  }

  const ICONS: Record<EntityOverrideType, typeof BrainCircuit> = {
    service: BrainCircuit,
    provider: Cpu,
    plan: CreditCard,
    cost: Receipt
  };

  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring';

  const keyOf = (e: { type: string; id: string }) => `${e.type}:${e.id}`;

  // Local override state keyed by `${type}:${id}` — drives the badges; mutated after save/clear.
  let overrides = $state<Record<string, EntityOverride | null>>(
    Object.fromEntries(entities.map((e) => [keyOf(e), e.override ?? null]))
  );
  let expanded = $state<Record<string, boolean>>({});
  let draft = $state<Record<string, EntityOverride>>({});
  let busy = $state<Record<string, boolean>>({});
  let rowError = $state<Record<string, string | null>>({});

  /** Normalize a draft: empty strings / NaN become null so the field falls back to catalog. */
  function clean(o: EntityOverride): EntityOverride {
    const out: EntityOverride = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === '' || v === undefined || (typeof v === 'number' && Number.isNaN(v))) continue;
      (out as any)[k] = v;
    }
    return out;
  }

  function isEmpty(o: EntityOverride | null): boolean {
    if (!o) return true;
    return Object.values(clean(o)).every((v) => v === null || v === undefined);
  }

  function hasOverride(key: string): boolean {
    return !isEmpty(overrides[key]);
  }

  function summarize(e: EntityOverrideRow): string {
    const ov = overrides[keyOf(e)];
    const defs = getFieldDefs(e);
    if (isEmpty(ov)) return `Catalog · ${defs.map((d) => fmtCatalog(e, d)).join(' · ')}`;
    const parts = defs
      .filter((d) => ov && ov[d.key] !== null && ov[d.key] !== undefined)
      .map((d) => `${d.label.split(' ')[0]}: ${ov![d.key]}`);
    return `Override · ${parts.join(' · ')}`;
  }

  function fmtCatalog(e: EntityOverrideRow, d: FieldDef): string {
    const v = e.catalog[d.key];
    return v === null || v === undefined ? '—' : String(v);
  }

  function toggle(e: EntityOverrideRow) {
    const key = keyOf(e);
    if (expanded[key]) {
      expanded[key] = false;
      return;
    }
    draft[key] = JSON.parse(JSON.stringify(overrides[key] ?? {}));
    rowError[key] = null;
    expanded[key] = true;
  }

  async function save(e: EntityOverrideRow) {
    const key = keyOf(e);
    busy[key] = true;
    rowError[key] = null;
    try {
      const override = clean(draft[key]);
      const res = await fetch('/api/entity-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId, entity_type: e.type, entity_id: e.id, override })
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      overrides[key] = isEmpty(override) ? null : override;
      onSaved?.(e.type, e.id, overrides[key]);
      expanded[key] = false;
    } catch (err: any) {
      rowError[key] = err.message || 'Save failed';
    } finally {
      busy[key] = false;
    }
  }

  async function clearOverride(e: EntityOverrideRow) {
    const key = keyOf(e);
    busy[key] = true;
    rowError[key] = null;
    try {
      const params = new URLSearchParams({ scenario_id: scenarioId, entity_type: e.type, entity_id: e.id });
      const res = await fetch(`/api/entity-override?${params}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Reset failed (${res.status})`);
      overrides[key] = null;
      onSaved?.(e.type, e.id, null);
      expanded[key] = false;
    } catch (err: any) {
      rowError[key] = err.message || 'Reset failed';
    } finally {
      busy[key] = false;
    }
  }
</script>

<div class="glass border rounded-xl p-6 space-y-4">
  <div class="flex items-center space-x-2.5 text-primary select-none">
    <SlidersHorizontal class="h-5 w-5" />
    <span class="text-xs font-bold uppercase tracking-wider">{title}</span>
  </div>
  <p class="text-xs text-muted-foreground -mt-1">{subtitle}</p>

  {#if entities.length === 0}
    <p class="text-sm text-muted-foreground italic">Nothing selected for this scenario yet.</p>
  {:else}
    <div class="space-y-2">
      {#each entities as e (keyOf(e))}
        {@const key = keyOf(e)}
        {@const Icon = ICONS[e.type]}
        <div class="rounded-lg border border-border bg-(--glass-inset-bg)">
          <div class="flex items-center justify-between p-3">
            <div class="flex items-center space-x-2.5 min-w-0">
              <Icon class="h-4 w-4 text-muted-foreground shrink-0" />
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-foreground truncate">{e.name}</span>
                  <span class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{e.type}</span>
                  {#if hasOverride(key)}
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                      <SlidersHorizontal class="h-2.5 w-2.5" /> Override
                    </span>
                  {/if}
                </div>
                <span class="text-[11px] text-muted-foreground">{summarize(e)}</span>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" class="h-8 px-2.5 shrink-0" onclick={() => toggle(e)}>
              <ChevronDown class="h-4 w-4 transition-transform {expanded[key] ? 'rotate-180' : ''}" />
            </Button>
          </div>

          {#if expanded[key] && draft[key]}
            <div class="border-t border-border/60 p-4 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {#each getFieldDefs(e) as f (f.key)}
                  <div class="space-y-1.5">
                    <Label for="{key}_{f.key}">{f.label}</Label>
                    {#if f.kind === 'frequency'}
                      <select id="{key}_{f.key}" bind:value={draft[key][f.key]} class={selectClass}>
                        <option value={undefined}>Catalog default ({fmtCatalog(e, f)})</option>
                        <option value="one_time">One-time</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    {:else}
                      <Input
                        id="{key}_{f.key}"
                        type="number"
                        step={f.step}
                        bind:value={draft[key][f.key]}
                        placeholder={fmtCatalog(e, f)}
                        class="bg-(--glass-inset-bg) text-right"
                      />
                    {/if}
                  </div>
                {/each}
              </div>

              <p class="text-[11px] text-muted-foreground">Leave a field blank to keep the catalog value.</p>

              {#if rowError[key]}
                <p class="text-xs text-destructive">{rowError[key]}</p>
              {/if}

              <div class="flex items-center justify-end gap-2">
                {#if hasOverride(key)}
                  <Button type="button" variant="outline" size="sm" disabled={busy[key]} onclick={() => clearOverride(e)}>
                    Reset to catalog
                  </Button>
                {/if}
                <Button type="button" size="sm" disabled={busy[key]} onclick={() => save(e)}>
                  {busy[key] ? 'Saving…' : 'Save override'}
                </Button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
