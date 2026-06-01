<script lang="ts">
  import { enhance } from '$app/forms';
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
  import Layers from '@lucide/svelte/icons/layers';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';

  let { data } = $props();
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Feature Packs</h2>
      <p class="text-muted-foreground text-sm font-normal">Manage bundles of services to simplify pricing offers.</p>
    </div>
    <Button href="/catalog/packs/new">
      <Plus class="h-4 w-4 mr-2" /> Create Feature Pack
    </Button>
  </div>

  {#if data.packs.length === 0}
    <Card class="border-dashed border-border py-16 text-center select-none bg-card/10">
      <CardContent class="flex flex-col items-center justify-center space-y-4">
        <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Layers class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-lg font-semibold">No Feature Packs</h3>
          <p class="text-sm text-muted-foreground">Click "Create Feature Pack" to bundle services together.</p>
        </div>
      </CardContent>
    </Card>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each data.packs as pack}
        <Card class="border-border bg-card/40 backdrop-blur-sm shadow-sm flex flex-col justify-between hover:border-primary/30 transition-all duration-300 group">
          <CardHeader class="pb-3 border-b border-border bg-black/5">
            <div class="flex items-center space-x-2.5 text-primary">
              <Layers class="h-5 w-5 group-hover:scale-105 transition-transform" />
              <CardTitle class="text-base font-bold text-foreground line-clamp-1">{pack.name}</CardTitle>
            </div>
            {#if pack.description}
              <CardDescription class="mt-2 line-clamp-2 h-10 select-none text-muted-foreground/90 leading-snug">
                {pack.description}
              </CardDescription>
            {/if}
          </CardHeader>

          <CardContent class="py-4 select-none">
            <span class="text-xs text-muted-foreground font-semibold block mb-2">Included AI Services:</span>
            {#if !pack.services || pack.services.length === 0}
              <span class="text-xs text-muted-foreground/45 italic">No services bundled in this pack.</span>
            {:else}
              <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {#each pack.services as service}
                  <span class="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-muted border border-border text-foreground">
                    <BrainCircuit class="h-3 w-3 mr-1 text-primary" />
                    {service.name}
                  </span>
                {/each}
              </div>
            {/if}
          </CardContent>

          <CardFooter class="border-t border-border bg-black/5 py-3.5 flex justify-end space-x-2">
            <Button variant="outline" size="sm" href="/catalog/packs/{pack.id}">
              <Edit2 class="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            <form method="POST" action="?/deletePack" use:enhance class="inline-block">
              <input type="hidden" name="id" value={pack.id} />
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
