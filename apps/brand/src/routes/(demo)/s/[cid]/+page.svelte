<script lang="ts">
	import { page } from '$app/state';
	import { Store } from '@sellery/ui';
</script>
<Store cid={page.params.cid!} back="/camps" />
