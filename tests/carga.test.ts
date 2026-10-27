import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POST as postCarga } from "@/app/api/carga/route"
import {
  crearLotes,
  ejecutarLotes,
  MAX_BYTES_PETICION,
  resumirLotes,
  validarLoteCarga,
  verificarEnDestino,
  type Lote,
} from "@/lib/etl/carga"
import type { Medicion } from "@/lib/etl/tipos"

function mediciones(n: number, ciudad = "Madrid"): Medicion[] {
  return Array.from({ length: n }, (_, h) => ({
    ciudad,
    fecha_hora: new Date(Date.UTC(2026, 8, 1, h)).toISOString(),
    temperatura_c: 20 + (h % 10),
    humedad_pct: 50,
    precipitacion_mm: 0,
  }))
}

describe("validación de servidor", () => {
  it("acepta un lote correcto de 500", () => {
    expect(validarLoteCarga({ registros: mediciones(500) }).ok).toBe(true)
  })

  it("rechaza lotes vacíos o de más de 500", () => {
    expect(validarLoteCarga({ registros: [] }).ok).toBe(false)
    expect(validarLoteCarga({ registros: mediciones(501) }).ok).toBe(false)
  })

  it("rechaza tipos, rangos, campos extra, ciudades desconocidas y claves repetidas", () => {
    const base = mediciones(1)[0]
    const casos = [
      { ...base, temperatura_c: null },
      { ...base, temperatura_c: "20" },
      { ...base, humedad_pct: 101 },
      { ...base, precipitacion_mm: -1 },
      { ...base, fecha_hora: "2026-09-01T00:00" },
      { ...base, ciudad: "Narnia" },
      { ...base, id: 3 },
    ]
    for (const r of casos) expect(validarLoteCarga({ registros: [r] }).ok).toBe(false)
    expect(validarLoteCarga({ registros: [base, { ...base }] }).ok).toBe(false)
  })
})

describe("carga por lotes con fallo parcial (9)", () => {
  it("conserva los lotes correctos y reintenta solo los fallidos", async () => {
    const lotes = crearLotes(mediciones(1200)) // 500 + 500 + 200
    const enviados: number[] = []
    let fallarSegundo = true
    const enviar = async (registros: Medicion[]) => {
      const numero = lotes.find((l) => l.registros[0] === registros[0])!.numero
      enviados.push(numero)
      if (numero === 2 && fallarSegundo) throw new Error("Supabase: timeout simulado")
      return { filasAfectadas: registros.length }
    }
    const estados: Lote[][] = []
    const tras1 = await ejecutarLotes(lotes, [1, 2, 3], enviar, (l) => estados.push(l))
    expect(tras1.map((l) => l.estado)).toEqual(["ok", "error", "ok"])
    expect(tras1[1].mensaje).toMatch(/timeout simulado/)
    expect(resumirLotes(tras1)).toEqual({ correctos: 700, fallidos: 500, pendientes: 0 })
    // Se observaron estados intermedios reales ("enviando").
    expect(estados.some((ls) => ls[0].estado === "enviando")).toBe(true)

    fallarSegundo = false
    const tras2 = await ejecutarLotes(tras1, [2], enviar, () => {})
    expect(enviados).toEqual([1, 2, 3, 2])
    expect(tras2.map((l) => l.estado)).toEqual(["ok", "ok", "ok"])
    expect(resumirLotes(tras2).correctos).toBe(1200)
  })
})

describe("segunda carga sin duplicados (8, lógica)", () => {
  it("un upsert por (ciudad, fecha_hora) repetido no crea filas nuevas", async () => {
    // Doble en memoria con la semántica ON CONFLICT (ciudad, fecha_hora) DO UPDATE.
    // La comprobación contra Postgres real está en tests/integracion.
    const tabla = new Map<string, Medicion>()
    const enviar = async (rs: Medicion[]) => {
      for (const r of rs) tabla.set(`${r.ciudad}|${r.fecha_hora}`, r)
      return { filasAfectadas: rs.length }
    }
    const datos = [...mediciones(600, "Madrid"), ...mediciones(100, "Bilbao")]
    const lotes = crearLotes(datos)
    await ejecutarLotes(lotes, lotes.map((l) => l.numero), enviar, () => {})
    await ejecutarLotes(lotes, lotes.map((l) => l.numero), enviar, () => {})
    expect(tabla.size).toBe(700)

    const v = await verificarEnDestino(datos, async (claves) =>
      claves.filter((c) => tabla.has(`${c.ciudad}|${c.fecha_hora}`))
    )
    expect(v).toMatchObject({ comprobadas: 700, encontradas: 700, faltantes: [] })
  })

  it("la verificación detecta claves que faltan y normaliza «+00:00»", async () => {
    const datos = mediciones(3)
    const v = await verificarEnDestino(datos, async () => [
      { ciudad: "Madrid", fecha_hora: "2026-09-01T00:00:00.000Z" },
    ])
    expect(v.encontradas).toBe(1)
    expect(v.faltantes).toHaveLength(2)
  })
})

describe("endpoint POST /api/carga", () => {
  const entorno = { ...process.env }
  beforeEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })
  afterEach(() => {
    process.env = { ...entorno }
    vi.unstubAllEnvs()
  })

  const peticion = (cuerpo: string) =>
    new Request("http://localhost/api/carga", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cuerpo,
    })

  it("rechaza cuerpos demasiado grandes con 413", async () => {
    const r = await postCarga(peticion("x".repeat(MAX_BYTES_PETICION + 1)))
    expect(r.status).toBe(413)
  })

  it("valida en servidor antes de tocar Supabase (422)", async () => {
    const r = await postCarga(peticion(JSON.stringify({ registros: [{ ciudad: "Madrid" }] })))
    expect(r.status).toBe(422)
  })

  it("sin credenciales responde 503 y no simula éxito", async () => {
    const r = await postCarga(peticion(JSON.stringify({ registros: mediciones(2) })))
    expect(r.status).toBe(503)
    expect((await r.json()).configurado).toBe(false)
  })

  it("en producción sin autenticación queda bloqueado (403)", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const r = await postCarga(peticion(JSON.stringify({ registros: mediciones(2) })))
    expect(r.status).toBe(403)
  })
})
