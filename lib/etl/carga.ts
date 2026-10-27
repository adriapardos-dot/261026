import { NOMBRES_CIUDADES } from "./ciudades"
import { claveRegistro } from "./limpieza"
import type { Medicion } from "./tipos"

export const TAMANO_LOTE = 500
/** Límite del cuerpo JSON aceptado por los endpoints (500 registros caben en ~70 KB). */
export const MAX_BYTES_PETICION = 256 * 1024
export const TABLA_DESTINO = "mediciones_meteorologicas"

const CAMPOS: readonly (keyof Medicion)[] = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
]
const PATRON_ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

/** Devuelve la fecha normalizada (toISOString) o null si no es ISO UTC válida. */
export function normalizarFechaUtc(valor: unknown): string | null {
  if (typeof valor !== "string" || !PATRON_ISO_UTC.test(valor)) return null
  const ms = Date.parse(valor)
  if (Number.isNaN(ms)) return null
  const iso = new Date(ms).toISOString()
  return iso.slice(0, 19) === valor.slice(0, 19) ? iso : null
}

export function aMedicion(r: Medicion): Medicion {
  return {
    ciudad: r.ciudad,
    fecha_hora: r.fecha_hora,
    temperatura_c: r.temperatura_c,
    humedad_pct: r.humedad_pct,
    precipitacion_mm: r.precipitacion_mm,
  }
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; errores: string[] }

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function finito(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

/**
 * Validación de servidor de un lote de carga. No confía en la limpieza del
 * navegador: repite las reglas y además rechaza campos extra y claves repetidas
 * (un upsert con la misma clave dos veces en una sentencia falla en Postgres).
 */
export function validarLoteCarga(cuerpo: unknown): Resultado<Medicion[]> {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.registros)) {
    return { ok: false, errores: ["Se esperaba { registros: [...] }."] }
  }
  const lista = cuerpo.registros
  if (lista.length === 0 || lista.length > TAMANO_LOTE) {
    return {
      ok: false,
      errores: [`El lote debe tener entre 1 y ${TAMANO_LOTE} registros (tiene ${lista.length}).`],
    }
  }
  const errores: string[] = []
  const claves = new Set<string>()
  const registros: Medicion[] = []
  lista.forEach((r, i) => {
    const pre = `Registro ${i + 1}`
    if (!esObjeto(r)) return errores.push(`${pre}: no es un objeto.`)
    const extra = Object.keys(r).filter((k) => !CAMPOS.includes(k as keyof Medicion))
    if (extra.length) errores.push(`${pre}: campos no permitidos (${extra.join(", ")}).`)
    if (typeof r.ciudad !== "string" || !NOMBRES_CIUDADES.includes(r.ciudad))
      errores.push(`${pre}: ciudad no reconocida.`)
    const fecha = normalizarFechaUtc(r.fecha_hora)
    if (!fecha) errores.push(`${pre}: fecha_hora debe ser ISO 8601 en UTC (…Z).`)
    if (!finito(r.temperatura_c)) errores.push(`${pre}: temperatura_c no es un número finito.`)
    if (!finito(r.humedad_pct) || r.humedad_pct < 0 || r.humedad_pct > 100)
      errores.push(`${pre}: humedad_pct debe ser un número entre 0 y 100.`)
    if (!finito(r.precipitacion_mm) || r.precipitacion_mm < 0)
      errores.push(`${pre}: precipitacion_mm debe ser un número ≥ 0.`)
    if (typeof r.ciudad === "string" && fecha) {
      const clave = claveRegistro(r.ciudad, fecha)
      if (claves.has(clave)) errores.push(`${pre}: clave duplicada en el lote (${clave}).`)
      claves.add(clave)
    }
    registros.push({
      ciudad: r.ciudad as string,
      fecha_hora: fecha as string,
      temperatura_c: r.temperatura_c as number,
      humedad_pct: r.humedad_pct as number,
      precipitacion_mm: r.precipitacion_mm as number,
    })
  })
  if (errores.length) {
    const resto = errores.length - 20
    return {
      ok: false,
      errores: resto > 0 ? [...errores.slice(0, 20), `…y ${resto} errores más.`] : errores,
    }
  }
  return { ok: true, valor: registros }
}

export type Clave = { ciudad: string; fecha_hora: string }

export function validarClavesVerificacion(cuerpo: unknown): Resultado<Clave[]> {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.claves)) {
    return { ok: false, errores: ["Se esperaba { claves: [...] }."] }
  }
  const lista = cuerpo.claves
  if (lista.length === 0 || lista.length > TAMANO_LOTE) {
    return {
      ok: false,
      errores: [`Se aceptan entre 1 y ${TAMANO_LOTE} claves por consulta.`],
    }
  }
  const claves: Clave[] = []
  for (const c of lista) {
    const fecha = esObjeto(c) ? normalizarFechaUtc(c.fecha_hora) : null
    if (!esObjeto(c) || typeof c.ciudad !== "string" || !NOMBRES_CIUDADES.includes(c.ciudad) || !fecha) {
      return { ok: false, errores: ["Alguna clave no tiene ciudad o fecha_hora válidas."] }
    }
    claves.push({ ciudad: c.ciudad, fecha_hora: fecha })
  }
  return { ok: true, valor: claves }
}

// ---------------------------------------------------------------------------
// Orquestación de la carga en el navegador (sin dependencias de React).
// ---------------------------------------------------------------------------

export type EstadoLote = "pendiente" | "enviando" | "ok" | "error"

export type Lote = {
  numero: number
  /** Posiciones (base 0) en el conjunto congelado. */
  desde: number
  hasta: number
  registros: Medicion[]
  estado: EstadoLote
  mensaje?: string
  /** Filas afectadas según Supabase (insertadas + actualizadas, sin distinguir). */
  filasAfectadas?: number | null
  duracionMs?: number
}

export function crearLotes(registros: Medicion[], tamano = TAMANO_LOTE): Lote[] {
  const lotes: Lote[] = []
  for (let i = 0; i < registros.length; i += tamano) {
    const trozo = registros.slice(i, i + tamano)
    lotes.push({
      numero: lotes.length + 1,
      desde: i,
      hasta: i + trozo.length - 1,
      registros: trozo,
      estado: "pendiente",
    })
  }
  return lotes
}

export type EnviarLote = (
  registros: Medicion[]
) => Promise<{ filasAfectadas: number | null }>

/**
 * Envía en serie los lotes indicados. Un fallo marca solo ese lote; los
 * anteriores conservan su estado y los siguientes se siguen intentando.
 * `alCambiar` recibe una copia nueva tras cada transición de estado.
 */
export async function ejecutarLotes(
  lotesIniciales: Lote[],
  numeros: number[],
  enviar: EnviarLote,
  alCambiar: (lotes: Lote[]) => void,
  ahora: () => number = () => performance.now()
): Promise<Lote[]> {
  let lotes = lotesIniciales.map((l) => ({ ...l }))
  const actualizar = (numero: number, cambios: Partial<Lote>) => {
    lotes = lotes.map((l) => (l.numero === numero ? { ...l, ...cambios } : l))
    alCambiar(lotes)
  }
  for (const numero of numeros) {
    const lote = lotes.find((l) => l.numero === numero)
    if (!lote) continue
    actualizar(numero, { estado: "enviando", mensaje: undefined })
    const inicio = ahora()
    try {
      const { filasAfectadas } = await enviar(lote.registros)
      actualizar(numero, { estado: "ok", filasAfectadas, duracionMs: ahora() - inicio })
    } catch (error) {
      actualizar(numero, {
        estado: "error",
        mensaje: error instanceof Error ? error.message : String(error),
        duracionMs: ahora() - inicio,
      })
    }
  }
  return lotes
}

export function resumirLotes(lotes: Lote[]) {
  let correctos = 0
  let fallidos = 0
  let pendientes = 0
  for (const l of lotes) {
    if (l.estado === "ok") correctos += l.registros.length
    else if (l.estado === "error") fallidos += l.registros.length
    else pendientes += l.registros.length
  }
  return { correctos, fallidos, pendientes }
}

export type ConsultarClaves = (claves: Clave[]) => Promise<Clave[]>

/** Comprueba por lotes que cada clave enviada existe en destino. */
export async function verificarEnDestino(
  registros: Medicion[],
  consultar: ConsultarClaves,
  tamano = TAMANO_LOTE
): Promise<{ comprobadas: number; encontradas: number; faltantes: Clave[] }> {
  let encontradas = 0
  const faltantes: Clave[] = []
  for (let i = 0; i < registros.length; i += tamano) {
    const claves = registros
      .slice(i, i + tamano)
      .map((r) => ({ ciudad: r.ciudad, fecha_hora: r.fecha_hora }))
    const existentes = new Set(
      (await consultar(claves)).map((c) =>
        claveRegistro(c.ciudad, normalizarFechaUtc(c.fecha_hora) ?? c.fecha_hora)
      )
    )
    for (const c of claves) {
      if (existentes.has(claveRegistro(c.ciudad, c.fecha_hora))) encontradas++
      else faltantes.push(c)
    }
  }
  return { comprobadas: registros.length, encontradas, faltantes }
}
