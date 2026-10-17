/**
 * Starts the test environment in one process:
 *   - the invoice manager API over data/billing-api.sqlite  (BILLING_API_PORT, default 4310)
 *   - the panel skeleton                                     (PORT, default 4300)
 *
 * The provided database was generated for 2026-10-13. That date is pinned by default so
 * the acceptance numbers in docs/ENUNCIADO.md hold; set SANDBOX_TODAY to change it.
 */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.SANDBOX_TODAY ??= '2026-10-13'

const { DEFAULT_BILLING_API_DB, seedBillingApi } = await import('./billing-api/seed.ts')
const { createBillingApiServer } = await import('./billing-api/server.ts')
const { DEFAULT_COBRIX_DB, openCobrixDatabase } = await import('./cobrix/db.ts')
const { iniciarCorridaAutomatica } = await import('./cobrix/corrida-automatica.ts')
const { createApp } = await import('./web/app.ts')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const billingApiDb = process.env.BILLING_API_DB ?? DEFAULT_BILLING_API_DB
const cobrixDbPath = process.env.COBRIX_DB ?? DEFAULT_COBRIX_DB
const appPort = Number(process.env.PORT ?? 4300)
const billingApiPort = Number(process.env.BILLING_API_PORT ?? 4310)
/** Panel (público en Render: 0.0.0.0). API simulada suele quedar solo en loopback. */
const panelHost = process.env.HOST ?? '127.0.0.1'
const billingHost = process.env.BILLING_API_HOST ?? panelHost
const simulatorUrl =
	process.env.SIMULATOR_URL ??
	`http://${billingHost === '0.0.0.0' ? '127.0.0.1' : billingHost}:${billingApiPort}`

if (!existsSync(billingApiDb)) seedBillingApi(billingApiDb)

const billingApi = createBillingApiServer(billingApiDb)
await billingApi.listen(billingApiPort, billingHost)

const cobrix = openCobrixDatabase(cobrixDbPath, { apiBaseUrl: simulatorUrl })

const app = createApp({
	simulatorUrl,
	assignmentPath: resolve(root, 'docs/ENUNCIADO.md'),
	db: cobrix.db,
})
app.listen(appPort, panelHost)

const detenerCorridaAutomatica = iniciarCorridaAutomatica(cobrix.db)

const panelPublicHost = panelHost === '0.0.0.0' ? 'localhost' : panelHost
console.log(`Panel Cobrix:             http://${panelPublicHost}:${appPort}`)
console.log(`API del administrador:    ${simulatorUrl}/api/v1`)
console.log(`Swagger:                  ${simulatorUrl}/docs`)
console.log(`Fecha de la prueba:       ${process.env.SANDBOX_TODAY}`)
console.log(`Base Cobrix:              ${cobrixDbPath}`)

const shutdown = (): void => {
	detenerCorridaAutomatica()
	app.close()
	cobrix.db.close()
	void billingApi.close().then(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
