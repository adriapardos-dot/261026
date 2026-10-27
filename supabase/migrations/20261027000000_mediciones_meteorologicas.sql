-- Tabla destino del pipeline ETL Open-Meteo → Supabase.
-- Una fila por ciudad y hora (UTC). La clave natural (ciudad, fecha_hora) es
-- única y es la que usa el upsert para no duplicar datos al recargar.

create table if not exists public.mediciones_meteorologicas (
  id bigint generated always as identity primary key,
  ciudad text not null,
  fecha_hora timestamptz not null,
  temperatura_c double precision not null,
  humedad_pct double precision not null,
  precipitacion_mm double precision not null,
  -- Momento de la primera inserción: el upsert no envía esta columna,
  -- así que una recarga actualiza las mediciones pero conserva este valor.
  importado_en timestamptz not null default now(),

  constraint mediciones_meteorologicas_ciudad_fecha_hora_key
    unique (ciudad, fecha_hora),
  constraint mediciones_meteorologicas_ciudad_no_vacia
    check (btrim(ciudad) <> ''),
  -- double precision admite NaN e Infinity; se excluyen explícitamente.
  constraint mediciones_meteorologicas_temperatura_finita
    check (temperatura_c > '-Infinity'::double precision
       and temperatura_c < 'Infinity'::double precision),
  -- En Postgres NaN es mayor que cualquier número, así que BETWEEN lo excluye.
  constraint mediciones_meteorologicas_humedad_rango
    check (humedad_pct between 0 and 100),
  constraint mediciones_meteorologicas_precipitacion_no_negativa
    check (precipitacion_mm >= 0
       and precipitacion_mm < 'Infinity'::double precision)
);

comment on table public.mediciones_meteorologicas is
  'Mediciones horarias (UTC) de Open-Meteo cargadas por el pipeline ETL de la práctica.';

create index if not exists mediciones_meteorologicas_fecha_hora_idx
  on public.mediciones_meteorologicas (fecha_hora);

-- RLS activado y SIN políticas: los roles anon y authenticated no pueden leer
-- ni escribir. Solo el servidor, con la clave secreta (rol service_role, que
-- salta RLS), accede a la tabla.
alter table public.mediciones_meteorologicas enable row level security;

-- Defensa en profundidad: retira cualquier privilegio heredado de los roles públicos.
revoke all on table public.mediciones_meteorologicas from anon, authenticated;
