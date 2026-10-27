import { TABLA_DESTINO } from "@/lib/etl/carga"
import {
  accesoBloqueado,
  mensajeSupabase,
  obtenerClienteSupabase,
} from "@/lib/supabase/servidor"

/** Indica si Supabase está configurado y la tabla accesible (sin exponer claves). */
export async function GET() {
  const bloqueo = accesoBloqueado()
  if (bloqueo) return bloqueo

  const supabase = obtenerClienteSupabase()
  if (!supabase) {
    return Response.json({
      configurado: false,
      tablaAccesible: false,
      mensaje: "Faltan SUPABASE_URL y/o SUPABASE_SECRET_KEY en el servidor.",
    })
  }
  const { error } = await supabase
    .from(TABLA_DESTINO)
    .select("id", { head: true, count: "exact" })
    .limit(1)
  return Response.json({
    configurado: true,
    tablaAccesible: !error,
    mensaje: error
      ? `${mensajeSupabase(error)}. ¿Has aplicado la migración?`
      : "Conexión correcta con la tabla destino.",
  })
}
