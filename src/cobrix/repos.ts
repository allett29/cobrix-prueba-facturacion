/**
 * Acceso a datos Cobrix (SQLite). Sin reglas de negocio del ISP.
 */

import type { DatabaseSync } from 'node:sqlite'

import { decryptSecret, encryptSecret } from './crypto.ts'
import { numeroFacturaDesdeSecuencia } from './money.ts'
import type {
	Cliente,
	ContratoProveedor,
	Corrida,
	Empresa,
	EstadoCorrida,
	EstadoFactura,
	Factura,
	Proveedor,
	ProveedorEditable,
	TipoCorrida,
	TipoPersona,
} from './types.ts'

export const EMPRESA_ID = 1
export const PROVEEDOR_ID = 1

type Row = Record<string, unknown>

const ts = (): string => new Date().toISOString()

const parseJsonArray = (value: string): string[] => {
	const parsed: unknown = JSON.parse(value)
	if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string')) {
		throw new Error('JSON de lista inválido en configuración')
	}
	return parsed
}

const parseContadores = (value: string): Record<string, number> => {
	const parsed: unknown = JSON.parse(value)
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
	const out: Record<string, number> = {}
	for (const [key, val] of Object.entries(parsed)) {
		if (typeof val === 'number') out[key] = val
	}
	return out
}

// --------------------------------------------------------------------- config

export function leerEmpresa(db: DatabaseSync): Empresa {
	const row = db.prepare('SELECT * FROM empresa WHERE id = ?').get(EMPRESA_ID) as Row
	return {
		nombre: String(row.nombre),
		rif: String(row.rif),
		correoCobranza: String(row.correo_cobranza),
		actualizadoEn: String(row.actualizado_en),
	}
}

export function guardarEmpresa(db: DatabaseSync, input: Omit<Empresa, 'actualizadoEn'>): void {
	const actualizadoEn = ts()
	db.prepare(`
		UPDATE empresa SET nombre = ?, rif = ?, correo_cobranza = ?, actualizado_en = ?
		WHERE id = ?
	`).run(input.nombre, input.rif, input.correoCobranza, actualizadoEn, EMPRESA_ID)
}

function mapProveedor(row: Row): Proveedor {
	return {
		id: Number(row.id),
		nombreVisible: String(row.nombre_visible),
		urlApi: String(row.url_api),
		usuario: String(row.usuario),
		estadosImportables: parseJsonArray(String(row.estados_importables)),
		ventanaMeses: row.ventana_meses === null ? null : Number(row.ventana_meses),
		maxCuotasRecientes: row.max_cuotas_recientes === null ? null : Number(row.max_cuotas_recientes),
		diasGraciaCorte: Number(row.dias_gracia_corte),
		topeFacturasCorrida: Number(row.tope_facturas_corrida),
		topeMontoCentavosCorrida: Number(row.tope_monto_centavos_corrida),
		tiposDocumentoExcluidos: parseJsonArray(String(row.tipos_documento_excluidos)),
		mesesConsultaPagadas: Number(row.meses_consulta_pagadas),
		corridaAutomaticaActiva: Number(row.corrida_automatica_activa) === 1,
		corridaAutomaticaHora: row.corrida_automatica_hora === null ? null : String(row.corrida_automatica_hora),
		actualizadoEn: String(row.actualizado_en),
	}
}

export function leerProveedor(db: DatabaseSync): Proveedor {
	return mapProveedor(db.prepare('SELECT * FROM proveedor WHERE id = ?').get(PROVEEDOR_ID) as Row)
}

export function contrasenaProveedor(db: DatabaseSync): string {
	const row = db.prepare('SELECT contrasena_cifrada FROM proveedor WHERE id = ?').get(PROVEEDOR_ID) as Row
	return decryptSecret(String(row.contrasena_cifrada))
}

export function leerUltimaCorridaAutomaticaFecha(db: DatabaseSync): string | null {
	const row = db.prepare('SELECT ultima_corrida_automatica_fecha FROM proveedor WHERE id = ?').get(PROVEEDOR_ID) as Row
	const value = row.ultima_corrida_automatica_fecha
	return value === null || value === undefined ? null : String(value)
}

export function marcarCorridaAutomaticaFecha(db: DatabaseSync, fecha: string): void {
	db.prepare('UPDATE proveedor SET ultima_corrida_automatica_fecha = ? WHERE id = ?').run(fecha, PROVEEDOR_ID)
}

export function guardarProveedor(db: DatabaseSync, input: ProveedorEditable, nuevaContrasena?: string): void {
	const actualizadoEn = ts()
	const estados = JSON.stringify([...input.estadosImportables])
	const excluidos = JSON.stringify([...input.tiposDocumentoExcluidos])
	const url = input.urlApi.replace(/\/+$/, '')
	const hora = input.corridaAutomaticaHora
	const activa = input.corridaAutomaticaActiva ? 1 : 0

	if (nuevaContrasena) {
		const cifrada = encryptSecret(nuevaContrasena)
		db.prepare(`
			UPDATE proveedor SET
				nombre_visible = ?, url_api = ?, usuario = ?, contrasena_cifrada = ?,
				estados_importables = ?, ventana_meses = ?, max_cuotas_recientes = ?, dias_gracia_corte = ?,
				tope_facturas_corrida = ?, tope_monto_centavos_corrida = ?, tipos_documento_excluidos = ?,
				meses_consulta_pagadas = ?, corrida_automatica_activa = ?, corrida_automatica_hora = ?,
				actualizado_en = ?
			WHERE id = ?
		`).run(
			input.nombreVisible, url, input.usuario, cifrada, estados,
			input.ventanaMeses, input.maxCuotasRecientes, input.diasGraciaCorte,
			input.topeFacturasCorrida, input.topeMontoCentavosCorrida, excluidos,
			input.mesesConsultaPagadas, activa, hora, actualizadoEn, PROVEEDOR_ID,
		)
		return
	}

	db.prepare(`
		UPDATE proveedor SET
			nombre_visible = ?, url_api = ?, usuario = ?,
			estados_importables = ?, ventana_meses = ?, max_cuotas_recientes = ?, dias_gracia_corte = ?,
			tope_facturas_corrida = ?, tope_monto_centavos_corrida = ?, tipos_documento_excluidos = ?,
			meses_consulta_pagadas = ?, corrida_automatica_activa = ?, corrida_automatica_hora = ?,
			actualizado_en = ?
		WHERE id = ?
	`).run(
		input.nombreVisible, url, input.usuario, estados,
		input.ventanaMeses, input.maxCuotasRecientes, input.diasGraciaCorte,
		input.topeFacturasCorrida, input.topeMontoCentavosCorrida, excluidos,
		input.mesesConsultaPagadas, activa, hora, actualizadoEn, PROVEEDOR_ID,
	)
}

// --------------------------------------------------------------------- clientes

function mapCliente(row: Row): Cliente {
	return {
		id: Number(row.id),
		proveedorId: Number(row.proveedor_id),
		identificacionNormalizada: String(row.identificacion_normalizada),
		identificacionMostrar: String(row.identificacion_mostrar),
		tipoPersona: row.tipo_persona as TipoPersona,
		nombre: String(row.nombre),
		correo: String(row.correo),
		telefono: String(row.telefono),
		origen: String(row.origen),
		creadoEn: String(row.creado_en),
		actualizadoEn: String(row.actualizado_en),
	}
}

export function buscarClientePorIdentificacion(
	db: DatabaseSync,
	proveedorId: number,
	identificacionNormalizada: string,
): Cliente | undefined {
	const row = db.prepare(`
		SELECT * FROM cliente
		WHERE proveedor_id = ? AND identificacion_normalizada = ?
	`).get(proveedorId, identificacionNormalizada) as Row | undefined
	return row ? mapCliente(row) : undefined
}

export interface NuevoCliente {
	readonly proveedorId: number
	readonly identificacionNormalizada: string
	readonly identificacionMostrar: string
	readonly tipoPersona: TipoPersona
	readonly nombre: string
	readonly correo: string
	readonly telefono: string
	readonly origen: string
}

export function crearCliente(db: DatabaseSync, input: NuevoCliente): Cliente {
	const ahora = ts()
	const result = db.prepare(`
		INSERT INTO cliente (
			proveedor_id, identificacion_normalizada, identificacion_mostrar, tipo_persona,
			nombre, correo, telefono, origen, creado_en, actualizado_en
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		input.proveedorId, input.identificacionNormalizada, input.identificacionMostrar, input.tipoPersona,
		input.nombre, input.correo, input.telefono, input.origen, ahora, ahora,
	)
	return mapCliente(db.prepare('SELECT * FROM cliente WHERE id = ?').get(Number(result.lastInsertRowid)) as Row)
}

export function actualizarContactoCliente(
	db: DatabaseSync,
	clienteId: number,
	input: { readonly nombre: string; readonly correo: string; readonly telefono: string },
): void {
	db.prepare(`
		UPDATE cliente SET nombre = ?, correo = ?, telefono = ?, actualizado_en = ?
		WHERE id = ?
	`).run(input.nombre, input.correo, input.telefono, ts(), clienteId)
}

export function leerCliente(db: DatabaseSync, clienteId: number): Cliente | undefined {
	const row = db.prepare('SELECT * FROM cliente WHERE id = ?').get(clienteId) as Row | undefined
	return row ? mapCliente(row) : undefined
}

export interface FilaClienteResumen {
	readonly cliente: Cliente
	readonly contratos: number
	readonly facturasAbiertas: number
	readonly facturasPagadas: number
	readonly deudaCentavos: number
	readonly vencimientoAntiguo: string | null
}

export function listarClientesResumen(db: DatabaseSync, busqueda = ''): FilaClienteResumen[] {
	const q = busqueda.trim().toLowerCase()
	const like = q ? `%${q.replaceAll('%', '')}%` : null
	const rows = db.prepare(`
		SELECT
			c.*,
			COUNT(DISTINCT cp.id) AS contratos,
			COALESCE(SUM(CASE WHEN f.estado = 'abierta' THEN 1 ELSE 0 END), 0) AS abiertas,
			COALESCE(SUM(CASE WHEN f.estado = 'pagada' THEN 1 ELSE 0 END), 0) AS pagadas,
			COALESCE(SUM(CASE WHEN f.estado = 'abierta' THEN f.saldo_centavos ELSE 0 END), 0) AS deuda,
			MIN(CASE WHEN f.estado = 'abierta' THEN f.vencimiento ELSE NULL END) AS vencimiento_antiguo
		FROM cliente c
		LEFT JOIN contrato_proveedor cp ON cp.cliente_id = c.id
		LEFT JOIN factura f ON f.cliente_id = c.id
		WHERE (
			? IS NULL
			OR lower(c.nombre) LIKE ?
			OR lower(c.identificacion_mostrar) LIKE ?
			OR lower(c.identificacion_normalizada) LIKE ?
		)
		GROUP BY c.id
		ORDER BY c.nombre COLLATE NOCASE, c.id
	`).all(like, like, like, like) as Row[]
	return rows.map(row => ({
		cliente: mapCliente(row),
		contratos: Number(row.contratos),
		facturasAbiertas: Number(row.abiertas),
		facturasPagadas: Number(row.pagadas),
		deudaCentavos: Number(row.deuda),
		vencimientoAntiguo: row.vencimiento_antiguo === null ? null : String(row.vencimiento_antiguo),
	}))
}

export function listarFacturasPorCliente(db: DatabaseSync, clienteId: number): Factura[] {
	const rows = db.prepare(`
		SELECT * FROM factura WHERE cliente_id = ?
		ORDER BY estado ASC, vencimiento ASC, id ASC
	`).all(clienteId) as Row[]
	return rows.map(mapFactura)
}

export interface EventoHistorial {
	readonly id: number
	readonly ocurridoEn: string
	readonly tipo: string
	readonly facturaId: number | null
	readonly payload: Record<string, unknown>
}

export function listarHistorialCliente(db: DatabaseSync, clienteId: number): EventoHistorial[] {
	const rows = db.prepare(`
		SELECT * FROM historial_cliente WHERE cliente_id = ?
		ORDER BY ocurrido_en DESC, id DESC
	`).all(clienteId) as Row[]
	return rows.map(row => ({
		id: Number(row.id),
		ocurridoEn: String(row.ocurrido_en),
		tipo: String(row.tipo),
		facturaId: row.factura_id === null ? null : Number(row.factura_id),
		payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
	}))
}

export interface FilaDetalleCorrida {
	readonly id: number
	readonly idContratoIsp: number | null
	readonly idCuotaProveedor: string | null
	readonly clienteId: number | null
	readonly clienteNombre: string | null
	readonly facturaId: number | null
	readonly resultado: string
	readonly detalle: string
	readonly montoCentavos: number | null
}

export function listarDetalleCorrida(db: DatabaseSync, corridaId: number): FilaDetalleCorrida[] {
	const rows = db.prepare(`
		SELECT cd.*, c.nombre AS cliente_nombre
		FROM corrida_detalle cd
		LEFT JOIN cliente c ON c.id = cd.cliente_id
		WHERE cd.corrida_id = ?
		ORDER BY cd.id ASC
	`).all(corridaId) as Row[]
	return rows.map(row => ({
		id: Number(row.id),
		idContratoIsp: row.id_contrato_isp === null ? null : Number(row.id_contrato_isp),
		idCuotaProveedor: row.id_cuota_proveedor === null ? null : String(row.id_cuota_proveedor),
		clienteId: row.cliente_id === null ? null : Number(row.cliente_id),
		clienteNombre: row.cliente_nombre === null ? null : String(row.cliente_nombre),
		facturaId: row.factura_id === null ? null : Number(row.factura_id),
		resultado: String(row.resultado),
		detalle: String(row.detalle),
		montoCentavos: row.monto_centavos === null ? null : Number(row.monto_centavos),
	}))
}

// -------------------------------------------------------------- contrato_proveedor

function mapContrato(row: Row): ContratoProveedor {
	return {
		id: Number(row.id),
		proveedorId: Number(row.proveedor_id),
		clienteId: Number(row.cliente_id),
		idContratoIsp: Number(row.id_contrato_isp),
		codigo: String(row.codigo),
		estado: String(row.estado),
		planCodigo: String(row.plan_codigo),
		planNombre: String(row.plan_nombre),
		precioMesCentavos: Number(row.precio_mes_centavos),
		sucursalSigla: String(row.sucursal_sigla),
		sucursalNombre: String(row.sucursal_nombre),
		direccion: String(row.direccion),
		vistoEn: String(row.visto_en),
	}
}

export interface ContratoProveedorInput {
	readonly proveedorId: number
	readonly clienteId: number
	readonly idContratoIsp: number
	readonly codigo: string
	readonly estado: string
	readonly planCodigo: string
	readonly planNombre: string
	readonly precioMesCentavos: number
	readonly sucursalSigla: string
	readonly sucursalNombre: string
	readonly direccion: string
}

export function guardarContratoProveedor(db: DatabaseSync, input: ContratoProveedorInput): ContratoProveedor {
	const vistoEn = ts()
	db.prepare(`
		INSERT INTO contrato_proveedor (
			proveedor_id, cliente_id, id_contrato_isp, codigo, estado,
			plan_codigo, plan_nombre, precio_mes_centavos, sucursal_sigla, sucursal_nombre, direccion, visto_en
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(proveedor_id, id_contrato_isp) DO UPDATE SET
			cliente_id = excluded.cliente_id,
			codigo = excluded.codigo,
			estado = excluded.estado,
			plan_codigo = excluded.plan_codigo,
			plan_nombre = excluded.plan_nombre,
			precio_mes_centavos = excluded.precio_mes_centavos,
			sucursal_sigla = excluded.sucursal_sigla,
			sucursal_nombre = excluded.sucursal_nombre,
			direccion = excluded.direccion,
			visto_en = excluded.visto_en
	`).run(
		input.proveedorId, input.clienteId, input.idContratoIsp, input.codigo, input.estado,
		input.planCodigo, input.planNombre, input.precioMesCentavos,
		input.sucursalSigla, input.sucursalNombre, input.direccion, vistoEn,
	)
	const row = db.prepare(`
		SELECT * FROM contrato_proveedor WHERE proveedor_id = ? AND id_contrato_isp = ?
	`).get(input.proveedorId, input.idContratoIsp) as Row
	return mapContrato(row)
}

export function listarContratosPorCliente(db: DatabaseSync, clienteId: number): ContratoProveedor[] {
	const rows = db.prepare('SELECT * FROM contrato_proveedor WHERE cliente_id = ? ORDER BY id_contrato_isp').all(clienteId) as Row[]
	return rows.map(mapContrato)
}

// --------------------------------------------------------------------- facturas

function mapFactura(row: Row): Factura {
	return {
		id: Number(row.id),
		proveedorId: Number(row.proveedor_id),
		numero: String(row.numero),
		clienteId: Number(row.cliente_id),
		contratoProveedorId: Number(row.contrato_proveedor_id),
		idCuotaProveedor: String(row.id_cuota_proveedor),
		idContratoIsp: Number(row.id_contrato_isp),
		periodo: String(row.periodo),
		descripcion: String(row.descripcion),
		vencimiento: String(row.vencimiento),
		corte: String(row.corte),
		moneda: String(row.moneda),
		totalCentavos: Number(row.total_centavos),
		saldoCentavos: Number(row.saldo_centavos),
		estado: row.estado as EstadoFactura,
		pagadaEn: row.pagada_en === null ? null : String(row.pagada_en),
		idFacturaIsp: row.id_factura_isp === null ? null : Number(row.id_factura_isp),
		numFacturaIsp: row.num_factura_isp === null ? null : String(row.num_factura_isp),
		corridaImportacionId: row.corrida_importacion_id === null ? null : Number(row.corrida_importacion_id),
		importadaEn: String(row.importada_en),
	}
}

export function siguienteNumeroFactura(db: DatabaseSync): string {
	const row = db.prepare(`
		SELECT COALESCE(MAX(CAST(substr(numero, 5) AS INTEGER)), 0) AS max_seq
		FROM factura WHERE numero GLOB 'FAC-[0-9]*'
	`).get() as Row
	return numeroFacturaDesdeSecuencia(Number(row.max_seq) + 1)
}

export function buscarFacturaPorCuota(
	db: DatabaseSync,
	proveedorId: number,
	idCuotaProveedor: string,
): Factura | undefined {
	const row = db.prepare(`
		SELECT * FROM factura WHERE proveedor_id = ? AND id_cuota_proveedor = ?
	`).get(proveedorId, idCuotaProveedor) as Row | undefined
	return row ? mapFactura(row) : undefined
}

export interface NuevaFactura {
	readonly proveedorId: number
	readonly clienteId: number
	readonly contratoProveedorId: number
	readonly idCuotaProveedor: string
	readonly idContratoIsp: number
	readonly periodo: string
	readonly descripcion: string
	readonly vencimiento: string
	readonly corte: string
	readonly totalCentavos: number
	readonly corridaImportacionId: number | null
}

export function crearFactura(db: DatabaseSync, input: NuevaFactura): Factura {
	const ahora = ts()
	const numero = siguienteNumeroFactura(db)
	const result = db.prepare(`
		INSERT INTO factura (
			proveedor_id, numero, cliente_id, contrato_proveedor_id, id_cuota_proveedor, id_contrato_isp,
			periodo, descripcion, vencimiento, corte, moneda, total_centavos, saldo_centavos, estado,
			corrida_importacion_id, importada_en
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, 'abierta', ?, ?)
	`).run(
		input.proveedorId, numero, input.clienteId, input.contratoProveedorId, input.idCuotaProveedor,
		input.idContratoIsp, input.periodo, input.descripcion, input.vencimiento, input.corte,
		input.totalCentavos, input.totalCentavos, input.corridaImportacionId, ahora,
	)
	return mapFactura(db.prepare('SELECT * FROM factura WHERE id = ?').get(Number(result.lastInsertRowid)) as Row)
}

export function listarFacturasAbiertas(db: DatabaseSync, proveedorId: number): Factura[] {
	const rows = db.prepare(`
		SELECT * FROM factura WHERE proveedor_id = ? AND estado = 'abierta' ORDER BY vencimiento, id
	`).all(proveedorId) as Row[]
	return rows.map(mapFactura)
}

export function listarFacturasPagadas(db: DatabaseSync, proveedorId: number): Factura[] {
	const rows = db.prepare(`
		SELECT * FROM factura WHERE proveedor_id = ? AND estado = 'pagada' ORDER BY pagada_en, id
	`).all(proveedorId) as Row[]
	return rows.map(mapFactura)
}

export function marcarFacturaPagada(
	db: DatabaseSync,
	facturaId: number,
	input: { readonly idFacturaIsp: number; readonly numFacturaIsp: string },
): void {
	const pagadaEn = ts()
	db.prepare(`
		UPDATE factura SET estado = 'pagada', saldo_centavos = 0, pagada_en = ?,
			id_factura_isp = ?, num_factura_isp = ?
		WHERE id = ?
	`).run(pagadaEn, input.idFacturaIsp, input.numFacturaIsp, facturaId)
}

export function reabrirFactura(db: DatabaseSync, facturaId: number): void {
	const row = db.prepare('SELECT total_centavos FROM factura WHERE id = ?').get(facturaId) as Row
	db.prepare(`
		UPDATE factura SET estado = 'abierta', saldo_centavos = ?, pagada_en = NULL,
			id_factura_isp = NULL, num_factura_isp = NULL
		WHERE id = ?
	`).run(Number(row.total_centavos), facturaId)
}

// --------------------------------------------------------------------- corridas

function mapCorrida(row: Row): Corrida {
	return {
		id: Number(row.id),
		proveedorId: Number(row.proveedor_id),
		tipo: row.tipo as TipoCorrida,
		simulacion: Number(row.simulacion) === 1,
		estado: row.estado as EstadoCorrida,
		inicioEn: String(row.inicio_en),
		finEn: row.fin_en === null ? null : String(row.fin_en),
		duracionMs: row.duracion_ms === null ? null : Number(row.duracion_ms),
		error: row.error === null ? null : String(row.error),
		resumen: String(row.resumen),
		contadores: parseContadores(String(row.contadores)),
	}
}

export function iniciarCorrida(
	db: DatabaseSync,
	input: { readonly proveedorId: number; readonly tipo: TipoCorrida; readonly simulacion: boolean },
): Corrida {
	const inicioEn = ts()
	const result = db.prepare(`
		INSERT INTO corrida (proveedor_id, tipo, simulacion, estado, inicio_en)
		VALUES (?, ?, ?, 'en_curso', ?)
	`).run(input.proveedorId, input.tipo, input.simulacion ? 1 : 0, inicioEn)
	return mapCorrida(db.prepare('SELECT * FROM corrida WHERE id = ?').get(Number(result.lastInsertRowid)) as Row)
}

export function finalizarCorrida(
	db: DatabaseSync,
	corridaId: number,
	input: {
		readonly estado: EstadoCorrida
		readonly resumen: string
		readonly contadores: Record<string, number>
		readonly error?: string
		readonly inicioEn: string
	},
): void {
	const fin = ts()
	const duracionMs = Math.max(0, Date.parse(fin) - Date.parse(input.inicioEn))
	db.prepare(`
		UPDATE corrida SET estado = ?, fin_en = ?, duracion_ms = ?, error = ?, resumen = ?, contadores = ?
		WHERE id = ?
	`).run(
		input.estado, fin, duracionMs, input.error ?? null, input.resumen, JSON.stringify(input.contadores), corridaId,
	)
}

export function registrarDetalleCorrida(
	db: DatabaseSync,
	input: {
		readonly corridaId: number
		readonly idContratoIsp: number | null
		readonly idCuotaProveedor: string | null
		readonly clienteId: number | null
		readonly facturaId: number | null
		readonly resultado: string
		readonly detalle: string
		readonly montoCentavos: number | null
	},
): void {
	db.prepare(`
		INSERT INTO corrida_detalle (
			corrida_id, id_contrato_isp, id_cuota_proveedor, cliente_id, factura_id,
			resultado, detalle, monto_centavos
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		input.corridaId, input.idContratoIsp, input.idCuotaProveedor, input.clienteId, input.facturaId,
		input.resultado, input.detalle, input.montoCentavos,
	)
}

export function listarCorridas(db: DatabaseSync, limite: number): Corrida[] {
	const rows = db.prepare(`
		SELECT * FROM corrida ORDER BY inicio_en DESC, id DESC LIMIT ?
	`).all(limite) as Row[]
	return rows.map(mapCorrida)
}

export function leerCorrida(db: DatabaseSync, corridaId: number): Corrida | undefined {
	const row = db.prepare('SELECT * FROM corrida WHERE id = ?').get(corridaId) as Row | undefined
	return row ? mapCorrida(row) : undefined
}

// --------------------------------------------------------------------- historial

export function registrarHistorial(
	db: DatabaseSync,
	input: {
		readonly clienteId: number
		readonly tipo: string
		readonly facturaId: number | null
		readonly payload: Record<string, unknown>
	},
): void {
	db.prepare(`
		INSERT INTO historial_cliente (cliente_id, ocurrido_en, tipo, factura_id, payload)
		VALUES (?, ?, ?, ?, ?)
	`).run(input.clienteId, ts(), input.tipo, input.facturaId, JSON.stringify(input.payload))
}

// ------------------------------------------------------------------ agregados

export function borrarDatosImportados(db: DatabaseSync): void {
	db.exec(`
		DELETE FROM historial_cliente;
		DELETE FROM corrida_detalle;
		DELETE FROM factura;
		DELETE FROM contrato_proveedor;
		DELETE FROM corrida;
		DELETE FROM cliente;
		UPDATE proveedor SET ultima_corrida_automatica_fecha = NULL WHERE id = 1;
	`)
}

export interface TotalesResumen {
	readonly clientes: number
	readonly contratos: number
	readonly facturasAbiertas: number
	readonly facturasPagadas: number
	readonly porCobrarCentavos: number
}

export function totalesResumen(db: DatabaseSync): TotalesResumen {
	const clientes = Number((db.prepare('SELECT COUNT(*) AS n FROM cliente').get() as Row).n)
	const contratos = Number((db.prepare('SELECT COUNT(*) AS n FROM contrato_proveedor').get() as Row).n)
	const abiertas = db.prepare(`
		SELECT COUNT(*) AS n, COALESCE(SUM(saldo_centavos), 0) AS saldo
		FROM factura WHERE estado = 'abierta'
	`).get() as Row
	const pagadas = Number((db.prepare(`SELECT COUNT(*) AS n FROM factura WHERE estado = 'pagada'`).get() as Row).n)
	return {
		clientes,
		contratos,
		facturasAbiertas: Number(abiertas.n),
		facturasPagadas: pagadas,
		porCobrarCentavos: Number(abiertas.saldo),
	}
}
