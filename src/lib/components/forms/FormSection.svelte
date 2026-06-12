<script lang="ts">
  import type { Component, Snippet } from 'svelte';

  let {
    title,
    icon = undefined,
    description = '',
    columns = 2,
    hero = false,
    children
  }: {
    title: string;
    icon?: Component<any>;
    description?: string;
    columns?: 1 | 2;
    /** Hero sections render without the inset box — for the dominant fields at the top of a form. */
    hero?: boolean;
    children: Snippet;
  } = $props();

  const Icon = $derived(icon);
</script>

<section class={hero ? 'space-y-3' : 'glass-inset space-y-3 rounded-xl p-4'}>
  <div class="space-y-0.5">
    <div class="flex items-center gap-1.5">
      {#if Icon}
        <Icon class="h-3.5 w-3.5 text-primary" />
      {/if}
      <h4 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
    </div>
    {#if description}
      <p class="text-xs text-muted-foreground/80">{description}</p>
    {/if}
  </div>
  <div class="grid gap-3 {columns === 2 ? 'sm:grid-cols-2' : ''}">
    {@render children()}
  </div>
</section>
