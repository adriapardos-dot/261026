"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, DatabaseIcon, RefreshCwIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EstadoSupabase } from "@/hooks/use-pipeline-etl"
import { CIUDADES } from "@/lib/etl/ciudades"
import { formatoDecimal, formatoEntero, formatoFechaUtc } from "./formato"

type Fila = {
  id: number
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
  importado_en: string
}

type Consulta = {
  ciudad: string
  desde: string
  hasta: string
  orden: string
  dir: "asc" | "desc"
  pagina: number
  tamano: number
}

const CONSULTA_INICIAL: Consulta = {
  ciudad: "",
  desde: "",
  hasta: "",
  orden: "fecha_hora",
  dir: "asc",
  pagina: 1,
  tamano: 25,
}

const selectClase =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

/** Convierte "+00:00" de Postgres a la misma notación UTC del resto de la app. */
function isoUtc(valor: string) {
  const ms = Date.parse(valor)
  return Number.isNaN(ms) ? valor : new Date(ms).toISOString()
}

export function PestanaSupabase({
  estado,
  pendientesLocales,
  alComprobar,
}: {
  estado: EstadoSupabase
  pendientesLocales: number
  alComprobar: () => void
}) {
  const [borrador, setBorrador] = React.useState(CONSULTA_INICIAL)
  const [consulta, setConsulta] = React.useState(CONSULTA_INICIAL)
  const [version, setVersion] = React.useState(0)
  const [resultado, setResultado] = React.useState<{
    filas: Fila[]
    total: number
    error?: string
    cargando: boolean
    leidoEn?: string
  }>({ filas: [], total: 0, cargando: true })

  React.useEffect(() => {
    const control = new AbortController()
    const p = new URLSearchParams(
      Object.entries(consulta).map(([k, v]) => [k, String(v)])
    )
    fetch(`/api/mediciones?${p}`, { cache: "no-store", signal: control.signal })
      .then(async (r) => {
        const cuerpo = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(cuerpo.error ?? `HTTP ${r.status}`)
        setResultado({
          filas: cuerpo.filas,
          total: cuerpo.total,
          cargando: false,
          leidoEn: new Date().toISOString(),
        })
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return
        setResultado({
          filas: [],
          total: 0,
          cargando: false,
          error: e instanceof Error ? e.message : String(e),
        })
      })
    return () => control.abort()
  }, [consulta, version])

  const aplicar = (c: Consulta) => {
    setResultado((r) => ({ ...r, cargando: true }))
    setConsulta(c)
  }
  const actualizar = () => {
    setResultado((r) => ({ ...r, cargando: true }))
    setVersion((v) => v + 1)
    alComprobar()
  }
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / consulta.tamano))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
          <Badge variant="outline">Local</Badge>
          <p>
            <strong className="tabular-nums">{formatoEntero(pendientesLocales)}</strong> registros
            seleccionados en el navegador, pendientes de subir. Solo existen en esta sesión.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <Badge>
            <DatabaseIcon />
            Persistido
          </Badge>
          <p>
            Esta tabla se lee de Supabase a través del servidor: son los datos realmente guardados
            en <code>mediciones_meteorologicas</code>
            {resultado.leidoEn && ` (lectura: ${formatoFechaUtc(resultado.leidoEn)})`}.
          </p>
        </div>
      </div>

      {estado.configurado === false || estado.tablaAccesible === false ? (
        <Alert variant="destructive">
          <AlertTitle>Supabase no disponible</AlertTitle>
          <AlertDescription>{estado.mensaje}</AlertDescription>
        </Alert>
      ) : null}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          aplicar({ ...borrador, pagina: 1 })
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="s-ciudad" className="text-xs">Ciudad</Label>
          <select
            id="s-ciudad"
            className={selectClase}
            value={borrador.ciudad}
            onChange={(e) => setBorrador({ ...borrador, ciudad: e.target.value })}
          >
            <option value="">Todas</option>
            {CIUDADES.map((c) => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="s-desde" className="text-xs">Desde (UTC)</Label>
          <Input id="s-desde" type="datetime-local" value={borrador.desde} onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="s-hasta" className="text-xs">Hasta (UTC)</Label>
          <Input id="s-hasta" type="datetime-local" value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="s-orden" className="text-xs">Ordenar por (ORDER BY)</Label>
          <div className="flex gap-2">
            <select id="s-orden" className={selectClase} value={borrador.orden} onChange={(e) => setBorrador({ ...borrador, orden: e.target.value })}>
              <option value="fecha_hora">Fecha y hora</option>
              <option value="ciudad">Ciudad</option>
              <option value="temperatura_c">Temperatura</option>
              <option value="humedad_pct">Humedad</option>
              <option value="precipitacion_mm">Precipitación</option>
              <option value="importado_en">Importado en</option>
            </select>
            <select aria-label="Dirección" className={selectClase} value={borrador.dir} onChange={(e) => setBorrador({ ...borrador, dir: e.target.value as "asc" | "desc" })}>
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </div>
        </div>
        <Button type="submit" variant="outline">Aplicar</Button>
        <Button type="button" onClick={actualizar} disabled={resultado.cargando}>
          <RefreshCwIcon data-icon="inline-start" className={resultado.cargando ? "animate-spin" : undefined} />
          Actualizar
        </Button>
      </form>

      {resultado.error ? (
        <Alert variant="destructive">
          <AlertTitle>Error al leer Supabase</AlertTitle>
          <AlertDescription>{resultado.error}</AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border" aria-busy={resultado.cargando}>
          <Table aria-label="Datos persistidos en Supabase">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="text-right">id</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Fecha y hora (UTC)</TableHead>
                <TableHead className="text-right">Temperatura (°C)</TableHead>
                <TableHead className="text-right">Humedad (%)</TableHead>
                <TableHead className="text-right">Precipitación (mm)</TableHead>
                <TableHead>Importado en (UTC)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {resultado.cargando ? "Consultando…" : "No hay registros persistidos con estos filtros."}
                  </TableCell>
                </TableRow>
              ) : (
                resultado.filas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-right tabular-nums">{f.id}</TableCell>
                    <TableCell>{f.ciudad}</TableCell>
                    <TableCell className="tabular-nums">{formatoFechaUtc(isoUtc(f.fecha_hora))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatoDecimal(f.temperatura_c)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatoDecimal(f.humedad_pct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatoDecimal(f.precipitacion_mm)}</TableCell>
                    <TableCell className="tabular-nums">{formatoFechaUtc(isoUtc(f.importado_en))}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {formatoEntero(resultado.total)} registros en Supabase con estos filtros
        </span>
        <div className="flex items-center gap-2">
          <select
            aria-label="Filas por página"
            className={selectClase}
            value={consulta.tamano}
            onChange={(e) => aplicar({ ...consulta, tamano: Number(e.target.value), pagina: 1 })}
          >
            {[10, 25, 50, 100].map((t) => (
              <option key={t} value={t}>{t} por página</option>
            ))}
          </select>
          <span>Página {consulta.pagina} de {totalPaginas}</span>
          <Button variant="outline" size="icon-sm" aria-label="Página anterior" disabled={consulta.pagina <= 1 || resultado.cargando} onClick={() => aplicar({ ...consulta, pagina: consulta.pagina - 1 })}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Página siguiente" disabled={consulta.pagina >= totalPaginas || resultado.cargando} onClick={() => aplicar({ ...consulta, pagina: consulta.pagina + 1 })}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
