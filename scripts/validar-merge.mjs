#!/usr/bin/env node
// Hook pre-merge-commit (RF74): al unir una rama en develop o main, en tu computador, no deja
// completar la unión si la rama de origen no cumple el formato o si el resultado no compila.
// (En GitHub, lo mismo lo exige el flujo "Validar cambios" con la protección de ramas.)
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { validarRama } from './validar-rama.mjs'
import { validarMensaje } from './validar-commit.mjs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

const actual = git('branch', '--show-current')
if (!['develop', 'main'].includes(actual)) process.exit(0)       // solo importa al unir hacia develop o main

const errores = []

// En este hook Git aún no escribe MERGE_HEAD; la rama que se une viene en GIT_REFLOG_ACTION
// ("merge <argumentos>"). Se toma el último argumento que sea una referencia a un commit.
const argumentos = (process.env.GIT_REFLOG_ACTION ?? '').split(/\s+/).slice(1).filter((t) => t && !t.startsWith('-'))
let origen = null
let origenSha = null
for (const token of argumentos.reverse()) {
  try {
    origenSha = git('rev-parse', '--verify', '--quiet', `${token}^{commit}`)
    origen = token.replace(/^(?:refs\/heads\/|refs\/remotes\/origin\/|origin\/)/, '')
    break
  } catch { /* no es una referencia */ }
}
if (!origen) process.exit(0)             // no se pudo identificar la rama: no se bloquea a ciegas

errores.push(...validarRama(origen))

// Mensajes de los commits que entran.
for (const sha of git('log', '--no-merges', '--format=%H', `HEAD..${origenSha}`).split('\n').filter(Boolean)) {
  const fallos = validarMensaje(git('log', '-1', '--format=%B', sha))
  if (fallos.length) errores.push(`Commit ${sha.slice(0, 7)} (${git('log', '-1', '--format=%s', sha)}): ${fallos.join(' ')}`)
}

if (errores.length) {
  console.error(`\n✖ Unión bloqueada hacia ${actual}:`)
  for (const e of errores) console.error(`  - ${e}`)
  console.error('\nCancela la unión con: git merge --abort\n')
  process.exit(1)
}

// El resultado de la unión debe compilar.
const correr = (...args) => spawnSync(`npm ${args.join(' ')}`, { stdio: 'inherit', shell: true })
if (!existsSync('node_modules') && correr('ci').status !== 0) {
  console.error('\n✖ Unión bloqueada: no se pudieron instalar las dependencias.\n')
  process.exit(1)
}
console.log('pre-merge-commit: compilando el resultado de la unión...')
if (correr('run', 'build').status !== 0) {
  console.error(`\n✖ Unión bloqueada hacia ${actual}: la compilación falló. Cancela con: git merge --abort\n`)
  process.exit(1)
}
