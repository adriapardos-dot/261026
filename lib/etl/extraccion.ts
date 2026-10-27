import type { Ciudad } from "./ciudades"
import type { RespuestaOpenMeteo } from "./tipos"

export const URL_ARCHIVO_OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive"
export const VARIABLES_HORARIAS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
] as const
export const MAX_DIAS_EXTRACCION = 31
export const FECHA_MINIMA_ARCHIVO = "1940-01-01"

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/
const MS_DIA = 86_400_000

/** Convierte "AAAA-MM-DD" en milisegundos UTC, o null si no es una fecha real. */
export function fechaUtcEnMs(fecha: string): number | null {
  if (!PATRON_FECHA.test(fecha)) return null
  const ms = Date.parse(`${fecha}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  // Rechaza fechas como 2026-02-30, que Date.parse corregiría a marzo.
  if (new Date(ms).toISOString().slice(0, 10) !== fecha) return null
  return ms
}

export function diasEnIntervalo(inicio: string, fin: string): number | null {
  const a = fechaUtcEnMs(inicio)
  const b = fechaUtcEnMs(fin)
  if (a === null || b === null || b < a) return null
  return Math.round((b - a) / MS_DIA) + 1
}

export type ConfiguracionExtraccion = {
  ciudades: string[]
  fechaInicio: string
  fechaFin: string
}

/** Devuelve la lista de errores de validación; vacía si la configuración es correcta. */
export function validarConfiguracion(
  config: ConfiguracionExtraccion,
  hoyUtc: string = new Date().toISOString().slice(0, 10)
): string[] {
  const errores: string[] = []
  if (config.ciudades.length === 0) {
    errores.push("Selecciona al menos una ciudad.")
  }
  const inicio = fechaUtcEnMs(config.fechaInicio)
  const fin = fechaUtcEnMs(config.fechaFin)
  if (inicio === null) errores.push("La fecha inicial no es válida.")
  if (fin === null) errores.push("La fecha final no es válida.")
  if (inicio !== null && fin !== null) {
    if (fin < inicio) {
      errores.push("La fecha final debe ser igual o posterior a la inicial.")
    } else {
      const dias = Math.round((fin - inicio) / MS_DIA) + 1
      if (dias > MAX_DIAS_EXTRACCION) {
        errores.push(
          `El intervalo tiene ${dias} días; el máximo permitido es ${MAX_DIAS_EXTRACCION}.`
        )
      }
    }
    if (inicio < (fechaUtcEnMs(FECHA_MINIMA_ARCHIVO) ?? 0)) {
      errores.push("El archivo histórico empieza el 1 de enero de 1940.")
    }
    const hoy = fechaUtcEnMs(hoyUtc)
    if (hoy !== null && fin > hoy) {
      errores.push("La fecha final no puede ser posterior a hoy (UTC).")
    }
  }
  return errores
}

export function construirUrl(
  ciudad: Ciudad,
  fechaInicio: string,
  fechaFin: string
): string {
  const params = new URLSearchParams({
    latitude: String(ciudad.latitud),
    longitude: String(ciudad.longitud),
    start_date: fechaInicio,
    end_date: fechaFin,
    hourly: VARIABLES_HORARIAS.join(","),
    // GMT equivale a UTC (desfase 0); Open-Meteo devuelve las horas sin sufijo.
    timezone: "GMT",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
    timeformat: "iso8601",
  })
  return `${URL_ARCHIVO_OPEN_METEO}?${params.toString()}`
}

export class ErrorExtraccion extends Error {}

/** Descarga los datos de una ciudad. Lanza ErrorExtraccion con un mensaje legible. */
export async function extraerCiudad(
  ciudad: Ciudad,
  fechaInicio: string,
  fechaFin: string,
  opciones: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<RespuestaOpenMeteo> {
  const hacerFetch = opciones.fetch ?? fetch
  let respuesta: Response
  try {
    respuesta = await hacerFetch(construirUrl(ciudad, fechaInicio, fechaFin), {
      signal: opciones.signal,
    })
  } catch (error) {
    throw new ErrorExtraccion(
      `No se pudo conectar con Open-Meteo: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch {
    throw new ErrorExtraccion(
      `Open-Meteo respondió ${respuesta.status} con un cuerpo que no es JSON.`
    )
  }
  if (!respuesta.ok) {
    const motivo =
      cuerpo && typeof cuerpo === "object" && "reason" in cuerpo
        ? String((cuerpo as { reason: unknown }).reason)
        : respuesta.statusText
    throw new ErrorExtraccion(`Open-Meteo respondió ${respuesta.status}: ${motivo}`)
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    throw new ErrorExtraccion("La respuesta de Open-Meteo no es un objeto JSON.")
  }
  return cuerpo as RespuestaOpenMeteo
}
