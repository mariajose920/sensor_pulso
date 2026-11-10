/**
 * Picos sistólicos para marcar sobre la gráfica (RF06, RF17)
 *
 * CONTRATO (lo usa la gráfica del canal; mantener la firma):
 *   detectarPicosParaGrafica(muestrasMostradas, frecuenciaHz, opciones?) → { indice:number, valor:number }[]
 *     - `muestrasMostradas` es EXACTAMENTE la serie que se dibuja (filtrada o cruda).
 *     - Cada `indice` es un máximo local de `muestrasMostradas` (±2 muestras como mínimo): el punto cae justo en la
 *       parte más alta del latido, encima de la línea, no en un lugar cercano.
 *     - Índices únicos y crecientes. `valor` = muestrasMostradas[indice].
 *     - Devuelve [] si no hay pulsación detectable (señal plana, muy corta o con valores no numéricos).
 *   `opciones.referencia` (opcional): otra serie, del mismo largo, sobre la que se decide dónde hay un latido
 *   (por ejemplo la señal filtrada), para luego ajustar cada latido al máximo de la serie mostrada.
 *
 * Datos puros (sin Vue ni DOM): se prueba con Node.
 */
import { detectarPicosSistolicos } from './metricasCanal.js'

const esFinito = (x) => typeof x === 'number' && Number.isFinite(x)

/** Ajusta una posición aproximada al máximo local de la serie, buscando alrededor (±radio muestras). */
export function ajustarAMaximoLocal(serie, indiceAproximado, radio) {
  const n = serie.length
  let mejor = Math.max(0, Math.min(n - 1, Math.round(indiceAproximado)))
  const desde = Math.max(0, mejor - radio)
  const hasta = Math.min(n - 1, mejor + radio)
  for (let i = desde; i <= hasta; i++) if (serie[i] > serie[mejor]) mejor = i
  // Si el máximo quedó en el borde de la búsqueda, se sigue subiendo hasta una cima verdadera
  while (mejor > 0 && serie[mejor - 1] > serie[mejor]) mejor--
  while (mejor < n - 1 && serie[mejor + 1] > serie[mejor]) mejor++
  return mejor
}

export function detectarPicosParaGrafica(muestrasMostradas, frecuenciaHz = 50, opciones = {}) {
  if (!Array.isArray(muestrasMostradas) || muestrasMostradas.length < 3 || !muestrasMostradas.every(esFinito)) return []
  const fs = esFinito(frecuenciaHz) && frecuenciaHz > 0 ? frecuenciaHz : 50
  const base = Array.isArray(opciones.referencia) && opciones.referencia.length === muestrasMostradas.length
    ? opciones.referencia : muestrasMostradas
  const radio = Math.max(2, Math.round(0.1 * fs))
  const vistos = new Set()
  const salida = []
  for (const p of detectarPicosSistolicos(base, fs)) {
    const i = ajustarAMaximoLocal(muestrasMostradas, p.indice, radio)
    if (vistos.has(i)) continue
    vistos.add(i)
    salida.push({ indice: i, valor: muestrasMostradas[i] })
  }
  return salida.sort((a, b) => a.indice - b.indice)
}
