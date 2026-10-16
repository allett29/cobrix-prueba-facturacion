/**
 * Normalización de identificación del titular (§4 clientes).
 */

import type { TipoPersona } from '../types.ts'

const TIPOS_DOCUMENTO = new Set(['V', 'E', 'J', 'G', 'P'])

export function normalizarIdentificacion(raw: string): string | null {
	const compact = raw.trim().replaceAll(/[\s.\-_]/g, '').toUpperCase()
	if (!compact) return null

	const match = /^([VEJGP])?(\d+)$/.exec(compact)
	if (!match) return null

	const letter = match[1]
	const digits = match[2]!.replace(/^0+/, '') || '0'
	if (!/^\d+$/.test(digits) || digits.length < 6 || digits.length > 12) return null

	return letter ? `${letter}${digits}` : digits
}

export function tipoPersonaDesdeIdentificacion(normalizada: string): TipoPersona {
	const letter = normalizada.charAt(0)
	if (TIPOS_DOCUMENTO.has(letter) && (letter === 'J' || letter === 'G')) return 'juridico'
	return 'natural'
}

export function tipoDocumentoDesdeIdentificacion(normalizada: string): string | null {
	const letter = normalizada.charAt(0)
	return TIPOS_DOCUMENTO.has(letter) ? letter : null
}

/** Presentación legible sin alterar la clave normalizada. */
export function identificacionParaMostrar(normalizada: string): string {
	const letter = normalizada.charAt(0)
	if (TIPOS_DOCUMENTO.has(letter)) {
		return `${letter}-${normalizada.slice(1)}`
	}
	return normalizada
}
