# Pipeline ETL: Open-Meteo → Supabase

Práctica 1 de Big Data. Aplicación Next.js para **ver y ejecutar** un pipeline ETL:
extraer datos horarios de la API histórica de Open-Meteo, transformarlos,
limpiarlos, filtrarlos y seleccionarlos, y cargarlos en una tabla de Supabase.

Stack: Next.js 16 (App Router), TypeScript, Tailwind 4, shadcn/ui (Base UI),
`@supabase/supabase-js`, Vitest.

## Instalación

```bash
npm install
cp .env.example .env.local   # y rellena los valores
```

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. Aplica la migración `supabase/migrations/20261027000000_mediciones_meteorologicas.sql`:
   pégala en el *SQL Editor* del panel o ejecuta `supabase db push` con la CLI.
3. En `.env.local` define:

| Variable | Dónde se obtiene | Notas |
| --- | --- | --- |
| `SUPABASE_URL` | Project Settings → Data API | |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → *Secret keys* (`sb_secret_…`) | Salta RLS. **Solo servidor.** |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave heredada `service_role` | Alternativa si no tienes claves nuevas. |
| `ETL_PERMITIR_SIN_AUTENTICACION` | — | Ver «Seguridad». |

Nunca uses `NEXT_PUBLIC_` para estas variables. Sin credenciales, la app extrae,
transforma y filtra con normalidad, pero la carga queda deshabilitada y los
endpoints responden `503`: no se simula ninguna carga.

## Ejecución

```bash
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm run build
npx vitest run       # pruebas (la extracción real necesita red)
```

## Cómo funciona el pipeline

1. **Extracción**: una petición `GET` por ciudad a
   `https://archive-api.open-meteo.com/v1/archive` con `timezone=GMT` (UTC),
   `temperature_unit=celsius` y `precipitation_unit=mm`. Máximo 31 días. El JSON
   se guarda sin tocar durante la sesión y se puede descargar. Si una ciudad
   falla, se reintenta sola; su respuesta se **sustituye**, no se acumula.
2. **Transformación**: los arrays paralelos (`time`, `temperature_2m`, …) se
   convierten en un registro por ciudad y hora:
   `ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm`. Las horas
   se interpretan como UTC de forma explícita (se añade `Z`). Se comprueban las
   longitudes de los arrays, el desfase horario y las unidades.
3. **Limpieza**: solo se aceptan números finitos; `null`, `""` o valores ausentes
   **nunca se convierten en 0**. Se rechaza lo que no tenga ciudad, fecha válida o
   alguna medición, la humedad fuera de 0–100 y la precipitación negativa. Las
   temperaturas extremas no se descartan. Duplicados por (ciudad, fecha_hora): se
   conserva la **primera aparición válida** en el orden de llegada. Cada rechazo
   guarda su motivo.
4. **Filtrado y selección**: válidos → filtros → ordenación → selección. La
   paginación solo afecta a lo que se ve. Se suben solo las filas seleccionadas
   que cumplen los filtros actuales; los cambios de filtro nunca seleccionan filas
   nuevas. Los excluidos por filtros son válidos, no rechazos.
5. **Carga**: al pulsar «Subir N registros» se congela una copia del conjunto en
   su orden. Se envía en lotes de ≤ 500 a `POST /api/carga`, que vuelve a validar
   y hace un `upsert` con `onConflict: ciudad,fecha_hora` (recargar no duplica).
   Si un lote falla, los demás conservan su estado y puedes reintentar solo los
   fallidos. Después, `POST /api/verificar` comprueba por lotes que las claves
   existen en destino. Supabase no distingue insertadas de actualizadas en un
   upsert, así que la app no muestra esa división.

La tabla no guarda el orden de inserción: para leer ordenado usa `ORDER BY`
(la pestaña «Datos en Supabase» siempre lo hace).

## Seguridad

- La escritura y la lectura de Supabase ocurren solo en Route Handlers del
  servidor (`lib/supabase/servidor.ts` importa `server-only`).
- RLS está activado y **no hay políticas**: `anon`/`authenticated` no pueden leer
  ni escribir.
- El servidor limita el cuerpo a 256 KB y valida cada registro (tipos, rangos,
  ciudades conocidas, campos extra y claves repetidas).
- **La app no tiene autenticación.** Está pensada para desarrollo local. Con
  `NODE_ENV=production` los endpoints responden `403` salvo que definas
  `ETL_PERMITIR_SIN_AUTENTICACION=true`. Antes de publicarla, protege los
  endpoints (por ejemplo, con Supabase Auth).

## Pruebas

- `tests/*.test.ts`: transformación, nulos, duplicados, filtros, selección entre
  páginas, lotes con fallo parcial y validación de los endpoints. Usan fixtures
  inventados de `tests/fixtures/`, que la app nunca carga.
- `tests/integracion/open-meteo.test.ts`: extracción real (Barcelona, 1 día = 24 h UTC).
- `tests/integracion/supabase.test.ts`: integración real de los endpoints. Se
  omite si no hay `SUPABASE_URL` y clave. Escribe y borra filas de 1950.
  - Contra tu proyecto: exporta las variables de `.env.local` (y opcionalmente
    `SUPABASE_PUBLISHABLE_KEY` para comprobar RLS) y ejecuta `npx vitest run tests/integracion`.
  - En local, sin cuenta (requiere Docker): Postgres + PostgREST con la migración aplicada.

    ```bash
    docker compose -p etl-pruebas -f tests/integracion/local/docker-compose.yml up -d
    node tests/integracion/local/proxy.mjs &      # expone /rest/v1 en :54331
    export SUPABASE_URL=http://127.0.0.1:54331
    export SUPABASE_SECRET_KEY=$(node tests/integracion/local/jwt.mjs service_role)
    export SUPABASE_PUBLISHABLE_KEY=$(node tests/integracion/local/jwt.mjs anon)
    npx vitest run tests/integracion
    ```
