<script lang="ts">
  import Sidebar from './Sidebar.svelte';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import { appState } from '../../stores/app.svelte';
  import type { Snippet } from 'svelte';
  import { mode, toggleMode } from 'mode-watcher';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Button from '../ui/button/button.svelte';
  
  interface Props {
    children: Snippet;
  }
  
  let { children }: Props = $props();
</script>

<div class="app-backdrop flex h-screen w-screen overflow-hidden text-foreground transition-colors duration-200">
  <!-- Decorative background shapes (soft glow in both themes) -->
  <div class="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-primary/10 dark:bg-primary/5 blur-[120px] pointer-events-none z-0"></div>
  <div class="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-emerald-500/10 dark:bg-emerald-500/5 blur-[150px] pointer-events-none z-0"></div>
  
  <!-- Sidebar -->
  <Sidebar />

  <!-- Main Viewport -->
  <main class="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
    <!-- Header bar -->
    <header class="glass-strong h-14 border-b px-6 flex items-center justify-between shrink-0 select-none">
      <div class="flex items-center space-x-4">
        <Breadcrumbs />
      </div>
      
      <div class="flex items-center space-x-3">
        <!-- Badge for currency & environment -->
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
          {appState.currency}
        </span>
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          Local-First
        </span>

        <!-- Theme Toggle Button -->
        <Button 
          variant="ghost" 
          size="icon" 
          onclick={toggleMode} 
          class="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full transition-colors"
          aria-label="Toggle theme"
        >
          {#if mode.current === 'dark'}
            <Sun class="h-4.5 w-4.5 text-amber-400" />
          {:else}
            <Moon class="h-4.5 w-4.5 text-slate-700" />
          {/if}
        </Button>
      </div>
    </header>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-y-auto px-8 py-6">
      {@render children()}
    </div>
  </main>
</div>
