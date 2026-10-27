import { normalizarFechaUtc, TABLA_DESTINO, validarClavesVerificacion, type Clave } from "@/lib/etl/carga"
import {
  accesoBloqueado,
  leerJsonLimitado,
  mensajeSupabase,
  obtenerClienteSupabase,
  respuestaSinConfiguracion,
} from "@/lib/supabase/servidor"

// Fechas por consulta: mantiene la URL de PostgREST en un tamaño seguro.
const FECHAS_POR_CONSULTA = 100

/** Devuelve cuáles de las claves recibidas existen en la tabla destino. */
export async function POST(request: Request) {
  const bloqueo = accesoBloqueado()
  if (bloqueo) return bloqueo

  const lectura = await leerJsonLimitado(request)
  if (!lectura.ok) return lectura.respuesta

  const validacion = validarClavesVerificacion(lectura.cuerpo)
  if (!validacion.ok) {
    return Response.json({ error: validacion.errores.join(" ") }, { status: 422 })
  }

  const supabase = obtenerClienteSupabase()
  if (!supabase) return respuestaSinConfiguracion()

  const porCiudad = new Map<string, string[]>()
  for (const c of validacion.valor) {
    porCiudad.set(c.ciudad, [...(porCiudad.get(c.ciudad) ?? []), c.fecha_hora])
  }

  const existentes: Clave[] = []
  for (const [ciudad, fechas] of porCiudad) {
    for (let i = 0; i < fechas.length; i += FECHAS_POR_CONSULTA) {
      const trozo = fechas.slice(i, i + FECHAS_POR_CONSULTA)
      const { data, error } = await supabase
        .from(TABLA_DESTINO)
        .select("ciudad, fecha_hora")
        .eq("ciudad", ciudad)
        .in("fecha_hora", trozo)
        .limit(trozo.length)
      if (error) {
        return Response.json({ error: mensajeSupabase(error) }, { status: 502 })
      }
      for (const fila of data ?? []) {
        // Postgres devuelve "…+00:00"; se normaliza a "…Z" para comparar.
        const ms = Date.parse(String(fila.fecha_hora))
        const fecha = Number.isNaN(ms) ? null : normalizarFechaUtc(new Date(ms).toISOString())
        if (fecha) existentes.push({ ciudad: String(fila.ciudad), fecha_hora: fecha })
      }
    }
  }

  return Response.json({ existentes })
}
