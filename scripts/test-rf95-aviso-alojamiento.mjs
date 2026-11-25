/**
 * Pruebas automatizadas para RF95:
 * "Almacenamiento y transferencias: informar si los datos se alojan fuera de Chile (Supabase usa us-east-1) y su base legal."
 *
 * Ejecutar con: node scripts/test-rf95-aviso-alojamiento.mjs
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8')

const a = await import('../src/data/alojamiento.js')
const politica = await import('../src/data/politicaPrivacidad.js')

let pasadas = 0
function probar(nombre, fn) {
  try {
    fn()
    pasadas++
    console.log(`  [OK] ${nombre}`)
  } catch (err) {
    console.error(`  [FALLO] ${nombre}`)
    console.error(err)
    process.exit(1)
  }
}

const migracion = leer('supabase/migrations/20261122000100_rf95_aviso_alojamiento.sql')

console.log('=== Pruebas RF95: Aviso sobre el alojamiento fuera de Chile ===')

// ------------------------------------------------------------ el contenido
probar('1. Se informa con claridad que los datos están fuera de Chile y dónde', () => {
  assert.match(a.TITULO_ALOJAMIENTO, /fuera de Chile/)
  assert.match(a.RESUMEN_CORTO, /Estados Unidos/)
  assert.match(a.RESUMEN_CORTO, /retirar tu consentimiento/)
  assert.equal(a.PAIS_ALOJAMIENTO, 'Estados Unidos')
  assert.match(a.FRASE_ACEPTACION, /fuera de Chile/)
})

probar('2. Cada proveedor trae qué hace, qué datos toca y su ubicación; todos están fuera de Chile', () => {
  const ids = a.PROVEEDORES.map(p => p.id)
  assert.deepEqual(ids, ['supabase', 'vercel', 'resend', 'google'])
  for (const p of a.PROVEEDORES) {
    assert.ok(p.nombre && p.funcion.length > 15 && p.datos.length > 15, `${p.id}: faltan datos`)
    assert.match(p.ubicacion, /Estados Unidos/, `${p.id}: debe indicar que está fuera de Chile`)
  }
})

probar('3. Solo se afirma la región que está comprobada (Supabase us-east-1)', () => {
  const supabase = a.PROVEEDORES.find(p => p.id === 'supabase')
  assert.equal(supabase.confirmada, true)
  assert.match(supabase.ubicacion, /us-east-1/)
  for (const p of a.PROVEEDORES.filter(x => x.id !== 'supabase')) {
    assert.equal(p.confirmada, false, `${p.id}: su región no está comprobada, no debe afirmarse una`)
    assert.ok(!/us-east|eu-|sa-east|iad1|región us/i.test(p.ubicacion), `${p.id}: no se debe inventar una región`)
  }
})

probar('4. La base legal se apoya en lo que existe y no promete lo que no está comprobado', () => {
  const textos = a.BASE_LEGAL.map(b => `${b.titulo} ${b.texto}`).join(' ')
  assert.match(textos, /consentimiento expreso/i)
  assert.match(textos, /encargados/i)
  assert.match(textos, /Ley N\.º 19\.628/)
  assert.match(textos, /Ley N\.º 21\.719/)
  assert.match(textos, /retirarlos|retirar/i, 'el consentimiento se puede retirar')
  // Acuerdos y certificaciones del proveedor siguen pendientes (docs/iso27001/05-proveedores.md): no se afirman
  const todo = JSON.stringify([a.BASE_LEGAL, a.PROTECCIONES, a.PROVEEDORES, a.QUE_PUEDES_HACER, a.textoDocumento()])
  assert.ok(!/\bDPA\b|SOC ?2|certificad|ISO ?27001|garantiza|nivel adecuado/i.test(todo), 'no debe afirmar acuerdos, certificaciones ni nivel de protección no comprobados')
})

probar('5. Las protecciones que se mencionan existen en el sistema', () => {
  assert.ok(leer('vercel.json').includes('Strict-Transport-Security'), 'HTTPS')
  assert.ok(existsSync(resolve(process.cwd(), 'api/_lib/cifradoSalud.js')), 'cifrado de la ficha de salud')
  const rls = Object.values(
    ['20261027000100_base_perfiles_roles', '20261027000400_dispositivos_mediciones']
  ).map(n => leer(`supabase/migrations/${n}.sql`)).join('\n')
  assert.match(rls, /enable row level security/i, 'reglas de acceso por fila')
  assert.ok(existsSync(resolve(process.cwd(), 'src/components/VistaPreviaAnonimizacion.vue')), 'vista previa de anonimización')
  assert.equal(a.PROTECCIONES.length, 4)
})

probar('6. Se explica qué puede hacer la persona (retirar, descargar, eliminar)', () => {
  const t = a.QUE_PUEDES_HACER.join(' ')
  assert.match(t, /Retirar tu consentimiento/)
  assert.match(t, /Descargar/)
  assert.match(t, /eliminen|eliminación/)
  assert.match(t, /Mis datos y derechos/)
})

// ------------------------------------------------------------ coherencia con lo demás
probar('7. La política de privacidad nombra a los mismos proveedores y la misma región', () => {
  const seccion = politica.SECCIONES.find(s => s.id === 'destinatarios')
  const texto = seccion.lista.join(' ')
  for (const p of a.PROVEEDORES) assert.ok(texto.includes(p.nombre), `la política debe nombrar a ${p.nombre}`)
  assert.match(texto, /us-east-1/)
  assert.match(texto, /fuera de Chile/)
  assert.match(texto, /transferencia internacional/)
  assert.match(texto, /base legal/i, 'remite a la explicación de la base legal')
})

probar('8. El documento «alojamiento» de la base dice exactamente lo mismo que el aviso', () => {
  const m = /'alojamiento',\s*'Alojamiento de los datos',\s*'([\s\S]*?)',\s*'([\d.]+)',\s*now\(\)/.exec(migracion)
  assert.ok(m, 'la migración debe definir el documento alojamiento')
  assert.equal(m[1].replace(/''/g, "'"), a.textoDocumento(), 'el texto de la base y el de la aplicación deben coincidir')
  assert.equal(m[2], a.ALOJAMIENTO_VERSION)
  assert.match(migracion, /on conflict \(clave\) do update/, 'debe poder repetirse')
  assert.ok(!/\b(delete|truncate|drop)\b/i.test(migracion.replace(/--[^\n]*/g, '')), 'la migración no borra nada')
  assert.ok(!/Pendiente de revisión|pendiente de redacción/i.test(a.textoDocumento()), 'ya no debe decir que la base legal está pendiente')
})

probar('9. El documento de proveedores de la norma ISO incluye a los mismos proveedores', () => {
  const doc = leer('docs/iso27001/05-proveedores.md')
  for (const p of a.PROVEEDORES) assert.ok(doc.includes(p.nombre), `docs/iso27001/05-proveedores.md debe incluir a ${p.nombre}`)
})

// ------------------------------------------------------------ dónde se ve
probar('10. El componente tiene versión compacta y completa, con ancla para el enlace', () => {
  const c = leer('src/components/AvisoAlojamiento.vue')
  for (const t of ['v-if="compacto"', 'ID_ANCLA_ALOJAMIENTO', 'role="note"', 'alojamiento-proveedores', 'alojamiento-base-legal',
    'alojamiento-protecciones', 'alojamiento-acciones', 'alojamiento-version', 'Dónde se alojan tus datos y con qué base legal',
    'Quién los trata y dónde', 'Cómo se cuidan tus datos', 'Qué puedes hacer']) {
    assert.ok(c.includes(t), 'el componente debe incluir: ' + t)
  }
  assert.equal(a.RUTA_ALOJAMIENTO, '/privacidad#alojamiento-datos')
  assert.equal(a.ID_ANCLA_ALOJAMIENTO, 'alojamiento-datos')
})

probar('11. El aviso aparece donde la persona decide: inicio de sesión, consentimiento, política, Mis datos y pie de página', () => {
  const login = leer('src/views/LoginView.vue')
  assert.ok(login.includes('<AvisoAlojamiento compacto'), 'inicio de sesión')
  assert.ok(login.includes('{{ FRASE_ACEPTACION }}'), 'la casilla pide aceptar el alojamiento fuera de Chile')
  assert.ok(/data-testid="acepta-politica"/.test(login) && /!aceptaPolitica/.test(login), 'la casilla sigue siendo obligatoria')
  assert.ok(leer('src/components/ConsentimientoModal.vue').includes('<AvisoAlojamiento compacto'), 'consentimiento informado')
  assert.ok(leer('src/views/MisDatosView.vue').includes('<AvisoAlojamiento compacto'), 'Mis datos y derechos')
  const priv = leer('src/views/PrivacidadView.vue')
  assert.ok(/<AvisoAlojamiento :con-sesion="isAuthenticated"/.test(priv) && !/<AvisoAlojamiento compacto/.test(priv), 'política de privacidad (versión completa)')
  const app = leer('src/App.vue')
  assert.ok(app.includes(':to="RUTA_ALOJAMIENTO"') && app.includes('Alojamiento de datos fuera de Chile'), 'pie de página')
})

probar('12. Los enlaces con ancla llevan a la sección y el resto de las rutas no cambia su desplazamiento', () => {
  const router = leer('src/router/index.js')
  assert.match(router, /scrollBehavior\(to, from, guardada\)/)
  assert.ok(router.includes('if (to.hash) return { el: to.hash'), 'se desplaza al ancla')
  assert.ok(/return false\s*\}/.test(router), 'sin ancla no se desplaza (comportamiento anterior)')
})

probar('13. Los textos nuevos no usan emojis ni muestran códigos RFxx', () => {
  const regexEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}]/u
  for (const ruta of ['src/data/alojamiento.js', 'src/components/AvisoAlojamiento.vue']) {
    const texto = leer(ruta)
    assert.equal(regexEmoji.test(texto), false, `${ruta} no debe tener emojis`)
    const plantilla = texto.match(/<template>([\s\S]*)<\/template>/)
    if (plantilla) assert.equal(/\bRF\d+\b/i.test(plantilla[1]), false, `${ruta} no debe mostrar RFxx`)
  }
  assert.equal(/\bRF\d+\b/i.test(JSON.stringify([a.PROVEEDORES, a.BASE_LEGAL, a.PROTECCIONES, a.QUE_PUEDES_HACER, a.RESUMEN_CORTO, a.textoDocumento()])), false)
})

console.log(`\nTodas las pruebas de RF95 pasaron exitosamente (${pasadas}/${pasadas}).`)
