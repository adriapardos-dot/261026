const numero = new Intl.NumberFormat("es-ES")
const decimal1 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

export function formatoEntero(n: number): string {
  return numero.format(n)
}

export function formatoDecimal(n: number): string {
  return decimal1.format(n)
}

/** Muestra una fecha ISO UTC sin convertirla a la hora local del navegador. */
export function formatoFechaUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

export function formatoDuracion(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return "—"
  if (ms < 1) return "< 1 ms"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} s`
}

/** Representa un valor crudo distinguiendo null, ausente y cadena vacía de 0. */
export function formatoCrudo(valor: unknown): string {
  if (valor === undefined) return "(ausente)"
  if (valor === null) return "null"
  if (valor === "") return '""'
  if (typeof valor === "string") return JSON.stringify(valor)
  return String(valor)
}

/** Descarga un objeto como archivo JSON (solo en el navegador). */
export function descargarJson(nombre: string, datos: unknown) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
