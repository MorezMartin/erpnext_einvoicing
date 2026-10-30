<script setup>
import { ref, computed } from "vue";
import { __ } from "../utils.js";
import { DATE_PRESETS } from "../composables/useDateRange.js";

/*** Props / Emits ***/
const props = defineProps({
	preset: { type: String, default: "all" },
	from: { type: String, default: "" },
	to: { type: String, default: "" },
});
const emit = defineEmits(["apply"]);

/*** State ***/
const isOpen = ref(false);
const pendingPreset = ref(props.preset);
const pendingFrom = ref("");
const pendingTo = ref("");

/*** Computed ***/
const label = computed(() => {
	if (props.preset === "custom" && props.from && props.to) {
		return `${frappe.datetime.str_to_user(props.from)} » ${frappe.datetime.str_to_user(
			props.to
		)}`;
	}
	const preset = DATE_PRESETS.find((p) => p.key === props.preset);
	return preset ? __(preset.label) : __("All dates");
});

/*** Actions ***/
function open() {
	pendingPreset.value = props.preset;
	pendingFrom.value = props.from;
	pendingTo.value = props.to;
	isOpen.value = true;
}

function apply() {
	isOpen.value = false;
	emit("apply", {
		preset: pendingPreset.value,
		from: pendingFrom.value,
		to: pendingTo.value,
	});
}

function close() {
	isOpen.value = false;
}
</script>

<template>
	<div style="position: relative">
		<button
			class="btn btn-sm btn-default"
			style="font-size: 12px; display: flex; align-items: center; gap: 6px"
			@click="open"
		>
			<i class="fa fa-calendar" style="color: #888"></i>
			{{ label }}
			<i class="fa fa-caret-down" style="color: #888; font-size: 10px"></i>
		</button>

		<!-- Dropdown -->
		<div
			v-if="isOpen"
			style="
				position: absolute;
				top: calc(100% + 6px);
				right: 0;
				z-index: 1000;
				background: #fff;
				border: 1px solid #d1d8dd;
				border-radius: 8px;
				box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
				display: flex;
				min-width: 480px;
			"
		>
			<!-- Presets -->
			<div style="width: 180px; border-right: 1px solid #f0f0f0; padding: 8px 0">
				<div
					v-for="preset in DATE_PRESETS"
					:key="preset.key"
					@click="pendingPreset = preset.key"
					style="
						padding: 8px 16px;
						cursor: pointer;
						font-size: 13px;
						border-radius: 4px;
						margin: 0 6px;
					"
					:style="
						pendingPreset === preset.key
							? 'background: #e8f4f0; color: #2490ef; font-weight: 500'
							: 'color: #333'
					"
				>
					{{ __(preset.label) }}
				</div>
			</div>

			<!-- Right side -->
			<div
				style="
					flex: 1;
					padding: 16px;
					display: flex;
					flex-direction: column;
					justify-content: space-between;
				"
			>
				<!-- Custom inputs -->
				<div v-if="pendingPreset === 'custom'">
					<div
						style="
							font-size: 12px;
							color: #888;
							margin-bottom: 12px;
							text-transform: uppercase;
							letter-spacing: 0.5px;
						"
					>
						{{ __("Date range") }}
					</div>
					<div style="display: flex; align-items: center; gap: 8px">
						<div style="flex: 1">
							<div style="font-size: 11px; color: #aaa; margin-bottom: 4px">
								{{ __("From") }}
							</div>
							<input
								v-model="pendingFrom"
								type="date"
								class="form-control form-control-sm"
								style="font-size: 12px"
							/>
						</div>
						<div style="color: #ccc; margin-top: 16px">&raquo;</div>
						<div style="flex: 1">
							<div style="font-size: 11px; color: #aaa; margin-bottom: 4px">
								{{ __("To") }}
							</div>
							<input
								v-model="pendingTo"
								type="date"
								class="form-control form-control-sm"
								style="font-size: 12px"
							/>
						</div>
					</div>
				</div>

				<!-- Preset summary -->
				<div v-else style="color: #aaa; font-size: 13px; padding-top: 8px">
					{{ __(DATE_PRESETS.find((p) => p.key === pendingPreset)?.label || "") }}
				</div>

				<!-- Footer -->
				<div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px">
					<button class="btn btn-sm btn-default" @click="close">
						{{ __("Cancel") }}
					</button>
					<button class="btn btn-sm btn-primary" style="min-width: 80px" @click="apply">
						{{ __("Apply") }}
					</button>
				</div>
			</div>
		</div>

		<!-- Backdrop -->
		<div v-if="isOpen" style="position: fixed; inset: 0; z-index: 999" @click="close"></div>
	</div>
</template>
