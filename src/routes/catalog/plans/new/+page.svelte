<script lang="ts">
  import PlanForm from '$lib/components/catalog/PlanForm.svelte';

  let { data } = $props();
</script>

<PlanForm services={data.services} packs={data.packs} action="?/createPlan" />
