# Nota de entrega — Alejandro

Repositorio: https://github.com/allett29/cobrix-prueba-facturacion

## Cómo levantar y probar

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

Un servicio levanta panel y API en loopback. En **Resumen**, Swagger usa `/sim/…` para funcionar en el mismo host público. Plan Free: primera carga ~30–60 s.

## Decisiones arquitectónicas

Traté el caso como un **conector B2B de reconciliación**: el administrador del ISP es la fuente de verdad del cobro en su sistema; Cobrix materializa cuentas por cobrar, trazabilidad por corrida y reglas conservadoras. Guié el diseño con Cursor como asistente, pero cerré contratos antes de codear (schema, sync, seguridad).

**Límites y fuentes de verdad**

- Cobrix **solo HTTP** hacia el ISP; la SQLite de `billing-api` no entra en la integración (aunque la miré para entender casos).
- Dos contextos: `data/billing-api.sqlite` (entregado) vs `data/cobrix.sqlite` (dominio Cobrix). En UI digo “contratos”; en BD `contrato_proveedor` + `proveedor_id` para no mezclar espejo de integración con el contrato del administrador y dejar listo multi-proveedor (`UNIQUE(proveedor_id, id_contrato_isp)` e idempotencia por `(proveedor_id, id_cuota_proveedor)`).

**Modelo de datos**

- Tablas y columnas en **español**, montos en **centavos** (`INTEGER`), fechas civiles en texto.
- Corridas append-only: `corrida` + `corrida_detalle` (una fila por cuota evaluada) y contadores en JSON en `corrida.contadores` (mismo vocabulario que los layouts de referencia, sin inflar el schema).
- `historial_cliente` append-only para el timeline del expediente.
- **Simulación:** persiste corrida y detalle; **no** escribe clientes/facturas/contratos.

**Reglas de sync (§4)**

- Importación: normalización de titular, filtros de estado/ventana/topes/tipo documento/moneda incoherente; `deuda_id: "0"` y saldo residual descartados; idempotencia estricta.
- Pagadas: marcar **pagada** solo con evidencia clara en `pago_informacion` (incluyendo `success: false` con datos válidos); **abono parcial** → informar y dejar abierta; **sin evidencia** → no adivinar.
- **Reconciliación inversa:** si el ISP anula un cobro (caso ELENA), la siguiente actualización realinea estado y saldo en Cobrix, no un “rollback” reactivo tipo pasarela.
- Topes por corrida aplicados igual en **simular** e **importar** (misma lógica de contadores).

**Credenciales y sesión**

- Usuario/contraseña del proveedor = credencial de integración (cifrada en reposo con `COBRIX_MASTER_KEY`, seed sandbox para que `npm start` funcione sin `.env`).
- `access_token` Bearer = sesión efímera en memoria del cliente HTTP; re-login ante 401/expiración. Son capas distintas.

**Operación**

- Corrida automática diaria en `America/Caracas` (import → pagadas), una vez por fecha, configurable en panel.
- Mutaciones de dominio en transacciones SQLite; corrida fallida al inicio (login/red) sin tocar AR.

**Panel**

- Mantuve el **SSR del esqueleto** (`src/web/`): reglas y sync en `src/cobrix/`, presentación delgada.
- En Render, proxy **`/sim`** hacia la API en loopback para Swagger/OpenAPI en la URL pública (el panel sigue usando loopback para las corridas).

## Uso de Cursor (IA)

La usé para acelerar scaffolding, pruebas y revisión de edge cases; validé todo con `npm test`, typecheck y recorridos manuales (Swagger + panel). Donde tuve que **corregir o decidir** sobre lo generado:

- **Diseño previo al código:** acordamos schema (8 tablas, JSON de contadores, cifrado + token), reconciliación conservadora y reapertura tras anulación ISP; rechacé capas “enterprise” que no servían al enunciado.
- **Cliente HTTP:** quirks documentados (`estado` en lista de contratos, arrays sin envoltorio, ledger con `success: false`); tests de reglas y aceptación §5 antes de pulir UX.
- **Motores de sync:** simulación con mismos topes que import real; orden de borrado con FKs (`corrida_detalle` antes de facturas); reset de `ultima_corrida_automatica_fecha` al borrar importados para poder reprobar el scheduler.
- **Panel / producción:** bug en modales de confirmación que anulaba el POST (p. ej. borrar datos); proxy `/sim` y health check para demo en Render.
- **Revisión de casos:** abono parcial LUIS, anulación ELENA, moneda incoherente 900110 — contrastados con detalle de corrida y tests.

## Punto diferencial

- **UI/UX:** panel operable alineado a la referencia de layout (resumen, config, sync con detalle fila a fila, clientes/expediente), modales de confirmación/alerta, menú flotante, identidad visual Cobrix.
- **Despliegue:** demo pública en Render con `/health` y Swagger en `/sim/docs` para que el evaluador pruebe sin levantar Node local.

## Con más tiempo

Misma arquitectura de sync, con capas de **plataforma** si el producto crece:

- Cola de trabajos (Redis/SQS) y workers para import/pagadas con reintentos, backoff y un solo disparo por tenant (lock distribuido si hay varias réplicas).
- Cron externo o CronJob en lugar de sondeo en el proceso del panel.
- Observabilidad: métricas por corrida (excluidas, fallos ISP, latencia), trazas y alertas.
- Secretos en vault gestionado, rotación y auditoría de acceso al panel (RBAC, multi-tenant fuerte).
- E2E del flujo operador (Playwright); frontend en React/Tailwind opcional consumiendo el mismo núcleo `src/cobrix`.
- Postgres + migraciones y disco persistente en producción; adaptadores por vendor cuando cada ISP cambie la API.
