// RF112 · Niveles de logro con porcentajes editables por evaluación.
// Uso: node scripts/test-rf112-umbrales-nivel.mjs
import { readFileSync } from 'node:fs'
import {
  modeloVacio, cambiarTipo, cambiarEjercicio, validarTipoEvaluacion, camposTipoParaGuardar,
  modeloDesdeFila, umbralesDelModelo, validarUmbralesNivel, camposUmbralesParaGuardar, UMBRALES_NIVEL
} from '../src/utils/tiposEvaluacion.js'
import { nivelPorPorcentaje } from '../src/utils/calificacionEjercicio.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

console.log('\n--- Pruebas de RF112: niveles de logro con umbrales editables ---')

// 1. Sin cambios, todo queda como antes: 70 y 40 los pone la base
const base = modeloVacio()
marcar(JSON.stringify(umbralesDelModelo(base)) === JSON.stringify({ logrado: 70, medio: 40 }), 'Sin cambios se muestran los valores por defecto 70 y 40')
marcar(Object.keys(camposUmbralesParaGuardar(base)).length === 0, 'Sin cambios no se envían umbrales (la base usa su valor por defecto)')
marcar(validarTipoEvaluacion(base).length === 0, 'Una evaluación de preguntas sin cambios sigue siendo válida')

// 2. Cambiar los porcentajes
const editado = { ...base, umbralLogrado: 80, umbralMedio: 50 }
marcar(validarTipoEvaluacion(editado).length === 0, 'Umbrales 80 y 50 son válidos')
const campos = camposTipoParaGuardar(editado)
marcar(campos.umbral_logrado === 80 && campos.umbral_medio === 50, 'Los umbrales se guardan en umbral_logrado y umbral_medio')
marcar(campos.tipo === 'preguntas', 'Guardar los umbrales no cambia el tipo')
const soloUno = camposUmbralesParaGuardar({ umbralLogrado: 90 })
marcar(soloUno.umbral_logrado === 90 && soloUno.umbral_medio === 40, 'Si solo cambia uno, el otro se completa con su valor por defecto')

// 3. Validaciones (las mismas reglas de la base)
marcar(validarUmbralesNivel({ umbralLogrado: 40, umbralMedio: 40 }).length === 1, 'El medio no puede ser igual al logrado')
marcar(validarUmbralesNivel({ umbralLogrado: 30, umbralMedio: 50 }).length === 1, 'El medio no puede ser mayor que el logrado')
marcar(validarUmbralesNivel({ umbralLogrado: 101, umbralMedio: 50 }).length === 1, 'Logrado no puede pasar de 100')
marcar(validarUmbralesNivel({ umbralLogrado: 0, umbralMedio: 0 }).length >= 1, 'Logrado no puede ser 0')
marcar(validarUmbralesNivel({ umbralLogrado: 70, umbralMedio: -5 }).length === 1, 'El medio no puede ser negativo')
marcar(validarUmbralesNivel({ umbralLogrado: '', umbralMedio: 40 }).length >= 1, 'Un campo vacío se rechaza')
marcar(validarUmbralesNivel({ umbralLogrado: 'abc', umbralMedio: 40 }).length >= 1, 'Un texto se rechaza')
let lanzo = false
try { camposTipoParaGuardar({ ...base, umbralLogrado: 30, umbralMedio: 50 }) } catch { lanzo = true }
marcar(lanzo, 'No se puede guardar una evaluación con umbrales inválidos')

// 4. Los porcentajes no se pierden al cambiar de tipo o de ejercicio
const alEjercicio = cambiarTipo(editado, 'ejercicio_aplicado')
marcar(alEjercicio.umbralLogrado === 80 && alEjercicio.umbralMedio === 50, 'Cambiar de tipo conserva los umbrales')
const conEjercicio = cambiarEjercicio(alEjercicio, 'bpm_en_rango')
marcar(conEjercicio.umbralLogrado === 80 && conEjercicio.umbralMedio === 50, 'Cambiar de ejercicio conserva los umbrales')
const mixta = cambiarTipo(editado, 'mixta')
marcar(mixta.umbralLogrado === 80 && mixta.tipo === 'mixta', 'Pasar a mixta conserva los umbrales')

// 5. Al editar una evaluación guardada se cargan sus porcentajes
const deFila = modeloDesdeFila({ tipo: 'preguntas', umbral_logrado: '85.00', umbral_medio: '55.00' })
marcar(deFila.umbralLogrado === 85 && deFila.umbralMedio === 55, 'La edición carga los umbrales de la evaluación (también las de preguntas)')
marcar(modeloDesdeFila({ tipo: 'preguntas' }).umbralLogrado === undefined, 'Una fila sin umbrales no inventa valores')

// 6. El nivel del estudiante respeta los umbrales de la evaluación
marcar(nivelPorPorcentaje(75, 80, 50) === 'medianamente_logrado', '75 % con umbrales 80/50 es medianamente logrado')
marcar(nivelPorPorcentaje(80, 80, 50) === 'logrado', '80 % con umbrales 80/50 es logrado')
marcar(nivelPorPorcentaje(49, 80, 50) === 'no_logrado', '49 % con umbrales 80/50 es no logrado')
marcar(nivelPorPorcentaje(75) === 'logrado', 'Con los umbrales por defecto, 75 % es logrado')

// 7. Interfaz y base de datos
const form = lee('../src/components/TipoEvaluacionForm.vue')
marcar(form.includes('data-testid="umbral-logrado"') && form.includes('data-testid="umbral-medio"'), 'El formulario tiene los campos de logrado y medianamente logrado')
marcar(form.includes('Niveles de logro'), 'El formulario tiene la sección «Niveles de logro»')
const seccion = form.match(/<fieldset class="niveles-logro"[\s\S]*?<\/fieldset>/)[0]
marcar(!/\bRF\d+\b/i.test(seccion), 'La sección de niveles no muestra códigos RF')
const vista = lee('../src/views/EvaluacionesView.vue')
marcar(vista.includes('TipoEvaluacionForm') && vista.includes('modeloDesdeFila'), 'La vista de evaluaciones usa el formulario con los niveles al crear y al editar')
const sql = lee('../supabase/migrations/20261027000500_evaluaciones.sql')
marcar(sql.includes('umbral_logrado') && sql.includes('umbral_medio < umbral_logrado'), 'La base ya tiene umbrales por evaluación con la regla medio < logrado')
marcar(UMBRALES_NIVEL.logradoPorDefecto === 70 && UMBRALES_NIVEL.medioPorDefecto === 40, 'Valores por defecto 70 y 40')

if (fallos) {
  console.error(`\nRF112: ${fallos} prueba(s) fallaron`)
  process.exit(1)
}
console.log('\nRF112: todas las pruebas pasaron')
