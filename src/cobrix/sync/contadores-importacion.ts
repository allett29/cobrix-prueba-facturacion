/**
 * Contadores de corrida de importación (claves alineadas con la referencia de layout).
 */

export interface ContadoresImportacion {
	contractsObserved: number
	contractsWithDebt: number
	contractsIndeterminate: number
	contractsStatusUnrecognized: number
	contractsCurrencyIncoherent: number
	installmentsPending: number
	installmentsImported: number
	installmentsWouldImport: number
	installmentsAlreadyImported: number
	installmentsExcludedByStatus: number
	installmentsBlockedByLimit: number
	installmentsFailed: number
	installmentsZeroAmount: number
	installmentsNoLongerPending: number
	installmentsExcludedByWindow: number
	installmentsExcludedByRecentLimit: number
	contractsExcludedByIdentifierType: number
	installmentsExcludedByIdentifierType: number
	customersCreated: number
}

export function contadoresImportacionVacios(): ContadoresImportacion {
	return {
		contractsObserved: 0,
		contractsWithDebt: 0,
		contractsIndeterminate: 0,
		contractsStatusUnrecognized: 0,
		contractsCurrencyIncoherent: 0,
		installmentsPending: 0,
		installmentsImported: 0,
		installmentsWouldImport: 0,
		installmentsAlreadyImported: 0,
		installmentsExcludedByStatus: 0,
		installmentsBlockedByLimit: 0,
		installmentsFailed: 0,
		installmentsZeroAmount: 0,
		installmentsNoLongerPending: 0,
		installmentsExcludedByWindow: 0,
		installmentsExcludedByRecentLimit: 0,
		contractsExcludedByIdentifierType: 0,
		installmentsExcludedByIdentifierType: 0,
		customersCreated: 0,
	}
}

export function resumenImportacion(c: ContadoresImportacion, simulacion: boolean): string {
	if (simulacion) {
		return `Contratos leídos: ${c.contractsObserved} · Se importarían: ${c.installmentsWouldImport} · Excluidas por estado: ${c.installmentsExcludedByStatus}`
	}
	return `Contratos leídos: ${c.contractsObserved} · Importadas: ${c.installmentsImported} · Clientes creados: ${c.customersCreated} · Excluidas por estado: ${c.installmentsExcludedByStatus}`
}
