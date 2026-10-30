<script setup>
import { computed } from "vue";
import { __ } from "../utils.js";

/*** Props / Emits ***/
const props = defineProps({
	log: { type: Object, required: true },
});
const emit = defineEmits(["refreshed"]);

/*** Computed ***/
const icon = computed(() => {
	if (props.log.ack_status === "ok") return "fa fa-check-circle";
	if (props.log.ack_status === "error") return "fa fa-exclamation-circle";
	return "fa fa-clock-o";
});

const iconColor = computed(() => {
	if (props.log.ack_status === "ok") return "#5cb85c";
	if (props.log.ack_status === "error") return "#d9534f";
	return "#aaa";
});

const tooltip = computed(() => {
	if (props.log.ack_status === "ok") return __("Acknowledged by platform");
	if (props.log.ack_status === "error" && props.log.error_type === "data")
		return (props.log.ack_message || "") + " - " + __("Data error (contact support)");
	if (props.log.ack_status === "error" && props.log.error_type === "platform")
		return (props.log.ack_message || "") + " - " + __("Platform error");
	return __("Pending acknowledgement");
});

/*** Actions ***/
async function refresh() {
	await frappe.call({
		method: "erpnext_einvoicing.providers.sync.poll_single_lifecycle_log",
		args: { log_name: props.log.name },
	});
	emit("refreshed");
}
</script>

<template>
	<span style="display: flex; align-items: center; gap: 4px; margin-left: 4px">
		<i
			:class="icon"
			:style="`color: ${iconColor}; opacity: 0.6; font-size: 11px`"
			:title="tooltip"
		></i>
		<span style="font-size: 11px; color: #bbb">
			[{{ log.status_code }}]
			{{ log.status_label }}
			<span v-if="log.ack_status === 'error'" style="font-size: 10px; color: #ccc">
				·
				{{ log.error_type === "data" ? __("Data error") : __("Platform error") }}
			</span>
		</span>
		<i
			v-if="log.ack_status !== 'ok'"
			class="fa fa-refresh"
			style="font-size: 10px; color: #ccc; cursor: pointer; margin-left: 2px"
			:title="__('Re-poll acknowledgement')"
			@click.stop="refresh"
		></i>
	</span>
</template>
