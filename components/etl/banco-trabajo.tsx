"use client"

import * as React from "react"
import { DatabaseIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePipelineEtl } from "@/hooks/use-pipeline-etl"
import { cn } from "@/lib/utils"
import { formatoEntero } from "./formato"
import { MapaCiudades } from "./mapa-ciudades"
import { PanelExtraccion } from "./panel-extraccion"
import { PestanaCarga } from "./pestana-carga"
import { PestanaSupabase } from "./pestana-supabase"
import { PestanaValidos } from "./pestana-validos"
import { PestanaJson, PestanaRechazados, PestanaTransformados } from "./pestanas-inspeccion"
import { VistaPipeline, type Pestana } from "./vista-pipeline"

function Contador({
  etiqueta,
  valor,
  detalle,
  destacado,
}: {
  etiqueta: string
  valor: number | null
  detalle?: string
  destacado?: boolean
}) {
  return (
    <div className={cn("rounded-lg border p-3", destacado && "border-foreground/30 bg-muted/50")}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-2xl font-semibold tabular-nums">
        {valor === null ? "—" : formatoEntero(valor)}
      </dd>
      {detalle && <dd className="text-xs text-muted-foreground">{detalle}</dd>}
    </div>
  )
}

export function BancoTrabajo() {
  const pipeline = usePipelineEtl()
  const [pestana, setPestana] = React.useState<Pestana>("json")
  const zonaDatos = React.useRef<HTMLDivElement>(null)
  const { procesado, filtrado, validos, supabase, extraccion, carga } = pipeline

  const inspeccionar = (p: Pestana) => {
    setPestana(p)
    zonaDatos.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const hayDatos = procesado !== null

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Big Data · Práctica 1</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Pipeline ETL: Open-Meteo → Supabase
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Extrae datos meteorológicos horarios, observa cómo se transforman y limpian, elige
            exactamente qué registros quieres guardar y cárgalos en una tabla de Supabase.
          </p>
        </div>
        <p
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
          aria-live="polite"
        >
          <DatabaseIcon className="size-3.5" aria-hidden />
          {supabase.comprobando
            ? "Comprobando Supabase…"
            : supabase.configurado && supabase.tablaAccesible
              ? "Supabase: conectado ✓"
              : supabase.configurado === false
                ? "Supabase: sin configurar ✗"
                : "Supabase: error de conexión ✗"}
        </p>
      </header>

      <PanelExtraccion
        ocupado={Boolean(extraccion?.enCurso) || Boolean(carga?.enCurso)}
        alExtraer={pipeline.extraer}
      />

      <MapaCiudades pipeline={pipeline} />

      <VistaPipeline pipeline={pipeline} alInspeccionar={inspeccionar} />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Contadores">
        <Contador
          etiqueta="Total extraído"
          valor={hayDatos ? procesado.transformacion.registros.length : null}
          detalle="registros horarios recibidos"
        />
        <Contador etiqueta="Válidos" valor={hayDatos ? validos.length : null} detalle="superan la limpieza" />
        <Contador
          etiqueta="Rechazados"
          valor={hayDatos ? procesado.limpieza.rechazados.length : null}
          detalle="por calidad o duplicado"
        />
        <Contador
          etiqueta="Coinciden con los filtros"
          valor={hayDatos ? filtrado.coincidentes.length : null}
          detalle={
            hayDatos
              ? `${formatoEntero(validos.length - filtrado.coincidentes.length)} excluidos por filtros`
              : undefined
          }
        />
        <Contador
          etiqueta="Seleccionados para cargar"
          valor={hayDatos ? filtrado.aCargar.length : null}
          detalle={
            filtrado.seleccionadosFuera > 0
              ? `+${formatoEntero(filtrado.seleccionadosFuera)} seleccionados fuera de filtro (no se suben)`
              : "seleccionados que cumplen los filtros"
          }
          destacado
        />
      </dl>

      <div ref={zonaDatos} className="scroll-mt-4">
        <Card>
          <CardHeader>
            <CardTitle>3. Inspección de datos</CardTitle>
            <CardDescription>
              Datos locales de esta sesión (aún no guardados) y, en la última pestaña, los datos
              persistidos en Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
              <div className="overflow-x-auto pb-1">
                <TabsList>
                  <TabsTrigger value="json">JSON original</TabsTrigger>
                  <TabsTrigger value="transformados">Transformados</TabsTrigger>
                  <TabsTrigger value="validos">Registros válidos</TabsTrigger>
                  <TabsTrigger value="rechazados">Rechazados</TabsTrigger>
                  <TabsTrigger value="carga">Vista previa de la carga</TabsTrigger>
                  <TabsTrigger value="supabase">Datos en Supabase</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="json" className="pt-2">
                <PestanaJson extraccion={extraccion} />
              </TabsContent>
              <TabsContent value="transformados" className="pt-2">
                <PestanaTransformados procesado={procesado} />
              </TabsContent>
              <TabsContent value="validos" className="pt-2">
                <PestanaValidos pipeline={pipeline} />
              </TabsContent>
              <TabsContent value="rechazados" className="pt-2">
                <PestanaRechazados
                  procesado={procesado}
                  excluidosPorFiltro={validos.length - filtrado.coincidentes.length}
                />
              </TabsContent>
              <TabsContent value="carga" className="pt-2">
                <PestanaCarga pipeline={pipeline} />
              </TabsContent>
              <TabsContent value="supabase" className="pt-2">
                <PestanaSupabase
                  estado={supabase}
                  pendientesLocales={filtrado.aCargar.length}
                  alComprobar={pipeline.comprobarSupabase}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
