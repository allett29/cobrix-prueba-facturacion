/**
 * Corrida de importación de cuotas pendientes del administrador (§3.2).
 */

import type { DatabaseSync } from 'node:sqlite'

import { IspAuthError, IspClient } from '../cliente-isp.ts'
import { montoApiACentavos } from '../money.ts'
import type { FilaCuotaPendiente } from '../reglas/contrato-individual.ts'
import { validarContratoIndividual } from '../reglas/contrato-individual.ts'
import {
	documentoExcluido,
	esFilaSinDeuda,
	esSaldoResidual,
	estadoContratoImportable,
	identificacionTitularValida,
	limitarCuotasRecientes,
	parsearPeriodoCuota,
	periodoDentroDeVentana,
} from '../reglas/importacion.ts'
import { identificacionParaMostrar, tipoPersonaDesdeIdentificacion } from '../reglas/identificacion.ts'
import { fechaCorte } from '../reglas/periodo.ts'
import {
	PROVEEDOR_ID,
	buscarClientePorIdentificacion,
	buscarFacturaPorCuota,
	contrasenaProveedor,
	crearCliente,
	crearFactura,
	finalizarCorrida,
	guardarContratoProveedor,
	iniciarCorrida,
	leerProveedor,
	registrarDetalleCorrida,
	registrarHistorial,
} from '../repos.ts'
import {
	type ContadoresImportacion,
	contadoresImportacionVacios,
	resumenImportacion,
} from './contadores-importacion.ts'

interface CuotaEvaluada {
	readonly fila: FilaCuotaPendiente
	readonly periodo: string
	readonly vencimiento: string
	readonly descripcion: string
	readonly corte: string
	readonly montoCentavos: number
}

export async function ejecutarImportacion(db: DatabaseSync, simulacion: boolean): Promise<number> {
	const proveedor = leerProveedor(db)
	const client = new IspClient({
		baseUrl: proveedor.urlApi,
		userName: proveedor.usuario,
		password: contrasenaProveedor(db),
	})

	const corrida = iniciarCorrida(db, {
		proveedorId: PROVEEDOR_ID,
		tipo: 'importacion',
		simulacion,
	})
	const contadores = contadoresImportacionVacios()
	const limites = { nuevasFacturas: 0, nuevosCentavos: 0 }

	try {
		const ids = await client.listarIdsContratos()
		for (const idContrato of ids) {
			contadores.contractsObserved++
			const filas = await client.contratoIndividual(idContrato)
			procesarContrato(db, {
				filas,
				simulacion,
				corridaId: corrida.id,
				proveedor,
				contadores,
				limites,
				onImportada(centavos) {
					limites.nuevasFacturas++
					limites.nuevosCentavos += centavos
				},
			})
		}
		finalizarCorrida(db, corrida.id, {
			estado: 'completada',
			resumen: resumenImportacion(contadores, simulacion),
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

function procesarContrato(
	db: DatabaseSync,
	ctx: {
		readonly filas: readonly FilaCuotaPendiente[]
		readonly simulacion: boolean
		readonly corridaId: number
		readonly proveedor: ReturnType<typeof leerProveedor>
		readonly contadores: ContadoresImportacion
		readonly limites: { nuevasFacturas: number; nuevosCentavos: number }
		readonly onImportada: (centavos: number) => void
	},
): void {
	const { filas, simulacion, corridaId, proveedor, contadores, limites, onImportada } = ctx
	if (filas.length === 0) {
		contadores.contractsIndeterminate++
		return
	}

	const validacion = validarContratoIndividual(filas)
	if (!validacion.ok) {
		if (validacion.razon === 'moneda_incoherente') contadores.contractsCurrencyIncoherent++
		else if (validacion.razon === 'estado_desconocido') contadores.contractsStatusUnrecognized++
		else contadores.contractsIndeterminate++
		for (const fila of filasCuota(filas)) {
			contadores.installmentsPending++
			registrarDetalle(db, corridaId, fila, null, null, resultadoContratoInvalido(validacion.razon), validacion.razon, montoApiACentavos(fila.deuda))
		}
		return
	}

	const identificacion = identificacionTitularValida(filas[0]!.identificacion_contrato)
	if (!identificacion) {
		contadores.contractsIndeterminate++
		for (const fila of filasCuota(filas)) {
			contadores.installmentsPending++
			registrarDetalle(db, corridaId, fila, null, null, 'documento_invalido', 'Identificación del titular inválida', montoApiACentavos(fila.deuda))
		}
		return
	}

	if (documentoExcluido(identificacion, proveedor.tiposDocumentoExcluidos)) {
		contadores.contractsExcludedByIdentifierType++
		for (const fila of filasCuota(filas)) {
			contadores.installmentsPending++
			contadores.installmentsExcludedByIdentifierType++
			registrarDetalle(db, corridaId, fila, null, null, 'excluida_tipo_doc', 'Tipo de documento excluido en configuración', montoApiACentavos(fila.deuda))
		}
		return
	}

	if (filasCuota(filas).length > 0) contadores.contractsWithDebt++

	const evaluadas: CuotaEvaluada[] = []
	for (const fila of filasCuota(filas)) {
		contadores.installmentsPending++
		if (esSaldoResidual(fila.deuda)) {
			contadores.installmentsZeroAmount++
			registrarDetalle(db, corridaId, fila, null, null, 'saldo_residual', 'Saldo residual menor a un centavo', montoApiACentavos(fila.deuda))
			continue
		}
		if (!estadoContratoImportable(fila.estado, proveedor.estadosImportables)) {
			contadores.installmentsExcludedByStatus++
			registrarDetalle(db, corridaId, fila, null, null, 'excluida_estado', `Estado del contrato: ${fila.estado}`, montoApiACentavos(fila.deuda))
			continue
		}
		const periodoCuota = parsearPeriodoCuota(fila.detalle_deuda)
		if (!periodoCuota) {
			contadores.installmentsFailed++
			registrarDetalle(db, corridaId, fila, null, null, 'error', 'No se pudo interpretar detalle_deuda', montoApiACentavos(fila.deuda))
			continue
		}
		if (!periodoDentroDeVentana(periodoCuota.periodo, proveedor.ventanaMeses)) {
			contadores.installmentsExcludedByWindow++
			registrarDetalle(db, corridaId, fila, null, null, 'excluida_ventana', `Fuera de ventana: ${periodoCuota.periodo}`, montoApiACentavos(fila.deuda))
			continue
		}
		evaluadas.push({
			fila,
			periodo: periodoCuota.periodo,
			vencimiento: periodoCuota.vencimiento,
			descripcion: periodoCuota.descripcion,
			corte: fechaCorte(periodoCuota.vencimiento, proveedor.diasGraciaCorte),
			montoCentavos: montoApiACentavos(fila.deuda),
		})
	}

	const permitidas = new Set(
		limitarCuotasRecientes(
			evaluadas.map(item => ({ periodo: item.periodo, item })),
			proveedor.maxCuotasRecientes,
		).map(entry => entry.item),
	)
	for (const item of evaluadas) {
		if (permitidas.has(item)) continue
		contadores.installmentsExcludedByRecentLimit++
		registrarDetalle(db, corridaId, item.fila, null, null, 'excluida_recientes', 'Fuera del límite de cuotas recientes', item.montoCentavos)
	}

	for (const item of evaluadas) {
		if (!permitidas.has(item)) continue
		const existente = buscarFacturaPorCuota(db, PROVEEDOR_ID, item.fila.deuda_id)
		if (existente) {
			contadores.installmentsAlreadyImported++
			registrarDetalle(db, corridaId, item.fila, existente.clienteId, existente.id, 'ya_importada', `Factura ${existente.numero}`, item.montoCentavos)
			continue
		}
		if (limites.nuevasFacturas >= proveedor.topeFacturasCorrida
			|| limites.nuevosCentavos + item.montoCentavos > proveedor.topeMontoCentavosCorrida) {
			contadores.installmentsBlockedByLimit++
			registrarDetalle(db, corridaId, item.fila, null, null, 'frenada_tope', 'Tope de corrida alcanzado', item.montoCentavos)
			continue
		}

		if (simulacion) {
			contadores.installmentsWouldImport++
			registrarDetalle(db, corridaId, item.fila, null, null, 'se_importaria', item.descripcion, item.montoCentavos)
			continue
		}

		db.exec('BEGIN IMMEDIATE')
		try {
			const { clienteId, creado } = asegurarCliente(db, item.fila, identificacion)
			if (creado) contadores.customersCreated++
			const contrato = guardarContratoProveedor(db, {
				proveedorId: PROVEEDOR_ID,
				clienteId,
				idContratoIsp: item.fila.contrato_id,
				codigo: item.fila.codigo,
				estado: item.fila.estado,
				planCodigo: item.fila.nombre_plan,
				planNombre: item.fila.nombre_plan,
				precioMesCentavos: montoApiACentavos(Number.parseFloat(item.fila.precio_servicio)),
				sucursalSigla: item.fila.sigla_sucursal,
				sucursalNombre: item.fila.nombre_sucursal,
				direccion: item.fila.direccion,
			})
			const factura = crearFactura(db, {
				proveedorId: PROVEEDOR_ID,
				clienteId,
				contratoProveedorId: contrato.id,
				idCuotaProveedor: item.fila.deuda_id,
				idContratoIsp: item.fila.contrato_id,
				periodo: item.periodo,
				descripcion: item.descripcion,
				vencimiento: item.vencimiento,
				corte: item.corte,
				totalCentavos: item.montoCentavos,
				corridaImportacionId: corridaId,
			})
			registrarHistorial(db, {
				clienteId,
				tipo: 'factura_importada',
				facturaId: factura.id,
				payload: { numero: factura.numero, cuota: item.fila.deuda_id },
			})
			contadores.installmentsImported++
			onImportada(item.montoCentavos)
			registrarDetalle(db, corridaId, item.fila, clienteId, factura.id, 'importada', item.descripcion, item.montoCentavos)
			db.exec('COMMIT')
		} catch (error) {
			db.exec('ROLLBACK')
			contadores.installmentsFailed++
			const detalle = error instanceof Error ? error.message : String(error)
			registrarDetalle(db, corridaId, item.fila, null, null, 'error', detalle, item.montoCentavos)
		}
	}
}

function filasCuota(filas: readonly FilaCuotaPendiente[]): FilaCuotaPendiente[] {
	return filas.filter(fila => !esFilaSinDeuda(fila.deuda_id))
}

function asegurarCliente(
	db: DatabaseSync,
	fila: FilaCuotaPendiente,
	identificacion: string,
): { clienteId: number; creado: boolean } {
	const existente = buscarClientePorIdentificacion(db, PROVEEDOR_ID, identificacion)
	if (existente) {
		return { clienteId: existente.id, creado: false }
	}
	const cliente = crearCliente(db, {
		proveedorId: PROVEEDOR_ID,
		identificacionNormalizada: identificacion,
		identificacionMostrar: identificacionParaMostrar(identificacion),
		tipoPersona: tipoPersonaDesdeIdentificacion(identificacion),
		nombre: fila.nombre_contrato,
		correo: fila.email,
		telefono: fila.telefono,
		origen: `Administrador de facturas · clave ***${identificacion.slice(-4)}`,
	})
	registrarHistorial(db, {
		clienteId: cliente.id,
		tipo: 'cliente_creado',
		facturaId: null,
		payload: { contrato_isp: fila.contrato_id },
	})
	return { clienteId: cliente.id, creado: true }
}

function resultadoContratoInvalido(razon: string): string {
	if (razon === 'moneda_incoherente') return 'moneda_incoherente'
	if (razon === 'estado_desconocido') return 'estado_desconocido'
	return 'contrato_indeterminado'
}

function registrarDetalle(
	db: DatabaseSync,
	corridaId: number,
	fila: FilaCuotaPendiente,
	clienteId: number | null,
	facturaId: number | null,
	resultado: string,
	detalle: string,
	montoCentavos: number,
): void {
	registrarDetalleCorrida(db, {
		corridaId,
		idContratoIsp: fila.contrato_id,
		idCuotaProveedor: fila.deuda_id,
		clienteId,
		facturaId,
		resultado,
		detalle,
		montoCentavos,
	})
}
