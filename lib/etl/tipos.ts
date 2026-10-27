/** Respuesta de Open-Meteo tal como llega (no se confía en su forma). */
export type RespuestaOpenMeteo = {
  latitude?: unknown
  longitude?: unknown
  utc_offset_seconds?: unknown
  timezone?: unknown
  hourly_units?: Record<string, unknown>
  hourly?: Record<string, unknown>
  [clave: string]: unknown
}

/** Un registro por ciudad y hora, después de convertir los arrays paralelos. */
export type RegistroTransformado = {
  /** Identificador interno estable: ciudad de origen + índice en el array. */
  id: string
  origen: string
  indice: number
  ciudad: string | null
  /** ISO 8601 en UTC (sufijo Z) o null si la fecha no es válida. */
  fecha_hora: string | null
  temperatura_c: number | null
  humedad_pct: number | null
  precipitacion_mm: number | null
  /** Valores tal como venían en la respuesta, para poder explicar rechazos. */
  crudo: {
    time: unknown
    temperature_2m: unknown
    relative_humidity_2m: unknown
    precipitation: unknown
  }
  /** Problemas estructurales detectados en la transformación. */
  problemas: string[]
}

/** Registro limpio: todos los campos presentes y válidos. */
export type Medicion = {
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
}

export type RegistroValido = Medicion & {
  /** Clave natural: `${ciudad}|${fecha_hora}`. */
  clave: string
  id: string
}

export type RegistroRechazado = RegistroTransformado & {
  motivos: string[]
}

export type CampoOrden =
  | "ciudad"
  | "fecha_hora"
  | "temperatura_c"
  | "humedad_pct"
  | "precipitacion_mm"

export type DireccionOrden = "asc" | "desc"

export type EstadoFase = "pendiente" | "en_curso" | "completada" | "error"
