/**
 * Lee las migraciones de Supabase y reconstruye qué tablas y columnas existen en el esquema `public`.
 * Sirve para las pruebas: comprueba, sin conectarse a la base, que lo que el código documenta existe.
 *
 * Reconoce `create table public.x (...)` y `alter table public.x add column ...`.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const NO_ES_COLUMNA = /^(primary|foreign|unique|check|constraint|exclude|like)\b/i

function partirPorComasDeNivelSuperior(texto) {
  const partes = []
  let nivel = 0
  let actual = ''
  for (const ch of texto) {
    if (ch === '(') nivel++
    if (ch === ')') nivel--
    if (ch === ',' && nivel === 0) {
      partes.push(actual)
      actual = ''
    } else {
      actual += ch
    }
  }
  partes.push(actual)
  return partes
}

/** Devuelve un Map tabla -> Set de columnas. */
export function leerEsquemaDeMigraciones(carpeta) {
  const tablas = new Map()
  const archivos = readdirSync(carpeta).filter(f => f.endsWith('.sql')).sort()

  for (const archivo of archivos) {
    const sql = readFileSync(join(carpeta, archivo), 'utf8').replace(/--[^\n]*/g, '')

    const reCrear = /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi
    let m
    while ((m = reCrear.exec(sql))) {
      const columnas = tablas.get(m[1]) || new Set()
      for (const parte of partirPorComasDeNivelSuperior(m[2])) {
        const t = parte.trim()
        if (!t || NO_ES_COLUMNA.test(t)) continue
        const nombre = t.match(/^"?(\w+)"?\s+/)
        if (nombre) columnas.add(nombre[1])
      }
      tablas.set(m[1], columnas)
    }

    const reAlter = /alter table (?:if exists )?public\.(\w+)\s+([\s\S]*?);/gi
    while ((m = reAlter.exec(sql))) {
      const reAgregar = /add column (?:if not exists )?"?(\w+)"?/gi
      let a
      while ((a = reAgregar.exec(m[2]))) {
        const columnas = tablas.get(m[1]) || new Set()
        columnas.add(a[1])
        tablas.set(m[1], columnas)
      }
    }
  }
  return tablas
}

/** Columnas que no se clasifican: identificadores, claves foráneas («..._id»), autores («..._por») y marcas de tiempo («..._en»). */
export function esColumnaTecnica(nombre) {
  return /(^id$|_id$|_en$|_por$)/.test(nombre)
}
