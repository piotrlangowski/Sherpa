<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import Button from '../ui/button/button.svelte';
  import Download from '@lucide/svelte/icons/download';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Loader2 from '@lucide/svelte/icons/loader-2';

  interface Props {
    elementId: string;        // DOM ID of the container to screenshot
    scenarioId?: string;       // ID of the scenario for JSON/CSV download
    filename?: string;         // Default download filename
    buttonText?: string;      // Button label
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  }

  let { 
    elementId, 
    scenarioId,
    filename = 'sherpa-dashboard', 
    buttonText = 'Export',
    variant = 'outline' 
  }: Props = $props();

  let isExporting = $state(false);

  async function handleExportPng() {
    if (typeof window === 'undefined') return;
    
    const targetElement = document.getElementById(elementId);
    if (!targetElement) {
      console.error(`Export error: Element with ID '${elementId}' not found.`);
      alert('Failed to locate the dashboard element to export.');
      return;
    }

    isExporting = true;

    try {
      // Import html2canvas dynamically to ensure it doesn't run during SSR
      const { default: html2canvas } = await import('html2canvas');

      // Capture the canvas with optimized rendering properties
      // Determine background color based on active theme
      const isDark = document.documentElement.classList.contains('dark');
      const exportBg = isDark ? '#0c0e17' : '#ffffff';

      // Capture the canvas with optimized rendering properties
      const canvas = await html2canvas(targetElement, {
        backgroundColor: exportBg, // Match active theme color
        scale: 2,                  // Double resolution for high-quality PNGs
        logging: false,
        useCORS: true,             // Enable cross-origin images if any
        allowTaint: true,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById(elementId);
          if (clonedElement) {
            clonedElement.style.padding = '24px';
            clonedElement.style.borderRadius = '12px';
            clonedElement.style.background = exportBg;
            
            // Hide elements we don't want in the screenshot
            const excludeButtons = clonedElement.querySelectorAll('[data-html2canvas-ignore]');
            excludeButtons.forEach(el => {
              (el as HTMLElement).style.display = 'none';
            });
          }
        }
      });

      // Convert canvas to image and trigger download
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error('Failed to export dashboard screenshot:', err);
      alert('An error occurred while generating the image export.');
    } finally {
      isExporting = false;
    }
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    <Button 
      disabled={isExporting} 
      {variant}
      class="relative overflow-hidden group select-none flex items-center"
    >
      {#if isExporting}
        <Loader2 class="h-4 w-4 mr-2 animate-spin text-primary" />
        <span>Exporting...</span>
      {:else}
        <Download class="h-4 w-4 mr-2 group-hover:translate-y-0.5 transition-transform" />
        <span>{buttonText}</span>
        <ChevronDown class="h-3 w-3 ml-1.5 opacity-50" />
      {/if}
    </Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="bg-card border-border text-foreground w-48">
    <DropdownMenu.Item onclick={handleExportPng} class="cursor-pointer">
      Export as Image (PNG)
    </DropdownMenu.Item>
    {#if scenarioId}
      <DropdownMenu.Item class="cursor-pointer p-0">
        <a href="/api/export/json?scenarioId={scenarioId}" download class="w-full h-full px-2 py-1.5 block hover:no-underline">
          Export as JSON Snapshot
        </a>
      </DropdownMenu.Item>
      <DropdownMenu.Item class="cursor-pointer p-0">
        <a href="/api/export/csv?scenarioId={scenarioId}" download class="w-full h-full px-2 py-1.5 block hover:no-underline">
          Export as CSV Table
        </a>
      </DropdownMenu.Item>
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
