"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { paginar, type Orden } from "@/lib/etl/filtros"
import type { CampoOrden } from "@/lib/etl/tipos"
import { cn } from "@/lib/utils"
import { formatoEntero } from "./formato"

export type Columna<T> = {
  id: string
  encabezado: React.ReactNode
  celda: (fila: T, posicion: number) => React.ReactNode
  className?: string
  /** Si se indica, el encabezado permite ordenar por este campo. */
  campoOrden?: CampoOrden
}

type Seleccion = {
  seleccionadas: ReadonlySet<string>
  cambiar: (claves: string[], seleccionar: boolean) => void
}

const TAMANOS = [10, 25, 50, 100]

export function TablaPaginada<T>({
  filas,
  columnas,
  claveFila,
  etiqueta,
  vacio,
  seleccion,
  orden,
  alOrdenar,
  reinicio,
  tamanoInicial = 25,
}: {
  filas: T[]
  columnas: Columna<T>[]
  claveFila: (fila: T) => string
  /** Descripción accesible de la tabla. */
  etiqueta: string
  vacio: React.ReactNode
  seleccion?: Seleccion
  orden?: Orden
  alOrdenar?: (campo: CampoOrden) => void
  /** Cuando cambia este valor se vuelve a la primera página (p. ej. al filtrar). */
  reinicio?: unknown
  tamanoInicial?: number
}) {
  const [tamano, setTamano] = React.useState(tamanoInicial)
  const [estado, setEstado] = React.useState({ pagina: 1, reinicio })
  if (!Object.is(estado.reinicio, reinicio)) {
    setEstado({ pagina: 1, reinicio })
  }
  const { filas: visibles, pagina, totalPaginas } = paginar(
    filas,
    estado.pagina,
    tamano
  )
  const irA = (p: number) => setEstado((e) => ({ ...e, pagina: p }))
  const desplazamiento = (pagina - 1) * tamano

  const clavesPagina = seleccion ? visibles.map(claveFila) : []
  const marcadasPagina = seleccion
    ? clavesPagina.filter((c) => seleccion.seleccionadas.has(c)).length
    : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border">
        <Table aria-label={etiqueta}>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {seleccion && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Seleccionar todas las filas de esta página"
                    checked={
                      clavesPagina.length > 0 &&
                      marcadasPagina === clavesPagina.length
                    }
                    indeterminate={
                      marcadasPagina > 0 && marcadasPagina < clavesPagina.length
                    }
                    disabled={clavesPagina.length === 0}
                    onCheckedChange={(v) => seleccion.cambiar(clavesPagina, v)}
                  />
                </TableHead>
              )}
              {columnas.map((c) => {
                const activa = orden && c.campoOrden === orden.campo
                return (
                  <TableHead
                    key={c.id}
                    className={c.className}
                    aria-sort={
                      activa
                        ? orden.direccion === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {c.campoOrden && alOrdenar ? (
                      <button
                        type="button"
                        onClick={() => alOrdenar(c.campoOrden as CampoOrden)}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        {c.encabezado}
                        {activa ? (
                          orden.direccion === "asc" ? (
                            <ArrowUpIcon className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowDownIcon className="size-3.5" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDownIcon
                            className="size-3.5 opacity-40"
                            aria-hidden
                          />
                        )}
                      </button>
                    ) : (
                      c.encabezado
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnas.length + (seleccion ? 1 : 0)}
                  className="py-8 text-center whitespace-normal text-muted-foreground"
                >
                  {vacio}
                </TableCell>
              </TableRow>
            ) : (
              visibles.map((fila, i) => {
                const clave = claveFila(fila)
                const marcada = seleccion?.seleccionadas.has(clave) ?? false
                return (
                  <TableRow
                    key={clave}
                    data-state={marcada ? "selected" : undefined}
                  >
                    {seleccion && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Seleccionar fila ${desplazamiento + i + 1}`}
                          checked={marcada}
                          onCheckedChange={(v) => seleccion.cambiar([clave], v)}
                        />
                      </TableCell>
                    )}
                    {columnas.map((c) => (
                      <TableCell key={c.id} className={c.className}>
                        {c.celda(fila, desplazamiento + i)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {filas.length === 0
            ? "0 filas"
            : `Filas ${formatoEntero(desplazamiento + 1)}–${formatoEntero(
                desplazamiento + visibles.length
              )} de ${formatoEntero(filas.length)}`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            Filas por página
            <select
              className="h-7 rounded-md border bg-background px-1 text-foreground"
              value={tamano}
              onChange={(e) => {
                setTamano(Number(e.target.value))
                irA(1)
              }}
            >
              {TAMANOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <div className="flex gap-1">
            <BotonPagina etiqueta="Primera página" onClick={() => irA(1)} disabled={pagina <= 1}>
              <ChevronsLeftIcon />
            </BotonPagina>
            <BotonPagina etiqueta="Página anterior" onClick={() => irA(pagina - 1)} disabled={pagina <= 1}>
              <ChevronLeftIcon />
            </BotonPagina>
            <BotonPagina etiqueta="Página siguiente" onClick={() => irA(pagina + 1)} disabled={pagina >= totalPaginas}>
              <ChevronRightIcon />
            </BotonPagina>
            <BotonPagina etiqueta="Última página" onClick={() => irA(totalPaginas)} disabled={pagina >= totalPaginas}>
              <ChevronsRightIcon />
            </BotonPagina>
          </div>
        </div>
      </div>
    </div>
  )
}

function BotonPagina({
  etiqueta,
  children,
  ...props
}: {
  etiqueta: string
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
}) {
  return (
    <Button variant="outline" size="icon-sm" aria-label={etiqueta} title={etiqueta} {...props}>
      {children}
    </Button>
  )
}

/** Celda numérica que muestra null de forma explícita, nunca como 0. */
export function CeldaNumero({
  valor,
  formato,
}: {
  valor: number | null
  formato: (n: number) => string
}) {
  return valor === null ? (
    <span className="text-destructive italic">null</span>
  ) : (
    <span className={cn("tabular-nums")}>{formato(valor)}</span>
  )
}
