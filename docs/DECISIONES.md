# Decisiones de diseño — integración Cobrix ↔ administrador ISP

Este documento fija el criterio de ingeniería para la implementación. El enunciado describe un **caso real del día a día** en Cobrix: no es un “modo demo” con reglas distintas a producción para este tipo de integración.

## Alcance del producto

- Cobrix **materializa cuentas por cobrar** a partir del administrador de facturas del ISP (HTTP).
- El ISP es **fuente de verdad** del devengo y del cobro en su sistema; Cobrix **reconcilia** en corridas, no adivina.
- No se lee `data/billing-api.sqlite` desde Cobrix; solo la API en el puerto configurado.

## Integración HTTP

- Login con usuario/contraseña del proveedor → `access_token` Bearer (~2 h, sin refresh).
- Token en **memoria** en el cliente HTTP; contraseña **cifrada en reposo** en `proveedor.contrasena_cifrada`.
- Variable opcional `COBRIX_MASTER_KEY` para cifrado; en desarrollo local existe fallback documentado en README.

## Reconciliación

- **Importación:** idempotente por `(proveedor_id, id_cuota_proveedor)`; simulación persiste corrida y detalle pero **no** escribe cliente/factura/contrato.
- **Pagadas:** marcar pagada solo con evidencia del libro (§4): filas coherentes, saldo 0, algo pagado.
- **Abono parcial:** se informa; la factura **permanece abierta**; no se reduce saldo en Cobrix.
- **Sin evidencia / exonerada:** no marcar pagada.
- **Anulación en el ISP:** en la siguiente actualización, alinear con el libro; si Cobrix tenía `pagada` y el ISP ya no salda → volver a `abierta`, restaurar saldo, registrar en `historial_cliente`.

## Modelo de datos (SQLite, español)

- `empresa`, `proveedor`, `cliente`, `contrato_proveedor`, `factura`, `corrida`, `corrida_detalle`, `historial_cliente`.
- Montos en **centavos** (`INTEGER`); moneda `USD`.
- UI muestra “contratos”; en BD `contrato_proveedor` delimita el bounded context.
- Contadores de corrida en JSON (`corrida.contadores`), claves alineadas con la referencia de layout.

## Corrida automática

- Si está activa en `proveedor`, el proceso revisa cada ~30 s la hora en `America/Caracas`.
- A la hora configurada ejecuta **importación** y luego **actualización de pagadas** (no simulación).
- `proveedor.ultima_corrida_automatica_fecha` evita repetir el mismo día tras un reinicio.

## Errores y atomicidad

- Fallo de autenticación o corrida abortada al inicio → `corrida` en `fallida` sin mutar dominio.
- Operaciones de negocio en transacciones SQLite (factura + historial, etc.).

## Infraestructura fuera de este repositorio

Colas distribuidas, observabilidad, vault enterprise y despliegue multi-región son capas de **plataforma** sobre el mismo núcleo de sync descrito arriba; no sustituyen este diseño.

## IA en el desarrollo

Ver `NOTA.md` (entrega) para uso de asistentes, verificación manual y correcciones.
