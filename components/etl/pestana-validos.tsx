"use client"

import { CheckSquareIcon, FilterXIcon, SquareIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import type { Filtros } from "@/lib/etl/filtros"
import type { CampoOrden, RegistroValido } from "@/lib/etl/tipos"
import { formatoDecimal, formatoEntero, formatoFechaUtc } from "./formato"
import { TablaPaginada, type Columna } from "./tabla-paginada"

export const ETIQUETAS_CAMPO: Record<CampoOrden, string> = {
  ciudad: "Ciudad",
  fecha_hora: "Fecha y hora (UTC)",
  temperatura_c: "Temperatura (°C)",
  humedad_pct: "Humedad (%)",
  precipitacion_mm: "Precipitación (mm)",
}

export const columnasMedicion: Columna<RegistroValido>[] = [
  { id: "ciudad", encabezado: ETIQUETAS_CAMPO.ciudad, campoOrden: "ciudad", celda: (r) => r.ciudad },
  {
    id: "fecha",
    encabezado: ETIQUETAS_CAMPO.fecha_hora,
    campoOrden: "fecha_hora",
    celda: (r) => <span className="tabular-nums">{formatoFechaUtc(r.fecha_hora)}</span>,
  },
  {
    id: "temp",
    encabezado: ETIQUETAS_CAMPO.temperatura_c,
    campoOrden: "temperatura_c",
    className: "text-right",
    celda: (r) => <span className="tabular-nums">{formatoDecimal(r.temperatura_c)}</span>,
  },
  {
    id: "hum",
    encabezado: ETIQUETAS_CAMPO.humedad_pct,
    campoOrden: "humedad_pct",
    className: "text-right",
    celda: (r) => <span className="tabular-nums">{formatoDecimal(r.humedad_pct)}</span>,
  },
  {
    id: "prec",
    encabezado: ETIQUETAS_CAMPO.precipitacion_mm,
    campoOrden: "precipitacion_mm",
    className: "text-right",
    celda: (r) => <span className="tabular-nums">{formatoDecimal(r.precipitacion_mm)}</span>,
  },
]

const selectClase =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function CampoTexto({
  id,
  etiqueta,
  valor,
  alCambiar,
  tipo = "number",
  paso,
}: {
  id: string
  etiqueta: string
  valor: string
  alCambiar: (v: string) => void
  tipo?: "number" | "datetime-local"
  paso?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {etiqueta}
      </Label>
      <Input
        id={id}
        type={tipo}
        step={paso}
        inputMode={tipo === "number" ? "decimal" : undefined}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
      />
    </div>
  )
}

export function PestanaValidos({ pipeline }: { pipeline: PipelineEtl }) {
  const {
    validos,
    filtros,
    setFiltros,
    restablecerFiltros,
    erroresFiltros,
    orden,
    setOrden,
    ordenarPor,
    seleccion,
    cambiarSeleccion,
    seleccionarCoincidentes,
    vaciarSeleccion,
    filtrado,
  } = pipeline

  if (validos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay registros válidos todavía. Extrae datos para empezar.
      </p>
    )
  }

  const ciudadesDisponibles = [...new Set(validos.map((r) => r.ciudad))]
  const cambiar = <K extends keyof Filtros>(k: K, v: Filtros[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }))
  const coincidentesSinSeleccionar = filtrado.coincidentes.length - filtrado.aCargar.length

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="titulo-filtros" className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="titulo-filtros" className="font-medium">
            Filtros y orden
          </h3>
          <Button variant="ghost" size="sm" onClick={restablecerFiltros}>
            <FilterXIcon data-icon="inline-start" />
            Restablecer filtros
          </Button>
        </div>

        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <legend className="mb-1 text-xs font-medium">
            Ciudades <span className="font-normal text-muted-foreground">(ninguna marcada = todas)</span>
          </legend>
          {ciudadesDisponibles.map((c) => (
            <Label key={c} className="font-normal">
              <Checkbox
                checked={filtros.ciudades.includes(c)}
                onCheckedChange={(v) =>
                  cambiar("ciudades", v ? [...filtros.ciudades, c] : filtros.ciudades.filter((x) => x !== c))
                }
              />
              {c}
            </Label>
          ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <div className="col-span-2">
            <CampoTexto id="f-desde" etiqueta="Desde (UTC)" tipo="datetime-local" valor={filtros.desde} alCambiar={(v) => cambiar("desde", v)} />
          </div>
          <div className="col-span-2">
            <CampoTexto id="f-hasta" etiqueta="Hasta (UTC, incluida)" tipo="datetime-local" valor={filtros.hasta} alCambiar={(v) => cambiar("hasta", v)} />
          </div>
          <CampoTexto id="f-tmin" etiqueta="Temp. mín. (°C)" paso="0.1" valor={filtros.tempMin} alCambiar={(v) => cambiar("tempMin", v)} />
          <CampoTexto id="f-tmax" etiqueta="Temp. máx. (°C)" paso="0.1" valor={filtros.tempMax} alCambiar={(v) => cambiar("tempMax", v)} />
          <CampoTexto id="f-hmin" etiqueta="Humedad mín. (%)" valor={filtros.humMin} alCambiar={(v) => cambiar("humMin", v)} />
          <CampoTexto id="f-hmax" etiqueta="Humedad máx. (%)" valor={filtros.humMax} alCambiar={(v) => cambiar("humMax", v)} />
          <CampoTexto id="f-pmin" etiqueta="Precip. mín. (mm)" paso="0.1" valor={filtros.precMin} alCambiar={(v) => cambiar("precMin", v)} />
          <CampoTexto id="f-pmax" etiqueta="Precip. máx. (mm)" paso="0.1" valor={filtros.precMax} alCambiar={(v) => cambiar("precMax", v)} />
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="f-orden" className="text-xs">
              Ordenar por
            </Label>
            <div className="flex gap-2">
              <select
                id="f-orden"
                className={`${selectClase} min-w-0 flex-1`}
                value={orden.campo}
                onChange={(e) => setOrden({ ...orden, campo: e.target.value as CampoOrden })}
              >
                {Object.entries(ETIQUETAS_CAMPO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                aria-label="Dirección del orden"
                className={selectClase}
                value={orden.direccion}
                onChange={(e) => setOrden({ ...orden, direccion: e.target.value as "asc" | "desc" })}
              >
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </select>
            </div>
          </div>
          <Label className="col-span-2 self-end pb-2 font-normal">
            <Checkbox checked={filtros.soloLluvia} onCheckedChange={(v) => cambiar("soloLluvia", v)} />
            Solo registros con lluvia (precipitación &gt; 0 mm)
          </Label>
        </div>

        {erroresFiltros.length > 0 && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Filtros no válidos</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {erroresFiltros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              La carga está bloqueada hasta corregirlos.
            </AlertDescription>
          </Alert>
        )}
      </section>

      <section aria-labelledby="titulo-seleccion" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="titulo-seleccion" className="font-medium">
            {formatoEntero(filtrado.coincidentes.length)} coinciden con los filtros ·{" "}
            {formatoEntero(filtrado.aCargar.length)} seleccionados para cargar
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={coincidentesSinSeleccionar === 0}
              onClick={seleccionarCoincidentes}
            >
              <CheckSquareIcon data-icon="inline-start" />
              Seleccionar las {formatoEntero(filtrado.coincidentes.length)} que cumplen los filtros
            </Button>
            <Button size="sm" variant="outline" disabled={seleccion.size === 0} onClick={vaciarSeleccion}>
              <SquareIcon data-icon="inline-start" />
              Vaciar selección ({formatoEntero(seleccion.size)})
            </Button>
          </div>
        </div>
        {filtrado.seleccionadosFuera > 0 && (
          <Alert>
            <AlertTitle>
              {formatoEntero(filtrado.seleccionadosFuera)} filas seleccionadas quedan fuera de los filtros
            </AlertTitle>
            <AlertDescription>
              Siguen marcadas, pero no se subirán mientras no cumplan los filtros actuales. Cambiar
              los filtros nunca selecciona filas nuevas automáticamente.
            </AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Orden de operaciones: válidos → filtros → ordenación → selección. La paginación solo
          afecta a lo que ves; el encabezado de casillas marca la página visible.
        </p>
        <TablaPaginada
          etiqueta="Registros válidos que coinciden con los filtros"
          filas={filtrado.coincidentes}
          columnas={columnasMedicion}
          claveFila={(r) => r.clave}
          seleccion={{ seleccionadas: seleccion, cambiar: cambiarSeleccion }}
          orden={orden}
          alOrdenar={ordenarPor}
          reinicio={JSON.stringify([filtros, orden])}
          vacio="Ningún registro válido cumple los filtros actuales."
        />
      </section>
    </div>
  )
}
