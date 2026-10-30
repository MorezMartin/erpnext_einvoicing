<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { __, formatCurrency, formatDate } from "../einvoicing_common/utils.js";
import { useDateRange } from "../einvoicing_common/composables/useDateRange.js";
import DateRangePicker from "../einvoicing_common/components/DateRangePicker.vue";
import StatusTabs from "../einvoicing_common/components/StatusTabs.vue";
import CompanySelect from "../einvoicing_common/components/CompanySelect.vue";
import { useInvoiceList } from "../einvoicing_common/composables/useInvoiceList.js";
import LifecycleBadge from "../einvoicing_common/components/LifecycleBadge.vue";
import InvoiceCard from "../einvoicing_common/components/InvoiceCard.vue";
import SupplierSection from "./SupplierSection.vue";
import PurchaseFlowSection from "./PurchaseFlowSection.vue";
import ItemsSection from "./ItemsSection.vue";
import InboxFooter from "./InboxFooter.vue";

/*** State ***/
const TABS = ["all", "pending", "ready", "converted", "refused"];
const pendingFlows = ref(0);
const pendingFlowsStatus = ref("ok");
const { invoices, loading, fetchInvoices } = useInvoiceList(
	"erpnext_einvoicing.providers.sync.get_einvoicing_inbox",
	() => ({
		date_from: dateRange.value.date_from,
		date_to: dateRange.value.date_to,
		company: company.value,
	})
);
const syncing = ref(false);
const filter = ref("pending");
const expanded = ref(new Set());
const company = ref(frappe.boot.user.defaults.company || "");
const defaultCompany = frappe.defaults.get_user_default("Company") || "";
const buyingSettings = ref({ po_required: false, pr_required: false });

const switchingTab = ref(false);
watch(filter, () => {
	switchingTab.value = true;
	nextTick(() => {
		switchingTab.value = false;
	});
});

watch(company, async () => {
	await fetchInvoices(true);
	await checkPendingFlows();
});

/*** Computed ***/

const filtered = computed(() => {
	if (filter.value === "all")
		return invoices.value.filter((i) => i.conversion_status !== "refused");
	return invoices.value.filter((inv) => inv.conversion_status === filter.value);
});

const counts = computed(() => ({
	pending: invoices.value.filter((i) => i.conversion_status === "pending").length,
	ready: invoices.value.filter((i) => i.conversion_status === "ready").length,
	converted: invoices.value.filter((i) => i.conversion_status === "converted").length,
	refused: invoices.value.filter((i) => i.conversion_status === "refused").length,
}));

const groupedInvoices = computed(() => {
	const result = [];
	const childNames = new Set(
		filtered.value
			.filter((i) => i.is_credit_note && i.referenced_epurchase_invoice)
			.filter((i) => filtered.value.some((p) => p.name === i.referenced_epurchase_invoice))
			.map((i) => i.name)
	);
	for (const inv of filtered.value) {
		if (childNames.has(inv.name)) continue;
		result.push({ ...inv, _indent: false });
		const children = filtered.value.filter(
			(i) => i.is_credit_note && i.referenced_epurchase_invoice === inv.name
		);
		for (const child of children) {
			result.push({ ...child, _indent: true });
		}
	}
	// Orphan CN
	for (const inv of filtered.value) {
		if (inv.is_credit_note && inv.referenced_epurchase_invoice) {
			const parentInList = filtered.value.some(
				(i) => i.name === inv.referenced_epurchase_invoice
			);
			if (!parentInList && !result.find((i) => i.name === inv.name)) {
				result.push({ ...inv, _indent: false });
			}
		}
	}
	return result;
});

/*** Date picker ***/
const { datePreset, dateFrom, dateTo, dateRange, setDateRange } = useDateRange();

function onDateRangeApply(range) {
	setDateRange(range);
	fetchInvoices(true);
}

/*** API ***/
async function loadBuyingSettings() {
	const r = await frappe.call({
		method: "erpnext_einvoicing.providers.sync.get_buying_settings",
	});
	buyingSettings.value = r.message || {};
}

async function checkPendingFlows() {
	try {
		const r = await frappe.call({
			method: "erpnext_einvoicing.providers.sync.check_pending_flows",
			args: { sync_type: "Purchase Invoice", company: company.value },
		});
		if (r.message?.error) {
			pendingFlowsStatus.value = "error";
			pendingFlows.value = 0;
		} else {
			pendingFlows.value = r.message?.total || 0;
			pendingFlowsStatus.value = pendingFlows.value > 0 ? "pending" : "ok";
		}
	} catch {
		pendingFlowsStatus.value = "error";
		pendingFlows.value = 0;
	}
}

async function syncFlows(since = null) {
	syncing.value = true;
	try {
		const r = await frappe.call({
			method: "erpnext_einvoicing.providers.sync.sync_flows",
			args: { sync_type: "Purchase Invoice", company: company.value, since },
		});
		const msg = r.message || {};
		const indicator = msg.status === "ok" ? "green" : "orange";
		frappe.show_alert({ message: msg.message || __("Sync complete"), indicator }, 5);
		await fetchInvoices(true);
		await checkPendingFlows();
	} finally {
		syncing.value = false;
	}
}

/*** Sync since date ***/
function syncSince() {
	frappe.prompt(
		{ fieldname: "since", fieldtype: "Date", label: __("Since"), reqd: 1 },
		(values) => syncFlows(values.since),
		__("Sync since"),
		__("Sync")
	);
}

async function rematchAll() {
	syncing.value = true;
	try {
		const r = await frappe.call({
			method: "erpnext_einvoicing.providers.sync.rematch_all",
			freeze: true,
			freeze_message: __("Re-matching..."),
		});
		const msg = r.message || {};
		frappe.show_alert({ message: msg.message, indicator: "green" }, 4);
		await fetchInvoices(true);
	} finally {
		syncing.value = false;
	}
}

async function convertAll() {
	const readyNames = filtered.value
		.filter((i) => i.conversion_status === "ready")
		.map((i) => i.name);

	frappe.confirm(__("Convert all {0} ready invoice(s)?", [readyNames.length]), async () => {
		syncing.value = true;
		try {
			const r = await frappe.call({
				method: "erpnext_einvoicing.providers.sync.convert_all_ready",
				args: { names: JSON.stringify(readyNames) },
				freeze: true,
				freeze_message: __("Converting..."),
			});
			const msg = r.message || {};
			frappe.show_alert(
				{
					message: msg.message,
					indicator: msg.status === "ok" ? "green" : "orange",
				},
				5
			);
			await fetchInvoices(true);
		} finally {
			syncing.value = false;
		}
	});
}

/*** UI helpers ***/

function toggleExpand(name) {
	if (expanded.value.has(name)) {
		expanded.value.delete(name);
	} else {
		expanded.value.add(name);
	}
	expanded.value = new Set(expanded.value);
}

/*** Lifecycle ***/
onMounted(async () => {
	await loadBuyingSettings();
	await fetchInvoices();
	await checkPendingFlows();
});
</script>

<template>
	<div class="einvoicing-inbox" style="padding: 16px">
		<div
			v-if="defaultCompany"
			style="font-size: 16px; font-weight: 600; color: #333; margin-bottom: 12px"
		>
			{{ __("Company") + ": " + company }}
		</div>

		<!-- Toolbar -->
		<div
			style="
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 16px;
			"
		>
			<StatusTabs v-model="filter" :tabs="TABS" :counts="counts" />

			<!-- Date picker -->
			<DateRangePicker
				:preset="datePreset"
				:from="dateFrom"
				:to="dateTo"
				@apply="onDateRangeApply"
			/>
			<div style="display: flex; align-items: center; gap: 8px">
				<CompanySelect v-model="company" />
				<button
					v-if="filter === 'pending'"
					class="btn btn-sm btn-default"
					style="margin-right: 10px"
					:disabled="syncing"
					@click="rematchAll"
					:title="__('Re-match all pending invoices')"
				>
					<i class="fa fa-magic"></i>
					{{ __("Re-match All") }}
				</button>
				<button
					v-if="filter === 'ready' && counts.ready > 0"
					class="btn btn-sm btn-primary"
					style="margin-right: 10px"
					:disabled="syncing"
					@click="convertAll"
				>
					<i class="fa fa-arrow-circle-o-right"></i> {{ __("Convert All") }}
				</button>
				<div class="btn-group">
					<button
						class="btn btn-sm btn-default"
						:disabled="syncing"
						@click="syncFlows()"
					>
						<i :class="['fa', syncing ? 'fa-spinner fa-spin' : 'fa-refresh']"></i>
						{{ __("Sync") }}
						<span style="display: inline-flex; align-items: center; margin-left: 4px">
							<span
								v-if="pendingFlowsStatus === 'pending'"
								style="font-size: 11px; color: #f0ad4e"
								:title="pendingFlows + ' ' + __('invoices pending')"
							>
								<i class="fa fa-circle" style="font-size: 8px"></i>
								{{ pendingFlows }}
							</span>
							<span
								v-else-if="pendingFlowsStatus === 'ok'"
								style="font-size: 11px; color: #5cb85c"
								:title="__('Up to date')"
							>
								<i class="fa fa-check" style="font-size: 10px"></i>
							</span>
							<span
								v-else-if="pendingFlowsStatus === 'error'"
								style="font-size: 11px; color: #d9534f"
								:title="__('Provider error')"
							>
								<i
									class="fa fa-exclamation-circle"
									style="font-size: 10px; opacity: 0.7"
								></i>
							</span>
						</span>
					</button>
					<button
						class="btn btn-sm btn-default"
						data-toggle="dropdown"
						:disabled="syncing"
						style="padding-left: 6px; padding-right: 6px"
					>
						<i class="fa fa-caret-down"></i>
					</button>
					<ul class="dropdown-menu dropdown-menu-right">
						<li>
							<a class="dropdown-item" @click="syncSince">{{ __("Since...") }}</a>
						</li>
					</ul>
				</div>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" style="text-align: center; padding: 40px; color: #888">
			<i class="fa fa-spinner fa-spin fa-2x"></i>
		</div>

		<!-- Empty -->
		<div
			v-else-if="filtered.length === 0"
			style="text-align: center; padding: 60px; color: #888"
		>
			<i class="fa fa-inbox fa-3x" style="margin-bottom: 12px"></i>
			<p>{{ __("No invoices to display") }}</p>
		</div>

		<!-- Invoice list -->
		<TransitionGroup
			v-else
			:name="switchingTab ? '' : 'invoice-fade'"
			tag="div"
			style="position: relative"
		>
			<InvoiceCard
				v-for="invoice in groupedInvoices"
				:key="invoice.name"
				:indent="invoice._indent"
				:accent="invoice.is_credit_note ? '#5bc0de' : '#d1d8dd'"
			>
				<template #header-left>
					<a :href="`/app/epurchase-invoice/${invoice.name}`" style="font-weight: 600">
						{{ invoice.name }}
					</a>
					<span
						v-if="invoice.is_credit_note"
						class="indicator-pill blue"
						style="font-size: 11px"
					>
						{{ __("Credit Note") }}
					</span>
					<a
						v-if="invoice.pdf_url"
						:href="invoice.pdf_url"
						target="_blank"
						style="color: #888; margin-right: 6px"
						:title="__('View PDF')"
					>
						<i class="fa fa-file-pdf-o" style="font-size: 13px"></i>
					</a>
					<span v-if="invoice.buyer_siret" style="color: #888; font-size: 12px">
						{{ invoice.company || invoice.buyer_siret }}
					</span>
					<span
						:class="`indicator-pill ${
							{
								pending: 'orange',
								ready: 'green',
								converted: 'blue',
								refused: 'red',
							}[invoice.conversion_status] || 'grey'
						}`"
					>
						{{ __(invoice.conversion_status) }}
					</span>
					<LifecycleBadge
						v-if="invoice.last_lifecycle_log"
						:log="invoice.last_lifecycle_log"
						@refreshed="fetchInvoices(true)"
					/>
				</template>

				<template #header-right>
					<span>{{ invoice.invoice_number }}</span>
					<span>{{ formatDate(invoice.invoice_date) }}</span>
					<strong style="color: #333">{{
						formatCurrency(invoice.total_ttc, invoice.currency)
					}}</strong>
				</template>

				<!-- Supplier section -->
				<SupplierSection :invoice="invoice" @changed="fetchInvoices(true)" />

				<!-- Purchase Flow section -->
				<PurchaseFlowSection
					:invoice="invoice"
					:buying-settings="buyingSettings"
					@changed="fetchInvoices(true)"
				/>

				<!-- Items section -->
				<ItemsSection
					:invoice="invoice"
					:expanded="expanded.has(invoice.name)"
					@toggle="toggleExpand(invoice.name)"
					@changed="fetchInvoices(true)"
				/>

				<!-- Footer -->
				<InboxFooter
					:invoice="invoice"
					:buying-settings="buyingSettings"
					@changed="fetchInvoices(true)"
				/>
			</InvoiceCard>
		</TransitionGroup>
	</div>
</template>
<style>
.invoice-fade-move,
.invoice-fade-enter-active,
.invoice-fade-leave-active {
	transition: all 1s ease;
}

.invoice-fade-enter-from,
.invoice-fade-leave-to {
	opacity: 0;
	transform: translateX(3000px);
}

.invoice-fade-leave-active {
	position: absolute;
	width: calc(100% - 32px);
}
</style>
