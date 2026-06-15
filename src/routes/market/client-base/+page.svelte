<script lang="ts">
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';

  // Lucide Icons
  import Save from '@lucide/svelte/icons/save';
  import Database from '@lucide/svelte/icons/database';

  let { data } = $props();
  const clientBase = $derived(data.clientBase);

  let total_users = $state(0);
  let default_arpu = $state(0);
  let default_monthly_churn_rate = $state(0);
  let default_monthly_acquisition = $state(0);
  let default_acquisition_growth_rate = $state(0);
  let default_ai_adoption_rate = $state(0);
  let default_retention_floor = $state(0);
  let default_expansion_rate = $state(0);
  let default_arpu_uplift = $state(0);
  let default_arpu_uplift_percent = $state(0);
  let default_churn_reduction = $state(0);
  let default_acquisition_uplift = $state(0);
  let default_gross_margin = $state(100);
  let default_adoption_ramp_months = $state(0);

  // Synchronize state when clientBase changes
  $effect(() => {
    const cb = clientBase;
    if (!cb) return;
    total_users = cb.total_users || 0;
    default_arpu = cb.default_arpu || 0;
    default_monthly_churn_rate = (cb.default_monthly_churn_rate || 0) * 100;
    default_monthly_acquisition = cb.default_monthly_acquisition || 0;
    default_acquisition_growth_rate = (cb.default_acquisition_growth_rate || 0) * 100;
    default_ai_adoption_rate = (cb.default_ai_adoption_rate || 0) * 100;
    default_retention_floor = (cb.default_retention_floor || 0) * 100;
    default_expansion_rate = (cb.default_expansion_rate || 0) * 100;
    default_arpu_uplift = cb.default_arpu_uplift || 0;
    default_arpu_uplift_percent = (cb.default_arpu_uplift_percent || 0) * 100;
    default_churn_reduction = (cb.default_churn_reduction || 0) * 100;
    default_acquisition_uplift = (cb.default_acquisition_uplift || 0) * 100;
    default_gross_margin = (cb.default_gross_margin !== undefined ? cb.default_gross_margin : 1.0) * 100;
    default_adoption_ramp_months = cb.default_adoption_ramp_months || 0;
  });

  let isSaving = $state(false);

  function handleSubmit() {
    isSaving = true;
    return async ({ result, update }: any) => {
      isSaving = false;
      await update();
    };
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center space-x-2 text-primary mb-6">
    <Database class="h-8 w-8" />
    <h1 class="text-3xl font-bold tracking-tight text-foreground">Client Base</h1>
  </div>

  <Card class="glass border">
    <CardHeader class="border-b border-border glass-inset">
      <CardTitle class="text-xl font-bold">Global Base Configuration</CardTitle>
      <CardDescription>Configure the total addressable audience and global baseline parameters for scenarios that target the entire client base.</CardDescription>
    </CardHeader>

    <form method="POST" action="?/save" use:enhance={handleSubmit}>
      <CardContent class="py-6 space-y-8">
        <!-- Scale -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider text-primary">Scale & Audience</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="total_users" class="font-semibold">Total Users (Base)</Label>
              <Input id="total_users" name="total_users" type="number" min="0" bind:value={total_users} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">The sum of all users in the application/database today.</p>
            </div>
            <div class="space-y-2">
              <Label for="default_monthly_acquisition" class="font-semibold">Default Monthly Acquisition</Label>
              <Input id="default_monthly_acquisition" name="default_monthly_acquisition" type="number" min="0" bind:value={default_monthly_acquisition} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Average number of new users acquired per month globally.</p>
            </div>
          </div>
        </div>

        <hr class="border-border/60" />

        <!-- Monetization -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider text-emerald-500">Monetization</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="default_arpu" class="font-semibold">Default ARPU ($)</Label>
              <Input id="default_arpu" name="default_arpu" type="number" step="0.01" min="0" bind:value={default_arpu} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Average Revenue Per User globally.</p>
            </div>
            <div class="space-y-2">
              <Label for="default_ai_adoption_rate" class="font-semibold">Default AI Adoption Rate (%)</Label>
              <Input id="default_ai_adoption_rate" name="default_ai_adoption_rate" type="number" step="0.1" min="0" max="100" bind:value={default_ai_adoption_rate} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Percentage of users expected to adopt AI features.</p>
            </div>
          </div>
        </div>

        <hr class="border-border/60" />

        <!-- Retention & Growth -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider text-amber-500">Retention & Growth</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="default_monthly_churn_rate" class="font-semibold">Default Monthly Churn Rate (%)</Label>
              <Input id="default_monthly_churn_rate" name="default_monthly_churn_rate" type="number" step="0.1" min="0" max="100" bind:value={default_monthly_churn_rate} required class="bg-(--glass-inset-bg) border-border font-mono" />
            </div>
            <div class="space-y-2">
              <Label for="default_retention_floor" class="font-semibold">Default Retention Floor (%)</Label>
              <Input id="default_retention_floor" name="default_retention_floor" type="number" step="0.1" min="0" max="100" bind:value={default_retention_floor} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Minimum percentage of the original base that will never churn.</p>
            </div>
            <div class="space-y-2">
              <Label for="default_expansion_rate" class="font-semibold">Default Net Expansion Rate (%)</Label>
              <Input id="default_expansion_rate" name="default_expansion_rate" type="number" step="0.1" min="0" max="100" bind:value={default_expansion_rate} required class="bg-(--glass-inset-bg) border-border font-mono" />
            </div>
            <div class="space-y-2">
              <Label for="default_acquisition_growth_rate" class="font-semibold">Default Acq. Growth Rate (%)</Label>
              <Input id="default_acquisition_growth_rate" name="default_acquisition_growth_rate" type="number" step="0.1" min="0" max="100" bind:value={default_acquisition_growth_rate} required class="bg-(--glass-inset-bg) border-border font-mono" />
            </div>
          </div>
        </div>

        <hr class="border-border/60" />

        <!-- AI impact assumptions -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider text-primary">AI Impact Assumptions (vs. Baseline)</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="default_arpu_uplift" class="font-semibold">Default AI ARPU Uplift ($ Flat)</Label>
              <Input id="default_arpu_uplift" name="default_arpu_uplift" type="number" step="0.01" min="0" bind:value={default_arpu_uplift} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Flat monthly ARPU increase for users adopting AI.</p>
            </div>
            <div class="space-y-2">
              <Label for="default_arpu_uplift_percent" class="font-semibold">Default AI ARPU Uplift (%)</Label>
              <Input id="default_arpu_uplift_percent" name="default_arpu_uplift_percent" type="number" step="0.1" min="0" max="200" bind:value={default_arpu_uplift_percent} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Percentage increase in ARPU for users adopting AI.</p>
            </div>
            <div class="space-y-2">
              <Label for="default_churn_reduction" class="font-semibold">Default AI Churn Reduction (%)</Label>
              <Input id="default_churn_reduction" name="default_churn_reduction" type="number" step="0.1" min="0" max="100" bind:value={default_churn_reduction} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Percentage reduction of monthly churn for users adopting AI.</p>
            </div>
            <div class="space-y-2">
              <Label for="default_acquisition_uplift" class="font-semibold">Default AI Acquisition Uplift (%)</Label>
              <Input id="default_acquisition_uplift" name="default_acquisition_uplift" type="number" step="0.1" min="0" max="200" bind:value={default_acquisition_uplift} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Percentage increase in new-customer acquisition.</p>
            </div>
          </div>
        </div>

        <hr class="border-border/60" />

        <!-- Methodology Settings -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider text-primary">Methodology Realism Settings</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="default_gross_margin" class="font-semibold">Default Gross Margin (%)</Label>
              <Input id="default_gross_margin" name="default_gross_margin" type="number" step="0.1" min="0" max="100" bind:value={default_gross_margin} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Global default gross margin percentage, used for incremental contribution margin calculations.</p>
            </div>
            <div class="space-y-2">
              <Label for="default_adoption_ramp_months" class="font-semibold">Default Adoption Ramp Period (months)</Label>
              <Input id="default_adoption_ramp_months" name="default_adoption_ramp_months" type="number" min="0" max="60" bind:value={default_adoption_ramp_months} required class="bg-(--glass-inset-bg) border-border font-mono" />
              <p class="text-[10px] text-muted-foreground mt-1">Global default number of months over which AI adoption ramps up linearly.</p>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter class="border-t border-border glass-inset py-4 flex justify-end">
        <Button type="submit" disabled={isSaving}>
          {#if isSaving}
            Saving...
          {:else}
            <Save class="h-4 w-4 mr-2" /> Save Global Configuration
          {/if}
        </Button>
      </CardFooter>
    </form>
  </Card>
</div>
