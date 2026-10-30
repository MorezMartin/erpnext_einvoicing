<script setup>
/*** Props ***/
defineProps({
	label: { type: String, default: "" },
	gap: { type: String, default: "10px" },
});
</script>

<template>
	<div style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0">
		<div :style="`display: flex; align-items: center; gap: ${gap}; flex-wrap: wrap`">
			<span
				v-if="label"
				style="
					font-size: 12px;
					color: #888;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				"
			>
				{{ label }}
			</span>
			<slot />
		</div>
	</div>
</template>
