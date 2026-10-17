# Nota de entrega

## Decisiones y arquitectura

Documentadas en [`docs/DECISIONES.md`](docs/DECISIONES.md): SQLite Cobrix separado del ISP, montos en centavos, sync idempotente, reconciliación conservadora (sin adivinar), contraseña cifrada y token Bearer en memoria.

## Stack

Node 24 + TypeScript sin dependencias de runtime: API simulada y panel SSR en el mismo proceso (`src/main.ts`). Se reutilizó el esqueleto de estilos del zip para iterar rápido y cumplir la referencia de layout del enunciado.

## Uso de IA

Asistentes (Cursor) para explorar el zip, alinear nombres con el enunciado, escribir tests de aceptación y revisar casos borde de la API. Todo el código se validó con `npm test`, `npm run typecheck` y pruebas manuales del panel contra Swagger.

## Extras entregados (además del enunciado)

- **Panel UX:** paleta Cobrix, menú flotante, modales de confirmación/alerta, colibrí animado en cabecera.
- **Despliegue Render:** [`render.yaml`](render.yaml) + guía [`docs/DEPLOY-RENDER.md`](docs/DEPLOY-RENDER.md) (un servicio Node 24, API ISP en loopback, disco opcional en `/var/data`).

## Omisiones / con más tiempo

- Cola de trabajos y reintentos con backoff para corridas largas.
- Observabilidad (métricas, trazas por corrida).
- Tests E2E del panel con navegador.
- UI con componentes (p. ej. React + Tailwind) si el producto creciera.
- Exponer Swagger en URL pública o job aparte en Render.

## Punto diferencial

Historial append-only por cliente (`historial_cliente`) y detalle de corrida fila a fila, para que operación de cobranza vea **por qué** se importó, excluyó o marcó pagada cada cuota, no solo contadores.
