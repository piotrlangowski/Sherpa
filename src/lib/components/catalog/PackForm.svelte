<script lang="ts">
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  
  // Lucide Icons
  import Save from '@lucide/svelte/icons/save';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Layers from '@lucide/svelte/icons/layers';

  interface Props {
    pack?: any;
    services: any[];
    action: string;
  }

  let { pack = {}, services, action }: Props = $props();

  let name = $state(pack.name || '');
  let description = $state(pack.description || '');
  let selectedServiceIds = $state<string[]>(pack.services?.map((s: any) => s.id) || []);
  let isSaving = $state(false);

  function toggleService(id: string) {
    if (selectedServiceIds.includes(id)) {
      selectedServiceIds = selectedServiceIds.filter(sId => sId !== id);
    } else {
      selectedServiceIds = [...selectedServiceIds, id];
    }
  }
</script>

<div class="max-w-2xl space-y-6">
  <div class="flex items-center space-x-3">
    <Button variant="outline" size="icon" href="/catalog/packs" class="h-9 w-9">
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div>
      <h2 class="text-2xl font-bold tracking-tight font-black">
        {pack.id ? 'Edit Feature Pack' : 'Create Feature Pack'}
      </h2>
      <p class="text-muted-foreground text-sm">
        {pack.id ? 'Bundle AI services together into functional components.' : 'Create a bundle of AI services for packaging.'}
      </p>
    </div>
  </div>

  <form method="POST" {action} use:enhance={() => {
    isSaving = true;
    return async ({ update }) => {
      await update();
      isSaving = false;
    };
  }}>
    <div class="space-y-6">
      <div class="glass border rounded-xl p-6 space-y-4">
        <div class="flex items-center space-x-2.5 text-primary mb-2 select-none">
          <Layers class="h-5 w-5" />
          <span class="text-xs font-bold uppercase tracking-wider">Pack Configurations</span>
        </div>

        <input type="hidden" name="id" value={pack.id || ''} />

        <!-- Name -->
        <div class="space-y-1.5">
          <Label for="name">Pack Name</Label>
          <Input id="name" name="name" placeholder="e.g. Content Writer Suite" bind:value={name} required class="bg-(--glass-inset-bg)" />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <Label for="description">Description</Label>
          <Textarea id="description" name="description" placeholder="Describe the value proposition of this bundle..." bind:value={description} class="bg-(--glass-inset-bg)" />
        </div>

        <!-- Services Checkbox List -->
        <div class="space-y-2 pt-2">
          <Label>Select AI Services to Include</Label>
          {#if services.length === 0}
            <div class="text-sm text-muted-foreground bg-muted border border-border rounded-md p-4 text-center">
              No services found in catalog. Create services first.
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
              {#each services as service}
                <label 
                  class="flex items-center space-x-3 p-3 rounded-lg border border-border bg-(--glass-inset-bg) hover:bg-muted/40 cursor-pointer select-none transition-colors"
                >
                  <input
                    type="checkbox"
                    name="service_ids"
                    value={service.id}
                    checked={selectedServiceIds.includes(service.id)}
                    onclick={() => toggleService(service.id)}
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/50"
                  />
                  <div>
                    <span class="text-sm font-semibold text-foreground block">{service.name}</span>
                    <span class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mt-0.5">{service.status}</span>
                  </div>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex items-center justify-end space-x-3">
        <Button variant="outline" href="/catalog/packs" disabled={isSaving}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>
          <Save class="h-4 w-4 mr-2" />
          {#if isSaving}Saving...{:else}Save Feature Pack{/if}
        </Button>
      </div>
    </div>
  </form>
</div>
