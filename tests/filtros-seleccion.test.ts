import { describe, expect, it } from "vitest"

import { aMedicion, crearLotes } from "@/lib/etl/carga"
import {
  FILTROS_INICIALES,
  interpretarFiltros,
  ordenar,
  paginar,
  prepararCarga,
  type Filtros,
} from "@/lib/etl/filtros"
import type { RegistroValido } from "@/lib/etl/tipos"

/** 3 ciudades × 40 horas con valores deterministas. */
function generar(): RegistroValido[] {
  const out: RegistroValido[] = []
  for (const ciudad of ["Bilbao", "Madrid", "Sevilla"]) {
    for (let h = 0; h < 40; h++) {
      const fecha_hora = new Date(Date.UTC(2026, 8, 1, h)).toISOString()
      out.push({
        id: `${ciudad}#${h}`,
        clave: `${ciudad}|${fecha_hora}`,
        ciudad,
        fecha_hora,
        temperatura_c: ((h * 7) % 31) + (ciudad === "Sevilla" ? 5 : 0),
        humedad_pct: (h * 13) % 101,
        precipitacion_mm: h % 5 === 0 ? h / 10 : 0,
      })
    }
  }
  return out
}

const validos = generar()
const criterios = (f: Partial<Filtros>) => interpretarFiltros({ ...FILTROS_INICIALES, ...f }).criterios

describe("filtros y ordenación antes de paginar (5)", () => {
  it("filtra sobre todo el conjunto y ordena antes de cortar la página", () => {
    const c = criterios({ ciudades: ["Sevilla"], tempMin: "20", soloLluvia: true })
    const { coincidentes } = prepararCarga(validos, c, { campo: "temperatura_c", direccion: "desc" }, new Set())
    const esperado = validos
      .filter((r) => r.ciudad === "Sevilla" && r.temperatura_c >= 20 && r.precipitacion_mm > 0)
      .sort((a, b) => b.temperatura_c - a.temperatura_c || a.fecha_hora.localeCompare(b.fecha_hora))
    expect(coincidentes.map((r) => r.clave)).toEqual(esperado.map((r) => r.clave))

    const todos = prepararCarga(validos, criterios({}), { campo: "temperatura_c", direccion: "desc" }, new Set()).coincidentes
    const p1 = paginar(todos, 1, 25).filas
    // La primera página contiene los máximos globales, no los de las primeras 25 filas originales.
    expect(p1[0].temperatura_c).toBe(Math.max(...validos.map((r) => r.temperatura_c)))
    expect(paginar(todos, 99, 25).pagina).toBe(5)
  })

  it("aplica intervalos de fecha UTC, humedad y precipitación (inclusivos)", () => {
    const c = criterios({
      desde: "2026-09-01T10:00",
      hasta: "2026-09-01T20:00",
      humMin: "10",
      humMax: "90",
      precMin: "0",
      precMax: "1,5",
    })
    const { coincidentes } = prepararCarga(validos, c, { campo: "fecha_hora", direccion: "asc" }, new Set())
    expect(coincidentes.length).toBeGreaterThan(0)
    for (const r of coincidentes) {
      expect(r.fecha_hora >= "2026-09-01T10:00:00.000Z" && r.fecha_hora <= "2026-09-01T20:00:00.000Z").toBe(true)
      expect(r.humedad_pct).toBeGreaterThanOrEqual(10)
      expect(r.humedad_pct).toBeLessThanOrEqual(90)
      expect(r.precipitacion_mm).toBeLessThanOrEqual(1.5)
    }
  })

  it("informa de filtros no válidos", () => {
    const { errores } = interpretarFiltros({ ...FILTROS_INICIALES, tempMin: "30", tempMax: "10", humMin: "abc" })
    expect(errores).toHaveLength(2)
  })

  it("el orden es estable y determinista con desempate por ciudad y fecha", () => {
    const a = ordenar(validos, { campo: "precipitacion_mm", direccion: "asc" })
    const b = ordenar([...validos].reverse(), { campo: "precipitacion_mm", direccion: "asc" })
    expect(a.map((r) => r.clave)).toEqual(b.map((r) => r.clave))
  })
})

describe("selección entre páginas (6) y vista previa (7)", () => {
  const orden = { campo: "temperatura_c", direccion: "desc" } as const
  const filtroMadrid = criterios({ ciudades: ["Madrid"] })

  it("seleccionar todas las que cumplen los filtros incluye filas de otras páginas", () => {
    const { coincidentes } = prepararCarga(validos, filtroMadrid, orden, new Set())
    const seleccion = new Set(coincidentes.map((r) => r.clave)) // botón «Seleccionar las N…»
    const r = prepararCarga(validos, filtroMadrid, orden, seleccion)
    expect(r.aCargar).toHaveLength(40)
    expect(paginar(r.coincidentes, 2, 25).filas.every((f) => seleccion.has(f.clave))).toBe(true)
  })

  it("cambiar filtros no selecciona filas nuevas y cuenta las que quedan fuera", () => {
    const seleccion = new Set(
      prepararCarga(validos, filtroMadrid, orden, new Set()).coincidentes.slice(0, 30).map((r) => r.clave)
    )
    const ampliado = prepararCarga(validos, criterios({}), orden, seleccion)
    expect(ampliado.aCargar).toHaveLength(30)
    expect(ampliado.seleccionadosFuera).toBe(0)

    const restringido = prepararCarga(validos, criterios({ ciudades: ["Madrid"], tempMax: "15" }), orden, seleccion)
    expect(restringido.aCargar.every((r) => r.temperatura_c <= 15 && seleccion.has(r.clave))).toBe(true)
    expect(restringido.aCargar.length + restringido.seleccionadosFuera).toBe(30)
    expect(restringido.seleccionadosFuera).toBeGreaterThan(0)
  })

  it("los lotes enviados reproducen exactamente la vista previa y su orden", () => {
    const seleccion = new Set(validos.filter((_, i) => i % 3 !== 0).map((r) => r.clave))
    const { aCargar } = prepararCarga(validos, criterios({ soloLluvia: false }), orden, seleccion)
    const lotes = crearLotes(aCargar.map(aMedicion), 25)
    const enviado = lotes.flatMap((l) => l.registros)
    expect(enviado).toEqual(aCargar.map(aMedicion))
    expect(lotes.every((l) => l.registros.length <= 25)).toBe(true)
    expect(Object.keys(enviado[0]).sort()).toEqual(
      ["ciudad", "fecha_hora", "humedad_pct", "precipitacion_mm", "temperatura_c"]
    )
  })
})
