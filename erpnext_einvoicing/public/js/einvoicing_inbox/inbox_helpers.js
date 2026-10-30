// Copyright (c) 2026, Scopen and contributors
// For license information, please see license.txt

import { __ } from "../einvoicing_common/utils.js";

/*** Status helpers ***/

export function isLocked(invoice) {
	return ["converted", "refused"].includes(invoice.conversion_status);
}

export function supplierReady(invoice) {
	return invoice.supplier_match_status === "matched" || !!invoice.ethirdparty_doc;
}

export function poStatusIcon(status) {
	if (status === "matched") return { icon: "fa fa-check-circle", color: "#5cb85c" };
	if (status === "partial") return { icon: "fa fa-info-circle", color: "#5bc0de" };
	if (status === "ambiguous") return { icon: "fa fa-exclamation-triangle", color: "#f0ad4e" };
	return { icon: "fa fa-circle-o", color: "#ddd" };
}

/*** Credit notes ***/

export function creditNoteWarning(invoice) {
	if (!invoice.is_credit_note) return null;
	if (!invoice.referenced_epurchase_invoice) return __("Referenced invoice not found");
	return null;
}

export function creditNoteBlockReason(invoice) {
	if (!invoice.is_credit_note) return null;
	const ref_status = invoice.ref_status;
	if (ref_status === "refused")
		return __("Referenced invoice {0} was refused - you must refuse this credit note", [
			invoice.referenced_invoice_number,
		]);
	if (ref_status === "pending" || ref_status === "ready")
		return __("Referenced invoice {0} must be accepted before processing this credit note", [
			invoice.referenced_invoice_number,
		]);
	return null;
}

/*** Conversion ***/

export function canConvert(invoice, buyingSettings) {
	if (invoice.is_credit_note && creditNoteBlockReason(invoice) !== null) return false;
	if (invoice.conversion_status !== "ready") return false;
	if (buyingSettings.po_required) {
		const hasPO =
			invoice.purchase_order ||
			invoice.items?.some((i) => i.purchase_order && i.match_status === "matched");
		if (!hasPO) return false;
	}
	if (buyingSettings.pr_required) {
		const hasPR =
			invoice.purchase_receipt ||
			invoice.items?.some((i) => i.purchase_receipt && i.match_status === "matched");
		if (!hasPR) return false;
	}
	return true;
}
