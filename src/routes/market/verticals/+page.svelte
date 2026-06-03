<script lang="ts">
  import { enhance } from '$app/forms';
  import { formatNumber } from '$lib/utils/format';
  import Button from '$lib/components/ui/button/button.svelte';
  import Card from '$lib/components/ui/card/card.svelte';
  import CardHeader from '$lib/components/ui/card/card-header.svelte';
  import CardTitle from '$lib/components/ui/card/card-title.svelte';
  import CardDescription from '$lib/components/ui/card/card-description.svelte';
  import CardContent from '$lib/components/ui/card/card-content.svelte';
  import CardFooter from '$lib/components/ui/card/card-footer.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  // Lucide Icons
  import Plus from '@lucide/svelte/icons/plus';
  import Edit2 from '@lucide/svelte/icons/edit-2';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Globe from '@lucide/svelte/icons/globe';
  import Users from '@lucide/svelte/icons/users';
  import Layers from '@lucide/svelte/icons/layers';
  import Landmark from '@lucide/svelte/icons/landmark';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';

  let { data } = $props();
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Market Verticals</h2>
      <p class="text-muted-foreground text-sm font-normal">Define business segments, estimate market sizes, and link to plans and packs.</p>
    </div>
    <div class="flex items-center gap-2">
      <Button href="/market/import" variant="outline">
        <RefreshCw class="h-4 w-4 mr-2" /> Import / Sync CRM
      </Button>
      <Button href="/market/verticals/new">
        <Plus class="h-4 w-4 mr-2" /> Add Vertical
      </Button>
    </div>
  </div>

  {#if data.verticals.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Globe class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">No Verticals Configured</h3>
          <p class="text-sm text-muted-foreground">Click "Add Vertical" to start segmenting your target markets.</p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {#each data.verticals as vertical}
        <Card class="border-border bg-card/40 backdrop-blur-sm shadow-sm flex flex-col justify-between hover:border-primary/30 transition-all duration-300 group">
          <CardHeader class="pb-3 border-b border-border bg-black/5">
            <div class="flex justify-between items-start">
              <div class="flex items-center space-x-2 text-primary">
                <Globe class="h-5 w-5 group-hover:scale-105 transition-transform" />
                <CardTitle class="text-lg font-bold text-foreground line-clamp-1">{vertical.name}</CardTitle>
              </div>
            </div>
            {#if vertical.description}
              <CardDescription class="mt-2 line-clamp-2 h-10 select-none text-muted-foreground/90 leading-snug">
                {vertical.description}
              </CardDescription>
            {/if}
          </CardHeader>

          <CardContent class="py-5 space-y-4 text-sm select-none">
            <!-- Market Size Breakdown -->
            <div>
              <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5 mb-3 font-semibold uppercase tracking-wider">
                <Users class="h-3.5 w-3.5 opacity-60" />
                <span>Market Sizing (Users)</span>
              </span>
              <div class="grid grid-cols-3 gap-4 bg-muted/40 p-3 rounded-lg border border-border/40">
                <div class="text-center">
                  <div class="text-[10px] text-muted-foreground/80 uppercase font-medium">TAM</div>
                  <div class="text-sm font-bold text-foreground mt-0.5">{formatNumber(vertical.tam_users)}</div>
                </div>
                <div class="text-center border-x border-border/50">
                  <div class="text-[10px] text-muted-foreground/80 uppercase font-medium">SAM</div>
                  <div class="text-sm font-bold text-primary mt-0.5">{formatNumber(vertical.sam_users)}</div>
                </div>
                <div class="text-center">
                  <div class="text-[10px] text-muted-foreground/80 uppercase font-medium">SOM</div>
                  <div class="text-sm font-bold text-emerald-400 mt-0.5">{formatNumber(vertical.som_users)}</div>
                </div>
              </div>
              
              <!-- Sizing relative bar -->
              {#if vertical.tam_users > 0}
                <div class="mt-3.5 h-2 w-full bg-muted rounded-full overflow-hidden flex">
                  <div class="h-full bg-emerald-500" style="width: {Math.max(1, (vertical.som_users / vertical.tam_users) * 100)}%" title="SOM"></div>
                  <div class="h-full bg-primary" style="width: {Math.max(0, ((vertical.sam_users - vertical.som_users) / vertical.tam_users) * 100)}%" title="SAM"></div>
                  <div class="h-full bg-muted-foreground/30" style="width: {Math.max(0, ((vertical.tam_users - vertical.sam_users) / vertical.tam_users) * 100)}%" title="TAM"></div>
                </div>
              {/if}
            </div>

            <!-- Linked Plans -->
            <div class="space-y-1.5">
              <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5 font-semibold uppercase tracking-wider">
                <Landmark class="h-3.5 w-3.5 opacity-60" />
                <span>Assigned Pricing Plans</span>
              </span>
              <div class="flex flex-wrap gap-1.5">
                {#if vertical.plans && vertical.plans.length > 0}
                  {#each vertical.plans as plan}
                    <Badge variant="outline" class="bg-black/10 text-foreground border-border/80 font-mono py-0.5 px-2">{plan.name}</Badge>
                  {/each}
                {:else}
                  <span class="text-xs text-muted-foreground italic">No plans assigned</span>
                {/if}
              </div>
            </div>

            <!-- Linked Packs -->
            <div class="space-y-1.5">
              <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5 font-semibold uppercase tracking-wider">
                <Layers class="h-3.5 w-3.5 opacity-60" />
                <span>Assigned Feature Packs</span>
              </span>
              <div class="flex flex-wrap gap-1.5">
                {#if vertical.packs && vertical.packs.length > 0}
                  {#each vertical.packs as pack}
                    <Badge variant="secondary" class="bg-primary/10 text-primary hover:bg-primary/15 font-mono py-0.5 px-2">{pack.name}</Badge>
                  {/each}
                {:else}
                  <span class="text-xs text-muted-foreground italic">No feature packs assigned</span>
                {/if}
              </div>
            </div>
          </CardContent>

          <CardFooter class="border-t border-border bg-black/5 py-3.5 flex justify-end space-x-2">
            <Button variant="outline" size="sm" href="/market/verticals/{vertical.id}">
              <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            <form method="POST" action="?/deleteVertical" use:enhance class="inline-block">
              <input type="hidden" name="id" value={vertical.id} />
              <Button type="submit" variant="outline" size="sm" class="text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground">
                <Trash2 class="h-3.5 w-3.5 mr-1.5" /> Delete
              </Button>
            </form>
          </CardFooter>
        </Card>
      {/each}
    </div>
  {/if}
</div>
