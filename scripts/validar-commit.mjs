#!/usr/bin/env node
// Valida que los mensajes de commit sigan la convención del proyecto (RF74).
// Sin dependencias. Formato:  tipo(alcance): descripción
//
// Uso:
//   node scripts/validar-commit.mjs <archivo-con-el-mensaje>   (hook commit-msg)
//   node scripts/validar-commit.mjs --rango <base>..<cabeza>   (CI: revisa todos los commits del rango)
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export const TIPOS = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert', 'merge']

// Alcance: requerimiento (rf12, rnf04) o una de las áreas transversales.
const ALCANCE = /^(?:rf\d{2,3}|rnf\d{2}|repo|db|ci|docs|firmware|web|deps)(?:,(?:rf\d{2,3}|rnf\d{2}|repo|db|ci|docs|firmware|web|deps))*$/i
const ENCABEZADO = /^([a-z]+)\(([^)]+)\)(!)?: (.+)$/
const LARGO_MAXIMO = 100
const LARGO_MINIMO = 10

// Mensajes generados por Git que no se validan.
const EXENTOS = [/^Merge /, /^Revert "/, /^fixup! /, /^squash! /, /^amend! /]

export function validarMensaje(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => !l.startsWith('#'))
  const encabezado = (lineas[0] ?? '').trim()
  const errores = []

  if (!encabezado) return ['El mensaje de commit está vacío.']
  if (EXENTOS.some((r) => r.test(encabezado))) return []

  const m = ENCABEZADO.exec(encabezado)
  if (!m) {
    errores.push('El encabezado debe tener la forma  tipo(alcance): descripción  (ejemplo: feat(rf12): esquema de base de datos).')
  } else {
    const [, tipo, alcance, , descripcion] = m
    if (!TIPOS.includes(tipo)) errores.push(`Tipo "${tipo}" no válido. Usa uno de: ${TIPOS.join(', ')}.`)
    if (!ALCANCE.test(alcance)) errores.push(`Alcance "${alcance}" no válido. Usa rfNN, rnfNN, repo, db, ci, docs, firmware, web o deps (ej.: rf12).`)
    if (descripcion.trim().length < LARGO_MINIMO) errores.push(`La descripción es muy corta (mínimo ${LARGO_MINIMO} caracteres).`)
    if (/\.$/.test(descripcion)) errores.push('La descripción no debe terminar en punto.')
    if (/^[A-ZÁÉÍÓÚÑ]/.test(descripcion)) errores.push('La descripción debe comenzar en minúscula.')
  }

  if (encabezado.length > LARGO_MAXIMO) errores.push(`El encabezado tiene ${encabezado.length} caracteres; el máximo es ${LARGO_MAXIMO}.`)
  if (lineas.length > 1 && lineas[1].trim() !== '') errores.push('Debe haber una línea en blanco entre el encabezado y el cuerpo.')
  return errores
}

function mostrar(titulo, errores) {
  console.error(`\n✖ Mensaje de commit rechazado${titulo ? ` (${titulo})` : ''}:`)
  for (const e of errores) console.error(`  - ${e}`)
  console.error('\nGuía completa: docs/COMMITS.md\n')
}

function main() {
  const [a, b] = process.argv.slice(2)
  let fallos = 0

  if (a === '--rango') {
    const salida = execFileSync('git', ['log', '--no-merges', '--format=%H%x1f%B%x1e', b], { encoding: 'utf8' })
    for (const bloque of salida.split('\x1e')) {
      const [sha, ...resto] = bloque.trim().split('\x1f')
      if (!sha) continue
      const errores = validarMensaje(resto.join('\x1f'))
      if (errores.length) { fallos++; mostrar(sha.slice(0, 7), errores) }
    }
  } else if (a) {
    const errores = validarMensaje(readFileSync(a, 'utf8'))
    if (errores.length) { fallos++; mostrar('', errores) }
  } else {
    console.error('Uso: validar-commit.mjs <archivo> | --rango <base>..<cabeza>')
    process.exit(2)
  }
  process.exit(fallos ? 1 : 0)
}

import { fileURLToPath } from 'node:url'
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
