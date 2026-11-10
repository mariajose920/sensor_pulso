/**
 * Estabilizador del pulso mostrado (RF07, RF111)
 *
 * El BPM que calcula la app (metricasCanal.calcularMetricasCanal) se recalcula una vez por segundo.
 * Para que el número en pantalla no salte:
 *   - solo cambia cuando hay un latido NUEVO válido desde la última actualización;
 *   - se acerca al valor nuevo como mucho `maxPasoBpm` (3) BPM por actualización; si el cambio es sostenido
 *     (≥ 3 actualizaciones seguidas en el mismo sentido y más lejos que ese paso) se permite `maxPasoSostenidoBpm` (6);
 *   - con confianza «baja» (bpm = null) se aguanta el último valor `toleranciaNulos` (2) actualizaciones y después
 *     pasa a «sin lectura» (null): nunca se deja un número dudoso.
 *
 * Función pura con estado propio, sin Vue ni DOM: se prueba con Node.
 */

export const PARAMETROS_ESTABILIZADOR = Object.freeze({
  maxPasoBpm: 3,
  maxPasoSostenidoBpm: 6,
  actualizacionesSostenido: 3,
  toleranciaNulos: 2
})

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

export function crearEstabilizadorPulso(opciones = {}) {
  const P = { ...PARAMETROS_ESTABILIZADOR, ...opciones }
  let mostrado = null
  let picoVisto = -Infinity
  let nulos = 0
  let sentido = 0
  let seguidas = 0

  return {
    /**
     * @param {{bpm:number|null, ultimoPico:number}} dato `bpm` calculado por la app (null si no hay);
     *   `ultimoPico` posición ABSOLUTA (en muestras acumuladas) del último latido válido de la ventana.
     * @returns {number|null} valor a mostrar
     */
    actualizar({ bpm, ultimoPico } = {}) {
      if (!finito(bpm)) {
        nulos++
        if (nulos > P.toleranciaNulos) { mostrado = null; sentido = 0; seguidas = 0 }
        return mostrado
      }
      nulos = 0
      const hayLatidoNuevo = !finito(ultimoPico) || ultimoPico > picoVisto
      if (mostrado === null) {
        mostrado = bpm
        if (finito(ultimoPico)) picoVisto = ultimoPico
        return mostrado
      }
      if (!hayLatidoNuevo) return mostrado
      if (finito(ultimoPico)) picoVisto = ultimoPico

      const dif = bpm - mostrado
      const signo = Math.sign(dif)
      if (Math.abs(dif) > P.maxPasoBpm && signo === sentido) seguidas++
      else seguidas = Math.abs(dif) > P.maxPasoBpm ? 1 : 0
      sentido = signo
      const limite = seguidas >= P.actualizacionesSostenido ? P.maxPasoSostenidoBpm : P.maxPasoBpm
      mostrado = Math.abs(dif) <= limite ? bpm : mostrado + signo * limite
      return mostrado
    },
    reiniciar() { mostrado = null; picoVisto = -Infinity; nulos = 0; sentido = 0; seguidas = 0 },
    valor() { return mostrado }
  }

}
