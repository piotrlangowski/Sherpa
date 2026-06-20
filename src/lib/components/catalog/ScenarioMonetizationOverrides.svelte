<script lang="ts">
  import Label from '$lib/components/ui/label/label.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Zap from '@lucide/svelte/icons/zap';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Layers from '@lucide/svelte/icons/layers';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import type { MonetizationConfig, ModelingType, RevenueCarrier } from '$lib/types';

  export interface OverrideEntityRow {
    type: 'plan' | 'pack' | 'service';
    id: string;
    name: string;
    catalog: MonetizationConfig | null;
    override: MonetizationConfig | null;
  }

  interface Props {
    scenarioId: string;
    entities: OverrideEntityRow[];
    modelingType?: ModelingType;
    resolvedCarrier?: RevenueCarrier;
  }

  let { scenarioId, entities, modelingType = 'appraisal', resolvedCarrier = 'cohort' }: Props = $props();

  const keyOf = (e: { type: string; id: string }) => `${e.type}:${e.id}`;
  const blank = (): MonetizationConfig => ({ monetization_type: 'none' });

  // Local override state keyed by `${type}:${id}` — drives the badges; mutated after save/clear.
  let overrides = $state<Record<string, MonetizationConfig | null>>(
    Object.fromEntries(entities.map((e) => [keyOf(e), e.override ?? null]))
  );
  let expanded = $state<Record<string, boolean>>({});
  let draft = $state<Record<string, MonetizationConfig>>({});
  let busy = $state<Record<string, boolean>>({});
  let rowError = $state<Record<string, string | null>>({});

  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring';

  function hasOverride(key: string): boolean {
    const o = overrides[key];
    return !!o && o.monetization_type !== 'none';
  }

  function summarize(c: MonetizationConfig | null): string {
    if (!c || c.monetization_type === 'none') return 'No model';
    switch (c.monetization_type) {
      case 'addon':
        return `Add-on · ${c.addon_monthly_fee ?? 0}/user${c.addon_has_usage_limit ? ' (limited)' : ''}`;
      case 'usage':
        return `Usage · ${c.price_per_credit != null ? c.price_per_credit + '/credit' : 'default price'}`;
      case 'hybrid':
        return `Hybrid · ${c.hybrid_monthly_fee ?? 0} + ${c.hybrid_included_credits ?? 0} credits`;
      default:
        return 'No model';
    }
  }

  function effective(e: OverrideEntityRow): MonetizationConfig | null {
    return overrides[keyOf(e)] ?? e.catalog ?? null;
  }

  function toggle(e: OverrideEntityRow) {
    const key = keyOf(e);
    if (expanded[key]) {
      expanded[key] = false;
      return;
    }
    // Seed the draft from the existing override, falling back to the catalog config.
    draft[key] = JSON.parse(JSON.stringify(overrides[key] ?? e.catalog ?? blank()));
    rowError[key] = null;
    expanded[key] = true;
  }

  const iconFor = (type: string) => (type === 'plan' ? CreditCard : type === 'pack' ? Layers : BrainCircuit);

  async function save(e: OverrideEntityRow) {
    const key = keyOf(e);
    busy[key] = true;
    rowError[key] = null;
    try {
      const res = await fetch('/api/monetization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: e.type,
          entity_id: e.id,
          scenario_id: scenarioId,
          config: draft[key]
        })
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      // 'none' clears the override server-side; reflect that locally.
      overrides[key] = draft[key].monetization_type === 'none' ? null : JSON.parse(JSON.stringify(draft[key]));
      expanded[key] = false;
    } catch (err: any) {
      rowError[key] = err.message || 'Save failed';
    } finally {
      busy[key] = false;
    }
  }

  async function clearOverride(e: OverrideEntityRow) {
    const key = keyOf(e);
    busy[key] = true;
    rowError[key] = null;
    try {
      const params = new URLSearchParams({ entity_type: e.type, entity_id: e.id, scenario_id: scenarioId });
      const res = await fetch(`/api/monetization?${params}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Reset failed (${res.status})`);
      overrides[key] = null;
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
    <Zap class="h-5 w-5" />
    <span class="text-xs font-bold uppercase tracking-wider">Monetization Overrides</span>
  </div>
  <p class="text-xs text-muted-foreground -mt-1">
    Override the catalog monetization model for this scenario only. Changes save immediately.
    Manage the entities in the scenario in the steps above (save the scenario first if you just changed the selection).
  </p>

  {#if modelingType === 'incremental' || resolvedCarrier === 'cohort'}
    <p class="text-sm text-muted-foreground italic">Monetization is disabled for {modelingType === 'incremental' ? 'incremental' : 'cohort-carrier'} scenarios.</p>
  {:else}
    {@const carrierFilter = resolvedCarrier === 'feature' ? 'service' : resolvedCarrier}
    {@const filteredEntities = entities.filter(e => e.type === carrierFilter)}
    {#if filteredEntities.length === 0}
      <p class="text-sm text-muted-foreground italic">No plans, packs or services of type '{carrierFilter}' selected for this scenario yet.</p>
    {:else}
      <div class="space-y-2">
        {#each filteredEntities as e (keyOf(e))}
          {@const key = keyOf(e)}
          {@const Icon = iconFor(e.type)}
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
                        <Zap class="h-2.5 w-2.5" /> Override
                      </span>
                    {/if}
                  </div>
                  <span class="text-[11px] text-muted-foreground">{summarize(effective(e))}</span>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" class="h-8 px-2.5 shrink-0" onclick={() => toggle(e)}>
                <ChevronDown class="h-4 w-4 transition-transform {expanded[key] ? 'rotate-180' : ''}" />
              </Button>
            </div>

            {#if expanded[key] && draft[key]}
              <div class="border-t border-border/60 p-4 space-y-4">
                <div class="space-y-1.5 max-w-xs">
                  <Label for="mon_type_{key}">Billing model (scenario override)</Label>
                  <select id="mon_type_{key}" bind:value={draft[key].monetization_type} class={selectClass}>
                    <option value="none">None (use catalog / inherited)</option>
                    <option value="addon">Add-on — flat monthly fee</option>
                    <option value="usage">Usage-based — credits</option>
                    <option value="hybrid">Hybrid — fee + included credits</option>
                  </select>
                </div>

                {#if draft[key].monetization_type === 'addon'}
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                      <Label for="addon_fee_{key}">Monthly fee per AI user</Label>
                      <Input id="addon_fee_{key}" type="number" step="0.01" min="0" bind:value={draft[key].addon_monthly_fee} class="bg-(--glass-inset-bg) text-right" />
                    </div>
                    <label class="flex items-center space-x-3 p-3 rounded-lg border border-border cursor-pointer select-none self-end">
                      <input type="checkbox" bind:checked={draft[key].addon_has_usage_limit} class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/50" />
                      <span class="text-sm font-medium">Usage limit</span>
                    </label>
                    {#if draft[key].addon_has_usage_limit}
                      <div class="space-y-1.5">
                        <Label for="addon_limit_{key}">Usage limit (requests / month)</Label>
                        <Input id="addon_limit_{key}" type="number" step="1" min="0" bind:value={draft[key].addon_usage_limit} class="bg-(--glass-inset-bg) text-right" />
                      </div>
                      <div class="space-y-1.5">
                        <Label for="addon_policy_{key}">Over the limit</Label>
                        <select id="addon_policy_{key}" bind:value={draft[key].addon_overcharge_policy} class={selectClass}>
                          <option value="hard_stop">Hard stop</option>
                          <option value="payg">Pay-as-you-go</option>
                          <option value="credit_pack">Credit pack</option>
                        </select>
                      </div>
                    {/if}
                  </div>
                {/if}

                {#if draft[key].monetization_type === 'usage'}
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                      <Label for="usage_variant_{key}">Variant</Label>
                      <select id="usage_variant_{key}" bind:value={draft[key].usage_variant} class={selectClass}>
                        <option value="prepaid">Prepaid credits</option>
                        <option value="payg">Pay-as-you-go</option>
                      </select>
                    </div>
                    <div class="space-y-1.5">
                      <Label for="usage_price_{key}">Price per credit (blank = default)</Label>
                      <Input id="usage_price_{key}" type="number" step="0.0001" min="0" bind:value={draft[key].price_per_credit} class="bg-(--glass-inset-bg) text-right" />
                    </div>
                  </div>
                {/if}

                {#if draft[key].monetization_type === 'hybrid'}
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                      <Label for="hybrid_fee_{key}">Monthly fee per AI user</Label>
                      <Input id="hybrid_fee_{key}" type="number" step="0.01" min="0" bind:value={draft[key].hybrid_monthly_fee} class="bg-(--glass-inset-bg) text-right" />
                    </div>
                    <div class="space-y-1.5">
                      <Label for="hybrid_credits_{key}">Included credits / month</Label>
                      <Input id="hybrid_credits_{key}" type="number" step="1" min="0" bind:value={draft[key].hybrid_included_credits} class="bg-(--glass-inset-bg) text-right" />
                    </div>
                    <div class="space-y-1.5">
                      <Label for="hybrid_policy_{key}">Over the pool</Label>
                      <select id="hybrid_policy_{key}" bind:value={draft[key].hybrid_overcharge_policy} class={selectClass}>
                        <option value="payg">Pay-as-you-go</option>
                        <option value="hard_stop">Hard stop</option>
                        <option value="credit_pack">Credit pack</option>
                      </select>
                    </div>
                    <div class="space-y-1.5">
                      <Label for="hybrid_price_{key}">Overage price per credit (blank = default)</Label>
                      <Input id="hybrid_price_{key}" type="number" step="0.0001" min="0" bind:value={draft[key].price_per_credit} class="bg-(--glass-inset-bg) text-right" />
                    </div>
                  </div>
                {/if}

                {#if (draft[key].monetization_type === 'addon' && draft[key].addon_has_usage_limit && draft[key].addon_overcharge_policy !== 'hard_stop') || (draft[key].monetization_type === 'hybrid' && draft[key].hybrid_overcharge_policy !== 'hard_stop')}
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border/60 pt-3">
                    <div class="space-y-1.5">
                      <Label for="oc_markup_{key}">Markup (×)</Label>
                      <Input id="oc_markup_{key}" type="number" step="0.1" min="0" bind:value={draft[key].overcharge_markup} placeholder="1.5" class="bg-(--glass-inset-bg) text-right" />
                    </div>
                    <div class="space-y-1.5">
                      <Label for="oc_users_{key}">Users exceeding (0–1)</Label>
                      <Input id="oc_users_{key}" type="number" step="0.01" min="0" max="1" bind:value={draft[key].overcharge_user_pct} placeholder="0.2" class="bg-(--glass-inset-bg) text-right" />
                    </div>
                    <div class="space-y-1.5">
                      <Label for="oc_avg_{key}">Avg overage</Label>
                      <Input id="oc_avg_{key}" type="number" step="0.01" min="0" bind:value={draft[key].avg_overcharge_pct} placeholder="0.5" class="bg-(--glass-inset-bg) text-right" />
                    </div>
                  </div>
                {/if}

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
  {/if}
</div>
