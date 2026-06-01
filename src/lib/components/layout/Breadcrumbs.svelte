<script lang="ts">
  import { page } from '$app/stores';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Home from '@lucide/svelte/icons/home';

  // Reactive state derived from the URL path
  let segments = $derived(
    $page.url.pathname
      .split('/')
      .filter((segment) => segment !== '')
      .map((segment, index, arr) => {
        const href = '/' + arr.slice(0, index + 1).join('/');
        const label = segment
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return { label, href };
      })
  );
</script>

<nav aria-label="Breadcrumb" class="flex items-center space-x-1.5 text-sm text-muted-foreground/80 my-3">
  <a href="/" class="flex items-center hover:text-foreground transition-colors">
    <Home class="h-4 w-4" />
  </a>

  {#each segments as segment, i}
    <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground/40" />
    
    {#if i === segments.length - 1}
      <span class="font-medium text-foreground" aria-current="page">
        {segment.label}
      </span>
    {:else}
      <a href={segment.href} class="hover:text-foreground transition-colors">
        {segment.label}
      </a>
    {/if}
  {/each}
</nav>
