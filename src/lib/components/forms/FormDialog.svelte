<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import { enhance } from '$app/forms';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Button } from '$lib/components/ui/button/index.js';

  let {
    open = $bindable(false),
    busy = $bindable(false),
    title,
    description = '',
    icon = undefined,
    size = 'md',
    destructive = false,
    action = undefined,
    submitLabel = 'Save',
    cancelLabel = 'Cancel',
    onSuccess = undefined,
    children,
    footer = undefined,
    footerStart = undefined
  }: {
    open?: boolean;
    busy?: boolean;
    title: string;
    description?: string;
    icon?: Component<any>;
    size?: 'sm' | 'md' | 'lg';
    destructive?: boolean;
    /** Form action like '?/createCohort'. Omit for plain mode (caller supplies its own form via snippets). */
    action?: string;
    submitLabel?: string;
    cancelLabel?: string;
    onSuccess?: () => void;
    children: Snippet;
    footer?: Snippet;
    footerStart?: Snippet;
  } = $props();

  const sizeClass = $derived(
    size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-lg'
  );
  const Icon = $derived(icon);

  const handleSubmit = () => {
    busy = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      busy = false;
      open = false;
      onSuccess?.();
    };
  };
</script>

{#snippet headerBlock()}
  <div class="glass-inset border-b border-border/60 px-6 py-4 pr-12">
    <div class="flex items-center gap-3">
      {#if Icon}
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {destructive
            ? 'bg-destructive/10 text-destructive'
            : 'bg-primary/10 text-primary'}"
        >
          <Icon class="h-4 w-4" />
        </div>
      {/if}
      <div class="space-y-0.5">
        <Dialog.Title class="text-base font-bold">{title}</Dialog.Title>
        {#if description}
          <Dialog.Description class="text-xs text-muted-foreground"
            >{description}</Dialog.Description
          >
        {/if}
      </div>
    </div>
  </div>
{/snippet}

{#snippet bodyBlock()}
  <div class="max-h-[min(65vh,38rem)] space-y-4 overflow-y-auto px-6 py-5">
    {@render children()}
  </div>
{/snippet}

{#snippet footerBlock()}
  <div class="glass-inset flex items-center gap-2 border-t border-border/60 px-6 py-3.5">
    <div class="flex-1">
      {#if footerStart}{@render footerStart()}{/if}
    </div>
    {#if footer}
      {@render footer()}
    {:else}
      <Button variant="outline" onclick={() => (open = false)}>{cancelLabel}</Button>
      {#if action}
        <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      {/if}
    {/if}
  </div>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="{sizeClass} gap-0 overflow-hidden p-0" interactOutsideBehavior="ignore">
    {#if action}
      <form method="POST" {action} use:enhance={handleSubmit}>
        {@render headerBlock()}
        {@render bodyBlock()}
        {@render footerBlock()}
      </form>
    {:else}
      {@render headerBlock()}
      {@render bodyBlock()}
      {@render footerBlock()}
    {/if}
  </Dialog.Content>
</Dialog.Root>
