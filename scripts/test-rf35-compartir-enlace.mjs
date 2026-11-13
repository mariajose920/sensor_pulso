#!/usr/bin/env node
/**
 * sensor_pulso · Pruebas de RF35 (compartir una medición pública mediante enlace)
 */
import assert from 'node:assert/strict'
import {
  esTokenValido,
  construirEnlace,
  extraerToken,
  compartirEnlace,
  mapearPublicacion
} from '../src/utils/enlacePublico.js'

let ok = 0
const prueba = async (nombre, fn) => { await fn(); ok++; console.log('  ✔', nombre) }

const TOKEN = 'a1b2c3d4e5f60718293a4b5c' // 12 bytes en hexadecimal

await prueba('valida el formato del token', () => {
  assert.ok(esTokenValido(TOKEN))
  for (const t of ['', 'abc', TOKEN + 'f', TOKEN.toUpperCase(), 'z'.repeat(24), null, undefined, 123, "' or 1=1 --"]) {
    assert.equal(esTokenValido(t), false, String(t))
  }
})

await prueba('arma el enlace con el origen y rechaza tokens inválidos', () => {
  assert.equal(construirEnlace(TOKEN, 'https://sensor.app'), `https://sensor.app/publica/${TOKEN}`)
  assert.equal(construirEnlace(TOKEN, 'https://sensor.app/'), `https://sensor.app/publica/${TOKEN}`)
  assert.equal(construirEnlace('malo', 'https://sensor.app'), '')
})

await prueba('extrae el token de un enlace o de un token suelto', () => {
  assert.equal(extraerToken(`https://sensor.app/publica/${TOKEN}`), TOKEN)
  assert.equal(extraerToken(`  http://localhost:5173/publica/${TOKEN}?x=1 `), TOKEN)
  assert.equal(extraerToken(TOKEN), TOKEN)
  assert.equal(extraerToken('https://sensor.app/otra/ruta'), '')
  assert.equal(extraerToken(`https://sensor.app/publica/${TOKEN}zz`), '')
})

await prueba('compartir usa el menú del dispositivo si existe', async () => {
  let recibido
  const nav = { share: async (d) => { recibido = d } }
  assert.equal(await compartirEnlace({ url: 'https://x/publica/' + TOKEN, titulo: 'T' }, nav), 'compartido')
  assert.equal(recibido.url, 'https://x/publica/' + TOKEN)
})

await prueba('si la persona cancela el menú de compartir no se copia nada', async () => {
  let copiado = false
  const nav = {
    share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e },
    clipboard: { writeText: async () => { copiado = true } }
  }
  assert.equal(await compartirEnlace({ url: 'https://x' }, nav), 'cancelado')
  assert.equal(copiado, false)
})

await prueba('sin menú de compartir, copia al portapapeles', async () => {
  let texto
  const nav = { clipboard: { writeText: async (t) => { texto = t } } }
  assert.equal(await compartirEnlace({ url: 'https://x/p' }, nav), 'copiado')
  assert.equal(texto, 'https://x/p')
})

await prueba('si falla compartir por otra razón, intenta copiar', async () => {
  let texto
  const nav = {
    share: async () => { throw new Error('no soportado') },
    clipboard: { writeText: async (t) => { texto = t } }
  }
  assert.equal(await compartirEnlace({ url: 'https://x/p' }, nav), 'copiado')
  assert.equal(texto, 'https://x/p')
})

await prueba('si no se puede compartir ni copiar, pide copiar a mano', async () => {
  assert.equal(await compartirEnlace({ url: 'https://x/p' }, {}), 'manual')
  assert.equal(await compartirEnlace({ url: 'https://x/p' }, { clipboard: { writeText: async () => { throw new Error('denegado') } } }), 'manual')
  assert.equal(await compartirEnlace({ url: '' }, {}), 'manual')
})

await prueba('la publicación mapeada no trae datos que identifiquen a la persona', () => {
  const p = mapearPublicacion({
    token_enlace: TOKEN, titulo: null, actividad: 'caminata', rango_edad: '18-24', ritmo: 'normal',
    calidad: 'buena', bpm_promedio: '92.0', spo2_promedio: '97.5', dentro_de_rango: true,
    creada_en: '2026-11-13T10:00:00Z', autor_id: 'no-debe-salir', email: 'no@debe.salir'
  })
  assert.equal(p.titulo, 'Medición pública')
  assert.equal(p.actividad, 'Caminata')
  assert.equal(p.bpm, 92)
  assert.equal(p.spo2, 97.5)
  assert.ok(!('autor_id' in p) && !('email' in p) && !('autorId' in p))
  assert.equal(mapearPublicacion(null), null)
  assert.equal(mapearPublicacion({ token_enlace: TOKEN, actividad: 'xyz', rango_edad: '50+' }).actividad, 'Sin actividad indicada')
})

console.log(`\nRF35: ${ok} pruebas correctas`)
