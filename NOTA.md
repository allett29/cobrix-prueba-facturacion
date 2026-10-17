# Nota de entrega — Alejandro

Documento único para el evaluador: decisiones, uso de IA, demo en Render y cómo revisar la prueba. El enunciado oficial sigue en [`docs/ENUNCIADO.md`](docs/ENUNCIADO.md); la guía de la API simulada en [`docs/API.md`](docs/API.md).

## Cómo levantar y probar

**Local (Node 24):**

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

Proveedor por defecto: `cobrix` / `cobrix-sandbox`. Fecha sandbox: **2026-10-13** (`SANDBOX_TODAY`).

**Repositorio:** https://github.com/allett29/cobrix-prueba-facturacion

## Demo en Render (sin instalar Node)

| Qué | Enlace |
| --- | --- |
| Panel en vivo | https://cobrix-prueba-facturacion.onrender.com |
| Health check | https://cobrix-prueba-facturacion.onrender.com/health |
| Swagger (mismo host, proxy `/sim`) | https://cobrix-prueba-facturacion.onrender.com/sim/docs |
| OpenAPI | https://cobrix-prueba-facturacion.onrender.com/sim/openapi.json |
| Desplegar tu copia | [Deploy to Render](https://render.com/deploy?repo=https://github.com/allett29/cobrix-prueba-facturacion) |

Blueprint: [`render.yaml`](render.yaml). Un solo servicio ejecuta panel + API simulada en loopback (`BILLING_API_HOST=127.0.0.1`, `SIMULATOR_URL=http://127.0.0.1:4310`). En el **Resumen** los enlaces de Swagger apuntan a `/sim/…`, no a `127.0.0.1:4310`, para que funcionen en producción.

Credenciales y fecha sandbox: iguales que en local. En plan Free la primera carga puede tardar ~30–60 s.

**Recorrido sugerido:** Configuración → Probar conexión → Sincronización (simular e importar) → Clientes / expediente → detalle de corrida. Pagos de aceptación §5: simulador en Swagger (`POST /__sim/pagar`, `POST /__sim/anular`); en local es `:4310/docs`, en Render `/sim/docs`.

## Stack y decisiones arquitectónicas

Seguí el esqueleto del zip: **Node 24 + TypeScript sin dependencias de runtime**. Arranqué desde `src/main.ts` con panel SSR y API simulada en el mismo proceso porque el enunciado ya venía así y me permitía cerrar criterios de aceptación rápido con `node:sqlite` y tests nativos.

**Límites que me impuse (caso real Cobrix):**

- Cobrix **no** lee `data/billing-api.sqlite`; solo habla HTTP con el administrador, como con un ISP real.
- ISP = fuente de verdad del devengo/cobro; Cobrix **reconcilia** en corridas. Regla de oro: **no adivinar** (estados raros, filas incoherentes, exoneradas, abonos parciales → registrar motivo, no marcar pagada a ciegas).
- Dos bases: SQLite del simulador (intocable en `src/billing-api/`) y **`data/cobrix.sqlite`** con dominio en español: `empresa`, `proveedor`, `cliente`, `contrato_proveedor`, `factura`, `corrida`, `corrida_detalle`, `historial_cliente`.
- Montos en **centavos** (`INTEGER`), moneda USD en UI.
- Login Bearer (~2 h); token en **memoria** en el cliente HTTP; contraseña del proveedor **cifrada en reposo** (`COBRIX_MASTER_KEY` en Render, fallback documentado en README para local).
- Importación **idempotente** por `(proveedor_id, id_cuota_proveedor)`. Simulación escribe corrida + detalle pero **no** clientes/facturas.
- Pagadas: solo con evidencia del libro (§4). Anulación en el ISP: realinear en la siguiente corrida (reabrir factura si hace falta) y dejar rastro en historial.
- Corrida automática: hora en `America/Caracas`, import + pagadas (no simulación); `ultima_corrida_automatica_fecha` evita duplicar el mismo día tras reinicio.
- Transacciones SQLite en operaciones de negocio; corrida fallida al inicio (p. ej. credenciales) queda en `fallida` sin mutar dominio.

**Sync:** lógica en `src/cobrix/sync/` (importación, pagadas, filtros alineados con §4). Panel en `src/web/` (rutas en `app.ts`, layout/estilos en `layout.ts`).

## Uso de Cursor (IA) y dónde tuve que corregir o decidir yo

Usé Cursor como en el día a día que describe el correo: explorar el zip, nombrar cosas como el enunciado, bosquejar tests de aceptación y acelerar UI. **Yo revisé todo** con `npm test`, `npm run typecheck` y pruebas manuales contra Swagger.

Puntos donde la IA propuso y **yo ajusté con criterio de ingeniero:**

- **Clasificación API / reglas §4:** prioricé tests explícitos (aceptación import + ciclo completo pagos/anulación) antes de pulir pantallas; no acepté atajos que “parecían” cuadrar sin fila en `corrida_detalle`.
- **Modales de confirmación:** detecté un bug al confirmar (p. ej. borrar importados): el cierre del diálogo anulaba el POST; lo corregí guardando `formToSubmit` en el closure, no el parche superficial que sugería el asistente.
- **Render / evaluador remoto:** decidí proxy **`/sim`** en el panel para Swagger y OpenAPI en el mismo host; la IA a veces enlazaba `127.0.0.1:4310` en HTML, inútil en producción.
- **Colibrí / marca:** el SVG venía con transform de export; probamos espejos y giros hasta que **un solo flip vertical** sobre el trazado escalado fuera el criterio visual correcto (la IA interpretaba mal el dibujo varias veces).
- **UX:** paleta turquesa → degradado (sin dominar rosa/violeta en el logo), botones primarios con **texto blanco**, modales con texto centrado — decisiones mías tras ver el panel, no copiar capturas pixel a pixel.

## Punto diferencial (extra)

1. **UI/UX:** panel con identidad Cobrix (color, menú flotante, confirmaciones/alertas modales, colibrí en cabecera y diálogos), pensado para operador de cobranza, no copia del esqueleto gris.
2. **Despliegue Render:** demo pública con blueprint, health check y Swagger accesible vía `/sim` para quien evalúa sin Node local.

Además, el detalle de corrida **fila a fila** y el **historial por cliente** ayudan a ver *por qué* se importó, excluyó o marcó pagada cada cuota (no solo contadores).

## Con más tiempo (si la aplicación creciera)

- Cola de trabajos (Redis/SQS) con reintentos y backoff para corridas largas; el scheduler actual es adecuado para la prueba, no para millones de cuotas.
- Observabilidad: métricas y trazas por corrida, alertas si una sync falla en producción.
- Tests E2E del panel (Playwright) además de los 30 tests Node actuales.
- Front con componentes (React + Tailwind/shadcn) si el producto escala; mantendría el dominio en `src/cobrix` y trataría el panel como cliente.
- Persistencia en Render (disco) o Postgres si Cobrix deja de ser SQLite embebido; vault gestionado para secretos.
- Multi-tenant, HA y colas distribuidas como capa de plataforma sobre el mismo núcleo de sync.

## Qué dejé fuera a propósito

- No modifiqué `src/billing-api/` (requisito del enunciado).
- No migré a otro stack: el tiempo iba a reglas, robustez y operación, no a reescribir el panel en React.
