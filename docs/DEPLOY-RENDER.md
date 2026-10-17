# Despliegue en Render (extra de entrega)

Un solo **Web Service** ejecuta `npm start`: panel SSR (puerto `PORT` de Render) y API simulada del ISP en `127.0.0.1:4310` (solo uso interno del proceso; la sync no expone SQLite).

## Despliegue rápido

1. Sube el repo a GitHub (o conecta el remoto que uses).
2. En [Render](https://dashboard.render.com) → **New** → **Blueprint** → selecciona el repo.
3. Render lee [`render.yaml`](../render.yaml) en la raíz.
4. Tras el build, abre la URL pública (`https://…onrender.com`).

## Variables ya definidas en el blueprint

| Variable | Motivo |
| --- | --- |
| `HOST=0.0.0.0` | Escuchar en la interfaz que expone Render |
| `BILLING_API_HOST=127.0.0.1` | API simulada no accesible desde Internet |
| `SIMULATOR_URL=http://127.0.0.1:4310` | URL que usa Cobrix al hablar con el ISP |
| `COBRIX_MASTER_KEY` (generada) | Cifrado de contraseña del proveedor |
| `COBRIX_SCHEDULER_INTERVAL_MS=30000` | Sondeo de corrida automática más acorde a producción |
| Disco en `/var/data` | Persistir `cobrix.sqlite` entre reinicios |

En **plan Free** el disco persistente puede no estar disponible; en ese caso quita el bloque `disk` de `render.yaml` y usa rutas por defecto en `data/` (estado Cobrix efímero entre redeploys; la base del ISP viaja en el repo).

## Credenciales y prueba

Igual que en local: proveedor `cobrix` / `cobrix-sandbox`, fecha sandbox `2026-10-13`.

Flujo sugerido para quien evalúa: **Configuración** → probar conexión → **Sincronización** → importar / pagadas.

## Limitaciones conocidas (demo)

- Swagger (`/docs`) no está publicado en la URL externa; el evaluador usa el panel. Pagos simulados en local vía Swagger; en Render basta import + pagadas con datos ya sembrados o repetir seed.
- No es un despliegue multi-tenant ni HA; es la prueba técnica empaquetada para revisión remota.
