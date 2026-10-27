import { describe, expect, it } from "vitest"

import { limpiar } from "@/lib/etl/limpieza"
import type { RespuestaOpenMeteo } from "@/lib/etl/tipos"
import { horaUtcAIso, transformar } from "@/lib/etl/transformacion"
import duplicados from "./fixtures/duplicados.json"
import incoherentes from "./fixtures/longitudes-incoherentes.json"
import nulos from "./fixtures/nulos-y-rangos.json"

const procesar = (respuesta: unknown, ciudad: string | null = "Barcelona") => {
  const t = transformar([
    { origen: "fixture", ciudad, respuesta: respuesta as RespuestaOpenMeteo },
  ])
  return { ...t, ...limpiar(t.registros) }
}

describe("transformación de arrays paralelos (2)", () => {
  it("genera un registro por posición combinando los cuatro arrays", () => {
    const { registros } = procesar({
      utc_offset_seconds: 0,
      hourly: {
        time: ["2026-09-01T00:00", "2026-09-01T01:00"],
        temperature_2m: [24.2, 23.6],
        relative_humidity_2m: [77, 80],
        precipitation: [0, 0.3],
      },
    })
    expect(
      registros.map(
        ({
          ciudad,
          fecha_hora,
          temperatura_c,
          humedad_pct,
          precipitacion_mm,
        }) => ({
          ciudad,
          fecha_hora,
          temperatura_c,
          humedad_pct,
          precipitacion_mm,
        })
      )
    ).toEqual([
      {
        ciudad: "Barcelona",
        fecha_hora: "2026-09-01T00:00:00.000Z",
        temperatura_c: 24.2,
        humedad_pct: 77,
        precipitacion_mm: 0,
      },
      {
        ciudad: "Barcelona",
        fecha_hora: "2026-09-01T01:00:00.000Z",
        temperatura_c: 23.6,
        humedad_pct: 80,
        precipitacion_mm: 0.3,
      },
    ])
  })

  it("interpreta las horas como UTC explícitamente y rechaza fechas imposibles", () => {
    expect(horaUtcAIso("2026-09-01T00:00")).toBe("2026-09-01T00:00:00.000Z")
    expect(horaUtcAIso("2026-04-31T00:00")).toBeNull()
    expect(horaUtcAIso("2026-09-01T24:00")).toBeNull()
    expect(horaUtcAIso("")).toBeNull()
    expect(horaUtcAIso(null)).toBeNull()
  })

  it("detecta arrays con longitudes incoherentes y rechaza sus filas con motivo", () => {
    const r = procesar(incoherentes)
    expect(r.diagnosticos[0].problemas.join(" ")).toMatch(
      /longitudes incoherentes/
    )
    expect(r.registros).toHaveLength(3)
    expect(r.validos).toHaveLength(0)
    expect(r.rechazados).toHaveLength(3)
    expect(r.rechazados[2].motivos.join(" ")).toMatch(/Temperatura ausente/)
  })

  it("marca un desfase horario distinto de UTC como problema", () => {
    const r = procesar({ ...nulos, utc_offset_seconds: 7200 })
    expect(r.validos).toHaveLength(0)
    expect(r.rechazados[0].motivos[0]).toMatch(/Desfase horario/)
  })
})

describe("limpieza con nulos y rangos (3)", () => {
  const r = procesar(nulos)
  const motivoDe = (hora: string) =>
    r.rechazados.find((x) => x.crudo.time === hora)?.motivos.join(" ")

  it("no convierte null ni cadenas vacías en cero", () => {
    expect(r.registros[1].temperatura_c).toBeNull()
    expect(r.registros[3].temperatura_c).toBeNull()
    expect(motivoDe("2026-09-01T01:00")).toBe("Temperatura nulo.")
    expect(motivoDe("2026-09-01T03:00")).toBe("Temperatura cadena vacía.")
    expect(motivoDe("2026-09-01T06:00")).toMatch(/texto no numérico/)
  })

  it("conserva el cero real y las temperaturas extremas", () => {
    const horas = r.validos.map((v) => v.fecha_hora)
    expect(horas).toContain("2026-09-01T02:00:00.000Z") // 0 °C, 0 %, 0 mm
    expect(r.validos.find((v) => v.temperatura_c === 51.3)).toBeDefined()
  })

  it("valida humedad 0–100 y precipitación ≥ 0", () => {
    expect(motivoDe("2026-09-01T05:00")).toMatch(/Humedad fuera de rango/)
    expect(motivoDe("2026-09-01T07:00")).toMatch(/Precipitación negativa/)
  })

  it("rechaza registros sin ciudad", () => {
    const sinCiudad = procesar(nulos, "  ")
    expect(sinCiudad.validos).toHaveLength(0)
    expect(sinCiudad.rechazados[0].motivos).toContain("Sin ciudad.")
  })

  it("cuadra el recuento: extraídos = válidos + rechazados", () => {
    expect(r.validos.length + r.rechazados.length).toBe(r.registros.length)
    expect(r.validos).toHaveLength(3)
  })
})

describe("duplicados (4)", () => {
  const r = procesar(duplicados)

  it("conserva la primera aparición válida de cada (ciudad, fecha_hora)", () => {
    expect(r.duplicados).toBe(1)
    const a01 = r.validos.find(
      (v) => v.fecha_hora === "2026-09-01T01:00:00.000Z"
    )
    expect(a01?.temperatura_c).toBe(21)
    const rechazado = r.rechazados.find((x) => x.crudo.temperature_2m === 99)
    expect(rechazado?.motivos[0]).toMatch(
      /Duplicado .* primera aparición, fixture#1/
    )
  })

  it("un registro inválido no ocupa la clave de uno válido posterior", () => {
    const a02 = r.validos.find(
      (v) => v.fecha_hora === "2026-09-01T02:00:00.000Z"
    )
    expect(a02?.temperatura_c).toBe(22)
    expect(r.validos).toHaveLength(3)
  })

  it("detecta duplicados entre respuestas distintas de la misma ciudad", () => {
    const t = transformar([
      {
        origen: "a",
        ciudad: "Madrid",
        respuesta: duplicados as RespuestaOpenMeteo,
      },
      {
        origen: "b",
        ciudad: "Madrid",
        respuesta: duplicados as RespuestaOpenMeteo,
      },
    ])
    const l = limpiar(t.registros)
    expect(l.validos).toHaveLength(3)
    expect(l.validos.every((v) => v.id.startsWith("a#"))).toBe(true)
  })
})
