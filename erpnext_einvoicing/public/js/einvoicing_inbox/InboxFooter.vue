<script setup>
import { __ } from "../einvoicing_common/utils.js";
import { canConvert, creditNoteWarning, creditNoteBlockReason } from "./inbox_helpers.js";

/*** Props / Emits ***/
defineProps({
	invoice: { type: Object, required: true },
	buyingSettings: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);

/*** Conversion ***/

async function convertToPI(invoice) {
	frappe.confirm(__("Convert {0} to a Purchase Invoice draft?", [invoice.name]), async () => {
		const r = await frappe.call({
			method: "erpnext_einvoicing.providers.sync.convert_to_purchase_invoice",
			args: { name: invoice.name },
			freeze: true,
			freeze_message: __("Converting..."),
		});
		if (r.message) {
			frappe.show_alert(
				{
					message: __("Purchase Invoice {0} created", [r.message]),
					indicator: "green",
				},
				5
			);
			emit("changed");
		}
	});
}

async function cancelConversion(invoice) {
	frappe.confirm(
		__("Delete the linked Purchase Invoice draft and reset this invoice?"),
		async () => {
			const r = await frappe.call({
				method: "erpnext_einvoicing.providers.sync.cancel_conversion",
				args: { name: invoice.name },
			});
			const msg = r.message || {};
			if (msg.status === "ok") {
				frappe.show_alert({ message: __("Conversion cancelled"), indicator: "green" }, 3);
			} else {
				frappe.msgprint({ message: msg.error, indicator: "red" });
			}
			emit("changed");
		}
	);
}

/*** Refusal ***/

function promptRefuse(invoice) {
	if (invoice.is_credit_note) {
		const blockReason = creditNoteBlockReason(invoice);
		if (blockReason) {
			frappe.msgprint({
				message: blockReason,
				indicator: "orange",
				title: __("Action not allowed"),
			});
			return;
		}
	}
	frappe.prompt(
		[
			{
				fieldname: "reason_code",
				fieldtype: "Link",
				options: "eInvoicing Refusal Reason",
				label: __("Reason"),
				reqd: 1,
			},
			{
				fieldname: "reason_comment",
				fieldtype: "Small Text",
				label: __("Comment"),
			},
		],
		async (values) => {
			const r = await frappe.call({
				method: "erpnext_einvoicing.providers.sync.refuse_invoice",
				args: {
					name: invoice.name,
					reason_code: values.reason_code,
					reason_comment: values.reason_comment || null,
				},
				freeze: true,
				freeze_message: __("Sending refusal..."),
			});
			const msg = r.message || {};
			if (msg.status === "ok") {
				frappe.show_alert(
					{ message: __("Invoice successfully refused"), indicator: "green" },
					10
				);
				emit("changed");
			} else {
				frappe.msgprint({ message: msg.error || __("Failed"), indicator: "red" });
			}
		},
		__("Refuse Invoice"),
		__("Confirm Refusal")
	);
}
</script>

<template>
	<!-- Footer: pending or ready -->
	<div
		v-if="['pending', 'ready'].includes(invoice.conversion_status)"
		style="
			padding: 10px 16px;
			border-top: 1px solid #f0f0f0;
			display: flex;
			flex-direction: column;
			gap: 8px;
		"
	>
		<div
			v-if="
				invoice.is_credit_note &&
				(creditNoteBlockReason(invoice) || creditNoteWarning(invoice))
			"
			style="color: #888; font-size: 12px"
		>
			<i class="fa fa-exclamation-triangle" style="color: #f0ad4e"></i>
			{{ creditNoteBlockReason(invoice) || creditNoteWarning(invoice) }}
		</div>
		<div style="display: flex; justify-content: space-between; align-items: center">
			<button
				v-if="
					!(
						invoice.is_credit_note &&
						creditNoteBlockReason(invoice) &&
						invoice.ref_status !== 'refused'
					)
				"
				class="btn btn-sm btn-danger"
				@click="promptRefuse(invoice)"
			>
				<i class="fa fa-ban"></i> {{ __("Refuse") }}
			</button>
			<div>
				<span
					v-if="
						!canConvert(invoice, buyingSettings) &&
						invoice.conversion_status === 'ready'
					"
					style="color: #888; font-size: 12px; margin-right: 8px"
				>
					<i class="fa fa-exclamation-triangle"></i>
					{{
						buyingSettings.po_required &&
						!invoice.purchase_order &&
						!invoice.items?.some((i) => i.purchase_order)
							? __("Purchase Order required")
							: __("Purchase Receipt required")
					}}
				</span>
				<button
					v-if="canConvert(invoice, buyingSettings)"
					class="btn btn-sm btn-primary"
					@click="convertToPI(invoice)"
				>
					{{ __("Convert to Purchase Invoice") }}
					<i class="fa fa-arrow-circle-o-right"></i>
				</button>
			</div>
		</div>
	</div>

	<!-- Footer: converted -->
	<div
		v-if="invoice.conversion_status === 'converted'"
		style="padding: 10px 16px; border-top: 1px solid #f0f0f0; text-align: right"
	>
		<a
			v-if="invoice.purchase_invoice"
			:href="`/app/purchase-invoice/${invoice.purchase_invoice}`"
			target="_blank"
			class="btn btn-xs btn-default"
		>
			<i class="fa fa-file-text-o"></i> {{ invoice.purchase_invoice }}
		</a>
		<button
			v-if="invoice.last_lifecycle_log?.status_code === '204'"
			class="btn btn-xs btn-danger ml-1"
			@click="cancelConversion(invoice)"
		>
			<i class="fa fa-undo"></i> {{ __("Reset") }}
		</button>
	</div>

	<!-- Footer: refused -->
	<div
		v-if="invoice.conversion_status === 'refused'"
		style="padding: 10px 16px; border-top: 1px solid #f0f0f0; text-align: right"
	>
		<span class="indicator-pill red">{{ __("Refused") }}</span>
	</div>
</template>
