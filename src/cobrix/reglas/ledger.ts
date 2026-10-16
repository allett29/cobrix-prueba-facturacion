/**
 * Clasificación de pagos según pago_informacion (§4 pagos).
 */

export interface LineaLedger {
	readonly id_factura: number
	readonly num_factura: string
	readonly id_cuota: number
	readonly periodo_cuota: string
	readonly tarifa: number
	readonly valor_pago: number
	readonly descuento: number
	readonly saldo_cuota: number
}

export type ClasificacionCuotaEnLedger =
	| { readonly kind: 'pagada'; readonly idFacturaIsp: number; readonly numFactura: string }
	| { readonly kind: 'abono_parcial'; readonly saldoIsp: number }
	| { readonly kind: 'exonerada' }
	| { readonly kind: 'pendiente'; readonly saldoIsp: number }
	| { readonly kind: 'inconsistente' }

const toleranciaSaldo = 0.001

function redondearCentavos(valor: number): number {
	return Math.round(valor * 100) / 100
}

export function clasificarCuotaEnLedger(
	lineas: readonly LineaLedger[],
	input: { readonly saldoCobrix: number; readonly numFactura?: string },
): ClasificacionCuotaEnLedger {
	if (lineas.length === 0) return { kind: 'pendiente', saldoIsp: input.saldoCobrix }

	const saldos = new Set(lineas.map(linea => redondearCentavos(linea.saldo_cuota)))
	const pagos = new Set(lineas.map(linea => redondearCentavos(linea.valor_pago)))
	if (saldos.size !== 1 || pagos.size !== 1) return { kind: 'inconsistente' }

	const saldo = [...saldos][0]!
	const valorPago = [...pagos][0]!
	const idFactura = lineas.find(linea => linea.id_factura > 0)?.id_factura ?? 0

	if (saldo <= toleranciaSaldo) {
		if (valorPago > toleranciaSaldo) {
			return { kind: 'pagada', idFacturaIsp: idFactura, numFactura: input.numFactura ?? '' }
		}
		return { kind: 'exonerada' }
	}

	if (saldo < input.saldoCobrix - toleranciaSaldo) {
		return { kind: 'abono_parcial', saldoIsp: saldo }
	}

	return { kind: 'pendiente', saldoIsp: saldo }
}
