/**
 * Cálculo y análisis de correlación entre la tendencia diaria del BPM
 * y los factores de estrés o sueño registrados en la ficha del paciente (RF37, RF36, RF03).
 *
 * Cumple con:
 * 1. Mapear los niveles de estrés ('bajo', 'medio', 'alto', 'muy_alto') y horas de sueño
 *    ('menos_5', '5_6', '7_8', 'mas_8' o valor numérico opcional) registrados por el titular.
 * 2. Con datos insuficientes (menos de MINIMO_DIAS_CORRELACION días con par válido o sin variación),
 *    NO devuelve ni muestra ningún número de correlación (coeficiente = null) y entrega un aviso claro.
 * 3. Explicar siempre que correlación no implica causalidad y que no es un diagnóstico médico.
 * 4. Tratar los datos de salud con las reglas de privacidad definidas (solo titular autenticado,
 *    sin exponer ni conservar campos identificables o clínicos ajenos al cálculo en memoria).
 */

export const MINIMO_DIAS_CORRELACION = 3

export const AVISO_CORRELACION_NO_CAUSA =
  'Correlación no implica causalidad: observar una relación estadística entre tu BPM en reposo y el estrés o el sueño registrados no significa que un factor sea la causa directa del otro. Esta información tiene fines exclusivamente educativos y no constituye un diagnóstico médico.'

export const MAPA_NIVEL_ESTRES = {
  bajo: { puntaje: 1, etiqueta: 'Bajo (Tranquilo / Relajado)' },
  medio: { puntaje: 2, etiqueta: 'Medio (Normal / Cotidiano)' },
  alto: { puntaje: 3, etiqueta: 'Alto (Bajo presión / Preocupado)' },
  muy_alto: { puntaje: 4, etiqueta: 'Muy Alto (Estrés agudo / Ansiedad)' }
}

export const MAPA_SUENO_HORAS = {
  menos_5: { horas: 4.5, etiqueta: 'Menos de 5 horas' },
  '5_6': { horas: 5.5, etiqueta: '5 a 6 horas' },
  '7_8': { horas: 7.5, etiqueta: '7 a 8 horas' },
  mas_8: { horas: 8.5, etiqueta: 'Más de 8 horas' }
}

function redondear(valor, decimales = 2) {
  const num = Number(valor)
  if (!Number.isFinite(num)) return null
  const factor = 10 ** decimales
  return Math.round(num * factor) / factor
}

/**
 * Convierte un nivel de estrés declarado ('bajo' | 'medio' | 'alto' | 'muy_alto' o número 1..4)
 * en un puntaje numérico ordinal (1 a 4) y su etiqueta legible.
 */
export function normalizarEstres(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const clave = String(valor).trim().toLowerCase()
  if (MAPA_NIVEL_ESTRES[clave]) {
    return {
      codigo: clave,
      puntaje: MAPA_NIVEL_ESTRES[clave].puntaje,
      etiqueta: MAPA_NIVEL_ESTRES[clave].etiqueta
    }
  }
  const num = Number(valor)
  if (Number.isFinite(num) && num >= 1 && num <= 4) {
    const entrada = Object.entries(MAPA_NIVEL_ESTRES).find(([, v]) => v.puntaje === Math.round(num))
    return {
      codigo: entrada ? entrada[0] : 'medio',
      puntaje: num,
      etiqueta: entrada ? entrada[1].etiqueta : `Nivel ${num}`
    }
  }
  return null
}

/**
 * Convierte el sueño declarado ('menos_5' | '5_6' | '7_8' | 'mas_8' o número de horas)
 * en horas numéricas estimadas y su etiqueta legible. Si no se declaró sueño, devuelve null.
 */
export function normalizarSueno(valorHoras, valorOpcionalNumerico = null) {
  if (valorOpcionalNumerico !== null && valorOpcionalNumerico !== undefined && valorOpcionalNumerico !== '') {
    const numDirecto = Number(valorOpcionalNumerico)
    if (Number.isFinite(numDirecto) && numDirecto > 0 && numDirecto <= 24) {
      return {
        codigo: 'numerico',
        horas: redondear(numDirecto, 1),
        etiqueta: `${redondear(numDirecto, 1)} h`
      }
    }
  }

  if (valorHoras === null || valorHoras === undefined || valorHoras === '' || valorHoras === 'no_declarado') {
    return null
  }

  const clave = String(valorHoras).trim().toLowerCase()
  if (MAPA_SUENO_HORAS[clave]) {
    return {
      codigo: clave,
      horas: MAPA_SUENO_HORAS[clave].horas,
      etiqueta: MAPA_SUENO_HORAS[clave].etiqueta
    }
  }

  const num = Number(valorHoras)
  if (Number.isFinite(num) && num > 0 && num <= 24) {
    return {
      codigo: 'numerico',
      horas: redondear(num, 1),
      etiqueta: `${redondear(num, 1)} h`
    }
  }

  return null
}

/**
 * Filtra y limpia un objeto de factores de salud para conservar únicamente los campos necesarios
 * para la correlación (nivelEstres y sueño), descartando nombre, fecha de nacimiento, medicación,
 * condición clínica u otros datos sensibles (cumplimiento de minimización y privacidad RF55/RF116).
 */
export function sanitizarFactoresParaCorrelacion(factores = {}) {
  if (!factores || typeof factores !== 'object') {
    return { estres: null, sueno: null }
  }
  const estres = normalizarEstres(factores.nivelEstres ?? factores.estres)
  const sueno = normalizarSueno(
    factores.suenoHoras ?? factores.sueno,
    factores.horasSuenoOpcional ?? factores.horasSueno
  )
  return { estres, sueno }
}

/**
 * Calcula el coeficiente de correlación lineal de Pearson (r) entre dos vectores numéricos.
 * Si hay menos de `minimoPares` observaciones o alguna variable tiene varianza cero,
 * devuelve `null` (nunca devuelve NaN ni inventa un número).
 */
export function calcularCoeficientePearson(pares = [], minimoPares = MINIMO_DIAS_CORRELACION) {
  const validos = (Array.isArray(pares) ? pares : []).filter(
    (p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))
  )

  if (validos.length < minimoPares) {
    return null
  }

  const n = validos.length
  const mediaX = validos.reduce((acc, p) => acc + Number(p.x), 0) / n
  const mediaY = validos.reduce((acc, p) => acc + Number(p.y), 0) / n

  let num = 0
  let denX = 0
  let denY = 0

  for (const p of validos) {
    const dx = Number(p.x) - mediaX
    const dy = Number(p.y) - mediaY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }

  // Si todos los días tienen exactamente el mismo nivel de estrés/sueño o el mismo BPM,
  // la varianza es 0 y no es matemáticamente válido mostrar un número de correlación.
  if (denX <= 1e-9 || denY <= 1e-9) {
    return null
  }

  const r = num / Math.sqrt(denX * denY)
  return redondear(Math.max(-1, Math.min(1, r)), 2)
}

function interpretarRelacion(r, tipoFactor) {
  if (r === null || !Number.isFinite(r)) {
    return {
      fuerza: 'insuficiente',
      sentido: 'indeterminado',
      resumenRelacion: 'Sin datos suficientes para cuantificar la relación.'
    }
  }

  const abs = Math.abs(r)
  let fuerza = 'debil'
  if (abs >= 0.65) fuerza = 'fuerte'
  else if (abs >= 0.35) fuerza = 'moderada'
  else if (abs < 0.15) fuerza = 'muy_baja'

  const sentido = r > 0.1 ? 'positiva' : r < -0.1 ? 'negativa' : 'neutra'

  if (tipoFactor === 'estres') {
    if (sentido === 'positiva') {
      return {
        fuerza,
        sentido,
        resumenRelacion:
          'En tus registros, los días con mayor nivel de estrés declarado tienden a coincidir con un BPM en reposo más elevado.'
      }
    }
    if (sentido === 'negativa') {
      return {
        fuerza,
        sentido,
        resumenRelacion:
          'En tus registros actuales, los días con mayor nivel de estrés declarado coinciden con un BPM en reposo menor.'
      }
    }
    return {
      fuerza,
      sentido,
      resumenRelacion:
        'En tus registros actuales no se observa una variación marcada del BPM en reposo según el nivel de estrés declarado.'
    }
  }

  // tipoFactor === 'sueno'
  if (sentido === 'negativa') {
    return {
      fuerza,
      sentido,
      resumenRelacion:
        'En tus registros, los días con menos horas de sueño declaradas tienden a coincidir con un BPM en reposo más alto.'
    }
  }
  if (sentido === 'positiva') {
    return {
      fuerza,
      sentido,
      resumenRelacion:
        'En tus registros actuales, los días con más horas de sueño declaradas coinciden con un BPM en reposo más alto.'
    }
  }
  return {
    fuerza,
    sentido,
    resumenRelacion:
      'En tus registros actuales no se observa una variación marcada del BPM en reposo según las horas de sueño declaradas.'
  }
}

function construirAnalisisFactor({
  diasConsolidados = [],
  tipoFactor = 'estres',
  minimoDias = MINIMO_DIAS_CORRELACION
}) {
  const esEstres = tipoFactor === 'estres'
  const nombreFactor = esEstres ? 'estrés' : 'sueño'

  const diasConFactor = diasConsolidados.filter((d) =>
    esEstres ? Number.isFinite(d.puntajeEstres) : Number.isFinite(d.horasSueno)
  )

  const cantidadDias = diasConFactor.length

  if (cantidadDias < minimoDias) {
    const faltantes = Math.max(1, minimoDias - cantidadDias)
    return {
      tipoFactor,
      tieneDatosSuficientes: false,
      diasAnalizados: cantidadDias,
      minimoRequerido: minimoDias,
      // Criterio de aceptación: Con datos insuficientes NO muestra un número (coeficiente = null)
      coeficiente: null,
      fuerza: null,
      sentido: null,
      promedioGrupoBajoBpm: null,
      promedioGrupoAltoBpm: null,
      mensajeDatosInsuficientes:
        cantidadDias === 0
          ? `Aún no tienes días con mediciones de BPM vinculadas a registros de ${nombreFactor}. Registra al menos ${minimoDias} días con datos de ${nombreFactor} y BPM para calcular la relación.`
          : `Solo cuentas con ${cantidadDias} ${cantidadDias === 1 ? 'día' : 'días'} con datos de ${nombreFactor} y BPM (faltan ${faltantes} para el mínimo de ${minimoDias} días). Con pocos datos no se calcula ni muestra un valor numérico para evitar conclusiones engañosas.`,
      resumenRelacion: ''
    }
  }

  const pares = diasConFactor.map((d) => ({
    dia: d.dia,
    x: esEstres ? d.puntajeEstres : d.horasSueno,
    y: d.bpmPromedio
  }))

  const valoresXUnicos = new Set(pares.map((p) => p.x))
  const coeficiente = calcularCoeficientePearson(pares, minimoDias)

  if (coeficiente === null) {
    return {
      tipoFactor,
      tieneDatosSuficientes: false,
      diasAnalizados: cantidadDias,
      minimoRequerido: minimoDias,
      coeficiente: null,
      fuerza: null,
      sentido: null,
      promedioGrupoBajoBpm: null,
      promedioGrupoAltoBpm: null,
      mensajeDatosInsuficientes:
        valoresXUnicos.size <= 1
          ? `Tus ${cantidadDias} días registrados tienen el mismo valor de ${nombreFactor}, por lo que aún no hay variación suficiente para calcular un coeficiente numérico de relación con el BPM.`
          : `No hay variación suficiente en los datos de ${nombreFactor} y BPM para mostrar un valor numérico confiable.`,
      resumenRelacion: ''
    }
  }

  const interpretacion = interpretarRelacion(coeficiente, tipoFactor)

  // Promedios comparativos simples (ej. estrés bajo/medio vs alto/muy alto, o sueño < 7h vs >= 7h)
  const grupoA = diasConFactor.filter((d) => (esEstres ? d.puntajeEstres <= 2 : d.horasSueno < 7))
  const grupoB = diasConFactor.filter((d) => (esEstres ? d.puntajeEstres >= 3 : d.horasSueno >= 7))

  const prom = (arr) =>
    arr.length > 0
      ? redondear(arr.reduce((acc, item) => acc + item.bpmPromedio, 0) / arr.length, 1)
      : null

  return {
    tipoFactor,
    tieneDatosSuficientes: true,
    diasAnalizados: cantidadDias,
    minimoRequerido: minimoDias,
    coeficiente,
    fuerza: interpretacion.fuerza,
    sentido: interpretacion.sentido,
    promedioGrupoBajoBpm: prom(grupoA),
    promedioGrupoAltoBpm: prom(grupoB),
    mensajeDatosInsuficientes: '',
    resumenRelacion: interpretacion.resumenRelacion
  }
}

/**
 * Consolida por día el BPM promedio del titular junto con el estrés y sueño registrados
 * (desde las declaraciones vinculadas a cada medición o registros diarios propios en sesión)
 * y calcula la relación estadística para ambos factores.
 *
 * Garantiza:
 * - Solo procesar datos pertenecientes a `usuarioId`.
 * - No mostrar ningún número (`coeficiente: null`) cuando hay datos insuficientes.
 */
export function analizarCorrelacionBpmEstresSueno({
  diasEvolucion = [],
  mediciones = [],
  declaracionesPorId = {},
  registrosDiariosSesion = {},
  usuarioId,
  minimoDias = MINIMO_DIAS_CORRELACION
} = {}) {
  const uid = String(usuarioId || '').trim()

  // Mapear por día los factores declarados en las mediciones propias del usuario
  const factoresPorDia = new Map()

  const medicionesPropias = (Array.isArray(mediciones) ? mediciones : []).filter((m) => {
    if (!m || typeof m !== 'object') return false
    const prop = String(m.usuario_id ?? m.usuarioId ?? '').trim()
    return Boolean(uid && prop === uid)
  })

  for (const m of medicionesPropias) {
    const dia = String(m.dia || m.inicio || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue

    // Factores pueden venir en la medición o en su declaración vinculada por declaracion_id (o por fecha de declaración del titular)
    const declDirecta = m.declaracion_id ? declaracionesPorId[m.declaracion_id] : null
    const declPorDia =
      !declDirecta && declaracionesPorId
        ? Object.values(declaracionesPorId).find((d) => d && d.diaCreacion === dia)
        : null
    const decl = declDirecta || declPorDia
    if (decl && decl.usuario_id && String(decl.usuario_id) !== uid) {
      continue
    }

    const origenFactores = {
      ...(decl?.factores || decl || {}),
      ...(m.nivelEstres ? { nivelEstres: m.nivelEstres } : {}),
      ...(m.suenoHoras ? { suenoHoras: m.suenoHoras } : {}),
      ...(m.horasSuenoOpcional !== undefined ? { horasSuenoOpcional: m.horasSuenoOpcional } : {})
    }

    const limpios = sanitizarFactoresParaCorrelacion(origenFactores)
    if (!factoresPorDia.has(dia)) {
      factoresPorDia.set(dia, { estres: [], sueno: [], etiquetasEstres: [], etiquetasSueno: [] })
    }
    const acum = factoresPorDia.get(dia)
    if (limpios.estres) {
      acum.estres.push(limpios.estres.puntaje)
      acum.etiquetasEstres.push(limpios.estres.etiqueta)
    }
    if (limpios.sueno) {
      acum.sueno.push(limpios.sueno.horas)
      acum.etiquetasSueno.push(limpios.sueno.etiqueta)
    }
  }

  // Integrar registros opcionales del día en la sesión del titular (si completó sueño/estrés opcional para un día medido)
  if (registrosDiariosSesion && typeof registrosDiariosSesion === 'object') {
    for (const [dia, reg] of Object.entries(registrosDiariosSesion)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !reg) continue
      const limpios = sanitizarFactoresParaCorrelacion(reg)
      if (!factoresPorDia.has(dia)) {
        factoresPorDia.set(dia, { estres: [], sueno: [], etiquetasEstres: [], etiquetasSueno: [] })
      }
      const acum = factoresPorDia.get(dia)
      if (limpios.estres) {
        acum.estres = [limpios.estres.puntaje]
        acum.etiquetasEstres = [limpios.estres.etiqueta]
      }
      if (limpios.sueno) {
        acum.sueno = [limpios.sueno.horas]
        acum.etiquetasSueno = [limpios.sueno.etiqueta]
      }
    }
  }

  // Unir con los días de la serie de evolución del titular
  const diasConsolidados = (Array.isArray(diasEvolucion) ? diasEvolucion : [])
    .filter((d) => d && Number.isFinite(Number(d.bpmPromedio)) && Number(d.bpmPromedio) > 0)
    .map((d) => {
      const infoFactor = factoresPorDia.get(d.dia)
      const puntajeEstres =
        infoFactor && infoFactor.estres.length > 0
          ? redondear(
              infoFactor.estres.reduce((a, b) => a + b, 0) / infoFactor.estres.length,
              1
            )
          : Number.isFinite(Number(d.puntajeEstres))
            ? Number(d.puntajeEstres)
            : null

      const horasSueno =
        infoFactor && infoFactor.sueno.length > 0
          ? redondear(
              infoFactor.sueno.reduce((a, b) => a + b, 0) / infoFactor.sueno.length,
              1
            )
          : Number.isFinite(Number(d.horasSueno))
            ? Number(d.horasSueno)
            : null

      const etiquetaEstres =
        infoFactor?.etiquetasEstres?.[infoFactor.etiquetasEstres.length - 1] ||
        (puntajeEstres !== null ? normalizarEstres(puntajeEstres)?.etiqueta : 'No registrado')

      const etiquetaSueno =
        infoFactor?.etiquetasSueno?.[infoFactor.etiquetasSueno.length - 1] ||
        (horasSueno !== null ? `${horasSueno} h` : 'No registrado')

      return {
        dia: d.dia,
        etiquetaDia: d.etiquetaDia || d.dia,
        bpmPromedio: Number(d.bpmPromedio),
        puntajeEstres,
        etiquetaEstres,
        horasSueno,
        etiquetaSueno
      }
    })

  const estres = construirAnalisisFactor({
    diasConsolidados,
    tipoFactor: 'estres',
    minimoDias
  })

  const sueno = construirAnalisisFactor({
    diasConsolidados,
    tipoFactor: 'sueno',
    minimoDias
  })

  return {
    usuarioId: uid,
    diasConsolidados,
    estres,
    sueno,
    avisoNoCausalidad: AVISO_CORRELACION_NO_CAUSA
  }
}
