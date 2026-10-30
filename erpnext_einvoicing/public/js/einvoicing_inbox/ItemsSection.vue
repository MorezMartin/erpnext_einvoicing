<script setup>
import { __, formatCurrency } from "../einvoicing_common/utils.js";
import { isLocked, supplierReady, poStatusIcon } from "./inbox_helpers.js";

/*** Props / Emits ***/
defineProps({
	invoice: { type: Object, required: true },
	expanded: { type: Boolean, default: false },
});
const emit = defineEmits(["changed", "toggle"]);

/*** Item matching ***/

function promptMatchItem(invoice, item) {
	frappe.prompt(
		[
			{
				fieldname: "matched_item",
				fieldtype: "Link",
				options: "Item",
				label: __("Select Item"),
				reqd: 1,
				get_query: () => ({
					filters: { is_purchase_item: 1 },
				}),
			},
		],
		async (values) => {
			const siblings = await frappe.call({
				method: "erpnext_einvoicing.providers.sync.count_similar_unmatched",
				args: { name: invoice.name, match_type: "item", item_idx: item.idx },
			});
			const count = siblings.message?.count || 0;

			const doMatch = async (apply_to_all) => {
				await frappe.call({
					method: "erpnext_einvoicing.providers.sync.match_item",
					args: {
						name: invoice.name,
						item_idx: item.idx,
						matched_item: values.matched_item,
						apply_to_all,
					},
				});
				emit("changed");
			};

			if (count > 0) {
				frappe.confirm(
					__("Apply this item to {0} other line(s) with the same supplier reference?", [
						count,
					]),
					() => doMatch(1),
					() => doMatch(0)
				);
			} else {
				await doMatch(0);
			}
		},
		__("Match Item: {0}", [item.item_description_raw]),
		__("Confirm")
	);
}

async function rematchItems(invoice) {
	await frappe.call({
		method: "erpnext_einvoicing.providers.sync.rematch_items",
		args: { name: invoice.name },
	});
	frappe.show_alert({ message: __("Items re-matched"), indicator: "green" }, 3);
	emit("changed");
}

async function confirmDeleteMatchedItem(invoice, item) {
	const siblings = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.count_similar_unmatched",
		args: { name: invoice.name, match_type: "item_matched", item_idx: item.idx },
	});
	const count = siblings.message?.count || 0;

	const doUnlink = async (apply_to_all) => {
		await frappe.call({
			method: "erpnext_einvoicing.providers.sync.unlink_matched_item",
			args: { name: invoice.name, item_idx: item.idx, apply_to_all },
		});
		emit("changed");
	};

	if (count > 0) {
		frappe.confirm(
			__("Unlink this item from {0} other line(s) with the same supplier reference?", [
				count,
			]),
			() => doUnlink(1),
			() => doUnlink(0)
		);
	} else {
		await doUnlink(0);
	}
}

async function createItem(invoice, item) {
	frappe.prompt(
		[
			{
				fieldname: "item_name",
				fieldtype: "Data",
				label: __("Item Name"),
				default: item.item_description_raw,
				reqd: 1,
			},
			{
				fieldname: "item_group",
				fieldtype: "Link",
				options: "Item Group",
				label: __("Item Group"),
				reqd: 1,
			},
		],
		async (values) => {
			const r = await frappe.call({
				method: "erpnext_einvoicing.providers.sync.create_item",
				args: {
					name: invoice.name,
					item_idx: item.idx,
					item_name: values.item_name,
					item_group: values.item_group,
				},
			});
			const msg = r.message || {};
			if (msg.status === "ok") {
				frappe.show_alert(
					{ message: __("Item created: {0}", [msg.item]), indicator: "green" },
					4
				);
				emit("changed");
			} else {
				frappe.msgprint({
					title: __("Error"),
					message: msg.error || __("Failed"),
					indicator: "red",
				});
			}
		},
		__("Create Item"),
		__("Create")
	);
}

/*** Tax ***/

function editItemTaxRate(invoice, item) {
	frappe.prompt(
		[
			{
				fieldname: "account_head",
				fieldtype: "Link",
				options: "Account",
				label: __("Tax Account"),
				reqd: 1,
				default: item.tax_account_head || "",
				get_query: () => ({
					filters: {
						company: invoice.company,
						account_type: "Tax",
						root_type: "Asset",
					},
				}),
			},
		],
		async (values) => {
			const doUpdate = async (apply_to_all) => {
				await frappe.call({
					method: "erpnext_einvoicing.providers.sync.update_item_tax_rate",
					args: {
						name: invoice.name,
						item_idx: item.idx,
						account_head: values.account_head,
						apply_to_all,
					},
				});
				emit("changed");
			};

			if (!invoice.matched_supplier) {
				await doUpdate(0);
				return;
			}

			const siblings = await frappe.call({
				method: "erpnext_einvoicing.providers.sync.count_similar_tax_items",
				args: {
					name: invoice.name,
					tax_rate: item.tax_rate,
				},
			});
			const count = siblings.message?.count || 0;

			if (count > 0) {
				frappe.confirm(
					__(
						"Apply this tax account to {0} other item(s) with the same supplier and tax rate?",
						[count]
					),
					() => doUpdate(1),
					() => doUpdate(0)
				);
			} else {
				await doUpdate(0);
			}
		},
		__("Edit Tax Account"),
		__("Save")
	);
}

/*** PO / PR lines ***/

async function promptSelectPO(invoice, item) {
	const r = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.get_po_candidates",
		args: { name: invoice.name, item_idx: item.idx },
	});
	const candidates = r.message || [];
	if (!candidates.length) {
		frappe.show_alert(
			{ message: __("No Purchase Order found for this item"), indicator: "orange" },
			4
		);
		return;
	}
	const d = new frappe.ui.Dialog({
		title: __("Select Purchase Order Line"),
		fields: candidates.map((c, i) => ({
			fieldname: `po_${i}`,
			fieldtype: "HTML",
			options: `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border:1px solid #f0f0f0;border-radius:4px;margin-bottom:6px;cursor:pointer"
                data-idx="${i}"
                onclick="this.closest('.modal-body').querySelectorAll('[data-idx]').forEach(el=>el.style.background='');this.style.background='#e8f4f0';window._selectedPOIdx=${i}">
                <span style="font-weight:500">${c.parent}</span>
                <span style="color:#888;font-size:12px">${c.item_name}</span>
                <span style="color:#333;font-size:12px">${__("Remaining")}: <b>${
				c.remaining_qty
			}</b></span>
            </div>`,
		})),
		primary_action_label: __("Link"),
		primary_action: async () => {
			const idx = window._selectedPOIdx;
			if (idx === undefined || idx === null) {
				frappe.show_alert({ message: __("Please select a line"), indicator: "orange" }, 3);
				return;
			}
			const selected = candidates[idx];
			await frappe.call({
				method: "erpnext_einvoicing.providers.sync.match_item_po",
				args: {
					name: invoice.name,
					item_idx: item.idx,
					purchase_order: selected.parent,
					po_detail: selected.name,
				},
			});
			d.hide();
			window._selectedPOIdx = null;
			emit("changed");
		},
	});
	d.show();
}

async function promptSelectPR(invoice, item) {
	const r = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.get_pr_candidates",
		args: { name: invoice.name, item_idx: item.idx },
	});
	const candidates = r.message || [];
	if (!candidates.length) {
		frappe.show_alert(
			{ message: __("No Purchase Receipt found for this item"), indicator: "orange" },
			4
		);
		return;
	}
	const d = new frappe.ui.Dialog({
		title: __("Select Purchase Receipt Line"),
		fields: candidates.map((c, i) => ({
			fieldname: `pr_${i}`,
			fieldtype: "HTML",
			options: `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border:1px solid #f0f0f0;border-radius:4px;margin-bottom:6px;cursor:pointer"
                data-idx="${i}"
                onclick="this.closest('.modal-body').querySelectorAll('[data-idx]').forEach(el=>el.style.background='');this.style.background='#e8f4f0';window._selectedPRIdx=${i}">
                <span style="font-weight:500">${c.parent}</span>
                <span style="color:#888;font-size:12px">${c.item_name}</span>
                <span style="color:#333;font-size:12px">${__("Remaining")}: <b>${
				c.remaining_qty
			}</b></span>
            </div>`,
		})),
		primary_action_label: __("Link"),
		primary_action: async () => {
			const idx = window._selectedPRIdx;
			if (idx === undefined || idx === null) {
				frappe.show_alert({ message: __("Please select a line"), indicator: "orange" }, 3);
				return;
			}
			const selected = candidates[idx];
			await frappe.call({
				method: "erpnext_einvoicing.providers.sync.match_item_pr",
				args: {
					name: invoice.name,
					item_idx: item.idx,
					purchase_receipt: selected.parent,
					pr_detail: selected.name,
				},
			});
			d.hide();
			window._selectedPRIdx = null;
			emit("changed");
		},
	});
	d.show();
}

async function unlinkItemPO(invoice, item) {
	await frappe.call({
		method: "erpnext_einvoicing.providers.sync.unlink_item_po",
		args: { name: invoice.name, item_idx: item.idx },
	});
	emit("changed");
}

async function unlinkItemPR(invoice, item) {
	await frappe.call({
		method: "erpnext_einvoicing.providers.sync.unlink_item_pr",
		args: { name: invoice.name, item_idx: item.idx },
	});
	emit("changed");
}
</script>

<template>
	<div style="padding: 0; background: #fafafa">
		<div
			style="
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 10px 16px;
				cursor: pointer;
				user-select: none;
			"
			@click="emit('toggle')"
		>
			<span
				style="
					font-size: 12px;
					color: #888;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				"
			>
				{{ __("Items") }} ({{ invoice.items?.length || 0 }})
			</span>
			<i
				:class="['fa', expanded ? 'fa-chevron-up' : 'fa-chevron-down']"
				style="color: #888"
			></i>
		</div>

		<div v-if="expanded" style="padding: 0 16px 12px">
			<div
				v-for="item in invoice.items"
				:key="item.idx"
				style="
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 6px 0;
					border-top: 1px solid #f5f5f5;
				"
			>
				<div style="flex: 1">
					<!-- Main line -->
					<div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px">
						<span style="font-weight: 500">{{ item.item_description_raw }}</span>
						<span v-if="item.item_ref_raw" style="color: #888; font-size: 12px">
							- {{ item.item_ref_raw }} -
						</span>
						<span style="color: #666; font-size: 12px">
							{{ item.qty }} ×
							{{ formatCurrency(item.unit_price, invoice.currency) }}
						</span>
						<span style="font-size: 11px; color: #aaa; margin-left: 8px">
							<span v-if="item.tax_account_name">
								{{ item.tax_account_name }}
								<span style="opacity: 0.6">({{ item.tax_rate }}%)</span>
							</span>
							<span v-else-if="item.tax_rate">TVA {{ item.tax_rate }}%</span>
							<span v-else>{{ __("No tax") }}</span>
							<i
								v-if="!isLocked(invoice) && supplierReady(invoice)"
								class="fa fa-pencil"
								style="cursor: pointer; margin-left: 6px"
								@click="editItemTaxRate(invoice, item)"
							></i>
						</span>
					</div>

					<!-- PO/PR line - matched items only -->
					<div
						v-if="item.match_status === 'matched'"
						style="display: flex; align-items: center; gap: 16px; margin-top: 4px"
					>
						<!-- PO -->
						<span
							style="display: flex; align-items: center; gap: 4px; font-size: 11px"
						>
							<i
								:class="poStatusIcon(item.po_match_status).icon"
								:style="`color: ${
									poStatusIcon(item.po_match_status).color
								}; font-size: 11px`"
							></i>
							<template
								v-if="
									item.po_match_status === 'matched' ||
									item.po_match_status === 'partial'
								"
							>
								<a
									:href="`/app/purchase-order/${item.purchase_order}`"
									target="_blank"
									style="color: #666; font-size: 11px"
								>
									{{ item.purchase_order }}
								</a>
								<span
									v-if="item.po_match_status === 'partial'"
									style="color: #5bc0de; font-size: 10px"
									:title="__('Quantity differs from PO line')"
								>
									{{ __("Partial") }}
								</span>
								<i
									v-if="!isLocked(invoice)"
									class="fa fa-times"
									style="color: #ccc; cursor: pointer; font-size: 10px"
									@click.stop="unlinkItemPO(invoice, item)"
								></i>
							</template>
							<template v-else-if="item.po_match_status === 'ambiguous'">
								<template v-if="invoice.purchase_order">
									<a
										:href="`/app/purchase-order/${invoice.purchase_order}`"
										target="_blank"
										style="color: #666; font-size: 11px"
									>
										{{ invoice.purchase_order }}
									</a>
									<span style="color: #aaa; font-size: 10px">{{
										__("(header)")
									}}</span>
								</template>
								<button
									v-else-if="!isLocked(invoice)"
									class="btn btn-xs btn-warning"
									style="font-size: 10px; padding: 1px 6px"
									@click.stop="promptSelectPO(invoice, item)"
								>
									{{ __("Select PO") }}
								</button>
							</template>
							<template v-else>
								<span style="color: #ccc; font-size: 11px">{{ __("No PO") }}</span>
								<button
									v-if="item.match_status === 'matched' && !isLocked(invoice)"
									class="btn btn-xs btn-default"
									style="font-size: 10px; padding: 1px 6px; margin-left: 2px"
									@click.stop="promptSelectPO(invoice, item)"
									:disabled="invoice.supplier_match_status === 'unmatched'"
								>
									<i class="fa fa-link"></i>
								</button>
							</template>
						</span>

						<!-- PR -->
						<span
							style="display: flex; align-items: center; gap: 4px; font-size: 11px"
						>
							<i
								:class="poStatusIcon(item.pr_match_status).icon"
								:style="`color: ${
									poStatusIcon(item.pr_match_status).color
								}; font-size: 11px`"
							></i>
							<template
								v-if="
									item.pr_match_status === 'matched' ||
									item.pr_match_status === 'partial'
								"
							>
								<a
									:href="`/app/purchase-receipt/${item.purchase_receipt}`"
									target="_blank"
									style="color: #666; font-size: 11px"
								>
									{{ item.purchase_receipt }}
								</a>
								<span
									v-if="item.pr_match_status === 'partial'"
									style="color: #5bc0de; font-size: 10px"
									:title="__('Quantity differs from PR line')"
								>
									{{ __("Partial") }}
								</span>
								<i
									v-if="!isLocked(invoice)"
									class="fa fa-times"
									style="color: #ccc; cursor: pointer; font-size: 10px"
									@click.stop="unlinkItemPR(invoice, item)"
								></i>
							</template>
							<template v-else-if="item.pr_match_status === 'ambiguous'">
								<template v-if="invoice.purchase_receipt">
									<a
										:href="`/app/purchase-receipt/${invoice.purchase_receipt}`"
										target="_blank"
										style="color: #666; font-size: 11px"
									>
										{{ invoice.purchase_receipt }}
									</a>
									<span style="color: #aaa; font-size: 10px">{{
										__("(header)")
									}}</span>
								</template>
								<button
									v-else-if="!isLocked(invoice)"
									class="btn btn-xs btn-warning"
									style="font-size: 10px; padding: 1px 6px"
									@click.stop="promptSelectPR(invoice, item)"
								>
									{{ __("Select PR") }}
								</button>
							</template>
							<template v-else>
								<span style="color: #ccc; font-size: 11px">{{ __("No PR") }}</span>
								<button
									v-if="item.match_status === 'matched' && !isLocked(invoice)"
									class="btn btn-xs btn-default"
									style="font-size: 10px; padding: 1px 6px; margin-left: 2px"
									@click.stop="promptSelectPR(invoice, item)"
									:disabled="invoice.supplier_match_status === 'unmatched'"
								>
									<i class="fa fa-link"></i>
								</button>
							</template>
						</span>
					</div>
				</div>

				<div style="display: flex; align-items: center; gap: 8px">
					<span
						:class="`indicator-pill ${
							{ unmatched: 'red', matched: 'green', created: 'blue' }[
								item.match_status
							] || 'grey'
						}`"
						style="font-size: 11px"
					>
						{{ __(item.match_status) }}
					</span>
					<template v-if="item.match_status !== 'unmatched'">
						<a
							:href="`/app/item/${item.matched_item}`"
							target="_blank"
							style="font-size: 12px"
						>
							{{ item.matched_item }}
						</a>
						<span
							v-if="!isLocked(invoice)"
							@click="confirmDeleteMatchedItem(invoice, item)"
							style="cursor: pointer"
						>
							<i class="fa fa-times" style="color: #c11d1d" aria-hidden="true"></i>
						</span>
					</template>
					<template v-else>
						<button
							v-if="!isLocked(invoice)"
							:disabled="!supplierReady(invoice)"
							class="btn btn-xs btn-default"
							@click="rematchItems(invoice)"
							:title="!supplierReady(invoice) ? __('Match a supplier first') : ''"
						>
							<i class="fa fa-refresh"></i>
						</button>
						<span
							v-if="!isLocked(invoice)"
							:title="!supplierReady(invoice) ? __('Match a supplier first') : ''"
							style="display: inline-block"
						>
							<button
								:disabled="!supplierReady(invoice)"
								class="btn btn-xs btn-default"
								@click="promptMatchItem(invoice, item)"
							>
								<i class="fa fa-link"></i> {{ __("Match") }}
							</button>
						</span>
						<span
							v-if="!isLocked(invoice)"
							:title="!supplierReady(invoice) ? __('Match a supplier first') : ''"
							style="display: inline-block"
						>
							<button
								:disabled="!supplierReady(invoice)"
								class="btn btn-xs btn-default"
								@click="createItem(invoice, item)"
							>
								<i class="fa fa-plus"></i> {{ __("Create") }}
							</button>
						</span>
					</template>
				</div>
			</div>
		</div>
	</div>
</template>
