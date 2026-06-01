<script lang="ts">
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Slider from '$lib/components/ui/slider/slider.svelte';

  // Lucide Icons
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Save from '@lucide/svelte/icons/save';
  import Compass from '@lucide/svelte/icons/compass';
  import Check from '@lucide/svelte/icons/check';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import DollarSign from '@lucide/svelte/icons/dollar-sign';

  let { data } = $props();

  // Wizard Navigation
  let currentStep = $state(1);

  // Step 1: Details
  let name = $state('');
  let description = $state('');
  let projectionMonths = $state(36);
  let discountRateArr = $state([10]); // slider
  let cohortConfigId = $state('');

  // Step 2: Rollout Offerings
  let selectedServices = $state<Record<string, boolean>>({});
  let rolloutServices = $state<Record<string, number>>({});

  let selectedPacks = $state<Record<string, boolean>>({});
  let rolloutPacks = $state<Record<string, number>>({});

  let selectedPlans = $state<Record<string, boolean>>({});
  let rolloutPlans = $state<Record<string, number>>({});

  // Step 3: Cost Items
  let selectedCosts = $state<Record<string, boolean>>({});

  // Helper lists
  const discountRate = $derived(discountRateArr[0]);

  // Initializing default rollout offsets
  $effect(() => {
    if (data.services) {
      for (const s of data.services) {
        if (rolloutServices[s.id] === undefined) rolloutServices[s.id] = 0;
      }
    }
    if (data.packs) {
      for (const p of data.packs) {
        if (rolloutPacks[p.id] === undefined) rolloutPacks[p.id] = 0;
      }
    }
    if (data.plans) {
      for (const pl of data.plans) {
        if (rolloutPlans[pl.id] === undefined) rolloutPlans[pl.id] = 0;
      }
    }
  });

  const nextStep = () => {
    if (currentStep === 1) {
      if (!name.trim()) return alert('Scenario name is required.');
      if (!cohortConfigId) return alert('Cohort selection is required.');
    }
    currentStep += 1;
  };

  const prevStep = () => {
    currentStep -= 1;
  };
</script>

<div class="max-w-3xl mx-auto space-y-6">
  <!-- Back button -->
  <div class="flex items-center justify-between">
    <Button href="/scenarios" variant="ghost" size="sm">
      <ArrowLeft class="h-4 w-4 mr-2" /> Back to Scenarios
    </Button>

    <!-- Step indicators -->
    <div class="flex items-center space-x-2 text-xs select-none">
      <span class="px-2.5 py-1 rounded-full font-bold {currentStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">1</span>
      <span class="text-muted-foreground font-medium">➔</span>
      <span class="px-2.5 py-1 rounded-full font-bold {currentStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">2</span>
      <span class="text-muted-foreground font-medium">➔</span>
      <span class="px-2.5 py-1 rounded-full font-bold {currentStep === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">3</span>
    </div>
  </div>

  <Card class="border-border bg-card/45 backdrop-blur-sm shadow-md">
    <CardHeader class="border-b border-border bg-black/5">
      <div class="flex items-center space-x-2.5 text-primary">
        <Compass class="h-6 w-6" />
        <CardTitle class="text-xl font-bold">Create Scenario</CardTitle>
      </div>
      <CardDescription>
        {#if currentStep === 1}
          Define scenario meta info, projection horizon, discount rate, and target cohort.
        {:else}
          Map services and pricing offerings with scheduling rollout month offsets.
        {/if}
      </CardDescription>
    </CardHeader>

    <form method="POST" action="?/createScenario" use:enhance>
      <!-- Step 1: Details & Cohort -->
      <div class={currentStep === 1 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-5">
          <div class="space-y-2">
            <Label for="name" class="font-semibold">Scenario Name</Label>
            <Input id="name" name="name" bind:value={name} placeholder="e.g. Enterprise LegalTech Rollout, Premium E-commerce Rollout" required class="bg-black/10 border-border" />
          </div>

          <div class="space-y-2">
            <Label for="description" class="font-semibold">Description</Label>
            <Textarea id="description" name="description" bind:value={description} placeholder="Goal, hypotheses, or general context for this scenario..." rows={3} class="bg-black/10 border-border" />
          </div>

          <hr class="border-border/60" />

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Target Cohort -->
            <div class="space-y-2">
              <Label for="cohortConfigId" class="font-semibold">Target Cohort Configuration</Label>
              <select
                id="cohortConfigId"
                name="cohortConfigId"
                bind:value={cohortConfigId}
                required
                class="w-full bg-black/10 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              >
                <option value="" disabled selected>-- Select customer cohort --</option>
                {#each data.cohorts as cohort}
                  <option value={cohort.id}>{cohort.name} ({cohort.vertical_name || 'No Vertical'})</option>
                {/each}
              </select>
            </div>

            <!-- Projection Horizon -->
            <div class="space-y-2">
              <Label for="projectionMonths" class="font-semibold">Projection Horizon</Label>
              <select
                id="projectionMonths"
                name="projectionMonths"
                bind:value={projectionMonths}
                class="w-full bg-black/10 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground font-mono"
              >
                <option value={12}>12 Months (1 Year)</option>
                <option value={24}>24 Months (2 Years)</option>
                <option value={36}>36 Months (3 Years)</option>
                <option value={48}>48 Months (4 Years)</option>
                <option value={60}>60 Months (5 Years)</option>
              </select>
            </div>
          </div>

          <!-- Discount Rate Slider -->
          <div class="space-y-3 pt-2 max-w-md">
            <div class="flex justify-between items-center">
              <Label for="discountRateSlider" class="font-semibold">Discount Rate (Cost of Capital)</Label>
              <span class="text-sm font-semibold text-primary">{discountRate}%</span>
            </div>
            <Slider id="discountRateSlider" bind:value={discountRateArr} min={0} max={30} step={1} type="multiple" />
            <input type="hidden" name="discountRate" value={discountRate} />
          </div>
        </CardContent>

        <CardFooter class="border-t border-border bg-black/5 py-4 flex justify-end">
          <Button type="button" onclick={nextStep}>
            Next: Offerings & Rollout <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </div>

      <!-- Step 2: Rollout Offerings -->
      <div class={currentStep === 2 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-6 max-h-[60vh] overflow-y-auto">
          <!-- Pricing Plans -->
          <div class="space-y-3">
            <h3 class="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
              <CalendarRange class="h-4 w-4 mr-1.5 text-primary" /> Pricing Plans & Rollout Offsets
            </h3>
            {#if data.plans.length === 0}
              <p class="text-xs text-muted-foreground italic pl-6">No pricing plans available.</p>
            {:else}
              <div class="space-y-3 pl-6">
                {#each data.plans as plan}
                  <div class="bg-black/10 border border-border/40 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <hr class="border-border/60" />

          <!-- Feature Packs -->
          <div class="space-y-3">
            <h3 class="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
              <CalendarRange class="h-4 w-4 mr-1.5 text-primary" /> Feature Packs & Rollout Offsets
            </h3>
            {#if data.packs.length === 0}
              <p class="text-xs text-muted-foreground italic pl-6">No feature packs available.</p>
            {:else}
              <div class="space-y-3 pl-6">
                {#each data.packs as pack}
                  <div class="bg-black/10 border border-border/40 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <label class="flex items-center space-x-3 cursor-pointer select-none">
                      <input type="checkbox" name="packIds" value={pack.id} bind:checked={selectedPacks[pack.id]} class="h-4 w-4 accent-primary rounded border-border" />
                      <div>
                        <span class="text-sm font-bold text-foreground block">{pack.name}</span>
                        {#if pack.description}
                          <span class="text-[10px] text-muted-foreground line-clamp-1">{pack.description}</span>
                        {/if}
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
                  <div class="bg-black/10 border border-border/40 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <label class="flex items-center space-x-3 cursor-pointer select-none">
                      <input type="checkbox" name="serviceIds" value={service.id} bind:checked={selectedServices[service.id]} class="h-4 w-4 accent-primary rounded border-border" />
                      <div>
                        <span class="text-sm font-bold text-foreground block">{service.name}</span>
                        <span class="text-[10px] text-muted-foreground">Status: <span class="capitalize">{service.status}</span></span>
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
        </CardContent>

        <CardFooter class="border-t border-border bg-black/5 py-4 flex justify-between">
          <Button type="button" variant="outline" onclick={prevStep}>
            <ArrowLeft class="h-4 w-4 mr-2" /> Back
          </Button>
          <Button type="button" onclick={nextStep}>
            Next: OPEX & CAPEX Costs <ArrowRight class="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </div>

      <!-- Step 3: Cost Items -->
      <div class={currentStep === 3 ? 'block' : 'hidden'}>
        <CardContent class="py-6 space-y-5 max-h-[60vh] overflow-y-auto select-none">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider flex items-center mb-3">
            <DollarSign class="h-4 w-4 mr-1.5 text-primary" /> Map OPEX & CAPEX Expense Items
          </h3>
          <p class="text-xs text-muted-foreground pl-6 mb-4">Select the specific engineer salaries, setup fees, or GPU nodes to charge against this scenario's cash flow projections.</p>

          {#if data.costs.length === 0}
            <p class="text-xs text-muted-foreground italic pl-6">No cost items configured. Add some under Costs in Catalog.</p>
          {:else}
            <div class="space-y-3 pl-6">
              {#each data.costs as cost}
                <label class="flex items-start space-x-3 cursor-pointer p-3 bg-black/10 border border-border/40 rounded-lg hover:bg-white/5 transition duration-150">
                  <input type="checkbox" name="costIds" value={cost.id} bind:checked={selectedCosts[cost.id]} class="mt-1 h-4 w-4 accent-primary rounded border-border" />
                  <div class="flex-1 grid gap-0.5 leading-none">
                    <div class="flex justify-between items-center">
                      <span class="text-sm font-bold text-foreground">{cost.name}</span>
                      <span class="text-xs font-mono font-bold text-rose-400">
                        ${cost.amount.toLocaleString()} ({cost.frequency})
                      </span>
                    </div>
                    <div class="text-[10px] text-muted-foreground flex items-center space-x-2">
                      <span class="uppercase font-semibold tracking-wider text-[8px] px-1.5 py-0.5 bg-muted rounded border border-border/40">{cost.category}</span>
                      <span>Subcategory: <span class="capitalize">{cost.subcategory}</span></span>
                      {#if cost.service_name}
                        <span>• Linked to: <strong class="text-primary">{cost.service_name}</strong></span>
                      {/if}
                    </div>
                  </div>
                </label>
              {/each}
            </div>
          {/if}
        </CardContent>

        <CardFooter class="border-t border-border bg-black/5 py-4 flex justify-between">
          <Button type="button" variant="outline" onclick={prevStep}>
            <ArrowLeft class="h-4 w-4 mr-2" /> Back
          </Button>
          <Button type="submit">
            <Save class="h-4 w-4 mr-2" /> Calculate & Save Scenario
          </Button>
        </CardFooter>
      </div>
    </form>
  </Card>
</div>
