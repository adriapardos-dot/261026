import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { EstadoFase } from "@/lib/etl/tipos"

const ESTADOS: Record<
  EstadoFase,
  { texto: string; Icono: typeof CheckCircle2Icon; clase: string }
> = {
  pendiente: {
    texto: "Pendiente",
    Icono: CircleDashedIcon,
    clase: "border-border bg-muted text-muted-foreground",
  },
  en_curso: {
    texto: "En curso",
    Icono: Loader2Icon,
    clase: "border-sky-600/30 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  },
  completada: {
    texto: "Completada",
    Icono: CheckCircle2Icon,
    clase:
      "border-primary/30 bg-secondary text-secondary-foreground",
  },
  error: {
    texto: "Con errores",
    Icono: AlertTriangleIcon,
    clase: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

/** Estado con icono y texto: nunca depende solo del color. */
export function IndicadorEstado({
  estado,
  texto,
  className,
}: {
  estado: EstadoFase
  texto?: string
  className?: string
}) {
  const { texto: base, Icono, clase } = ESTADOS[estado]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        clase,
        className
      )}
    >
      <Icono
        aria-hidden
        className={cn("size-3.5", estado === "en_curso" && "animate-spin")}
      />
      {texto ?? base}
    </span>
  )
}
