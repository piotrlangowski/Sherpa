<script lang="ts">
  import PackForm from '$lib/components/catalog/PackForm.svelte';

  let { data } = $props();
</script>

<PackForm pack={data.pack} services={data.services} action="?/updatePack" />
