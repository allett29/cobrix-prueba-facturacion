/**
 * Cliente HTTP del administrador simulado.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { IspClient } from '../src/cobrix/cliente-isp.ts'
import { validarContratoIndividual } from '../src/cobrix/reglas/contrato-individual.ts'
import { SANDBOX_API_USER, seedBillingApi } from '../src/billing-api/seed.ts'
import { createBillingApiServer, type BillingApiServer } from '../src/billing-api/server.ts'

process.env.SANDBOX_TODAY = '2026-10-13'

describe('cliente ISP', () => {
	let dir: string
	let api: BillingApiServer
	let baseUrl: string

	before(async () => {
		dir = mkdtempSync(join(tmpdir(), 'cobrix-isp-'))
		seedBillingApi(join(dir, 'billing-api.sqlite'))
		api = createBillingApiServer(join(dir, 'billing-api.sqlite'))
		const port = await api.listen(0)
		baseUrl = `http://127.0.0.1:${port}`
	})

	after(async () => {
		await api.close()
		rmSync(dir, { recursive: true, force: true })
	})

	it('login, lista de contratos y cuotas de ANA PEREZ', async () => {
		const client = new IspClient({
			baseUrl,
			userName: SANDBOX_API_USER.user_name,
			password: SANDBOX_API_USER.password,
		})
		assert.equal(await client.probarConexion(), 27)
		const filas = await client.contratoIndividual(900101)
		const validacion = validarContratoIndividual(filas)
		assert.equal(validacion.ok, true)
		assert.ok(filas.some(fila => fila.deuda_id !== '0'))
	})

	it('pago_informacion trae filas aunque success sea false', async () => {
		const client = new IspClient({
			baseUrl,
			userName: SANDBOX_API_USER.user_name,
			password: SANDBOX_API_USER.password,
		})
		const lineas = await client.pagoInformacion({
			idContrato: 900101,
			fechaInicio: '2026-03-01',
			fechaFin: '2026-10-31',
		})
		assert.ok(lineas.length > 0)
	})
})
