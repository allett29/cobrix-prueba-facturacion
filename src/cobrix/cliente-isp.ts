/**
 * Cliente HTTP del administrador de facturas (login Bearer, contratos, cuotas, ledger).
 */

import type { FilaCuotaPendiente } from './reglas/contrato-individual.ts'
import type { LineaLedger } from './reglas/ledger.ts'

export class IspAuthError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'IspAuthError'
	}
}

export class IspHttpError extends Error {
	readonly status: number
	constructor(status: number, message: string) {
		super(message)
		this.name = 'IspHttpError'
		this.status = status
	}
}

export interface IspClientConfig {
	readonly baseUrl: string
	readonly userName: string
	readonly password: string
}

type Row = Record<string, unknown>

export class IspClient {
	private token: string | undefined
	private tokenExpMs: number | undefined
	private readonly config: IspClientConfig

	constructor(config: IspClientConfig) {
		this.config = config
	}

	async probarConexion(): Promise<number> {
		await this.login()
		return (await this.listarIdsContratos()).length
	}

	async login(): Promise<void> {
		const url = `${this.config.baseUrl}/api/v1/usuario/login`
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ user_name: this.config.userName, password: this.config.password }),
		})
		const body = await response.json() as Row
		if (!response.ok) {
			throw new IspAuthError(typeof body.detail === 'object' ? JSON.stringify(body.detail) : 'Login fallido')
		}
		const token = body.access_token
		if (typeof token !== 'string' || !token) throw new IspAuthError('Login sin access_token')
		this.token = token
		const expires = body.access_token_expires_in
		this.tokenExpMs = typeof expires === 'string' ? Date.parse(`${expires}Z`) : Date.now() + 7_200_000
	}

	private async authHeaders(): Promise<HeadersInit> {
		if (!this.token || (this.tokenExpMs !== undefined && Date.now() >= this.tokenExpMs - 30_000)) {
			await this.login()
		}
		return { authorization: `Bearer ${this.token}` }
	}

	private async getJson(path: string): Promise<unknown> {
		const headers = await this.authHeaders()
		const response = await fetch(`${this.config.baseUrl}${path}`, { headers })
		if (response.status === 401) {
			await this.login()
			return this.getJson(path)
		}
		if (!response.ok) throw new IspHttpError(response.status, await response.text())
		return response.json()
	}

	async listarIdsContratos(): Promise<number[]> {
		const body = await this.getJson('/api/v1/isp/lista_ids_contratos') as Row
		const data = body.data
		if (!Array.isArray(data)) throw new IspHttpError(502, 'lista_ids_contratos sin arreglo data')
		return data.map(id => Number(id)).filter(id => Number.isInteger(id))
	}

	async contratoIndividual(idContrato: number): Promise<FilaCuotaPendiente[]> {
		const body = await this.getJson(`/api/v1/isp/contrato/individual?id_contrato=${idContrato}`)
		if (!Array.isArray(body)) throw new IspHttpError(502, 'contrato/individual no devolvió una lista')
		return body.map(row => parseFilaCuota(row))
	}

	async pagoInformacion(input: {
		readonly idContrato: number
		readonly fechaInicio: string
		readonly fechaFin: string
	}): Promise<LineaLedger[]> {
		const path = `/api/v1/isp/pago_informacion?id_contrato=${input.idContrato}&tipo_busqueda=CUOTA&fecha_inicio=${input.fechaInicio}&fecha_fin=${input.fechaFin}`
		const body = await this.getJson(path) as Row
		const data = body.data
		if (!Array.isArray(data)) throw new IspHttpError(502, 'pago_informacion sin arreglo data')
		return data.flatMap(row => parseLineasLedger(row))
	}
}

function parseFilaCuota(row: unknown): FilaCuotaPendiente {
	if (typeof row !== 'object' || row === null) throw new IspHttpError(502, 'Fila de cuota inválida')
	const value = row as Row
	return {
		contrato_id: Number(value.contrato_id),
		identificacion_contrato: String(value.identificacion_contrato ?? ''),
		estado: String(value.estado ?? ''),
		deuda_id: String(value.deuda_id ?? ''),
		deuda: Number(value.deuda ?? 0),
		precio_servicio: String(value.precio_servicio ?? '0'),
		moneda_sigla: String(value.moneda_sigla ?? ''),
		detalle_deuda: Array.isArray(value.detalle_deuda) ? value.detalle_deuda.map(String) : [],
	}
}

function parseLineasLedger(row: unknown): LineaLedger[] {
	if (typeof row !== 'object' || row === null) return []
	const value = row as Row
	const detalle = value.detalle_pago
	if (typeof detalle !== 'object' || detalle === null) return []
	const pago = detalle as Row
	const idCuota = Number(pago.id_cuota)
	if (!Number.isInteger(idCuota)) return []
	return [{
		id_factura: Number(value.id_factura ?? 0),
		id_cuota: idCuota,
		periodo_cuota: String(pago.periodo_cuota ?? ''),
		tarifa: Number(pago.tarifa ?? 0),
		valor_pago: Number(pago.valor_pago ?? 0),
		descuento: Number(pago.descuento ?? 0),
		saldo_cuota: Number(pago.saldo_cuota ?? 0),
	}]
}
