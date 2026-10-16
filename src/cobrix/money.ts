/**
 * Montos USD: la API del ISP usa decimales; Cobrix persiste centavos enteros.
 */

export function montoApiACentavos(monto: number): number {
	return Math.round(monto * 100)
}

export function centavosAMontoApi(centavos: number): number {
	return centavos / 100
}

/** `FAC-000042` */
export function numeroFacturaDesdeSecuencia(secuencia: number): string {
	return `FAC-${String(secuencia).padStart(6, '0')}`
}
