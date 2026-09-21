<script lang="ts">
	import { page } from '$app/state';
	import { CampaignDetail } from '@sellery/ui';
</script>
<CampaignDetail cid={page.params.cid!} back="/" />
