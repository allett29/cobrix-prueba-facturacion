/**
 * Panel Cobrix (SSR): resumen, clientes, sincronización y configuración.
 */

import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { IspAuthError, IspClient } from '../cobrix/cliente-isp.ts'
import { ESTADOS_CONTRATO_CONOCIDOS } from '../cobrix/reglas/contrato-individual.ts'
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
import type { Corrida, ProveedorEditable } from '../cobrix/types.ts'

import { CONTRACT_STATUS_TONE, CSS, date, dateTime, esc, html, layout, period, pill, raw, usd, type Raw, type Tone } from './layout.ts'

export interface AppDeps {
	readonly simulatorUrl: string
	readonly assignmentPath: string
	readonly db: DatabaseSync
}

const TIPOS_DOCUMENTO = ['V', 'E', 'J', 'G', 'P'] as const

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
			if (path === '/') return page('Resumen', '/', resumenPage(db))
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
			if (path === '/configuracion') return postConfiguracion(db, res, form)
			if (path === '/configuracion/probar') return postProbarConexion(db, res, form)
			if (path === '/configuracion/borrar') return postBorrarImportados(db, res)
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

function resumenPage(db: DatabaseSync): Raw {
	const totales = totalesResumen(db)
	const proveedor = leerProveedor(db)
	const corridas = listarCorridas(db, 8)
	return html`
		<div class="head">
			<div><h1>Resumen</h1><p>Vista general de la integración con el administrador de facturas.</p></div>
			<div class="actions">${accionesSync()}</div>
		</div>
		<div class="tiles">
			<div class="tile"><span>Clientes</span><strong>${totales.clientes}</strong></div>
			<div class="tile"><span>Contratos</span><strong>${totales.contratos}</strong></div>
			<div class="tile"><span>Facturas abiertas</span><strong>${totales.facturasAbiertas}</strong></div>
			<div class="tile"><span>Facturas pagadas</span><strong>${totales.facturasPagadas}</strong></div>
			<div class="tile"><span>Por cobrar</span><strong>${raw(usd(totales.porCobrarCentavos))}</strong></div>
		</div>
		<section class="card">
			<header><h2>Proveedor</h2><a href="/configuracion">Configurar</a></header>
			<div class="body">
				<dl class="facts">
					<dt>Nombre</dt><dd>${proveedor.nombreVisible}</dd>
					<dt>API</dt><dd class="mono">${proveedor.urlApi}</dd>
					<dt>Corrida automática</dt>
					<dd>${proveedor.corridaAutomaticaActiva
						? html`${pill('Activa', 'ok')} · ${proveedor.corridaAutomaticaHora ?? '—'} (Caracas)`
						: pill('Inactiva', 'mute')}</dd>
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
			<div><h1>Clientes</h1><p>Importados desde el administrador, agrupados por titular.</p></div>
			<form class="search" method="get" action="/clientes">
				<input type="search" name="q" value="${busqueda}" placeholder="Nombre, cédula o RIF" />
				<button type="submit" class="btn">Buscar</button>
			</form>
		</div>
		<section class="card">
			<div class="body table-wrap">
				<table>
					<thead><tr>
						<th>Cliente</th><th>Documento</th><th>Tipo</th><th class="num">Contratos</th>
						<th class="num">Abiertas</th><th class="num">Pagadas</th><th class="num">Deuda</th><th>Vencimiento + antiguo</th>
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
	const tipo = c.tipoPersona === 'juridico' ? 'Jurídica' : 'Natural'
	return html`<tr>
		<td><a href="/clientes/${c.id}">${c.nombre}</a></td>
		<td class="mono">${c.identificacionMostrar}</td>
		<td>${tipo}</td>
		<td class="num">${fila.contratos}</td>
		<td class="num">${fila.facturasAbiertas}</td>
		<td class="num">${fila.facturasPagadas}</td>
		<td class="num">${raw(usd(fila.deudaCentavos))}</td>
		<td>${date(fila.vencimientoAntiguo)}</td>
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
	return html`
		<div class="head">
			<div><h1>${cliente.nombre}</h1><p class="mono">${cliente.identificacionMostrar} · ${cliente.tipoPersona === 'juridico' ? 'Persona jurídica' : 'Persona natural'}</p></div>
			<a href="/clientes" class="btn">← Clientes</a>
		</div>
		<div class="tiles">
			<div class="tile"><span>Contratos</span><strong>${contratos.length}</strong></div>
			<div class="tile"><span>Abiertas</span><strong>${abiertas.length}</strong></div>
			<div class="tile"><span>Pagadas</span><strong>${pagadas.length}</strong></div>
			<div class="tile"><span>Deuda</span><strong>${raw(usd(deuda))}</strong></div>
		</div>
		<section class="card">
			<header><h2>Datos del cliente</h2></header>
			<div class="body">
				<dl class="facts">
					<dt>Correo</dt><dd>${cliente.correo || '—'}</dd>
					<dt>Teléfono</dt><dd>${cliente.telefono || '—'}</dd>
					<dt>Origen</dt><dd>${cliente.origen}</dd>
					<dt>Registrado</dt><dd>${dateTime(cliente.creadoEn)}</dd>
				</dl>
			</div>
		</section>
		<section class="card">
			<header><h2>Contratos en el administrador</h2></header>
			<div class="body table-wrap">
				<table>
					<thead><tr><th>ID ISP</th><th>Código</th><th>Estado</th><th>Plan</th><th>Sucursal</th><th class="num">Precio/mes</th></tr></thead>
					<tbody>${contratos.map(c => html`<tr>
						<td class="mono">${c.idContratoIsp}</td>
						<td class="mono">${c.codigo}</td>
						<td>${pill(c.estado, CONTRACT_STATUS_TONE[c.estado] ?? 'warn')}</td>
						<td>${c.planNombre} <span class="muted mono">${c.planCodigo}</span></td>
						<td>${c.sucursalNombre} (${c.sucursalSigla})</td>
						<td class="num">${raw(usd(c.precioMesCentavos))}</td>
					</tr>`)}</tbody>
				</table>
			</div>
		</section>
		<section class="card">
			<header><h2>Facturas</h2></header>
			<div class="body table-wrap">
				<table>
					<thead><tr>
						<th>Número</th><th>Cuota ISP</th><th>Periodo</th><th>Vencimiento</th><th>Corte</th>
						<th class="num">Total</th><th class="num">Saldo</th><th>Estado</th>
					</tr></thead>
					<tbody>${facturas.map(f => html`<tr>
						<td class="mono">${f.numero}</td>
						<td class="mono">${f.idCuotaProveedor}</td>
						<td>${period(f.periodo)}</td>
						<td>${date(f.vencimiento)}</td>
						<td>${date(f.corte)}</td>
						<td class="num">${raw(usd(f.totalCentavos))}</td>
						<td class="num">${raw(usd(f.saldoCentavos))}</td>
						<td>${f.estado === 'pagada' ? pill('Pagada', 'ok') : pill('Abierta', 'warn')}</td>
					</tr>`)}</tbody>
				</table>
			</div>
		</section>
		<section class="card">
			<header><h2>Historial</h2></header>
			<div class="body">
				${historial.length === 0
					? html`<p class="muted">Sin eventos todavía.</p>`
					: html`<ul class="timeline">${historial.map(ev => html`<li>
						<time>${dateTime(ev.ocurridoEn)}</time>
						<div><strong>${ETIQUETAS_HISTORIAL[ev.tipo] ?? ev.tipo}</strong>
							${ev.facturaId ? html` · factura #${ev.facturaId}` : ''}
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
			<div><h1>Sincronización</h1><p>Importación de cuotas pendientes y actualización de pagadas.</p></div>
		</div>
		<section class="card">
			<header><h2>Acciones</h2></header>
			<div class="body actions">${accionesSync()}</div>
		</section>
		<section class="card">
			<header><h2>Historial de corridas</h2></header>
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
	return html`
		<div class="head">
			<div>
				<h1>${tituloCorrida(corrida)} ${corrida.simulacion ? pill('Simulación', 'info') : ''}</h1>
				<p>${corrida.resumen}</p>
			</div>
			<a href="/sincronizacion" class="btn">← Sincronización</a>
		</div>
		<section class="card">
			<header><h2>Resumen</h2>${pillEstadoCorrida(corrida)}</header>
			<div class="body">
				<dl class="facts">
					<dt>Inicio</dt><dd>${dateTime(corrida.inicioEn)}</dd>
					<dt>Fin</dt><dd>${corrida.finEn ? dateTime(corrida.finEn) : '—'}</dd>
					<dt>Duración</dt><dd>${corrida.duracionMs === null ? '—' : `${(corrida.duracionMs / 1000).toFixed(1)} s`}</dd>
					${corrida.error ? html`<dt>Error</dt><dd class="muted">${corrida.error}</dd>` : ''}
				</dl>
			</div>
		</section>
		<section class="card">
			<header><h2>Contadores</h2></header>
			<div class="body tiles">${Object.entries(corrida.contadores).map(([key, val]) => html`
				<div class="tile"><span>${etiquetas[key] ?? key}</span><strong>${val}</strong></div>
			`)}</div>
		</section>
		<section class="card">
			<header><h2>Detalle por cuota</h2><span class="muted">${detalle.length} filas</span></header>
			<div class="body table-wrap">${tablaDetalleCorrida(detalle)}</div>
		</section>`
}

function configPage(db: DatabaseSync): Raw {
	const empresa = leerEmpresa(db)
	const proveedor = leerProveedor(db)
	const estadosSet = new Set(proveedor.estadosImportables)
	const exclSet = new Set(proveedor.tiposDocumentoExcluidos)
	return html`
		<div class="head"><div><h1>Configuración</h1><p>Empresa, proveedor y reglas de importación.</p></div></div>
		<form method="post" action="/configuracion" class="grid2">
			<section class="card">
				<header><h2>Empresa</h2></header>
				<div class="body grid2">
					<label class="field">Nombre<input type="text" name="empresa_nombre" required value="${empresa.nombre}" /></label>
					<label class="field">RIF<input type="text" name="empresa_rif" required value="${empresa.rif}" /></label>
					<label class="field" style="grid-column: 1 / -1">Correo de cobranza<input type="text" name="empresa_correo" required value="${empresa.correoCobranza}" /></label>
				</div>
			</section>
			<section class="card">
				<header><h2>Proveedor</h2></header>
				<div class="body grid2">
					<label class="field">Nombre visible<input type="text" name="prov_nombre" required value="${proveedor.nombreVisible}" /></label>
					<label class="field">URL de la API<input type="url" name="prov_url" required value="${proveedor.urlApi}" /></label>
					<label class="field">Usuario<input type="text" name="prov_usuario" required value="${proveedor.usuario}" autocomplete="username" /></label>
					<label class="field">Contraseña<small>Dejar vacío para no cambiar</small><input type="password" name="prov_contrasena" autocomplete="current-password" /></label>
				</div>
			</section>
			<section class="card" style="grid-column: 1 / -1">
				<header><h2>Importación y corridas</h2></header>
				<div class="body grid2">
					<fieldset><legend>Estados de contrato importables</legend>
						${[...ESTADOS_CONTRATO_CONOCIDOS].map(est => html`
							<label><input type="checkbox" name="estados" value="${est}" ${estadosSet.has(est) ? 'checked' : ''} /> ${est}</label>
						`)}
					</fieldset>
					<fieldset><legend>Excluir tipos de documento</legend>
						${TIPOS_DOCUMENTO.map(t => html`
							<label><input type="checkbox" name="tipos_excluidos" value="${t}" ${exclSet.has(t) ? 'checked' : ''} /> ${t}</label>
						`)}
					</fieldset>
					<label class="field">Ventana (meses)<small>Vacío = sin límite</small>
						<input type="number" name="ventana_meses" min="1" value="${proveedor.ventanaMeses ?? ''}" /></label>
					<label class="field">Máx. cuotas recientes<small>Vacío = sin límite</small>
						<input type="number" name="max_cuotas" min="1" value="${proveedor.maxCuotasRecientes ?? ''}" /></label>
					<label class="field">Días de gracia (corte)<input type="number" name="dias_gracia" min="0" required value="${proveedor.diasGraciaCorte}" /></label>
					<label class="field">Meses consulta pagadas<input type="number" name="meses_pagadas" min="1" required value="${proveedor.mesesConsultaPagadas}" /></label>
					<label class="field">Tope facturas / corrida<input type="number" name="tope_facturas" min="1" required value="${proveedor.topeFacturasCorrida}" /></label>
					<label class="field">Tope monto / corrida (USD)<input type="number" name="tope_monto_usd" min="0" step="0.01" required value="${(proveedor.topeMontoCentavosCorrida / 100).toFixed(2)}" /></label>
					<label class="field"><input type="checkbox" name="corrida_auto" value="1" ${proveedor.corridaAutomaticaActiva ? 'checked' : ''} /> Corrida automática diaria</label>
					<label class="field">Hora (Caracas)<input type="time" name="corrida_hora" value="${proveedor.corridaAutomaticaHora ?? '06:00'}" /></label>
				</div>
				<div class="body actions">
					<button type="submit" class="btn primary">Guardar</button>
					<button type="submit" formaction="/configuracion/probar" class="btn">Probar conexión</button>
				</div>
			</section>
		</form>
		<section class="card">
			<header><h2>Zona de prueba</h2></header>
			<div class="body">
				<p class="note">Borra clientes, facturas y corridas importadas. La configuración se conserva.</p>
				<form method="post" action="/configuracion/borrar" class="actions" onsubmit="return confirm('¿Borrar todos los datos importados?')">
					<button type="submit" class="btn">Borrar datos importados</button>
				</form>
			</div>
		</section>`
}

function accionesSync(): Raw {
	return html`
		<form method="post" action="/sincronizacion/importar" class="inline"><button type="submit" class="btn primary">Importar</button></form>
		<form method="post" action="/sincronizacion/importar/simular" class="inline"><button type="submit" class="btn">Simular importación</button></form>
		<form method="post" action="/sincronizacion/pagadas" class="inline"><button type="submit" class="btn primary">Actualizar pagadas</button></form>
		<form method="post" action="/sincronizacion/pagadas/simular" class="inline"><button type="submit" class="btn">Simular actualización</button></form>`
}

function tablaCorridas(corridas: readonly Corrida[]): Raw {
	if (corridas.length === 0) return html`<p class="muted">Aún no hay corridas.</p>`
	return html`<table>
		<thead><tr><th>ID</th><th>Tipo</th><th>Inicio</th><th>Estado</th><th>Resultado</th><th></th></tr></thead>
		<tbody>${corridas.map(c => html`<tr>
			<td class="mono">${c.id}</td>
			<td>${tituloCorrida(c)}${c.simulacion ? html` ${pill('Sim', 'info')}` : ''}</td>
			<td>${dateTime(c.inicioEn)}</td>
			<td>${pillEstadoCorrida(c)}</td>
			<td class="muted">${c.resumen}</td>
			<td><a href="/sincronizacion/${c.id}" class="btn small">Detalle</a></td>
		</tr>`)}</tbody>
	</table>`
}

function tablaDetalleCorrida(filas: readonly FilaDetalleCorrida[]): Raw {
	if (filas.length === 0) return html`<p class="muted">Sin filas de detalle.</p>`
	return html`<table>
		<thead><tr>
			<th>Contrato</th><th>Cuota</th><th>Cliente</th><th>Factura</th><th>Resultado</th><th>Detalle</th><th class="num">Monto</th>
		</tr></thead>
		<tbody>${filas.map(r => html`<tr>
			<td class="mono">${r.idContratoIsp ?? '—'}</td>
			<td class="mono">${r.idCuotaProveedor ?? '—'}</td>
			<td>${r.clienteId ? html`<a href="/clientes/${r.clienteId}">${r.clienteId}</a>` : '—'}</td>
			<td class="mono">${r.facturaId ?? '—'}</td>
			<td>${r.resultado}</td>
			<td>${r.detalle}</td>
			<td class="num">${r.montoCentavos === null ? '—' : raw(usd(r.montoCentavos))}</td>
		</tr>`)}</tbody>
	</table>`
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

async function postConfiguracion(db: DatabaseSync, res: ServerResponse, form: URLSearchParams): Promise<void> {
	guardarEmpresa(db, {
		nombre: requireField(form, 'empresa_nombre'),
		rif: requireField(form, 'empresa_rif'),
		correoCobranza: requireField(form, 'empresa_correo'),
	})
	const editable = proveedorFromForm(form)
	const nueva = form.get('prov_contrasena')?.trim()
	guardarProveedor(db, editable, nueva || undefined)
	redirect(res, '/configuracion?msg=Configuración guardada.&tone=ok')
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

function postBorrarImportados(db: DatabaseSync, res: ServerResponse): void {
	borrarDatosImportados(db)
	redirect(res, '/configuracion?msg=Datos importados borrados.&tone=info')
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
	if (ev.tipo === 'factura_importada' && typeof ev.payload.numero === 'string') return ev.payload.numero
	if (ev.tipo === 'pagada_en_isp' && typeof ev.payload.num_factura_isp === 'string') return ev.payload.num_factura_isp
	if (ev.tipo === 'reabierta_en_isp' && typeof ev.payload.motivo === 'string') return ev.payload.motivo
	return ''
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
	send(res, status, body, 'text/html; charset=utf-8')
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
	res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) })
	res.end(body)
}
