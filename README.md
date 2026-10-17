# Prueba técnica · Cobrix

Integración de Cobrix con la API de un **administrador de facturas** ISP: importación de clientes y facturas, reconciliación de pagados y panel operativo.

**Enunciado:** [`docs/ENUNCIADO.md`](docs/ENUNCIADO.md) · **Nota de entrega (decisiones, IA, demo):** [`NOTA.md`](NOTA.md)

## Evaluador — ejecutar en Render (sin Node local)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/allett29/cobrix-prueba-facturacion)

1. Clic en el botón → [iniciar sesión en Render](https://dashboard.render.com/login) (GitHub).
2. **Apply** en el blueprint (`render.yaml`).
3. Abrir la URL **Live** del servicio.

Demo y guía del evaluador: [`NOTA.md`](NOTA.md) · Credenciales: `cobrix` / `cobrix-sandbox`.

## Requisitos

Node **24** (usa `node:sqlite` y ejecuta `.ts` sin compilar). Con Node 20 verás `ERR_UNKNOWN_FILE_EXTENSION` o `ERR_UNKNOWN_BUILTIN_MODULE`.

```bash
npm install
npm start
```

| Servicio | URL |
| --- | --- |
| Panel Cobrix | http://127.0.0.1:4300 |
| API del administrador | http://127.0.0.1:4310/api/v1 |
| Swagger (incluye simulador de caja) | http://127.0.0.1:4310/docs |

Credenciales por defecto del proveedor: usuario `cobrix`, contraseña `cobrix-sandbox`.

La fecha de la prueba queda fijada en **2026-10-13** (`SANDBOX_TODAY` en `npm start`) para que coincidan los criterios de aceptación del enunciado.

## Variables de entorno (opcionales)

| Variable | Uso |
| --- | --- |
| `PORT` | Panel (4300) |
| `BILLING_API_PORT` | API simulada (4310) |
| `COBRIX_DB` | Ruta de `data/cobrix.sqlite` |
| `COBRIX_MASTER_KEY` | Clave para cifrar la contraseña del proveedor (ver `src/cobrix/crypto.ts`) |
| `SANDBOX_TODAY` | Fecha “hoy” del sandbox |
| `COBRIX_SCHEDULER_INTERVAL_MS` | Intervalo del sondeo de corrida automática (default 5000; en producción suele usarse 30000+) |
| `HOST` | Interfaz del panel (`0.0.0.0` en Render) |
| `BILLING_API_HOST` | Interfaz de la API simulada (p. ej. `127.0.0.1` en Render) |
| `SIMULATOR_URL` | URL base que Cobrix usa hacia el ISP (p. ej. `http://127.0.0.1:4310`) |
| `BILLING_API_DB` | Ruta de la SQLite del administrador simulado |

## Flujo típico

1. **Configuración** → probar conexión con la API.
2. **Sincronización** → simular e **importar** clientes/facturas.
3. En Swagger → **Simulador** → `POST /__sim/pagar` (y anular si aplica).
4. **Actualizar pagadas** en el panel.
5. Revisar **Clientes**, expedientes y detalle de corridas.

La **corrida automática** (si está activa en configuración) ejecuta importación y actualización de pagadas una vez al día a la hora indicada, zona `America/Caracas`.

## Despliegue en Render (demo pública)

Blueprint en [`render.yaml`](render.yaml). URL demo y Swagger `/sim`: [`NOTA.md`](NOTA.md).

## Pruebas

```bash
npm test           # reglas, sync, ciclo de aceptación y entorno
npm run typecheck
```

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/billing-api/` | API simulada del ISP (no modificar) |
| `src/cobrix/` | Dominio, sync HTTP, corrida automática |
| `src/web/` | Panel SSR (Node + plantillas) |
| `data/cobrix.sqlite` | Base Cobrix (generada al arrancar, en `.gitignore`) |
