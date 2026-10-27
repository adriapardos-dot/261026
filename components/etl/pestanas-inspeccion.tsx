"use client"

import * as React from "react"
import { DownloadIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Extraccion, Procesado } from "@/hooks/use-pipeline-etl"
import type { RegistroRechazado, RegistroTransformado } from "@/lib/etl/tipos"
import { cn } from "@/lib/utils"
import {
  descargarJson,
  formatoCrudo,
  formatoDecimal,
  formatoEntero,
  formatoFechaUtc,
} from "./formato"
import { CeldaNumero, TablaPaginada, type Columna } from "./tabla-paginada"

function SinDatos({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}

/** JSON con arrays de valores en una sola línea, para no generar miles de líneas. */
function jsonCompacto(valor: unknown, sangria = ""): string {
  if (Array.isArray(valor)) {
    if (valor.every((v) => v === null || typeof v !== "object")) {
      return `[${valor.map((v) => JSON.stringify(v)).join(", ")}]`
    }
    return `[\n${valor.map((v) => sangria + "  " + jsonCompacto(v, sangria + "  ")).join(",\n")}\n${sangria}]`
  }
  if (valor && typeof valor === "object") {
    const lineas = Object.entries(valor).map(
      ([k, v]) => `${sangria}  ${JSON.stringify(k)}: ${jsonCompacto(v, sangria + "  ")}`
    )
    return `{\n${lineas.join(",\n")}\n${sangria}}`
  }
  return JSON.stringify(valor)
}

export function PestanaJson({ extraccion }: { extraccion: Extraccion | null }) {
  const disponibles = extraccion?.ciudades.filter((c) => c.respuesta) ?? []
  const [elegida, setElegida] = React.useState<string | null>(null)
  const actual = disponibles.find((c) => c.id === elegida) ?? disponibles[0]

  if (!extraccion) return <SinDatos>Aún no se ha extraído ningún dato.</SinDatos>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Ciudad:</span>
        {extraccion.ciudades.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={actual?.id === c.id ? "default" : "outline"}
            aria-pressed={actual?.id === c.id}
            disabled={!c.respuesta}
            onClick={() => setElegida(c.id)}
          >
            {c.nombre}
            {!c.respuesta && (c.estado === "error" ? " (error)" : " (pendiente)")}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!actual}
            onClick={() =>
              actual &&
              descargarJson(
                `open-meteo_${actual.id}_${extraccion.fechaInicio}_${extraccion.fechaFin}.json`,
                actual.respuesta
              )
            }
          >
            <DownloadIcon data-icon="inline-start" />
            Descargar esta ciudad
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disponibles.length === 0}
            onClick={() =>
              descargarJson(
                `open-meteo_${extraccion.fechaInicio}_${extraccion.fechaFin}.json`,
                Object.fromEntries(disponibles.map((c) => [c.nombre, c.respuesta]))
              )
            }
          >
            <DownloadIcon data-icon="inline-start" />
            Descargar todas
          </Button>
        </div>
      </div>
      {actual ? (
        <>
          <p className="text-xs break-all text-muted-foreground">
            Petición: <code>{actual.url}</code>
          </p>
          <pre
            tabIndex={0}
            aria-label={`JSON original de ${actual.nombre}`}
            className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap"
          >
            {jsonCompacto(actual.respuesta)}
          </pre>
        </>
      ) : (
        <SinDatos>Ninguna ciudad tiene respuesta todavía.</SinDatos>
      )}
    </div>
  )
}

const columnasTransformados: Columna<RegistroTransformado>[] = [
  { id: "origen", encabezado: "Origen (ciudad#índice)", celda: (r) => <code className="text-xs">{r.id}</code> },
  { id: "ciudad", encabezado: "ciudad", celda: (r) => r.ciudad ?? <span className="text-destructive italic">null</span> },
  {
    id: "time",
    encabezado: "time recibido",
    celda: (r) => <code className="text-xs">{formatoCrudo(r.crudo.time)}</code>,
  },
  {
    id: "fecha",
    encabezado: "fecha_hora (UTC)",
    celda: (r) =>
      r.fecha_hora ? formatoFechaUtc(r.fecha_hora) : <span className="text-destructive italic">no válida</span>,
  },
  {
    id: "temp",
    encabezado: "temperatura_c (°C)",
    className: "text-right",
    celda: (r) => <CeldaNumero valor={r.temperatura_c} formato={formatoDecimal} />,
  },
  {
    id: "hum",
    encabezado: "humedad_pct (%)",
    className: "text-right",
    celda: (r) => <CeldaNumero valor={r.humedad_pct} formato={formatoDecimal} />,
  },
  {
    id: "prec",
    encabezado: "precipitacion_mm (mm)",
    className: "text-right",
    celda: (r) => <CeldaNumero valor={r.precipitacion_mm} formato={formatoDecimal} />,
  },
]

export function PestanaTransformados({ procesado }: { procesado: Procesado | null }) {
  if (!procesado) return <SinDatos>La transformación se ejecuta al terminar la extracción.</SinDatos>
  const { diagnosticos, registros } = procesado.transformacion
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Cada posición <em>i</em> de los arrays paralelos genera un registro. Los valores no
        numéricos se muestran como <span className="text-destructive italic">null</span>{" "}
        (nunca como 0) y se rechazarán en la limpieza.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {diagnosticos.map((d) => (
          <li
            key={d.origen}
            className={cn(
              "rounded-lg border p-2 text-xs",
              d.problemas.length > 0 && "border-destructive/40 bg-destructive/5"
            )}
          >
            <p className="font-medium">
              {d.ciudad} · {formatoEntero(d.horas)} horas ·{" "}
              {d.problemas.length === 0 ? "arrays coherentes ✓" : "⚠ problemas estructurales"}
            </p>
            <p className="text-muted-foreground">
              Longitudes:{" "}
              {Object.entries(d.longitudes)
                .map(([k, n]) => `${k}=${n ?? "ausente"}`)
                .join(" · ")}
            </p>
            {d.problemas.map((p) => (
              <p key={p} className="text-destructive">
                {p}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <TablaPaginada
        etiqueta="Registros transformados"
        filas={registros}
        columnas={columnasTransformados}
        claveFila={(r) => r.id}
        vacio="No hay registros transformados."
      />
    </div>
  )
}

const columnasRechazados: Columna<RegistroRechazado>[] = [
  { id: "origen", encabezado: "Origen", celda: (r) => <code className="text-xs">{r.id}</code> },
  { id: "ciudad", encabezado: "ciudad", celda: (r) => r.ciudad ?? <span className="italic">null</span> },
  { id: "time", encabezado: "time recibido", celda: (r) => <code className="text-xs">{formatoCrudo(r.crudo.time)}</code> },
  {
    id: "temp",
    encabezado: "temperature_2m (°C)",
    className: "text-right",
    celda: (r) => <code className="text-xs">{formatoCrudo(r.crudo.temperature_2m)}</code>,
  },
  {
    id: "hum",
    encabezado: "relative_humidity_2m (%)",
    className: "text-right",
    celda: (r) => <code className="text-xs">{formatoCrudo(r.crudo.relative_humidity_2m)}</code>,
  },
  {
    id: "prec",
    encabezado: "precipitation (mm)",
    className: "text-right",
    celda: (r) => <code className="text-xs">{formatoCrudo(r.crudo.precipitation)}</code>,
  },
  {
    id: "motivo",
    encabezado: "Motivo del rechazo",
    className: "min-w-64 whitespace-normal",
    celda: (r) => (
      <ul className="flex flex-col gap-0.5">
        {r.motivos.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    ),
  },
]

export function PestanaRechazados({
  procesado,
  excluidosPorFiltro,
}: {
  procesado: Procesado | null
  excluidosPorFiltro: number
}) {
  if (!procesado) return <SinDatos>La limpieza se ejecuta al terminar la extracción.</SinDatos>
  const { rechazados, duplicados } = procesado.limpieza
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="destructive">
          {formatoEntero(rechazados.length)} rechazados por calidad
        </Badge>
        <Badge variant="outline">{formatoEntero(duplicados)} de ellos son duplicados</Badge>
        <Badge variant="secondary">
          {formatoEntero(excluidosPorFiltro)} válidos excluidos por filtros (no son rechazos)
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Un rechazo de calidad es un dato que no puede guardarse (nulo, tipo incorrecto, fuera de
        rango o duplicado). Duplicados: se conserva la <strong>primera aparición válida</strong>{" "}
        de cada (ciudad, fecha_hora) en el orden de llegada. Las temperaturas extremas no se
        descartan. Los excluidos por filtros son válidos y siguen en la pestaña «Registros
        válidos».
      </p>
      <TablaPaginada
        etiqueta="Registros rechazados y motivo"
        filas={rechazados}
        columnas={columnasRechazados}
        claveFila={(r) => r.id}
        vacio="No hay registros rechazados: todos los datos recibidos superaron la limpieza."
      />
    </div>
  )
}
