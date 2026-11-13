#!/usr/bin/env node
/**
 * sensor_pulso · Pruebas de RF33 (casos precargados de patologías y arritmias)
 */
import assert from 'node:assert/strict'
import {
  listarCasos,
  listarCategorias,
  filtrarCasos,
  obtenerCaso,
  obtenerSenalesCaso,
  serieAPuntosSvg
} from '../src/services/casosService.js'

let ok = 0
const prueba = (nombre, fn) => { fn(); ok++; console.log('  ✔', nombre) }

prueba('hay casos precargados con los datos educativos completos', () => {
  const casos = listarCasos()
  assert.ok(casos.length >= 7)
  for (const c of casos) {
    for (const k of ['id', 'nombre', 'categoria', 'severidad', 'bpm', 'fisiopatologia', 'criterioPpg', 'criterioEcg']) {
      assert.ok(c[k] !== undefined && c[k] !== '', `${c.id} sin ${k}`)
    }
  }
  assert.equal(new Set(casos.map((c) => c.id)).size, casos.length, 'ids repetidos')
})

prueba('incluye patologías y arritmias, no solo el ritmo normal', () => {
  const ids = listarCasos().map((c) => c.id)
  for (const id of ['fibrilacion_auricular', 'flutter_auricular', 'extrasistoles_pvc']) assert.ok(ids.includes(id), id)
})

prueba('categorías sin repetir', () => {
  const cats = listarCategorias()
  assert.equal(new Set(cats.map((c) => c.valor)).size, cats.length)
  assert.ok(cats.length >= 2)
})

prueba('filtra por categoría, gravedad y texto sin importar tildes', () => {
  assert.equal(filtrarCasos().length, listarCasos().length)
  assert.ok(filtrarCasos({ categoria: 'auricular' }).every((c) => c.categoria === 'auricular'))
  assert.ok(filtrarCasos({ severidad: 'alta' }).every((c) => c.severidad === 'alta'))
  const r = filtrarCasos({ texto: 'FIBRILACION' })
  assert.ok(r.some((c) => c.id === 'fibrilacion_auricular'))
  assert.equal(filtrarCasos({ texto: 'zzzz-no-existe' }).length, 0)
})

prueba('obtiene un caso por id y devuelve null si no existe', () => {
  assert.equal(obtenerCaso('flutter_auricular').id, 'flutter_auricular')
  assert.equal(obtenerCaso('nada'), null)
  assert.equal(obtenerSenalesCaso('nada'), null)
})

prueba('cada caso genera PPG y ECG alineados y con valores finitos', () => {
  for (const c of listarCasos()) {
    const s = obtenerSenalesCaso(c.id, 4, 100)
    assert.equal(s.ppg.length, 400)
    assert.equal(s.ecg.length, 400)
    assert.ok(s.ppg.every(Number.isFinite) && s.ecg.every(Number.isFinite), c.id)
    assert.ok(Math.max(...s.ppg) > Math.min(...s.ppg), `${c.id} PPG plana`)
  }
})

prueba('serieAPuntosSvg ajusta la serie al recuadro', () => {
  const pts = serieAPuntosSvg([0, 5, 10], 600, 100, 6).split(' ').map((p) => p.split(',').map(Number))
  assert.equal(pts.length, 3)
  assert.equal(pts[0][0], 0)
  assert.equal(pts[2][0], 600)
  assert.ok(pts.every(([, y]) => y >= 6 && y <= 94))
  assert.equal(serieAPuntosSvg([]), '')
})

console.log(`\nRF33: ${ok} pruebas correctas`)
