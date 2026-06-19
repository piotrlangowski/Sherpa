<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { appState } from '$lib/stores/app.svelte';
  import { CURRENCIES } from '$lib/utils/constants';
  import { FormDialog } from '$lib/components/forms';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Slider from '$lib/components/ui/slider/slider.svelte';
  import Alert from '$lib/components/ui/alert/alert.svelte';
  import AlertTitle from '$lib/components/ui/alert/alert-title.svelte';
  import AlertDescription from '$lib/components/ui/alert/alert-description.svelte';
  
  // Lucide Icons
  import Save from '@lucide/svelte/icons/save';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Check from '@lucide/svelte/icons/check';

  let { data, form } = $props();

  let companyName = $state(data.settings.companyName);
  let currency = $state(data.settings.currency);
  let discountRate = $state([Math.round(data.settings.defaultDiscountRate * 100)]);
  let projectionHorizonMonths = $state(data.settings.projectionHorizonMonths);
  
  let exchangeRates = $state(JSON.parse(JSON.stringify(data.settings.exchangeRates || {})));
  let ratesAsOf = $state(data.settings.exchangeRatesAsOf);
  let isRefreshing = $state(false);
  let refreshError = $state<string | null>(null);

  // Credit configuration (global AI monetization defaults)
  let pricePerCredit = $state(data.settings.pricePerCredit);
  let inputTokensPerCredit = $state(data.settings.inputTokensPerCredit);
  let outputTokensPerCredit = $state(data.settings.outputTokensPerCredit);
  let overchargeMarkup = $state(data.settings.overchargeMarkup);
  let overchargeUserPct = $state(data.settings.overchargeUserPct);
  let avgOverchargePct = $state(data.settings.avgOverchargePct);

  async function handleRefresh() {
    isRefreshing = true;
    refreshError = null;
    try {
      const response = await fetch('/api/exchange-rates/refresh', {
        method: 'POST'
      });
      const resData = await response.json();
      if (resData.success) {
        exchangeRates = resData.rates;
        ratesAsOf = resData.asOf;
        // Reload to propagate new rates to AppState
        window.location.reload();
      } else {
        refreshError = resData.error || 'Failed to refresh rates.';
      }
    } catch (e: any) {
      refreshError = e.message || 'Network error.';
    } finally {
      isRefreshing = false;
    }
  }

  let showResetConfirm = $state(false);
  let isSaving = $state(false);

  // Reset workspace flow is a small state machine driven entirely on the client:
  // warning → resetting (progress) → done (confirmation) → setup wizard.
  let resetPhase = $state<'warning' | 'resetting' | 'done'>('warning');
  let resetError = $state<string | null>(null);

  function openResetDialog() {
    resetPhase = 'warning';
    resetError = null;
    showResetConfirm = true;
  }

  async function revealWizard() {
    try {
      // Refresh layout data so the wizard mounts with freshly seeded defaults:
      // reset() re-seeds setup_completed = 0 → appState.setupCompleted = false via
      // the layout $effect → the layout swaps AppShell for the SetupWizard.
      await invalidateAll();
    } catch {
      window.location.assign('/');
      return;
    }
    // Fallback: if the reactive reveal didn't flip the flag, hard-reload to home.
    setTimeout(() => {
      if (appState.setupCompleted) window.location.assign('/');
    }, 500);
  }
</script>

<div class="max-w-3xl space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Workspace Settings</h2>
      <p class="text-muted-foreground text-sm">Configure defaults and manage database states.</p>
    </div>
  </div>

  {#if form?.success}
    <Alert variant="default" class="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
      <AlertTitle>Settings Saved</AlertTitle>
      <AlertDescription>Your organization changes have been successfully saved.</AlertDescription>
    </Alert>
  {/if}

  {#if form?.error}
    <Alert variant="destructive">
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{form.error}</AlertDescription>
    </Alert>
  {/if}

  <form method="POST" action="?/updateSettings" use:enhance={() => {
    isSaving = true;
    return async ({ update }) => {
      await update();
      isSaving = false;
      // Force page reload to trigger appState initialization update from loaded settings
      window.location.reload();
    };
  }}>
    <Card class="border-border">
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>Configure core branding and currency defaults.</CardDescription>
      </CardHeader>
      
      <CardContent class="space-y-4">
        <!-- Company Name -->
        <div class="space-y-2">
          <Label for="companyName">Organization / Company Name</Label>
          <Input id="companyName" name="companyName" bind:value={companyName} class="max-w-md bg-(--glass-inset-bg)" />
          <p class="text-xs text-muted-foreground">Used as the client branding on screenshots and reports.</p>
        </div>

        <!-- Currency -->
        <div class="space-y-2">
          <Label for="currency">Base Currency</Label>
          <select
            id="currency"
            name="currency"
            bind:value={currency}
            class="w-full max-w-md bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {#each CURRENCIES as cur}
              <option value={cur.value}>{cur.label} ({cur.symbol})</option>
            {/each}
          </select>
          <p class="text-xs text-muted-foreground">The primary currency for pricing inputs and cashflow projections.</p>
        </div>

        <!-- Projection Horizon -->
        <div class="space-y-2">
          <Label for="projectionHorizonMonths">Default Projection Horizon</Label>
          <select
            id="projectionHorizonMonths"
            name="projectionHorizonMonths"
            bind:value={projectionHorizonMonths}
            class="w-full max-w-md bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value={12}>12 Months (1 Year)</option>
            <option value={24}>24 Months (2 Years)</option>
            <option value={36}>36 Months (3 Years)</option>
            <option value={48}>48 Months (4 Years)</option>
            <option value={60}>60 Months (5 Years)</option>
          </select>
          <p class="text-xs text-muted-foreground">Default timeline granularity for financial forecast engines.</p>
        </div>

        <!-- Discount Rate -->
        <div class="space-y-3 pt-2 max-w-md">
          <div class="flex justify-between items-center">
            <Label for="discountRateSlider">Default Discount Rate</Label>
            <span class="text-sm font-semibold text-primary">{discountRate[0]}%</span>
          </div>
          <Slider id="discountRateSlider" bind:value={discountRate} min={0} max={30} step={1} type="multiple" />
          <input type="hidden" name="defaultDiscountRate" value={discountRate[0] / 100} />
          <p class="text-xs text-muted-foreground">Used as the cost of capital to compute Net Present Value (NPV).</p>
        </div>

        <!-- Exchange Rates -->
        <div class="space-y-4 pt-4 border-t border-border">
          <div class="flex items-center justify-between max-w-md">
            <div>
              <h3 class="text-sm font-semibold">Exchange Rates</h3>
              <p class="text-xs text-muted-foreground">Rates relative to 1 USD. Last refreshed: {ratesAsOf || 'Never'}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onclick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw class="h-3.5 w-3.5 mr-1.5 {isRefreshing ? 'animate-spin' : ''}" />
              Refresh from ECB
            </Button>
          </div>
          
          {#if refreshError}
            <p class="text-xs text-destructive">{refreshError}</p>
          {/if}

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-md">
            <div class="space-y-2">
              <Label for="rate_EUR">1 USD = EUR</Label>
              <Input type="number" step="any" id="rate_EUR" name="rate_EUR" bind:value={exchangeRates.EUR} class="bg-(--glass-inset-bg)" />
            </div>
            <div class="space-y-2">
              <Label for="rate_PLN">1 USD = PLN</Label>
              <Input type="number" step="any" id="rate_PLN" name="rate_PLN" bind:value={exchangeRates.PLN} class="bg-(--glass-inset-bg)" />
            </div>
            <div class="space-y-2">
              <Label for="rate_GBP">1 USD = GBP</Label>
              <Input type="number" step="any" id="rate_GBP" name="rate_GBP" bind:value={exchangeRates.GBP} class="bg-(--glass-inset-bg)" />
            </div>
            <input type="hidden" name="rate_USD" value="1.0" />
            <input type="hidden" name="exchangeRatesAsOf" value={ratesAsOf} />
          </div>
        </div>

        <!-- Credit Configuration -->
        <div class="space-y-4 pt-4 border-t border-border">
          <div class="max-w-md">
            <h3 class="text-sm font-semibold">Credit Configuration</h3>
            <p class="text-xs text-muted-foreground">
              Global defaults for AI monetization (usage-based & hybrid models). Per-provider token ratios
              and per-config overrides take precedence over these.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
            <div class="space-y-2">
              <Label for="pricePerCredit">Price per credit ({currency})</Label>
              <Input type="number" step="0.0001" min="0" id="pricePerCredit" name="pricePerCredit" bind:value={pricePerCredit} class="bg-(--glass-inset-bg)" />
            </div>
            <div class="space-y-2">
              <Label for="overchargeMarkup">Overage markup (×)</Label>
              <Input type="number" step="0.1" min="0" id="overchargeMarkup" name="overchargeMarkup" bind:value={overchargeMarkup} class="bg-(--glass-inset-bg)" />
            </div>
            <div class="space-y-2">
              <Label for="inputTokensPerCredit">Input tokens / credit</Label>
              <Input type="number" step="1" min="1" id="inputTokensPerCredit" name="inputTokensPerCredit" bind:value={inputTokensPerCredit} class="bg-(--glass-inset-bg)" />
            </div>
            <div class="space-y-2">
              <Label for="outputTokensPerCredit">Output tokens / credit</Label>
              <Input type="number" step="1" min="1" id="outputTokensPerCredit" name="outputTokensPerCredit" bind:value={outputTokensPerCredit} class="bg-(--glass-inset-bg)" />
            </div>
            <div class="space-y-2">
              <Label for="overchargeUserPct">Default users exceeding (0–1)</Label>
              <Input type="number" step="0.01" min="0" max="1" id="overchargeUserPct" name="overchargeUserPct" bind:value={overchargeUserPct} class="bg-(--glass-inset-bg)" />
            </div>
            <div class="space-y-2">
              <Label for="avgOverchargePct">Default avg overage over pool</Label>
              <Input type="number" step="0.01" min="0" id="avgOverchargePct" name="avgOverchargePct" bind:value={avgOverchargePct} class="bg-(--glass-inset-bg)" />
            </div>
          </div>
        </div>

      </CardContent>

      <CardFooter class="border-t border-border glass-inset flex justify-end py-4">
        <Button type="submit" disabled={isSaving}>
          <Save class="h-4 w-4 mr-2" />
          {#if isSaving}Saving...{:else}Save Changes{/if}
        </Button>
      </CardFooter>
    </Card>
  </form>

  <!-- Danger Zone -->
  <Card class="border-destructive/20 bg-destructive/5">
    <CardHeader>
      <div class="flex items-center space-x-2 text-destructive">
        <ShieldAlert class="h-5 w-5" />
        <CardTitle class="text-lg">Danger Zone</CardTitle>
      </div>
      <CardDescription class="text-destructive/80">Destructive actions that cannot be undone.</CardDescription>
    </CardHeader>
    
    <CardContent>
      <div class="flex items-center justify-between py-2">
        <div class="space-y-0.5 max-w-md">
          <h4 class="text-sm font-semibold">Reset Workspace to Sample Data</h4>
          <p class="text-xs text-muted-foreground">
            This will permanently wipe all your customized services, packs, plans, verticals, and scenarios, and re-seed the workspace with the "Beacon Helpdesk" sample dataset.
          </p>
        </div>
        
        <Button variant="destructive" onclick={openResetDialog}>
          <RefreshCw class="h-4 w-4 mr-2" />
          Reset Workspace
        </Button>
      </div>
    </CardContent>
  </Card>
</div>

<!-- Confirm Reset Dialog -->
<FormDialog
  bind:open={showResetConfirm}
  size="sm"
  destructive={resetPhase === 'warning'}
  icon={resetPhase === 'done' ? Check : resetPhase === 'resetting' ? RefreshCw : AlertTriangle}
  title={resetPhase === 'done'
    ? 'Workspace reset complete'
    : resetPhase === 'resetting'
      ? 'Resetting workspace…'
      : 'Are you absolutely sure?'}
  description={resetPhase === 'done'
    ? 'Launching the setup wizard…'
    : resetPhase === 'resetting'
      ? 'Wiping your data and re-seeding the sample dataset.'
      : 'This operation is permanent and irreversible.'}
>
  {#if resetPhase === 'warning'}
    {#if resetError}
      <Alert variant="destructive">
        <AlertTitle>Reset failed</AlertTitle>
        <AlertDescription>{resetError}</AlertDescription>
      </Alert>
    {/if}
    <p class="text-sm">You are about to reset the entire database. This will:</p>
    <ul class="list-disc list-inside space-y-1 text-sm text-muted-foreground pl-1">
      <li>Delete all your custom AI Services & Feature Packs</li>
      <li>Remove all Pricing Plans & Market Verticals</li>
      <li>Wipe all Cohort configurations</li>
      <li>Wipe all Scenarios & Projections</li>
      <li>Re-seed with "Beacon Helpdesk" sample database</li>
    </ul>
  {:else if resetPhase === 'resetting'}
    <div class="flex flex-col items-center justify-center gap-4 py-4">
      <RefreshCw class="h-8 w-8 text-primary animate-spin" />
      <!-- Indeterminate progress: the reset is a single atomic transaction. -->
      <div class="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
        <div class="reset-bar h-full w-1/3 rounded-full bg-primary"></div>
      </div>
      <p class="text-xs text-muted-foreground">Resetting workspace to sample data…</p>
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center gap-3 py-4">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      >
        <Check class="h-6 w-6" />
      </div>
      <p class="text-sm font-medium">Your workspace has been reset.</p>
      <p class="text-xs text-muted-foreground">Opening the setup wizard…</p>
    </div>
  {/if}

  {#snippet footer()}
    {#if resetPhase === 'warning'}
      <Button variant="outline" onclick={() => (showResetConfirm = false)}>Cancel</Button>
      <form
        method="POST"
        action="?/resetWorkspace"
        use:enhance={() => {
          resetPhase = 'resetting';
          resetError = null;
          const startedAt = Date.now();
          return async ({ result }) => {
            // Keep the progress step on screen long enough to be perceivable.
            const elapsed = Date.now() - startedAt;
            if (elapsed < 500) await new Promise((r) => setTimeout(r, 500 - elapsed));

            if (result.type === 'success') {
              resetPhase = 'done';
              // Let the confirmation register before the wizard takes the screen.
              await new Promise((r) => setTimeout(r, 800));
              await revealWizard();
            } else {
              resetError =
                (result.type === 'failure' &&
                  (result.data as { error?: string } | undefined)?.error) ||
                'Failed to reset workspace.';
              resetPhase = 'warning';
            }
          };
        }}
      >
        <Button type="submit" variant="destructive">Yes, Reset Workspace</Button>
      </form>
    {/if}
  {/snippet}
</FormDialog>

<style>
  @keyframes reset-progress {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(300%);
    }
  }
  .reset-bar {
    animation: reset-progress 1.1s ease-in-out infinite;
  }
</style>
