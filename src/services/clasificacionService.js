/**
 * Servicio de clasificación de los datos (RF56).
 *
 * Lee el catálogo `clasificacion_datos` y las funciones de resumen del servidor (solo administrador),
 * y ofrece funciones puras para agrupar, filtrar y contar sin tocar la base.
 */

import { supabase } from './supabase.js'
import { ORDEN_CLASES, metaClase, nombreTabla } from '../data/clasificacionDatos.js'

/** Fila del catálogo con los nombres que usa la interfaz. */
export function normalizarFila(raw = {}) {
  return Object.freeze({
    tabla: String(raw.tabla || ''),
    columna: String(raw.columna || ''),
    clase: metaClase(raw.clase) ? raw.clase : 'privado',
    cifrado: Boolean(raw.cifrado_campo),
    enmascarar: Boolean(raw.enmascarar)
  })
}

/** Cantidad de columnas por clase, más el total. */
export function contarPorClase(filas = []) {
  const conteos = { total: filas.length }
  for (const clase of ORDEN_CLASES) conteos[clase] = 0
  for (const f of filas) {
    if (conteos[f.clase] !== undefined) conteos[f.clase]++
  }
  return conteos
}

/** Filtra por clase, texto (tabla, nombre de la tabla o columna) y características de tratamiento. */
export function filtrarClasificacion(filas = [], { clase = 'todas', busqueda = '', soloCifradas = false, soloEnmascaradas = false } = {}) {
  const q = String(busqueda || '').trim().toLowerCase()
  return filas.filter(f => {
    if (clase !== 'todas' && f.clase !== clase) return false
    if (soloCifradas && !f.cifrado) return false
    if (soloEnmascaradas && !f.enmascarar) return false
    if (!q) return true
    return `${f.tabla} ${nombreTabla(f.tabla)} ${f.columna}`.toLowerCase().includes(q)
  })
}

/** Agrupa las columnas por tabla, con su nombre legible y cuántas hay de cada clase. */
export function agruparPorTabla(filas = []) {
  const grupos = new Map()
  for (const f of filas) {
    if (!grupos.has(f.tabla)) grupos.set(f.tabla, [])
    grupos.get(f.tabla).push(f)
  }
  return [...grupos.entries()]
    .map(([tabla, columnas]) => {
      const conteos = contarPorClase(columnas)
      // La tabla se muestra con la clase más protegida que contiene
      const claseMasAlta = [...ORDEN_CLASES].reverse().find(c => conteos[c] > 0) || 'privado'
      return {
        tabla,
        nombre: nombreTabla(tabla),
        columnas: [...columnas].sort((a, b) => a.columna.localeCompare(b.columna, 'es')),
        conteos,
        claseMasAlta
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Porcentaje de columnas (no técnicas) que ya están clasificadas. */
export function calcularCobertura(clasificadas = 0, sinClasificar = 0) {
  const total = Number(clasificadas) + Number(sinClasificar)
  if (total <= 0) return 100
  return Math.floor((Number(clasificadas) / total) * 100)
}

/** Convierte la respuesta de `resumen_clasificacion` en un objeto con valores seguros. */
export function normalizarResumen(raw = {}) {
  const porClase = raw?.por_clase || {}
  const total = Number(raw?.total) || 0
  const sinClasificar = Number(raw?.sin_clasificar) || 0
  const resumen = {
    total,
    porClase: Object.fromEntries(ORDEN_CLASES.map(c => [c, Number(porClase[c]) || 0])),
    cifrados: Number(raw?.cifrados) || 0,
    enmascaradas: Number(raw?.enmascaradas) || 0,
    sinClasificar,
    huerfanas: Array.isArray(raw?.huerfanas) ? raw.huerfanas.map(String) : []
  }
  resumen.cobertura = calcularCobertura(total, sinClasificar)
  return resumen
}

/** Catálogo completo de la clasificación. Devuelve { ok, filas } o { ok: false, filas: [], error }. */
export async function listarClasificacion() {
  try {
    const { data, error } = await supabase
      .from('clasificacion_datos')
      .select('tabla, columna, clase, cifrado_campo, enmascarar')
      .order('tabla', { ascending: true })
      .order('columna', { ascending: true })
    if (error) return { ok: false, filas: [], error: error.message }
    return { ok: true, filas: (data || []).map(normalizarFila) }
  } catch (err) {
    return { ok: false, filas: [], error: err?.message || 'Sin conexión con el servidor' }
  }
}

/** Totales y cobertura (solo administrador). */
export async function obtenerResumenClasificacion() {
  try {
    const { data, error } = await supabase.rpc('resumen_clasificacion')
    if (error) return { ok: false, resumen: normalizarResumen({}), error: error.message }
    return { ok: true, resumen: normalizarResumen(data || {}) }
  } catch (err) {
    return { ok: false, resumen: normalizarResumen({}), error: err?.message || 'Sin conexión con el servidor' }
  }
}

/** Columnas de la base que aún no están en el catálogo (solo administrador). */
export async function listarColumnasSinClasificar() {
  try {
    const { data, error } = await supabase.rpc('columnas_sin_clasificar')
    if (error) return { ok: false, columnas: [], error: error.message }
    const columnas = (data || []).map(c => ({ tabla: String(c.tabla), columna: String(c.columna), tipo: String(c.tipo || '') }))
    return { ok: true, columnas }
  } catch (err) {
    return { ok: false, columnas: [], error: err?.message || 'Sin conexión con el servidor' }
  }
}
