<script lang="ts">
  import { enhance } from '$app/forms';
  import { formatNumber, formatCurrency, formatPercent } from '$lib/utils/format';
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
  import Plus from '@lucide/svelte/icons/plus';
  import Edit2 from '@lucide/svelte/icons/edit-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Users2 from '@lucide/svelte/icons/users-2';
  import BarChart4 from '@lucide/svelte/icons/bar-chart-4';
  import Info from '@lucide/svelte/icons/info';

  let { data } = $props();

  // Dialog State
  let showDialog = $state(false);
  let dialogMode = $state<'create' | 'edit'>('create');
  let currentCohortId = $state('');

  // Form Fields State (Percentage inputs bound as 0-100)
  let name = $state('');
  let verticalId = $state('');
  let currentUsers = $state(0);
  let monthlyAcquisition = $state(0);
  let acquisitionGrowthRate = $state(0);
  let monthlyChurnRate = $state(5);
  let retentionFloor = $state(60);
  let monthlyExpansionRate = $state(2);
  let aiAdoptionRate = $state(30);
  let baseArpu = $state(100);

  const openCreateDialog = () => {
    dialogMode = 'create';
    currentCohortId = '';
    name = '';
    verticalId = '';
    currentUsers = 0;
    monthlyAcquisition = 0;
    acquisitionGrowthRate = 0;
    monthlyChurnRate = 5;
    retentionFloor = 60;
    monthlyExpansionRate = 2;
    aiAdoptionRate = 30;
    baseArpu = 100;
    showDialog = true;
  };

  const openEditDialog = (cohort: any) => {
    dialogMode = 'edit';
    currentCohortId = cohort.id;
    name = cohort.name;
    verticalId = cohort.vertical_id || '';
    currentUsers = cohort.current_users;
    monthlyAcquisition = cohort.monthly_acquisition;
    acquisitionGrowthRate = Math.round(cohort.acquisition_growth_rate * 1000) / 10;
    monthlyChurnRate = Math.round(cohort.monthly_churn_rate * 1000) / 10;
    retentionFloor = Math.round(cohort.retention_floor * 1000) / 10;
    monthlyExpansionRate = Math.round(cohort.monthly_expansion_rate * 1000) / 10;
    aiAdoptionRate = Math.round(cohort.ai_adoption_rate * 1000) / 10;
    baseArpu = cohort.base_arpu;
    showDialog = true;
  };
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Market Cohorts</h2>
      <p class="text-muted-foreground text-sm font-normal">Define user acquisition, expansion, churn, and AI adoption settings for projections.</p>
    </div>
    <Button onclick={openCreateDialog}>
      <Plus class="h-4 w-4 mr-2" /> Add Cohort
    </Button>
  </div>

  {#if data.cohorts.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Users2 class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">No Cohorts Configured</h3>
          <p class="text-sm text-muted-foreground">Click "Add Cohort" to configure your first customer cohort.</p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <div class="overflow-x-auto rounded-lg border border-border bg-card/25 backdrop-blur-sm shadow-sm select-none">
      <table class="w-full text-left border-collapse text-sm">
        <thead>
          <tr class="border-b border-border bg-black/20 text-muted-foreground font-semibold">
            <th class="p-4">Cohort Name & Vertical</th>
            <th class="p-4 text-right">Starting Users</th>
            <th class="p-4 text-right">Monthly Acquisition</th>
            <th class="p-4 text-right">Churn (Floor)</th>
            <th class="p-4 text-right">Expansion Rate</th>
            <th class="p-4 text-right">AI Adoption</th>
            <th class="p-4 text-right">Base ARPU</th>
            <th class="p-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/60">
          {#each data.cohorts as cohort}
            <tr class="hover:bg-white/5 transition-all duration-150">
              <td class="p-4">
                <div class="font-bold text-foreground">{cohort.name}</div>
                {#if cohort.vertical_name}
                  <span class="text-xs text-primary font-medium">{cohort.vertical_name}</span>
                {:else}
                  <span class="text-[10px] text-muted-foreground italic">No vertical assigned</span>
                {/if}
              </td>
              <td class="p-4 text-right font-mono font-medium">{formatNumber(cohort.current_users)}</td>
              <td class="p-4 text-right font-mono">
                {formatNumber(cohort.monthly_acquisition)} /mo
                {#if cohort.acquisition_growth_rate > 0}
                  <span class="text-xs text-emerald-400 font-semibold">(+{formatPercent(cohort.acquisition_growth_rate)})</span>
                {/if}
              </td>
              <td class="p-4 text-right font-mono">
                <span class="text-rose-400 font-medium">{formatPercent(cohort.monthly_churn_rate)}</span>
                <span class="text-xs text-muted-foreground">({formatPercent(cohort.retention_floor)})</span>
              </td>
              <td class="p-4 text-right font-mono text-emerald-400 font-medium">+{formatPercent(cohort.monthly_expansion_rate)}/mo</td>
              <td class="p-4 text-right font-mono font-semibold text-primary">{formatPercent(cohort.ai_adoption_rate)}</td>
              <td class="p-4 text-right font-mono font-bold">{formatCurrency(cohort.base_arpu, 'USD')}</td>
              <td class="p-4 text-center space-x-1">
                <Button variant="ghost" size="icon" onclick={() => openEditDialog(cohort)} class="h-8 w-8 hover:bg-white/5">
                  <Edit2 class="h-3.5 w-3.5" />
                </Button>
                <form method="POST" action="?/deleteCohort" use:enhance class="inline-block">
                  <input type="hidden" name="id" value={cohort.id} />
                  <Button type="submit" variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Modal Dialog Overlay for Add/Edit Cohort -->
{#if showDialog}
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <Card class="w-full max-w-2xl border-border shadow-2xl bg-card">
      <CardHeader class="border-b border-border bg-black/10">
        <div class="flex items-center space-x-2 text-primary">
          <Users2 class="h-5 w-5" />
          <CardTitle>{dialogMode === 'create' ? 'Configure New Cohort' : 'Edit Cohort Configuration'}</CardTitle>
        </div>
        <CardDescription>Setup numerical params to simulate user compound monthly growth and ARPU decay/expansion curves.</CardDescription>
      </CardHeader>
      
      <form method="POST" action={dialogMode === 'create' ? '?/createCohort' : '?/updateCohort'} use:enhance={() => {
        return async ({ update }) => {
          await update();
          showDialog = false;
        };
      }}>
        <input type="hidden" name="id" value={currentCohortId} />
        
        <CardContent class="py-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          <!-- Cohort Name -->
          <div class="space-y-1.5 md:col-span-2">
            <Label for="cohortName" class="font-semibold">Cohort Name</Label>
            <Input id="cohortName" name="name" bind:value={name} placeholder="e.g. SMB Legal Customers, Mid-Market Retail" required class="bg-black/10 border-border" />
          </div>

          <!-- Market Vertical -->
          <div class="space-y-1.5">
            <Label for="cohortVertical" class="font-semibold">Linked Vertical</Label>
            <select
              id="cohortVertical"
              name="verticalId"
              bind:value={verticalId}
              class="w-full bg-black/10 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
            >
              <option value="">-- No Vertical (Global) --</option>
              {#each data.verticals as vertical}
                <option value={vertical.id}>{vertical.name}</option>
              {/each}
            </select>
          </div>

          <!-- Base ARPU -->
          <div class="space-y-1.5">
            <Label for="baseArpu" class="font-semibold">Starting ARPU ($/mo)</Label>
            <Input id="baseArpu" name="baseArpu" type="number" step="0.01" min="0" bind:value={baseArpu} required class="bg-black/10 border-border font-mono" />
          </div>

          <hr class="md:col-span-2 border-border/40 my-1" />

          <!-- Current Active Users -->
          <div class="space-y-1.5">
            <Label for="currentUsers" class="font-semibold">Starting Active Customers</Label>
            <Input id="currentUsers" name="currentUsers" type="number" min="0" bind:value={currentUsers} required class="bg-black/10 border-border font-mono" />
          </div>

          <!-- AI Adoption Rate -->
          <div class="space-y-1.5">
            <Label for="aiAdoptionRate" class="font-semibold flex justify-between">
              <span>AI Adoption Rate</span>
              <span class="text-xs text-primary font-semibold">{aiAdoptionRate}%</span>
            </Label>
            <Input id="aiAdoptionRate" name="aiAdoptionRate" type="number" min="0" max="100" step="0.1" bind:value={aiAdoptionRate} required class="bg-black/10 border-border font-mono" />
          </div>

          <hr class="md:col-span-2 border-border/40 my-1" />

          <!-- Monthly Acquisition -->
          <div class="space-y-1.5">
            <Label for="monthlyAcquisition" class="font-semibold">Monthly Acquisition (New Users)</Label>
            <Input id="monthlyAcquisition" name="monthlyAcquisition" type="number" min="0" bind:value={monthlyAcquisition} required class="bg-black/10 border-border font-mono" />
          </div>

          <!-- Acquisition Growth Rate -->
          <div class="space-y-1.5">
            <Label for="acquisitionGrowthRate" class="font-semibold flex justify-between">
              <span>Acquisition Growth Rate</span>
              <span class="text-xs text-emerald-400 font-semibold">+{acquisitionGrowthRate}% /mo</span>
            </Label>
            <Input id="acquisitionGrowthRate" name="acquisitionGrowthRate" type="number" min="-50" max="200" step="0.1" bind:value={acquisitionGrowthRate} required class="bg-black/10 border-border font-mono" />
          </div>

          <hr class="md:col-span-2 border-border/40 my-1" />

          <!-- Churn Rate -->
          <div class="space-y-1.5">
            <Label for="monthlyChurnRate" class="font-semibold flex justify-between">
              <span>Monthly Churn Rate</span>
              <span class="text-xs text-rose-400 font-semibold">{monthlyChurnRate}% /mo</span>
            </Label>
            <Input id="monthlyChurnRate" name="monthlyChurnRate" type="number" min="0" max="100" step="0.1" bind:value={monthlyChurnRate} required class="bg-black/10 border-border font-mono" />
          </div>

          <!-- Churn Floor (Retention Floor) -->
          <div class="space-y-1.5">
            <Label for="retentionFloor" class="font-semibold flex justify-between">
              <span>Retention Floor</span>
              <span class="text-xs text-muted-foreground font-semibold">{retentionFloor}% floor</span>
            </Label>
            <Input id="retentionFloor" name="retentionFloor" type="number" min="0" max="100" step="0.1" bind:value={retentionFloor} required class="bg-black/10 border-border font-mono" />
          </div>

          <!-- Monthly Expansion Rate -->
          <div class="space-y-1.5 md:col-span-2">
            <Label for="monthlyExpansionRate" class="font-semibold flex justify-between">
              <span>Monthly ARPU Expansion Rate (Upsell / Cross-sell)</span>
              <span class="text-xs text-emerald-400 font-semibold">+{monthlyExpansionRate}% /mo</span>
            </Label>
            <Input id="monthlyExpansionRate" name="monthlyExpansionRate" type="number" min="-50" max="200" step="0.1" bind:value={monthlyExpansionRate} required class="bg-black/10 border-border font-mono" />
          </div>
        </CardContent>
        
        <CardFooter class="border-t border-border bg-black/10 py-3 flex justify-end space-x-2">
          <Button variant="outline" onclick={() => showDialog = false}>Cancel</Button>
          <Button type="submit">
            <BarChart4 class="h-4 w-4 mr-2" />
            {dialogMode === 'create' ? 'Save Cohort' : 'Save Changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  </div>
{/if}
