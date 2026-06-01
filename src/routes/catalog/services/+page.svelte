<script lang="ts">
  import { enhance } from '$app/forms';
  import { formatNumber, formatCurrency } from '$lib/utils/format';
  import Button from '$lib/components/ui/button/button.svelte';
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
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Cpu from '@lucide/svelte/icons/cpu';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Compass from '@lucide/svelte/icons/compass';

  let { data } = $props();
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">AI Service Catalog</h2>
      <p class="text-muted-foreground text-sm font-normal">Manage atomic AI services and feature configurations.</p>
    </div>
    <Button href="/catalog/services/new">
      <Plus class="h-4 w-4 mr-2" /> Add AI Service
    </Button>
  </div>

  {#if data.services.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <BrainCircuit class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">Catalog is Empty</h3>
          <p class="text-sm text-muted-foreground">Click "Add AI Service" to start building your feature portfolio.</p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each data.services as service}
        <Card class="border-border bg-card/40 backdrop-blur-sm shadow-sm flex flex-col justify-between hover:border-primary/30 transition-all duration-300 group">
          <CardHeader class="pb-3 border-b border-border bg-black/5">
            <div class="flex justify-between items-start">
              <div class="flex items-center space-x-2 text-primary">
                <BrainCircuit class="h-5 w-5 group-hover:scale-105 transition-transform" />
                <CardTitle class="text-base font-bold text-foreground line-clamp-1">{service.name}</CardTitle>
              </div>
              
              {#if service.status === 'existing'}
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider select-none">
                  Existing
                </span>
              {:else}
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider select-none">
                  Planned
                </span>
              {/if}
            </div>
            {#if service.description}
              <CardDescription class="mt-2 line-clamp-2 h-10 select-none text-muted-foreground/90 leading-snug">
                {service.description}
              </CardDescription>
            {/if}
          </CardHeader>

          <CardContent class="py-4 space-y-3.5 text-sm select-none">
            <!-- Model info -->
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5">
                <Cpu class="h-3.5 w-3.5 opacity-60" />
                <span>AI Model</span>
              </span>
              <span class="font-mono text-xs font-semibold text-foreground truncate max-w-[140px]">
                {service.provider ? `${service.provider.name} ${service.provider.model_name}` : 'Fixed cost only'}
              </span>
            </div>

            {#if service.provider}
              <!-- Token inputs/outputs -->
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5">
                  <KeyRound class="h-3.5 w-3.5 opacity-60" />
                  <span>Tokens (In / Out)</span>
                </span>
                <span class="font-mono text-xs text-muted-foreground font-medium">
                  {formatNumber(service.avg_input_tokens)} / {formatNumber(service.avg_output_tokens)}
                </span>
              </div>

              <!-- Requests frequency -->
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground/75 flex items-center space-x-1.5">
                  <Compass class="h-3.5 w-3.5 opacity-60" />
                  <span>Volume (Requests)</span>
                </span>
                <span class="text-xs font-semibold text-foreground">
                  {formatNumber(service.avg_requests_per_user_month)} /user/mo
                </span>
              </div>
            {/if}

            {#if service.fixed_cost_per_month !== null}
              <!-- Fixed cost display -->
              <div class="flex items-center justify-between pt-1 border-t border-border/40">
                <span class="text-xs text-muted-foreground/75">Fixed Expense</span>
                <span class="text-xs font-bold text-foreground">
                  {formatCurrency(service.fixed_cost_per_month, 'USD', 2)}/mo
                </span>
              </div>
            {/if}
          </CardContent>

          <CardFooter class="border-t border-border bg-black/5 py-3.5 flex justify-end space-x-2">
            <Button variant="outline" size="sm" href="/catalog/services/{service.id}">
              <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            <form method="POST" action="?/deleteService" use:enhance class="inline-block">
              <input type="hidden" name="id" value={service.id} />
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
