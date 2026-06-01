<script lang="ts">
  import PlanForm from '$lib/components/catalog/PlanForm.svelte';

  let { data } = $props();
</script>

<PlanForm plan={data.plan} services={data.services} packs={data.packs} action="?/updatePlan" />
