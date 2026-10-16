import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { debeEjecutarCorridaAutomatica, normalizarHoraConfig } from '../src/cobrix/corrida-automatica.ts'

describe('corrida automática', () => {
	it('normaliza hora de configuración', () => {
		assert.equal(normalizarHoraConfig('6:00'), '06:00')
		assert.equal(normalizarHoraConfig('06:00'), '06:00')
	})

	it('dispara solo una vez al día a la hora configurada', () => {
		const proveedor = { corridaAutomaticaActiva: true, corridaAutomaticaHora: '6:00' }
		const reloj = { fecha: '2026-10-13', horaMinuto: '06:00' }
		assert.equal(debeEjecutarCorridaAutomatica(proveedor, reloj, null), true)
		assert.equal(debeEjecutarCorridaAutomatica(proveedor, reloj, '2026-10-13'), false)
		assert.equal(debeEjecutarCorridaAutomatica(proveedor, { ...reloj, horaMinuto: '06:01' }, null), false)
		assert.equal(debeEjecutarCorridaAutomatica({ ...proveedor, corridaAutomaticaActiva: false }, reloj, null), false)
	})
})
