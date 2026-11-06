// Prueba del RF75: aviso de que la plataforma es educativa y no sustituye un diagnóstico médico.
//   node scripts/test-rf75-aviso.mjs
// Revisa el texto único y que cada pantalla, el pie de página y el informe PDF lo usen.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  AVISO_EDUCATIVO_CORTO,
  AVISO_EDUCATIVO_TEXTO,
  AVISO_EDUCATIVO_TITULO
} from '../src/data/avisoEducativo.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const leer = (ruta) => readFileSync(join(raiz, ruta), 'utf8')

let fallos = 0
function prueba(nombre, condicion) {
  if (condicion) console.log('  OK  ' + nombre)
  else { console.error('  FALLA  ' + nombre); fallos++ }
}

console.log('RF75 · Aviso educativo')

// 1. El texto dice lo que exige el requerimiento
const minus = (t) => t.toLowerCase()
for (const [nombre, texto] of [['corto', AVISO_EDUCATIVO_CORTO], ['completo', AVISO_EDUCATIVO_TEXTO]]) {
  prueba(`El texto ${nombre} dice que es educativo`, minus(texto).includes('educativ'))
  prueba(`El texto ${nombre} dice que no sustituye al profesional o al diagnóstico`, /no (sustituye|constituye)/.test(minus(texto)))
}
prueba('El texto completo menciona el diagnóstico médico', minus(AVISO_EDUCATIVO_TEXTO).includes('diagnóstico médico'))
prueba('El texto completo recomienda consultar a un profesional', minus(AVISO_EDUCATIVO_TEXTO).includes('consulta a un profesional'))
prueba('El título no está vacío', AVISO_EDUCATIVO_TITULO.length > 5)
prueba('El texto corto es realmente corto (cabe en el pie)', AVISO_EDUCATIVO_CORTO.length <= 110)

// 2. El componente usa el texto único y es accesible
const comp = leer('src/components/AvisoEducativo.vue')
prueba('El componente usa el texto único', comp.includes('AVISO_EDUCATIVO_TEXTO') && comp.includes('AVISO_EDUCATIVO_CORTO'))
prueba('El componente tiene role="note" para lectores de pantalla', comp.includes('role="note"'))
prueba('El componente tiene un data-testid', comp.includes('data-testid="aviso-educativo"'))

// 3. Dónde se muestra
const usa = (ruta) => /<AvisoEducativo/.test(leer(ruta)) && /import AvisoEducativo from/.test(leer(ruta))
prueba('Pie de página de toda la aplicación', /AVISO_EDUCATIVO_CORTO/.test(leer('src/App.vue')) && /<footer[\s\S]*aviso-pie[\s\S]*<\/footer>/.test(leer('src/App.vue')))
prueba('Inicio', usa('src/views/HomeView.vue'))
prueba('Inicio de sesión y registro', usa('src/views/LoginView.vue'))
prueba('Historial', usa('src/views/HistorialView.vue'))
prueba('Comparación', usa('src/views/ComparacionView.vue'))
const medicion = leer('src/views/MedicionView.vue')
prueba('Medición en vivo (paso 4)', /paso4-titulo"[^>]*>\s*<AvisoEducativo/.test(medicion))
prueba('Resultados de la medición (paso 5)', /<AvisoEducativo \/>\s*<!-- Contenedor Imprimible/.test(medicion))

// 4. Informe PDF
const pdf = leer('src/services/informePdfService.js')
prueba('El informe PDF imprime el aviso completo', pdf.includes('AVISO_EDUCATIVO_TEXTO') && pdf.includes('splitTextToSize(AVISO_EDUCATIVO_TEXTO'))
prueba('El pie del informe PDF repite la frase corta', pdf.includes('AVISO_EDUCATIVO_CORTO'))
prueba('El informe pasa a otra página si el aviso no cabe', pdf.includes('doc.addPage()'))

// 5. No debe haber textos propios que digan otra cosa
prueba('El texto del aviso vive en un solo archivo', !/no sustituye el diagn/i.test(comp) && !/no sustituye el diagn/i.test(leer('src/App.vue')))

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nTodas las pruebas pasaron')
