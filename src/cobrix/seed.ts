/**
 * Valores iniciales de empresa y proveedor (sandbox).
 */

import type { DatabaseSync } from 'node:sqlite'

import { SANDBOX_API_USER } from '../billing-api/seed.ts'
import { encryptSecret } from './crypto.ts'

const nowIso = (): string => new Date().toISOString()

export interface CobrixSeedOptions {
	readonly apiBaseUrl: string
}

export function seedCobrixDefaults(db: DatabaseSync, options: CobrixSeedOptions): void {
	const ts = nowIso()
	const empresa = db.prepare('SELECT id FROM empresa WHERE id = 1').get()
	if (!empresa) {
		db.prepare(`
			INSERT INTO empresa (id, nombre, rif, correo_cobranza, actualizado_en)
			VALUES (1, ?, ?, ?, ?)
		`).run('ISP de Prueba (sandbox)', 'J-00000000-0', 'cobranza@example.com', ts)
	}

	const proveedor = db.prepare('SELECT id FROM proveedor WHERE id = 1').get()
	if (!proveedor) {
		const estados = JSON.stringify(['ACTIVO', 'CORTADO'])
		const excluidos = JSON.stringify([])
		db.prepare(`
			INSERT INTO proveedor (
				id, nombre_visible, url_api, usuario, contrasena_cifrada,
				estados_importables, ventana_meses, max_cuotas_recientes, dias_gracia_corte,
				tope_facturas_corrida, tope_monto_centavos_corrida, tipos_documento_excluidos,
				meses_consulta_pagadas, corrida_automatica_activa, corrida_automatica_hora, actualizado_en
			) VALUES (1, ?, ?, ?, ?, ?, NULL, NULL, 0, 500, 5000000, ?, 7, 0, NULL, ?)
		`).run(
			'Administrador de facturas',
			options.apiBaseUrl.replace(/\/+$/, ''),
			SANDBOX_API_USER.user_name,
			encryptSecret(SANDBOX_API_USER.password),
			estados,
			excluidos,
			ts,
		)
	}
}
