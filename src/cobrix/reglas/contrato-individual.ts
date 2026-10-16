/**
 * Validación de la respuesta de contrato/individual: nunca adivinar (§4).
 */

export const ESTADOS_CONTRATO_CONOCIDOS = new Set([
	'ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO',
])

export interface FilaCuotaPendiente {
	readonly contrato_id: number
	readonly identificacion_contrato: string
	readonly estado: string
	readonly deuda_id: string
	readonly deuda: number
	readonly precio_servicio: string
	readonly moneda_sigla: string
	readonly detalle_deuda: readonly string[]
}

export type FalloContratoIndividual =
	| 'sin_filas'
	| 'contrato_mixto'
	| 'identificacion_mixta'
	| 'estado_desconocido'
	| 'cuota_duplicada'
	| 'moneda_incoherente'

export interface ContratoIndividualValido {
	readonly idContratoIsp: number
	readonly identificacionContrato: string
	readonly estado: string
	readonly precioServicio: number
	readonly monedaSigla: string
	readonly filasCuota: readonly FilaCuotaPendiente[]
}

export function validarContratoIndividual(
	filas: readonly FilaCuotaPendiente[],
): { readonly ok: true; readonly contrato: ContratoIndividualValido } | { readonly ok: false; readonly razon: FalloContratoIndividual } {
	if (filas.length === 0) return { ok: false, razon: 'sin_filas' }

	const idContrato = filas[0]!.contrato_id
	const identificacion = filas[0]!.identificacion_contrato
	const estado = filas[0]!.estado

	for (const fila of filas) {
		if (fila.contrato_id !== idContrato) return { ok: false, razon: 'contrato_mixto' }
		if (fila.identificacion_contrato !== identificacion) return { ok: false, razon: 'identificacion_mixta' }
		if (!ESTADOS_CONTRATO_CONOCIDOS.has(fila.estado)) return { ok: false, razon: 'estado_desconocido' }
	}

	const vistos = new Set<string>()
	for (const fila of filas) {
		if (fila.deuda_id === '0') continue
		if (vistos.has(fila.deuda_id)) return { ok: false, razon: 'cuota_duplicada' }
		vistos.add(fila.deuda_id)
	}

	const precioServicio = Number.parseFloat(filas[0]!.precio_servicio)
	if (Number.isFinite(precioServicio) && precioServicio > 0) {
		for (const fila of filas) {
			if (fila.deuda_id === '0' || fila.deuda <= 0) continue
			if (fila.deuda < precioServicio * 0.01) return { ok: false, razon: 'moneda_incoherente' }
		}
	}

	return {
		ok: true,
		contrato: {
			idContratoIsp: idContrato,
			identificacionContrato: identificacion,
			estado,
			precioServicio,
			monedaSigla: filas[0]!.moneda_sigla,
			filasCuota: filas,
		},
	}
}
