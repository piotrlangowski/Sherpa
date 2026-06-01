<script lang="ts">
  import { appState } from '$lib/stores/app.svelte';
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
  
  // Lucide Icons
  import Building from '@lucide/svelte/icons/building';
  import Coins from '@lucide/svelte/icons/coins';
  import Database from '@lucide/svelte/icons/database';
  import Check from '@lucide/svelte/icons/check';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  let step = $state(1);
  let companyName = $state(appState.companyName || 'Acme Analytics');
  let currency = $state(appState.currency || 'USD');
  let discountRate = $state([10]); // slider expects array
  let keepSampleData = $state(true);
  let isSaving = $state(false);

  async function handleSave() {
    isSaving = true;
    try {
      const response = await fetch('/api/settings/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          currency,
          discountRate: discountRate[0] / 100,
          keepSample: keepSampleData
        })
      });

      if (response.ok) {
        appState.setCompanyName(companyName);
        appState.setCurrency(currency);
        appState.setDiscountRate(discountRate[0] / 100);
        appState.setSetupCompleted(true);
        // Reload page to refresh all data loaded by layout
        window.location.reload();
      } else {
        console.error('Failed to save wizard settings');
      }
    } catch (err) {
      console.error('Error saving wizard settings:', err);
    } finally {
      isSaving = false;
    }
  }
</script>

{#if !appState.setupCompleted}
  <div class="fixed inset-0 bg-background/90 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
    <div class="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none"></div>
    <div class="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none"></div>

    <Card class="w-full max-w-lg border border-border shadow-2xl bg-card/80 relative z-10">
      <CardHeader class="border-b border-border bg-black/10">
        <div class="flex items-center space-x-2 text-primary">
          <Sparkles class="h-5 w-5" />
          <span class="text-xs font-bold uppercase tracking-wider">Onboarding Wizard</span>
        </div>
        <CardTitle class="text-2xl font-bold mt-1">Configure Your Workspace</CardTitle>
        <CardDescription>Let's personalize Sherpa for your organization.</CardDescription>
        
        <!-- Stepper Indicator -->
        <div class="flex items-center space-x-2 mt-4">
          <div class="flex-1 h-1.5 rounded-full {step >= 1 ? 'bg-primary' : 'bg-muted'}" aria-label="Step 1"></div>
          <div class="flex-1 h-1.5 rounded-full {step >= 2 ? 'bg-primary' : 'bg-muted'}" aria-label="Step 2"></div>
          <div class="flex-1 h-1.5 rounded-full {step >= 3 ? 'bg-primary' : 'bg-muted'}" aria-label="Step 3"></div>
        </div>
      </CardHeader>

      <CardContent class="py-6 space-y-5">
        <!-- Step 1: Company details -->
        {#if step === 1}
          <div class="space-y-4">
            <div class="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-2">
              <Building class="h-6 w-6" />
            </div>
            <h3 class="text-lg font-semibold">Company Profile</h3>
            <div class="space-y-2">
              <Label for="company-name">Organization Name</Label>
              <Input
                id="company-name"
                placeholder="e.g. Acme Corporation"
                bind:value={companyName}
                class="bg-background/50"
              />
              <p class="text-xs text-muted-foreground">
                This name will appear on all exported ROI dashboard screenshots.
              </p>
            </div>
          </div>
        {/if}

        <!-- Step 2: Financial configuration -->
        {#if step === 2}
          <div class="space-y-4">
            <div class="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-2">
              <Coins class="h-6 w-6" />
            </div>
            <h3 class="text-lg font-semibold">Financial Settings</h3>
            
            <div class="space-y-2">
              <Label for="currency">Base Currency</Label>
              <select
                id="currency"
                bind:value={currency}
                class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {#each CURRENCIES as cur}
                  <option value={cur.value}>{cur.label} ({cur.symbol})</option>
                {/each}
              </select>
            </div>

            <div class="space-y-3 pt-2">
              <div class="flex justify-between items-center">
                <Label for="discount-rate">Default Annual Discount Rate</Label>
                <span class="text-sm font-semibold text-primary">{discountRate[0]}%</span>
              </div>
              <Slider
                id="discount-rate"
                bind:value={discountRate}
                min={0}
                max={30}
                step={1}
                type="multiple"
              />
              <p class="text-xs text-muted-foreground">
                Used to discount future cash flows to calculate Net Present Value (NPV).
              </p>
            </div>
          </div>
        {/if}

        <!-- Step 3: Sample data choices -->
        {#if step === 3}
          <div class="space-y-4">
            <div class="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-2">
              <Database class="h-6 w-6" />
            </div>
            <h3 class="text-lg font-semibold">Workspace Data</h3>
            
            <div class="p-4 rounded-lg bg-muted/40 border border-border space-y-3">
              <label class="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={keepSampleData}
                  class="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/50"
                />
                <div>
                  <span class="text-sm font-semibold text-foreground block">Keep "Acme Analytics" Sample Data</span>
                  <span class="text-xs text-muted-foreground block mt-0.5">
                    Recommended. Pre-populates your catalog with 5 AI services, 2 packs, 2 plans, and a demo scenario to let you explore the charts immediately. You can modify or delete this data anytime.
                  </span>
                </div>
              </label>
            </div>
          </div>
        {/if}
      </CardContent>

      <CardFooter class="border-t border-border bg-black/10 py-4 flex justify-between">
        {#if step > 1}
          <Button variant="outline" onclick={() => step--}>Back</Button>
        {:else}
          <div></div> <!-- Spacer -->
        {/if}

        {#if step < 3}
          <Button onclick={() => step++}>Continue</Button>
        {:else}
          <Button disabled={isSaving} onclick={handleSave}>
            {#if isSaving}
              Initializing...
            {:else}
              <div class="flex items-center space-x-1.5">
                <Check class="h-4 w-4" />
                <span>Finish & Launch</span>
              </div>
            {/if}
          </Button>
        {/if}
      </CardFooter>
    </Card>
  </div>
{/if}
