<script lang="ts">
  import FormField from './FormField.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import type { FieldBadge } from './index.js';

  let {
    id,
    name,
    value = $bindable(),
    label,
    prefix = '',
    suffix = '',
    step = undefined,
    min = undefined,
    max = undefined,
    required = true,
    size = 'md',
    badge = undefined,
    help = '',
    span = 1,
    placeholder = undefined
  }: {
    id: string;
    name: string;
    value?: number | string;
    label: string;
    prefix?: string;
    suffix?: string;
    step?: number | string;
    min?: number | string;
    max?: number | string;
    required?: boolean;
    size?: 'md' | 'lg';
    badge?: FieldBadge;
    help?: string;
    span?: 1 | 2;
    placeholder?: string;
  } = $props();
</script>

<FormField {label} forId={id} {required} {help} {span} {badge}>
  <div class="relative">
    {#if prefix}
      <span
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        {prefix}
      </span>
    {/if}
    <Input
      {id}
      {name}
      type="number"
      {step}
      {min}
      {max}
      {required}
      {placeholder}
      bind:value
      class="bg-(--glass-inset-bg) font-mono tabular-nums {size === 'lg'
        ? 'h-11 text-base'
        : ''} {prefix ? 'pl-7' : ''} {suffix ? (suffix.length > 3 ? 'pr-12' : 'pr-10') : ''}"
    />
    {#if suffix}
      <span
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        {suffix}
      </span>
    {/if}
  </div>
</FormField>
