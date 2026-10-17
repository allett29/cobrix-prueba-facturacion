/**
 * Base of the panel skeleton: layout, menu, styles and small helpers (escaping, money,
 * dates, status pills). Use them, replace them or bring your own stack.
 */

export const esc = (value: unknown): string =>
	String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** Tagged template that escapes interpolations unless they are `raw()`. */
export class Raw {
	readonly html: string
	constructor(html: string) {
		this.html = html
	}
}
export const raw = (html: string): Raw => new Raw(html)
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
	let out = strings[0] ?? ''
	values.forEach((value, i) => {
		const render = (v: unknown): string =>
			v instanceof Raw ? v.html : Array.isArray(v) ? v.map(render).join('') : v === undefined || v === null || v === false ? '' : esc(v)
		out += render(value) + (strings[i + 1] ?? '')
	})
	return new Raw(out)
}

const money = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const usd = (minor: unknown): string => `USD ${money.format(Number(minor ?? 0) / 100)}`

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function date(value: unknown): string {
	if (typeof value !== 'string' || !value) return '—'
	const [y, m, d] = value.slice(0, 10).split('-')
	return d ? `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` : `${MONTHS[Number(m) - 1]} ${y}`
}
export function dateTime(value: unknown): string {
	if (typeof value !== 'string' || !value) return '—'
	return new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
export const period = (value: unknown): string => (typeof value === 'string' ? date(value) : '—')

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute'
export const pill = (label: string, tone: Tone): Raw => html`<span class="pill ${tone}">${label}</span>`

export const CONTRACT_STATUS_TONE: Record<string, Tone> = {
	ACTIVO: 'ok', CORTADO: 'bad', CORTESIA: 'info', RETIRADO: 'mute', RECHAZADO: 'mute', ANULADO: 'mute', status_unrecognized: 'bad',
}

/** Colibrí Cobrix (marca del encabezado). Gradiente = paleta del panel. */
const BRAND_MARK_SVG = `<svg class="brand-mark" viewBox="0 0 96 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
<linearGradient id="cobrix-mark-fill" x1="48" y1="4" x2="48" y2="68" gradientUnits="userSpaceOnUse">
<stop offset="0%" stop-color="#02ff92"/>
<stop offset="38%" stop-color="#01dfb9"/>
<stop offset="68%" stop-color="#00bee3"/>
<stop offset="100%" stop-color="#00aef7"/>
</linearGradient>
</defs>
<g class="brand-mark-float">
<path class="brand-mark-body" fill="url(#cobrix-mark-fill)" d="M 16 54 C 11 42 12 26 24 16 C 32 10 36 14 38 20 C 40 14 46 12 52 16 C 56 20 57 26 55 30 L 84 28.5 L 84 33.5 L 55 35 C 56 44 50 52 40 56 C 30 58 20 58 16 54 Z"/>
<path class="brand-mark-wing" fill="url(#cobrix-mark-fill)" d="M 42 36 C 50 40 62 50 68 58 C 58 54 46 44 42 36 Z"/>
</g>
</svg>`

const NAV_ICON = {
	resumen:
		'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>',
	clientes:
		'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M15 20c.3-2.2 2-4 4.5-4 1.2 0 2.3.5 3 1.2"/></svg>',
	sync:
		'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.5-5.7"/><path d="M20 7v4h-4"/><path d="M20 12a8 8 0 0 1-13.5 5.7"/><path d="M4 17v-4h4"/></svg>',
	config:
		'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
	pin:
		'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="12" r="4" fill="currentColor" stroke="none"/><path d="M11.5 12H22"/><path d="M22 12l-1.75 1.6v-3.2L22 12z" fill="currentColor" stroke="none"/></svg>',
	search:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
} as const

const NAV = [
	['/', 'Resumen', NAV_ICON.resumen],
	['/clientes', 'Clientes', NAV_ICON.clientes],
	['/sincronizacion', 'Sincronización', NAV_ICON.sync],
	['/configuracion', 'Configuración', NAV_ICON.config],
] as const

function navDockLinks(active: string): string {
	return NAV.map(
		([href, label, icon], i) =>
			`<a href="${href}" class="nav-dock-link" style="--i:${i + 1}" data-nav-label="${esc(label)}"${active === href ? ' aria-current="page"' : ''}><span class="nav-dock-icon" aria-hidden="true">${icon}</span><span class="nav-dock-label">${label}</span></a>`,
	).join('')
}

/** Atributos para confirmar antes de enviar un formulario o botón submit. */
export function dialogConfirm(message: string, tone: Tone = 'warn'): Raw {
	return raw(`data-dialog="confirm" data-dialog-tone="${tone}" data-dialog-message="${esc(message)}"`)
}

export function layout(input: { title: string; active: string; body: Raw; flash?: { tone: Tone; text: string } | undefined; company: string }): string {
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)} · Prueba de facturación</title>
<link rel="stylesheet" href="/app.css">
</head>
<body${input.flash ? ` data-flash-tone="${esc(input.flash.tone)}" data-flash-text="${esc(input.flash.text)}"` : ''}>
<header class="app-header">
	<div class="brand"><span class="mark">${BRAND_MARK_SVG}</span><div><strong>Cobrix</strong><small>Sandbox de facturación</small></div></div>
	<div class="header-meta">
		<div class="header-tenant">${esc(input.company)}</div>
		<div class="clock" aria-live="polite">
			<span class="sr-only">Hora Caracas</span>
			<strong id="cobrix-clock-caracas" class="clock-time">--:--:--</strong>
			<span class="clock-sep" aria-hidden="true">·</span>
			<span id="cobrix-clock-date" class="clock-date"></span>
		</div>
	</div>
</header>
<div class="page">
	<div class="nav-dock-anchor">
		<nav class="nav-dock is-compact" id="cobrix-nav-dock" aria-label="Secciones">
			<div class="nav-dock-head">
				<button type="button" class="nav-dock-pin" id="cobrix-nav-pin" aria-pressed="false" title="Fijar menú abierto" aria-label="Fijar menú abierto">
					<span class="nav-dock-icon" aria-hidden="true">${NAV_ICON.pin}</span>
				</button>
				<label class="nav-dock-search">
					<span class="nav-dock-search-icon" aria-hidden="true">${NAV_ICON.search}</span>
					<span class="sr-only">Buscar sección del panel</span>
					<input type="search" id="cobrix-nav-search" class="nav-dock-search-input" placeholder="Buscar sección…" autocomplete="off" spellcheck="false">
				</label>
			</div>
			<div class="nav-dock-links">${navDockLinks(input.active)}</div>
		</nav>
	</div>
	<main class="main">${input.body.html}</main>
</div>
<div class="dialog-overlay" id="cobrix-dialog" hidden>
	<div class="dialog tone-info" id="cobrix-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="cobrix-dialog-title">
		<h2 class="dialog-title" id="cobrix-dialog-title">Aviso</h2>
		<p class="dialog-body" id="cobrix-dialog-body"></p>
		<div class="dialog-actions">
			<button type="button" class="btn" id="cobrix-dialog-cancel">Cancelar</button>
			<button type="button" class="btn primary" id="cobrix-dialog-ok">Aceptar</button>
		</div>
	</div>
</div>
<script>
(function () {
	const tz = 'America/Caracas'
	const timeEl = document.getElementById('cobrix-clock-caracas')
	const dateEl = document.getElementById('cobrix-clock-date')
	if (!timeEl || !dateEl) return
	function tick() {
		const now = new Date()
		timeEl.textContent = new Intl.DateTimeFormat('es-VE', {
			timeZone: tz,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		}).format(now)
		dateEl.textContent = new Intl.DateTimeFormat('es-VE', {
			timeZone: tz,
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		}).format(now)
	}
	tick()
	setInterval(tick, 1000)
})()
;(function () {
	const dock = document.getElementById('cobrix-nav-dock')
	const pin = document.getElementById('cobrix-nav-pin')
	const anchor = document.querySelector('.nav-dock-anchor')
	const page = document.querySelector('.page')
	const header = document.querySelector('.app-header')
	if (!dock || !pin) return
	const navLinks = dock.querySelectorAll('.nav-dock-link')
	const PIN_KEY = 'cobrix-nav-pinned'
	const readPinned = () => {
		try {
			return localStorage.getItem(PIN_KEY) === '1'
		} catch {
			return false
		}
	}
	const writePinned = (on) => {
		try {
			localStorage.setItem(PIN_KEY, on ? '1' : '0')
		} catch {
			/* ignore */
		}
	}
	let pinned = readPinned()
	let leaveTimer = 0
	if (pinned) {
		pin.setAttribute('aria-pressed', 'true')
		dock.classList.add('is-pinned', 'is-expanded')
		dock.classList.remove('is-compact')
	}
	const mqDockStatic = window.matchMedia('(max-width: 860px)')
	const syncLayoutVars = () => {
		if (header) {
			document.documentElement.style.setProperty('--header-offset', Math.round(header.getBoundingClientRect().height) + 'px')
		}
	}
	const placeDock = () => {
		syncLayoutVars()
		if (!anchor || mqDockStatic.matches) {
			dock.style.left = ''
			dock.style.width = ''
			return
		}
		const r = anchor.getBoundingClientRect()
		dock.style.left = Math.round(r.left) + 'px'
	}
	const schedulePlaceDock = () => {
		placeDock()
		window.requestAnimationFrame(placeDock)
	}
	window.addEventListener('resize', schedulePlaceDock)
	page?.addEventListener('transitionend', (e) => {
		if (e.propertyName === 'grid-template-columns') schedulePlaceDock()
	})
	mqDockStatic.addEventListener('change', schedulePlaceDock)
	if (anchor) new ResizeObserver(schedulePlaceDock).observe(anchor)
	if (header) new ResizeObserver(schedulePlaceDock).observe(header)
	schedulePlaceDock()
	const expand = () => {
		window.clearTimeout(leaveTimer)
		dock.classList.remove('is-compact')
		dock.classList.add('is-expanded')
		schedulePlaceDock()
		window.setTimeout(schedulePlaceDock, 680)
	}
	const compact = () => {
		if (pinned) return
		dock.classList.replace('is-expanded', 'is-compact')
		if (!dock.classList.contains('is-compact')) dock.classList.add('is-compact')
		const searchEl = document.getElementById('cobrix-nav-search')
		if (searchEl instanceof HTMLInputElement) searchEl.value = ''
		navLinks.forEach((link) => link.classList.remove('is-filtered-out'))
		schedulePlaceDock()
		window.setTimeout(schedulePlaceDock, 680)
	}
	const scheduleCompact = () => {
		window.clearTimeout(leaveTimer)
		leaveTimer = window.setTimeout(compact, 200)
	}
	dock.addEventListener('mouseenter', expand)
	dock.addEventListener('mouseleave', scheduleCompact)
	dock.addEventListener('focusin', expand)
	dock.addEventListener('focusout', (e) => {
		if (!dock.contains(e.relatedTarget instanceof Node ? e.relatedTarget : null)) scheduleCompact()
	})
	pin.addEventListener('click', () => {
		pinned = !pinned
		writePinned(pinned)
		pin.setAttribute('aria-pressed', pinned ? 'true' : 'false')
		dock.classList.toggle('is-pinned', pinned)
		window.clearTimeout(leaveTimer)
		if (pinned) expand()
		else if (dock.matches(':hover')) expand()
		else scheduleCompact()
	})
	const search = document.getElementById('cobrix-nav-search')
	search?.addEventListener('input', () => {
		const q = (search.value ?? '').trim().toLowerCase()
		navLinks.forEach((link) => {
			const label = (link.getAttribute('data-nav-label') ?? link.textContent ?? '').toLowerCase()
			link.classList.toggle('is-filtered-out', q !== '' && !label.includes(q))
		})
	})
})()
;(function () {
	const overlay = document.getElementById('cobrix-dialog')
	const panel = document.getElementById('cobrix-dialog-panel')
	const titleEl = document.getElementById('cobrix-dialog-title')
	const bodyEl = document.getElementById('cobrix-dialog-body')
	const cancelBtn = document.getElementById('cobrix-dialog-cancel')
	const okBtn = document.getElementById('cobrix-dialog-ok')
	if (!overlay || !panel || !titleEl || !bodyEl || !cancelBtn || !okBtn) return
	const titles = { ok: 'Listo', warn: 'Advertencia', bad: 'Error', info: 'Aviso', mute: 'Aviso' }
	let onOk = null
	let pendingForm = null
	const close = () => {
		overlay.hidden = true
		document.body.classList.remove('dialog-open')
		onOk = null
		pendingForm = null
	}
	const open = (opts) => {
		const tone = opts.tone || 'info'
		const mode = opts.mode || 'alert'
		panel.className = 'dialog tone-' + tone
		titleEl.textContent = opts.title || titles[tone] || titles.info
		bodyEl.textContent = opts.message || ''
		cancelBtn.hidden = mode === 'alert'
		okBtn.textContent = mode === 'confirm' ? 'Continuar' : 'Aceptar'
		onOk = typeof opts.onOk === 'function' ? opts.onOk : null
		overlay.hidden = false
		document.body.classList.add('dialog-open')
		okBtn.focus()
	}
	okBtn.addEventListener('click', () => {
		const fn = onOk
		close()
		if (fn) fn()
	})
	cancelBtn.addEventListener('click', close)
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) close()
	})
	document.addEventListener('keydown', (e) => {
		if (overlay.hidden) return
		if (e.key === 'Escape') close()
	})
	document.addEventListener('submit', (e) => {
		const form = e.target
		if (!(form instanceof HTMLFormElement)) return
		if (form.dataset.dialogBypass === '1') {
			delete form.dataset.dialogBypass
			return
		}
		const sub = e.submitter
		const node = sub?.dataset?.dialog ? sub : form.dataset?.dialog ? form : null
		if (!node) return
		e.preventDefault()
		const tone = node.dataset.dialogTone || 'warn'
		const message = node.dataset.dialogMessage || '¿Continuar?'
		const mode = node.dataset.dialog === 'confirm' ? 'confirm' : 'alert'
		pendingForm = form
		open({
			mode,
			tone,
			message,
			onOk: mode === 'confirm'
				? () => {
						if (!pendingForm) return
						pendingForm.dataset.dialogBypass = '1'
						if (sub instanceof HTMLButtonElement && sub.name) {
							const hidden = document.createElement('input')
							hidden.type = 'hidden'
							hidden.name = sub.name
							hidden.value = sub.value
							pendingForm.appendChild(hidden)
						}
						pendingForm.requestSubmit(sub ?? undefined)
					}
				: null,
		})
	}, true)
	const flashTone = document.body.dataset.flashTone
	const flashText = document.body.dataset.flashText
	if (flashText) {
		open({ mode: 'alert', tone: flashTone || 'info', message: flashText })
		delete document.body.dataset.flashTone
		delete document.body.dataset.flashText
	}
})()
</script>
</body>
</html>`
}

export const CSS = `
:root {
	--accent-1: #02ff92;
	--accent-2: #01dfb9;
	--accent-3: #00bee3;
	--accent-4: #00aef7;
	--accent-5: #d064ff;
	--gradient-a: #c7f7ea;
	--gradient-b: #c2ebfb;
	--gradient-brand: linear-gradient(135deg, var(--accent-2) 0%, var(--accent-4) 55%, var(--accent-5) 100%);
	/* Panel solo modo claro: blanco base, degradado suave en el lienzo */
	--gradient-surface: linear-gradient(
		165deg,
		#ffffff 0%,
		#ffffff 38%,
		color-mix(in srgb, var(--gradient-a) 55%, white) 72%,
		color-mix(in srgb, var(--gradient-b) 50%, white) 100%
	);
	--fg: #12151a;
	--muted: #5a6470;
	--line: #e3e8ec;
	--bg: #ffffff;
	--surface: #ffffff;
	--sunken: #f4f6f8;
	--primary: #0090c8;
	--primary-hover: #007aa8;
	--primary-soft: color-mix(in srgb, var(--gradient-b) 55%, white);
	--primary-fg: #061018;
	--ok: #067a5c;
	--ok-bg: color-mix(in srgb, var(--accent-1) 18%, white);
	--warn: #8a5a00;
	--warn-bg: #fff4dc;
	--bad: #b42318;
	--bad-bg: #fde8e6;
	--info: #007fa8;
	--info-bg: color-mix(in srgb, var(--accent-3) 22%, white);
	--mute: #647080;
	--mute-bg: #eef2f4;
	--font: "Inter var", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	--mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
	--header-offset: 64px;
	--page-pad-top: 20px;
	--page-pad-bottom: 40px;
	--nav-dock-w-compact: 58px;
	--nav-dock-w-expanded: 272px;
	--nav-dock-r-compact: 999px;
	--nav-dock-r-expanded: 22px;
	--nav-dock-ease: cubic-bezier(0.32, 0.72, 0, 1);
	--nav-dock-morph: 0.62s var(--nav-dock-ease);
	--nav-dock-pill-delay: 0.44s;
	--nav-dock-pill-morph: 0.22s var(--nav-dock-ease);
	color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--gradient-surface); background-attachment: fixed; color: var(--fg); font: 14px/1.5 var(--font); min-height: 100vh; }
a { color: var(--primary); text-decoration: none; }
a:hover { color: var(--primary-hover); text-decoration: underline; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.app-header {
	display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; justify-content: space-between;
	padding: 14px clamp(16px, 2.5vw, 28px); background: var(--surface); border-bottom: 1px solid var(--line);
	position: sticky; top: 0; z-index: 20; width: 100%;
}
.brand { display: flex; gap: 10px; align-items: center; }
.brand small { display: block; color: var(--muted); font-size: 12px; }
.mark { width: 44px; height: 34px; flex-shrink: 0; display: grid; place-items: center; border-radius: 8px; background: transparent; }
.brand-mark { width: 100%; height: auto; display: block; overflow: visible; }
.brand-mark-float { transform-origin: 48px 36px; animation: brand-mark-hover 3.2s var(--nav-dock-ease) infinite; }
.brand-mark-wing { transform-origin: 44px 38px; animation: brand-mark-flap 1.15s ease-in-out infinite alternate; }
@keyframes brand-mark-hover {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(-2px); }
}
@keyframes brand-mark-flap {
	from { transform: rotate(0deg); }
	to { transform: rotate(-14deg); }
}
.brand:hover .brand-mark-float { animation-duration: 2.4s; }
.brand:hover .brand-mark-wing { animation-duration: 0.75s; }
.header-meta { margin-left: auto; text-align: right; display: grid; gap: 4px; min-width: 0; }
.header-tenant { font-size: 13px; font-weight: 600; color: var(--fg); }
.clock { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: baseline; justify-content: flex-end; color: var(--muted); font-size: 13px; }
.clock-time { font-size: 15px; font-variant-numeric: tabular-nums; color: var(--fg); letter-spacing: 0.02em; }
.clock-sep { color: var(--line); user-select: none; }
.clock-date { font-variant-numeric: tabular-nums; }
.page {
	display: grid; grid-template-columns: var(--nav-dock-w-compact) minmax(0, 1fr); gap: 16px clamp(16px, 2vw, 28px);
	padding: 20px clamp(16px, 2.5vw, 28px) 60px; width: 100%; max-width: none; margin: 0; align-items: start;
	transition: grid-template-columns var(--nav-dock-morph);
}
.page:has(.nav-dock.is-expanded), .page:has(.nav-dock.is-pinned) {
	grid-template-columns: var(--nav-dock-w-expanded) minmax(0, 1fr);
}
.nav-dock-anchor {
	align-self: start; width: 100%; height: 0; overflow: visible; pointer-events: none;
}
.nav-dock {
	position: fixed; z-index: 15;
	top: calc(var(--header-offset) + var(--page-pad-top));
	height: calc(100dvh - var(--header-offset) - var(--page-pad-top) - var(--page-pad-bottom));
	width: var(--nav-dock-w-compact);
	border-radius: var(--nav-dock-r-compact);
	display: flex; flex-direction: column; flex-shrink: 0; pointer-events: auto;
	background: var(--surface); border: 1px solid var(--line);
	padding: 10px 8px; overflow: hidden; isolation: isolate;
	box-shadow: 0 10px 40px color-mix(in srgb, var(--accent-4) 10%, transparent), 0 1px 2px color-mix(in srgb, #12151a 6%, transparent);
	transition: width var(--nav-dock-morph), padding var(--nav-dock-morph), box-shadow 0.28s ease;
}
.nav-dock.is-expanded, .nav-dock.is-pinned {
	width: var(--nav-dock-w-expanded);
	border-radius: var(--nav-dock-r-expanded);
	padding: 10px 12px;
	box-shadow: 0 12px 44px color-mix(in srgb, var(--accent-4) 14%, transparent), 0 2px 4px color-mix(in srgb, #12151a 8%, transparent);
	transition: width var(--nav-dock-morph), padding var(--nav-dock-morph), border-radius 0s linear 0s, box-shadow 0.28s ease;
}
.nav-dock.is-compact:not(.is-pinned) {
	width: var(--nav-dock-w-compact);
	border-radius: var(--nav-dock-r-compact);
	padding: 10px 8px;
	transition: width var(--nav-dock-morph), padding var(--nav-dock-morph),
		border-radius var(--nav-dock-pill-morph) var(--nav-dock-ease) var(--nav-dock-pill-delay),
		box-shadow 0.28s ease;
}
.nav-dock-head {
	position: relative; z-index: 1; display: flex; flex-direction: row; align-items: center; gap: 6px;
	flex-shrink: 0; width: 100%; min-height: 40px;
}
.nav-dock.is-compact:not(.is-pinned) .nav-dock-head { justify-content: center; }
.nav-dock.is-expanded .nav-dock-head, .nav-dock.is-pinned .nav-dock-head { justify-content: flex-start; }
.nav-dock-pin {
	flex: 0 0 auto; color: var(--muted); display: flex; align-items: center; justify-content: center;
	padding: 8px; border-radius: 999px; border: 0; background: transparent;
	cursor: pointer; width: auto;
}
.nav-dock-pin .nav-dock-icon { width: 32px; height: 32px; color: var(--mute); }
.nav-dock-pin:hover { background: var(--sunken); color: var(--muted); }
.nav-dock-pin:hover .nav-dock-icon { color: #707a85; }
.nav-dock-search {
	display: flex; align-items: center; gap: 6px; flex: 0 0 0; width: 0; min-width: 0;
	padding: 0; min-height: 36px; border-radius: 999px; background: var(--sunken);
	border: 1px solid transparent; opacity: 0; overflow: hidden; pointer-events: none;
	transition: opacity var(--nav-dock-morph), flex var(--nav-dock-morph), width var(--nav-dock-morph), padding var(--nav-dock-morph), border-color 0.2s ease;
}
.nav-dock.is-expanded .nav-dock-search, .nav-dock.is-pinned .nav-dock-search {
	flex: 1 1 auto; width: auto; opacity: 1; pointer-events: auto;
	padding: 0 10px; border-color: var(--line);
}
.nav-dock-search-icon { color: var(--muted); display: grid; place-items: center; flex-shrink: 0; }
.nav-dock-search-input {
	border: 0; background: transparent; font: 13px var(--font); color: var(--fg);
	width: 100%; min-width: 0; padding: 8px 0; outline: none;
}
.nav-dock-search-input::placeholder { color: var(--muted); }
.nav-dock.is-compact:not(.is-pinned) .nav-dock-link {
	justify-content: center; gap: 0; padding-left: 10px; padding-right: 10px;
}
.nav-dock-link.is-filtered-out { display: none; }
.nav-dock-links {
	position: relative; z-index: 1; flex: 1 1 auto; display: flex; flex-direction: column;
	justify-content: flex-start; align-items: stretch; gap: 4px; padding: 4px 0 6px; min-height: 0;
	overflow-y: auto;
}
.nav-dock-link {
	position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;
	padding: 10px 12px; border-radius: 999px; border: 0; background: transparent;
	color: var(--fg); font: 500 13.5px var(--font); cursor: pointer; text-align: left;
	width: 100%; text-decoration: none; flex-shrink: 0;
}
.nav-dock-link:hover { background: var(--sunken); text-decoration: none; color: var(--fg); }
.nav-dock-link[aria-current="page"] {
	background: var(--primary-soft); color: var(--primary);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-3) 35%, transparent);
}
.nav-dock-link .nav-dock-icon {
	display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0;
	border-radius: 999px; color: var(--primary);
}
.nav-dock-link[aria-current="page"] .nav-dock-icon { color: var(--primary); }
.nav-dock-label {
	opacity: 0; max-width: 0; overflow: hidden; white-space: nowrap;
	transform: translateX(-10px) scale(0.96);
	transition: opacity 0.32s ease, max-width 0.48s var(--nav-dock-ease), transform 0.38s var(--nav-dock-ease);
}
.nav-dock.is-expanded .nav-dock-label, .nav-dock.is-pinned .nav-dock-label {
	opacity: 1; max-width: 11rem; transform: translateX(0) scale(1);
}
.nav-dock.is-expanded .nav-dock-link .nav-dock-label {
	transition-delay: calc(var(--i, 0) * 55ms + 70ms);
}
.nav-dock.is-compact:not(.is-pinned) .nav-dock-link .nav-dock-label {
	transition: opacity 0.34s var(--nav-dock-ease), max-width var(--nav-dock-morph), transform var(--nav-dock-morph);
	transition-delay: 0ms;
}
.nav-dock.is-compact:not(.is-pinned) .nav-dock-search {
	transition: opacity 0.34s var(--nav-dock-ease), flex var(--nav-dock-morph), width var(--nav-dock-morph), padding var(--nav-dock-morph), border-color 0.28s ease;
}
.nav-dock-pin[aria-pressed="true"] {
	background: color-mix(in srgb, var(--accent-3) 20%, white); color: var(--primary);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-4) 35%, transparent);
}
.nav-dock-pin[aria-pressed="true"] .nav-dock-icon { color: var(--primary); }
.main { min-width: 0; display: grid; gap: 20px; align-content: start; }
h1 { font-size: 22px; margin: 0; }
h2 { font-size: 16px; margin: 0; }
.head { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; justify-content: space-between; }
.head p { margin: 4px 0 0; color: var(--muted); max-width: 80ch; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; min-width: 0; box-shadow: 0 1px 2px color-mix(in srgb, #12151a 4%, transparent); }
.card > header { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.card > .body { padding: 16px; display: grid; gap: 14px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; gap: 2px; border-top: 2px solid color-mix(in srgb, var(--accent-3) 45%, transparent); }
.tile span { color: var(--muted); font-size: 12px; }
.tile strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; color: var(--muted); font-weight: 600; background: var(--sunken); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mono { font-family: var(--mono); font-size: 12.5px; }
.muted { color: var(--muted); }
.pill { display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.pill.ok { color: var(--ok); background: var(--ok-bg); } .pill.warn { color: var(--warn); background: var(--warn-bg); }
.pill.bad { color: var(--bad); background: var(--bad-bg); } .pill.info { color: var(--info); background: var(--info-bg); }
.pill.mute { color: var(--mute); background: var(--mute-bg); }
.dialog-overlay { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, #12151a 38%, transparent); }
.dialog-overlay[hidden] { display: none; }
body.dialog-open { overflow: hidden; }
.dialog { width: min(100%, 420px); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px 14px; box-shadow: 0 18px 50px color-mix(in srgb, #12151a 14%, transparent); display: grid; gap: 10px; border-top: 3px solid var(--info); }
.dialog.tone-warn { border-top-color: var(--warn); } .dialog.tone-bad { border-top-color: var(--bad); }
.dialog.tone-ok { border-top-color: var(--ok); } .dialog.tone-info { border-top-color: var(--info); }
.dialog-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--fg); }
.dialog-body { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.55; }
.dialog-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 4px; }
.btn { font: 600 13.5px var(--font); border: 1px solid var(--line); background: var(--surface); color: var(--fg); padding: 7px 14px; border-radius: 7px; cursor: pointer; }
.btn:hover { background: var(--sunken); }
.btn.primary { background: var(--gradient-brand); border-color: transparent; color: var(--primary-fg); box-shadow: 0 1px 10px color-mix(in srgb, var(--accent-4) 30%, transparent); }
.btn.primary:hover { filter: brightness(1.05); background: var(--gradient-brand); }
.btn.small { padding: 3px 10px; font-size: 12.5px; }
.btn:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
form.inline { display: inline; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px 18px; }
.grid2-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
table.counters th.key { font-family: var(--mono); font-size: 12px; font-weight: 500; }
.stack-sm { display: grid; gap: 2px; }
.stack-sm .sub { font-size: 12px; color: var(--muted); }
.head-count { margin-left: auto; align-self: center; color: var(--muted); font-size: 13px; white-space: nowrap; }
.corrida-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: var(--muted); font-size: 13px; margin-top: 4px; }
label.field { display: grid; gap: 5px; font-weight: 600; font-size: 13px; }
label.field small { font-weight: 400; color: var(--muted); }
input[type=text], input[type=password], input[type=number], input[type=search], input[type=url], select {
	font: 14px var(--font); padding: 7px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--fg); width: 100%; }
fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; }
fieldset legend { font-weight: 600; font-size: 13px; padding: 0 4px; }
fieldset label { display: inline-flex; gap: 6px; align-items: center; font-size: 13.5px; }
dl.facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; margin: 0; }
dl.facts dt { color: var(--muted); }
dl.facts dd { margin: 0; }
.timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.timeline li { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; }
.timeline time { color: var(--muted); font-size: 12.5px; }
.note { background: color-mix(in srgb, var(--gradient-a) 65%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent-2) 25%, var(--line)); border-radius: 8px; padding: 10px 14px; color: var(--muted); font-size: 13px; }
.search { display: flex; gap: 8px; max-width: 420px; }
details summary { cursor: pointer; font-weight: 600; }
@media (max-width: 860px) {
	.app-header { padding: 12px 16px; }
	.page, .page:has(.nav-dock.is-expanded), .page:has(.nav-dock.is-pinned) {
		grid-template-columns: minmax(0, 1fr); padding: 12px 16px 48px; gap: 14px;
	}
	.nav-dock-anchor { height: auto; width: 100%; pointer-events: auto; }
	.nav-dock {
		position: static; z-index: auto; left: auto !important; width: 100% !important;
		height: auto; border-radius: 16px; flex-direction: row; flex-wrap: wrap;
		align-items: flex-start; align-content: flex-start; padding: 8px;
	}
	.nav-dock-links { flex: 1 1 100%; flex-direction: row; flex-wrap: wrap; justify-content: flex-start; padding: 0; overflow: visible; }
	.nav-dock.is-expanded, .nav-dock.is-pinned { border-radius: 16px; width: 100%; }
	.nav-dock-head { flex: 1 1 100%; flex-direction: row; flex-wrap: wrap; align-items: center; }
	.nav-dock-search { max-height: none; opacity: 1; pointer-events: auto; flex: 1 1 12rem; }
	.nav-dock-link, .nav-dock-pin { width: auto; flex: 1 1 auto; min-width: 7.5rem; justify-content: flex-start; border-radius: 10px; }
	.nav-dock-label { opacity: 1; max-width: none; transform: none; transition: none; }
	.nav-dock-pin { flex: 0 0 auto; width: auto; }
	.header-meta { width: 100%; text-align: left; margin-left: 0; }
	.clock { justify-content: flex-start; }
	.timeline li { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
@media (prefers-reduced-motion: reduce) {
	.nav-dock, .nav-dock-label, .page { transition: none; }
	.brand-mark-float, .brand-mark-wing { animation: none; }
}
`
