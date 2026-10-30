<script setup>
/*** Props ***/
defineProps({
	indent: { type: Boolean, default: false },
	accent: { type: String, default: "#d1d8dd" },
});
</script>

<template>
	<div
		:style="`
			position: relative;
			border: 1px solid #d1d8dd;
			border-left: 3px solid ${accent};
			margin-left: ${indent ? '32px' : '0'};
			border-radius: 6px;
			margin-bottom: 12px;
			background: #fff;
		`"
	>
		<div
			v-if="indent"
			:style="`
				position: absolute;
				left: -20px;
				top: 5%;
				transform: translateY(-50%);
				color: ${accent};
				font-size: 14px;
			`"
		>
			<i class="fa fa-level-up fa-rotate-90"></i>
		</div>

		<!-- Header -->
		<div
			style="
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 12px 16px;
				border-bottom: 1px solid #f0f0f0;
			"
		>
			<div style="display: flex; align-items: center; gap: 10px">
				<slot name="header-left" />
			</div>
			<div
				style="
					display: flex;
					align-items: center;
					gap: 16px;
					color: #6c757d;
					font-size: 13px;
				"
			>
				<slot name="header-right" />
			</div>
		</div>

		<!-- Body -->
		<slot />
	</div>
</template>
