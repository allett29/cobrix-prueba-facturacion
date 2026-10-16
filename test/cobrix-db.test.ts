/**
 * Inicialización del esquema Cobrix, seed y cifrado de credenciales.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { decryptSecret, encryptSecret } from '../src/cobrix/crypto.ts'
import { closeCobrixDatabase, openCobrixDatabase } from '../src/cobrix/db.ts'
import { SANDBOX_API_USER } from '../src/billing-api/seed.ts'

describe('base de datos Cobrix', () => {
	let dir: string
	let dbPath: string

	before(() => {
		dir = mkdtempSync(join(tmpdir(), 'cobrix-db-'))
		dbPath = join(dir, 'cobrix.sqlite')
	})

	after(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	it('crea empresa y proveedor con contraseña cifrada', () => {
		const handle = openCobrixDatabase(dbPath, { apiBaseUrl: 'http://127.0.0.1:4310' })
		const proveedor = handle.db.prepare('SELECT url_api, usuario, contrasena_cifrada FROM proveedor WHERE id = 1').get() as {
			url_api: string
			usuario: string
			contrasena_cifrada: string
		}
		assert.equal(proveedor.url_api, 'http://127.0.0.1:4310')
		assert.equal(proveedor.usuario, SANDBOX_API_USER.user_name)
		assert.notEqual(proveedor.contrasena_cifrada, SANDBOX_API_USER.password)
		assert.equal(decryptSecret(proveedor.contrasena_cifrada), SANDBOX_API_USER.password)
		closeCobrixDatabase(handle)
	})

	it('round-trip de cifrado', () => {
		const plain = 'secreto-de-prueba'
		assert.equal(decryptSecret(encryptSecret(plain)), plain)
	})
})
