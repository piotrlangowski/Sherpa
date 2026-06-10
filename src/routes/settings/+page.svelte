<script lang="ts">
  import { enhance } from '$app/forms';
  import { CURRENCIES } from '$lib/utils/constants';
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

  let { data, form } = $props();

  let companyName = $state(data.settings.companyName);
  let currency = $state(data.settings.currency);
  let discountRate = $state([Math.round(data.settings.defaultDiscountRate * 100)]);
  let projectionHorizonMonths = $state(data.settings.projectionHorizonMonths);

  let showResetConfirm = $state(false);
  let isSaving = $state(false);
  let isResetting = $state(false);
</script>

<div class="max-w-3xl space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Workspace Settings</h2>
      <p class="text-muted-foreground text-sm">Configure defaults and manage database states.</p>
    </div>
  </div>

  {#if form?.success}
    <Alert variant="default" class="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
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
          <Input id="companyName" name="companyName" bind:value={companyName} class="max-w-md bg-background/50" />
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

      </CardContent>

      <CardFooter class="border-t border-border bg-black/10 flex justify-end py-4">
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
            This will permanently wipe all your customized services, packs, plans, verticals, and scenarios, and re-seed the workspace with the "Acme Analytics" sample dataset.
          </p>
        </div>
        
        <Button variant="destructive" onclick={() => showResetConfirm = true}>
          <RefreshCw class="h-4 w-4 mr-2" />
          Reset Workspace
        </Button>
      </div>
    </CardContent>
  </Card>
</div>

<!-- Confirm Reset Dialog Overlay -->
{#if showResetConfirm}
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <Card class="w-full max-w-md border-destructive/20 shadow-2xl bg-card">
      <CardHeader class="border-b border-border bg-destructive/10 text-destructive">
        <div class="flex items-center space-x-2">
          <AlertTriangle class="h-5 w-5" />
          <CardTitle>Are you absolutely sure?</CardTitle>
        </div>
        <CardDescription class="text-destructive/80 mt-1">This operation is permanent and irreversible.</CardDescription>
      </CardHeader>
      
      <CardContent class="py-4 text-sm space-y-2">
        <p>You are about to reset the entire database. This will:</p>
        <ul class="list-disc list-inside space-y-1 text-muted-foreground pl-1">
          <li>Delete all your custom AI Services & Feature Packs</li>
          <li>Remove all Pricing Plans & Market Verticals</li>
          <li>Wipe all Cohort configurations</li>
          <li>Wipe all Scenarios & Projections</li>
          <li>Re-seed with "Acme Analytics" sample database</li>
        </ul>
      </CardContent>
      
      <CardFooter class="border-t border-border bg-black/10 py-3 flex justify-end space-x-2">
        <Button variant="outline" onclick={() => showResetConfirm = false} disabled={isResetting}>Cancel</Button>
        <form method="POST" action="?/resetWorkspace" use:enhance={() => {
          isResetting = true;
          return async ({ update }) => {
            await update();
            isResetting = false;
            showResetConfirm = false;
          };
        }}>
          <Button type="submit" variant="destructive" disabled={isResetting}>
            {#if isResetting}Resetting...{:else}Yes, Reset Workspace{/if}
          </Button>
        </form>
      </CardFooter>
    </Card>
  </div>
{/if}
