<script setup>
import { ref, onMounted } from "vue";

/*** Props / Emits ***/
defineProps({
	modelValue: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

/*** State ***/
const companies = ref([]);

onMounted(async () => {
	const r = await frappe.call({
		method: "frappe.client.get_list",
		args: { doctype: "Company", fields: ["name"], limit: 100 },
	});
	companies.value = (r.message || []).map((c) => c.name);
});
</script>

<template>
	<select
		v-if="companies.length > 1"
		:value="modelValue"
		class="form-control form-control-sm"
		style="width: auto; font-size: 12px"
		@change="emit('update:modelValue', $event.target.value)"
	>
		<option v-for="c in companies" :key="c" :value="c">{{ c }}</option>
	</select>
</template>
