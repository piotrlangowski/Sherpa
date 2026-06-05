<script lang="ts">
  import { untrack } from 'svelte';
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

  // Lucide Icons
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Save from '@lucide/svelte/icons/save';
  import Globe from '@lucide/svelte/icons/globe';

  let { data } = $props();
  const vertical = data.vertical;

  let tam = $state(vertical.tam_users ?? 0);
  let sam = $state(vertical.sam_users ?? 0);
  let som = $state(vertical.som_users ?? 0);

  // Validate SAM/SOM logic client-side
  $effect(() => {
    // Read all three as tracked dependencies so the effect re-runs on any change
    const _tam = tam;
    const _sam = sam;
    const _som = som;

    // Wrap writes in untrack() to prevent the write from re-triggering this effect
    untrack(() => {
      const clampedSam = _sam > _tam ? _tam : _sam;
      const clampedSom = _som > clampedSam ? clampedSam : _som;
      if (clampedSam !== _sam) sam = clampedSam;
      if (clampedSom !== _som) som = clampedSom;
    });
  });

  // Check if a plan/pack is active
  const isPlanChecked = (planId: string) => {
    return vertical.plans?.some((p: any) => p.id === planId) ?? false;
  };

  const isPackChecked = (packId: string) => {
    return vertical.packs?.some((pk: any) => pk.id === packId) ?? false;
  };
</script>

<div class="max-w-2xl mx-auto space-y-6">
  <div class="flex items-center space-x-2">
    <Button href="/market/verticals" variant="ghost" size="sm">
      <ArrowLeft class="h-4 w-4 mr-2" /> Back to Verticals
    </Button>
  </div>

  <Card class="border-border bg-card/40 backdrop-blur-sm shadow-md">
    <CardHeader class="border-b border-border bg-black/5">
      <div class="flex items-center space-x-2 text-primary">
        <Globe class="h-6 w-6" />
        <CardTitle class="text-xl font-bold">Edit Market Vertical</CardTitle>
      </div>
      <CardDescription>Modify properties, sizing parameters, and linked offerings for the "{vertical.name}" segment.</CardDescription>
    </CardHeader>

    <form method="POST" action="?/updateVertical" use:enhance>
      <CardContent class="py-6 space-y-6">
        <!-- Basic Info -->
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="name" class="font-semibold text-foreground">Vertical Name</Label>
            <Input id="name" name="name" type="text" value={vertical.name} placeholder="e.g. LegalTech, FinTech" required class="bg-black/10 border-border" />
          </div>

          <div class="space-y-2">
            <Label for="description" class="font-semibold text-foreground">Description</Label>
            <Textarea id="description" name="description" value={vertical.description} placeholder="Summarize vertical characteristics..." rows={3} class="bg-black/10 border-border" />
          </div>
        </div>

        <hr class="border-border/60" />

        <!-- Market Sizes -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider">Market Sizing (Target Users)</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="space-y-2">
              <Label for="tamUsers" class="font-medium text-muted-foreground flex items-center justify-between">
                <span>TAM</span>
                <span class="text-[10px] lowercase font-normal">(Total Addressable)</span>
              </Label>
              <Input id="tamUsers" name="tamUsers" type="number" min="0" bind:value={tam} class="bg-black/10 border-border font-mono" />
            </div>

            <div class="space-y-2">
              <Label for="samUsers" class="font-medium text-muted-foreground flex items-center justify-between">
                <span>SAM</span>
                <span class="text-[10px] lowercase font-normal">(Serviceable Available)</span>
              </Label>
              <Input id="samUsers" name="samUsers" type="number" min="0" max={tam} bind:value={sam} class="bg-black/10 border-border font-mono" />
            </div>

            <div class="space-y-2">
              <Label for="somUsers" class="font-medium text-muted-foreground flex items-center justify-between">
                <span>SOM</span>
                <span class="text-[10px] lowercase font-normal">(Serviceable Obtainable)</span>
              </Label>
              <Input id="somUsers" name="somUsers" type="number" min="0" max={sam} bind:value={som} class="bg-black/10 border-border font-mono" />
            </div>
          </div>
        </div>

        <hr class="border-border/60" />

        <!-- Plans Mapping -->
        <div class="space-y-3">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider">Assigned Pricing Plans</h3>
          {#if data.plans.length === 0}
            <p class="text-xs text-muted-foreground italic">No pricing plans created yet. Create some in Catalog first.</p>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-black/10 p-4 rounded-lg border border-border/40">
              {#each data.plans as plan}
                <label class="flex items-start space-x-3 cursor-pointer p-1.5 rounded hover:bg-white/5 transition">
                  <input type="checkbox" name="planIds" value={plan.id} checked={isPlanChecked(plan.id)} class="mt-1 accent-primary h-4 w-4 rounded border-border" />
                  <div class="grid gap-0.5 leading-none">
                    <span class="text-sm font-semibold text-foreground">{plan.name}</span>
                    {#if plan.base_price > 0}
                      <span class="text-[10px] text-muted-foreground/80">${plan.base_price}/user/mo</span>
                    {/if}
                  </div>
                </label>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Packs Mapping -->
        <div class="space-y-3">
          <h3 class="text-sm font-bold text-foreground uppercase tracking-wider">Assigned Feature Packs</h3>
          {#if data.packs.length === 0}
            <p class="text-xs text-muted-foreground italic">No feature packs created yet. Create some in Catalog first.</p>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-black/10 p-4 rounded-lg border border-border/40">
              {#each data.packs as pack}
                <label class="flex items-start space-x-3 cursor-pointer p-1.5 rounded hover:bg-white/5 transition">
                  <input type="checkbox" name="packIds" value={pack.id} checked={isPackChecked(pack.id)} class="mt-1 accent-primary h-4 w-4 rounded border-border" />
                  <div class="grid gap-0.5 leading-none">
                    <span class="text-sm font-semibold text-foreground">{pack.name}</span>
                    {#if pack.description}
                      <span class="text-[10px] text-muted-foreground/80 line-clamp-1">{pack.description}</span>
                    {/if}
                  </div>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      </CardContent>

      <CardFooter class="border-t border-border bg-black/5 py-4 flex justify-end space-x-2">
        <Button href="/market/verticals" variant="outline">Cancel</Button>
        <Button type="submit">
          <Save class="h-4 w-4 mr-2" /> Save Changes
        </Button>
      </CardFooter>
    </form>
  </Card>
</div>
