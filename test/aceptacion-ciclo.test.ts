/**
 * Ciclo §5: importar → pagos simulados → actualizar pagadas.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import type { DatabaseSync } from 'node:sqlite'

import { closeCobrixDatabase, openCobrixDatabase } from '../src/cobrix/db.ts'
import { borrarDatosImportados, totalesResumen } from '../src/cobrix/repos.ts'
import { ejecutarImportacion } from '../src/cobrix/sync/importacion.ts'
import { ejecutarActualizacionPagadas } from '../src/cobrix/sync/pagadas.ts'
import { seedBillingApi } from '../src/billing-api/seed.ts'
import { createBillingApiServer, type BillingApiServer } from '../src/billing-api/server.ts'

process.env.SANDBOX_TODAY = '2026-10-13'

async function simPagar(baseUrl: string, body: Record<string, unknown>): Promise<void> {
	const response = await fetch(`${baseUrl}/__sim/pagar`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
	assert.ok(response.ok, await response.text())
}

async function simAnular(baseUrl: string, idFactura: number): Promise<void> {
	const response = await fetch(`${baseUrl}/__sim/anular`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id_factura: idFactura }),
	})
	assert.ok(response.ok, await response.text())
}

describe('aceptación — ciclo completo', () => {
	let dir: string
	let api: BillingApiServer
	let baseUrl: string
	let db: DatabaseSync

	before(async () => {
		dir = mkdtempSync(join(tmpdir(), 'cobrix-ciclo-'))
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

	it('importación, pagos ISP y actualización de pagadas', async () => {
		borrarDatosImportados(db)
		db.prepare('UPDATE proveedor SET url_api = ? WHERE id = 1').run(baseUrl)

		await ejecutarImportacion(db, false)

		await simPagar(baseUrl, { id_contrato: 900101 })
		await simPagar(baseUrl, { id_contrato: 900103, monto: 25 })
		await simPagar(baseUrl, { id_contrato: 900104 })
		await simPagar(baseUrl, { id_contrato: 900114, monto: 70 })

		const elenaPago = await (await fetch(`${baseUrl}/__sim/pagar`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id_contrato: 900113 }),
		})).json() as { id_factura?: number }
		assert.ok(elenaPago.id_factura)
		await simAnular(baseUrl, elenaPago.id_factura!)

		await ejecutarActualizacionPagadas(db, false)

		const totales = totalesResumen(db)
		assert.equal(totales.facturasPagadas, 8)
		assert.equal(totales.facturasAbiertas, 34)
		assert.equal(totales.porCobrarCentavos, 95_500)

		await ejecutarActualizacionPagadas(db, false)
		const despues = totalesResumen(db)
		assert.equal(despues.facturasPagadas, 8)
		assert.equal(despues.facturasAbiertas, 34)
	})
})
