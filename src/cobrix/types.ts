/**
 * Tipos del dominio persistido en Cobrix.
 */

export type TipoPersona = 'natural' | 'juridico'
export type EstadoFactura = 'abierta' | 'pagada'
export type TipoCorrida = 'importacion' | 'actualizacion_pagadas'
export type EstadoCorrida = 'en_curso' | 'completada' | 'fallida'

export interface Empresa {
	readonly nombre: string
	readonly rif: string
	readonly correoCobranza: string
	readonly actualizadoEn: string
}

export interface Proveedor {
	readonly id: number
	readonly nombreVisible: string
	readonly urlApi: string
	readonly usuario: string
	readonly estadosImportables: readonly string[]
	readonly ventanaMeses: number | null
	readonly maxCuotasRecientes: number | null
	readonly diasGraciaCorte: number
	readonly topeFacturasCorrida: number
	readonly topeMontoCentavosCorrida: number
	readonly tiposDocumentoExcluidos: readonly string[]
	readonly mesesConsultaPagadas: number
	readonly corridaAutomaticaActiva: boolean
	readonly corridaAutomaticaHora: string | null
	readonly actualizadoEn: string
}

export interface ProveedorEditable {
	readonly nombreVisible: string
	readonly urlApi: string
	readonly usuario: string
	readonly estadosImportables: readonly string[]
	readonly ventanaMeses: number | null
	readonly maxCuotasRecientes: number | null
	readonly diasGraciaCorte: number
	readonly topeFacturasCorrida: number
	readonly topeMontoCentavosCorrida: number
	readonly tiposDocumentoExcluidos: readonly string[]
	readonly mesesConsultaPagadas: number
	readonly corridaAutomaticaActiva: boolean
	readonly corridaAutomaticaHora: string | null
}

export interface Cliente {
	readonly id: number
	readonly proveedorId: number
	readonly identificacionNormalizada: string
	readonly identificacionMostrar: string
	readonly tipoPersona: TipoPersona
	readonly nombre: string
	readonly correo: string
	readonly telefono: string
	readonly origen: string
	readonly creadoEn: string
	readonly actualizadoEn: string
}

export interface ContratoProveedor {
	readonly id: number
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
	readonly vistoEn: string
}

export interface Factura {
	readonly id: number
	readonly proveedorId: number
	readonly numero: string
	readonly clienteId: number
	readonly contratoProveedorId: number
	readonly idCuotaProveedor: string
	readonly idContratoIsp: number
	readonly periodo: string
	readonly descripcion: string
	readonly vencimiento: string
	readonly corte: string
	readonly moneda: string
	readonly totalCentavos: number
	readonly saldoCentavos: number
	readonly estado: EstadoFactura
	readonly pagadaEn: string | null
	readonly idFacturaIsp: number | null
	readonly numFacturaIsp: string | null
	readonly corridaImportacionId: number | null
	readonly importadaEn: string
}

export interface Corrida {
	readonly id: number
	readonly proveedorId: number
	readonly tipo: TipoCorrida
	readonly simulacion: boolean
	readonly estado: EstadoCorrida
	readonly inicioEn: string
	readonly finEn: string | null
	readonly duracionMs: number | null
	readonly error: string | null
	readonly resumen: string
	readonly contadores: Record<string, number>
}
