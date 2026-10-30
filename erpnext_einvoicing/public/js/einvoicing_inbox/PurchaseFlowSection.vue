<script setup>
import { __ } from "../einvoicing_common/utils.js";
import CardSection from "../einvoicing_common/components/CardSection.vue";
import { isLocked, supplierReady } from "./inbox_helpers.js";

/*** Props / Emits ***/
defineProps({
	invoice: { type: Object, required: true },
	buyingSettings: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);

/*** Purchase Order ***/

function promptLinkPO(invoice) {
	if (invoice.supplier_match_status === "ethirdparty") {
		frappe.confirm(
			__(
				"No Purchase Order available - supplier does not exist in ERPNext yet. Convert supplier and create a Purchase Order?"
			),
			() => convertEthirdpartyAndCreatePO(invoice)
		);
		return;
	}
	frappe.prompt(
		[
			{
				fieldname: "purchase_order",
				fieldtype: "Link",
				options: "Purchase Order",
				label: __("Purchase Order"),
				reqd: 1,
				get_query: () => ({
					filters: {
						supplier: invoice.matched_supplier,
						status: ["in", ["To Receive and Bill", "Partially Billed"]],
					},
				}),
			},
		],
		async (values) => {
			await frappe.call({
				method: "erpnext_einvoicing.providers.sync.link_purchase_order",
				args: { name: invoice.name, purchase_order: values.purchase_order },
			});
			emit("changed");
		},
		__("Link Purchase Order"),
		__("Confirm")
	);
}

async function convertEthirdpartyAndCreatePO(invoice) {
	const r = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.convert_ethirdparty_for_po",
		args: { name: invoice.name },
		freeze: true,
		freeze_message: __("Converting supplier..."),
	});
	const result = r.message || {};
	if (result.status !== "ok") {
		frappe.msgprint({ message: result.error || __("Failed"), indicator: "red" });
		return;
	}
	frappe.show_alert(
		{ message: __("Supplier created: {0}", [result.supplier]), indicator: "green" },
		4
	);
	emit("changed");
	window.open(
		`/app/purchase-order/new-purchase-order-1?supplier=${encodeURIComponent(result.supplier)}`,
		"_blank"
	);
}

async function unlinkPO(invoice) {
	await frappe.call({
		method: "erpnext_einvoicing.providers.sync.unlink_purchase_order",
		args: { name: invoice.name },
	});
	emit("changed");
}

/*** Purchase Receipt ***/

function promptLinkPR(invoice) {
	frappe.prompt(
		[
			{
				fieldname: "purchase_receipt",
				fieldtype: "Link",
				options: "Purchase Receipt",
				label: __("Purchase Receipt"),
				reqd: 1,
				get_query: () => ({
					filters: {
						supplier: invoice.matched_supplier,
						status: ["in", ["To Bill", "Partly Billed"]],
					},
				}),
			},
		],
		async (values) => {
			await frappe.call({
				method: "erpnext_einvoicing.providers.sync.link_purchase_receipt",
				args: { name: invoice.name, purchase_receipt: values.purchase_receipt },
			});
			emit("changed");
		},
		__("Link Purchase Receipt"),
		__("Confirm")
	);
}

async function unlinkPR(invoice) {
	await frappe.call({
		method: "erpnext_einvoicing.providers.sync.unlink_purchase_receipt",
		args: { name: invoice.name },
	});
	emit("changed");
}
</script>

<template>
	<CardSection
		v-if="buyingSettings.po_required || buyingSettings.pr_required"
		:label="__('Purchase Flow')"
		gap="16px"
	>
		<!-- PO -->
		<template v-if="buyingSettings.po_required">
			<span style="font-size: 12px">{{ __("PO") }}:</span>
			<template v-if="invoice.purchase_order">
				<a
					:href="`/app/purchase-order/${invoice.purchase_order}`"
					target="_blank"
					style="font-size: 12px"
				>
					{{ invoice.purchase_order }}
				</a>
				<span v-if="!isLocked(invoice)" @click="unlinkPO(invoice)" style="cursor: pointer">
					<i class="fa fa-times" style="color: #c11d1d"></i>
				</span>
			</template>
			<button
				v-else-if="!isLocked(invoice)"
				class="btn btn-xs btn-default"
				@click="promptLinkPO(invoice)"
				:disabled="invoice.supplier_match_status === 'unmatched'"
				:title="
					invoice.supplier_match_status === 'unmatched'
						? __('Match a supplier first')
						: ''
				"
			>
				<i class="fa fa-link"></i> {{ __("Link PO") }}
			</button>
		</template>

		<!-- PR -->
		<template v-if="buyingSettings.pr_required">
			<span style="font-size: 12px">{{ __("PR") }}:</span>
			<template v-if="invoice.purchase_receipt">
				<a
					:href="`/app/purchase-receipt/${invoice.purchase_receipt}`"
					target="_blank"
					style="font-size: 12px"
				>
					{{ invoice.purchase_receipt }}
				</a>
				<span v-if="!isLocked(invoice)" @click="unlinkPR(invoice)" style="cursor: pointer">
					<i class="fa fa-times" style="color: #c11d1d"></i>
				</span>
			</template>
			<button
				v-else-if="!isLocked(invoice)"
				class="btn btn-xs btn-warning"
				@click="promptLinkPR(invoice)"
				:disabled="!supplierReady(invoice)"
				:title="
					invoice.supplier_match_status === 'ethirdparty'
						? __(
								'Supplier is an eThirdParty - a matched ERPNext Supplier is required to link Receipts'
						  )
						: !invoice.matched_supplier
						? __('Match a supplier first')
						: ''
				"
			>
				<i class="fa fa-link"></i> {{ __("Link Receipt") }}
			</button>
		</template>
	</CardSection>
</template>
