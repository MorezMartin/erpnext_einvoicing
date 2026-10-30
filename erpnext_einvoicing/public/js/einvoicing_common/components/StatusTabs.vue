<script setup>
import { computed } from "vue";
import { __ } from "../utils.js";

/*** Props / Emits ***/
const props = defineProps({
	modelValue: { type: String, required: true },
	tabs: { type: Array, required: true },
	counts: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["update:modelValue"]);

/*** Computed ***/
const normalizedTabs = computed(() =>
	props.tabs.map((tab) =>
		typeof tab === "string"
			? { key: tab, label: `${tab.charAt(0).toUpperCase()}${tab.slice(1)}` }
			: tab
	)
);
</script>

<template>
	<div class="btn-group">
		<button
			v-for="tab in normalizedTabs"
			:key="tab.key"
			:class="['btn btn-sm', modelValue === tab.key ? 'btn-primary' : 'btn-default']"
			@click="emit('update:modelValue', tab.key)"
		>
			{{ __(tab.label) }}
			<span v-if="counts[tab.key]" class="badge" style="margin-left: 4px">
				{{ counts[tab.key] }}
			</span>
		</button>
	</div>
</template>
