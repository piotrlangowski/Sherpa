<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/scenarios');
  });
</script>

<div class="h-[60vh] flex items-center justify-center">
  <div class="text-center space-y-2">
    <div class="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto"></div>
    <p class="text-sm text-muted-foreground select-none">Loading workspace...</p>
  </div>
</div>
