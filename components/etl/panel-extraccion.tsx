"use client"

import * as React from "react"
import { CloudDownloadIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CIUDADES } from "@/lib/etl/ciudades"
import {
  diasEnIntervalo,
  MAX_DIAS_EXTRACCION,
  validarConfiguracion,
  type ConfiguracionExtraccion,
} from "@/lib/etl/extraccion"
import { formatoEntero } from "./formato"

const CONFIGURACION_INICIAL: ConfiguracionExtraccion = {
  ciudades: CIUDADES.map((c) => c.id),
  fechaInicio: "2026-09-01",
  fechaFin: "2026-09-30",
}

export function PanelExtraccion({
  ocupado,
  alExtraer,
}: {
  ocupado: boolean
  alExtraer: (config: ConfiguracionExtraccion) => void
}) {
  const [config, setConfig] = React.useState(CONFIGURACION_INICIAL)
  const [intentado, setIntentado] = React.useState(false)
  const errores = validarConfiguracion(config)
  const dias = diasEnIntervalo(config.fechaInicio, config.fechaFin)
  const idErrores = React.useId()

  const alternarCiudad = (id: string, marcada: boolean) =>
    setConfig((c) => ({
      ...c,
      ciudades: marcada ? [...c.ciudades, id] : c.ciudades.filter((x) => x !== id),
    }))

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    setIntentado(true)
    if (errores.length === 0 && !ocupado) alExtraer(config)
  }

  const mostrarErrores = errores.length > 0 && (intentado || dias === null || (dias ?? 0) > MAX_DIAS_EXTRACCION)

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Configuración de la extracción</CardTitle>
        <CardDescription>
          API histórica de Open-Meteo · variables horarias de temperatura (°C), humedad
          relativa (%) y precipitación (mm) · horas en UTC.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Ciudades</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {CIUDADES.map((c) => (
                <Label key={c.id} className="font-normal">
                  <Checkbox
                    checked={config.ciudades.includes(c.id)}
                    onCheckedChange={(v) => alternarCiudad(c.id, v)}
                    disabled={ocupado}
                  />
                  {c.nombre}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({c.latitud}, {c.longitud})
                  </span>
                </Label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-inicio">Fecha inicial (UTC)</Label>
              <Input
                id="fecha-inicio"
                type="date"
                className="w-44"
                value={config.fechaInicio}
                disabled={ocupado}
                aria-describedby={mostrarErrores ? idErrores : undefined}
                onChange={(e) => setConfig((c) => ({ ...c, fechaInicio: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-fin">Fecha final (UTC, incluida)</Label>
              <Input
                id="fecha-fin"
                type="date"
                className="w-44"
                value={config.fechaFin}
                disabled={ocupado}
                aria-describedby={mostrarErrores ? idErrores : undefined}
                onChange={(e) => setConfig((c) => ({ ...c, fechaFin: e.target.value }))}
              />
            </div>

            <div className="min-w-56 flex-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">Volumen previsto</p>
              {dias !== null && config.ciudades.length > 0 ? (
                <p className="text-muted-foreground">
                  {config.ciudades.length} ciudades × {dias} días × 24 horas ={" "}
                  <strong className="text-foreground tabular-nums">
                    {formatoEntero(config.ciudades.length * dias * 24)} registros
                  </strong>{" "}
                  · {config.ciudades.length} peticiones (una por ciudad)
                </p>
              ) : (
                <p className="text-muted-foreground">Completa ciudades y fechas válidas.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Máximo {MAX_DIAS_EXTRACCION} días por extracción. Los últimos días pueden
                llegar incompletos (null) porque el reanálisis tiene unos días de retraso.
              </p>
            </div>

            <Button type="submit" size="lg" disabled={ocupado}>
              <CloudDownloadIcon data-icon="inline-start" />
              {ocupado ? "Extrayendo…" : "Extraer datos"}
            </Button>
          </div>

          {mostrarErrores && (
            <Alert variant="destructive" id={idErrores} role="alert">
              <AlertTitle>Revisa la configuración</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {errores.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
