<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
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
  
  // Lucide Icons
  import GitFork from '@lucide/svelte/icons/git-fork';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Info from '@lucide/svelte/icons/info';

  let { data, form } = $props();

  let chartElement: HTMLDivElement | undefined = $state();
  let chartInstance: any = null;
  let showAddDialog = $state(false);
  let isSaving = $state(false);

  // Form State
  let sourceId = $state('');
  let targetId = $state('');
  let dependencyType = $state<'requires' | 'enhanced_by' | 'replaces'>('requires');

  // Prepare graph data for ECharts
  let graphNodes = $derived(
    data.services.map((s: any) => ({
      id: s.id,
      name: s.name,
      symbolSize: 45,
      // Emerald for existing, indigo for planned
      itemStyle: {
        color: s.status === 'existing' ? '#10b981' : '#6366f1',
        borderColor: '#1e293b',
        borderWidth: 2
      },
      label: {
        show: true,
        color: '#f8fafc',
        fontSize: 11
      }
    }))
  );

  let graphLinks = $derived(
    data.dependencies.map((d: any) => {
      let lineColor = '#06b6d4'; // requires: cyan
      let lineType: 'solid' | 'dashed' = 'solid';
      
      if (d.dependency_type === 'enhanced_by') {
        lineColor = '#6366f1'; // enhanced_by: indigo
        lineType = 'dashed';
      } else if (d.dependency_type === 'replaces') {
        lineColor = '#ef4444'; // replaces: red
      }
      
      return {
        source: d.source_id,
        target: d.target_id,
        name: `${d.source_name} ${d.dependency_type.replace('_', ' ')} ${d.target_name}`,
        lineStyle: {
          color: lineColor,
          type: lineType,
          width: 2,
          curveness: 0.15
        }
      };
    })
  );

  function renderChart() {
    if (!chartElement || typeof window === 'undefined') return;

    import('echarts').then((echarts) => {
      if (chartInstance) {
        chartInstance.dispose();
      }

      chartInstance = echarts.init(chartElement);
      
      const option = {
        tooltip: {
          formatter: (params: any) => {
            if (params.dataType === 'edge') {
              return `<div class="px-2 py-1 text-xs text-slate-200">${params.data.name}</div>`;
            }
            return `<div class="px-2 py-1 text-xs text-slate-200">Service: ${params.name}</div>`;
          },
          backgroundColor: '#1e293b',
          borderColor: '#475569',
          borderWidth: 1
        },
        series: [
          {
            type: 'graph',
            layout: 'force',
            data: graphNodes,
            links: graphLinks,
            roam: true,
            draggable: true,
            force: {
              repulsion: 150,
              edgeLength: 100,
              gravity: 0.05
            },
            lineStyle: {
              opacity: 0.9
            },
            emphasis: {
              focus: 'adjacency',
              lineStyle: {
                width: 4
              }
            }
          }
        ]
      };

      chartInstance.setOption(option);

      // Handle window resize
      const handleResize = () => {
        chartInstance?.resize();
      };
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    });
  }

  $effect(() => {
    // Re-render chart whenever graph nodes or links change
    if (graphNodes.length >= 0 || graphLinks.length >= 0) {
      renderChart();
    }
  });

  onMount(() => {
    renderChart();
    return () => {
      chartInstance?.dispose();
    };
  });
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Service Dependencies</h2>
      <p class="text-muted-foreground text-sm font-normal">Visualize and configure integration relationships between AI features.</p>
    </div>
    <Button onclick={() => showAddDialog = true}>
      <Plus class="h-4 w-4 mr-2" /> Add Relationship
    </Button>
  </div>

  {#if form?.error}
    <Alert variant="destructive">
      <AlertTitle>Validation Failure</AlertTitle>
      <AlertDescription>{form.error}</AlertDescription>
    </Alert>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Visual Graph Card -->
    <Card class="border-border lg:col-span-2 bg-card/30 backdrop-blur-sm flex flex-col justify-between shadow-sm select-none">
      <CardHeader class="pb-2 border-b border-border bg-black/5">
        <div class="flex justify-between items-center">
          <div class="flex items-center space-x-2 text-primary">
            <GitFork class="h-5 w-5" />
            <CardTitle class="text-base font-bold text-foreground">Interactive Dependency Graph</CardTitle>
          </div>
          
          <!-- Legend -->
          <div class="flex items-center space-x-3 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            <span class="flex items-center space-x-1"><span class="h-2 w-2 rounded-full bg-emerald-500"></span> <span>Existing</span></span>
            <span class="flex items-center space-x-1"><span class="h-2 w-2 rounded-full bg-indigo-500"></span> <span>Planned</span></span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent class="p-0">
        {#if data.services.length === 0}
          <div class="h-[450px] flex items-center justify-center text-muted-foreground text-sm italic">
            Create AI services first to view graph relations.
          </div>
        {:else}
          <div bind:this={chartElement} class="h-[450px] w-full bg-background/5 rounded-b-lg"></div>
        {/if}
      </CardContent>
    </Card>

    <!-- Right side list list -->
    <Card class="border-border bg-card/30 backdrop-blur-sm shadow-sm flex flex-col justify-between">
      <CardHeader class="pb-3 border-b border-border bg-black/5 select-none">
        <CardTitle class="text-base font-bold text-foreground">Configured Links</CardTitle>
        <CardDescription>A tabular breakdown of active graph edges.</CardDescription>
      </CardHeader>
      
      <CardContent class="py-4 overflow-y-auto max-h-[350px] space-y-3">
        {#if data.dependencies.length === 0}
          <div class="text-center py-10 text-muted-foreground/60 text-sm italic select-none">
            No dependency links configured.
          </div>
        {:else}
          <div class="divide-y divide-border space-y-2.5">
            {#each data.dependencies as dep}
              <div class="flex items-center justify-between text-sm pt-2 select-none">
                <div class="space-y-0.5 max-w-[200px]">
                  <span class="font-semibold text-foreground block truncate">{dep.source_name}</span>
                  <span class="text-[10px] text-muted-foreground flex items-center space-x-1">
                    <span class="inline-block px-1.5 py-0.5 rounded bg-muted font-bold text-[9px] uppercase tracking-wider">
                      {dep.dependency_type}
                    </span>
                    <span>→ {dep.target_name}</span>
                  </span>
                </div>
                
                <form method="POST" action="?/deleteDependency" use:enhance>
                  <input type="hidden" name="id" value={dep.id} />
                  <Button type="submit" variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </form>
              </div>
            {/each}
          </div>
        {/if}
      </CardContent>
      
      <!-- Graph help note -->
      <CardFooter class="border-t border-border bg-black/5 py-3 select-none flex items-start space-x-2 text-xs text-muted-foreground">
        <Info class="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <p>Use the drag/zoom controls on the graph. Solid lines indicate strict requirements; dashed links indicate enhancements.</p>
      </CardFooter>
    </Card>
  </div>
</div>

<!-- Add Dependency Dialog -->
{#if showAddDialog}
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <Card class="w-full max-w-md border-border shadow-2xl bg-card">
      <form method="POST" action="?/addDependency" use:enhance={() => {
        isSaving = true;
        return async ({ update }) => {
          await update();
          isSaving = false;
          showAddDialog = false;
        };
      }}>
        <CardHeader class="border-b border-border bg-black/10">
          <CardTitle class="text-lg font-bold">Add Dependency Edge</CardTitle>
          <CardDescription>Link two services together to define requirements.</CardDescription>
        </CardHeader>
        
        <CardContent class="py-4 space-y-4">
          <!-- Source -->
          <div class="space-y-1.5">
            <Label for="sourceId">Source Service (Depends on...)</Label>
            <select
              id="sourceId"
              name="sourceId"
              bind:value={sourceId}
              required
              class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="" disabled selected>Select Source</option>
              {#each data.services as service}
                <option value={service.id}>{service.name} ({service.status})</option>
              {/each}
            </select>
          </div>

          <!-- Type -->
          <div class="space-y-1.5">
            <Label for="dependencyType">Relationship Type</Label>
            <select
              id="dependencyType"
              name="dependencyType"
              bind:value={dependencyType}
              required
              class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="requires">Requires (Hard Dependency)</option>
              <option value="enhanced_by">Enhanced By (Soft / Quality Boost)</option>
              <option value="replaces">Replaces (Substitutes Older Model)</option>
            </select>
          </div>

          <!-- Target -->
          <div class="space-y-1.5">
            <Label for="targetId">Target Service (The dependency)</Label>
            <select
              id="targetId"
              name="targetId"
              bind:value={targetId}
              required
              class="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="" disabled selected>Select Target</option>
              {#each data.services as service}
                {#if service.id !== sourceId}
                  <option value={service.id}>{service.name} ({service.status})</option>
                {/if}
              {/each}
            </select>
          </div>
        </CardContent>
        
        <CardFooter class="border-t border-border bg-black/10 py-3 flex justify-end space-x-2">
          <Button variant="outline" onclick={() => showAddDialog = false} disabled={isSaving}>Cancel</Button>
          <Button type="submit" disabled={isSaving}>
            {#if isSaving}Adding...{:else}Add Link{/if}
          </Button>
        </CardFooter>
      </form>
    </Card>
  </div>
{/if}
