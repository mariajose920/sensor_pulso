// RF94: la plataforma no es un dispositivo médico certificado ni entrega diagnósticos.
// No basta con un aviso: lo que se muestra a quien midió no puede afirmar una condición.
// Uso: node scripts/test-rf94-aviso-no-medico.mjs
import { readFileSync } from 'node:fs'

let fallos = 0
const marcar = (ok, texto) => { if (!ok) fallos++; console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`) }
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

const A = await import('../src/data/avisoEducativo.js')
const minus = (t) => t.toLowerCase()

// ---------------------------------------------------------------- Un solo texto, con las dos ideas del requisito
for (const [nombre, texto] of [['corto', A.AVISO_EDUCATIVO_CORTO], ['completo', A.AVISO_EDUCATIVO_TEXTO]]) {
  marcar(/no es un dispositivo médico certificado/.test(minus(texto)), `El texto ${nombre} dice que no es un dispositivo médico certificado`)
  marcar(/(no|ni) entrega diagnósticos/.test(minus(texto)), `El texto ${nombre} dice que no entrega diagnósticos`)
}
marcar(/consulta a un profesional/.test(minus(A.AVISO_EDUCATIVO_TEXTO)), 'El texto completo recomienda consultar a un profesional')
marcar(/se parece a un patrón de referencia/.test(minus(A.AVISO_EDUCATIVO_TEXTO)) && /no una conclusión sobre tu salud/.test(minus(A.AVISO_EDUCATIVO_TEXTO)), 'Explica que parecerse a un patrón es aprendizaje y no una conclusión')
marcar(A.AVISO_EDUCATIVO_CORTO.length <= 110, 'El texto corto cabe en el pie')
marcar(/no es un dispositivo médico certificado/.test(minus(A.AVISO_DISPOSITIVO)) && /esp32/.test(minus(A.AVISO_DISPOSITIVO)), 'Hay un aviso específico para el sensor ESP32')
marcar(/^\d+\.\d+$/.test(A.AVISO_VERSION), 'El aviso tiene versión')
const sinComillas = [A.AVISO_EDUCATIVO_TEXTO, A.AVISO_EDUCATIVO_CORTO, A.AVISO_EDUCATIVO_TITULO, A.AVISO_DISPOSITIVO].every(t => !/['"$]/.test(t))
marcar(sinComillas, 'Los textos no llevan comillas ni $ (se copian tal cual a la base de datos)')

// ---------------------------------------------------------------- La base de datos dice lo mismo
const mig = lee('../supabase/migrations/20261109000100_aviso_no_medico.sql')
marcar(mig.includes(A.AVISO_EDUCATIVO_TEXTO) && mig.includes(A.AVISO_EDUCATIVO_TITULO), 'La migración guarda el mismo texto y título del aviso')
marcar(mig.includes(`version = '${A.AVISO_VERSION}'`), 'La migración guarda la misma versión')
marcar(mig.includes(A.AVISO_DISPOSITIVO) && /aviso_no_medico/.test(mig), 'El documento aviso_no_medico repite la nota del dispositivo')

// ---------------------------------------------------------------- Consentimiento y política
const consent = lee('../src/services/consentimientoService.js') + lee('../src/components/ConsentimientoModal.vue')
marcar(/no son un dispositivo médico certificado/.test(minus(consent)) && /no entregan diagnósticos/.test(minus(consent)), 'El consentimiento usa la misma idea (certificado y sin diagnósticos)')
marcar(/no es un dispositivo médico/.test(minus(lee('../src/data/politicaPrivacidad.js'))), 'La política de privacidad mantiene su sección de dispositivo médico')

// ---------------------------------------------------------------- Dónde se muestra (nuevas pantallas)
const usa = (r) => /import AvisoEducativo from/.test(lee(r)) && /<AvisoEducativo/.test(lee(r))
for (const [nombre, ruta] of [['Simulador', 'SimuladorView'], ['Detalle del aula', 'AulaDetalleView'], ['Evaluaciones', 'EvaluacionesView'], ['Rangos', 'RangosView'], ['Dispositivos', 'DispositivosView']]) {
  marcar(usa(`../src/views/${ruta}.vue`), `${nombre} muestra el aviso`)
}
marcar(/<AvisoEducativo dispositivo/.test(lee('../src/views/DispositivosView.vue')), 'Dispositivos muestra además la nota del sensor ESP32')
marcar(/AVISO_ALERTA/.test(lee('../src/components/AlertaFueraRangoBanner.vue')) && /data-testid="alerta-aviso"/.test(lee('../src/components/AlertaFueraRangoBanner.vue')), 'Cada alerta lleva su aviso dentro')
marcar(/AVISO_REFERENCIA/.test(lee('../src/components/ComparadorPatologiasCard.vue')) && /data-testid="aviso-referencia"/.test(lee('../src/components/ComparadorPatologiasCard.vue')), 'La comparación con patologías lleva su aviso dentro')
marcar(/consentimiento|aviso/i.test(A.LUGARES_AVISO.join()) && A.LUGARES_AVISO.length >= 17, 'La lista de lugares del aviso está al día')

// ---------------------------------------------------------------- PDF: aviso al comienzo
const pdf = lee('../src/services/informePdfService.js')
const iTitulo = pdf.indexOf('Informe educativo de ritmo')
const iAviso = pdf.indexOf('parrafo(AVISO_EDUCATIVO_CORTO')
marcar(iTitulo > 0 && iAviso > iTitulo && iAviso < pdf.indexOf("seccion(1, 'Datos del participante')"), 'El informe PDF muestra el aviso justo bajo el título, antes del contenido')
marcar(!/INFORME DE EVALUACI.N CL.NICA/.test(pdf), 'El informe ya no se titula evaluación clínica')

// ---------------------------------------------------------------- Lo que se le dice a quien midió no afirma una condición
// Textos de salida (las lecciones y las prácticas enseñan los conceptos y quedan fuera a propósito)
const { evaluarComparacionRango } = await import('../src/utils/comparacionRangos.js')
const salidas = []
for (const [bpm, spo2] of [[130, 88], [45, 99], [75, 98]]) {
  const r = evaluarComparacionRango({ bpm, spo2, edad: 25, actividad: 'reposo' })
  salidas.push(r.bpm.diagnostico, r.spo2.diagnostico, r.resumenClinico)
}
marcar(salidas.length >= 6, 'Se pudieron evaluar casos de ejemplo de comparación de rangos')
const AFIRMA = /(detectad[ao]s?|desaturación arterial|se clasifica como|descarta|descartan|es concordante|coincide con el patrón|diagnóstico de ritmo|evaluación clínica|alerta crítica|intervención médica|requerida)/i
marcar(salidas.every(t => !AFIRMA.test(t)), 'Los resultados de rangos no afirman una condición')
marcar(salidas.some(t => /se parece a los parámetros de taquicardia/.test(t)) && salidas.some(t => /se parece a los parámetros de bradicardia/.test(t)) && salidas.some(t => /se parece a los parámetros de desaturación/.test(t)), 'Cuando un valor sale del rango dice que se parece a los parámetros (con el nombre correcto)')

const alertas = await import('../src/services/alertasService.js')
const titulos = ['bpm_alto', 'bpm_bajo', 'spo2_bajo', 'irregular'].map(k => alertas.obtenerMetadatosAlerta(k))
marcar(titulos.every(m => /^Tendencia a/.test(m.titulo)), 'Los tipos de alerta se llaman «Tendencia a…», no la condición a secas')
marcar(titulos.every(m => /no es un diagnóstico/.test(m.descripcion)), 'Cada tipo de alerta aclara que no es un diagnóstico')

const FUENTES = [
  '../src/components/AlertaFueraRangoBanner.vue', '../src/components/ClasificacionRitmoCard.vue', '../src/components/ComparadorPatologiasCard.vue',
  '../src/data/ritmosPatologias.js', '../src/services/ritmoService.js', '../src/services/spo2Service.js', '../src/services/alertasService.js',
  '../src/components/ValorBpmCard.vue', '../src/components/MultiCanalMonitor.vue', '../src/services/multiCanalService.js',
  '../src/components/MetricsCards.vue', '../src/components/ComparadorRangoCard.vue', '../src/views/HistorialView.vue', '../src/utils/comparacionRangos.js'
]
const PROHIBIDO = [
  [/Taquicardia Detectada|Bradicardia Detectada/i, '«… Detectada»'],
  [/Alerta Cr[ií]tica/i, '«Alerta Crítica»'],
  [/Se clasifica como/i, '«Se clasifica como»'],
  [/(?<!Simulación de )Diagn[oó]stico de ritmo en tiempo real/, '«Diagnóstico de ritmo en tiempo real» a secas'],
  [/Correlaci[oó]n Cl[ií]nica/i, '«Correlación Clínica»'],
  [/descarta(n)? (taquicardia|fibrilaci)/i, '«descarta…»'],
  [/es concordante con el patr[oó]n/i, '«es concordante con el patrón»'],
  [/coincide con el patr[oó]n/i, '«coincide con el patrón»'],
  [/Intervenci[oó]n m[eé]dica de emergencia/i, '«Intervención médica de emergencia»'],
  [/biblioteca cl[ií]nica/i, '«biblioteca clínica»']
]
for (const f of FUENTES) {
  const t = lee(f)
  const malos = PROHIBIDO.filter(([re]) => re.test(t)).map(([, n]) => n)
  marcar(malos.length === 0, `${f.split('/').pop()} no afirma condiciones` + (malos.length ? ` → ${malos.join(', ')}` : ''))
}

// ---------------------------------------------------------------- Ritmo y patologías: reencuadre educativo con los nombres correctos
const ritmoCard = lee('../src/components/ClasificacionRitmoCard.vue')
marcar(/Simulación de diagnóstico/.test(ritmoCard) && /No es un diagnóstico/.test(ritmoCard), 'La tarjeta de ritmo es una «Simulación de diagnóstico» y lo aclara')
const pat = await import('../src/data/ritmosPatologias.js')
const taqui = pat.RITMOS_PATOLOGIAS.find(r => r.id === 'taquicardia_sinusal')
let conclusiones = []
for (const r of pat.RITMOS_PATOLOGIAS) {
  for (const bpm of [45, 75, 130]) {
    conclusiones.push(pat.calcularMetricasComparacionPatologia({ patologiaId: r.id, medicionBpm: bpm }).conclusionClinica)
  }
}
marcar(conclusiones.length >= 12, 'Se generaron conclusiones de ejemplo para cada ritmo de referencia')
marcar(conclusiones.every(c => !PROHIBIDO.some(([re]) => re.test(c)) && !/descarta/i.test(c)), 'Ninguna conclusión descarta ni confirma una patología')
marcar(conclusiones.some(c => /patrón taquicárdico de referencia/.test(c) && /sin que esto sea un diagnóstico/.test(c)), 'Conserva el nombre «patrón taquicárdico» pero como tendencia y sin diagnóstico')
marcar(conclusiones.some(c => /patrón bradicárdico de referencia/.test(c)), 'Conserva el nombre «patrón bradicárdico» de referencia')
marcar(!!taqui, 'La taquicardia sinusal sigue en la biblioteca de referencia (no se quitó ningún nombre)')

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nRF94: todas las pruebas pasaron')
