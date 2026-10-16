/**
 * Repositorios Cobrix: configuración, dominio importado y corridas.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { montoApiACentavos, numeroFacturaDesdeSecuencia } from '../src/cobrix/money.ts'
import { closeCobrixDatabase, openCobrixDatabase } from '../src/cobrix/db.ts'
import {
	PROVEEDOR_ID,
	borrarDatosImportados,
	buscarFacturaPorCuota,
	contrasenaProveedor,
	crearCliente,
	crearFactura,
	finalizarCorrida,
	guardarContratoProveedor,
	guardarEmpresa,
	guardarProveedor,
	iniciarCorrida,
	leerEmpresa,
	leerProveedor,
	siguienteNumeroFactura,
	totalesResumen,
} from '../src/cobrix/repos.ts'
import type { CobrixDatabase } from '../src/cobrix/db.ts'

describe('repositorios Cobrix', () => {
	let dir: string
	let handle: CobrixDatabase

	before(() => {
		dir = mkdtempSync(join(tmpdir(), 'cobrix-repos-'))
		handle = openCobrixDatabase(join(dir, 'cobrix.sqlite'), { apiBaseUrl: 'http://127.0.0.1:4310' })
	})

	after(() => {
		closeCobrixDatabase(handle)
		rmSync(dir, { recursive: true, force: true })
	})

	it('actualiza empresa y proveedor sin rotar contraseña vacía', () => {
		guardarEmpresa(handle.db, { nombre: 'Mi ISP', rif: 'J-1', correoCobranza: 'a@b.com' })
		assert.equal(leerEmpresa(handle.db).nombre, 'Mi ISP')
		const antes = contrasenaProveedor(handle.db)
		const prov = leerProveedor(handle.db)
		guardarProveedor(handle.db, {
			nombreVisible: prov.nombreVisible,
			urlApi: 'http://127.0.0.1:4310',
			usuario: prov.usuario,
			estadosImportables: prov.estadosImportables,
			ventanaMeses: prov.ventanaMeses,
			maxCuotasRecientes: prov.maxCuotasRecientes,
			diasGraciaCorte: 3,
			topeFacturasCorrida: prov.topeFacturasCorrida,
			topeMontoCentavosCorrida: prov.topeMontoCentavosCorrida,
			tiposDocumentoExcluidos: prov.tiposDocumentoExcluidos,
			mesesConsultaPagadas: prov.mesesConsultaPagadas,
			corridaAutomaticaActiva: prov.corridaAutomaticaActiva,
			corridaAutomaticaHora: prov.corridaAutomaticaHora,
		})
		assert.equal(contrasenaProveedor(handle.db), antes)
		assert.equal(leerProveedor(handle.db).diasGraciaCorte, 3)
	})

	it('crea cliente, contrato, factura y corrida', () => {
		borrarDatosImportados(handle.db)
		const cliente = crearCliente(handle.db, {
			proveedorId: PROVEEDOR_ID,
			identificacionNormalizada: 'V12345678',
			identificacionMostrar: 'V-12345678',
			tipoPersona: 'natural',
			nombre: 'ANA PEREZ',
			correo: 'a@example.com',
			telefono: '04120000000',
			origen: 'test',
		})
		const contrato = guardarContratoProveedor(handle.db, {
			proveedorId: PROVEEDOR_ID,
			clienteId: cliente.id,
			idContratoIsp: 900101,
			codigo: '0900101',
			estado: 'ACTIVO',
			planCodigo: 'PLAN15MB25',
			planNombre: 'PLAN15MB25',
			precioMesCentavos: montoApiACentavos(25),
			sucursalSigla: 'CCS',
			sucursalNombre: 'Caracas',
			direccion: 'Calle 1',
		})
		const corrida = iniciarCorrida(handle.db, { proveedorId: PROVEEDOR_ID, tipo: 'importacion', simulacion: false })
		assert.equal(corrida.estado, 'en_curso')
		const factura = crearFactura(handle.db, {
			proveedorId: PROVEEDOR_ID,
			clienteId: cliente.id,
			contratoProveedorId: contrato.id,
			idCuotaProveedor: '7000008',
			idContratoIsp: 900101,
			periodo: '2026-08',
			descripcion: 'PLAN - 2026 Agosto',
			vencimiento: '2026-08-01',
			corte: '2026-08-01',
			totalCentavos: montoApiACentavos(20),
			corridaImportacionId: corrida.id,
		})
		assert.equal(factura.numero, numeroFacturaDesdeSecuencia(1))
		assert.ok(buscarFacturaPorCuota(handle.db, PROVEEDOR_ID, '7000008'))
		finalizarCorrida(handle.db, corrida.id, {
			estado: 'completada',
			resumen: 'Importadas: 1',
			contadores: { installmentsImported: 1 },
			inicioEn: corrida.inicioEn,
		})
		const totales = totalesResumen(handle.db)
		assert.equal(totales.clientes, 1)
		assert.equal(totales.facturasAbiertas, 1)
		assert.equal(totales.porCobrarCentavos, montoApiACentavos(20))
		assert.equal(siguienteNumeroFactura(handle.db), numeroFacturaDesdeSecuencia(2))
	})
})
