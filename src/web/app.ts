/**
 * Panel Cobrix (SSR): resumen, clientes, sincronización y configuración.
 */

import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { IspAuthError, IspClient } from '../cobrix/cliente-isp.ts'
import {
	borrarDatosImportados,
	contrasenaProveedor,
	guardarEmpresa,
	guardarProveedor,
	leerCliente,
	leerCorrida,
	leerEmpresa,
	leerProveedor,
	listarClientesResumen,
	listarContratosPorCliente,
	listarCorridas,
	listarDetalleCorrida,
	listarFacturasPorCliente,
	listarHistorialCliente,
	totalesResumen,
	type FilaClienteResumen,
	type FilaDetalleCorrida,
} from '../cobrix/repos.ts'
import { ejecutarImportacion } from '../cobrix/sync/importacion.ts'
import { ejecutarActualizacionPagadas } from '../cobrix/sync/pagadas.ts'
import type { Corrida, Proveedor, ProveedorEditable } from '../cobrix/types.ts'
import { currentPeriod, today } from '../shared/dates.ts'

import { CONTRACT_STATUS_TONE, CSS, date, dateTime, esc, html, layout, period, pill, raw, usd, type Raw, type Tone } from './layout.ts'

export interface AppDeps {
	readonly simulatorUrl: string
	readonly assignmentPath: string
	readonly db: DatabaseSync
}

const TIPOS_DOCUMENTO = ['V', 'E', 'J', 'G', 'P'] as const

const ESTADOS_CONFIG = ['ACTIVO', 'RETIRADO', 'RECHAZADO', 'CORTESIA', 'CORTADO', 'ANULADO'] as const

const DESTACADOS_IMPORT = [
	'contractsObserved',
	'installmentsImported',
	'installmentsWouldImport',
	'customersCreated',
	'installmentsAlreadyImported',
	'installmentsExcludedByStatus',
] as const

const DESTACADOS_PAGADAS = [
	'invoicesChecked',
	'invoicesMarkedPaid',
	'invoicesWouldMarkPaid',
	'invoicesPartiallyPaidAtIsp',
	'invoicesStillOpen',
	'invoicesUnknown',
] as const

const ETIQUETAS_CONTADORES_IMPORT: Record<string, string> = {
	contractsObserved: 'Contratos observados',
	contractsWithDebt: 'Con deuda',
	contractsIndeterminate: 'Indeterminados',
	contractsStatusUnrecognized: 'Estado no reconocido',
	contractsCurrencyIncoherent: 'Moneda incoherente',
	installmentsPending: 'Cuotas pendientes',
	installmentsImported: 'Cuotas importadas',
	installmentsWouldImport: 'Se importarían',
	installmentsAlreadyImported: 'Ya importadas',
	installmentsExcludedByStatus: 'Excluidas por estado',
	installmentsBlockedByLimit: 'Bloqueadas por tope',
	installmentsFailed: 'Fallidas',
	installmentsZeroAmount: 'Saldo cero',
	installmentsNoLongerPending: 'Ya no pendientes',
	installmentsExcludedByWindow: 'Fuera de ventana',
	installmentsExcludedByRecentLimit: 'Fuera de límite reciente',
	contractsExcludedByIdentifierType: 'Contratos excluidos por documento',
	installmentsExcludedByIdentifierType: 'Cuotas excluidas por documento',
	customersCreated: 'Clientes creados',
}

const ETIQUETAS_CONTADORES_PAGADAS: Record<string, string> = {
	invoicesChecked: 'Facturas consultadas',
	invoicesMarkedPaid: 'Marcadas pagadas',
	invoicesWouldMarkPaid: 'Se marcarían pagadas',
	invoicesStillOpen: 'Siguen abiertas',
	invoicesPartiallyPaidAtIsp: 'Abono parcial en ISP',
	invoicesUnderReview: 'En revisión',
	invoicesUnknown: 'Sin evidencia',
	lookupsFailed: 'Consultas fallidas',
	contractsRead: 'Contratos leídos',
}

const ETIQUETAS_HISTORIAL: Record<string, string> = {
	cliente_creado: 'Cliente creado',
	factura_importada: 'Factura importada',
	pagada_en_isp: 'Pagada en el ISP',
	reabierta_en_isp: 'Reabierta (ISP)',
}

function redirect(res: ServerResponse, location: string): void {
	res.writeHead(303, { location })
	res.end()
}

export function createApp(deps: AppDeps): Server {
	const { db } = deps

	function companyName(): string {
		return leerEmpresa(db).nombre
	}

	async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url ?? '/', 'http://prueba.local')
		const path = url.pathname.replace(/\/+$/, '') || '/'
		const text = url.searchParams.get('msg')
		const tone = url.searchParams.get('tone') as Tone | null
		const flash = text && tone ? { tone, text } : undefined
		const page = (title: string, active: string, body: Raw) =>
			sendHtml(res, 200, layout({ title, active, body, flash, company: companyName() }))

		if (req.method === 'GET') {
			if (path === '/app.css') return send(res, 200, `${CSS}\npre.doc { margin: 0; white-space: pre-wrap; font: 13.5px/1.6 var(--mono); color: var(--fg); max-width: 110ch; }`, 'text/css; charset=utf-8')
			if (path === '/enunciado') return page('Enunciado', '', assignmentPage(deps))
			if (path === '/') return page('Resumen', '/', resumenPage(deps))
			if (path === '/clientes') return page('Clientes', '/clientes', clientesPage(db, url.searchParams.get('q') ?? ''))
			if (path === '/sincronizacion') return page('Sincronización', '/sincronizacion', syncPage(db))
			if (path === '/configuracion') return page('Configuración', '/configuracion', configPage(db))
			const corridaMatch = /^\/sincronizacion\/(\d+)$/.exec(path)
			if (corridaMatch) return page('Detalle de corrida', '/sincronizacion', corridaPage(db, Number(corridaMatch[1])))
			const clienteMatch = /^\/clientes\/(\d+)$/.exec(path)
			if (clienteMatch) return page('Expediente', '/clientes', expedientePage(db, Number(clienteMatch[1])))
		}

		if (req.method === 'POST') {
			const form = await readForm(req)
			if (path === '/configuracion/empresa') return postConfiguracionEmpresa(db, res, form)
			if (path === '/configuracion/proveedor') return postConfiguracionProveedor(db, res, form)
			if (path === '/configuracion/probar') return postProbarConexion(db, res, form)
			if (path === '/configuracion/borrar' || path === '/sincronizacion/borrar') return postBorrarImportados(db, res, path)
			if (path === '/sincronizacion/importar') return postSync(db, res, 'importacion', false)
			if (path === '/sincronizacion/importar/simular') return postSync(db, res, 'importacion', true)
			if (path === '/sincronizacion/pagadas') return postSync(db, res, 'pagadas', false)
			if (path === '/sincronizacion/pagadas/simular') return postSync(db, res, 'pagadas', true)
		}

		sendHtml(res, 404, layout({ title: 'No encontrado', active: '', company: companyName(), body: html`<h1>No encontrado</h1><p><a href="/">Volver</a></p>` }))
	}

	return createServer((req, res) => {
		route(req, res).catch((error: unknown) => {
			console.error('[panel]', error)
			if (!res.headersSent) {
				sendHtml(
					res,
					500,
					layout({
						title: 'Error',
						active: '',
						company: companyName(),
						body: html`<h1>Algo falló</h1><p class="muted">${esc(error instanceof Error ? error.message : error)}</p><p><a href="/">Volver</a></p>`,
					}),
				)
			}
		})
	})
}

function resumenPage(deps: AppDeps): Raw {
	const db = deps.db
	const totales = totalesResumen(db)
	const proveedor = leerProveedor(db)
	const corridas = listarCorridas(db, 8)
	return html`
		<div class="head">
			<div>
				<h1>Resumen</h1>
				<p>Prototipo de integración Cobrix con la API del administrador de facturas (SQLite local, reglas de sync del ISP).</p>
			</div>
			<div class="actions">${accionesResumen()}</div>
		</div>
		<div class="tiles">
			<div class="tile"><span>Clientes importados</span><strong>${totales.clientes}</strong></div>
			<div class="tile"><span>Contratos espejados</span><strong>${totales.contratos}</strong></div>
			<div class="tile"><span>Facturas abiertas</span><strong>${totales.facturasAbiertas}</strong></div>
			<div class="tile"><span>Facturas pagadas</span><strong>${totales.facturasPagadas}</strong></div>
			<div class="tile"><span>Por cobrar</span><strong>${raw(usd(totales.porCobrarCentavos))}</strong></div>
		</div>
		<section class="card">
			<header><h2>Proveedor</h2><a href="/configuracion">Editar configuración</a></header>
			<div class="body">
				<dl class="facts">
					<dt>Proveedor</dt><dd>${proveedor.nombreVisible}</dd>
					<dt>URL de la API</dt><dd class="mono">${proveedor.urlApi}</dd>
					<dt>Documentación de la API</dt>
					<dd><a href="${deps.simulatorUrl}/docs" target="_blank" rel="noopener">Swagger</a> · <a href="${deps.simulatorUrl}/openapi.json" target="_blank" rel="noopener">openapi.json</a></dd>
					<dt>Estados que se importan</dt><dd>${proveedor.estadosImportables.join(', ')}</dd>
					<dt>Ventana</dt><dd>${textoVentanaProveedor(proveedor)}</dd>
					<dt>Corrida automática</dt><dd>${textoCorridaAutomatica(proveedor)}</dd>
					<dt>Fecha del sandbox</dt><dd>${etiquetaFechaSandbox()}</dd>
				</dl>
			</div>
		</section>
		<section class="card">
			<header><h2>Últimas corridas</h2><a href="/sincronizacion">Ver todas</a></header>
			<div class="body table-wrap">${tablaCorridas(corridas)}</div>
		</section>`
}

function clientesPage(db: DatabaseSync, busqueda: string): Raw {
	const filas = listarClientesResumen(db, busqueda)
	return html`
		<div class="head">
			<div>
				<h1>Clientes</h1>
				<p>Clientes creados por el sync del administrador. Un cliente por cédula o RIF: si el titular tiene varios contratos, se agrupan aquí.</p>
			</div>
			<span class="head-count">${filas.length} clientes</span>
		</div>
		<form class="search" method="get" action="/clientes">
			<input type="search" name="q" value="${busqueda}" placeholder="Nombre, cédula o RIF" />
			<button type="submit" class="btn">Buscar</button>
		</form>
		<section class="card">
			<div class="body table-wrap">
				<table>
					<thead><tr>
						<th>Cliente</th><th>Documento</th><th>Tipo</th><th class="num">Contratos</th>
						<th class="num">Abiertas</th><th class="num">Pagadas</th><th class="num">Deuda</th><th>Vence la más antigua</th>
					</tr></thead>
					<tbody>${filas.length === 0
						? html`<tr><td colspan="8" class="muted">Sin clientes${busqueda ? ' para esta búsqueda' : ''}.</td></tr>`
						: filas.map(filaCliente)}</tbody>
				</table>
			</div>
		</section>`
}

function filaCliente(fila: FilaClienteResumen): Raw {
	const { cliente: c } = fila
	const tipo = c.tipoPersona === 'juridico' ? 'Jurídico' : 'Natural'
	const vence = fila.deudaCentavos === 0 || !fila.vencimientoAntiguo ? 'Al día' : date(fila.vencimientoAntiguo)
	return html`<tr>
		<td><a href="/clientes/${c.id}">${c.nombre}</a></td>
		<td class="mono">${c.identificacionMostrar}</td>
		<td>${tipo}</td>
		<td class="num">${fila.contratos}</td>
		<td class="num">${fila.facturasAbiertas}</td>
		<td class="num">${fila.facturasPagadas}</td>
		<td class="num">${raw(usd(fila.deudaCentavos))}</td>
		<td>${vence}</td>
	</tr>`
}

function expedientePage(db: DatabaseSync, clienteId: number): Raw {
	const cliente = leerCliente(db, clienteId)
	if (!cliente) {
		return html`<div class="head"><h1>Cliente no encontrado</h1></div><p><a href="/clientes">Volver</a></p>`
	}
	const contratos = listarContratosPorCliente(db, clienteId)
	const facturas = listarFacturasPorCliente(db, clienteId)
	const historial = historialConDetalle(db, clienteId)
	const abiertas = facturas.filter(f => f.estado === 'abierta')
	const pagadas = facturas.filter(f => f.estado === 'pagada')
	const deuda = abiertas.reduce((sum, f) => sum + f.saldoCentavos, 0)
	const subtitulo = `${cliente.tipoPersona === 'juridico' ? 'Persona jurídica' : 'Persona natural'} · ${cliente.identificacionMostrar}`
	return html`
		<p><a href="/clientes">← Clientes</a></p>
		<div class="head">
			<div><h1>${cliente.nombre}</h1><p>${subtitulo}</p></div>
		</div>
		<div class="tiles">
			<div class="tile"><span>Deuda abierta</span><strong>${raw(usd(deuda))}</strong></div>
			<div class="tile"><span>Facturas abiertas</span><strong>${abiertas.length}</strong></div>
			<div class="tile"><span>Facturas pagadas</span><strong>${pagadas.length}</strong></div>
			<div class="tile"><span>Contratos</span><strong>${contratos.length}</strong></div>
		</div>
		<div class="grid2">
			<section class="card">
				<header><h2>Datos del cliente</h2></header>
				<div class="body">
					<dl class="facts">
						<dt>ID externo</dt><dd class="mono">${cliente.identificacionNormalizada}</dd>
						<dt>Documento</dt><dd class="mono">${cliente.identificacionMostrar}</dd>
						<dt>Correo</dt><dd>${cliente.correo || '—'}</dd>
						<dt>Teléfono</dt><dd>${cliente.telefono || '—'}</dd>
						<dt>Origen</dt><dd>${cliente.origen}</dd>
						<dt>Creado</dt><dd>${dateTime(cliente.creadoEn)}</dd>
					</dl>
				</div>
			</section>
			<section class="card">
				<header><h2>Contratos en el administrador</h2></header>
				<div class="body table-wrap">
					<table>
						<thead><tr><th>Contrato</th><th>Estado</th><th>Plan</th><th>Sucursal</th></tr></thead>
						<tbody>${contratos.map(c => html`<tr>
							<td><div class="stack-sm"><strong class="mono">${c.idContratoIsp}</strong><span class="sub">${c.direccion}</span></div></td>
							<td>${pill(c.estado, CONTRACT_STATUS_TONE[c.estado] ?? 'warn')}</td>
							<td>${c.planNombre}<br /><span class="muted">${raw(usd(c.precioMesCentavos))}/mes</span></td>
							<td class="mono">${c.sucursalSigla}</td>
						</tr>`)}</tbody>
					</table>
				</div>
			</section>
		</div>
		<section class="card">
			<header><h2>Facturas</h2><span class="muted">Una factura por cuota del administrador</span></header>
			<div class="body table-wrap">
				<table>
					<thead><tr>
						<th>Factura</th><th>Cuota en el administrador</th><th>Periodo</th><th>Descripción</th><th>Vence</th><th>Corte</th>
						<th class="num">Total</th><th class="num">Saldo</th><th>Estado</th>
					</tr></thead>
					<tbody>${facturas.map(f => html`<tr>
						<td class="mono">${f.numero}</td>
						<td><div class="stack-sm"><span class="mono">${f.idCuotaProveedor}</span><span class="sub">contrato ${f.idContratoIsp}</span></div></td>
						<td>${period(f.periodo)}</td>
						<td>${f.descripcion}</td>
						<td>${date(f.vencimiento)}</td>
						<td>${date(f.corte)}</td>
						<td class="num">${raw(usd(f.totalCentavos))}</td>
						<td class="num">${raw(usd(f.saldoCentavos))}</td>
						<td>${estadoFacturaCelda(f)}</td>
					</tr>`)}</tbody>
				</table>
				<p class="note">El vencimiento es el primer día del período, como en el sync real de Cobrix: el administrador no entrega un vencimiento por cuota. El corte suma los días de gracia configurados.</p>
			</div>
		</section>
		<section class="card">
			<header><h2>Historial</h2></header>
			<div class="body">
				${historial.length === 0
					? html`<p class="muted">Sin eventos todavía.</p>`
					: html`<ul class="timeline">${historial.map(ev => html`<li>
						<time>${dateTime(ev.ocurridoEn)}</time>
						<div><strong>${tituloHistorial(ev)}</strong>
							${ev.detalleHistorial ? html`<div class="muted">${ev.detalleHistorial}</div>` : ''}
						</div>
					</li>`)}</ul>`}
			</div>
		</section>`
}

function syncPage(db: DatabaseSync): Raw {
	const corridas = listarCorridas(db, 50)
	return html`
		<div class="head">
			<div>
				<h1>Sincronización</h1>
				<p>La importación lee cada contrato del administrador y crea una factura abierta por cuota pendiente. La actualización de pagadas consulta el libro de cuotas del administrador y marca pagadas las que el ISP ya cobró.</p>
			</div>
		</div>
		<div class="grid2-cards">
			<section class="card">
				<header><h2>Importar cuotas</h2></header>
				<div class="body">
					<p class="muted">Recorre todos los contratos y aplica estados, ventana, límite de recientes y topes de la configuración.</p>
					<div class="actions">
						<form method="post" action="/sincronizacion/importar/simular" class="inline"><button type="submit" class="btn">Simular importación</button></form>
						<form method="post" action="/sincronizacion/importar" class="inline"><button type="submit" class="btn primary">Importar</button></form>
					</div>
				</div>
			</section>
			<section class="card">
				<header><h2>Actualizar facturas pagadas</h2></header>
				<div class="body">
					<p class="muted">Para cada factura abierta lee el libro del contrato. Solo marca pagada con saldo 0 y evidencia; los abonos parciales se informan.</p>
					<div class="actions">
						<form method="post" action="/sincronizacion/pagadas/simular" class="inline"><button type="submit" class="btn">Simular actualización</button></form>
						<form method="post" action="/sincronizacion/pagadas" class="inline"><button type="submit" class="btn primary">Actualizar pagadas</button></form>
					</div>
				</div>
			</section>
		</div>
		<section class="card">
			<header>
				<h2>Corridas</h2>
				<form method="post" action="/sincronizacion/borrar" class="inline" onsubmit="return confirm('¿Borrar todos los datos importados?')">
					<button type="submit" class="btn">Borrar datos importados</button>
				</form>
			</header>
			<div class="body table-wrap">${tablaCorridas(corridas)}</div>
		</section>`
}

function corridaPage(db: DatabaseSync, corridaId: number): Raw {
	const corrida = leerCorrida(db, corridaId)
	if (!corrida) {
		return html`<div class="head"><h1>Corrida no encontrada</h1></div><p><a href="/sincronizacion">Volver</a></p>`
	}
	const detalle = listarDetalleCorrida(db, corridaId)
	const etiquetas = corrida.tipo === 'importacion' ? ETIQUETAS_CONTADORES_IMPORT : ETIQUETAS_CONTADORES_PAGADAS
	const destacados = corrida.tipo === 'importacion' ? DESTACADOS_IMPORT : DESTACADOS_PAGADAS
	const duracion = corrida.duracionMs === null ? '—' : `${(corrida.duracionMs / 1000).toFixed(1)} s`
	return html`
		<p><a href="/sincronizacion">← Sincronización</a></p>
		<div class="head">
			<div>
				<h1>${tituloCorrida(corrida)} #${corrida.id}</h1>
				<div class="corrida-meta">
					<span>${dateTime(corrida.inicioEn)}</span>
					${pillEstadoCorrida(corrida)}
					<span>${duracion}</span>
					${corrida.simulacion ? pill('Simulación', 'info') : ''}
				</div>
				<p class="muted">${corrida.resumen}</p>
			</div>
		</div>
		<div class="tiles">${destacados.map(key => html`
			<div class="tile"><span>${etiquetas[key] ?? key}</span><strong>${corrida.contadores[key] ?? 0}</strong></div>
		`)}</div>
		<section class="card">
			<header><h2>Contadores</h2><span class="muted">Mismos nombres que en Cobrix</span></header>
			<div class="body table-wrap">${tablaContadoresCorrida(corrida.contadores, etiquetas)}</div>
		</section>
		<section class="card">
			<header><h2>Detalle</h2><span class="muted">${detalle.length} filas</span></header>
			<div class="body table-wrap">${tablaDetalleCorrida(detalle)}</div>
		</section>`
}

function configPage(db: DatabaseSync): Raw {
	const empresa = leerEmpresa(db)
	const proveedor = leerProveedor(db)
	const estadosSet = new Set(proveedor.estadosImportables)
	const exclSet = new Set(proveedor.tiposDocumentoExcluidos)
	const ventanaVal = proveedor.ventanaMeses === null ? '' : String(proveedor.ventanaMeses)
	return html`
		<div class="head">
			<div>
				<h1>Configuración</h1>
				<p>Datos de la empresa y del administrador de facturas, con las mismas opciones del formulario «Configurar proveedor» de Cobrix.</p>
			</div>
		</div>
		<form method="post" action="/configuracion/empresa">
			<section class="card">
				<header><h2>Empresa</h2></header>
				<div class="body grid2">
					<label class="field">Nombre<input type="text" name="empresa_nombre" required value="${empresa.nombre}" /></label>
					<label class="field">RIF<input type="text" name="empresa_rif" required value="${empresa.rif}" /></label>
					<label class="field">Correo de cobranza<input type="text" name="empresa_correo" required value="${empresa.correoCobranza}" /></label>
					<label class="field">Zona horaria y moneda<input type="text" readonly value="America/Caracas · USD" /></label>
				</div>
				<div class="body"><button type="submit" class="btn primary">Guardar empresa</button></div>
			</section>
		</form>
		<form method="post" action="/configuracion/proveedor">
			<section class="card">
				<header><h2>Administrador de facturas</h2>
					<button type="submit" formaction="/configuracion/probar" class="btn">Probar conexión</button>
				</header>
				<div class="body grid2">
					<label class="field">Nombre visible<input type="text" name="prov_nombre" required value="${proveedor.nombreVisible}" /></label>
					<label class="field">URL de la API<small>Con o sin /api/v1</small><input type="url" name="prov_url" required value="${proveedor.urlApi}" /></label>
					<label class="field">Usuario o correo<input type="text" name="prov_usuario" required value="${proveedor.usuario}" autocomplete="username" /></label>
					<label class="field">Contraseña<small>Déjala vacía para conservar la actual</small><input type="password" name="prov_contrasena" autocomplete="current-password" /></label>
					<fieldset style="grid-column: 1 / -1"><legend>Estados de contrato que se importan</legend>
						${ESTADOS_CONFIG.map(est => html`
							<label><input type="checkbox" name="estados" value="${est}" ${estadosSet.has(est) ? 'checked' : ''} /> ${est}</label>
						`)}
					</fieldset>
					<label class="field">Ventana de importación<small>Solo cuotas desde el mes actual menos N meses</small>
						<select name="ventana_meses">
							<option value="" ${ventanaVal === '' ? 'selected' : ''}>Sin ventana</option>
							${[3, 6, 9, 12].map(n => html`<option value="${n}" ${ventanaVal === String(n) ? 'selected' : ''}>${n} meses</option>`)}
						</select>
					</label>
					<label class="field">Máx. cuotas recientes por contrato<small>Vacío = todas (1 a 60)</small>
						<input type="number" name="max_cuotas" min="1" max="60" value="${proveedor.maxCuotasRecientes ?? ''}" /></label>
					<label class="field">Días de gracia para el corte<small>Corte = vencimiento + días (0 a 60)</small>
						<input type="number" name="dias_gracia" min="0" max="60" required value="${proveedor.diasGraciaCorte}" /></label>
					<label class="field">Ventana de consulta de pagadas (meses)<small>Por defecto 7</small>
						<input type="number" name="meses_pagadas" min="1" required value="${proveedor.mesesConsultaPagadas}" /></label>
					<label class="field">Tope de facturas nuevas por corrida<input type="number" name="tope_facturas" min="1" required value="${proveedor.topeFacturasCorrida}" /></label>
					<label class="field">Tope de monto nuevo por corrida (USD)<input type="number" name="tope_monto_usd" min="0" step="0.01" required value="${(proveedor.topeMontoCentavosCorrida / 100).toFixed(2)}" /></label>
					<fieldset style="grid-column: 1 / -1"><legend>Excluir por tipo de documento</legend>
						${TIPOS_DOCUMENTO.map(t => html`
							<label><input type="checkbox" name="tipos_excluidos" value="${t}" ${exclSet.has(t) ? 'checked' : ''} /> ${t}</label>
						`)}
					</fieldset>
					<div class="field" style="grid-column: 1 / -1">
						<fieldset>
							<legend>Corrida automática</legend>
							<label><input type="checkbox" name="corrida_auto" value="1" ${proveedor.corridaAutomaticaActiva ? 'checked' : ''} /> Importar y actualizar pagadas una vez al día</label>
							<label class="field" style="display:inline-grid; margin-top:8px">a las <input type="time" name="corrida_hora" value="${proveedor.corridaAutomaticaHora ?? '06:00'}" style="width:auto" /> (Caracas)</label>
						</fieldset>
					</div>
				</div>
				<p class="note">Fijo para este proveedor, como en Cobrix: solo cuotas pendientes, vencimiento del proveedor y corrida automática opcional. Reloj lateral = Caracas; una ejecución por día.</p>
				<div class="body actions">
					<button type="submit" class="btn primary">Guardar proveedor</button>
					<span class="muted">Última modificación: ${dateTime(proveedor.actualizadoEn)}</span>
				</div>
			</section>
		</form>`
}

function accionesResumen(): Raw {
	return html`
		<form method="post" action="/sincronizacion/importar" class="inline"><button type="submit" class="btn primary">Importar cuotas</button></form>
		<form method="post" action="/sincronizacion/pagadas" class="inline"><button type="submit" class="btn">Actualizar pagadas</button></form>`
}

function tablaCorridas(corridas: readonly Corrida[]): Raw {
	if (corridas.length === 0) return html`<p class="muted">Aún no hay corridas.</p>`
	return html`<table>
		<thead><tr><th>#</th><th>Tipo</th><th>Inicio</th><th>Estado</th><th>Resultado</th></tr></thead>
		<tbody>${corridas.map(c => html`<tr>
			<td class="mono"><a href="/sincronizacion/${c.id}">${c.id}</a></td>
			<td>${tituloCorrida(c)}${c.simulacion ? html` ${pill('Simulación', 'info')}` : ''}</td>
			<td>${dateTime(c.inicioEn)}</td>
			<td>${pillEstadoCorrida(c)}</td>
			<td class="muted">${c.resumen}</td>
		</tr>`)}</tbody>
	</table>`
}

function tablaContadoresCorrida(contadores: Record<string, number>, etiquetas: Record<string, string>): Raw {
	const entries = Object.entries(contadores)
	if (entries.length === 0) return html`<p class="muted">Sin contadores.</p>`
	return html`<table class="counters">
		<thead><tr><th>Contador</th><th>Clave</th><th class="num">Valor</th></tr></thead>
		<tbody>${entries.map(([key, val]) => html`<tr>
			<td>${etiquetas[key] ?? key}</td>
			<td class="key mono">${key}</td>
			<td class="num">${val}</td>
		</tr>`)}</tbody>
	</table>`
}

const ETIQUETAS_RESULTADO_DETALLE: Record<string, { readonly label: string; readonly tone: Tone }> = {
	importada: { label: 'Importada', tone: 'ok' },
	se_importaria: { label: 'Se importaría', tone: 'info' },
	marcada_pagada: { label: 'Marcada pagada', tone: 'ok' },
	se_marcaria_pagada: { label: 'Se marcaría pagada', tone: 'info' },
	sigue_abierta: { label: 'Sigue pendiente', tone: 'mute' },
	abono_parcial_isp: { label: 'Abono parcial en el administrador', tone: 'warn' },
	reabierta: { label: 'Reabierta', tone: 'warn' },
	ya_importada: { label: 'Ya importada', tone: 'mute' },
	frenada_tope: { label: 'Frenada por tope', tone: 'warn' },
}

function tablaDetalleCorrida(filas: readonly FilaDetalleCorrida[]): Raw {
	if (filas.length === 0) return html`<p class="muted">Sin filas de detalle.</p>`
	return html`<table>
		<thead><tr>
			<th>Contrato</th><th>Cuota</th><th>Cliente</th><th>Resultado</th><th>Detalle</th><th class="num">Monto</th>
		</tr></thead>
		<tbody>${filas.map(r => html`<tr>
			<td class="mono">${r.idContratoIsp ?? '—'}</td>
			<td class="mono">${r.idCuotaProveedor ?? '—'}</td>
			<td>${celdaClienteDetalle(r)}</td>
			<td>${pillResultadoDetalle(r.resultado)}</td>
			<td>${r.detalle}</td>
			<td class="num">${r.montoCentavos === null ? '—' : raw(usd(r.montoCentavos))}</td>
		</tr>`)}</tbody>
	</table>`
}

function celdaClienteDetalle(fila: FilaDetalleCorrida): Raw {
	if (fila.clienteId && fila.clienteNombre) {
		return html`<a href="/clientes/${fila.clienteId}">${fila.clienteNombre}</a>`
	}
	return html`<span class="muted">—</span>`
}

function pillResultadoDetalle(resultado: string): Raw {
	const known = ETIQUETAS_RESULTADO_DETALLE[resultado]
	if (known) return pill(known.label, known.tone)
	return pill(resultado.replaceAll('_', ' '), 'mute')
}

function tituloCorrida(c: Corrida): string {
	return c.tipo === 'importacion' ? 'Importación' : 'Actualización de pagadas'
}

function pillEstadoCorrida(c: Corrida): Raw {
	if (c.estado === 'completada') return pill('Completada', 'ok')
	if (c.estado === 'fallida') return pill('Fallida', 'bad')
	return pill('En curso', 'warn')
}

function assignmentPage(deps: AppDeps): Raw {
	let text = ''
	try {
		text = readFileSync(deps.assignmentPath, 'utf8')
	} catch {
		text = 'No se encontró docs/ENUNCIADO.md.'
	}
	return html`<div class="head"><div><h1>Enunciado</h1><p>También en <span class="mono">docs/ENUNCIADO.md</span>.</p></div></div>
		<section class="card"><div class="body"><pre class="doc">${text}</pre></div></section>`
}

function postConfiguracionEmpresa(db: DatabaseSync, res: ServerResponse, form: URLSearchParams): void {
	guardarEmpresa(db, {
		nombre: requireField(form, 'empresa_nombre'),
		rif: requireField(form, 'empresa_rif'),
		correoCobranza: requireField(form, 'empresa_correo'),
	})
	redirect(res, '/configuracion?msg=Empresa guardada.&tone=ok')
}

function postConfiguracionProveedor(db: DatabaseSync, res: ServerResponse, form: URLSearchParams): void {
	const editable = proveedorFromForm(form)
	const nueva = form.get('prov_contrasena')?.trim()
	guardarProveedor(db, editable, nueva || undefined)
	redirect(res, '/configuracion?msg=Proveedor guardado.&tone=ok')
}

async function postProbarConexion(db: DatabaseSync, res: ServerResponse, form: URLSearchParams): Promise<void> {
	const url = requireField(form, 'prov_url').replace(/\/+$/, '')
	const usuario = requireField(form, 'prov_usuario')
	const pwdField = form.get('prov_contrasena')?.trim()
	const password = pwdField || contrasenaProveedor(db)
	try {
		const n = await new IspClient({ baseUrl: url, userName: usuario, password }).probarConexion()
		redirect(res, `/configuracion?msg=${encodeURIComponent(`Conexión OK · ${n} contratos visibles.`)}&tone=ok`)
	} catch (error) {
		const msg = error instanceof IspAuthError ? error.message : error instanceof Error ? error.message : 'Error de conexión'
		redirect(res, `/configuracion?msg=${encodeURIComponent(msg)}&tone=bad`)
	}
}

function postBorrarImportados(db: DatabaseSync, res: ServerResponse, path: string): void {
	borrarDatosImportados(db)
	const dest = path.includes('sincronizacion') ? '/sincronizacion' : '/configuracion'
	redirect(res, `${dest}?msg=Datos importados borrados.&tone=info`)
}

async function postSync(db: DatabaseSync, res: ServerResponse, kind: 'importacion' | 'pagadas', simulacion: boolean): Promise<void> {
	try {
		const id = kind === 'importacion'
			? await ejecutarImportacion(db, simulacion)
			: await ejecutarActualizacionPagadas(db, simulacion)
		const corrida = leerCorrida(db, id)
		const resumen = corrida?.resumen ?? 'Corrida finalizada'
		const tone: Tone = corrida?.estado === 'fallida' ? 'bad' : 'ok'
		redirect(res, `/sincronizacion/${id}?msg=${encodeURIComponent(resumen)}&tone=${tone}`)
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error)
		redirect(res, `/sincronizacion?msg=${encodeURIComponent(msg)}&tone=bad`)
	}
}

function proveedorFromForm(form: URLSearchParams): ProveedorEditable {
	const ventana = form.get('ventana_meses')?.trim()
	const maxCuotas = form.get('max_cuotas')?.trim()
	const topeUsd = Number(form.get('tope_monto_usd'))
	return {
		nombreVisible: requireField(form, 'prov_nombre'),
		urlApi: requireField(form, 'prov_url'),
		usuario: requireField(form, 'prov_usuario'),
		estadosImportables: form.getAll('estados'),
		ventanaMeses: ventana ? Number(ventana) : null,
		maxCuotasRecientes: maxCuotas ? Number(maxCuotas) : null,
		diasGraciaCorte: Number(form.get('dias_gracia')),
		topeFacturasCorrida: Number(form.get('tope_facturas')),
		topeMontoCentavosCorrida: Math.round(topeUsd * 100),
		tiposDocumentoExcluidos: form.getAll('tipos_excluidos'),
		mesesConsultaPagadas: Number(form.get('meses_pagadas')),
		corridaAutomaticaActiva: form.get('corrida_auto') === '1',
		corridaAutomaticaHora: form.get('corrida_hora')?.trim() || null,
	}
}

function requireField(form: URLSearchParams, name: string): string {
	const value = form.get(name)?.trim()
	if (!value) throw new Error(`Falta el campo ${name}`)
	return value
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
	const chunks: Buffer[] = []
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
	return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

function historialConDetalle(db: DatabaseSync, clienteId: number) {
	return listarHistorialCliente(db, clienteId).map(ev => ({
		...ev,
		detalleHistorial: detalleEvento(ev),
	}))
}

function detalleEvento(ev: { tipo: string; payload: Record<string, unknown> }): string {
	if (ev.tipo === 'factura_importada') {
		const cuota = typeof ev.payload.cuota === 'string' ? `Cuota ${ev.payload.cuota}` : ''
		return cuota
	}
	if (ev.tipo === 'pagada_en_isp' && typeof ev.payload.num_factura_isp === 'string') {
		return `Factura del administrador ${ev.payload.num_factura_isp}`
	}
	if (ev.tipo === 'cliente_creado' && typeof ev.payload.contrato_isp === 'number') {
		return `Desde el contrato ${ev.payload.contrato_isp} del administrador`
	}
	if (ev.tipo === 'reabierta_en_isp' && typeof ev.payload.motivo === 'string') return ev.payload.motivo
	return ''
}

function tituloHistorial(ev: { tipo: string; payload: Record<string, unknown> }): string {
	const base = ETIQUETAS_HISTORIAL[ev.tipo] ?? ev.tipo
	if (ev.tipo === 'factura_importada' && typeof ev.payload.numero === 'string') return `${base} — ${ev.payload.numero}`
	if (ev.tipo === 'pagada_en_isp' && typeof ev.payload.num_factura_isp === 'string') return `${base} — ${ev.payload.num_factura_isp}`
	return base
}

function estadoFacturaCelda(f: { readonly estado: string; readonly pagadaEn: string | null }): Raw {
	if (f.estado === 'pagada') {
		return html`<div class="stack-sm">${pill('Pagada', 'ok')}${f.pagadaEn ? html`<span class="sub">${date(f.pagadaEn.slice(0, 10))}</span>` : ''}</div>`
	}
	return pill('Abierta', 'warn')
}

function textoVentanaProveedor(proveedor: Proveedor): string {
	const ventana = proveedor.ventanaMeses === null ? 'Sin ventana' : `${proveedor.ventanaMeses} meses`
	const recientes = proveedor.maxCuotasRecientes === null ? 'sin límite de recientes' : `máx. ${proveedor.maxCuotasRecientes} recientes`
	return `${ventana} · ${recientes}`
}

function textoCorridaAutomatica(proveedor: Proveedor): Raw {
	if (!proveedor.corridaAutomaticaActiva) return pill('Apagada', 'mute')
	return html`${pill('Encendida', 'ok')} · ${proveedor.corridaAutomaticaHora ?? '—'} (Caracas)`
}

function etiquetaFechaSandbox(): string {
	const mes = currentPeriod()
	const [y, m] = mes.split('-')
	const mesNombre = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1]
	return `${date(today())} · mes actual ${mesNombre} ${y}`
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
	send(res, status, body, 'text/html; charset=utf-8')
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
	res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) })
	res.end(body)
}
