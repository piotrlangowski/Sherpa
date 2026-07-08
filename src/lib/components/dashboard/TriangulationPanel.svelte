<script lang="ts">
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Info from '@lucide/svelte/icons/info';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { formatCurrency, formatIrr, formatPI, formatMonths } from '$lib/utils/format';
  import type { Currency } from '$lib/shared/types';
  import type { TriangulationResult, PerspectiveModule } from '$lib/shared/perspectives';

  let {
    triangulation,
    currency
  }: {
    triangulation: TriangulationResult;
    currency: Currency;
  } = $props();

  const moduleNames: Record<PerspectiveModule, string> = {
    cohort: 'Cohort / Incremental',
    plan: 'Plan Seats / GTM',
    monetization: 'AI Service / Appraisal',
    pool: 'Credit Pool'
  };

  const moduleShortCodes: Record<PerspectiveModule | 'composite', string> = {
    cohort: 'INC',
    plan: 'GTM',
    monetization: 'USE',
    pool: 'POOL',
    composite: 'CMP'
  };

  const moduleDesc: Record<PerspectiveModule, string> = {
    cohort: 'ARPU uplift on the retained client base',
    plan: 'Plan subscription (seats × price) plus service monetization',
    monetization: 'Usage-based or add-on monetization (features)',
    pool: 'Shared credit pool under a flat fee and usage cap'
  };

  const compNames: Record<string, string> = {
    cohort: 'Cohort ARPU Uplift',
    plan: 'Plan Subscriptions (Seats)',
    copilotMonetization: 'Copilot Monetization Add-ons',
    agentMonetization: 'Agent Monetization Add-ons',
    pool: 'Credit Pool Tier Fee & Overages',
    agentOutcome: 'Agent Outcome-based Revenue',
    copilotOutcome: 'Copilot Outcome-based Revenue',
    unmonetizedLabor: 'Labor Savings (Unmonetized)'
  };
</script>

<div class="space-y-6">
  <Card class="border-border bg-card">
    <CardHeader>
      <div class="flex items-center justify-between">
        <div>
          <CardTitle class="text-xl font-bold text-foreground">Revenue Perspectives Triangulation</CardTitle>
          <CardDescription class="text-muted-foreground mt-1">
            Chassis comparison across active and alternative revenue carrier perspectives.
          </CardDescription>
        </div>
        <Badge variant="outline" class="text-muted-foreground font-mono text-[10px] tracking-wider uppercase select-none border-border px-2 py-0.5">
          DIAGNOSTIC VIEW
        </Badge>
      </div>
    </CardHeader>
    <CardContent>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-border/60 text-muted-foreground text-xs font-semibold select-none">
              <th class="pb-3 pr-4">Perspective</th>
              <th class="pb-3 px-4">Status</th>
              <th class="pb-3 px-4 text-right">NPV Expected (Upper)</th>
              <th class="pb-3 px-4 text-right">NPV Lower</th>
              <th class="pb-3 px-4 text-right">IRR</th>
              <th class="pb-3 px-4 text-right">PI</th>
              <th class="pb-3 px-4 text-right">Revenue PV</th>
              <th class="pb-3 pl-4 text-right">Status Detail</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/40 text-sm">
            {#each triangulation.perspectives as p (p.module)}
              <tr class="group transition-colors hover:bg-muted/30">
                <!-- Perspective Info -->
                <td class="py-4 pr-4">
                  <div class="flex items-start space-x-3">
                    <Badge
                      variant="outline"
                      class="font-mono text-[10px] font-bold px-1.5 py-0.5 h-5 shrink-0 select-none
                        {p.isActive
                          ? 'border-primary/40 text-primary bg-primary/5'
                          : p.filled
                            ? 'border-border text-foreground bg-muted/40'
                            : 'border-muted/30 text-muted-foreground bg-muted/10'}"
                    >
                      {moduleShortCodes[p.module]}
                    </Badge>
                    <div>
                      <span class="font-semibold block text-foreground {p.isActive ? 'text-primary' : ''}">
                        {moduleNames[p.module]}
                      </span>
                      <span class="text-xs text-muted-foreground block mt-0.5">
                        {moduleDesc[p.module]}
                      </span>
                    </div>
                  </div>
                </td>

                <!-- Status Badge -->
                <td class="py-4 px-4 whitespace-nowrap">
                  {#if p.isActive}
                    <Badge variant="default" class="bg-primary text-primary-foreground font-semibold px-2 py-0.5 select-none">
                      Active Carrier
                    </Badge>
                  {:else if p.integrity.status === 'block'}
                    <Badge variant="destructive" class="font-semibold px-2 py-0.5 select-none flex items-center space-x-1 max-w-[150px] truncate" title={p.integrity.message || 'Validation Blocked'}>
                      <AlertTriangle class="h-3 w-3 shrink-0" />
                      <span>Blocked</span>
                    </Badge>
                  {:else if p.filled || p.isActive}
                    <Badge variant="secondary" class="text-secondary-foreground font-medium px-2 py-0.5 select-none">
                      Alternative
                    </Badge>
                  {:else}
                    <span class="text-xs text-muted-foreground select-none italic">
                      Not Configured
                    </span>
                  {/if}
                </td>

                <!-- NPV Expected -->
                <td class="py-4 px-4 text-right font-mono font-bold whitespace-nowrap">
                  {#if p.integrity.status === 'block'}
                    <span class="text-destructive">—</span>
                  {:else if p.filled || p.isActive}
                    <span class={p.isActive ? 'text-primary' : 'text-foreground'}>
                      {formatCurrency(p.npvUpper, currency, 0)}
                    </span>
                  {:else}
                    <span class="text-muted-foreground/40">—</span>
                  {/if}
                </td>

                <!-- NPV Lower -->
                <td class="py-4 px-4 text-right font-mono text-muted-foreground whitespace-nowrap">
                  {#if p.integrity.status === 'block'}
                    <span class="text-destructive">—</span>
                  {:else if p.filled || p.isActive}
                    <span>{formatCurrency(p.npvLower, currency, 0)}</span>
                  {:else}
                    <span class="text-muted-foreground/40">—</span>
                  {/if}
                </td>

                <!-- IRR -->
                <td class="py-4 px-4 text-right font-mono whitespace-nowrap">
                  {#if p.integrity.status === 'block'}
                    <span class="text-destructive">—</span>
                  {:else if p.filled || p.isActive}
                    <span class={p.isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                      {formatIrr(p.irr)}
                    </span>
                  {:else}
                    <span class="text-muted-foreground/40">—</span>
                  {/if}
                </td>

                <!-- PI -->
                <td class="py-4 px-4 text-right font-mono whitespace-nowrap">
                  {#if p.integrity.status === 'block'}
                    <span class="text-destructive">—</span>
                  {:else if p.filled || p.isActive}
                    <span class={p.isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                      {formatPI(p.piUpper)}
                    </span>
                  {:else}
                    <span class="text-muted-foreground/40">—</span>
                  {/if}
                </td>

                <!-- Revenue PV -->
                <td class="py-4 px-4 text-right font-mono whitespace-nowrap">
                  {#if p.integrity.status === 'block'}
                    <span class="text-destructive">—</span>
                  {:else if p.filled || p.isActive}
                    <span class={p.isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                      {formatCurrency(p.revenuePv, currency, 0)}
                    </span>
                  {:else}
                    <span class="text-muted-foreground/40">—</span>
                  {/if}
                </td>

                <!-- Status detail (read-only — duplication lives in the header "Duplicate As..." menu) -->
                <td class="py-4 pl-4 text-right whitespace-nowrap">
                  {#if p.isActive}
                    <span class="text-xs text-primary font-medium select-none px-3">Current</span>
                  {:else if p.integrity.status === 'block'}
                    <span class="text-xs text-destructive select-none flex items-center justify-end space-x-1 px-3" title={p.integrity.message}>
                      <AlertTriangle class="h-3.5 w-3.5" />
                      <span>Data Conflict</span>
                    </span>
                  {:else if p.filled || p.isActive}
                    <span class="text-xs text-muted-foreground select-none px-3">Diagnostic</span>
                  {:else}
                    <span class="text-xs text-muted-foreground select-none italic px-3">Inactive</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>

  <!-- Delta Analysis Section (hidden for now per user request) -->
  {#if false && triangulation.deltas.length > 0}
    <div class="space-y-3">
      <h3 class="text-base font-bold text-foreground flex items-center space-x-2">
        <Info class="h-4.5 w-4.5 text-muted-foreground" />
        <span>Deltas relative to Active Perspective</span>
      </h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each triangulation.deltas as d}
          <Card class="border-border bg-card shadow-sm hover:border-border/80 transition-colors">
            <CardContent class="p-4 flex flex-col justify-between h-full space-y-4">
              <div>
                <div class="flex items-center justify-between">
                  <span class="font-bold text-sm text-foreground">
                    {moduleNames[d.toModule]} Perspective
                  </span>
                  
                  <div class="flex items-center space-x-2">
                    <Badge variant="outline" class="text-[10px] font-mono font-bold select-none border-border">
                      {moduleShortCodes[d.fromModule]}
                    </Badge>
                    <ArrowRight class="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" class="text-[10px] font-mono font-bold select-none border-primary/30 text-primary bg-primary/5">
                      {moduleShortCodes[d.toModule]}
                    </Badge>
                  </div>
                </div>

                <!-- Financial Comparison -->
                <div class="grid grid-cols-2 gap-2 mt-4">
                  <div class="bg-muted/30 p-2.5 rounded-lg border border-border/30">
                    <span class="text-[10px] text-muted-foreground uppercase font-bold block select-none">
                      Delta NPV
                    </span>
                    <span class="text-sm font-bold font-mono block mt-1
                      {d.deltaNpvUpper > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : d.deltaNpvUpper < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-muted-foreground'}">
                      {d.deltaNpvUpper > 0 ? '+' : ''}{formatCurrency(d.deltaNpvUpper, currency, 0)}
                    </span>
                  </div>

                  <div class="bg-muted/30 p-2.5 rounded-lg border border-border/30">
                    <span class="text-[10px] text-muted-foreground uppercase font-bold block select-none">
                      Delta Revenue PV
                    </span>
                    <span class="text-sm font-bold font-mono block mt-1
                      {d.deltaRevenuePv > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : d.deltaRevenuePv < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-muted-foreground'}">
                      {d.deltaRevenuePv > 0 ? '+' : ''}{formatCurrency(d.deltaRevenuePv, currency, 0)}
                    </span>
                  </div>
                </div>

                <!-- Dynamic Explanation Sentence -->
                <p class="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {d.explanation}
                </p>
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Composite Revenue Breakdown -->
  {#if triangulation.activeMode === 'composite' && triangulation.compositeBreakdown}
    <Card class="border-border bg-card">
      <CardHeader>
        <CardTitle class="text-base font-bold text-foreground">Composite Revenue Breakdown</CardTitle>
        <CardDescription class="text-muted-foreground mt-1">
          Detailed diagnostics of active, folded, and billed revenue streams.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-border/60 text-muted-foreground text-xs font-semibold select-none">
                <th class="pb-2 pr-4">Revenue Component</th>
                <th class="pb-2 px-4">Role</th>
                <th class="pb-2 px-4 text-right">PV Value</th>
                <th class="pb-2 pl-4">Rule/Reason</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/40 text-xs font-sans">
              {#each Object.entries(triangulation.compositeBreakdown) as [key, comp]}
                <tr class="hover:bg-muted/30">
                  <td class="py-3 pr-4 font-semibold text-foreground">
                    {compNames[key] || key}
                  </td>
                  <td class="py-3 px-4">
                    {#if comp.role === 'books'}
                      <Badge variant="outline" class="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 font-semibold font-mono text-[10px]">
                        ADDITIVE (BOOKS)
                      </Badge>
                    {:else if comp.role === 'folded'}
                      <Badge variant="outline" class="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 font-semibold font-mono text-[10px]">
                        FOLDED (MEMO)
                      </Badge>
                    {:else if comp.role === 'pool_billed'}
                      <Badge variant="outline" class="border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5 font-semibold font-mono text-[10px]">
                        POOL BILLED
                      </Badge>
                    {:else if comp.role === 'blocked'}
                      <Badge variant="outline" class="border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/5 font-semibold font-mono text-[10px]">
                        BLOCKED
                      </Badge>
                    {:else}
                      <span class="text-muted-foreground/60 italic">None</span>
                    {/if}
                  </td>
                  <td class="py-3 px-4 text-right font-mono font-semibold">
                    {#if comp.role === 'books'}
                      <span class="text-foreground">{formatCurrency(comp.revenuePv, currency, 0)}</span>
                    {:else if comp.role === 'folded' || comp.role === 'pool_billed'}
                      <span class="text-muted-foreground/75 italic" title="Not added to NPV summation. Diagnostic only.">
                        ({formatCurrency(comp.memoValue || comp.revenuePv || 0, currency, 0)})
                      </span>
                    {:else}
                      <span class="text-muted-foreground/40">—</span>
                    {/if}
                  </td>
                  <td class="py-3 pl-4 text-muted-foreground">
                    {comp.reason}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- Revenue Perspective Relations -->
  {#if triangulation.relations && triangulation.relations.length > 0}
    <div class="space-y-3">
      <h3 class="text-base font-bold text-foreground flex items-center space-x-2">
        <Info class="h-4.5 w-4.5 text-muted-foreground" />
        <span>Revenue Perspective Relations & Integrity</span>
      </h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each triangulation.relations as rel}
          <Card class="border-border bg-card shadow-sm {rel.incommensurable ? 'border-amber-500/40 bg-amber-500/5' : ''}">
            <CardContent class="p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                  <Badge variant="outline" class="text-[10px] font-mono font-bold select-none border-border">
                    {moduleShortCodes[rel.moduleA]}
                  </Badge>
                  <span class="text-muted-foreground text-xs">↔</span>
                  <Badge variant="outline" class="text-[10px] font-mono font-bold select-none border-border">
                    {moduleShortCodes[rel.moduleB]}
                  </Badge>
                </div>
                
                <Badge variant="outline" class="text-[10px] font-mono font-bold uppercase select-none
                  {rel.kind === 'additive' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5' :
                   rel.kind === 'contained' ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5' :
                   rel.kind === 'exclusive_billing' ? 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/5' :
                   rel.kind === 'blocked' ? 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/5' :
                   'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5'}">
                  {rel.kind.replace('_', ' ')}
                </Badge>
              </div>
              
              <div class="space-y-1">
                <span class="text-xs font-semibold text-foreground block">
                  {moduleNames[rel.moduleA]} vs {moduleNames[rel.moduleB]}
                </span>
                <p class="text-xs text-muted-foreground leading-relaxed">
                  {rel.reason}
                </p>
                {#if rel.incommensurable}
                  <div class="flex items-center space-x-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold pt-1">
                    <AlertTriangle class="h-3.5 w-3.5" />
                    <span>Incommensurable: Different market populations / cohorts modeled.</span>
                  </div>
                {/if}
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>
    </div>
  {/if}
</div>
