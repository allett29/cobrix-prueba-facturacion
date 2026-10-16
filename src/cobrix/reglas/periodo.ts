/**
 * Periodo y vencimiento desde detalle_deuda del administrador.
 */

import { addCivilDays } from '../../shared/dates.ts'

const MESES: Record<string, number> = {
	ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
	JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
}

export interface PeriodoCuota {
	readonly periodo: string
	readonly vencimiento: string
	readonly descripcion: string
}

/** `PLAN15MB25 - 2026 Agosto` → periodo 2026-08, vencimiento 2026-08-01. */
export function periodoDesdeDetalleDeuda(detalleDeuda: readonly string[]): PeriodoCuota | null {
	const linea = detalleDeuda.find(item => typeof item === 'string' && item.trim())
	if (!linea) return null
	const match = /(\d{4})\s+(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)/i.exec(linea)
	if (!match) return null
	const year = match[1]!
	const month = MESES[match[2]!.toUpperCase()]
	if (!month) return null
	const periodo = `${year}-${String(month).padStart(2, '0')}`
	return {
		periodo,
		vencimiento: `${periodo}-01`,
		descripcion: linea.trim(),
	}
}

export function fechaCorte(vencimiento: string, diasGracia: number): string {
	return addCivilDays(vencimiento, diasGracia)
}
