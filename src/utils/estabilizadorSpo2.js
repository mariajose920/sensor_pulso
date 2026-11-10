/**
 * Estabilizador de la SpO₂ mostrada (RF114)
 *
 * La placa calcula la SpO₂ y la envía en cada paquete (0 = sin lectura). Un valor suelto puede saltar varios puntos
 * por ruido o por un movimiento del dedo. Para que el número en pantalla no baile:
 *   - solo cuentan las lecturas válidas (70–100 %); 0, vacío o fuera de rango = «sin lectura», nunca se inventa un valor;
 *   - se muestra la MEDIANA de las últimas 5 lecturas válidas (las repetidas dentro de `separacionMs` no se cuentan dos veces);
 *   - se acerca al valor nuevo como mucho `maxPaso` (2) puntos por actualización;
 *   - si pasan `aguanteMs` (6 s) sin una lectura válida, pasa a «sin lectura» (null).
 *
 * Función pura con estado propio, sin Vue ni DOM: se prueba con Node.
 */

export const PARAMETROS_ESTABILIZADOR_SPO2 = Object.freeze({
  lecturas: 5,
  maxPaso: 2,
  aguanteMs: 6000,
  separacionMs: 1500,
  minimo: 70,
  maximo: 100
})

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

function mediana(v) {
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

export function crearEstabilizadorSpo2(opciones = {}) {
  const P = { ...PARAMETROS_ESTABILIZADOR_SPO2, ...opciones }
  let lecturas = []
  let ultimaLectura = -Infinity
  let ultimaValida = -Infinity
  let mostrado = null

  return {
    /**
     * @param {number|null|undefined} spo2 valor que mandó la placa (0/null = sin lectura)
     * @param {number} ahoraMs reloj en milisegundos
     * @returns {number|null} valor a mostrar (un decimal) o null = sin lectura
     */
    actualizar(spo2, ahoraMs) {
      const valida = finito(spo2) && spo2 >= P.minimo && spo2 <= P.maximo
      if (valida) {
        ultimaValida = ahoraMs
        if (ahoraMs - ultimaLectura >= P.separacionMs) {
          lecturas.push(spo2)
          if (lecturas.length > P.lecturas) lecturas.shift()
          ultimaLectura = ahoraMs
        }
      } else if (ahoraMs - ultimaValida > P.aguanteMs) {
        lecturas = []
        mostrado = null
        return null
      }
      if (!lecturas.length || ahoraMs - ultimaValida > P.aguanteMs) { mostrado = null; return null }
      const objetivo = mediana(lecturas)
      if (mostrado === null) mostrado = objetivo
      else {
        const dif = objetivo - mostrado
        mostrado = Math.abs(dif) <= P.maxPaso ? objetivo : mostrado + Math.sign(dif) * P.maxPaso
      }
      mostrado = Math.round(mostrado * 10) / 10
      return mostrado
    },
    reiniciar() { lecturas = []; ultimaLectura = -Infinity; ultimaValida = -Infinity; mostrado = null },
    valor() { return mostrado }
  }
}
