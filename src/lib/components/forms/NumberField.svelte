<script lang="ts">
  import { untrack } from 'svelte';
  import FormField from './FormField.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import type { FieldBadge } from './index.js';
  import { cn } from '$lib/utils.js';

  let {
    id,
    name = '',
    value = $bindable(),
    label = '',
    prefix = '',
    suffix = '',
    step = undefined,
    min = undefined,
    max = undefined,
    required = false,
    size = 'md',
    badge = undefined,
    help = '',
    span = 1,
    placeholder = undefined,
    grouped = false,
    decimals = 0,
    raw = false,
    class: className = ''
  }: {
    id: string;
    name?: string;
    value?: number | string | null;
    label?: string;
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
    grouped?: boolean;
    decimals?: number;
    raw?: boolean;
    class?: string;
  } = $props();

  const GROUP = '\u202F'; // narrow no-break space

  function cleanInput(str: string, allowDecimals: boolean): string {
    const hasMinus = str.startsWith('-');
    let rest = str.replace(/-/g, '');
    
    if (allowDecimals) {
      const firstDotIndex = rest.indexOf('.');
      if (firstDotIndex !== -1) {
        const beforeDot = rest.slice(0, firstDotIndex).replace(/\D/g, '');
        const afterDot = rest.slice(firstDotIndex + 1).replace(/\D/g, '');
        rest = beforeDot + '.' + afterDot;
      } else {
        rest = rest.replace(/\D/g, '');
      }
    } else {
      rest = rest.replace(/\D/g, '');
    }

    return (hasMinus ? '-' : '') + rest;
  }

  function groupInteger(valStr: string, decimals: number = 0): string {
    if (!valStr) return '';
    const parts = valStr.split('.');
    const intPart = parts[0];
    const hasDot = parts.length > 1;
    const decPart = hasDot ? parts[1] : '';

    const isNegative = intPart.startsWith('-');
    const unsignedInt = isNegative ? intPart.slice(1) : intPart;

    const groupedUnsignedInt = unsignedInt.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
    const groupedInt = (isNegative ? '-' : '') + groupedUnsignedInt;

    if (decimals === 0) {
      return groupedInt;
    }
    if (hasDot) {
      return groupedInt + '.' + decPart;
    }
    return groupedInt;
  }

  let display = $state('');

  function isNumericallyEqual(displayStr: string, numValue: number | string | undefined | null): boolean {
    if (numValue === undefined || numValue === null || numValue === '') {
      return displayStr === '';
    }
    const parsedDisplay = Number(displayStr.replace(/[^\d.-]/g, ''));
    const parsedValue = Number(numValue);
    return !isNaN(parsedDisplay) && !isNaN(parsedValue) && parsedDisplay === parsedValue;
  }

  $effect(() => {
    const currentValue = value;
    untrack(() => {
      if (grouped) {
        if (!isNumericallyEqual(display, currentValue)) {
          if (currentValue === undefined || currentValue === null || currentValue === '') {
            display = '';
          } else {
            display = groupInteger(String(currentValue), decimals);
          }
        }
      }
    });
  });

  function onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const old = el.value;
    const caret = el.selectionStart ?? old.length;
    const digitsLeft = old.slice(0, caret).replace(/\D/g, '').length;

    const clean = cleanInput(old, decimals > 0);
    
    if (clean === '' || clean === '-' || clean === '.' || clean === '-.') {
      value = undefined;
    } else {
      value = Number(clean);
    }

    display = clean === '' ? '' : groupInteger(clean, decimals);
    el.value = display;

    let pos = 0, seen = 0;
    while (pos < display.length && seen < digitsLeft) {
      if (/\d/.test(display[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }
</script>

{#snippet inputField()}
  <div class="relative">
    {#if prefix}
      <span
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        {prefix}
      </span>
    {/if}

    {#if grouped}
      <Input
        {id}
        type="text"
        inputmode={decimals > 0 ? 'decimal' : 'numeric'}
        {required}
        {placeholder}
        value={display}
        oninput={onInput}
        class={cn(
          "bg-(--glass-inset-bg) font-mono tabular-nums",
          size === 'lg' ? 'h-11 text-base' : '',
          prefix ? 'pl-7' : '',
          suffix ? (suffix.length > 3 ? 'pr-12' : 'pr-10') : '',
          className
        )}
      />
      <input type="hidden" {name} value={value ?? ''} />
    {:else}
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
        class={cn(
          "bg-(--glass-inset-bg) font-mono tabular-nums",
          size === 'lg' ? 'h-11 text-base' : '',
          prefix ? 'pl-7' : '',
          suffix ? (suffix.length > 3 ? 'pr-12' : 'pr-10') : '',
          className
        )}
      />
    {/if}

    {#if suffix}
      <span
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        {suffix}
      </span>
    {/if}
  </div>
{/snippet}

{#if label && !raw}
  <FormField {label} forId={id} {required} {help} {span} {badge}>
    {@render inputField()}
  </FormField>
{:else}
  {@render inputField()}
{/if}
