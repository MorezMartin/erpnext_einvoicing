<script setup>
import { __ } from "../einvoicing_common/utils.js";
import CardSection from "../einvoicing_common/components/CardSection.vue";
import { isLocked } from "./inbox_helpers.js";

/*** Props / Emits ***/
defineProps({
	invoice: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);

/*** Match ***/

function promptMatchSupplier(invoice) {
	frappe.prompt(
		[
			{
				fieldname: "matched_supplier",
				fieldtype: "Link",
				options: "Supplier",
				label: __("Select Supplier"),
				reqd: 1,
			},
		],
		async (values) => {
			const siblings = await frappe.call({
				method: "erpnext_einvoicing.providers.sync.count_similar_unmatched",
				args: { name: invoice.name, match_type: "supplier" },
			});
			const count = siblings.message?.count || 0;

			const doMatch = async (apply_to_all) => {
				const r = await frappe.call({
					method: "erpnext_einvoicing.providers.sync.match_supplier",
					args: {
						name: invoice.name,
						matched_supplier: values.matched_supplier,
						apply_to_all,
					},
				});
				const msg = r.message || {};
				if (msg.status === "warning") {
					frappe.msgprint({
						message: msg.message,
						indicator: "orange",
						title: __("Warning"),
					});
					return;
				}
				let message = __("Supplier matched: {0}", [values.matched_supplier]);
				if (msg.matched_items > 0) {
					message +=
						" - " +
						__("{0}/{1} item(s) matched", [msg.matched_items, msg.total_items]);
				}
				if (msg.conversion_status === "ready") {
					message += " - " + __("Invoice is ready to convert");
				}
				frappe.show_alert({ message, indicator: "green" }, 10);
				emit("changed");
			};

			if (count > 0) {
				frappe.confirm(
					__("Apply this supplier to {0} other invoice(s) with the same SIRET?", [
						count,
					]),
					() => doMatch(1),
					() => doMatch(0)
				);
			} else {
				await doMatch(0);
			}
		},
		__("Match Supplier"),
		__("Confirm")
	);
}

async function rematchSupplier(invoice) {
	const r = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.rematch_supplier",
		args: { name: invoice.name },
	});
	const msg = r.message || {};
	if (msg.status === "warning") {
		frappe.msgprint({ message: msg.message, indicator: "orange", title: __("Warning") });
		return;
	}
	if (msg.status === "ok") {
		let message = __("Supplier matched: {0}", [msg.supplier]);
		if (msg.matched_items > 0) {
			message += " - " + __("{0}/{1} item(s) matched", [msg.matched_items, msg.total_items]);
		}
		if (msg.conversion_status === "ready") {
			message += " - " + __("Invoice is ready to convert");
		}
		frappe.show_alert({ message, indicator: "green" }, 10);
	} else {
		frappe.show_alert({ message: __("No supplier found"), indicator: "orange" }, 3);
	}
	emit("changed");
}

async function confirmDeleteMatchedSupplier(invoice) {
	const siblings = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.count_similar_unmatched",
		args: { name: invoice.name, match_type: "supplier_matched" },
	});
	const count = siblings.message?.count || 0;

	const doUnlink = async (apply_to_all) => {
		await frappe.call({
			method: "erpnext_einvoicing.providers.sync.unlink_matched_supplier",
			args: { name: invoice.name, apply_to_all },
		});
		emit("changed");
	};

	if (count > 0) {
		frappe.confirm(
			__("Unlink this supplier from {0} other invoice(s) with the same SIRET?", [count]),
			() => doUnlink(1),
			() => doUnlink(0)
		);
	} else {
		await doUnlink(0);
	}
}

/*** SIRENE / eThirdParty ***/

async function enrichFromSiret(invoice) {
	const r = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.enrich_from_siret",
		args: { name: invoice.name },
		freeze: true,
		freeze_message: __("Looking up SIRET..."),
	});
	const msg = r.message || {};

	if (msg.status === "not_found") {
		frappe.show_alert(
			{ message: __("No company found for this SIRET"), indicator: "orange" },
			5
		);
		const data = msg.data || {};
		frappe.ui.form.make_quick_entry("Supplier", async (doc) => {
			await frappe.call({
				method: "erpnext_einvoicing.providers.sync.match_supplier",
				args: { name: invoice.name, matched_supplier: doc.name },
			});
			emit("changed");
		});
		setTimeout(() => {
			const dialog = frappe.quick_entry?.dialog;
			if (dialog) {
				dialog.set_value("supplier_name", data.party_name || invoice.supplier_name_raw);
				dialog.set_value("tax_id", data.siret || invoice.supplier_siret);
				dialog.set_value("siret", data.siret || invoice.supplier_siret);
				dialog.set_value("siren", (data.siret || invoice.supplier_siret)?.substring(0, 9));
			}
		}, 300);
		return;
	}

	if (msg.status === "error") {
		frappe.msgprint({ title: __("Error"), message: msg.error, indicator: "red" });
		return;
	}

	const data = msg.data || {};
	const missingFields = msg.missing_fields || [];

	const supportsSetIntro = typeof frappe.ui.Dialog.prototype.set_intro === "function";
	const sirenFields = [];
	if (missingFields.length && !supportsSetIntro) {
		sirenFields.push({
			fieldtype: "HTML",
			options: `<div class="alert alert-warning" style="padding:8px">${__(
				"Warning: some fields need your attention: {0}",
				[missingFields.join(", ")]
			)}</div>`,
		});
	}

	const customFieldsRes = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.get_mandatory_supplier_custom_fields",
	});
	const mandatoryCustomFields = (customFieldsRes.message || []).map((f) => ({
		fieldname: f.fieldname,
		fieldtype: f.fieldtype,
		label: __(f.label),
		options: f.options || null,
		default: data[f.fieldname] || null,
		reqd: 1,
	}));
	const d = new frappe.ui.Dialog({
		title: __("Confirm Supplier Data"),
		fields: [
			...sirenFields,
			{
				fieldname: "party_name",
				fieldtype: "Data",
				label: __("Official Name"),
				default: data.party_name,
				reqd: 1,
			},
			{
				fieldname: "address_line1",
				fieldtype: "Data",
				label: __("Address"),
				default: data.address_line1,
			},
			{ fieldname: "zip", fieldtype: "Data", label: __("ZIP"), default: data.zip },
			{ fieldname: "city", fieldtype: "Data", label: __("City"), default: data.city },
			{
				fieldname: "country_code",
				fieldtype: "Data",
				label: __("Country Code"),
				default: data.country_code,
			},
			{ fieldname: "col", fieldtype: "Column Break" },
			{
				fieldname: "supplier_group",
				fieldtype: "Link",
				options: "Supplier Group",
				label: __("Supplier Group"),
				reqd: 1,
			},
			...mandatoryCustomFields,
		],
		primary_action_label: __("Save"),
		primary_action: async (values) => {
			const siblings = await frappe.call({
				method: "erpnext_einvoicing.providers.sync.count_similar_unmatched",
				args: { name: invoice.name, match_type: "supplier" },
			});
			const count = siblings.message?.count || 0;

			const doSave = async (apply_to_all) => {
				const r2 = await frappe.call({
					method: "erpnext_einvoicing.providers.sync.save_ethirdparty",
					args: {
						invoice_name: invoice.name,
						data: { ...data, ...values },
						supplier_group: values.supplier_group,
						apply_to_all,
					},
				});
				if (r2.message?.status === "ok") {
					frappe.show_alert(
						{ message: __("Supplier data saved"), indicator: "green" },
						4
					);
					d.hide();
					emit("changed");
				}
			};

			if (count > 0) {
				frappe.confirm(
					__("Apply this supplier to {0} other invoice(s) with the same SIRET?", [
						count,
					]),
					() => doSave(1),
					() => doSave(0)
				);
			} else {
				await doSave(0);
			}
		},
	});

	if (missingFields.length && supportsSetIntro) {
		d.set_intro(
			__("Warning: some fields need your attention: {0}", [missingFields.join(", ")]),
			"orange"
		);
	}

	d.show();
}

function promptEditEThirdParty(invoice, ethirdparty, missingFields) {
	const supportsSetIntro = typeof frappe.ui.Dialog.prototype.set_intro === "function";
	const ethirdpartyFields = [];
	if (missingFields?.length && !supportsSetIntro) {
		ethirdpartyFields.push({
			fieldtype: "HTML",
			options: `<div class="alert alert-warning" style="padding:8px">${__(
				"Missing required fields: {0}",
				[missingFields.join(", ")]
			)}</div>`,
		});
	}

	const d = new frappe.ui.Dialog({
		title: __("Review eThirdParty Data"),
		fields: [
			...ethirdpartyFields,
			{
				fieldname: "party_name",
				fieldtype: "Data",
				label: __("Official Name"),
				default: ethirdparty.party_name,
				reqd: 1,
			},
			{ fieldname: "zip", fieldtype: "Data", label: __("ZIP"), default: ethirdparty.zip },
			{ fieldname: "city", fieldtype: "Data", label: __("City"), default: ethirdparty.city },
			{
				fieldname: "country_code",
				fieldtype: "Data",
				label: __("Country Code"),
				default: ethirdparty.country_code,
			},
			{ fieldname: "col", fieldtype: "Column Break" },
			{
				fieldname: "supplier_group",
				fieldtype: "Link",
				options: "Supplier Group",
				label: __("Supplier Group"),
				default: ethirdparty.supplier_group,
				reqd: 1,
			},
		],
		primary_action_label: __("Save"),
		async primary_action(values) {
			await frappe.call({
				method: "erpnext_einvoicing.providers.sync.update_ethirdparty",
				args: { name: ethirdparty.name, data: values },
			});
			d.hide();
			emit("changed");
		},
	});

	if (missingFields?.length && supportsSetIntro) {
		d.set_intro(__("Missing required fields: {0}", [missingFields.join(", ")]), "orange");
	}

	d.show();
}

async function unlinkEThirdParty(invoice) {
	const siblings = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.count_similar_unmatched",
		args: { name: invoice.name, match_type: "supplier_matched" },
	});
	const count = siblings.message?.count || 0;

	const doUnlink = async (apply_to_all) => {
		await frappe.call({
			method: "erpnext_einvoicing.providers.sync.unlink_ethirdparty",
			args: { name: invoice.name, apply_to_all },
		});
		emit("changed");
	};

	if (count > 0) {
		frappe.confirm(
			__("Unlink this eThirdParty from {0} other invoice(s) with the same SIRET?", [count]),
			() => doUnlink(1),
			() => doUnlink(0)
		);
	} else {
		await doUnlink(0);
	}
}
</script>

<template>
	<CardSection :label="__('Supplier')">
		<span style="font-weight: 500">{{ invoice.supplier_name_raw }}</span>
		<span v-if="invoice.supplier_siret" style="color: #888; font-size: 12px">
			SIRET: {{ invoice.supplier_siret }}
		</span>
		<span v-else-if="invoice.supplier_siren" style="color: #888; font-size: 12px">
			SIREN: {{ invoice.supplier_siren }}
		</span>
		<span
			:class="`indicator-pill ${
				{
					unmatched: 'red',
					matched: 'green',
					ethirdparty: 'orange',
					created: 'blue',
				}[invoice.supplier_match_status] || 'grey'
			}`"
			style="font-size: 11px"
		>
			{{ __(invoice.supplier_match_status) }}
		</span>

		<!-- Badge SIRENE status -->
		<span
			v-if="invoice.sirene_status && invoice.sirene_status !== 'not_found'"
			:class="`indicator-pill ${invoice.sirene_status === 'ok' ? 'green' : 'orange'}`"
			style="font-size: 11px; cursor: pointer"
			@click="enrichFromSiret(invoice)"
			:title="__('Click to review')"
		>
			SIRENE
			<i
				:class="
					invoice.sirene_status === 'warning'
						? 'fa fa-exclamation-triangle'
						: 'fa fa-check'
				"
			></i>
		</span>

		<template v-if="!isLocked(invoice)">
			<!-- Supplier matched -->
			<template v-if="invoice.supplier_match_status === 'matched'">
				<i class="fa fa-link" style="color: green"></i>
				<a :href="`/app/supplier/${invoice.matched_supplier}`" target="_blank">{{
					invoice.matched_supplier
				}}</a>
				<span @click="confirmDeleteMatchedSupplier(invoice)" style="cursor: pointer">
					<i class="fa fa-times" style="color: #c11d1d"></i>
				</span>
			</template>

			<!-- eThirdParty -->
			<template v-else-if="invoice.ethirdparty_doc">
				<i class="fa fa-user-o" style="color: #6c757d"></i>
				<a :href="`/app/ethirdparty/${invoice.ethirdparty_doc.name}`" target="_blank">
					<span>{{
						invoice.ethirdparty_doc.party_name || invoice.supplier_name_raw
					}}</span>
				</a>
				<button
					v-if="invoice.ethirdparty_doc.status === 'warning'"
					class="btn btn-xs btn-warning"
					@click="promptEditEThirdParty(invoice, invoice.ethirdparty_doc, [])"
				>
					<i class="fa fa-edit"></i> {{ __("Edit") }}
				</button>
				<span @click="unlinkEThirdParty(invoice)" style="cursor: pointer">
					<i class="fa fa-times" style="color: #c11d1d"></i>
				</span>
			</template>

			<!-- Unmatched -->
			<template v-else>
				<button class="btn btn-xs btn-default" @click="rematchSupplier(invoice)">
					<i class="fa fa-refresh"></i> {{ __("Check") }}
				</button>
				<button class="btn btn-xs btn-default" @click="promptMatchSupplier(invoice)">
					<i class="fa fa-link"></i> {{ __("Match") }}
				</button>
				<button
					v-if="invoice.supplier_siret || invoice.supplier_siren"
					class="btn btn-xs btn-default"
					@click="enrichFromSiret(invoice)"
				>
					<i class="fa fa-search"></i> {{ __("SIRENE") }}
				</button>
				<span
					v-if="invoice.sirene_status === 'not_found'"
					class="indicator-pill red"
					style="font-size: 11px"
				>
					SIRENE <i class="fa fa-close"></i>
				</span>
			</template>
		</template>
	</CardSection>
</template>
