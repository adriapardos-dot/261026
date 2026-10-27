import type {
  RegistroRechazado,
  RegistroTransformado,
  RegistroValido,
} from "./tipos"

export type ResultadoLimpieza = {
  validos: RegistroValido[]
  rechazados: RegistroRechazado[]
  duplicados: number
}

export function claveRegistro(ciudad: string, fechaHora: string): string {
  return `${ciudad}|${fechaHora}`
}

/** Explica por qué un valor crudo no es un número finito. */
function describirValorInvalido(valor: unknown): string {
  if (valor === undefined) return "ausente"
  if (valor === null) return "nulo"
  if (typeof valor === "string") {
    return valor.trim() === "" ? "cadena vacía" : `texto no numérico («${valor}»)`
  }
  if (typeof valor === "number") return "número no finito"
  return `tipo no numérico (${typeof valor})`
}

function motivosDeCalidad(r: RegistroTransformado): string[] {
  const motivos = [...r.problemas]
  if (r.ciudad === null) motivos.push("Sin ciudad.")
  if (r.fecha_hora === null) {
    motivos.push(
      r.crudo.time === undefined || r.crudo.time === null
        ? "Sin fecha y hora."
        : `Fecha y hora no válida («${String(r.crudo.time)}»).`
    )
  }
  if (r.temperatura_c === null) {
    motivos.push(`Temperatura ${describirValorInvalido(r.crudo.temperature_2m)}.`)
  }
  if (r.humedad_pct === null) {
    motivos.push(`Humedad ${describirValorInvalido(r.crudo.relative_humidity_2m)}.`)
  } else if (r.humedad_pct < 0 || r.humedad_pct > 100) {
    motivos.push(`Humedad fuera de rango (${r.humedad_pct} %; debe estar entre 0 y 100).`)
  }
  if (r.precipitacion_mm === null) {
    motivos.push(`Precipitación ${describirValorInvalido(r.crudo.precipitation)}.`)
  } else if (r.precipitacion_mm < 0) {
    motivos.push(`Precipitación negativa (${r.precipitacion_mm} mm).`)
  }
  // No hay umbral de temperatura: los valores extremos reales se conservan.
  return motivos
}

/**
 * Valida cada registro y elimina duplicados por (ciudad, fecha_hora).
 * Regla de duplicados: se conserva la PRIMERA aparición válida en el orden de
 * llegada (orden de ciudades extraídas y, dentro de cada una, orden del array);
 * las siguientes se rechazan indicando con qué registro coinciden. Un registro
 * rechazado por calidad nunca "ocupa" la clave, así que no tapa a uno válido.
 */
export function limpiar(registros: RegistroTransformado[]): ResultadoLimpieza {
  const validos: RegistroValido[] = []
  const rechazados: RegistroRechazado[] = []
  const vistos = new Map<string, RegistroValido>()
  let duplicados = 0

  for (const r of registros) {
    const motivos = motivosDeCalidad(r)
    if (motivos.length > 0) {
      rechazados.push({ ...r, motivos })
      continue
    }
    const ciudad = r.ciudad as string
    const fecha_hora = r.fecha_hora as string
    const clave = claveRegistro(ciudad, fecha_hora)
    const previo = vistos.get(clave)
    if (previo) {
      duplicados++
      rechazados.push({
        ...r,
        motivos: [
          `Duplicado de ${ciudad} ${fecha_hora} (se conserva la primera aparición, ${previo.id}).`,
        ],
      })
      continue
    }
    const valido: RegistroValido = {
      id: r.id,
      clave,
      ciudad,
      fecha_hora,
      temperatura_c: r.temperatura_c as number,
      humedad_pct: r.humedad_pct as number,
      precipitacion_mm: r.precipitacion_mm as number,
    }
    vistos.set(clave, valido)
    validos.push(valido)
  }

  return { validos, rechazados, duplicados }
}
