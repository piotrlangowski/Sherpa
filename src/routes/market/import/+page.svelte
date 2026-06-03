<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Alert from '$lib/components/ui/alert/alert.svelte';
  import AlertTitle from '$lib/components/ui/alert/alert-title.svelte';
  import AlertDescription from '$lib/components/ui/alert/alert-description.svelte';
  import { formatNumber, formatCurrency, formatPercent } from '$lib/utils/format';

  // Lucide Icons
  import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import UploadCloud from '@lucide/svelte/icons/upload-cloud';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import CheckCircle from '@lucide/svelte/icons/check-circle';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  let { data } = $props();

  // State using Svelte 5 runes
  let activeTab = $state<'csv' | 'hubspot'>('csv');
  let csvText = $state('');
  let hubspotToken = $state(data.hubspotAccessToken || '');
  let isLoading = $state(false);
  let errorMsg = $state('');
  let successMsg = $state('');
  let previewVerticals = $state<any[] | null>(null);

  // File Drag-and-Drop state
  let isDragging = $state(false);

  const handleFileDrop = (e: DragEvent) => {
    e.preventDefault();
    isDragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) {
      readCSVFile(file);
    }
  };

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      readCSVFile(file);
    }
  };

  const readCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      csvText = event.target?.result as string;
      errorMsg = '';
      successMsg = `Loaded ${file.name} successfully. Click "Generate Preview" below to verify data.`;
    };
    reader.onerror = () => {
      errorMsg = 'Failed to read CSV file.';
    };
    reader.readAsText(file);
  };

  const generatePreview = async () => {
    isLoading = true;
    errorMsg = '';
    successMsg = '';
    previewVerticals = null;

    try {
      const payload: any = {
        action: 'preview',
        source: activeTab
      };

      if (activeTab === 'csv') {
        if (!csvText.trim()) {
          throw new Error('Please paste CSV text or upload a CSV file first.');
        }
        payload.csvText = csvText;
      } else {
        if (!hubspotToken.trim()) {
          throw new Error('Please provide a HubSpot Private App Access Token.');
        }
        payload.tokenOverride = hubspotToken;
      }

      const response = await fetch('/api/import-user-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.message || 'Failed to generate preview.');
      }

      previewVerticals = resData.verticals;
      successMsg = 'Successfully parsed and calculated cohort projections from source data. Please review below.';
    } catch (err: any) {
      errorMsg = err.message;
    } finally {
      isLoading = false;
    }
  };

  const executeImport = async () => {
    isLoading = true;
    errorMsg = '';
    successMsg = '';

    try {
      const payload: any = {
        action: 'import',
        source: activeTab
      };

      if (activeTab === 'csv') {
        payload.csvText = csvText;
      } else {
        payload.tokenOverride = hubspotToken;
      }

      const response = await fetch('/api/import-user-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.message || 'Import failed.');
      }

      successMsg = 'Database updated successfully! Redirecting you back to Market Verticals...';
      setTimeout(() => {
        goto('/market/verticals');
      }, 1500);
    } catch (err: any) {
      errorMsg = err.message;
      isLoading = false;
    }
  };
</script>

<div class="space-y-6 max-w-5xl">
  <!-- Back navigation & Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <Button href="/market/verticals" variant="ghost" size="icon" class="h-8 w-8 hover:bg-white/5">
        <ArrowLeft class="h-4 w-4" />
      </Button>
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Import User Base</h2>
        <p class="text-muted-foreground text-sm font-normal">Pull and model customer cohorts directly from external files or CRM platforms.</p>
      </div>
    </div>
  </div>

  {#if errorMsg}
    <Alert variant="destructive" class="border-rose-500/20 bg-rose-500/5 text-rose-400">
      <AlertTriangle class="h-4 w-4" />
      <AlertTitle>Import Error</AlertTitle>
      <AlertDescription>{errorMsg}</AlertDescription>
    </Alert>
  {/if}

  {#if successMsg}
    <Alert variant="default" class="border-emerald-500/20 bg-emerald-500/5 text-emerald-400">
      <CheckCircle class="h-4 w-4" />
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>{successMsg}</AlertDescription>
    </Alert>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <!-- Configuration panel -->
    <div class="md:col-span-1 space-y-4">
      <Card class="border-border bg-card/40 backdrop-blur-sm shadow-sm select-none">
        <CardHeader class="border-b border-border bg-black/10">
          <CardTitle class="text-base font-semibold">Select Data Source</CardTitle>
          <CardDescription>Choose how you want to bring in your segments.</CardDescription>
        </CardHeader>
        <CardContent class="pt-4 flex flex-col space-y-2">
          <button
            class="flex items-center space-x-3 p-3 rounded-lg border text-left transition-all duration-150 {activeTab === 'csv' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-black/10 text-muted-foreground hover:bg-white/5 hover:text-foreground'}"
            onclick={() => { activeTab = 'csv'; previewVerticals = null; }}
          >
            <FileSpreadsheet class="h-5 w-5" />
            <div>
              <div class="font-semibold text-sm">Flat File (CSV)</div>
              <div class="text-xs text-muted-foreground mt-0.5">Paste text or drag a local file</div>
            </div>
          </button>
          
          <button
            class="flex items-center space-x-3 p-3 rounded-lg border text-left transition-all duration-150 {activeTab === 'hubspot' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-black/10 text-muted-foreground hover:bg-white/5 hover:text-foreground'}"
            onclick={() => { activeTab = 'hubspot'; previewVerticals = null; }}
          >
            <RefreshCw class="h-5 w-5" />
            <div>
              <div class="font-semibold text-sm">HubSpot CRM</div>
              <div class="text-xs text-muted-foreground mt-0.5">Fetch live Companies & Deals</div>
            </div>
          </button>
        </CardContent>
      </Card>
    </div>

    <!-- Data loading zone -->
    <div class="md:col-span-2">
      <Card class="border-border shadow-sm">
        {#if activeTab === 'csv'}
          <CardHeader>
            <CardTitle>CSV Data Import</CardTitle>
            <CardDescription>
              Expects columns for Company Name, Industry/Vertical, signup date, active status, and monthly contract value.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Drag and drop zone -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="border-2 border-dashed rounded-lg p-8 text-center transition-all duration-150 {isDragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-white/5'}"
              ondragover={(e) => { e.preventDefault(); isDragging = true; }}
              ondragleave={() => isDragging = false}
              ondrop={handleFileDrop}
            >
              <input
                type="file"
                id="csvFile"
                accept=".csv"
                class="hidden"
                onchange={handleFileSelect}
              />
              <label for="csvFile" class="cursor-pointer flex flex-col items-center justify-center space-y-2">
                <UploadCloud class="h-10 w-10 text-primary/80" />
                <span class="text-sm font-semibold">Drag & drop your CSV file here or <span class="text-primary underline">browse</span></span>
                <span class="text-xs text-muted-foreground">Supports standard comma-separated and semicolon-separated files</span>
              </label>
            </div>

            <!-- CSV manual pasting -->
            <div class="space-y-1.5">
              <Label for="csvPaste" class="text-sm font-semibold">Or paste raw CSV content below</Label>
              <textarea
                id="csvPaste"
                bind:value={csvText}
                rows="6"
                placeholder="Company,Vertical,JoinDate,Status,Revenue&#10;Acme Corp,Software,2026-01-15,Active,150&#10;Beta Inc,Finance,2026-02-10,Active,300&#10;Gamma LLC,Healthcare,2026-01-05,Churned,80"
                class="w-full bg-black/10 border border-input rounded-md p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              ></textarea>
            </div>
          </CardContent>
        {:else}
          <CardHeader>
            <CardTitle>HubSpot CRM Integration</CardTitle>
            <CardDescription>
              Authenticate using a HubSpot Private App Access Token. We will fetch deals and companies and aggregate them into cohorts.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-1.5">
              <Label for="hsToken" class="font-semibold flex justify-between">
                <span>Private App Access Token</span>
                {#if data.hubspotAccessToken}
                  <span class="text-xs text-emerald-400 flex items-center">
                    <ShieldCheck class="h-3 w-3 mr-1" /> Saved Token Found
                  </span>
                {/if}
              </Label>
              <Input
                id="hsToken"
                type="password"
                bind:value={hubspotToken}
                placeholder="pat-na1-..."
                class="bg-black/10 border-border font-mono text-sm"
              />
              <p class="text-xs text-muted-foreground">
                Tokens are stored securely in your local SQLite configuration and never shared externally.
              </p>
            </div>

            <!-- Predefined fields info -->
            <div class="rounded-lg bg-black/20 p-4 text-xs space-y-2 border border-border/40 select-none">
              <div class="font-semibold text-primary flex items-center">
                <Sparkles class="h-3.5 w-3.5 mr-1" /> HubSpot Default Mapping
              </div>
              <ul class="list-disc list-inside space-y-1 pl-1 text-muted-foreground">
                <li><strong>Verticals (Segments)</strong>: Mapped to Company <code class="text-foreground">industry</code>.</li>
                <li><strong>Cohorts (Customer Groups)</strong>: Grouped by month of Deal <code class="text-foreground">Close Date</code> (Closed Won deals).</li>
                <li><strong>Starting Users</strong>: Sum of active Companies in each close-date month.</li>
                <li><strong>Base ARPU</strong>: Calculated from Deal <code class="text-foreground">amount</code>.</li>
              </ul>
            </div>
          </CardContent>
        {/if}
        <CardFooter class="border-t border-border bg-black/10 py-4 flex justify-end">
          <Button onclick={generatePreview} disabled={isLoading} size="sm">
            {#if isLoading}
              <RefreshCw class="h-4 w-4 mr-2 animate-spin" /> Fetching & Calculating...
            {:else}
              <Sparkles class="h-4 w-4 mr-2" /> Generate Preview
            {/if}
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>

  <!-- Preview table section -->
  {#if previewVerticals}
    <div class="pt-2 transition-all duration-200">
      <Card class="border-border shadow-sm">
        <CardHeader class="border-b border-border bg-black/10 flex flex-row items-center justify-between">
          <div>
            <CardTitle>Calculated Import Preview</CardTitle>
            <CardDescription>Review the computed segments and cohort averages before committing them to the database.</CardDescription>
          </div>
          <Button onclick={executeImport} disabled={isLoading} variant="default" size="sm">
            <CheckCircle class="h-4 w-4 mr-2" /> Save to Database
          </Button>
        </CardHeader>
        <CardContent class="p-0">
          <div class="overflow-x-auto select-none">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-border bg-black/20 text-muted-foreground font-semibold">
                  <th class="p-4">Market Segment / Vertical</th>
                  <th class="p-4">Cohort Name</th>
                  <th class="p-4 text-right">Active Starting Users</th>
                  <th class="p-4 text-right">Base ARPU</th>
                  <th class="p-4 text-right">Est. Churn Rate</th>
                  <th class="p-4 text-right">Aquisition Rate</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/60">
                {#each previewVerticals as vertical}
                  {#each vertical.cohorts as cohort, idx}
                    <tr class="hover:bg-white/5 transition-all duration-150">
                      {#if idx === 0}
                        <td class="p-4 font-bold align-middle border-r border-border/40 text-foreground bg-primary/5" rowspan={vertical.cohorts.length}>
                          {vertical.name}
                          <div class="text-[10px] text-muted-foreground font-normal mt-1">{vertical.description}</div>
                        </td>
                      {/if}
                      <td class="p-4 font-semibold text-primary/90">{cohort.name}</td>
                      <td class="p-4 text-right font-mono font-medium">{formatNumber(cohort.currentUsers)}</td>
                      <td class="p-4 text-right font-mono font-bold text-foreground">{formatCurrency(cohort.baseArpu, 'USD')}</td>
                      <td class="p-4 text-right font-mono text-rose-400">{formatPercent(cohort.monthlyChurnRate)}</td>
                      <td class="p-4 text-right font-mono text-emerald-400">+{formatNumber(cohort.monthlyAcquisition)} /mo</td>
                    </tr>
                  {/each}
                {/each}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  {/if}
</div>
