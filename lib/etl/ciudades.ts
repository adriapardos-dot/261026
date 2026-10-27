export type Ciudad = {
  id: string
  nombre: string
  latitud: number
  longitud: number
}

export const CIUDADES: readonly Ciudad[] = [
  { id: "barcelona", nombre: "Barcelona", latitud: 41.3874, longitud: 2.1686 },
  { id: "madrid", nombre: "Madrid", latitud: 40.4168, longitud: -3.7038 },
  { id: "sevilla", nombre: "Sevilla", latitud: 37.3891, longitud: -5.9845 },
  { id: "bilbao", nombre: "Bilbao", latitud: 43.263, longitud: -2.935 },
  { id: "valencia", nombre: "Valencia", latitud: 39.4699, longitud: -0.3763 },
]

export const NOMBRES_CIUDADES: readonly string[] = CIUDADES.map((c) => c.nombre)

export function buscarCiudad(id: string): Ciudad | undefined {
  return CIUDADES.find((c) => c.id === id)
}
