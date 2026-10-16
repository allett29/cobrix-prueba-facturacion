/**
 * Filtros de importación configurables (§3.1 y §4).
 */

import { addMonths, currentPeriod } from '../../shared/dates.ts'
import { normalizarIdentificacion, tipoDocumentoDesdeIdentificacion } from './identificacion.ts'
import { periodoDesdeDetalleDeuda } from './periodo.ts'

export function esFilaSinDeuda(deudaId: string): boolean {
	return deudaId === '0'
}

/** Saldo residual menor a un centavo en la API. */
export function esSaldoResidual(deuda: number): boolean {
	return deuda < 0.01
}

export function estadoContratoImportable(estado: string, estadosPermitidos: readonly string[]): boolean {
	return estadosPermitidos.includes(estado)
}

export function periodoDentroDeVentana(periodo: string, ventanaMeses: number | null, hoy = currentPeriod()): boolean {
	if (ventanaMeses === null) return true
	const minimo = addMonths(hoy, -ventanaMeses)
	return periodo >= minimo && periodo <= hoy
}

export function documentoExcluido(identificacionNormalizada: string, tiposExcluidos: readonly string[]): boolean {
	if (tiposExcluidos.length === 0) return false
	const tipo = tipoDocumentoDesdeIdentificacion(identificacionNormalizada)
	return tipo !== null && tiposExcluidos.includes(tipo)
}

export function identificacionTitularValida(raw: string): string | null {
	return normalizarIdentificacion(raw)
}

export function parsearPeriodoCuota(detalleDeuda: readonly string[]) {
	return periodoDesdeDetalleDeuda(detalleDeuda)
}

/** Conserva las N cuotas más recientes por periodo (YYYY-MM). */
export function limitarCuotasRecientes<T extends { readonly periodo: string }>(
	cuotas: readonly T[],
	maximo: number | null,
): readonly T[] {
	if (maximo === null || cuotas.length <= maximo) return cuotas
	return [...cuotas].sort((a, b) => a.periodo.localeCompare(b.periodo)).slice(-maximo)
}
