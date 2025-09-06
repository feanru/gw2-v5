# Backend

## Utilidades HTTP

El archivo [`httpUtils.php`](httpUtils.php) ofrece funciones compartidas como `multi_fetch` y los helpers `parse_market_csv` y `parse_market_bundle_csv` para consumir y procesar datos de la API.

## Índices de MongoDB

Este proyecto utiliza una base de datos MongoDB para almacenar colecciones de **items** y **recipes**. Para optimizar las consultas se requieren los siguientes índices:

### items

- `{ id: 1 }`
- `{ lang: 1 }`
- `{ tradable: 1 }`

### recipes

- `{ output_item_id: 1 }`
- `{ input_item_id: 1 }`

### Migración

Ejecuta el siguiente comando para crear los índices anteriores en la base de datos configurada por la variable `MONGO_URL` (por defecto `mongodb://localhost:27017/gw2`):

```bash
npm run migrate:mongo
```

El comando anterior ejecuta el script [`backend/setup.mongo.js`](setup.mongo.js) que se encarga de crear los índices.

## Actualización periódica de items críticos

El script `refresh_critical_items.php` consulta los endpoints `dataBundle.php` e `itemDetails.php` para una lista de IDs críticos con el fin de mantener la caché caliente. Registra el resultado de cada petición en `refresh.log`.

### Ejecución manual

```bash
php refresh_critical_items.php
```

### Programación

Ejemplo con **cron** para ejecutarlo cada 15 minutos:

```cron
*/15 * * * * /usr/bin/php /ruta/al/proyecto/backend/refresh_critical_items.php >> /ruta/al/proyecto/backend/refresh.log 2>&1
```

Ejemplo con **systemd**:

```ini
# /etc/systemd/system/gw2-critical.service
[Unit]
Description=GW2 critical cache refresh

[Service]
ExecStart=/usr/bin/php /ruta/al/proyecto/backend/refresh_critical_items.php
Restart=always

[Install]
WantedBy=multi-user.target
```

Tras crear el servicio:

```bash
sudo systemctl enable --now gw2-critical.service
```
