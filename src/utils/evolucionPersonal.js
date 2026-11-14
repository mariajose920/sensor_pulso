const ZONA_HORARIA_CHILE = 'America/Santiago'

function resolverRangoEnLista(rangos, actividadId, edad, personales = []) {
  const actId = Number(actividadId)
  const e = Number(edad)
  if (!Number.isFinite(actId) || !Number.isFinite(e)) return null

  const matchPersonal = (Array.isArray(personales) ? personales : []).find(
    (p) => Number(p.actividad_id) === actId
  )
  if (matchPersonal) {
    return { ...matchPersonal, origen: 'personal' }
  }

  const matchGlobal = (Array.isArray(rangos) ? rangos : []).find(
    (r) =>
      Number(r.actividad_id ?? r.actividad?.id) === actId &&
      e >= Number(r.edad_min) &&
      e <= Number(r.edad_max)
  )
  return matchGlobal ? { ...matchGlobal, origen: 'global' } : null
}

/**
 * Rangos de referencia por defecto (AHA / fisiología estándar) según actividad y edad,
 * utilizados como respaldo cuando la tabla `rangos` no devuelve una fila específica.
 */
const RANGOS_RESPALDO_ACTIVIDAD = [
  // Reposo (id: 1)
  { actividad_id: 1, codigo: 'reposo', nombre: 'Reposo', edad_min: 0, edad_max: 17, bpm_min: 60, bpm_max: 100 },
  { actividad_id: 1, codigo: 'reposo', nombre: 'Reposo', edad_min: 18, edad_max: 35, bpm_min: 60, bpm_max: 100 },
  { actividad_id: 1, codigo: 'reposo', nombre: 'Reposo', edad_min: 36, edad_max: 55, bpm_min: 60, bpm_max: 100 },
  { actividad_id: 1, codigo: 'reposo', nombre: 'Reposo', edad_min: 56, edad_max: 120, bpm_min: 60, bpm_max: 100 },
  // Caminata suave (id: 2)
  { actividad_id: 2, codigo: 'caminata', nombre: 'Caminata suave', edad_min: 0, edad_max: 35, bpm_min: 90, bpm_max: 120 },
  { actividad_id: 2, codigo: 'caminata', nombre: 'Caminata suave', edad_min: 36, edad_max: 120, bpm_min: 85, bpm_max: 115 },
  // Ejercicio moderado (id: 3)
  { actividad_id: 3, codigo: 'ejercicio_moderado', nombre: 'Ejercicio moderado', edad_min: 0, edad_max: 35, bpm_min: 120, bpm_max: 155 },
  { actividad_id: 3, codigo: 'ejercicio_moderado', nombre: 'Ejercicio moderado', edad_min: 36, edad_max: 120, bpm_min: 110, bpm_max: 145 },
  // Ejercicio intenso (id: 4)
  { actividad_id: 4, codigo: 'ejercicio_intenso', nombre: 'Ejercicio intenso', edad_min: 0, edad_max: 35, bpm_min: 150, bpm_max: 185 },
  { actividad_id: 4, codigo: 'ejercicio_intenso', nombre: 'Ejercicio intenso', edad_min: 36, edad_max: 120, bpm_min: 135, bpm_max: 170 },
  // Recuperación post-ejercicio (id: 5)
  { actividad_id: 5, codigo: 'recuperacion', nombre: 'Recuperación post-ejercicio', edad_min: 0, edad_max: 120, bpm_min: 80, bpm_max: 120 }
]

const ETIQUETAS_ACTIVIDAD = {
  reposo: 'Reposo',
  caminata: 'Caminata suave',
  ejercicio_moderado: 'Ejercicio moderado',
  ejercicio_intenso: 'Ejercicio intenso',
  recuperacion: 'Recuperación post-ejercicio'
}

function redondear1(valor) {
  const num = Number(valor)
  if (!Number.isFinite(num)) return null
  return Math.round(num * 10) / 10
}

/**
 * Convierte una fecha ISO o cadena YYYY-MM-DD al día calendario local (YYYY-MM-DD)
 * en la zona horaria America/Santiago.
 */
export function formatearDiaLocal(fechaEntrada) {
  if (!fechaEntrada) return null
  const texto = String(fechaEntrada).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto
  }
  const fecha = new Date(texto)
  if (Number.isNaN(fecha.getTime())) return null

  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_CHILE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(fecha)

  const anio = partes.find((p) => p.type === 'year')?.value
  const mes = partes.find((p) => p.type === 'month')?.value
  const dia = partes.find((p) => p.type === 'day')?.value
  if (!anio || !mes || !dia) return null
  return `${anio}-${mes}-${dia}`
}

/**
 * Formatea una fecha YYYY-MM-DD en formato legible corto (ej. "14 nov").
 */
export function formatearEtiquetaDia(diaIso) {
  if (!diaIso || !/^\d{4}-\d{2}-\d{2}$/.test(String(diaIso))) return String(diaIso || '—')
  const [anio, mes, dia] = String(diaIso).split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0))
  return fecha.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC'
  })
}

/**
 * Determina si una medición pertenece a la actividad solicitada (por defecto 'reposo').
 */
export function coincideActividadMedicion(medicion, { actividadCodigo = 'reposo', actividadId = 1 } = {}) {
  if (!medicion || typeof medicion !== 'object') return false
  const codigoBuscado = String(actividadCodigo || 'reposo').trim().toLowerCase()
  const idBuscado = Number(actividadId) || 1

  const codigoMedicion = String(
    medicion.actividad_codigo ??
    medicion.actividad?.codigo ??
    medicion.actividad ??
    ''
  ).trim().toLowerCase()

  const nombreMedicion = String(
    medicion.actividad?.nombre ??
    medicion.actividad_nombre ??
    ''
  ).trim().toLowerCase()

  const idMedicion = Number(medicion.actividad_id ?? medicion.actividad?.id)

  if (codigoMedicion) {
    return codigoMedicion === codigoBuscado
  }
  if (Number.isFinite(idMedicion) && idMedicion > 0) {
    return idMedicion === idBuscado
  }
  if (nombreMedicion) {
    return nombreMedicion.includes(codigoBuscado.replace('_', ' '))
  }
  // Si la medición no tiene actividad explícita asignada, el esquema de BD la asocia a reposo (actividad por defecto)
  return codigoBuscado === 'reposo'
}

/**
 * Resuelve el rango esperado de BPM según la edad y la actividad (RF19 + RF36),
 * priorizando los rangos configurados en la base de datos o personales del usuario.
 */
export function resolverRangoEsperado({
  edad = 30,
  actividadId = 1,
  actividadCodigo = 'reposo',
  rangosGlobales = [],
  rangosPersonales = []
} = {}) {
  const edadNum = Number(edad)
  const edadAplicada = Number.isFinite(edadNum) && edadNum > 0 ? Math.round(edadNum) : 30
  const codigoNorm = String(actividadCodigo || 'reposo').trim().toLowerCase()
  const idNorm = Number(actividadId) || 1

  const listaGlobal = Array.isArray(rangosGlobales) && rangosGlobales.length > 0
    ? rangosGlobales
    : RANGOS_RESPALDO_ACTIVIDAD

  // Filtrar también por código de actividad si los rangos traen `actividad.codigo` o `codigo`
  const candidatosGlobales = listaGlobal.filter((r) => {
    const rCodigo = String(r.codigo ?? r.actividad?.codigo ?? '').trim().toLowerCase()
    const rId = Number(r.actividad_id ?? r.actividad?.id)
    if (rCodigo && rCodigo === codigoNorm) return true
    if (Number.isFinite(rId) && rId === idNorm) return true
    return false
  })

  const resuelto = resolverRangoEnLista(
    candidatosGlobales.length > 0 ? candidatosGlobales : RANGOS_RESPALDO_ACTIVIDAD,
    idNorm,
    edadAplicada,
    Array.isArray(rangosPersonales) ? rangosPersonales : []
  )

  const respaldo = RANGOS_RESPALDO_ACTIVIDAD.find(
    (r) =>
      (r.codigo === codigoNorm || r.actividad_id === idNorm) &&
      edadAplicada >= r.edad_min &&
      edadAplicada <= r.edad_max
  ) || RANGOS_RESPALDO_ACTIVIDAD[0]

  const bpmMin = Number(resuelto?.bpm_min ?? respaldo.bpm_min)
  const bpmMax = Number(resuelto?.bpm_max ?? respaldo.bpm_max)
  const actividadNombre =
    resuelto?.actividad?.nombre ||
    resuelto?.nombre ||
    ETIQUETAS_ACTIVIDAD[codigoNorm] ||
    respaldo.nombre

  return {
    bpmMin,
    bpmMax,
    edadAplicada,
    actividadId: idNorm,
    actividadCodigo: codigoNorm,
    actividadNombre,
    origen: resuelto?.origen || 'global'
  }
}

function clasificarEstadoRespectoAlRango(bpmPromedio, bpmMin, bpmMax) {
  if (!Number.isFinite(bpmPromedio) || !Number.isFinite(bpmMin) || !Number.isFinite(bpmMax)) {
    return { dentroDeRango: false, estado: 'sin_rango', etiquetaEstado: 'Sin referencia' }
  }
  if (bpmPromedio < bpmMin) {
    return {
      dentroDeRango: false,
      estado: 'bajo',
      etiquetaEstado: `Bajo el rango (${redondear1(bpmPromedio - bpmMin)} BPM)`
    }
  }
  if (bpmPromedio > bpmMax) {
    return {
      dentroDeRango: false,
      estado: 'alto',
      etiquetaEstado: `Sobre el rango (+${redondear1(bpmPromedio - bpmMax)} BPM)`
    }
  }
  return {
    dentroDeRango: true,
    estado: 'dentro',
    etiquetaEstado: 'Dentro del rango esperado'
  }
}

/**
 * Construye la serie diaria de evolución personal a partir del historial de mediciones
 * o de la vista `public.evolucion_reposo`, garantizando:
 * 1. Solo incluir mediciones del `usuarioId` autenticado.
 * 2. Nunca inventar días ni valores cuando hay menos de 2 días con datos.
 * 3. Calcular la banda del rango esperado según edad y actividad.
 */
export function construirSerieEvolucion({
  mediciones = [],
  filasVista = [],
  usuarioId,
  edad = null,
  actividadId = 1,
  actividadCodigo = 'reposo',
  rangosGlobales = [],
  rangosPersonales = []
} = {}) {
  const uidActual = String(usuarioId || '').trim()
  const codigoNorm = String(actividadCodigo || 'reposo').trim().toLowerCase()
  const idNorm = Number(actividadId) || 1

  // 1. Filtrar estrictamente las mediciones que pertenecen al usuario autenticado
  const medicionesPropias = (Array.isArray(mediciones) ? mediciones : []).filter((m) => {
    if (!m || typeof m !== 'object') return false
    const propietario = String(m.usuario_id ?? m.usuarioId ?? '').trim()
    if (!uidActual || !propietario) return false
    return propietario === uidActual
  })

  // Determinar la edad aplicable a partir del parámetro o de la medición más reciente del usuario
  let edadDetectada = Number(edad)
  if (!Number.isFinite(edadDetectada) || edadDetectada <= 0) {
    for (let i = medicionesPropias.length - 1; i >= 0; i -= 1) {
      const e = Number(medicionesPropias[i].edad_al_medir ?? medicionesPropias[i].edad)
      if (Number.isFinite(e) && e > 0) {
        edadDetectada = e
        break
      }
    }
  }
  const edadFinal = Number.isFinite(edadDetectada) && edadDetectada > 0 ? Math.round(edadDetectada) : 30

  const rangoEsperado = resolverRangoEsperado({
    edad: edadFinal,
    actividadId: idNorm,
    actividadCodigo: codigoNorm,
    rangosGlobales,
    rangosPersonales
  })

  // 2. Agrupar por día calendario local
  const mapaPorDia = new Map()

  const medicionesActividad = medicionesPropias.filter((m) =>
    coincideActividadMedicion(m, { actividadCodigo: codigoNorm, actividadId: idNorm })
  )

  for (const m of medicionesActividad) {
    const bpm = Number(m.bpm_promedio ?? m.bpmPromedio ?? m.bpm)
    if (!Number.isFinite(bpm) || bpm <= 0) continue

    const dia = formatearDiaLocal(m.dia ?? m.inicio ?? m.fechaHora ?? m.creado_en)
    if (!dia) continue

    const spo2Raw = Number(m.spo2_promedio ?? m.spo2Promedio ?? m.spo2)
    const spo2Valido = Number.isFinite(spo2Raw) && spo2Raw > 0 ? spo2Raw : null
    const edadMed = Number(m.edad_al_medir ?? m.edad)

    if (!mapaPorDia.has(dia)) {
      mapaPorDia.set(dia, {
        dia,
        sumaBpm: 0,
        conteoBpm: 0,
        sumaSpo2: 0,
        conteoSpo2: 0,
        edades: []
      })
    }

    const acum = mapaPorDia.get(dia)
    acum.sumaBpm += bpm
    acum.conteoBpm += 1
    if (spo2Valido !== null) {
      acum.sumaSpo2 += spo2Valido
      acum.conteoSpo2 += 1
    }
    if (Number.isFinite(edadMed) && edadMed > 0) {
      acum.edades.push(edadMed)
    }
  }

  // Si no se pasaron mediciones crudas pero sí filas de la vista `public.evolucion_reposo` para reposo
  if (mapaPorDia.size === 0 && codigoNorm === 'reposo' && Array.isArray(filasVista) && filasVista.length > 0) {
    for (const fila of filasVista) {
      if (!fila || typeof fila !== 'object') continue
      const propietario = String(fila.usuario_id ?? fila.usuarioId ?? '').trim()
      if (!uidActual || propietario !== uidActual) continue

      const dia = formatearDiaLocal(fila.dia)
      const bpm = Number(fila.bpm_reposo ?? fila.bpmPromedio)
      if (!dia || !Number.isFinite(bpm) || bpm <= 0) continue

      const spo2 = Number(fila.spo2_reposo ?? fila.spo2Promedio)
      const conteo = Math.max(1, Number(fila.mediciones) || 1)
      const minEsp = Number(fila.bpm_esperado_min)
      const maxEsp = Number(fila.bpm_esperado_max)

      mapaPorDia.set(dia, {
        dia,
        sumaBpm: bpm * conteo,
        conteoBpm: conteo,
        sumaSpo2: Number.isFinite(spo2) && spo2 > 0 ? spo2 * conteo : 0,
        conteoSpo2: Number.isFinite(spo2) && spo2 > 0 ? conteo : 0,
        edades: [],
        bpmEsperadoMinVista: Number.isFinite(minEsp) && minEsp > 0 ? minEsp : null,
        bpmEsperadoMaxVista: Number.isFinite(maxEsp) && maxEsp > 0 ? maxEsp : null
      })
    }
  }

  const diasOrdenados = Array.from(mapaPorDia.keys()).sort((a, b) => a.localeCompare(b))

  const dias = diasOrdenados.map((dia) => {
    const item = mapaPorDia.get(dia)
    const bpmPromedio = redondear1(item.sumaBpm / item.conteoBpm)
    const spo2Promedio = item.conteoSpo2 > 0 ? redondear1(item.sumaSpo2 / item.conteoSpo2) : null
    const edadDia =
      item.edades.length > 0
        ? Math.round(item.edades.reduce((acc, v) => acc + v, 0) / item.edades.length)
        : rangoEsperado.edadAplicada

    const rangoDia = resolverRangoEsperado({
      edad: edadDia,
      actividadId: idNorm,
      actividadCodigo: codigoNorm,
      rangosGlobales,
      rangosPersonales
    })

    const bpmEsperadoMin = item.bpmEsperadoMinVista ?? rangoDia.bpmMin
    const bpmEsperadoMax = item.bpmEsperadoMaxVista ?? rangoDia.bpmMax
    const clasificacion = clasificarEstadoRespectoAlRango(bpmPromedio, bpmEsperadoMin, bpmEsperadoMax)

    return {
      dia,
      etiquetaDia: formatearEtiquetaDia(dia),
      bpmPromedio,
      spo2Promedio,
      mediciones: item.conteoBpm,
      edadReferencia: edadDia,
      bpmEsperadoMin,
      bpmEsperadoMax,
      dentroDeRango: clasificacion.dentroDeRango,
      estado: clasificacion.estado,
      etiquetaEstado: clasificacion.etiquetaEstado
    }
  })

  const totalDias = dias.length
  const totalMediciones = dias.reduce((acc, d) => acc + d.mediciones, 0)
  const tieneDatosSuficientes = totalDias >= 2

  let mensajeEstado = ''
  if (totalDias === 0) {
    mensajeEstado =
      `Aún no tienes mediciones registradas para ${rangoEsperado.actividadNombre.toLowerCase()}. ` +
      'Necesitas mediciones en al menos 2 días distintos para mostrar tu tendencia personal.'
  } else if (totalDias === 1) {
    mensajeEstado =
      `Solo cuentas con mediciones en 1 día (${dias[0].dia}: ${dias[0].bpmPromedio} BPM). ` +
      'Se requieren al menos 2 días con registros para trazar la tendencia diaria sin inventar valores.'
  }

  // Resumen estadístico real (nunca inventa datos cuando faltan días)
  let resumen = {
    promedioPeriodoBpm: null,
    minimoBpm: null,
    maximoBpm: null,
    diasDentroDeRango: 0,
    porcentajeDentroDeRango: null,
    cambioEntreExtremosBpm: null
  }

  if (totalDias >= 1) {
    const valoresBpm = dias.map((d) => d.bpmPromedio)
    const suma = valoresBpm.reduce((acc, v) => acc + v, 0)
    const dentro = dias.filter((d) => d.dentroDeRango).length
    resumen = {
      promedioPeriodoBpm: redondear1(suma / totalDias),
      minimoBpm: redondear1(Math.min(...valoresBpm)),
      maximoBpm: redondear1(Math.max(...valoresBpm)),
      diasDentroDeRango: dentro,
      porcentajeDentroDeRango: Math.round((dentro / totalDias) * 100),
      cambioEntreExtremosBpm:
        totalDias >= 2 ? redondear1(dias[totalDias - 1].bpmPromedio - dias[0].bpmPromedio) : null
    }
  }

  return {
    usuarioId: uidActual,
    dias,
    totalDias,
    totalMediciones,
    tieneDatosSuficientes,
    mensajeEstado,
    rangoEsperado,
    resumen
  }
}

/**
 * Calcula las coordenadas geométricas SVG para dibujar la banda del rango esperado
 * y la curva diaria de BPM en reposo cuando existen al menos 2 días de datos.
 */
export function calcularGeometriaGraficoEvolucion({
  dias = [],
  rangoEsperado = { bpmMin: 60, bpmMax: 100 },
  ancho = 760,
  alto = 260,
  padding = { top: 24, right: 28, bottom: 38, left: 48 }
} = {}) {
  const anchoUtil = Math.max(100, ancho - padding.left - padding.right)
  const altoUtil = Math.max(80, alto - padding.top - padding.bottom)

  const bpmMinRango = Number(rangoEsperado?.bpmMin) || 60
  const bpmMaxRango = Number(rangoEsperado?.bpmMax) || 100

  const valoresBpm = (Array.isArray(dias) ? dias : [])
    .map((d) => Number(d.bpmPromedio))
    .filter((v) => Number.isFinite(v) && v > 0)

  const minObservado = valoresBpm.length > 0 ? Math.min(...valoresBpm, bpmMinRango) : bpmMinRango
  const maxObservado = valoresBpm.length > 0 ? Math.max(...valoresBpm, bpmMaxRango) : bpmMaxRango

  const ejeYMin = Math.max(30, Math.floor((minObservado - 12) / 5) * 5)
  const ejeYMax = Math.min(220, Math.ceil((maxObservado + 12) / 5) * 5)
  const spanY = Math.max(10, ejeYMax - ejeYMin)

  const valorAY = (bpm) => {
    const proporcion = (bpm - ejeYMin) / spanY
    const y = padding.top + altoUtil * (1 - proporcion)
    return Math.round(Math.min(padding.top + altoUtil, Math.max(padding.top, y)) * 10) / 10
  }

  const yRangoMax = valorAY(bpmMaxRango)
  const yRangoMin = valorAY(bpmMinRango)

  const bandaRango = {
    x: padding.left,
    yTop: Math.min(yRangoMax, yRangoMin),
    yBottom: Math.max(yRangoMax, yRangoMin),
    width: anchoUtil,
    height: Math.max(4, Math.abs(yRangoMin - yRangoMax)),
    bpmMin: bpmMinRango,
    bpmMax: bpmMaxRango
  }

  // Ticks del eje Y (5 niveles equidistantes)
  const ticksY = []
  const pasos = 4
  for (let i = 0; i <= pasos; i += 1) {
    const valor = Math.round(ejeYMin + (spanY * i) / pasos)
    ticksY.push({
      valor,
      y: valorAY(valor)
    })
  }

  if (!Array.isArray(dias) || dias.length < 2) {
    return {
      ancho,
      alto,
      padding,
      ejeYMin,
      ejeYMax,
      bandaRango,
      ticksY,
      puntos: [],
      lineaPath: '',
      areaPath: ''
    }
  }

  const total = dias.length
  const puntos = dias.map((d, idx) => {
    const x =
      padding.left +
      (total === 1 ? anchoUtil / 2 : (idx / (total - 1)) * anchoUtil)
    const y = valorAY(d.bpmPromedio)
    return {
      ...d,
      x: Math.round(x * 10) / 10,
      y
    }
  })

  const lineaPath = puntos
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  const baseY = padding.top + altoUtil
  const areaPath =
    puntos.length >= 2
      ? `${lineaPath} L ${puntos[puntos.length - 1].x} ${baseY} L ${puntos[0].x} ${baseY} Z`
      : ''

  return {
    ancho,
    alto,
    padding,
    ejeYMin,
    ejeYMax,
    bandaRango,
    ticksY,
    puntos,
    lineaPath,
    areaPath
  }
}
