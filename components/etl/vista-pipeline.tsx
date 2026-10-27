"use client"

import { ArrowDownIcon, ArrowRightIcon, RotateCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { resumirLotes } from "@/lib/etl/carga"
import type { EstadoFase } from "@/lib/etl/tipos"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { formatoDuracion, formatoEntero } from "./formato"
import { IndicadorEstado } from "./indicador-estado"

export type Pestana =
  | "json"
  | "transformados"
  | "validos"
  | "rechazados"
  | "carga"
  | "supabase"

type Fase = {
  nombre: string
  estado: EstadoFase
  textoEstado?: string
  entrada: string
  salida: string
  nota?: string
  explicacion: string
  duracion: string
  pestana: Pestana
}

function calcularFases(p: PipelineEtl): Fase[] {
  const { extraccion, procesado, filtrado, carga, erroresFiltros, validos } = p
  const ciudades = extraccion?.ciudades ?? []
  const correctas = ciudades.filter((c) => c.estado === "completada").length
  const fallidas = ciudades.filter((c) => c.estado === "error").length
  const horasRecibidas = procesado?.transformacion.diagnosticos.reduce((s, d) => s + d.horas, 0)
  const problemasTransf = procesado?.transformacion.diagnosticos.filter((d) => d.problemas.length > 0).length ?? 0
  const limpieza = procesado?.limpieza
  const resumenCarga = carga ? resumirLotes(carga.lotes) : null
  const verif = carga?.verificacion

  return [
    {
      nombre: "Extracción",
      estado: !extraccion
        ? "pendiente"
        : extraccion.enCurso
          ? "en_curso"
          : fallidas > 0
            ? "error"
            : "completada",
      entrada: extraccion ? `${ciudades.length} ciudades solicitadas` : "—",
      salida: extraccion
        ? `${correctas} respuestas JSON${horasRecibidas !== undefined ? ` · ${formatoEntero(horasRecibidas)} horas` : ""}`
        : "—",
      nota: fallidas > 0 ? `${fallidas} ciudad(es) con error` : undefined,
      explicacion:
        "Una petición GET por ciudad a la API histórica de Open-Meteo. El JSON recibido se guarda sin modificar.",
      duracion: extraccion?.duracionMs !== undefined
        ? `${formatoDuracion(extraccion.duracionMs)} (${extraccion.ultimaOperacion.toLowerCase()})`
        : "—",
      pestana: "json",
    },
    {
      nombre: "Transformación",
      estado: !procesado ? "pendiente" : problemasTransf > 0 ? "error" : "completada",
      entrada: procesado ? `${procesado.transformacion.diagnosticos.length} respuestas JSON` : "—",
      salida: procesado ? `${formatoEntero(procesado.transformacion.registros.length)} registros` : "—",
      nota: problemasTransf > 0 ? `${problemasTransf} respuesta(s) con problemas estructurales` : undefined,
      explicacion:
        "Los arrays paralelos (time, temperature_2m…) se convierten en un registro por ciudad y hora. Las horas se interpretan explícitamente como UTC.",
      duracion: procesado ? formatoDuracion(procesado.duracionTransformacionMs) : "—",
      pestana: "transformados",
    },
    {
      nombre: "Limpieza",
      estado: !procesado ? "pendiente" : "completada",
      entrada: procesado ? `${formatoEntero(procesado.transformacion.registros.length)} registros` : "—",
      salida: limpieza ? `${formatoEntero(limpieza.validos.length)} válidos` : "—",
      nota: limpieza
        ? `${formatoEntero(limpieza.rechazados.length)} rechazados por calidad (${formatoEntero(limpieza.duplicados)} duplicados)`
        : undefined,
      explicacion:
        "Se validan tipos, nulos y rangos (humedad 0–100 %, precipitación ≥ 0 mm) y se eliminan duplicados por ciudad y hora. Cada rechazo guarda su motivo.",
      duracion: procesado ? formatoDuracion(procesado.duracionLimpiezaMs) : "—",
      pestana: "rechazados",
    },
    {
      nombre: "Filtrado y selección",
      estado:
        validos.length === 0
          ? "pendiente"
          : erroresFiltros.length > 0
            ? "error"
            : filtrado.aCargar.length > 0
              ? "completada"
              : "pendiente",
      textoEstado:
        validos.length > 0 && erroresFiltros.length === 0 && filtrado.aCargar.length === 0
          ? "Sin selección"
          : undefined,
      entrada: procesado ? `${formatoEntero(validos.length)} válidos` : "—",
      salida: procesado ? `${formatoEntero(filtrado.aCargar.length)} seleccionados` : "—",
      nota: procesado
        ? `${formatoEntero(filtrado.coincidentes.length)} coinciden con los filtros${
            filtrado.seleccionadosFuera > 0
              ? ` · ${formatoEntero(filtrado.seleccionadosFuera)} seleccionados fuera de filtro`
              : ""
          }`
        : undefined,
      explicacion:
        "Sobre los válidos: filtros → ordenación → selección manual. Solo se suben las filas seleccionadas que cumplen los filtros actuales.",
      duracion: procesado ? formatoDuracion(filtrado.duracionMs) : "—",
      pestana: "validos",
    },
    {
      nombre: "Carga",
      estado: !carga
        ? "pendiente"
        : carga.enCurso || verif?.estado === "en_curso"
          ? "en_curso"
          : (resumenCarga?.fallidos ?? 0) > 0 || verif?.estado === "error" || (verif?.faltantes.length ?? 0) > 0
            ? "error"
            : "completada",
      entrada: carga ? `${formatoEntero(carga.congelado.length)} registros congelados` : "—",
      salida: resumenCarga
        ? `${formatoEntero(resumenCarga.correctos)} confirmados por Supabase`
        : "—",
      nota: carga
        ? [
            resumenCarga!.fallidos > 0 ? `${formatoEntero(resumenCarga!.fallidos)} fallidos` : null,
            verif?.estado === "completada"
              ? `${formatoEntero(verif.encontradas)} de ${formatoEntero(verif.comprobadas)} verificados en destino`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        : undefined,
      explicacion:
        "Upsert en lotes de hasta 500 registros por (ciudad, fecha_hora), ejecutado en el servidor. Después se comprueba que las claves existen en la tabla.",
      duracion: carga?.duracionMs !== undefined ? formatoDuracion(carga.duracionMs) : "—",
      pestana: "carga",
    },
  ]
}

export function VistaPipeline({
  pipeline,
  alInspeccionar,
}: {
  pipeline: PipelineEtl
  alInspeccionar: (p: Pestana) => void
}) {
  const fases = calcularFases(pipeline)
  const { extraccion } = pipeline

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Pipeline ETL</CardTitle>
        <CardDescription>
          Estados, recuentos y duraciones reales de cada fase. Pulsa «Inspeccionar» para ver
          los datos resultantes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="grid grid-cols-1 gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
          {fases.map((f, i) => (
            <li key={f.nombre} className="relative flex flex-col">
              <section
                aria-label={`Fase ${i + 1}: ${f.nombre}`}
                className="flex h-full flex-col gap-2 rounded-lg border bg-card p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <h3 className="font-medium">
                    <span className="text-muted-foreground">{i + 1}.</span> {f.nombre}
                  </h3>
                  <IndicadorEstado estado={f.estado} texto={f.textoEstado} />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-muted-foreground">Entrada</dt>
                  <dd className="tabular-nums">{f.entrada}</dd>
                  <dt className="text-muted-foreground">Salida</dt>
                  <dd className="font-medium tabular-nums">{f.salida}</dd>
                  <dt className="text-muted-foreground">Duración</dt>
                  <dd className="tabular-nums">{f.duracion}</dd>
                </dl>
                {f.nota && <p className="text-xs text-muted-foreground">{f.nota}</p>}
                <p className="text-xs leading-relaxed text-muted-foreground">{f.explicacion}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto self-start"
                  onClick={() => alInspeccionar(f.pestana)}
                >
                  Inspeccionar
                </Button>
              </section>
              {i < fases.length - 1 && (
                <>
                  <ArrowDownIcon aria-hidden className="mx-auto my-1 size-4 text-muted-foreground lg:hidden" />
                  <ArrowRightIcon
                    aria-hidden
                    className="absolute top-1/2 -right-2.5 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground lg:block"
                  />
                </>
              )}
            </li>
          ))}
        </ol>

        {extraccion && (
          <div className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-medium">
              Progreso de la extracción:{" "}
              <span className="font-normal text-muted-foreground">
                {extraccion.ciudades.filter((c) => c.estado === "completada" || c.estado === "error").length} procesadas ·{" "}
                {extraccion.ciudades.filter((c) => c.estado === "pendiente" || c.estado === "en_curso").length} pendientes
              </span>
            </h3>
            <ul className="flex flex-col gap-1.5" aria-live="polite">
              {extraccion.ciudades.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-20 font-medium">{c.nombre}</span>
                  <IndicadorEstado
                    estado={c.estado}
                    texto={
                      c.estado === "completada"
                        ? "Descargada"
                        : c.estado === "error"
                          ? "Error"
                          : c.estado === "en_curso"
                            ? "Descargando"
                            : "Pendiente"
                    }
                  />
                  {c.duracionMs !== undefined && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatoDuracion(c.duracionMs)}
                      {c.intentos > 1 ? ` · intento ${c.intentos}` : ""}
                    </span>
                  )}
                  {c.estado === "error" && (
                    <>
                      <span className="text-xs text-destructive">{c.error}</span>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={extraccion.enCurso}
                        onClick={() => pipeline.reintentarCiudad(c.id)}
                      >
                        <RotateCwIcon data-icon="inline-start" />
                        Reintentar {c.nombre}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
