<script lang="ts">
  import PoolForm from '$lib/components/catalog/PoolForm.svelte';

  let { data } = $props();
</script>

<PoolForm pool={data.pool} services={data.services} action="?/updatePoolTier" />
