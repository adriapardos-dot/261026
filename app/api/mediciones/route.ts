import { NOMBRES_CIUDADES } from "@/lib/etl/ciudades"
import { TABLA_DESTINO } from "@/lib/etl/carga"
import { horaUtcAIso } from "@/lib/etl/transformacion"
import {
  accesoBloqueado,
  mensajeSupabase,
  obtenerClienteSupabase,
  respuestaSinConfiguracion,
} from "@/lib/supabase/servidor"

const CAMPOS_ORDEN = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
  "importado_en",
] as const
const TAMANOS = [10, 25, 50, 100]

/** Lectura paginada de lo que realmente está guardado en Supabase. */
export async function GET(request: Request) {
  const bloqueo = accesoBloqueado()
  if (bloqueo) return bloqueo

  const supabase = obtenerClienteSupabase()
  if (!supabase) return respuestaSinConfiguracion()

  const p = new URL(request.url).searchParams
  const ciudad = p.get("ciudad") ?? ""
  const desdeTexto = p.get("desde") ?? ""
  const hastaTexto = p.get("hasta") ?? ""
  const orden = (CAMPOS_ORDEN as readonly string[]).includes(p.get("orden") ?? "")
    ? (p.get("orden") as string)
    : "fecha_hora"
  const ascendente = p.get("dir") !== "desc"
  const tamano = TAMANOS.includes(Number(p.get("tamano"))) ? Number(p.get("tamano")) : 25
  const pagina = Math.max(1, Math.floor(Number(p.get("pagina")) || 1))

  if (ciudad && !NOMBRES_CIUDADES.includes(ciudad)) {
    return Response.json({ error: "Ciudad no reconocida." }, { status: 400 })
  }
  const desde = desdeTexto ? horaUtcAIso(desdeTexto) : null
  const hasta = hastaTexto ? horaUtcAIso(hastaTexto) : null
  if ((desdeTexto && !desde) || (hastaTexto && !hasta)) {
    return Response.json({ error: "Fechas de filtro no válidas." }, { status: 400 })
  }

  let consulta = supabase
    .from(TABLA_DESTINO)
    .select("id, ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm, importado_en", {
      count: "exact",
    })
  if (ciudad) consulta = consulta.eq("ciudad", ciudad)
  if (desde) consulta = consulta.gte("fecha_hora", desde)
  if (hasta) consulta = consulta.lte("fecha_hora", hasta)

  const inicio = (pagina - 1) * tamano
  const { data, error, count } = await consulta
    // ORDER BY explícito: la tabla no garantiza ningún orden por sí misma.
    .order(orden, { ascending: ascendente })
    .order("id", { ascending: true })
    .range(inicio, inicio + tamano - 1)

  if (error) {
    // PGRST103: página fuera de rango tras cambiar filtros.
    if (error.code === "PGRST103") {
      return Response.json({ filas: [], total: count ?? 0, pagina, tamano })
    }
    return Response.json({ error: mensajeSupabase(error) }, { status: 502 })
  }

  return Response.json({ filas: data ?? [], total: count ?? 0, pagina, tamano })
}
