<script lang="ts">
  import ServiceForm from '$lib/components/catalog/ServiceForm.svelte';

  let { data } = $props();
</script>

<ServiceForm service={data.service} providers={data.providers} action="?/updateService" />
