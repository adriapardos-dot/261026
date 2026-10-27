"use client"

import * as React from "react"
import type { Map as MapaMaplibre, Marker } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { CIUDADES } from "@/lib/etl/ciudades"
import type { EstadoFase } from "@/lib/etl/tipos"
import { formatoEntero } from "./formato"

// Las claves de MapTiler son públicas por diseño (se usan en el navegador).
// Restríngela por dominio en cloud.maptiler.com → Account → Keys.
const CLAVE_MAPTILER = process.env.NEXT_PUBLIC_MAPTILER_KEY
const ESTILO = `https://api.maptiler.com/maps/ocean-v4/style.json?key=${CLAVE_MAPTILER}`
const LIMITES_ESPANA: [[number, number], [number, number]] = [
  [-9.8, 35.6],
  [4.6, 44.0],
]

const COLOR_ESTADO: Record<EstadoFase | "sin_seleccionar", string> = {
  sin_seleccionar: "#94a3b8",
  pendiente: "#64748b",
  en_curso: "#2563eb",
  completada: "#16a34a",
  error: "#dc2626",
}

const TEXTO_ESTADO: Record<EstadoFase | "sin_seleccionar", string> = {
  sin_seleccionar: "No extraída",
  pendiente: "Pendiente",
  en_curso: "Descargando…",
  completada: "Extraída",
  error: "Error",
}

type Resumen = {
  estado: EstadoFase | "sin_seleccionar"
  validos: number
  tempMedia: number | null
  lluviaTotal: number
}

const formatoDecimal = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function contenidoMarcador(nombre: string, r: Resumen) {
  const raiz = document.createElement("div")
  raiz.className = "flex flex-col items-center gap-0.5"
  const punto = document.createElement("span")
  punto.className = "block size-4 rounded-full border-2 border-white shadow"
  punto.style.background = COLOR_ESTADO[r.estado]
  const etiqueta = document.createElement("span")
  etiqueta.className =
    "rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-slate-900 shadow-sm"
  etiqueta.textContent =
    r.tempMedia === null ? nombre : `${nombre} · ${formatoDecimal(r.tempMedia)} °C`
  raiz.append(punto, etiqueta)
  raiz.title = [
    `${nombre}: ${TEXTO_ESTADO[r.estado]}`,
    `${formatoEntero(r.validos)} registros válidos`,
    r.tempMedia === null ? null : `Temperatura media ${formatoDecimal(r.tempMedia)} °C`,
    r.validos > 0 ? `Precipitación total ${formatoDecimal(r.lluviaTotal)} mm` : null,
  ]
    .filter(Boolean)
    .join("\n")
  return raiz
}

export function MapaCiudades({ pipeline }: { pipeline: PipelineEtl }) {
  const contenedor = React.useRef<HTMLDivElement>(null)
  const mapa = React.useRef<MapaMaplibre | null>(null)
  const marcadores = React.useRef(new Map<string, Marker>())
  const [listo, setListo] = React.useState(false)
  const [errorMapa, setErrorMapa] = React.useState<string | null>(null)
  const { extraccion, validos } = pipeline

  const resumenes = React.useMemo(() => {
    const porCiudad = new Map<string, Resumen>()
    for (const c of CIUDADES) {
      const estado = extraccion?.ciudades.find((e) => e.id === c.id)?.estado ?? "sin_seleccionar"
      porCiudad.set(c.nombre, { estado, validos: 0, tempMedia: null, lluviaTotal: 0 })
    }
    const sumas = new Map<string, number>()
    for (const v of validos) {
      const r = porCiudad.get(v.ciudad)
      if (!r) continue
      r.validos++
      r.lluviaTotal += v.precipitacion_mm
      sumas.set(v.ciudad, (sumas.get(v.ciudad) ?? 0) + v.temperatura_c)
    }
    for (const [nombre, r] of porCiudad) {
      if (r.validos > 0) r.tempMedia = (sumas.get(nombre) ?? 0) / r.validos
    }
    return porCiudad
  }, [extraccion, validos])

  // Crea el mapa una sola vez (maplibre-gl solo funciona en el navegador).
  React.useEffect(() => {
    if (!CLAVE_MAPTILER || !contenedor.current) return
    let cancelado = false
    const lista = marcadores.current
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelado || !contenedor.current) return
      const m = new maplibregl.Map({
        container: contenedor.current,
        style: ESTILO,
        bounds: LIMITES_ESPANA,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
        cooperativeGestures: true,
      })
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
      m.on("error", (e) => {
        if (/401|403|key/i.test(e.error?.message ?? ""))
          setErrorMapa("MapTiler ha rechazado la clave. Revisa NEXT_PUBLIC_MAPTILER_KEY.")
      })
      for (const c of CIUDADES) {
        lista.set(
          c.nombre,
          new maplibregl.Marker({ element: document.createElement("div"), anchor: "top" })
            .setLngLat([c.longitud, c.latitud])
            .addTo(m)
        )
      }
      mapa.current = m
      setListo(true)
    })
    return () => {
      cancelado = true
      mapa.current?.remove()
      mapa.current = null
      lista.clear()
    }
  }, [])

  // Actualiza los marcadores con el estado de extracción y los datos válidos.
  React.useEffect(() => {
    if (!listo) return
    for (const [nombre, marcador] of marcadores.current) {
      const r = resumenes.get(nombre)
      if (r) marcador.getElement().replaceChildren(contenidoMarcador(nombre, r))
    }
  }, [listo, resumenes])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapa de las ciudades</CardTitle>
        <CardDescription>
          Estado de la extracción por ciudad y temperatura media de sus registros válidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {CLAVE_MAPTILER ? (
          <div
            ref={contenedor}
            className="h-80 w-full overflow-hidden rounded-lg border sm:h-96"
            role="region"
            aria-label="Mapa de España con las ciudades de la extracción"
          />
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Para ver el mapa, define <code>NEXT_PUBLIC_MAPTILER_KEY</code> en{" "}
            <code>.env.local</code> con tu clave de MapTiler (cloud.maptiler.com → Account → Keys)
            y reinicia <code>npm run dev</code>.
          </p>
        )}
        {errorMapa && <p className="text-sm text-destructive">{errorMapa}</p>}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda">
          {(Object.keys(TEXTO_ESTADO) as (keyof typeof TEXTO_ESTADO)[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: COLOR_ESTADO[k] }} />
              {TEXTO_ESTADO[k]}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
