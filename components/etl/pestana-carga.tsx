"use client"

import { DatabaseIcon, RotateCwIcon, SearchCheckIcon, UploadCloudIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { resumirLotes, TAMANO_LOTE, type EstadoLote } from "@/lib/etl/carga"
import type { EstadoFase, Medicion, RegistroValido } from "@/lib/etl/tipos"
import { formatoDecimal, formatoDuracion, formatoEntero, formatoFechaUtc } from "./formato"
import { IndicadorEstado } from "./indicador-estado"
import { TablaPaginada, type Columna } from "./tabla-paginada"

const ESTADO_LOTE: Record<EstadoLote, { fase: EstadoFase; texto: string }> = {
  pendiente: { fase: "pendiente", texto: "Pendiente" },
  enviando: { fase: "en_curso", texto: "Enviando" },
  ok: { fase: "completada", texto: "Correcto" },
  error: { fase: "error", texto: "Fallido" },
}

function columnasConPosicion<T extends Medicion>(): Columna<T>[] {
  return [
    { id: "pos", encabezado: "#", className: "text-right", celda: (_, i) => <span className="tabular-nums">{i + 1}</span> },
    {
      id: "lote",
      encabezado: "Lote",
      className: "text-right",
      celda: (_, i) => <span className="tabular-nums">{Math.floor(i / TAMANO_LOTE) + 1}</span>,
    },
    { id: "ciudad", encabezado: "Ciudad", celda: (r) => r.ciudad },
    { id: "fecha", encabezado: "Fecha y hora (UTC)", celda: (r) => <span className="tabular-nums">{formatoFechaUtc(r.fecha_hora)}</span> },
    { id: "temp", encabezado: "Temperatura (°C)", className: "text-right", celda: (r) => <span className="tabular-nums">{formatoDecimal(r.temperatura_c)}</span> },
    { id: "hum", encabezado: "Humedad (%)", className: "text-right", celda: (r) => <span className="tabular-nums">{formatoDecimal(r.humedad_pct)}</span> },
    { id: "prec", encabezado: "Precipitación (mm)", className: "text-right", celda: (r) => <span className="tabular-nums">{formatoDecimal(r.precipitacion_mm)}</span> },
  ]
}

export function PestanaCarga({ pipeline }: { pipeline: PipelineEtl }) {
  const { filtrado, erroresFiltros, carga, supabase, extraccion, orden } = pipeline
  const n = filtrado.aCargar.length
  const motivoBloqueo =
    n === 0
      ? "Selecciona en «Registros válidos» las filas que quieres subir."
      : erroresFiltros.length > 0
        ? "Corrige los filtros no válidos."
        : carga?.enCurso
          ? "Hay una carga en curso."
          : extraccion?.enCurso
            ? "Hay una extracción en curso."
            : supabase.configurado === false
              ? "Supabase no está configurado en el servidor (ver README)."
              : null
  const resumen = carga ? resumirLotes(carga.lotes) : null
  const fallidos = carga?.lotes.filter((l) => l.estado === "error").length ?? 0
  const verif = carga?.verificacion

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="titulo-vista-previa" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="titulo-vista-previa" className="font-medium">
              Vista previa: {formatoEntero(n)} registros en {Math.ceil(n / TAMANO_LOTE)} lote(s)
            </h3>
            <p className="text-xs text-muted-foreground">
              Datos locales pendientes de subir. Es exactamente el conjunto que se enviará, en el
              orden elegido ({orden.campo}, {orden.direccion === "asc" ? "ascendente" : "descendente"}).
            </p>
          </div>
          <Button size="lg" disabled={motivoBloqueo !== null} onClick={pipeline.subir}>
            <UploadCloudIcon data-icon="inline-start" />
            Subir {formatoEntero(n)} registros a Supabase
          </Button>
        </div>
        {motivoBloqueo && <p className="text-sm text-muted-foreground">{motivoBloqueo}</p>}
        <Alert>
          <DatabaseIcon />
          <AlertTitle>El orden no se guarda en la tabla</AlertTitle>
          <AlertDescription>
            Los lotes se envían en este orden, pero una base de datos relacional no conserva el
            orden de inserción: para leer los datos ordenados, las consultas deben usar{" "}
            <code>ORDER BY</code> (por ejemplo, <code>ORDER BY fecha_hora, ciudad</code>).
          </AlertDescription>
        </Alert>
        <TablaPaginada<RegistroValido>
          etiqueta="Vista previa de la carga"
          filas={filtrado.aCargar}
          columnas={columnasConPosicion<RegistroValido>()}
          claveFila={(r) => r.clave}
          vacio="No hay filas seleccionadas que cumplan los filtros."
        />
      </section>

      {carga && resumen && (
        <section aria-labelledby="titulo-informe" className="flex flex-col gap-3 rounded-lg border p-3">
          <h3 id="titulo-informe" className="font-medium">
            Informe de la carga ({formatoEntero(carga.congelado.length)} registros congelados al pulsar el botón)
          </h3>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-live="polite">
            <div className="rounded-md bg-muted/50 p-2">
              <dt className="text-xs text-muted-foreground">Procesados correctamente</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatoEntero(resumen.correctos)}</dd>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <dt className="text-xs text-muted-foreground">Fallidos</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatoEntero(resumen.fallidos)}</dd>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <dt className="text-xs text-muted-foreground">Pendientes</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatoEntero(resumen.pendientes)}</dd>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <dt className="text-xs text-muted-foreground">Verificados en destino</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {verif?.estado === "completada"
                  ? `${formatoEntero(verif.encontradas)} / ${formatoEntero(verif.comprobadas)}`
                  : verif?.estado === "en_curso"
                    ? "Comprobando…"
                    : "—"}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            «Correctos» son registros que Supabase aceptó en un upsert. Un upsert no indica cuántas
            filas eran nuevas y cuántas se actualizaron, así que no se muestra esa división.
          </p>

          <div className="rounded-lg border">
            <Table aria-label="Estado por lote">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Posiciones</TableHead>
                  <TableHead className="text-right">Registros</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Filas afectadas (Supabase)</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carga.lotes.map((l) => (
                  <TableRow key={l.numero}>
                    <TableCell className="tabular-nums">{l.numero}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatoEntero(l.desde + 1)}–{formatoEntero(l.hasta + 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatoEntero(l.registros.length)}</TableCell>
                    <TableCell>
                      <IndicadorEstado estado={ESTADO_LOTE[l.estado].fase} texto={ESTADO_LOTE[l.estado].texto} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.filasAfectadas === undefined ? "—" : l.filasAfectadas === null ? "no informado" : formatoEntero(l.filasAfectadas)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatoDuracion(l.duracionMs)}</TableCell>
                    <TableCell className="max-w-md text-xs whitespace-normal text-destructive">{l.mensaje}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={fallidos === 0 || carga.enCurso}
              onClick={pipeline.reintentarLotesFallidos}
            >
              <RotateCwIcon data-icon="inline-start" />
              Reintentar lotes fallidos ({fallidos})
            </Button>
            <Button
              variant="outline"
              disabled={carga.enCurso || resumen.correctos === 0 || verif?.estado === "en_curso"}
              onClick={() => void pipeline.verificar()}
            >
              <SearchCheckIcon data-icon="inline-start" />
              Volver a verificar en destino
            </Button>
          </div>

          {verif?.estado === "error" && (
            <Alert variant="destructive">
              <AlertTitle>No se pudo verificar</AlertTitle>
              <AlertDescription>{verif.error}</AlertDescription>
            </Alert>
          )}
          {verif?.estado === "completada" && verif.faltantes.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{formatoEntero(verif.faltantes.length)} claves enviadas no aparecen en destino</AlertTitle>
              <AlertDescription>
                {verif.faltantes
                  .slice(0, 10)
                  .map((c) => `${c.ciudad} ${formatoFechaUtc(c.fecha_hora)}`)
                  .join(" · ")}
                {verif.faltantes.length > 10 && " …"}
              </AlertDescription>
            </Alert>
          )}
          {verif?.estado === "completada" && verif.faltantes.length === 0 && (
            <p className="text-sm">
              ✓ Las {formatoEntero(verif.encontradas)} claves (ciudad, fecha_hora) enviadas en lotes
              correctos existen en la tabla ({formatoDuracion(verif.duracionMs)}).
            </p>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Ver el conjunto congelado enviado en esta carga
            </summary>
            <div className="mt-2">
              <TablaPaginada<Medicion>
                etiqueta="Conjunto congelado de la carga"
                filas={carga.congelado}
                columnas={columnasConPosicion<Medicion>()}
                claveFila={(r) => `${r.ciudad}|${r.fecha_hora}`}
                vacio="Vacío."
                tamanoInicial={10}
              />
            </div>
          </details>
        </section>
      )}
    </div>
  )
}
