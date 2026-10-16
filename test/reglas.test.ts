/**
 * Reglas de negocio §4 (sin HTTP).
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	clasificarCuotaEnLedger,
	documentoExcluido,
	esFilaSinDeuda,
	esSaldoResidual,
	estadoContratoImportable,
	identificacionParaMostrar,
	limitarCuotasRecientes,
	normalizarIdentificacion,
	periodoDesdeDetalleDeuda,
	periodoDentroDeVentana,
	tipoPersonaDesdeIdentificacion,
	validarContratoIndividual,
} from '../src/cobrix/reglas/index.ts'
import { fechaCorte } from '../src/cobrix/reglas/periodo.ts'

process.env.SANDBOX_TODAY = '2026-10-13'

describe('identificación', () => {
	it('normaliza V y ceros a la izquierda', () => {
		assert.equal(normalizarIdentificacion('V-12345678'), 'V12345678')
		assert.equal(normalizarIdentificacion('09000123'), '9000123')
		assert.equal(tipoPersonaDesdeIdentificacion('J401234567'), 'juridico')
		assert.equal(tipoPersonaDesdeIdentificacion('V12345678'), 'natural')
	})

	it('rechaza identificación inválida', () => {
		assert.equal(normalizarIdentificacion(''), null)
		assert.equal(normalizarIdentificacion('123'), null)
	})
})

describe('periodo y cuota', () => {
	it('extrae periodo desde detalle_deuda', () => {
		const parsed = periodoDesdeDetalleDeuda(['PLAN15MB25 - 2026 Agosto'])
		assert.deepEqual(parsed, {
			periodo: '2026-08',
			vencimiento: '2026-08-01',
			descripcion: 'PLAN15MB25 - 2026 Agosto',
		})
		assert.equal(fechaCorte('2026-08-01', 5), '2026-08-06')
	})

	it('detecta fila sin deuda y saldo residual', () => {
		assert.equal(esFilaSinDeuda('0'), true)
		assert.equal(esSaldoResidual(0.001317), true)
		assert.equal(esSaldoResidual(0.02), false)
	})
})

describe('contrato/individual', () => {
	const base = {
		contrato_id: 900101,
		identificacion_contrato: 'V-12345678',
		estado: 'ACTIVO',
		precio_servicio: '25.000000',
		moneda_sigla: 'USD',
		detalle_deuda: ['PLAN15MB25 - 2026 Agosto'],
	}

	it('acepta filas coherentes', () => {
		const result = validarContratoIndividual([
			{ ...base, deuda_id: '7000008', deuda: 20 },
			{ ...base, deuda_id: '7000009', deuda: 25 },
		])
		assert.equal(result.ok, true)
	})

	it('detecta moneda incoherente', () => {
		const result = validarContratoIndividual([{ ...base, deuda_id: '1', deuda: 0.05 }])
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.razon, 'moneda_incoherente')
	})

	it('detecta cuota duplicada', () => {
		const result = validarContratoIndividual([
			{ ...base, deuda_id: '7000008', deuda: 20 },
			{ ...base, deuda_id: '7000008', deuda: 20 },
		])
		assert.equal(result.ok, false)
	})
})

describe('filtros de importación', () => {
	it('respeta ventana y estados', () => {
		assert.equal(estadoContratoImportable('ACTIVO', ['ACTIVO', 'CORTADO']), true)
		assert.equal(estadoContratoImportable('CORTESIA', ['ACTIVO', 'CORTADO']), false)
		assert.equal(periodoDentroDeVentana('2026-08', 3), true)
		assert.equal(periodoDentroDeVentana('2026-03', 3), false)
		assert.equal(documentoExcluido('J401234567', ['J']), true)
	})

	it('limita cuotas recientes', () => {
		const cuotas = [
			{ periodo: '2026-06', id: 1 },
			{ periodo: '2026-08', id: 2 },
			{ periodo: '2026-09', id: 3 },
		]
		const limitadas = limitarCuotasRecientes(cuotas, 2)
		assert.deepEqual(limitadas.map(c => c.periodo), ['2026-08', '2026-09'])
	})
})

describe('ledger', () => {
	it('marca pagada con saldo 0 y pago', () => {
		const result = clasificarCuotaEnLedger(
			[{ id_factura: 8800007, id_cuota: 7000008, periodo_cuota: '2026-08', tarifa: 25, valor_pago: 25, descuento: 0, saldo_cuota: 0 }],
			{ saldoCobrix: 20, numFactura: '008800007' },
		)
		assert.equal(result.kind, 'pagada')
	})

	it('detecta abono parcial', () => {
		const result = clasificarCuotaEnLedger(
			[{ id_factura: 1, id_cuota: 1, periodo_cuota: '2026-08', tarifa: 20, valor_pago: 5, descuento: 0, saldo_cuota: 15 }],
			{ saldoCobrix: 20 },
		)
		assert.equal(result.kind, 'abono_parcial')
	})

	it('exonerada no es pago', () => {
		const result = clasificarCuotaEnLedger(
			[{ id_factura: 0, id_cuota: 1, periodo_cuota: '2026-08', tarifa: 25, valor_pago: 0, descuento: 0, saldo_cuota: 0 }],
			{ saldoCobrix: 25 },
		)
		assert.equal(result.kind, 'exonerada')
	})
})

describe('presentación', () => {
	it('formatea identificación para UI', () => {
		assert.equal(identificacionParaMostrar('9000123'), '9000123')
		assert.equal(identificacionParaMostrar('V12345678'), 'V-12345678')
	})
})
