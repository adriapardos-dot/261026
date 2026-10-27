import { createClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { POST as postCarga } from "@/app/api/carga/route"
import { GET as getMediciones } from "@/app/api/mediciones/route"
import { POST as postVerificar } from "@/app/api/verificar/route"
import {
  crearLotes,
  ejecutarLotes,
  resumirLotes,
  TABLA_DESTINO,
  verificarEnDestino,
  type Clave,
} from "@/lib/etl/carga"
import type { Medicion } from "@/lib/etl/tipos"

/**
 * Integración real con Supabase (o con el PostgREST local de
 * tests/integracion/local). Se omite si no hay credenciales en el entorno.
 * Usa fechas de 1950 para no tocar datos de la práctica y las borra al acabar.
 */
const URL_SUPABASE = process.env.SUPABASE_URL
const CLAVE =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const CLAVE_PUBLICA = process.env.SUPABASE_PUBLISHABLE_KEY

function mediciones(ciudad: string, n: number, temp: number): Medicion[] {
  return Array.from({ length: n }, (_, h) => ({
    ciudad,
    fecha_hora: new Date(Date.UTC(1950, 0, 1, h)).toISOString(),
    temperatura_c: temp + (h % 7),
    humedad_pct: h % 101,
    precipitacion_mm: h % 4 === 0 ? 0.5 : 0,
  }))
}

const peticion = (ruta: string, cuerpo: unknown) =>
  new Request(`http://localhost${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  })

async function enviar(registros: Medicion[]) {
  const r = await postCarga(peticion("/api/carga", { registros }))
  const cuerpo = await r.json()
  if (!r.ok) throw new Error(cuerpo.error)
  return { filasAfectadas: cuerpo.filasAfectadas as number | null }
}

async function consultar(claves: Clave[]) {
  const r = await postVerificar(peticion("/api/verificar", { claves }))
  const cuerpo = await r.json()
  if (!r.ok) throw new Error(cuerpo.error)
  return cuerpo.existentes as Clave[]
}

describe.skipIf(!URL_SUPABASE || !CLAVE)("integración con Supabase", () => {
  // Sin credenciales la suite se omite, pero su cuerpo se evalúa igualmente.
  const admin = createClient(
    URL_SUPABASE ?? "http://omitido.invalid",
    CLAVE ?? "omitido",
    {
      auth: { persistSession: false },
    }
  )
  const borrar = () =>
    admin.from(TABLA_DESTINO).delete().lt("fecha_hora", "1951-01-01T00:00:00Z")
  const contar = async () => {
    const { count, error } = await admin
      .from(TABLA_DESTINO)
      .select("id", { count: "exact", head: true })
      .lt("fecha_hora", "1951-01-01T00:00:00Z")
    if (error) throw error
    return count
  }
  const datos = [
    ...mediciones("Madrid", 700, 10),
    ...mediciones("Bilbao", 500, 5),
  ]

  beforeAll(async () => {
    await borrar()
  })
  afterAll(async () => {
    await borrar()
  })

  it("carga 1.200 registros en 3 lotes y los verifica en destino", async () => {
    const lotes = crearLotes(datos)
    expect(lotes.map((l) => l.registros.length)).toEqual([500, 500, 200])
    const final = await ejecutarLotes(lotes, [1, 2, 3], enviar, () => {})
    expect(final.map((l) => l.estado)).toEqual(["ok", "ok", "ok"])
    expect(await contar()).toBe(1200)
    const v = await verificarEnDestino(datos, consultar)
    expect(v).toMatchObject({
      comprobadas: 1200,
      encontradas: 1200,
      faltantes: [],
    })
  })

  it("una segunda carga actualiza sin duplicar y conserva importado_en (8)", async () => {
    const antes = await admin
      .from(TABLA_DESTINO)
      .select("importado_en, temperatura_c")
      .eq("ciudad", "Madrid")
      .eq("fecha_hora", "1950-01-01T00:00:00Z")
      .single()
    const modificados = datos.map((d) => ({
      ...d,
      temperatura_c: d.temperatura_c + 100,
    }))
    const lotes = crearLotes(modificados)
    const final = await ejecutarLotes(lotes, [1, 2, 3], enviar, () => {})
    expect(resumirLotes(final)).toEqual({
      correctos: 1200,
      fallidos: 0,
      pendientes: 0,
    })
    expect(await contar()).toBe(1200)
    const despues = await admin
      .from(TABLA_DESTINO)
      .select("importado_en, temperatura_c")
      .eq("ciudad", "Madrid")
      .eq("fecha_hora", "1950-01-01T00:00:00Z")
      .single()
    expect(despues.data?.temperatura_c).toBe(
      (antes.data?.temperatura_c ?? 0) + 100
    )
    expect(despues.data?.importado_en).toBe(antes.data?.importado_en)
  })

  it("un lote que falla en destino no afecta a los demás y se puede reintentar (9)", async () => {
    await borrar()
    const lotes = crearLotes(datos)
    let romper = true
    // Fallo real en Postgres: el lote 2 viola el CHECK de humedad si se salta
    // la validación del servidor (se escribe directamente con el cliente).
    const enviarConFallo = async (registros: Medicion[]) => {
      if (romper && registros === lotes[1].registros) {
        const { error } = await admin.from(TABLA_DESTINO).upsert(
          registros.map((r) => ({ ...r, humedad_pct: 150 })),
          { onConflict: "ciudad,fecha_hora" }
        )
        if (error) throw new Error(error.message)
      }
      return enviar(registros)
    }
    const tras1 = await ejecutarLotes(
      lotes,
      [1, 2, 3],
      enviarConFallo,
      () => {}
    )
    expect(tras1.map((l) => l.estado)).toEqual(["ok", "error", "ok"])
    expect(tras1[1].mensaje).toMatch(/humedad_rango|check constraint/i)
    expect(await contar()).toBe(700)

    romper = false
    const tras2 = await ejecutarLotes(tras1, [2], enviarConFallo, () => {})
    expect(tras2.map((l) => l.estado)).toEqual(["ok", "ok", "ok"])
    expect(await contar()).toBe(1200)
  })

  it("lee datos persistidos con filtros, ORDER BY y paginación", async () => {
    const r = await getMediciones(
      new Request(
        "http://localhost/api/mediciones?ciudad=Bilbao&desde=1950-01-01T10:00&hasta=1950-01-02T09:00&orden=temperatura_c&dir=desc&tamano=10&pagina=2"
      )
    )
    const cuerpo = await r.json()
    expect(r.status).toBe(200)
    expect(cuerpo.total).toBe(24)
    expect(cuerpo.filas).toHaveLength(10)
    const temps = cuerpo.filas.map((f: Medicion) => f.temperatura_c)
    expect([...temps].sort((a, b) => b - a)).toEqual(temps)
    expect(cuerpo.filas.every((f: Medicion) => f.ciudad === "Bilbao")).toBe(
      true
    )
  })

  it.skipIf(!CLAVE_PUBLICA)(
    "la clave pública no puede leer ni escribir (RLS)",
    async () => {
      const publico = createClient(URL_SUPABASE!, CLAVE_PUBLICA!, {
        auth: { persistSession: false },
      })
      const lectura = await publico.from(TABLA_DESTINO).select("id").limit(1)
      expect(lectura.error !== null || (lectura.data ?? []).length === 0).toBe(
        true
      )
      const escritura = await publico
        .from(TABLA_DESTINO)
        .insert(mediciones("Sevilla", 1, 1))
      expect(escritura.error).not.toBeNull()
    }
  )
})
