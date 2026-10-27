import type { RegistroTransformado, RespuestaOpenMeteo } from "./tipos"

export type EntradaTransformacion = {
  /** Identificador de la ciudad de origen (para trazabilidad). */
  origen: string
  /** Nombre que se guardará en la columna `ciudad`. */
  ciudad: string | null
  respuesta: RespuestaOpenMeteo
}

export type DiagnosticoCiudad = {
  origen: string
  ciudad: string | null
  horas: number
  longitudes: Record<string, number | null>
  problemas: string[]
}

export type ResultadoTransformacion = {
  registros: RegistroTransformado[]
  diagnosticos: DiagnosticoCiudad[]
}

const UNIDADES_ESPERADAS: Record<string, string> = {
  temperature_2m: "°C",
  relative_humidity_2m: "%",
  precipitation: "mm",
}

const PATRON_HORA_OPEN_METEO = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Interpreta explícitamente la hora recibida como UTC. Open-Meteo, con
 * timezone=GMT, devuelve "AAAA-MM-DDTHH:MM" sin zona: añadimos "Z" nosotros en
 * lugar de dejar que el navegador la interprete como hora local.
 */
export function horaUtcAIso(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const m = PATRON_HORA_OPEN_METEO.exec(valor.trim())
  if (!m) return null
  const [, fecha, hh, mm, ss = "00"] = m
  const iso = `${fecha}T${hh}:${mm}:${ss}.000Z`
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const normalizada = new Date(ms).toISOString()
  // Si Date "corrigió" la fecha (p. ej. 31 de abril o 24:00), no es válida.
  return normalizada === iso ? normalizada : null
}

/** Solo acepta números finitos; null, "", undefined, "12" o NaN devuelven null. */
export function numeroFinito(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

function longitud(valor: unknown): number | null {
  return Array.isArray(valor) ? valor.length : null
}

/**
 * Convierte los arrays paralelos de cada ciudad en un registro por hora.
 * No descarta nada: anota los problemas para que la limpieza los rechace con
 * su motivo y el recuento total cuadre (extraídos = válidos + rechazados).
 */
export function transformar(
  entradas: EntradaTransformacion[]
): ResultadoTransformacion {
  const registros: RegistroTransformado[] = []
  const diagnosticos: DiagnosticoCiudad[] = []

  for (const { origen, ciudad, respuesta } of entradas) {
    const problemas: string[] = []
    const hourly =
      respuesta.hourly && typeof respuesta.hourly === "object"
        ? respuesta.hourly
        : undefined
    const time = hourly?.time
    const longitudes: Record<string, number | null> = {
      time: longitud(time),
      temperature_2m: longitud(hourly?.temperature_2m),
      relative_humidity_2m: longitud(hourly?.relative_humidity_2m),
      precipitation: longitud(hourly?.precipitation),
    }

    if (!hourly) {
      problemas.push("La respuesta no contiene el bloque «hourly».")
    } else if (!Array.isArray(time)) {
      problemas.push("La respuesta no contiene el array «time».")
    }

    if (respuesta.utc_offset_seconds !== 0) {
      problemas.push(
        `Desfase horario inesperado (${String(respuesta.utc_offset_seconds)} s); se esperaba UTC.`
      )
    }

    for (const [variable, unidad] of Object.entries(UNIDADES_ESPERADAS)) {
      const recibida = respuesta.hourly_units?.[variable]
      if (recibida !== undefined && recibida !== unidad) {
        problemas.push(
          `Unidad inesperada en ${variable}: «${String(recibida)}» (se esperaba «${unidad}»).`
        )
      }
    }

    const horas = Array.isArray(time) ? time.length : 0
    const incoherentes = Object.entries(longitudes).filter(
      ([, n]) => n !== horas
    )
    if (Array.isArray(time) && incoherentes.length > 0) {
      problemas.push(
        `Arrays con longitudes incoherentes: ${Object.entries(longitudes)
          .map(([k, n]) => `${k}=${n ?? "ausente"}`)
          .join(", ")}.`
      )
    }

    diagnosticos.push({ origen, ciudad, horas, longitudes, problemas })

    if (!Array.isArray(time)) continue
    const temp = hourly?.temperature_2m
    const hum = hourly?.relative_humidity_2m
    const prec = hourly?.precipitation
    const tomar = (arr: unknown, i: number) =>
      Array.isArray(arr) ? arr[i] : undefined

    for (let i = 0; i < horas; i++) {
      const crudo = {
        time: time[i],
        temperature_2m: tomar(temp, i),
        relative_humidity_2m: tomar(hum, i),
        precipitation: tomar(prec, i),
      }
      registros.push({
        id: `${origen}#${i}`,
        origen,
        indice: i,
        ciudad: ciudad && ciudad.trim() !== "" ? ciudad.trim() : null,
        fecha_hora: horaUtcAIso(crudo.time),
        temperatura_c: numeroFinito(crudo.temperature_2m),
        humedad_pct: numeroFinito(crudo.relative_humidity_2m),
        precipitacion_mm: numeroFinito(crudo.precipitation),
        crudo,
        problemas: [...problemas],
      })
    }
  }

  return { registros, diagnosticos }
}
