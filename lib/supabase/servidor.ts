import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { MAX_BYTES_PETICION } from "@/lib/etl/carga"

/**
 * Cliente con clave secreta (salta RLS). Solo se importa desde Route Handlers:
 * "server-only" hace fallar el build si algún componente cliente lo importa.
 */
export function obtenerClienteSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  // SUPABASE_SECRET_KEY (sb_secret_…) es la recomendada; la service_role
  // heredada se acepta mientras Supabase la mantenga.
  const clave =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) return null
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function respuestaSinConfiguracion() {
  return Response.json(
    {
      error:
        "Supabase no está configurado: define SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local y reinicia el servidor.",
      configurado: false,
    },
    { status: 503 }
  )
}

/**
 * La app no tiene autenticación. En desarrollo se permite el acceso; en
 * producción los endpoints quedan bloqueados salvo que se habilite de forma
 * explícita (y se proteja antes con autenticación propia).
 */
export function accesoBloqueado(): Response | null {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ETL_PERMITIR_SIN_AUTENTICACION !== "true"
  ) {
    return Response.json(
      {
        error:
          "Endpoint deshabilitado en producción: la aplicación no tiene autenticación. Consulta el README.",
      },
      { status: 403 }
    )
  }
  return null
}

/** Lee el cuerpo JSON respetando un tamaño máximo (no se fía de Content-Length). */
export async function leerJsonLimitado(
  request: Request
): Promise<{ ok: true; cuerpo: unknown } | { ok: false; respuesta: Response }> {
  const declarado = Number(request.headers.get("content-length") ?? "0")
  if (declarado > MAX_BYTES_PETICION) {
    return { ok: false, respuesta: demasiadoGrande() }
  }
  const texto = await request.text()
  if (new TextEncoder().encode(texto).length > MAX_BYTES_PETICION) {
    return { ok: false, respuesta: demasiadoGrande() }
  }
  try {
    return { ok: true, cuerpo: JSON.parse(texto) }
  } catch {
    return {
      ok: false,
      respuesta: Response.json({ error: "El cuerpo no es JSON válido." }, { status: 400 }),
    }
  }
}

function demasiadoGrande() {
  return Response.json(
    { error: `La petición supera ${MAX_BYTES_PETICION / 1024} KB.` },
    { status: 413 }
  )
}

/** Mensaje de error de Supabase sin cabeceras ni claves. */
export function mensajeSupabase(error: { message?: string; code?: string }) {
  return `Supabase: ${error.message ?? "error desconocido"}${error.code ? ` (código ${error.code})` : ""}`
}
