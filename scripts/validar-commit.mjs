#!/usr/bin/env node
// Valida los mensajes de commit (RF74): la primera línea debe mencionar el requerimiento
// (RFNN o RNFNN, NN = número). Todo lo demás es libre: mayúsculas, puntos y largo no importan.
//   Válidos:   RF12: esquema de base de datos   |   feat(rf12): esquema   |   corrige el calculo (rnf04)
//   Inválidos: arreglos varios                  |   rf: sin numero
//
// Uso:
//   node scripts/validar-commit.mjs <archivo-con-el-mensaje>   (hook commit-msg)
//   node scripts/validar-commit.mjs --rango <base>..<cabeza>   (CI: revisa todos los commits del rango)
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REQUERIMIENTO = /(?<![A-Za-z0-9])(?:rf|rnf)\d{1,3}(?!\d)/i

// Mensajes generados por Git que no se validan.
const EXENTOS = [/^Merge /, /^Revert "/, /^fixup! /, /^squash! /, /^amend! /]

export function validarMensaje(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => !l.startsWith('#'))
  const encabezado = (lineas[0] ?? '').trim()
  if (!encabezado) return ['El mensaje de commit está vacío.']
  if (EXENTOS.some((r) => r.test(encabezado))) return []
  if (!REQUERIMIENTO.test(encabezado)) {
    return ['La primera línea debe mencionar el requerimiento: RFNN o RNFNN (NN = número). Ejemplos: "RF12: esquema de base de datos", "feat(rf12): esquema".']
  }
  return []
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
