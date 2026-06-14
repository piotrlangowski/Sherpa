<script lang="ts">
  import Label from '$lib/components/ui/label/label.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import DollarSign from '@lucide/svelte/icons/dollar-sign';
  import Info from '@lucide/svelte/icons/info';
  import type { MonetizationConfig } from '$lib/types';

  interface Props {
    /** Existing catalog/effective config to prefill from. */
    monetization?: MonetizationConfig | null;
    /** When set, shown as a hint explaining inheritance while type === 'none'. */
    inheritedFromLabel?: string | null;
  }

  let { monetization = null, inheritedFromLabel = null }: Props = $props();

  let monType = $state<MonetizationConfig['monetization_type']>(monetization?.monetization_type ?? 'none');

  // Add-on
  let addonMonthlyFee = $state(monetization?.addon_monthly_fee ?? '');
  let addonHasUsageLimit = $state(!!monetization?.addon_has_usage_limit);
  let addonUsageLimit = $state(monetization?.addon_usage_limit ?? '');
  let addonOverchargePolicy = $state(monetization?.addon_overcharge_policy ?? 'hard_stop');

  // Usage
  let usageVariant = $state(monetization?.usage_variant ?? 'prepaid');
  let pricePerCredit = $state(monetization?.price_per_credit ?? '');

  // Hybrid
  let hybridMonthlyFee = $state(monetization?.hybrid_monthly_fee ?? '');
  let hybridIncludedCredits = $state(monetization?.hybrid_included_credits ?? '');
  let hybridOverchargePolicy = $state(monetization?.hybrid_overcharge_policy ?? 'payg');

  // Shared overcharge
  let overchargeMarkup = $state(monetization?.overcharge_markup ?? '');
  let overchargeUserPct = $state(monetization?.overcharge_user_pct ?? '');
  let avgOverchargePct = $state(monetization?.avg_overcharge_pct ?? '');

  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring';

  // Overcharge params are only meaningful when overage is actually billed.
  let addonOverageBilled = $derived(addonHasUsageLimit && addonOverchargePolicy !== 'hard_stop');
  let hybridOverageBilled = $derived(monType === 'hybrid' && hybridOverchargePolicy !== 'hard_stop');
  let showOverchargeParams = $derived(
    (monType === 'addon' && addonOverageBilled) || hybridOverageBilled
  );
</script>

<div class="glass border rounded-xl p-6 space-y-4">
  <div class="flex items-center space-x-2.5 text-primary mb-1 select-none">
    <DollarSign class="h-5 w-5" />
    <span class="text-xs font-bold uppercase tracking-wider">Monetization Model</span>
  </div>

  <div class="space-y-1.5 max-w-xs">
    <Label for="monetization_type">Billing model</Label>
    <select id="monetization_type" name="monetization_type" bind:value={monType} class={selectClass}>
      <option value="none">None (no direct AI charge)</option>
      <option value="addon">Add-on — flat monthly fee</option>
      <option value="usage">Usage-based — credits</option>
      <option value="hybrid">Hybrid — fee + included credits</option>
    </select>
  </div>

  {#if monType === 'none'}
    <p class="flex items-start gap-2 text-xs text-muted-foreground">
      <Info class="h-3.5 w-3.5 mt-0.5 shrink-0" />
      {#if inheritedFromLabel}
        No model set here — effective monetization is inherited ({inheritedFromLabel}).
      {:else}
        No direct AI charge. Revenue comes solely from the cohort ARPU model unless a parent
        (Pack / Plan) defines a model that this entity inherits.
      {/if}
    </p>
  {/if}

  {#if monType === 'addon'}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <Label for="addon_monthly_fee">Monthly fee per AI user</Label>
        <Input id="addon_monthly_fee" name="addon_monthly_fee" type="number" step="0.01" min="0"
          bind:value={addonMonthlyFee} placeholder="e.g. 29.00" class="bg-(--glass-inset-bg) text-right" />
      </div>
    </div>
    <label class="flex items-center space-x-3 p-3 rounded-lg border border-border bg-(--glass-inset-bg) cursor-pointer select-none max-w-xs">
      <input type="checkbox" name="addon_has_usage_limit" bind:checked={addonHasUsageLimit}
        class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/50" />
      <span class="text-sm font-medium">Enforce a usage limit</span>
    </label>
    {#if addonHasUsageLimit}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <Label for="addon_usage_limit">Usage limit (requests / month)</Label>
          <Input id="addon_usage_limit" name="addon_usage_limit" type="number" step="1" min="0"
            bind:value={addonUsageLimit} class="bg-(--glass-inset-bg) text-right" />
        </div>
        <div class="space-y-1.5">
          <Label for="addon_overcharge_policy">Over the limit</Label>
          <select id="addon_overcharge_policy" name="addon_overcharge_policy" bind:value={addonOverchargePolicy} class={selectClass}>
            <option value="hard_stop">Hard stop (no overage)</option>
            <option value="payg">Pay-as-you-go overage</option>
            <option value="credit_pack">Sell a credit pack</option>
          </select>
        </div>
      </div>
    {/if}
  {/if}

  {#if monType === 'usage'}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <Label for="usage_variant">Variant</Label>
        <select id="usage_variant" name="usage_variant" bind:value={usageVariant} class={selectClass}>
          <option value="prepaid">Prepaid credits</option>
          <option value="payg">Pay-as-you-go</option>
        </select>
      </div>
      <div class="space-y-1.5">
        <Label for="price_per_credit">Price per credit (blank = global default)</Label>
        <Input id="price_per_credit" name="price_per_credit" type="number" step="0.0001" min="0"
          bind:value={pricePerCredit} placeholder="global default" class="bg-(--glass-inset-bg) text-right" />
      </div>
    </div>
  {/if}

  {#if monType === 'hybrid'}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <Label for="hybrid_monthly_fee">Monthly fee per AI user</Label>
        <Input id="hybrid_monthly_fee" name="hybrid_monthly_fee" type="number" step="0.01" min="0"
          bind:value={hybridMonthlyFee} placeholder="e.g. 99.00" class="bg-(--glass-inset-bg) text-right" />
      </div>
      <div class="space-y-1.5">
        <Label for="hybrid_included_credits">Included credits / month</Label>
        <Input id="hybrid_included_credits" name="hybrid_included_credits" type="number" step="1" min="0"
          bind:value={hybridIncludedCredits} placeholder="e.g. 5000" class="bg-(--glass-inset-bg) text-right" />
      </div>
      <div class="space-y-1.5">
        <Label for="hybrid_overcharge_policy">Over the pool</Label>
        <select id="hybrid_overcharge_policy" name="hybrid_overcharge_policy" bind:value={hybridOverchargePolicy} class={selectClass}>
          <option value="payg">Pay-as-you-go overage</option>
          <option value="hard_stop">Hard stop (no overage)</option>
          <option value="credit_pack">Sell a credit pack</option>
        </select>
      </div>
      <div class="space-y-1.5">
        <Label for="hybrid_price_per_credit">Overage price per credit (blank = default)</Label>
        <Input id="hybrid_price_per_credit" name="price_per_credit" type="number" step="0.0001" min="0"
          bind:value={pricePerCredit} placeholder="global default" class="bg-(--glass-inset-bg) text-right" />
      </div>
    </div>
  {/if}

  {#if showOverchargeParams}
    <div class="border-t border-border/60 pt-4 space-y-1.5">
      <p class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Overage assumptions</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="space-y-1.5">
          <Label for="overcharge_markup">Price markup (×)</Label>
          <Input id="overcharge_markup" name="overcharge_markup" type="number" step="0.1" min="0"
            bind:value={overchargeMarkup} placeholder="1.5" class="bg-(--glass-inset-bg) text-right" />
        </div>
        <div class="space-y-1.5">
          <Label for="overcharge_user_pct">Users exceeding (0–1)</Label>
          <Input id="overcharge_user_pct" name="overcharge_user_pct" type="number" step="0.01" min="0" max="1"
            bind:value={overchargeUserPct} placeholder="0.2" class="bg-(--glass-inset-bg) text-right" />
        </div>
        <div class="space-y-1.5">
          <Label for="avg_overcharge_pct">Avg overage over pool</Label>
          <Input id="avg_overcharge_pct" name="avg_overcharge_pct" type="number" step="0.01" min="0"
            bind:value={avgOverchargePct} placeholder="0.5" class="bg-(--glass-inset-bg) text-right" />
        </div>
      </div>
    </div>
  {/if}
</div>
