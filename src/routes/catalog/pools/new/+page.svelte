<script lang="ts">
  import PoolForm from '$lib/components/catalog/PoolForm.svelte';

  let { data } = $props();
</script>

<PoolForm services={data.services} action="?/createPoolTier" />
