# Nota de entrega — Alejandro

Repositorio: https://github.com/allett29/cobrix-prueba-facturacion

## Cómo levantar y probar

Node **24** (`node:sqlite`, TypeScript ejecutado sin build).

```bash
npm install
npm start
npm test
npm run typecheck
```

| Qué | URL |
| --- | --- |
| Panel | http://127.0.0.1:4300 |
| Enunciado en el panel | http://127.0.0.1:4300/enunciado |
| API simulada | http://127.0.0.1:4310/api/v1 |
| Swagger + simulador de caja | http://127.0.0.1:4310/docs |

Proveedor: `cobrix` / `cobrix-sandbox`. Fecha sandbox: **2026-10-13** (`SANDBOX_TODAY`).

### Variables de entorno (opcionales)

| Variable | Uso |
| --- | --- |
| `PORT` | Panel (4300) |
| `BILLING_API_PORT` | API simulada (4310) |
| `COBRIX_DB` | Ruta de `data/cobrix.sqlite` |
| `COBRIX_MASTER_KEY` | Cifrado de contraseña del proveedor (`src/cobrix/crypto.ts`) |
| `SANDBOX_TODAY` | Fecha “hoy” del sandbox |
| `COBRIX_SCHEDULER_INTERVAL_MS` | Sondeo corrida automática (5000 local; 30000 en Render) |
| `HOST` | Interfaz del panel (`0.0.0.0` en Render) |
| `BILLING_API_HOST` | API simulada en loopback (`127.0.0.1` en Render) |
| `SIMULATOR_URL` | Base HTTP hacia el ISP (p. ej. `http://127.0.0.1:4310`) |
| `BILLING_API_DB` | Ruta SQLite del administrador simulado |

### Flujo operativo

1. **Configuración** → Probar conexión.
2. **Sincronización** → Simular e **Importar**.
3. Swagger → **Simulador** → `POST /__sim/pagar` / `POST /__sim/anular`.
4. **Actualizar pagadas**.
5. **Clientes**, expedientes y detalle de corrida.

Corrida automática (si está activa): importación y pagadas a la hora configurada, zona `America/Caracas`.

### Estructura del código

| Ruta | Contenido |
| --- | --- |
| `src/billing-api/` | API simulada del ISP |
| `src/cobrix/` | Dominio, sync HTTP, corrida automática, reglas §4 |
| `src/web/` | Panel SSR |
| `src/main.ts` | Arranque panel + API simulada |
| `test/` | 30 pruebas (reglas, aceptación, entorno) |
| `render.yaml` | Blueprint Render |

## Demo en Render

| Qué | Enlace |
| --- | --- |
| Panel | https://cobrix-prueba-facturacion.onrender.com |
| Health | https://cobrix-prueba-facturacion.onrender.com/health |
| Swagger (`/sim`) | https://cobrix-prueba-facturacion.onrender.com/sim/docs |
| OpenAPI | https://cobrix-prueba-facturacion.onrender.com/sim/openapi.json |
| Desplegar copia | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/allett29/cobrix-prueba-facturacion) |

Un servicio levanta panel y API en loopback. En **Resumen**, Swagger usa `/sim/…` para funcionar en el mismo host público. Plan Free: primera carga ~30–60 s.

## Decisiones arquitectónicas

**Node 24 + TypeScript**, sin dependencias de runtime: panel SSR y API simulada en un proceso (`src/main.ts`), tests con el runner nativo de Node.

- Cobrix solo habla **HTTP** con el administrador; no lee la SQLite del ISP.
- ISP = fuente de verdad; Cobrix **reconcilia** en corridas (**no adivinar**: respuestas raras, exoneradas, abonos parciales → motivo en detalle, sin marcar pagada sin evidencia).
- **`data/cobrix.sqlite`**: `empresa`, `proveedor`, `cliente`, `contrato_proveedor`, `factura`, `corrida`, `corrida_detalle`, `historial_cliente`; montos en centavos.
- Token Bearer en memoria; contraseña del proveedor cifrada en reposo.
- Importación idempotente por `(proveedor_id, id_cuota_proveedor)`; simulación registra corrida/detalle sin escribir clientes/facturas.
- Pagadas según §4; anulaciones en el ISP se realinean en la siguiente corrida.
- Corrida automática en `America/Caracas`; transacciones SQLite en mutaciones de dominio.

Sync en `src/cobrix/sync/`; panel en `src/web/`.

## Uso de Cursor (IA)

Exploración del repo, tests de aceptación, panel y despliegue. Validación con `npm test`, `npm run typecheck` y pruebas manuales en Swagger.

Donde corregí o decidí yo:

- **Reglas §4:** tests de aceptación (import + ciclo pagos/anulación) antes de cerrar UX; cada exclusión/pago con fila en `corrida_detalle`.
- **Modales:** bug en confirmación (borrar importados): el cierre del diálogo cancelaba el POST; solución con `formToSubmit` en el handler.
- **Producción:** proxy **`/sim`** para Swagger/OpenAPI en el mismo host (enlaces directos a `127.0.0.1:4310` no sirven en Render).
- **Marca:** orientación del SVG con un flip vertical sobre el trazado escalado; paleta turquesa→azul en el colibrí; botones primarios con texto blanco.

## Punto diferencial

- **UI/UX:** identidad Cobrix (paleta, menú flotante, modales de confirmación, colibrí en cabecera y diálogos).
- **Render:** demo pública, health check, Swagger vía `/sim`.
- **Operación:** detalle de corrida fila a fila e historial por cliente (motivo de cada cuota).

## Con más tiempo

- Cola de trabajos con reintentos para corridas largas.
- Observabilidad (métricas/trazas por corrida).
- E2E del panel (Playwright).
- Panel en React/Tailwind manteniendo `src/cobrix` como núcleo.
- Postgres o disco persistente en Render; secretos en vault gestionado.
