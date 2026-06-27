<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import { formatNumber, formatCurrency, formatPercent, getCurrencySymbol } from '$lib/utils/format';
  import { appState } from '$lib/stores/app.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import { FormDialog, FormSection, FormField, NumberField } from '$lib/components/forms';
  import { buildCohortModel } from '$lib/shared/financial-math';

  // Table components
  import Table from '$lib/components/ui/table/table.svelte';
  import TableBody from '$lib/components/ui/table/table-body.svelte';
  import TableCell from '$lib/components/ui/table/table-cell.svelte';
  import TableHead from '$lib/components/ui/table/table-head.svelte';
  import TableHeader from '$lib/components/ui/table/table-header.svelte';
  import TableRow from '$lib/components/ui/table/table-row.svelte';

  // Lucide Icons
  import Plus from '@lucide/svelte/icons/plus';
  import Edit2 from '@lucide/svelte/icons/edit-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Users2 from '@lucide/svelte/icons/users-2';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import Search from '@lucide/svelte/icons/search';

  let { data } = $props();

  const currencySymbol = $derived(getCurrencySymbol(appState.currency));

  // 12-month live projection of the values currently in the form.
  // The /100 on percentage fields mirrors the server actions exactly.
  let preview = $derived.by(() => {
    const aiAdoption = (+aiAdoptionRate || 0) / 100;
    const churnRed = (+churnReduction || 0) / 100;
    const acqUplift = (+acquisitionUplift || 0) / 100;
    const arpuUpPct = (+arpuUpliftPercent || 0) / 100;
    const arpuUp = +arpuUplift || 0;

    const baseChurn = (+monthlyChurnRate || 0) / 100;
    const baseAcquisition = +monthlyAcquisition || 0;
    const baseArpuVal = +baseArpu || 0;

    const effectiveChurn = baseChurn * (1 - churnRed * aiAdoption);
    const effectiveAcquisition = baseAcquisition * (1 + acqUplift);
    const effectiveArpu = baseArpuVal * (1 + arpuUpPct * aiAdoption) + arpuUp * aiAdoption;

    return buildCohortModel(
      {
        id: 'preview',
        name,
        vertical_id: null,
        current_users: +currentUsers || 0,
        monthly_acquisition: effectiveAcquisition,
        acquisition_growth_rate: (+acquisitionGrowthRate || 0) / 100,
        monthly_churn_rate: effectiveChurn,
        retention_floor: (+retentionFloor || 0) / 100,
        monthly_expansion_rate: (+monthlyExpansionRate || 0) / 100,
        ai_adoption_rate: aiAdoption,
        base_arpu: effectiveArpu,
        arpu_uplift: arpuUp,
        arpu_uplift_percent: arpuUpPct,
        churn_reduction: churnRed,
        acquisition_uplift: acqUplift
      },
      12
    );
  });

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
  let arpuUplift = $state(0);
  let arpuUpliftPercent = $state(10);
  let churnReduction = $state(15);
  let acquisitionUplift = $state(10);
  let grossMargin = $state(100);
  let adoptionRampMonths = $state(0);

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
    arpuUplift = 0;
    arpuUpliftPercent = 10;
    churnReduction = 15;
    acquisitionUplift = 10;
    grossMargin = 100;
    adoptionRampMonths = 0;
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
    arpuUplift = cohort.arpu_uplift || 0;
    arpuUpliftPercent = Math.round((cohort.arpu_uplift_percent || 0) * 1000) / 10;
    churnReduction = Math.round((cohort.churn_reduction || 0) * 1000) / 10;
    acquisitionUplift = Math.round((cohort.acquisition_uplift || 0) * 1000) / 10;
    grossMargin = Math.round((cohort.gross_margin !== undefined ? cohort.gross_margin : 1.0) * 1000) / 10;
    adoptionRampMonths = cohort.adoption_ramp_months || 0;
    showDialog = true;
  };

  // State controls for collection
  let viewMode = $state<'card' | 'list'>('list');
  let searchQuery = $state('');
  let sortBy = $state('name_asc');
  let verticalFilter = $state('all');

  onMount(() => {
    const saved = localStorage.getItem('sherpa_view_mode_cohorts');
    if (saved === 'card' || saved === 'list') {
      viewMode = saved;
    }
  });

  function setViewMode(mode: 'card' | 'list') {
    viewMode = mode;
    localStorage.setItem('sherpa_view_mode_cohorts', mode);
  }

  // Derived filtered array
  let filteredCohorts = $derived(
    data.cohorts
      .filter((cohort: any) => {
        const matchesSearch = 
          cohort.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (cohort.vertical_name && cohort.vertical_name.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesVertical = 
          verticalFilter === 'all' ||
          (verticalFilter === 'global' && !cohort.vertical_id) ||
          (cohort.vertical_id === verticalFilter);

        return matchesSearch && matchesVertical;
      })
      .sort((a: any, b: any) => {
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'users_desc') return b.current_users - a.current_users;
        if (sortBy === 'users_asc') return a.current_users - b.current_users;
        if (sortBy === 'acquisition_desc') return b.monthly_acquisition - a.monthly_acquisition;
        if (sortBy === 'acquisition_asc') return a.monthly_acquisition - b.monthly_acquisition;
        if (sortBy === 'churn_desc') return b.monthly_churn_rate - a.monthly_churn_rate;
        if (sortBy === 'churn_asc') return a.monthly_churn_rate - b.monthly_churn_rate;
        if (sortBy === 'arpu_desc') return b.base_arpu - a.base_arpu;
        if (sortBy === 'arpu_asc') return a.base_arpu - b.base_arpu;
        return 0;
      })
  );
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
    <!-- Controls Row -->
    <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between glass border p-3 rounded-xl select-none">
      <div class="flex flex-1 flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <!-- Quick Find Search -->
        <div class="relative flex-1 max-w-md">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Quick find cohorts..."
            class="pl-9 bg-(--glass-inset-bg) border-border"
            bind:value={searchQuery}
          />
        </div>

        <!-- Sort Select -->
        <select
          bind:value={sortBy}
          class="bg-(--glass-inset-bg) border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="name_asc">Name (A - Z)</option>
          <option value="name_desc">Name (Z - A)</option>
          <option value="users_desc">Starting Users (Highest)</option>
          <option value="users_asc">Starting Users (Lowest)</option>
          <option value="acquisition_desc">Acquisition (Highest)</option>
          <option value="acquisition_asc">Acquisition (Lowest)</option>
          <option value="churn_desc">Churn Rate (Highest)</option>
          <option value="churn_asc">Churn Rate (Lowest)</option>
          <option value="arpu_desc">ARPU (Highest)</option>
          <option value="arpu_asc">ARPU (Lowest)</option>
        </select>

        <!-- Vertical Filter -->
        <select
          bind:value={verticalFilter}
          class="bg-(--glass-inset-bg) border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Verticals</option>
          <option value="global">Global (No Vertical)</option>
          {#each data.verticals as vertical}
            <option value={vertical.id}>{vertical.name}</option>
          {/each}
        </select>
      </div>

      <!-- View Toggle -->
      <div class="flex items-center space-x-1 border border-border rounded-lg p-1 bg-muted/20 self-end md:self-auto">
        <Button
          variant={viewMode === 'card' ? 'secondary' : 'ghost'}
          size="sm"
          class="h-8 px-3.5"
          onclick={() => setViewMode('card')}
        >
          <LayoutGrid class="h-4 w-4 mr-1.5 opacity-80" /> Card
        </Button>
        <Button
          variant={viewMode === 'list' ? 'secondary' : 'ghost'}
          size="sm"
          class="h-8 px-3.5"
          onclick={() => setViewMode('list')}
        >
          <List class="h-4 w-4 mr-1.5 opacity-80" /> List
        </Button>
      </div>
    </div>

    <!-- Display -->
    {#if filteredCohorts.length === 0}
      <div class="py-16 text-center border border-dashed border-border rounded-lg bg-card/5">
        <p class="text-sm text-muted-foreground select-none">No cohorts found matching the search criteria.</p>
      </div>
    {:else if viewMode === 'card'}
      <!-- Card Grid View -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
        {#each filteredCohorts as cohort (cohort.id)}
          <Card class="glass border flex flex-col justify-between hover:border-primary/20 transition-all duration-300 group">
            <CardHeader class="pb-3 border-b border-border glass-inset">
              <div class="flex items-center space-x-2.5 text-primary">
                <Users2 class="h-5 w-5 group-hover:scale-105 transition-transform" />
                <div class="truncate flex-1">
                  <CardTitle class="text-base font-bold text-foreground line-clamp-1">{cohort.name}</CardTitle>
                  {#if cohort.vertical_name}
                    <span class="text-[10px] text-primary font-medium">{cohort.vertical_name}</span>
                  {:else}
                    <span class="text-[10px] text-muted-foreground italic">No vertical assigned</span>
                  {/if}
                </div>
              </div>
            </CardHeader>

            <CardContent class="py-4 space-y-3.5 text-sm select-none flex-1">
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">Starting Active Customers</span>
                <span class="font-mono text-xs font-semibold text-foreground">{formatNumber(cohort.current_users)}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">Monthly Acquisition</span>
                <span class="font-mono text-xs text-foreground">
                  {formatNumber(cohort.monthly_acquisition)} /mo
                  {#if cohort.acquisition_growth_rate > 0}
                    <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">(+{formatPercent(cohort.acquisition_growth_rate)})</span>
                  {/if}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">Churn Rate (Floor)</span>
                <span class="font-mono text-xs text-rose-600 dark:text-rose-400 font-semibold">
                  {formatPercent(cohort.monthly_churn_rate)}
                  <span class="text-[10px] text-muted-foreground font-normal">({formatPercent(cohort.retention_floor)})</span>
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">ARPU Expansion</span>
                <span class="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold">+{formatPercent(cohort.monthly_expansion_rate)}/mo</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">AI Adoption Rate</span>
                <span class="font-mono text-xs font-bold text-primary">{formatPercent(cohort.ai_adoption_rate)}</span>
              </div>
              <div class="flex items-center justify-between pt-1 border-t border-border/40">
                <span class="text-xs text-muted-foreground font-semibold">Starting Base ARPU</span>
                <span class="font-mono text-xs font-black text-foreground">{formatCurrency(cohort.base_arpu, appState.currency)}</span>
              </div>
            </CardContent>

            <CardFooter class="border-t border-border glass-inset py-3 flex justify-end space-x-2">
              <Button variant="outline" size="sm" onclick={() => openEditDialog(cohort)}>
                <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
              <form method="POST" action="?/deleteCohort" use:enhance class="inline-block">
                <input type="hidden" name="id" value={cohort.id} />
                <Button type="submit" variant="outline" size="sm" class="text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 class="h-3.5 w-3.5 mr-1.5" /> Delete
                </Button>
              </form>
            </CardFooter>
          </Card>
        {/each}
      </div>
    {:else}
      <!-- Dense List (Table) View -->
      <div class="overflow-x-auto rounded-lg border border-border glass border select-none animate-in fade-in duration-200">
        <Table>
          <TableHeader class="glass-inset">
            <TableRow>
              <TableHead class="text-foreground font-bold">Cohort Name & Vertical</TableHead>
              <TableHead class="text-foreground font-bold text-right">Starting Users</TableHead>
              <TableHead class="text-foreground font-bold text-right">Monthly Acquisition</TableHead>
              <TableHead class="text-foreground font-bold text-right">Churn (Floor)</TableHead>
              <TableHead class="text-foreground font-bold text-right">Expansion Rate</TableHead>
              <TableHead class="text-foreground font-bold text-right">AI Adoption</TableHead>
              <TableHead class="text-foreground font-bold text-right">Base ARPU</TableHead>
              <TableHead class="text-foreground font-bold text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each filteredCohorts as cohort (cohort.id)}
              <TableRow class="hover:bg-foreground/5 transition-all">
                <TableCell>
                  <div class="font-bold text-foreground">{cohort.name}</div>
                  {#if cohort.vertical_name}
                    <span class="text-xs text-primary font-medium">{cohort.vertical_name}</span>
                  {:else}
                    <span class="text-[10px] text-muted-foreground italic">No vertical assigned</span>
                  {/if}
                </TableCell>
                <TableCell class="text-right font-mono font-medium">{formatNumber(cohort.current_users)}</TableCell>
                <TableCell class="text-right font-mono">
                  {formatNumber(cohort.monthly_acquisition)} /mo
                  {#if cohort.acquisition_growth_rate > 0}
                    <span class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">(+{formatPercent(cohort.acquisition_growth_rate)})</span>
                  {/if}
                </TableCell>
                <TableCell class="text-right font-mono">
                  <span class="text-rose-600 dark:text-rose-400 font-medium">{formatPercent(cohort.monthly_churn_rate)}</span>
                  <span class="text-xs text-muted-foreground">({formatPercent(cohort.retention_floor)})</span>
                </TableCell>
                <TableCell class="text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">+{formatPercent(cohort.monthly_expansion_rate)}/mo</TableCell>
                <TableCell class="text-right font-mono font-semibold text-primary">{formatPercent(cohort.ai_adoption_rate)}</TableCell>
                <TableCell class="text-right font-mono font-bold">{formatCurrency(cohort.base_arpu, appState.currency)}</TableCell>
                <TableCell class="text-center">
                  <div class="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="icon" onclick={() => openEditDialog(cohort)} class="h-8 w-8 hover:bg-foreground/5">
                      <Edit2 class="h-3.5 w-3.5" />
                    </Button>
                    <form method="POST" action="?/deleteCohort" use:enhance class="inline-block">
                      <input type="hidden" name="id" value={cohort.id} />
                      <Button type="submit" variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 class="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    {/if}
  {/if}
</div>

<!-- Add/Edit Cohort Dialog -->
<FormDialog
  bind:open={showDialog}
  size="lg"
  icon={Users2}
  title={dialogMode === 'create' ? 'New Cohort' : 'Edit Cohort'}
  description="Model customer growth, churn and ARPU for projections."
  action={dialogMode === 'create' ? '?/createCohort' : '?/updateCohort'}
  submitLabel={dialogMode === 'create' ? 'Save Cohort' : 'Save Changes'}
>
  {#snippet footerStart()}
    <p class="font-mono text-xs text-muted-foreground">
      ≈ <span class="font-semibold text-emerald-600 dark:text-emerald-400"
        >{formatNumber(Math.round(preview.endingCustomers))}</span
      >
      customers ·
      <span class="font-semibold text-emerald-600 dark:text-emerald-400"
        >{formatCurrency(preview.endingMrr, appState.currency)}</span
      > MRR after 12 mo
    </p>
  {/snippet}

  <input type="hidden" name="id" value={currentCohortId} />

  <FormSection title="Identity" hero>
    <FormField label="Cohort Name" forId="cohortName" required span={2}>
      <Input
        id="cohortName"
        name="name"
        bind:value={name}
        placeholder="e.g. SMB Legal Customers, Mid-Market Retail"
        required
        class="h-11 bg-(--glass-inset-bg) text-base"
      />
    </FormField>

    <FormField label="Linked Vertical" forId="cohortVertical">
      <select
        id="cohortVertical"
        name="verticalId"
        bind:value={verticalId}
        class="h-9 w-full rounded-md border border-input bg-(--glass-inset-bg) px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="">-- No Vertical (Global) --</option>
        {#each data.verticals as vertical}
          <option value={vertical.id}>{vertical.name}</option>
        {/each}
      </select>
    </FormField>

    <NumberField
      id="aiAdoptionRate"
      name="aiAdoptionRate"
      bind:value={aiAdoptionRate}
      label="AI Adoption Rate"
      suffix="%"
      min={0}
      max={100}
      step={0.1}
      required
      badge={{ text: `${aiAdoptionRate}%`, tone: 'neutral' }}
      help="Share of customers using AI features — drives revenue attribution"
    />
  </FormSection>

  <FormSection title="Starting point">
    <NumberField
      id="currentUsers"
      name="currentUsers"
      bind:value={currentUsers}
      label="Starting Active Customers"
      min={0}
      required
    />
    <NumberField
      id="baseArpu"
      name="baseArpu"
      bind:value={baseArpu}
      label="Starting ARPU"
      prefix={currencySymbol}
      suffix="/mo"
      min={0}
      step={0.01}
      required
    />
  </FormSection>

  <FormSection title="Growth engine">
    <NumberField
      id="monthlyAcquisition"
      name="monthlyAcquisition"
      bind:value={monthlyAcquisition}
      label="Monthly Acquisition"
      min={0}
      required
      help="New customers per month"
    />
    <NumberField
      id="acquisitionGrowthRate"
      name="acquisitionGrowthRate"
      bind:value={acquisitionGrowthRate}
      label="Acquisition Growth Rate"
      suffix="% /mo"
      min={-50}
      max={200}
      step={0.1}
      required
      badge={{ text: `+${acquisitionGrowthRate}% /mo`, tone: 'positive' }}
    />
  </FormSection>

  <FormSection title="Retention & expansion">
    <NumberField
      id="monthlyChurnRate"
      name="monthlyChurnRate"
      bind:value={monthlyChurnRate}
      label="Monthly Churn Rate"
      suffix="% /mo"
      min={0}
      max={100}
      step={0.1}
      required
      badge={{ text: `${monthlyChurnRate}% /mo`, tone: 'negative' }}
    />
    <NumberField
      id="retentionFloor"
      name="retentionFloor"
      bind:value={retentionFloor}
      label="Retention Floor"
      suffix="%"
      min={0}
      max={100}
      step={0.1}
      required
      badge={{ text: `${retentionFloor}%`, tone: 'muted' }}
      help="Retention never decays below this share"
    />
    <NumberField
      id="monthlyExpansionRate"
      name="monthlyExpansionRate"
      bind:value={monthlyExpansionRate}
      label="ARPU Expansion Rate"
      suffix="% /mo"
      span={2}
      min={-50}
      max={200}
      step={0.1}
      required
      badge={{ text: `+${monthlyExpansionRate}% /mo`, tone: 'positive' }}
      help="Upsell / cross-sell"
    />
  </FormSection>

  <FormSection title="AI impact assumptions (vs. baseline)">
    <NumberField
      id="arpuUplift"
      name="arpuUplift"
      bind:value={arpuUplift}
      label="AI ARPU Uplift (Flat)"
      prefix={currencySymbol}
      suffix="/mo"
      min={0}
      step={0.01}
      required
      help="Flat ARPU increase for users adopting AI"
    />
    <NumberField
      id="arpuUpliftPercent"
      name="arpuUpliftPercent"
      bind:value={arpuUpliftPercent}
      label="AI ARPU Uplift (%)"
      suffix="%"
      min={0}
      max={200}
      step={0.1}
      required
      badge={{ text: `+${arpuUpliftPercent}%`, tone: 'positive' }}
      help="Percentage ARPU increase for users adopting AI"
    />
    <NumberField
      id="churnReduction"
      name="churnReduction"
      bind:value={churnReduction}
      label="AI Churn Reduction"
      suffix="%"
      min={0}
      max={100}
      step={0.1}
      required
      badge={{ text: `${churnReduction}% Churn Red.`, tone: 'positive' }}
      help="Percentage reduction of monthly churn for users adopting AI"
    />
    <NumberField
      id="acquisitionUplift"
      name="acquisitionUplift"
      bind:value={acquisitionUplift}
      label="AI Acquisition Uplift"
      suffix="%"
      min={0}
      max={200}
      step={0.1}
      required
      badge={{ text: `+${acquisitionUplift}%`, tone: 'positive' }}
      help="Percentage increase in new-customer acquisition"
    />
  </FormSection>

  <FormSection title="Methodology Realism Settings">
    <NumberField
      id="grossMargin"
      name="grossMargin"
      bind:value={grossMargin}
      label="Gross Margin"
      suffix="%"
      min={0}
      max={100}
      step={0.1}
      required
      badge={{ text: `${grossMargin}%`, tone: 'neutral' }}
      help="Cohort gross margin percentage, used to compute incremental contribution margin"
    />
    <NumberField
      id="adoptionRampMonths"
      name="adoptionRampMonths"
      bind:value={adoptionRampMonths}
      label="Adoption Ramp Period"
      suffix="mos"
      min={0}
      max={60}
      step={1}
      required
      help="Number of months over which AI adoption ramps up linearly to target rate"
    />
  </FormSection>
</FormDialog>
