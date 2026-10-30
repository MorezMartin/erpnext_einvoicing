// Copyright (c) 2026, Scopen and contributors
// For license information, please see license.txt

import { ref, computed } from "vue";

/*** Presets ***/

export const DATE_PRESETS = [
	{ key: "all", label: "All dates" },
	{ key: "today", label: "Today" },
	{ key: "7", label: "Last 7 days" },
	{ key: "30", label: "Last 30 days" },
	{ key: "90", label: "Last 90 days" },
	{ key: "365", label: "Last 12 months" },
	{ key: "custom", label: "Custom" },
];

/*** Composable ***/

export function useDateRange(defaultPreset = "all") {
	const datePreset = ref(defaultPreset);
	const dateFrom = ref("");
	const dateTo = ref("");

	const dateRange = computed(() => {
		const today = frappe.datetime.get_today();
		if (datePreset.value === "all") return { date_from: null, date_to: null };
		if (datePreset.value === "today") return { date_from: today, date_to: today };
		if (datePreset.value === "custom")
			return { date_from: dateFrom.value || null, date_to: dateTo.value || null };
		const from = frappe.datetime.add_days(today, -parseInt(datePreset.value) + 1);
		return { date_from: from, date_to: today };
	});

	function setDateRange({ preset, from, to }) {
		datePreset.value = preset;
		dateFrom.value = from;
		dateTo.value = to;
	}

	return { datePreset, dateFrom, dateTo, dateRange, setDateRange };
}
