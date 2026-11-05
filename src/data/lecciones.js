/**
 * Contenido del apartado de aprendizaje (RF38)
 *
 * Datos puros, sin pantalla ni red, para que se puedan leer sin conexión (RNF03) y probar con Node.
 * Cada lección tiene una categoría del esquema `lecciones` de Supabase y una lista de bloques:
 *   texto, lista, pasos, formula, dato, tabla, aviso, esquema, spo2_medida
 * Los números de esta guía son los mismos que usa la aplicación (rangos de BPM del clasificador
 * de ritmo, umbrales de SpO₂ y curva SpO₂ = 110 − 25·R del servicio de SpO₂).
 */

export const CATEGORIAS = {
  fisiologia: 'Fisiología',
  sensor: 'Sensor',
  esp32: 'ESP32',
  bpm: 'Frecuencia cardíaca',
  spo2: 'Saturación de oxígeno',
  salud: 'Datos de salud'
}

export const TIPOS_BLOQUE = ['texto', 'lista', 'pasos', 'formula', 'dato', 'tabla', 'aviso', 'esquema', 'spo2_medida']

export const ESQUEMAS = ['corazon', 'cadena_sensor', 'esp32_flujo', 'razon_r']

export const AVISO_EDUCATIVO =
  'Contenido educativo. Esta plataforma no sustituye el diagnóstico ni la opinión de un profesional de la salud.'

export const LECCIONES = [
  {
    slug: 'corazon',
    titulo: 'Cómo funciona el corazón',
    categoria: 'fisiologia',
    resumen: 'Cámaras, válvulas, ciclo cardíaco y el marcapasos natural que marca el ritmo.',
    minutos: 5,
    bloques: [
      { tipo: 'texto', texto: 'El corazón es una bomba muscular del tamaño aproximado de un puño. Mueve la sangre por todo el cuerpo para llevar oxígeno y nutrientes a los tejidos y retirar el dióxido de carbono.' },
      { tipo: 'esquema', nombre: 'corazon', alt: 'Esquema del corazón con aurícula y ventrículo derechos e izquierdos, y el nodo sinusal' },
      { tipo: 'lista', titulo: 'Partes principales', items: [
        'Aurículas (derecha e izquierda): cámaras superiores que reciben la sangre.',
        'Ventrículos (derecho e izquierdo): cámaras inferiores que la impulsan. El izquierdo es el más fuerte porque envía la sangre a todo el cuerpo.',
        'Válvulas: aseguran que la sangre avance en un solo sentido.',
        'Nodo sinusal: grupo de células en la aurícula derecha que genera el impulso eléctrico y funciona como marcapasos natural.'
      ] },
      { tipo: 'pasos', titulo: 'Un latido, paso a paso', items: [
        'El nodo sinusal genera un impulso eléctrico.',
        'Las aurículas se contraen y llenan los ventrículos.',
        'Los ventrículos se contraen (sístole): el derecho envía sangre a los pulmones y el izquierdo al resto del cuerpo.',
        'El corazón se relaja (diástole) y vuelve a llenarse de sangre.'
      ] },
      { tipo: 'dato', titulo: 'Dos circuitos', texto: 'La circulación pulmonar lleva la sangre a los pulmones para cargarla de oxígeno. La circulación sistémica la reparte por el cuerpo. Los dos circuitos trabajan al mismo tiempo en cada latido.' },
      { tipo: 'formula', titulo: 'Gasto cardíaco', formula: 'Gasto cardíaco = frecuencia cardíaca × volumen sistólico', nota: 'En reposo un adulto suele mover alrededor de 5 litros de sangre por minuto.' }
    ]
  },
  {
    slug: 'frecuencia-cardiaca',
    titulo: 'La frecuencia cardíaca',
    categoria: 'bpm',
    resumen: 'Qué son los latidos por minuto, qué rangos se consideran normales y qué los hace cambiar.',
    minutos: 4,
    bloques: [
      { tipo: 'texto', texto: 'La frecuencia cardíaca es el número de veces que el corazón late en un minuto. Se mide en BPM (latidos por minuto). No es fija: el cuerpo la ajusta todo el tiempo según lo que necesita.' },
      { tipo: 'tabla', titulo: 'Rangos en reposo para un adulto (los mismos que usa la plataforma)', columnas: ['Clasificación', 'Rango', 'Qué significa'], filas: [
        ['Bradicardia', 'Menos de 60 BPM', 'Corazón lento. Puede ser normal en personas muy entrenadas.'],
        ['Normal', '60 a 100 BPM', 'Ritmo habitual en reposo.'],
        ['Taquicardia', 'Más de 100 BPM', 'Corazón acelerado. Es normal tras ejercicio, estrés o cafeína.']
      ] },
      { tipo: 'lista', titulo: 'Qué hace subir o bajar la frecuencia', items: [
        'Actividad física: sube mientras dura el esfuerzo y baja al recuperarse.',
        'Emociones y estrés: la adrenalina acelera el corazón.',
        'Cafeína, nicotina y algunos medicamentos.',
        'Fiebre, deshidratación o calor.',
        'Sueño y relajación: la frecuencia baja.',
        'Edad y entrenamiento físico: una persona entrenada suele tener menos BPM en reposo.'
      ] },
      { tipo: 'dato', titulo: 'Variabilidad de la frecuencia (HRV)', texto: 'Aunque el promedio sea 70 BPM, el tiempo entre un latido y el siguiente cambia unos milisegundos. Esa variación se llama variabilidad de la frecuencia cardíaca. La plataforma la calcula con el índice RMSSD y la usa para decir si el ritmo es regular o irregular.' },
      { tipo: 'aviso', texto: 'Mide siempre en reposo, sentado y tranquilo durante uno o dos minutos, para poder comparar un día con otro.' }
    ]
  },
  {
    slug: 'sensor-max30102',
    titulo: 'El sensor MAX30102 y sus partes',
    categoria: 'sensor',
    resumen: 'Cómo un LED rojo, uno infrarrojo y un fotodetector «ven» el pulso a través del dedo.',
    minutos: 5,
    bloques: [
      { tipo: 'texto', texto: 'El MAX30102 es un sensor óptico pequeño. No toca la sangre ni la pincha: ilumina la yema del dedo con luz y mide cuánta luz vuelve. A esta técnica se le llama fotopletismografía (PPG).' },
      { tipo: 'esquema', nombre: 'cadena_sensor', alt: 'Dedo sobre el sensor: dos LED emiten luz, el fotodetector recibe la luz reflejada' },
      { tipo: 'lista', titulo: 'Partes del sensor', items: [
        'LED rojo (longitud de onda cercana a 660 nm).',
        'LED infrarrojo (cercano a 880 nm).',
        'Fotodetector: convierte la luz que vuelve en una corriente eléctrica.',
        'Conversor analógico-digital (ADC) de 18 bits integrado: entrega números, no voltajes.',
        'Memoria FIFO: guarda las muestras hasta que el ESP32 las lee.',
        'Interfaz I²C: dos cables (SDA y SCL) con los que el ESP32 configura el sensor y lee los datos. Su dirección es 0x57.'
      ] },
      { tipo: 'dato', titulo: 'Los nanómetros no son BPM', texto: 'Los nanómetros (nm) son la longitud de onda de la luz de cada LED. Lo que el sensor entrega es intensidad: un número por cada muestra. Los BPM se calculan después, a partir de cómo sube y baja esa intensidad.' },
      { tipo: 'texto', texto: 'Con cada latido llega más sangre a los vasos del dedo. La sangre absorbe luz, así que vuelve menos luz al fotodetector. Entre latidos pasa lo contrario. Esa subida y bajada es la señal de pulso.' },
      { tipo: 'aviso', texto: 'Para una buena señal: dedo quieto, presión suave, manos tibias y sin esmalte oscuro en la uña.' }
    ]
  },
  {
    slug: 'esp32',
    titulo: 'El ESP32: el cerebro del equipo',
    categoria: 'esp32',
    resumen: 'Qué hace el microcontrolador: leer el sensor, procesar y enviar los datos por WiFi.',
    minutos: 4,
    bloques: [
      { tipo: 'texto', texto: 'El ESP32 es un microcontrolador con WiFi y Bluetooth integrados. En este proyecto hace de puente entre el sensor y la aplicación web.' },
      { tipo: 'esquema', nombre: 'esp32_flujo', alt: 'Flujo de datos: sensor MAX30102, ESP32, WiFi, servidor y pantalla' },
      { tipo: 'pasos', titulo: 'Qué hace paso a paso', items: [
        'Lee el sensor por I²C usando los pines GPIO 21 (SDA) y GPIO 22 (SCL), alimentado con 3,3 V.',
        'Toma 50 muestras por segundo y las agrupa en bloques de 25.',
        'Se conecta a la red WiFi y envía cada bloque a la plataforma.',
        'Incluye un token propio del dispositivo que el administrador puede revocar, para que solo equipos autorizados envíen datos.',
        'La aplicación recibe los bloques, dibuja la señal y calcula el BPM y la SpO₂.'
      ] },
      { tipo: 'dato', titulo: 'Hasta 5 canales', texto: 'Cada ESP32 puede enviar hasta cinco canales a la vez. Así se pueden medir a varias personas al mismo tiempo, cada una con su sensor.' },
      { tipo: 'dato', titulo: 'Sin sensor también se puede', texto: 'El firmware tiene un modo de datos de prueba que genera una señal parecida a la real. Además, el simulador de señal de esta sección permite probar sin ESP32.' }
    ]
  },
  {
    slug: 'como-se-obtienen-los-resultados',
    titulo: 'Cómo se obtienen los resultados',
    categoria: 'bpm',
    resumen: 'Del dato crudo al BPM: filtro, detección de picos, intervalos y calidad de la señal.',
    minutos: 6,
    bloques: [
      { tipo: 'texto', texto: 'El sensor entrega una larga lista de números. Para llegar a un BPM la aplicación sigue una cadena de pasos:' },
      { tipo: 'pasos', titulo: 'De la luz al BPM', items: [
        'Luz infrarroja (cercana a 880 nm): el sensor mide la intensidad que vuelve del dedo.',
        'Se quita la parte continua (DC) de la señal, que depende del dedo, la presión y la luz de la sala. Queda la parte pulsátil (AC), la que sube y baja con cada latido.',
        'Se detectan los picos sistólicos de la onda. Después de un pico se espera un tiempo mínimo de 380 ms para no confundir la muesca dícrota con otro latido.',
        'Se mide el intervalo en milisegundos entre picos consecutivos.',
        'Se convierte el intervalo en BPM y se promedian varios latidos para que el valor sea estable.'
      ] },
      { tipo: 'formula', titulo: 'Del intervalo al BPM', formula: 'BPM = 60 000 ÷ intervalo entre picos (ms)', nota: 'Ejemplo: picos cada 800 ms equivalen a 60 000 ÷ 800 = 75 BPM.' },
      { tipo: 'texto', texto: 'La forma de la onda también enseña algo: tiene un pico alto (el momento en que el corazón empuja la sangre) y una pequeña muesca después (la válvula aórtica al cerrarse).' },
      { tipo: 'lista', titulo: 'Qué más calcula la plataforma', items: [
        'Variabilidad (HRV): cuánto cambia el intervalo entre latidos.',
        'Clasificación del ritmo: normal, taquicardia, bradicardia o irregular, con la explicación de por qué.',
        'Calidad de la señal: buena, regular o mala, con la causa (movimiento, poca luz, saturación, ruido).'
      ] },
      { tipo: 'aviso', texto: 'Si la calidad es mala la medición no se guarda como válida: es mejor repetirla que guardar un dato dudoso.' }
    ]
  },
  {
    slug: 'saturacion-de-oxigeno',
    titulo: 'La saturación de oxígeno (SpO₂)',
    categoria: 'spo2',
    resumen: 'Qué es, cómo se mide con luz roja e infrarroja y cuál fue tu valor medido.',
    minutos: 6,
    bloques: [
      { tipo: 'texto', texto: 'La SpO₂ indica qué porcentaje de la hemoglobina de la sangre arterial lleva oxígeno. La hemoglobina es la proteína de los glóbulos rojos que transporta el oxígeno desde los pulmones hasta los tejidos.' },
      { tipo: 'spo2_medida' },
      { tipo: 'tabla', titulo: 'Cómo se interpreta (umbrales de la plataforma)', columnas: ['SpO₂', 'Estado'], filas: [
        ['95 % o más', 'Normal'],
        ['90 % a 94 %', 'Hipoxia leve: conviene repetir la medición'],
        ['85 % a 89 %', 'Hipoxia moderada: consulta a un profesional'],
        ['Menos de 85 %', 'Hipoxia severa: busca atención de salud si se confirma']
      ] },
      { tipo: 'esquema', nombre: 'razon_r', alt: 'La hemoglobina con oxígeno absorbe más luz infrarroja; la hemoglobina sin oxígeno absorbe más luz roja' },
      { tipo: 'texto', texto: 'La hemoglobina con oxígeno y la hemoglobina sin oxígeno absorben la luz de forma distinta. Con luz roja (cerca de 660 nm) y luz infrarroja (cerca de 880 nm) a la vez, el sensor compara cuánto absorbe la sangre de cada una.' },
      { tipo: 'pasos', titulo: 'Cómo se calcula', items: [
        'Se mide la parte pulsátil (AC) y la continua (DC) de la señal roja y de la infrarroja.',
        'Se calcula la razón R = (AC rojo ÷ DC rojo) ÷ (AC infrarrojo ÷ DC infrarrojo).',
        'Se convierte R en porcentaje con una curva de calibración.'
      ] },
      { tipo: 'formula', titulo: 'Curva usada en la plataforma', formula: 'SpO₂ ≈ 110 − 25 × R', nota: 'Es una curva empírica aproximada. Un oxímetro clínico usa una calibración propia del fabricante, por eso los valores pueden diferir unos puntos.' },
      { tipo: 'lista', titulo: 'Qué puede alterar la medición', items: [
        'Movimiento del dedo.',
        'Manos frías o mala circulación.',
        'Esmalte de uñas oscuro o uñas postizas.',
        'Luz ambiente fuerte sobre el sensor.',
        'Presión excesiva sobre el dedo.',
        'Monóxido de carbono: el sensor lo confunde con oxígeno y puede mostrar un valor falsamente alto.'
      ] },
      { tipo: 'aviso', texto: 'Un valor bajo no es un diagnóstico. Repite la medición con el dedo quieto y, si sigue bajo o tienes síntomas (falta de aire, mareo, labios azulados), consulta a un profesional de la salud.' }
    ]
  },
  {
    slug: 'datos-de-salud',
    titulo: 'Los datos de salud que maneja la plataforma',
    categoria: 'salud',
    resumen: 'Qué datos se miden, para qué sirven y cómo se cuidan.',
    minutos: 4,
    bloques: [
      { tipo: 'texto', texto: 'Cada medición reúne varios datos. Conocerlos ayuda a interpretar bien un resultado y a saber qué se guarda sobre ti.' },
      { tipo: 'tabla', columnas: ['Dato', 'Qué es', 'De dónde sale'], filas: [
        ['BPM', 'Latidos por minuto', 'Intervalos entre picos de la señal infrarroja'],
        ['SpO₂', 'Saturación de oxígeno en %', 'Razón entre luz roja e infrarroja'],
        ['HRV (RMSSD)', 'Variación entre latidos, en ms', 'Intervalos entre picos'],
        ['Ritmo', 'Normal, taquicardia, bradicardia o irregular', 'BPM y regularidad de los intervalos'],
        ['Calidad de la señal', 'Buena, regular o mala', 'Ruido, amplitud y estabilidad de la señal'],
        ['Actividad y edad', 'Contexto de la medición', 'Lo eliges o lo ingresas tú']
      ] },
      { tipo: 'lista', titulo: 'Cómo se cuidan tus datos', items: [
        'Solo se miden personas mayores de edad.',
        'Antes de medir y de guardar aceptas un consentimiento informado.',
        'Las mediciones guardadas pertenecen a tu cuenta y las consultas en tu historial.',
        'Si no hay internet, la medición queda en tu dispositivo y se envía al volver la conexión.'
      ] },
      { tipo: 'texto', texto: 'Los resultados se comparan con rangos según la actividad y la edad. Así, 110 BPM puede ser esperable después de caminar rápido, pero llamar la atención en reposo.' },
      { tipo: 'aviso', texto: AVISO_EDUCATIVO }
    ]
  }
]

/** Devuelve la lección con ese slug o null. */
export function buscarLeccion(slug) {
  return LECCIONES.find((l) => l.slug === slug) || null
}

/** Lección anterior y siguiente en el orden de estudio, para los botones de navegación. */
export function vecinas(slug) {
  const i = LECCIONES.findIndex((l) => l.slug === slug)
  if (i === -1) return { anterior: null, siguiente: null }
  return { anterior: LECCIONES[i - 1] || null, siguiente: LECCIONES[i + 1] || null }
}

/**
 * Valor de SpO₂ que muestra la lección (RF115) a partir del historial de la cuenta:
 * la medición más reciente que tenga SpO₂. Devuelve null si no hay ninguna.
 * @param {Array<{spo2: number|null, inicio: string, calidad?: string|null}>} items historial, de más reciente a más antigua
 */
export function ultimaSpo2Medida(items = []) {
  const m = items.find((x) => x && x.spo2 !== null && x.spo2 !== undefined && Number.isFinite(Number(x.spo2)))
  return m ? { spo2: Number(m.spo2), fecha: m.inicio, calidad: m.calidad || null } : null
}
