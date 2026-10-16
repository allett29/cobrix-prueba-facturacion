/**
 * Corrida automática diaria (America/Caracas): importación y luego actualización de pagadas.
 */

import type { DatabaseSync } from 'node:sqlite'

import { leerProveedor, leerUltimaCorridaAutomaticaFecha, marcarCorridaAutomaticaFecha } from './repos.ts'
import { ejecutarImportacion } from './sync/importacion.ts'
import { ejecutarActualizacionPagadas } from './sync/pagadas.ts'

const TZ = 'America/Caracas'
const INTERVALO_MS = 30_000

export interface RelojCaracas {
	readonly fecha: string
	readonly horaMinuto: string
}

export function relojCaracas(now = new Date()): RelojCaracas {
	const fecha = new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(now)
	const horaMinuto = new Intl.DateTimeFormat('en-GB', {
		timeZone: TZ,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(now)
	return { fecha, horaMinuto }
}

/** Normaliza "6:00" → "06:00" para comparar con el reloj de Caracas. */
export function normalizarHoraConfig(hora: string): string {
	const [h, m = '0'] = hora.trim().split(':')
	return `${Number(h).toString().padStart(2, '0')}:${Number(m).toString().padStart(2, '0')}`
}

export function debeEjecutarCorridaAutomatica(
	proveedor: { readonly corridaAutomaticaActiva: boolean; readonly corridaAutomaticaHora: string | null },
	reloj: RelojCaracas,
	ultimaFecha: string | null,
): boolean {
	if (!proveedor.corridaAutomaticaActiva || !proveedor.corridaAutomaticaHora) return false
	if (ultimaFecha === reloj.fecha) return false
	return normalizarHoraConfig(proveedor.corridaAutomaticaHora) === reloj.horaMinuto
}

export function iniciarCorridaAutomatica(db: DatabaseSync): () => void {
	let enCurso = false

	const tick = (): void => {
		if (enCurso) return
		const proveedor = leerProveedor(db)
		const reloj = relojCaracas()
		const ultima = leerUltimaCorridaAutomaticaFecha(db)
		if (!debeEjecutarCorridaAutomatica(proveedor, reloj, ultima)) return

		enCurso = true
		void (async () => {
			try {
				console.log(`[corrida-automatica] Inicio (${reloj.fecha} ${reloj.horaMinuto} Caracas)`)
				await ejecutarImportacion(db, false)
				await ejecutarActualizacionPagadas(db, false)
				marcarCorridaAutomaticaFecha(db, reloj.fecha)
				console.log('[corrida-automatica] Completada')
			} catch (error) {
				console.error('[corrida-automatica]', error)
			} finally {
				enCurso = false
			}
		})()
	}

	tick()
	const timer = setInterval(tick, INTERVALO_MS)
	return () => clearInterval(timer)
}
