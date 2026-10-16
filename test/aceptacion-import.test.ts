/**
 * Criterios de aceptación §5 — importación (fecha fija 2026-10-13).
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import type { DatabaseSync } from 'node:sqlite'

import { closeCobrixDatabase, openCobrixDatabase } from '../src/cobrix/db.ts'
import { buscarClientePorIdentificacion, borrarDatosImportados, leerCorrida, totalesResumen } from '../src/cobrix/repos.ts'
import { ejecutarImportacion } from '../src/cobrix/sync/importacion.ts'
import { seedBillingApi } from '../src/billing-api/seed.ts'
import { createBillingApiServer, type BillingApiServer } from '../src/billing-api/server.ts'

process.env.SANDBOX_TODAY = '2026-10-13'

describe('aceptación — importación', () => {
	let dir: string
	let api: BillingApiServer
	let baseUrl: string
	let db: DatabaseSync

	before(async () => {
		dir = mkdtempSync(join(tmpdir(), 'cobrix-acept-'))
		seedBillingApi(join(dir, 'billing-api.sqlite'))
		api = createBillingApiServer(join(dir, 'billing-api.sqlite'))
		const port = await api.listen(0)
		baseUrl = `http://127.0.0.1:${port}`
		const handle = openCobrixDatabase(join(dir, 'cobrix.sqlite'), { apiBaseUrl: baseUrl })
		db = handle.db
	})

	after(async () => {
		db.close()
		await api.close()
		rmSync(dir, { recursive: true, force: true })
	})

	it('simular e importar cumple totales del enunciado', async () => {
		borrarDatosImportados(db)
		db.prepare('UPDATE proveedor SET url_api = ? WHERE id = 1').run(baseUrl)

		const simId = await ejecutarImportacion(db, true)
		const sim = leerCorrida(db, simId)!
		assert.equal(sim.contadores.installmentsWouldImport, 42)

		const impId = await ejecutarImportacion(db, false)
		const imp = leerCorrida(db, impId)!
		assert.equal(imp.contadores.customersCreated, 20)
		assert.equal(imp.contadores.installmentsImported, 42)

		const totales = totalesResumen(db)
		assert.equal(totales.clientes, 20)
		assert.equal(totales.facturasAbiertas, 42)
		assert.equal(totales.porCobrarCentavos, 123_500)

		assert.ok(buscarClientePorIdentificacion(db, 1, 'V9876543'))
		assert.ok(buscarClientePorIdentificacion(db, 1, '9000123'))

		const segunda = await ejecutarImportacion(db, false)
		const corrida2 = leerCorrida(db, segunda)!
		assert.equal(corrida2.contadores.installmentsImported, 0)
		assert.equal(corrida2.contadores.installmentsAlreadyImported, 42)
	})
})
