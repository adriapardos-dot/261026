"use client"

import * as React from "react"

import {
  aMedicion,
  crearLotes,
  ejecutarLotes,
  verificarEnDestino,
  type Clave,
  type Lote,
} from "@/lib/etl/carga"
import { buscarCiudad, CIUDADES } from "@/lib/etl/ciudades"
import {
  construirUrl,
  extraerCiudad,
  type ConfiguracionExtraccion,
} from "@/lib/etl/extraccion"
import {
  FILTROS_INICIALES,
  interpretarFiltros,
  ORDEN_INICIAL,
  prepararCarga,
  type Filtros,
  type Orden,
} from "@/lib/etl/filtros"
import { limpiar, type ResultadoLimpieza } from "@/lib/etl/limpieza"
import type { CampoOrden, EstadoFase, Medicion, RespuestaOpenMeteo } from "@/lib/etl/tipos"
import { transformar, type ResultadoTransformacion } from "@/lib/etl/transformacion"

export type EstadoCiudad = {
  id: string
  nombre: string
  url: string
  estado: EstadoFase
  respuesta?: RespuestaOpenMeteo
  error?: string
  duracionMs?: number
  intentos: number
}

export type Extraccion = {
  fechaInicio: string
  fechaFin: string
  ciudades: EstadoCiudad[]
  enCurso: boolean
  duracionMs?: number
  ultimaOperacion: string
}

export type Procesado = {
  transformacion: ResultadoTransformacion
  duracionTransformacionMs: number
  limpieza: ResultadoLimpieza
  duracionLimpiezaMs: number
}

export type Verificacion = {
  estado: EstadoFase
  comprobadas: number
  encontradas: number
  faltantes: Clave[]
  error?: string
  duracionMs?: number
}

export type Carga = {
  /** Copia congelada del conjunto a subir, en el orden elegido al pulsar el botón. */
  congelado: Medicion[]
  lotes: Lote[]
  enCurso: boolean
  duracionMs?: number
  verificacion?: Verificacion
}

export type EstadoSupabase = {
  comprobando: boolean
  configurado: boolean | null
  tablaAccesible: boolean | null
  mensaje: string
}

async function leerError(respuesta: Response): Promise<string> {
  const cuerpo = (await respuesta.json().catch(() => null)) as {
    error?: string
    detalles?: string[]
  } | null
  const base = cuerpo?.error ?? `HTTP ${respuesta.status} ${respuesta.statusText}`
  return cuerpo?.detalles?.length ? `${base} ${cuerpo.detalles.join(" ")}` : base
}

async function enviarLote(registros: Medicion[]) {
  const respuesta = await fetch("/api/carga", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registros }),
  })
  if (!respuesta.ok) throw new Error(await leerError(respuesta))
  const cuerpo = (await respuesta.json()) as { filasAfectadas: number | null }
  return { filasAfectadas: cuerpo.filasAfectadas }
}

async function consultarClaves(claves: Clave[]): Promise<Clave[]> {
  const respuesta = await fetch("/api/verificar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claves }),
  })
  if (!respuesta.ok) throw new Error(await leerError(respuesta))
  return ((await respuesta.json()) as { existentes: Clave[] }).existentes
}

export function usePipelineEtl() {
  const [extraccion, setExtraccionEstado] = React.useState<Extraccion | null>(null)
  const extraccionRef = React.useRef<Extraccion | null>(null)
  const setExtraccion = React.useCallback((e: Extraccion) => {
    extraccionRef.current = e
    setExtraccionEstado(e)
  }, [])

  const [procesado, setProcesado] = React.useState<Procesado | null>(null)
  const [filtros, setFiltros] = React.useState<Filtros>(FILTROS_INICIALES)
  const [orden, setOrden] = React.useState<Orden>(ORDEN_INICIAL)
  const [seleccion, setSeleccion] = React.useState<ReadonlySet<string>>(new Set())
  const [carga, setCarga] = React.useState<Carga | null>(null)
  const [supabase, setSupabase] = React.useState<EstadoSupabase>({
    comprobando: true,
    configurado: null,
    tablaAccesible: null,
    mensaje: "Comprobando la conexión…",
  })

  // Cerrojos síncronos: impiden dos extracciones o dos cargas simultáneas
  // aunque el usuario pulse dos veces antes de que React vuelva a renderizar.
  const extrayendo = React.useRef(false)
  const cargando = React.useRef(false)

  const comprobarSupabase = React.useCallback(async () => {
    setSupabase((s) => ({ ...s, comprobando: true }))
    try {
      const r = await fetch("/api/estado", { cache: "no-store" })
      if (!r.ok) throw new Error(await leerError(r))
      const cuerpo = (await r.json()) as Omit<EstadoSupabase, "comprobando">
      setSupabase({ ...cuerpo, comprobando: false })
    } catch (error) {
      setSupabase({
        comprobando: false,
        configurado: null,
        tablaAccesible: false,
        mensaje: error instanceof Error ? error.message : String(error),
      })
    }
  }, [])

  React.useEffect(() => {
    // Sincroniza con un sistema externo (el servidor); no es estado derivado.
    void comprobarSupabase()
  }, [comprobarSupabase])

  /** Transformación y limpieza sobre todas las respuestas correctas, midiendo cada fase. */
  const procesar = React.useCallback((ext: Extraccion) => {
    const entradas = ext.ciudades
      .filter((c) => c.estado === "completada" && c.respuesta)
      .map((c) => ({
        origen: c.id,
        ciudad: c.nombre,
        respuesta: c.respuesta as RespuestaOpenMeteo,
      }))
    const t0 = performance.now()
    const transformacion = transformar(entradas)
    const t1 = performance.now()
    const limpieza = limpiar(transformacion.registros)
    const t2 = performance.now()
    setProcesado({
      transformacion,
      duracionTransformacionMs: t1 - t0,
      limpieza,
      duracionLimpiezaMs: t2 - t1,
    })
    // Se descartan de la selección las claves que ya no existen; nunca se
    // seleccionan automáticamente registros nuevos.
    const claves = new Set(limpieza.validos.map((r) => r.clave))
    setSeleccion((prev) => new Set([...prev].filter((k) => claves.has(k))))
  }, [])

  const descargar = React.useCallback(
    async (ids: string[], operacion: string) => {
      const inicio = performance.now()
      const actualizar = (id: string, cambios: Partial<EstadoCiudad>) => {
        const actual = extraccionRef.current as Extraccion
        setExtraccion({
          ...actual,
          ciudades: actual.ciudades.map((c) =>
            c.id === id ? { ...c, ...cambios } : c
          ),
        })
      }
      for (const id of ids) {
        const ext = extraccionRef.current as Extraccion
        const ciudad = buscarCiudad(id)
        const previa = ext.ciudades.find((c) => c.id === id)
        if (!ciudad || !previa) continue
        actualizar(id, { estado: "en_curso", error: undefined, intentos: previa.intentos + 1 })
        const t = performance.now()
        try {
          // Reintentar sustituye la respuesta de esa ciudad: no se acumula.
          const respuesta = await extraerCiudad(ciudad, ext.fechaInicio, ext.fechaFin)
          actualizar(id, { estado: "completada", respuesta, duracionMs: performance.now() - t })
        } catch (error) {
          actualizar(id, {
            estado: "error",
            respuesta: undefined,
            error: error instanceof Error ? error.message : String(error),
            duracionMs: performance.now() - t,
          })
        }
      }
      const final = {
        ...(extraccionRef.current as Extraccion),
        enCurso: false,
        duracionMs: performance.now() - inicio,
        ultimaOperacion: operacion,
      }
      setExtraccion(final)
      procesar(final)
    },
    [procesar, setExtraccion]
  )

  const extraer = React.useCallback(
    async (config: ConfiguracionExtraccion) => {
      if (extrayendo.current || cargando.current) return
      extrayendo.current = true
      try {
        // Orden fijo de la lista de ciudades, independiente del orden de clic.
        const ids = CIUDADES.map((c) => c.id).filter((id) => config.ciudades.includes(id))
        setExtraccion({
          fechaInicio: config.fechaInicio,
          fechaFin: config.fechaFin,
          enCurso: true,
          ultimaOperacion: "Extracción completa",
          ciudades: ids.map((id) => {
            const c = buscarCiudad(id)!
            return {
              id,
              nombre: c.nombre,
              url: construirUrl(c, config.fechaInicio, config.fechaFin),
              estado: "pendiente",
              intentos: 0,
            }
          }),
        })
        setProcesado(null)
        setSeleccion(new Set())
        setCarga(null)
        await descargar(ids, "Extracción completa")
      } finally {
        extrayendo.current = false
      }
    },
    [descargar, setExtraccion]
  )

  const reintentarCiudad = React.useCallback(
    async (id: string) => {
      if (extrayendo.current || !extraccionRef.current) return
      extrayendo.current = true
      try {
        setExtraccion({ ...extraccionRef.current, enCurso: true })
        await descargar([id], `Reintento de ${buscarCiudad(id)?.nombre ?? id}`)
      } finally {
        extrayendo.current = false
      }
    },
    [descargar, setExtraccion]
  )

  // ---- Filtrado, ordenación y selección (derivados) -----------------------
  const validos = React.useMemo(() => procesado?.limpieza.validos ?? [], [procesado])
  const { criterios, errores: erroresFiltros } = React.useMemo(
    () => interpretarFiltros(filtros),
    [filtros]
  )
  const filtrado = React.useMemo(() => {
    const t0 = performance.now()
    const resultado = prepararCarga(validos, criterios, orden, seleccion)
    return { ...resultado, duracionMs: performance.now() - t0 }
  }, [validos, criterios, orden, seleccion])

  const cambiarSeleccion = React.useCallback((claves: string[], marcar: boolean) => {
    setSeleccion((prev) => {
      const siguiente = new Set(prev)
      for (const k of claves) {
        if (marcar) siguiente.add(k)
        else siguiente.delete(k)
      }
      return siguiente
    })
  }, [])

  const seleccionarCoincidentes = React.useCallback(() => {
    cambiarSeleccion(
      filtrado.coincidentes.map((r) => r.clave),
      true
    )
  }, [cambiarSeleccion, filtrado.coincidentes])

  const ordenarPor = React.useCallback((campo: CampoOrden) => {
    setOrden((o) =>
      o.campo === campo
        ? { campo, direccion: o.direccion === "asc" ? "desc" : "asc" }
        : { campo, direccion: "asc" }
    )
  }, [])

  // ---- Carga en Supabase ---------------------------------------------------
  const verificar = React.useCallback(async (lotes: Lote[]) => {
    const enviados = lotes.filter((l) => l.estado === "ok").flatMap((l) => l.registros)
    if (enviados.length === 0) return
    const t0 = performance.now()
    setCarga((c) =>
      c && {
        ...c,
        verificacion: { estado: "en_curso", comprobadas: enviados.length, encontradas: 0, faltantes: [] },
      }
    )
    try {
      const r = await verificarEnDestino(enviados, consultarClaves)
      setCarga((c) =>
        c && { ...c, verificacion: { ...r, estado: "completada", duracionMs: performance.now() - t0 } }
      )
    } catch (error) {
      setCarga((c) =>
        c && {
          ...c,
          verificacion: {
            estado: "error",
            comprobadas: enviados.length,
            encontradas: 0,
            faltantes: [],
            error: error instanceof Error ? error.message : String(error),
            duracionMs: performance.now() - t0,
          },
        }
      )
    }
  }, [])

  const ejecutar = React.useCallback(
    async (lotes: Lote[], numeros: number[]) => {
      const t0 = performance.now()
      const finales = await ejecutarLotes(lotes, numeros, enviarLote, (ls) =>
        setCarga((c) => c && { ...c, lotes: ls })
      )
      setCarga((c) => c && { ...c, lotes: finales, enCurso: false, duracionMs: performance.now() - t0 })
      await verificar(finales)
    },
    [verificar]
  )

  const subir = React.useCallback(async () => {
    if (cargando.current || extrayendo.current) return
    if (filtrado.aCargar.length === 0 || erroresFiltros.length > 0) return
    cargando.current = true
    try {
      // Copia congelada: cambios posteriores de filtros o selección no la afectan.
      const congelado = filtrado.aCargar.map(aMedicion)
      const lotes = crearLotes(congelado)
      setCarga({ congelado, lotes, enCurso: true })
      await ejecutar(lotes, lotes.map((l) => l.numero))
    } finally {
      cargando.current = false
    }
  }, [ejecutar, erroresFiltros.length, filtrado.aCargar])

  const reintentarLotesFallidos = React.useCallback(async () => {
    if (cargando.current || !carga) return
    const fallidos = carga.lotes.filter((l) => l.estado === "error").map((l) => l.numero)
    if (fallidos.length === 0) return
    cargando.current = true
    try {
      setCarga({ ...carga, enCurso: true, verificacion: undefined })
      await ejecutar(carga.lotes, fallidos)
    } finally {
      cargando.current = false
    }
  }, [carga, ejecutar])

  return {
    extraccion,
    procesado,
    validos,
    filtros,
    setFiltros,
    restablecerFiltros: () => setFiltros(FILTROS_INICIALES),
    erroresFiltros,
    orden,
    setOrden,
    ordenarPor,
    seleccion,
    cambiarSeleccion,
    seleccionarCoincidentes,
    vaciarSeleccion: () => setSeleccion(new Set()),
    filtrado,
    carga,
    supabase,
    comprobarSupabase,
    extraer,
    reintentarCiudad,
    subir,
    reintentarLotesFallidos,
    verificar: () => carga && verificar(carga.lotes),
  }
}

export type PipelineEtl = ReturnType<typeof usePipelineEtl>
