#!/usr/bin/env node
// Bloquea commits que incluyan secretos o archivos de entorno (RF69).
// Revisa solo lo que está en el área de preparación (git add). Sin dependencias.
import { execFileSync } from 'node:child_process'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const ARCHIVOS_PROHIBIDOS = [/(^|\/)\.env(\.(?!example$).+)?$/, /\.pem$/, /\.p12$/, /(^|\/)id_(rsa|ed25519)$/]
const PATRONES = [
  [/sb_secret_[A-Za-z0-9_-]{16,}/, 'clave secreta de Supabase (sb_secret_...)'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'llave privada'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT (posible clave service_role o token)'],
  [/\b(?:SUPABASE_SECRET_KEY|CLAVE_CIFRADO_CAMPOS|SERVICE_ROLE_KEY)\s*=\s*["']?[^\s"'#]{8,}/, 'variable secreta con valor']
]

const preparados = git('diff', '--cached', '--name-only', '--diff-filter=ACM').split('\n').filter(Boolean)
const problemas = []

for (const archivo of preparados) {
  if (ARCHIVOS_PROHIBIDOS.some((r) => r.test(archivo))) {
    problemas.push(`${archivo}: archivo de entorno o llave; no debe versionarse`)
    continue
  }
  if (/\.(png|jpe?g|gif|ico|pdf|woff2?|lock)$/i.test(archivo) || archivo.endsWith('package-lock.json')) continue
  let contenido
  try { contenido = git('show', `:${archivo}`) } catch { continue }
  for (const [patron, nombre] of PATRONES) {
    if (patron.test(contenido)) problemas.push(`${archivo}: contiene ${nombre}`)
  }
}

if (problemas.length) {
  console.error('\n✖ Commit bloqueado: posible secreto en los cambios:')
  for (const p of problemas) console.error(`  - ${p}`)
  console.error('\nQuita el secreto, rótalo si ya se publicó y vuelve a intentar.\n')
  process.exit(1)
}
