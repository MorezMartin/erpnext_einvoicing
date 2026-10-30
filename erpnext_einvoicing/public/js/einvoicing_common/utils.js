// Copyright (c) 2026, Scopen and contributors
// For license information, please see license.txt

/*** Translation ***/

export function __(text, replace) {
	if (window.__) {
		return window.__(text, replace);
	}
	return text;
}

/*** Formatting ***/

export function formatCurrency(amount, currency) {
	return new Intl.NumberFormat(frappe.boot.lang || "fr-FR", {
		style: "currency",
		currency: currency || "EUR",
	}).format(amount || 0);
}

export function formatDate(dateStr) {
	if (!dateStr) return "";
	return frappe.datetime.str_to_user(dateStr);
}
