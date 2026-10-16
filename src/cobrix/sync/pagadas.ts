/**
 * Corrida de actualización de facturas pagadas en el ISP (§3.3).
 */

import type { DatabaseSync } from 'node:sqlite'

import { IspAuthError, IspClient } from '../cliente-isp.ts'
import { centavosAMontoApi } from '../money.ts'
import { addMonths, today } from '../../shared/dates.ts'
import { esFilaSinDeuda } from '../reglas/importacion.ts'
import { clasificarCuotaEnLedger, type ClasificacionCuotaEnLedger, type LineaLedger } from '../reglas/ledger.ts'
import {
	PROVEEDOR_ID,
	contrasenaProveedor,
	finalizarCorrida,
	iniciarCorrida,
	leerProveedor,
	listarFacturasAbiertas,
	listarFacturasPagadas,
	marcarFacturaPagada,
	reabrirFactura,
	registrarDetalleCorrida,
	registrarHistorial,
} from '../repos.ts'
import type { Factura } from '../types.ts'
import {
	type ContadoresPagadas,
	contadoresPagadasVacios,
	resumenPagadas,
} from './contadores-pagadas.ts'

export async function ejecutarActualizacionPagadas(db: DatabaseSync, simulacion: boolean): Promise<number> {
	const proveedor = leerProveedor(db)
	const client = new IspClient({
		baseUrl: proveedor.urlApi,
		userName: proveedor.usuario,
		password: contrasenaProveedor(db),
	})
	const corrida = iniciarCorrida(db, {
		proveedorId: PROVEEDOR_ID,
		tipo: 'actualizacion_pagadas',
		simulacion,
	})
	const contadores = contadoresPagadasVacios()
	const hoy = today()
	const desde = `${addMonths(hoy.slice(0, 7), -proveedor.mesesConsultaPagadas)}-01`
	const hasta = hoy

	const contexto = {
		client,
		desde,
		hasta,
		ledgerCache: new Map<number, LineaLedger[]>(),
		pendientesCache: new Map<number, Awaited<ReturnType<IspClient['contratoIndividual']>>>(),
		contratosLeidos: new Set<number>(),
	}

	try {
		for (const factura of listarFacturasAbiertas(db, PROVEEDOR_ID)) {
			await evaluarFactura(db, factura, simulacion, corrida.id, contadores, contexto)
		}
		for (const factura of listarFacturasPagadas(db, PROVEEDOR_ID)) {
			await evaluarFactura(db, factura, simulacion, corrida.id, contadores, contexto)
		}

		finalizarCorrida(db, corrida.id, {
			estado: 'completada',
			resumen: resumenPagadas(contadores, simulacion),
			contadores: { ...contadores },
			inicioEn: corrida.inicioEn,
		})
	} catch (error) {
		const mensaje = error instanceof Error ? error.message : String(error)
		finalizarCorrida(db, corrida.id, {
			estado: 'fallida',
			resumen: mensaje,
			contadores: { ...contadores },
			error: mensaje,
			inicioEn: corrida.inicioEn,
		})
		if (error instanceof IspAuthError) throw error
	}

	return corrida.id
}

async function evaluarFactura(
	db: DatabaseSync,
	factura: Factura,
	simulacion: boolean,
	corridaId: number,
	contadores: ContadoresPagadas,
	ctx: {
		readonly client: IspClient
		readonly desde: string
		readonly hasta: string
		readonly ledgerCache: Map<number, LineaLedger[]>
		readonly pendientesCache: Map<number, Awaited<ReturnType<IspClient['contratoIndividual']>>>
		readonly contratosLeidos: Set<number>
	},
): Promise<void> {
	contadores.invoicesChecked++
	if (!ctx.contratosLeidos.has(factura.idContratoIsp)) {
		ctx.contratosLeidos.add(factura.idContratoIsp)
		contadores.contractsRead++
	}

	let ledger = ctx.ledgerCache.get(factura.idContratoIsp)
	if (!ledger) {
		ledger = await ctx.client.pagoInformacion({
			idContrato: factura.idContratoIsp,
			fechaInicio: ctx.desde,
			fechaFin: ctx.hasta,
		})
		ctx.ledgerCache.set(factura.idContratoIsp, ledger)
	}

	const idCuota = Number(factura.idCuotaProveedor)
	const lineas = ledger.filter(linea => linea.id_cuota === idCuota)
	const clasificacion = lineas.length === 0
		? await clasificarSinLibro(ctx.client, ctx.pendientesCache, factura)
		: clasificarCuotaEnLedger(lineas, {
			saldoCobrix: centavosAMontoApi(factura.totalCentavos),
			numFactura: lineas.find(linea => linea.num_factura)?.num_factura ?? '',
		})

	aplicarClasificacion(db, factura, clasificacion, simulacion, corridaId, contadores)
}

async function clasificarSinLibro(
	client: IspClient,
	cache: Map<number, Awaited<ReturnType<IspClient['contratoIndividual']>>>,
	factura: Factura,
): Promise<ClasificacionCuotaEnLedger> {
	let filas = cache.get(factura.idContratoIsp)
	if (!filas) {
		filas = await client.contratoIndividual(factura.idContratoIsp)
		cache.set(factura.idContratoIsp, filas)
	}
	const pendiente = filas.some(fila => fila.deuda_id === factura.idCuotaProveedor && !esFilaSinDeuda(fila.deuda_id))
	return pendiente ? { kind: 'pendiente', saldoIsp: centavosAMontoApi(factura.totalCentavos) } : { kind: 'inconsistente' }
}

function aplicarClasificacion(
	db: DatabaseSync,
	factura: Factura,
	clasificacion: ClasificacionCuotaEnLedger,
	simulacion: boolean,
	corridaId: number,
	contadores: ContadoresPagadas,
): void {
	const base = detalle(factura, corridaId)

	if (clasificacion.kind === 'pagada') {
		if (factura.estado === 'pagada') return
		if (simulacion) {
			contadores.invoicesWouldMarkPaid++
			registrarDetalle(db, { ...base, resultado: 'se_marcaria_pagada', detalle: `Factura ISP ${clasificacion.numFactura}` })
			return
		}
		db.exec('BEGIN IMMEDIATE')
		try {
			marcarFacturaPagada(db, factura.id, {
				idFacturaIsp: clasificacion.idFacturaIsp,
				numFacturaIsp: clasificacion.numFactura,
			})
			registrarHistorial(db, {
				clienteId: factura.clienteId,
				tipo: 'pagada_en_isp',
				facturaId: factura.id,
				payload: { num_factura_isp: clasificacion.numFactura, id_factura_isp: clasificacion.idFacturaIsp },
			})
			contadores.invoicesMarkedPaid++
			registrarDetalle(db, { ...base, resultado: 'marcada_pagada', detalle: `Pagada en el ISP · ${clasificacion.numFactura}` })
			db.exec('COMMIT')
		} catch (error) {
			db.exec('ROLLBACK')
			contadores.lookupsFailed++
			registrarDetalle(db, { ...base, resultado: 'error', detalle: error instanceof Error ? error.message : String(error) })
		}
		return
	}

	if (factura.estado === 'pagada') {
		if (!simulacion) {
			reabrirFactura(db, factura.id)
			registrarHistorial(db, {
				clienteId: factura.clienteId,
				tipo: 'reabierta_en_isp',
				facturaId: factura.id,
				payload: { motivo: 'El ISP ya no reporta la cuota como saldada' },
			})
		}
		contadores.invoicesStillOpen++
		registrarDetalle(db, { ...base, resultado: 'reabierta', detalle: 'Reabierta: sin evidencia de pago en el ISP' })
		return
	}

	if (clasificacion.kind === 'abono_parcial') {
		contadores.invoicesPartiallyPaidAtIsp++
		contadores.invoicesStillOpen++
		registrarDetalle(db, {
			...base,
			resultado: 'abono_parcial_isp',
			detalle: `ledger_pending: el administrador debe ${clasificacion.saldoIsp}, Cobrix ${centavosAMontoApi(factura.totalCentavos)}`,
		})
		return
	}

	if (clasificacion.kind === 'exonerada') {
		contadores.invoicesStillOpen++
		registrarDetalle(db, { ...base, resultado: 'sigue_abierta', detalle: 'Cuota exonerada en el ISP' })
		return
	}

	if (clasificacion.kind === 'inconsistente') {
		contadores.invoicesUnderReview++
		contadores.invoicesStillOpen++
		registrarDetalle(db, { ...base, resultado: 'sigue_abierta', detalle: 'Sin evidencia clara en libro o contrato' })
		return
	}

	contadores.invoicesStillOpen++
	registrarDetalle(db, {
		...base,
		resultado: 'sigue_abierta',
		detalle: clasificacion.kind === 'pendiente' ? `contract_pending · saldo ISP ${clasificacion.saldoIsp}` : 'Sigue abierta',
	})
}

function detalle(factura: Factura, corridaId: number) {
	return {
		corridaId,
		idContratoIsp: factura.idContratoIsp,
		idCuotaProveedor: factura.idCuotaProveedor,
		clienteId: factura.clienteId,
		facturaId: factura.id,
		montoCentavos: factura.totalCentavos,
	}
}

function registrarDetalle(
	db: DatabaseSync,
	input: ReturnType<typeof detalle> & { readonly resultado: string; readonly detalle: string },
): void {
	registrarDetalleCorrida(db, input)
}
