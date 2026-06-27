<script lang="ts">
  import ScenarioWizard from '$lib/components/wizard/ScenarioWizard.svelte';
  let { data, form } = $props();
</script>

<ScenarioWizard {data} {form} mode="create" action="?/createScenario" />
