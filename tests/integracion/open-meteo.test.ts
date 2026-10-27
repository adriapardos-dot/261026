import { describe, expect, it } from "vitest"

import { buscarCiudad } from "@/lib/etl/ciudades"
import { construirUrl, extraerCiudad, validarConfiguracion } from "@/lib/etl/extraccion"
import { limpiar } from "@/lib/etl/limpieza"
import { transformar } from "@/lib/etl/transformacion"

/** Prueba real contra la API de Open-Meteo (requiere red). */
describe("extracción real: Barcelona, 1 día (1)", () => {
  it("devuelve 24 registros horarios en UTC, todos válidos", async () => {
    const barcelona = buscarCiudad("barcelona")!
    const respuesta = await extraerCiudad(barcelona, "2026-09-01", "2026-09-01")
    expect(respuesta.utc_offset_seconds).toBe(0)
    expect(respuesta.hourly_units).toMatchObject({
      temperature_2m: "°C",
      relative_humidity_2m: "%",
      precipitation: "mm",
    })

    const t = transformar([{ origen: "barcelona", ciudad: "Barcelona", respuesta }])
    expect(t.diagnosticos[0].problemas).toEqual([])
    expect(t.registros).toHaveLength(24)
    expect(t.registros[0].fecha_hora).toBe("2026-09-01T00:00:00.000Z")
    expect(t.registros[23].fecha_hora).toBe("2026-09-01T23:00:00.000Z")
    const { validos, rechazados } = limpiar(t.registros)
    expect(validos).toHaveLength(24)
    expect(rechazados).toHaveLength(0)
  })

  it("la URL pide UTC, °C y mm y la configuración limita a 31 días", () => {
    const url = new URL(construirUrl(buscarCiudad("madrid")!, "2026-09-01", "2026-09-30"))
    expect(url.searchParams.get("timezone")).toBe("GMT")
    expect(url.searchParams.get("temperature_unit")).toBe("celsius")
    expect(url.searchParams.get("precipitation_unit")).toBe("mm")
    expect(url.searchParams.get("hourly")).toBe("temperature_2m,relative_humidity_2m,precipitation")
    const ok = { ciudades: ["madrid"], fechaInicio: "2026-09-01", fechaFin: "2026-10-01" }
    expect(validarConfiguracion(ok, "2026-10-27")).toEqual([])
    expect(validarConfiguracion({ ...ok, fechaFin: "2026-10-02" }, "2026-10-27")[0]).toMatch(/32 días/)
    expect(validarConfiguracion({ ...ok, fechaFin: "2026-10-28" }, "2026-10-27").join()).toMatch(/posterior a hoy/)
  })

  it("un error de la API se convierte en un mensaje legible", async () => {
    await expect(
      extraerCiudad(buscarCiudad("bilbao")!, "2026-09-30", "2026-09-01")
    ).rejects.toThrow(/Open-Meteo respondió 400/)
  })
})
