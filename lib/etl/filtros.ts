import { horaUtcAIso } from "./transformacion"
import type { CampoOrden, DireccionOrden, RegistroValido } from "./tipos"

/** Valores de los controles del formulario (texto, tal como los escribe el usuario). */
export type Filtros = {
  /** Ciudades incluidas; vacío significa todas. */
  ciudades: string[]
  /** "AAAA-MM-DDTHH:MM" interpretado como UTC, o "" sin límite. */
  desde: string
  hasta: string
  tempMin: string
  tempMax: string
  humMin: string
  humMax: string
  precMin: string
  precMax: string
  soloLluvia: boolean
}

export type Orden = { campo: CampoOrden; direccion: DireccionOrden }

export const FILTROS_INICIALES: Filtros = {
  ciudades: [],
  desde: "",
  hasta: "",
  tempMin: "",
  tempMax: "",
  humMin: "",
  humMax: "",
  precMin: "",
  precMax: "",
  soloLluvia: false,
}

export const ORDEN_INICIAL: Orden = { campo: "fecha_hora", direccion: "asc" }

type Intervalo = { min: number | null; max: number | null }

export type Criterios = {
  ciudades: Set<string> | null
  desde: string | null
  hasta: string | null
  temperatura: Intervalo
  humedad: Intervalo
  precipitacion: Intervalo
  soloLluvia: boolean
}

function leerNumero(
  texto: string,
  etiqueta: string,
  errores: string[]
): number | null {
  const limpio = texto.trim().replace(",", ".")
  if (limpio === "") return null
  const n = Number(limpio)
  if (!Number.isFinite(n)) {
    errores.push(`${etiqueta}: «${texto}» no es un número.`)
    return null
  }
  return n
}

function leerIntervalo(
  min: string,
  max: string,
  etiqueta: string,
  errores: string[]
): Intervalo {
  const a = leerNumero(min, `${etiqueta} mínima`, errores)
  const b = leerNumero(max, `${etiqueta} máxima`, errores)
  if (a !== null && b !== null && a > b) {
    errores.push(`${etiqueta}: el mínimo (${a}) es mayor que el máximo (${b}).`)
  }
  return { min: a, max: b }
}

function leerFechaHora(
  texto: string,
  etiqueta: string,
  errores: string[]
): string | null {
  if (texto.trim() === "") return null
  const iso = horaUtcAIso(texto)
  if (iso === null) errores.push(`${etiqueta}: fecha y hora no válida.`)
  return iso
}

/** Convierte los textos del formulario en criterios y lista los errores. */
export function interpretarFiltros(f: Filtros): {
  criterios: Criterios
  errores: string[]
} {
  const errores: string[] = []
  const desde = leerFechaHora(f.desde, "Desde", errores)
  const hasta = leerFechaHora(f.hasta, "Hasta", errores)
  if (desde && hasta && desde > hasta) {
    errores.push("La fecha «desde» es posterior a «hasta».")
  }
  return {
    criterios: {
      ciudades: f.ciudades.length > 0 ? new Set(f.ciudades) : null,
      desde,
      hasta,
      temperatura: leerIntervalo(f.tempMin, f.tempMax, "Temperatura", errores),
      humedad: leerIntervalo(f.humMin, f.humMax, "Humedad", errores),
      precipitacion: leerIntervalo(
        f.precMin,
        f.precMax,
        "Precipitación",
        errores
      ),
      soloLluvia: f.soloLluvia,
    },
    errores,
  }
}

function dentro(valor: number, { min, max }: Intervalo): boolean {
  return (min === null || valor >= min) && (max === null || valor <= max)
}

export function cumpleCriterios(r: RegistroValido, c: Criterios): boolean {
  if (c.ciudades && !c.ciudades.has(r.ciudad)) return false
  // Las fechas ISO en UTC con el mismo formato se comparan como texto.
  if (c.desde && r.fecha_hora < c.desde) return false
  if (c.hasta && r.fecha_hora > c.hasta) return false
  if (!dentro(r.temperatura_c, c.temperatura)) return false
  if (!dentro(r.humedad_pct, c.humedad)) return false
  if (!dentro(r.precipitacion_mm, c.precipitacion)) return false
  if (c.soloLluvia && !(r.precipitacion_mm > 0)) return false
  return true
}

const comparadorTexto = new Intl.Collator("es")

function comparar(a: RegistroValido, b: RegistroValido, campo: CampoOrden) {
  if (campo === "ciudad") return comparadorTexto.compare(a.ciudad, b.ciudad)
  if (campo === "fecha_hora")
    return a.fecha_hora < b.fecha_hora ? -1 : a.fecha_hora > b.fecha_hora ? 1 : 0
  return a[campo] - b[campo]
}

/** Ordena sin mutar. Desempate fijo por ciudad y fecha para un orden determinista. */
export function ordenar(
  registros: RegistroValido[],
  orden: Orden
): RegistroValido[] {
  const signo = orden.direccion === "asc" ? 1 : -1
  return [...registros].sort(
    (a, b) =>
      signo * comparar(a, b, orden.campo) ||
      comparar(a, b, "ciudad") ||
      comparar(a, b, "fecha_hora")
  )
}

export type ResultadoSeleccion = {
  /** Válidos que cumplen los filtros, ya ordenados. */
  coincidentes: RegistroValido[]
  /** Seleccionados que cumplen los filtros, en el orden elegido: lo que se subirá. */
  aCargar: RegistroValido[]
  /** Seleccionados que han quedado fuera por los filtros actuales. */
  seleccionadosFuera: number
}

/** Orden de operaciones: válidos → filtros → ordenación → selección. */
export function prepararCarga(
  validos: RegistroValido[],
  criterios: Criterios,
  orden: Orden,
  seleccion: ReadonlySet<string>
): ResultadoSeleccion {
  const coincidentes = ordenar(
    validos.filter((r) => cumpleCriterios(r, criterios)),
    orden
  )
  const aCargar = coincidentes.filter((r) => seleccion.has(r.clave))
  let seleccionadosValidos = 0
  for (const r of validos) if (seleccion.has(r.clave)) seleccionadosValidos++
  return {
    coincidentes,
    aCargar,
    seleccionadosFuera: seleccionadosValidos - aCargar.length,
  }
}

/** La paginación solo recorta lo que se muestra; nunca afecta a filtros ni selección. */
export function paginar<T>(
  filas: T[],
  pagina: number,
  tamano: number
): { filas: T[]; pagina: number; totalPaginas: number } {
  const totalPaginas = Math.max(1, Math.ceil(filas.length / tamano))
  const actual = Math.min(Math.max(1, pagina), totalPaginas)
  return {
    filas: filas.slice((actual - 1) * tamano, actual * tamano),
    pagina: actual,
    totalPaginas,
  }
}
