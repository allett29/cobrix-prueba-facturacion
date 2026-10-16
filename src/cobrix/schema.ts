/**
 * Esquema SQLite del lado Cobrix: configuración, dominio importado y corridas de sync.
 */

export const COBRIX_SCHEMA = `
CREATE TABLE IF NOT EXISTS empresa (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	nombre TEXT NOT NULL,
	rif TEXT NOT NULL,
	correo_cobranza TEXT NOT NULL,
	actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proveedor (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	nombre_visible TEXT NOT NULL,
	url_api TEXT NOT NULL,
	usuario TEXT NOT NULL,
	contrasena_cifrada TEXT NOT NULL,
	estados_importables TEXT NOT NULL,
	ventana_meses INTEGER,
	max_cuotas_recientes INTEGER,
	dias_gracia_corte INTEGER NOT NULL DEFAULT 0,
	tope_facturas_corrida INTEGER NOT NULL,
	tope_monto_centavos_corrida INTEGER NOT NULL,
	tipos_documento_excluidos TEXT NOT NULL,
	meses_consulta_pagadas INTEGER NOT NULL DEFAULT 7,
	corrida_automatica_activa INTEGER NOT NULL DEFAULT 0,
	corrida_automatica_hora TEXT,
	actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cliente (
	id INTEGER PRIMARY KEY,
	proveedor_id INTEGER NOT NULL REFERENCES proveedor(id),
	identificacion_normalizada TEXT NOT NULL,
	identificacion_mostrar TEXT NOT NULL,
	tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('natural', 'juridico')),
	nombre TEXT NOT NULL,
	correo TEXT NOT NULL,
	telefono TEXT NOT NULL,
	origen TEXT NOT NULL,
	creado_en TEXT NOT NULL,
	actualizado_en TEXT NOT NULL,
	UNIQUE (proveedor_id, identificacion_normalizada)
);

CREATE TABLE IF NOT EXISTS contrato_proveedor (
	id INTEGER PRIMARY KEY,
	proveedor_id INTEGER NOT NULL REFERENCES proveedor(id),
	cliente_id INTEGER NOT NULL REFERENCES cliente(id),
	id_contrato_isp INTEGER NOT NULL,
	codigo TEXT NOT NULL,
	estado TEXT NOT NULL,
	plan_codigo TEXT NOT NULL,
	plan_nombre TEXT NOT NULL,
	precio_mes_centavos INTEGER NOT NULL,
	sucursal_sigla TEXT NOT NULL,
	sucursal_nombre TEXT NOT NULL,
	direccion TEXT NOT NULL,
	visto_en TEXT NOT NULL,
	UNIQUE (proveedor_id, id_contrato_isp)
);

CREATE TABLE IF NOT EXISTS corrida (
	id INTEGER PRIMARY KEY,
	proveedor_id INTEGER NOT NULL REFERENCES proveedor(id),
	tipo TEXT NOT NULL CHECK (tipo IN ('importacion', 'actualizacion_pagadas')),
	simulacion INTEGER NOT NULL DEFAULT 0,
	estado TEXT NOT NULL CHECK (estado IN ('en_curso', 'completada', 'fallida')),
	inicio_en TEXT NOT NULL,
	fin_en TEXT,
	duracion_ms INTEGER,
	error TEXT,
	resumen TEXT NOT NULL DEFAULT '',
	contadores TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS factura (
	id INTEGER PRIMARY KEY,
	proveedor_id INTEGER NOT NULL REFERENCES proveedor(id),
	numero TEXT NOT NULL UNIQUE,
	cliente_id INTEGER NOT NULL REFERENCES cliente(id),
	contrato_proveedor_id INTEGER NOT NULL REFERENCES contrato_proveedor(id),
	id_cuota_proveedor TEXT NOT NULL,
	id_contrato_isp INTEGER NOT NULL,
	periodo TEXT NOT NULL,
	descripcion TEXT NOT NULL,
	vencimiento TEXT NOT NULL,
	corte TEXT NOT NULL,
	moneda TEXT NOT NULL DEFAULT 'USD',
	total_centavos INTEGER NOT NULL,
	saldo_centavos INTEGER NOT NULL,
	estado TEXT NOT NULL CHECK (estado IN ('abierta', 'pagada')),
	pagada_en TEXT,
	id_factura_isp INTEGER,
	num_factura_isp TEXT,
	corrida_importacion_id INTEGER REFERENCES corrida(id),
	importada_en TEXT NOT NULL,
	UNIQUE (proveedor_id, id_cuota_proveedor)
);

CREATE TABLE IF NOT EXISTS corrida_detalle (
	id INTEGER PRIMARY KEY,
	corrida_id INTEGER NOT NULL REFERENCES corrida(id) ON DELETE CASCADE,
	id_contrato_isp INTEGER,
	id_cuota_proveedor TEXT,
	cliente_id INTEGER REFERENCES cliente(id),
	factura_id INTEGER REFERENCES factura(id),
	resultado TEXT NOT NULL,
	detalle TEXT NOT NULL DEFAULT '',
	monto_centavos INTEGER
);

CREATE TABLE IF NOT EXISTS historial_cliente (
	id INTEGER PRIMARY KEY,
	cliente_id INTEGER NOT NULL REFERENCES cliente(id),
	ocurrido_en TEXT NOT NULL,
	tipo TEXT NOT NULL,
	factura_id INTEGER REFERENCES factura(id),
	payload TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_cliente_nombre ON cliente(nombre);
CREATE INDEX IF NOT EXISTS idx_factura_cliente_estado ON factura(cliente_id, estado);
CREATE INDEX IF NOT EXISTS idx_factura_estado ON factura(estado);
CREATE INDEX IF NOT EXISTS idx_corrida_inicio ON corrida(inicio_en DESC);
CREATE INDEX IF NOT EXISTS idx_corrida_detalle_corrida ON corrida_detalle(corrida_id);
CREATE INDEX IF NOT EXISTS idx_historial_cliente ON historial_cliente(cliente_id, ocurrido_en DESC);
`
