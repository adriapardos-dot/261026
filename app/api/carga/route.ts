import { TABLA_DESTINO, validarLoteCarga } from "@/lib/etl/carga"
import {
  accesoBloqueado,
  leerJsonLimitado,
  mensajeSupabase,
  obtenerClienteSupabase,
  respuestaSinConfiguracion,
} from "@/lib/supabase/servidor"

/** Upsert de un lote (≤ 500 registros) por (ciudad, fecha_hora). */
export async function POST(request: Request) {
  const bloqueo = accesoBloqueado()
  if (bloqueo) return bloqueo

  const lectura = await leerJsonLimitado(request)
  if (!lectura.ok) return lectura.respuesta

  const validacion = validarLoteCarga(lectura.cuerpo)
  if (!validacion.ok) {
    return Response.json(
      { error: "Lote rechazado por la validación del servidor.", detalles: validacion.errores },
      { status: 422 }
    )
  }

  const supabase = obtenerClienteSupabase()
  if (!supabase) return respuestaSinConfiguracion()

  const { error, count } = await supabase
    .from(TABLA_DESTINO)
    .upsert(validacion.valor, {
      onConflict: "ciudad,fecha_hora",
      ignoreDuplicates: false,
      count: "exact",
    })

  if (error) {
    return Response.json({ error: mensajeSupabase(error) }, { status: 502 })
  }

  // PostgREST no distingue filas insertadas de actualizadas en un upsert:
  // solo informamos del total afectado si Supabase lo devuelve.
  return Response.json({
    recibidos: validacion.valor.length,
    filasAfectadas: typeof count === "number" ? count : null,
  })
}
