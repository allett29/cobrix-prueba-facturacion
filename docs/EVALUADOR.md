# Guía para el evaluador

Puedes revisar la prueba **sin instalar Node** desplegando el repo en Render (plan Free). El blueprint [`render.yaml`](../render.yaml) levanta panel + API simulada en un solo servicio.

## Opción A — Despliegue automático (recomendado)

1. Abre: **[Deploy to Render](https://render.com/deploy?repo=https://github.com/allett29/cobrix-prueba-facturacion)**  
   (o [inicia sesión](https://dashboard.render.com/login) con GitHub y **New → Blueprint** → repo `allett29/cobrix-prueba-facturacion`).
2. Pulsa **Apply** cuando Render muestre el blueprint.
3. Espera estado **Live** (build: `npm install`, start: `npm start`, Node 24).
4. Abre la URL pública del servicio (`https://…onrender.com`).

**Primera visita (plan Free):** el servicio puede tardar ~30–60 s en despertar.

## Opción B — Demo ya desplegada por el candidato

Si en `NOTA.md` hay una **URL de Render**, ábrela directamente (mismo flujo de prueba abajo).

## Credenciales y fecha sandbox

| Campo | Valor |
| --- | --- |
| Usuario proveedor | `cobrix` |
| Contraseña proveedor | `cobrix-sandbox` |
| Fecha “hoy” del sandbox | `2026-10-13` (variable `SANDBOX_TODAY` en Render) |

## Recorrido sugerido (5–10 min)

1. **Resumen** — métricas iniciales.
2. **Configuración** → **Probar conexión** (API simulada en el mismo proceso).
3. **Sincronización** → **Simular importación** → **Importar**.
4. **Clientes** → abrir un expediente.
5. **Sincronización** → detalle de corrida (contadores + filas).
6. Opcional: **Actualizar pagadas** tras simular pagos en entorno local con Swagger (en Render no hace falta para validar importación y reglas).

## Comprobación técnica local (opcional)

```bash
npm install
npm test
npm run typecheck
```

Node **24** obligatorio en local (`node:sqlite`).

## Health check

`GET /health` → `200 ok` (usado por Render).
