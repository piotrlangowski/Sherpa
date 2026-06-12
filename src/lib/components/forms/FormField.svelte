<script lang="ts">
  import type { Snippet } from 'svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import type { FieldBadge } from './index.js';

  let {
    label,
    forId = undefined,
    required = false,
    help = '',
    span = 1,
    badge = undefined,
    children
  }: {
    label: string;
    forId?: string;
    required?: boolean;
    help?: string;
    span?: 1 | 2;
    badge?: FieldBadge;
    children: Snippet;
  } = $props();

  const toneClass = {
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-rose-600 dark:text-rose-400',
    neutral: 'text-primary',
    muted: 'text-muted-foreground'
  } as const;
</script>

<div class="space-y-1.5 {span === 2 ? 'sm:col-span-2' : ''}">
  <div class="flex items-center justify-between gap-2">
    <Label for={forId} class="font-semibold">
      {label}
      {#if required}<span class="text-destructive" aria-hidden="true">*</span>{/if}
    </Label>
    {#if badge}
      <span class="font-mono text-xs font-semibold tabular-nums {toneClass[badge.tone]}">
        {badge.text}
      </span>
    {/if}
  </div>
  {@render children()}
  {#if help}
    <p class="text-xs text-muted-foreground">{help}</p>
  {/if}
</div>
