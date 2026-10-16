export interface ContadoresPagadas {
	invoicesChecked: number
	invoicesMarkedPaid: number
	invoicesWouldMarkPaid: number
	invoicesStillOpen: number
	invoicesPartiallyPaidAtIsp: number
	invoicesUnderReview: number
	invoicesUnknown: number
	lookupsFailed: number
	contractsRead: number
}

export function contadoresPagadasVacios(): ContadoresPagadas {
	return {
		invoicesChecked: 0,
		invoicesMarkedPaid: 0,
		invoicesWouldMarkPaid: 0,
		invoicesStillOpen: 0,
		invoicesPartiallyPaidAtIsp: 0,
		invoicesUnderReview: 0,
		invoicesUnknown: 0,
		lookupsFailed: 0,
		contractsRead: 0,
	}
}

export function resumenPagadas(c: ContadoresPagadas, simulacion: boolean): string {
	if (simulacion) {
		return `Facturas consultadas: ${c.invoicesChecked} · Se marcarían pagadas: ${c.invoicesWouldMarkPaid} · Abono parcial: ${c.invoicesPartiallyPaidAtIsp}`
	}
	return `Facturas consultadas: ${c.invoicesChecked} · Marcadas pagadas: ${c.invoicesMarkedPaid} · Abono parcial: ${c.invoicesPartiallyPaidAtIsp} · Siguen pendientes: ${c.invoicesStillOpen}`
}
