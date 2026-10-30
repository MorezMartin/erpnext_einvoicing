// Copyright (c) 2026, Scopen and contributors
// For license information, please see license.txt

import { ref, nextTick } from "vue";

/*** Composable ***/

export function useInvoiceList(method, getArgs) {
	const invoices = ref([]);
	const loading = ref(false);

	async function fetchInvoices(silent = false) {
		const scrollY = window.scrollY;
		if (!silent) {
			loading.value = true;
		}
		try {
			const res = await frappe.call({ method, args: getArgs() });
			invoices.value = JSON.parse(JSON.stringify(res.message || []));
		} finally {
			if (!silent) {
				loading.value = false;
			} else {
				await nextTick();
				window.scrollTo(0, scrollY);
			}
		}
	}

	return { invoices, loading, fetchInvoices };
}
