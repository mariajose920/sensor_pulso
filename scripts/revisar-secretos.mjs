#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Escáner de Secretos y Variables de Entorno (RF69)
 * ============================================================================
 * Impide que claves secretas, llaves privadas o archivos con credenciales se
 * guarden o versionen en el repositorio o en el historial nuevo de Git.
 *
 * Puede ejecutarse:
 *   - En el hook pre-commit: node scripts/revisar-secretos.mjs (revisa staged)
 *   - En CI o auditoría local: node scripts/revisar-secretos.mjs --todo
 *   - Sobre el historial nuevo: node scripts/revisar-secretos.mjs --historial [N]
 *   - Rango de commits: node scripts/revisar-secretos.mjs --rango <desde..hasta>
 * ============================================================================
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Ejecuta un comando git de forma síncrona y segura */
export const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (err) {
    if (err.status !== 0 && !err.stdout) {
      throw err
    }
    return err.stdout || ''
  }
}

/**
 * Archivos prohibidos que jamás deben versionarse en el repositorio.
 * Incluye archivos de entorno no-ejemplo, certificados, llaves privadas y credenciales.
 */
export const ARCHIVOS_PROHIBIDOS = [
  /(^|\/)\.env(\.(?!example$).+)?$/i,
  /\.(pem|p12|pkcs12|key|crt)$/i,
  /(^|\/)id_(rsa|ed25519)(\.pub)?$/i,
  /(^|\/)(credentials|service-account.*|client_secret.*)\.json$/i
]

/**
 * Extensiones de archivos binarios, imágenes y empaquetados que se excluyen del análisis de texto
 */
export const EXTENSIONES_IGNORADAS = /\.(png|jpe?g|gif|ico|pdf|woff2?|lock|svg|mp4|webm|zip|tar|gz)$/i

/**
 * Archivos de infraestructura de pruebas o el mismo escáner donde los patrones o cadenas sintéticas son necesarios
 */
export const ARCHIVOS_EXCLUIDOS_DE_CONTENIDO = [
  /(^|\/)scripts\/revisar-secretos\.mjs$/,
  /(^|\/)scripts\/test-rf69-manejo-secretos\.js$/
]

/**
 * Valores de ejemplo permitidos explícitamente en documentación o plantillas
 */
export const VALORES_EJEMPLO_PERMITIDOS = [
  're_tu_clave_de_resend_aqui',
  'tu_clave_anon_de_supabase_aqui',
  'esp_demotoken_unach_2026_rf05',
  'jwt_token_valido_unach'
]

/**
 * Patrones regulares de detección de secretos de alta entropía y credenciales conocidas.
 */
export const PATRONES_SECRETOS = [
  {
    id: 'supabase_secret',
    nombre: 'clave secreta de Supabase (sb_secret_...)',
    regex: /sb_secret_[A-Za-z0-9_-]{16,}/g
  },
  {
    id: 'llave_privada',
    nombre: 'llave privada criptográfica (RSA/EC/DSA/OPENSSH/PGP)',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g
  },
  {
    id: 'jwt_secreto',
    nombre: 'JSON Web Token (JWT) sospechoso (posible service_role o token)',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  },
  {
    id: 'resend_api_key',
    nombre: 'clave de API de Resend (re_...)',
    regex: /\bre_[A-Za-z0-9]{20,}\b/g,
    esIgnorable: (match) => VALORES_EJEMPLO_PERMITIDOS.includes(match)
  },
  {
    id: 'variable_secreta_asignada',
    nombre: 'asignación de variable sensible de entorno con valor real',
    regex: /\b(?:SUPABASE_SECRET_KEY|CLAVE_CIFRADO_CAMPOS|SERVICE_ROLE_KEY)[ \t]*=[ \t]*["']?[^\s"'#]{8,}/g,
    esIgnorable: (match) => {
      // Permitir si el valor coincide con placeholders conocidos o referencias a variables
      return match.includes('re_tu_clave_') || match.includes('${') || match.includes('process.env')
    }
  },
  {
    id: 'prefijo_vite_prohibido',
    nombre: 'variable secreta con prefijo público VITE_ (expone secretos al navegador)',
    regex: /\bVITE_(?:SUPABASE_SECRET_KEY|CLAVE_CIFRADO|SERVICE_ROLE_KEY|RESEND_API_KEY)\b/g,
    esIgnorable: (match, linea, archivo) => {
      // Ignorar en archivos Markdown (.md) que documentan la regla prohibitiva
      return Boolean(archivo && archivo.endsWith('.md'))
    }
  },
  {
    id: 'github_token',
    nombre: 'token personal de acceso de GitHub (ghp_... / github_pat_...)',
    regex: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g
  },
  {
    id: 'aws_access_key',
    nombre: 'Access Key ID de AWS (AKIA...)',
    regex: /\bAKIA[0-9A-Z]{16}\b/g
  },
  {
    id: 'slack_token',
    nombre: 'token de autenticación de Slack (xox...)',
    regex: /\bxox[baprs]-[0-9A-Za-z_-]{10,}\b/g
  },
  {
    id: 'stripe_secret',
    nombre: 'clave secreta en vivo de Stripe (sk_live_... / rk_live_...)',
    regex: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g
  },
  {
    id: 'google_api_key',
    nombre: 'clave de API de Google (AIza...)',
    regex: /\bAIza[0-9A-Za-z-_]{35}\b/g
  }
]

/**
 * Escanea una cadena de texto en busca de patrones de secretos.
 *
 * @param {string} contenido - Texto a examinar
 * @param {string} [nombreArchivo=''] - Nombre del archivo analizado
 * @returns {Array<{ regla: string, descripcion: string, hallazgo: string, linea: number }>}
 */
export function escanearTexto(contenido, nombreArchivo = '') {
  if (!contenido || typeof contenido !== 'string') return []

  // Si el archivo está expresamente excluido de análisis de contenido
  if (ARCHIVOS_EXCLUIDOS_DE_CONTENIDO.some((r) => r.test(nombreArchivo.replace(/\\/g, '/')))) {
    return []
  }

  const hallazgos = []
  const lineas = contenido.split('\n')

  for (let numLinea = 0; numLinea < lineas.length; numLinea++) {
    const linea = lineas[numLinea]

    for (const regla of PATRONES_SECRETOS) {
      regla.regex.lastIndex = 0
      let match
      while ((match = regla.regex.exec(linea)) !== null) {
        const textoMatch = match[0]
        if (typeof regla.esIgnorable === 'function' && regla.esIgnorable(textoMatch, linea, nombreArchivo)) {
          continue
        }
        hallazgos.push({
          regla: regla.id,
          descripcion: regla.nombre,
          hallazgo: textoMatch.length > 20 ? `${textoMatch.slice(0, 10)}...${textoMatch.slice(-4)}` : textoMatch,
          linea: numLinea + 1
        })
      }
    }
  }

  return hallazgos
}

/**
 * Escanea una lista de nombres de archivos en el repositorio.
 *
 * @param {string[]} listaArchivos - Rutas relativas de archivos
 * @param {Object} [opciones={}]
 * @param {Function} [opciones.obtenerContenido] - Función para leer el archivo
 * @returns {Array<{ archivo: string, motivo: string, detalles?: any }>}
 */
export function escanearArchivos(listaArchivos, opciones = {}) {
  const problemas = []
  const obtenerContenido = opciones.obtenerContenido || ((archivo) => {
    try {
      return fs.readFileSync(archivo, 'utf8')
    } catch {
      return null
    }
  })

  for (const archivo of listaArchivos) {
    const normalizado = archivo.replace(/\\/g, '/')

    // 1. Verificar nombre contra archivos prohibidos (.env*, llaves, etc.)
    if (ARCHIVOS_PROHIBIDOS.some((r) => r.test(normalizado))) {
      problemas.push({
        archivo,
        motivo: 'archivo prohibido (archivo de entorno, llave o credencial; no debe versionarse)'
      })
      continue
    }

    // Ignorar binarios y bloqueos
    if (EXTENSIONES_IGNORADAS.test(normalizado) || normalizado.endsWith('package-lock.json')) {
      continue
    }

    // 2. Analizar contenido
    const contenido = obtenerContenido(archivo)
    if (!contenido) continue

    const hallazgos = escanearTexto(contenido, normalizado)
    for (const h of hallazgos) {
      problemas.push({
        archivo,
        motivo: `contiene ${h.descripcion} (línea ${h.linea})`,
        detalles: h
      })
    }
  }

  return problemas
}

/**
 * Escanea los archivos actualmente preparados para commit (git add / staged)
 *
 * @returns {Array<{ archivo: string, motivo: string }>}
 */
export function escanearStaged() {
  const diffStaged = git('diff', '--cached', '--name-only', '--diff-filter=ACM')
  const preparados = diffStaged.split('\n').map((l) => l.trim()).filter(Boolean)
  if (preparados.length === 0) return []

  return escanearArchivos(preparados, {
    obtenerContenido: (archivo) => {
      try {
        return git('show', `:${archivo}`)
      } catch {
        return null
      }
    }
  })
}

/**
 * Escanea todo el repositorio rastreado por Git.
 *
 * @returns {Array<{ archivo: string, motivo: string }>}
 */
export function escanearRepositorio() {
  const salida = git('ls-files')
  const archivos = salida.split('\n').map((l) => l.trim()).filter(Boolean)
  return escanearArchivos(archivos, {
    obtenerContenido: (archivo) => {
      try {
        return fs.readFileSync(archivo, 'utf8')
      } catch {
        return null
      }
    }
  })
}

/**
 * Escanea el historial reciente de Git en busca de secretos introducidos en commits nuevos.
 *
 * @param {Object} [opciones={}]
 * @param {number} [opciones.cantidad=15] - Cantidad de commits recientes a revisar
 * @param {string} [opciones.rango] - Rango explícito de commits (ej. "origin/develop..HEAD")
 * @returns {Array<{ commit: string, mensaje: string, archivo: string, motivo: string }>}
 */
export function escanearHistorial(opciones = {}) {
  let commits = []

  if (opciones.rango) {
    try {
      const salida = git('log', opciones.rango, '--format=%H %s')
      commits = salida.split('\n').map((l) => l.trim()).filter(Boolean)
    } catch {
      commits = []
    }
  } else {
    const cantidad = opciones.cantidad || 15
    try {
      const salida = git('log', `-n`, String(cantidad), '--format=%H %s')
      commits = salida.split('\n').map((l) => l.trim()).filter(Boolean)
    } catch {
      commits = []
    }
  }

  const problemasHistorial = []

  for (const lineaCommit of commits) {
    const [hash, ...restoMensaje] = lineaCommit.split(' ')
    const mensaje = restoMensaje.join(' ')

    // Obtener los cambios introducidos por este commit específico
    let diffCommit = ''
    try {
      diffCommit = git('show', '--unified=0', '--no-color', hash)
    } catch {
      continue
    }

    const lineas = diffCommit.split('\n')
    let archivoActual = ''

    for (const linea of lineas) {
      if (linea.startsWith('diff --git ')) {
        const partes = linea.split(' ')
        archivoActual = partes[partes.length - 1].replace(/^b\//, '')
        
        // Verificar si se introdujo un archivo prohibido en este commit
        if (ARCHIVOS_PROHIBIDOS.some((r) => r.test(archivoActual))) {
          problemasHistorial.push({
            commit: hash.slice(0, 7),
            mensaje,
            archivo: archivoActual,
            motivo: 'agrega o modifica un archivo prohibido de entorno o llaves'
          })
        }
        continue
      }

      // Solo analizar líneas añadidas en el commit (+...), ignorando la cabecera +++
      if (linea.startsWith('+') && !linea.startsWith('+++')) {
        const contenidoAgregado = linea.slice(1)
        const hallazgos = escanearTexto(contenidoAgregado, archivoActual)
        for (const h of hallazgos) {
          problemasHistorial.push({
            commit: hash.slice(0, 7),
            mensaje,
            archivo: archivoActual,
            motivo: `agrega ${h.descripcion}`
          })
        }
      }
    }
  }

  return problemasHistorial
}

/**
 * Función principal CLI
 */
export function ejecutarCli(args = process.argv.slice(2)) {
  const flags = {
    todo: args.includes('--todo') || args.includes('--repo') || args.includes('--all'),
    historial: args.includes('--historial') || args.includes('--commits'),
    rangoIdx: args.indexOf('--rango'),
    ayuda: args.includes('--ayuda') || args.includes('-h')
  }

  if (flags.ayuda) {
    console.log(`
Uso: node scripts/revisar-secretos.mjs [opciones]

Opciones:
  (sin opciones)     Revisa los archivos en el área de preparación (git staged) [pre-commit hook]
  --todo, --repo     Revisa la totalidad de archivos rastreados en el repositorio
  --historial [N]    Revisa los últimos N commits en busca de claves introducidas (defecto: 15)
  --rango <A..B>     Revisa los commits en el rango especificado (útil para CI / Pull Requests)
  -h, --ayuda        Muestra esta ayuda
`)
    return 0
  }

  console.log('🔍 Ejecutando escáner de secretos (RF69)...')

  let problemas = []

  if (flags.todo) {
    console.log('Modo: Escaneo completo de archivos del repositorio')
    problemas = escanearRepositorio()
  } else if (flags.rangoIdx !== -1 && args[flags.rangoIdx + 1]) {
    const rango = args[flags.rangoIdx + 1]
    console.log(`Modo: Escaneo de commits en rango «${rango}»`)
    problemas = escanearHistorial({ rango })
  } else if (flags.historial) {
    const argCantidad = args[args.indexOf('--historial') + 1] || args[args.indexOf('--commits') + 1]
    const cantidad = parseInt(argCantidad, 10) || 15
    console.log(`Modo: Escaneo de los últimos ${cantidad} commits del historial`)
    problemas = escanearHistorial({ cantidad })
  } else {
    // Modo por defecto: área de preparación (staged) para pre-commit
    problemas = escanearStaged()
  }

  if (problemas.length > 0) {
    console.error('\n✖ Se detectaron posibles secretos o archivos prohibidos en los cambios:')
    for (const p of problemas) {
      if (p.commit) {
        console.error(`  - [Commit ${p.commit}: "${p.mensaje}"] ${p.archivo}: ${p.motivo}`)
      } else {
        console.error(`  - ${p.archivo}: ${p.motivo}`)
      }
    }
    console.error('\nQuita el secreto, rótalo si ya se publicó y vuelve a intentar.\n')
    return 1
  }

  console.log('✅ Escáner de secretos: sin problemas detectados (0 secretos).\n')
  return 0
}

// Ejecución directa si se invoca como script CLI
const rutaActual = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(rutaActual)) {
  const codigoSalida = ejecutarCli()
  if (codigoSalida !== 0) {
    process.exit(codigoSalida)
  }
}
