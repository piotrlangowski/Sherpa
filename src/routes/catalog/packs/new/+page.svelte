<script lang="ts">
  import PackForm from '$lib/components/catalog/PackForm.svelte';

  let { data } = $props();
</script>

<PackForm services={data.services} action="?/createPack" />
