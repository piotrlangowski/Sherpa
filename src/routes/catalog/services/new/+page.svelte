<script lang="ts">
  import ServiceForm from '$lib/components/catalog/ServiceForm.svelte';

  let { data } = $props();
</script>

<ServiceForm providers={data.providers} action="?/createService" />
