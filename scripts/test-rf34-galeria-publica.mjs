#!/usr/bin/env node
/**
 * sensor_pulso · Pruebas de RF34 (galería pública con filtros por actividad, edad y estado)
 */
import assert from 'node:assert/strict'
import { MEDICIONES_PUBLICAS_PRECARGADAS } from '../src/data/galeriaPublica.js'
import {
  estadoDeMedicion,
  prepararGaleria,
  filtrarGaleria,
  contarPorFiltro,
  RANGOS_EDAD
} from '../src/services/galeriaService.js'

let ok = 0
const prueba = (nombre, fn) => { fn(); ok++; console.log('  ✔', nombre) }

const galeria = prepararGaleria(MEDICIONES_PUBLICAS_PRECARGADAS)

prueba('la galería solo contiene mediciones públicas y cada una trae su estado', () => {
  assert.ok(galeria.length >= 5)
  assert.ok(galeria.every((m) => m.origen === 'publica' && ['dentro', 'fuera'].includes(m.estado)))
  assert.equal(prepararGaleria([{ origen: 'propia', bpm: 70 }]).length, 0)
  assert.deepEqual(prepararGaleria(null), [])
})

prueba('no expone datos que identifiquen a la persona', () => {
  for (const m of galeria) {
    assert.ok(!('autor_id' in m) && !('autorId' in m) && !('email' in m), m.id)
    assert.ok(RANGOS_EDAD.includes(m.rangoEdad), `${m.id}: rango de edad ${m.rangoEdad}`)
  }
})

prueba('estado: usa el dato de la base si existe y si no lo calcula con actividad y SpO2', () => {
  assert.equal(estadoDeMedicion({ dentroDeRango: false, bpm: 70, categoria: 'reposo' }), 'fuera')
  assert.equal(estadoDeMedicion({ dentroDeRango: true, bpm: 200, categoria: 'reposo' }), 'dentro')
  assert.equal(estadoDeMedicion({ bpm: 72, spo2: 98, categoria: 'reposo' }), 'dentro')
  assert.equal(estadoDeMedicion({ bpm: 110, spo2: 98, categoria: 'reposo' }), 'fuera')
  assert.equal(estadoDeMedicion({ bpm: 110, spo2: 98, categoria: 'ejercicio' }), 'dentro')
  assert.equal(estadoDeMedicion({ bpm: 72, spo2: 90, categoria: 'reposo' }), 'fuera')
  assert.equal(estadoDeMedicion({ categoria: 'reposo' }), 'fuera')
})

prueba('filtra por actividad', () => {
  const r = filtrarGaleria(galeria, { actividad: 'caminata' })
  assert.ok(r.length > 0 && r.every((m) => m.categoria === 'caminata'))
})

prueba('filtra por edad', () => {
  const r = filtrarGaleria(galeria, { edad: '50+' })
  assert.ok(r.length > 0 && r.every((m) => m.rangoEdad === '50+'))
})

prueba('filtra por estado', () => {
  const fuera = filtrarGaleria(galeria, { estado: 'fuera' })
  assert.ok(fuera.length > 0 && fuera.every((m) => m.estado === 'fuera'))
  const dentro = filtrarGaleria(galeria, { estado: 'dentro' })
  assert.equal(dentro.length + fuera.length, galeria.length)
})

prueba('combina filtros y sin filtros devuelve todo', () => {
  assert.equal(filtrarGaleria(galeria).length, galeria.length)
  const r = filtrarGaleria(galeria, { actividad: 'reposo', edad: '18-24', estado: 'dentro' })
  assert.ok(r.every((m) => m.categoria === 'reposo' && m.rangoEdad === '18-24' && m.estado === 'dentro'))
  assert.equal(filtrarGaleria(galeria, { actividad: 'ejercicio', edad: '50+' }).length, 0)
})

prueba('los conteos suman el total en cada filtro', () => {
  const c = contarPorFiltro(galeria)
  for (const k of ['actividad', 'edad', 'estado']) {
    assert.equal(Object.values(c[k]).reduce((a, b) => a + b, 0), galeria.length, k)
  }
})

console.log(`\nRF34: ${ok} pruebas correctas`)
