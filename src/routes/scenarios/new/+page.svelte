<script lang="ts">
  import ScenarioWizard from '$lib/components/wizard/ScenarioWizard.svelte';
  let { data } = $props();
</script>

<ScenarioWizard {data} mode="create" action="?/createScenario" />
