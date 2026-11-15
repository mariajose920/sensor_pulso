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

export const ESQUEMAS = ['corazon', 'cadena_sensor', 'esp32_flujo', 'razon_r', 'ppg_muestreo', 'ppg_filtrado']

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
    ],
    reto: [
      {
        id: 'corazon-circuito',
        enunciado: '¿Qué circuito lleva la sangre a los pulmones para cargarla de oxígeno?',
        opciones: [
          { id: 'a', texto: 'La circulación sistémica' },
          { id: 'b', texto: 'La circulación pulmonar' },
          { id: 'c', texto: 'Ambos circuitos hacen el mismo recorrido' }
        ]
      },
      {
        id: 'corazon-bombeo',
        enunciado: '¿Qué parte del corazón bombea la sangre hacia el resto del cuerpo?',
        opciones: [
          { id: 'a', texto: 'El ventrículo izquierdo' },
          { id: 'b', texto: 'La aurícula derecha' },
          { id: 'c', texto: 'El ventrículo derecho' }
        ]
      },
      {
        id: 'corazon-gasto',
        enunciado: '¿Cómo se calcula el gasto cardíaco?',
        opciones: [
          { id: 'a', texto: 'Volumen sistólico dividido por frecuencia cardíaca' },
          { id: 'b', texto: 'Frecuencia cardíaca más volumen sistólico' },
          { id: 'c', texto: 'Frecuencia cardíaca multiplicada por volumen sistólico' }
        ]
      }
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
    ],
    reto: [
      {
        id: 'frecuencia-cardiaca-bpm',
        enunciado: '¿Qué significa BPM?',
        opciones: [
          { id: 'a', texto: 'Latidos por minuto' },
          { id: 'b', texto: 'Latidos por segundo' },
          { id: 'c', texto: 'Milisegundos por latido' }
        ]
      },
      {
        id: 'frecuencia-cardiaca-ejercicio',
        enunciado: '¿Qué suele ocurrir con la frecuencia cardíaca durante el ejercicio?',
        opciones: [
          { id: 'a', texto: 'Siempre baja' },
          { id: 'b', texto: 'Suele subir' },
          { id: 'c', texto: 'Se mantiene fija' }
        ]
      },
      {
        id: 'frecuencia-cardiaca-hrv',
        enunciado: '¿Qué describe la variabilidad de la frecuencia cardíaca?',
        opciones: [
          { id: 'a', texto: 'El color de la sangre' },
          { id: 'b', texto: 'La saturación de oxígeno' },
          { id: 'c', texto: 'La variación del tiempo entre latidos' }
        ]
      }
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
    ],
    reto: [
      {
        id: 'sensor-max30102-luz',
        enunciado: '¿Qué luces usa el MAX30102?',
        opciones: [
          { id: 'a', texto: 'Ultravioleta y verde' },
          { id: 'b', texto: 'Roja e infrarroja' },
          { id: 'c', texto: 'Azul y amarilla' }
        ]
      },
      {
        id: 'sensor-max30102-detector',
        enunciado: '¿Qué mide el fotodetector?',
        opciones: [
          { id: 'a', texto: 'El voltaje de la batería' },
          { id: 'b', texto: 'La temperatura del ESP32' },
          { id: 'c', texto: 'La intensidad de luz que recibe' }
        ]
      },
      {
        id: 'sensor-max30102-nm',
        enunciado: '¿Qué indican los nanómetros de los LED?',
        opciones: [
          { id: 'a', texto: 'La longitud de onda' },
          { id: 'b', texto: 'Los latidos por minuto' },
          { id: 'c', texto: 'El número de muestras' }
        ]
      }
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
    ],
    reto: [
      {
        id: 'esp32-lectura',
        enunciado: '¿Qué componente lee las muestras del MAX30102?',
        opciones: [
          { id: 'a', texto: 'El navegador' },
          { id: 'b', texto: 'El ESP32' },
          { id: 'c', texto: 'El usuario' }
        ]
      },
      {
        id: 'esp32-red',
        enunciado: '¿Cómo puede enviar las muestras el ESP32 a la plataforma?',
        opciones: [
          { id: 'a', texto: 'Por WiFi' },
          { id: 'b', texto: 'Por luz infrarroja' },
          { id: 'c', texto: 'Por sonido' }
        ]
      },
      {
        id: 'esp32-canales',
        enunciado: '¿Cuántos canales simultáneos se describen en la lección?',
        opciones: [
          { id: 'a', texto: 'Dos' },
          { id: 'b', texto: 'Tres' },
          { id: 'c', texto: 'Hasta cinco' }
        ]
      }
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
    ],
    reto: [
      {
        id: 'como-se-obtienen-los-resultados-intervalo',
        enunciado: '¿Qué se mide entre dos picos seguidos?',
        opciones: [
          { id: 'a', texto: 'La longitud de onda' },
          { id: 'b', texto: 'El intervalo de tiempo' },
          { id: 'c', texto: 'La temperatura' }
        ]
      },
      {
        id: 'como-se-obtienen-los-resultados-calculo',
        enunciado: '¿A cuántos BPM equivalen picos separados por 800 ms?',
        opciones: [
          { id: 'a', texto: '75 BPM' },
          { id: 'b', texto: '80 BPM' },
          { id: 'c', texto: '60 BPM' }
        ]
      },
      {
        id: 'como-se-obtienen-los-resultados-senal',
        enunciado: '¿Qué representa la señal PPG capturada aquí?',
        opciones: [
          { id: 'a', texto: 'La actividad eléctrica del corazón' },
          { id: 'b', texto: 'La temperatura corporal' },
          { id: 'c', texto: 'Variaciones de intensidad luminosa asociadas al pulso' }
        ]
      }
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
    ],
    reto: [
      {
        id: 'saturacion-de-oxigeno-significado',
        enunciado: '¿Qué estima la SpO₂?',
        opciones: [
          { id: 'a', texto: 'La frecuencia cardíaca' },
          { id: 'b', texto: 'El porcentaje de hemoglobina saturada de oxígeno' },
          { id: 'c', texto: 'El volumen de sangre del cuerpo' }
        ]
      },
      {
        id: 'saturacion-de-oxigeno-luces',
        enunciado: '¿Qué señales de luz se comparan para estimarla?',
        opciones: [
          { id: 'a', texto: 'Roja e infrarroja' },
          { id: 'b', texto: 'Verde y ultravioleta' },
          { id: 'c', texto: 'Solo infrarroja' }
        ]
      },
      {
        id: 'saturacion-de-oxigeno-curva',
        enunciado: '¿Cómo describe la lección la curva usada por la plataforma?',
        opciones: [
          { id: 'a', texto: 'Como una calibración clínica universal' },
          { id: 'b', texto: 'Como una medición directa de oxígeno' },
          { id: 'c', texto: 'Como una aproximación empírica' }
        ]
      }
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
    ],
    reto: [
      {
        id: 'datos-de-salud-privacidad',
        enunciado: '¿Cómo debes tratar los datos de salud identificables?',
        opciones: [
          { id: 'a', texto: 'Como datos sensibles' },
          { id: 'b', texto: 'Como datos anónimos' },
          { id: 'c', texto: 'Como datos públicos' }
        ]
      },
      {
        id: 'datos-de-salud-consentimiento',
        enunciado: '¿Qué debes obtener antes de compartir mediciones identificables de otra persona?',
        opciones: [
          { id: 'a', texto: 'Su frecuencia en reposo' },
          { id: 'b', texto: 'Su consentimiento' },
          { id: 'c', texto: 'Su promedio de SpO₂' }
        ]
      },
      {
        id: 'datos-de-salud-educativo',
        enunciado: '¿Para qué puedes usar los resultados de esta plataforma?',
        opciones: [
          { id: 'a', texto: 'Para reemplazar una consulta médica' },
          { id: 'b', texto: 'Para emitir diagnósticos' },
          { id: 'c', texto: 'Para aprender a interpretar señales' }
        ]
      }
    ]
  },
  {
    slug: 'ppg-y-muestreo',
    titulo: 'De la luz a la señal PPG',
    categoria: 'sensor',
    resumen: 'Descubre cómo un sensor óptico obtiene una señal de pulso y qué significa tomar muestras a intervalos regulares.',
    minutos: 5,
    bloques: [
      { tipo: 'texto', texto: 'La fotopletismografía (PPG) usa luz para observar cambios en el volumen de sangre del tejido. En el MAX30102, los LED iluminan el dedo y un fotodetector registra cuánta luz regresa al sensor. Esa intensidad cambia a lo largo del pulso.' },
      { tipo: 'esquema', nombre: 'cadena_sensor', alt: 'Los LED iluminan el tejido y el fotodetector recibe parte de la luz que regresa.' },
      { tipo: 'texto', texto: 'Cada lectura del fotodetector es una muestra. La frecuencia de muestreo indica cuántas muestras se toman por segundo. Al colocar las muestras en orden temporal, podemos observar cómo cambia la señal.' },
      { tipo: 'formula', titulo: 'Tiempo entre muestras', formula: 'Δt (ms) = 1000 ÷ frecuencia de muestreo (Hz)', nota: 'En este ejemplo, a 50 Hz se toma una muestra cada 20 ms.' },
      { tipo: 'esquema', nombre: 'ppg_muestreo', alt: 'Muestras de una señal simulada a 50 Hz. Los puntos están separados por 20 ms.' },
      { tipo: 'dato', titulo: 'Muestreo y pulso', texto: 'Los 50 Hz del ejemplo cuentan muestras del sensor por segundo. Para estimar los latidos por minuto, primero hay que analizar cómo cambia la señal a lo largo del tiempo.' }
    ],
    reto: [
      {
        id: 'ppg-y-muestreo-luz',
        enunciado: '¿Qué registra el fotodetector del MAX30102?',
        opciones: [
          { id: 'a', texto: 'La intensidad de luz que regresa al sensor' },
          { id: 'b', texto: 'La actividad eléctrica del corazón' },
          { id: 'c', texto: 'La temperatura del dedo' }
        ]
      },
      {
        id: 'ppg-y-muestreo-hz',
        enunciado: '¿Qué significa muestrear a 50 Hz?',
        opciones: [
          { id: 'a', texto: 'Medir 50 latidos por minuto' },
          { id: 'b', texto: 'Tomar 50 muestras por segundo' },
          { id: 'c', texto: 'Tomar una muestra cada 50 segundos' }
        ]
      },
      {
        id: 'ppg-y-muestreo-intervalo',
        enunciado: '¿Cuánto tiempo pasa entre muestras a 50 Hz?',
        opciones: [
          { id: 'a', texto: '2 ms' },
          { id: 'b', texto: '50 ms' },
          { id: 'c', texto: '20 ms' }
        ]
      }
    ]
  },
  {
    slug: 'filtrado-y-picos-ppg',
    titulo: 'De la señal PPG al pulso',
    categoria: 'bpm',
    resumen: 'Compara una señal con ruido y una señal filtrada, identifica artefactos de movimiento y estima los BPM con los picos.',
    minutos: 6,
    bloques: [
      { tipo: 'texto', texto: 'Al mover el dedo, puede cambiar el contacto con el sensor y variar la cantidad de luz que recibe el fotodetector. Esa alteración se llama artefacto de movimiento y puede parecer un pico de pulso.' },
      { tipo: 'esquema', nombre: 'ppg_filtrado', alt: 'Ejemplo simulado. La señal original muestra un salto por movimiento. La señal filtrada ilustra dos picos separados por 0,8 segundos.' },
      { tipo: 'pasos', titulo: 'De las muestras a los BPM', items: [
        'Revisa la señal original y localiza los tramos afectados por movimiento.',
        'Aplica un filtro para reducir variaciones rápidas y facilitar la identificación de los pulsos.',
        'Identifica los máximos locales de un tramo estable. Usa una separación mínima entre candidatos para evitar contar dos veces el mismo pulso.',
        'Mide el tiempo entre picos consecutivos y calcula los BPM. Si tienes varios intervalos fiables, usa su promedio.'
      ] },
      { tipo: 'formula', titulo: 'De la separación entre picos a los BPM', formula: 'BPM = 60 ÷ intervalo entre picos (s)', nota: 'Si dos picos consecutivos están separados por 0,8 segundos, 60 ÷ 0,8 = 75 BPM.' },
      { tipo: 'aviso', titulo: 'Calidad de la señal', texto: 'Un filtro ayuda a reducir el ruido. Ante un movimiento fuerte, usa un tramo más estable o repite la medición. Los ejemplos son educativos y no permiten hacer diagnósticos.' }
    ],
    reto: [
      {
        id: 'filtrado-y-picos-ppg-movimiento',
        enunciado: '¿Qué puede causar un falso pico en la señal PPG?',
        opciones: [
          { id: 'a', texto: 'Cambiar la unidad de tiempo' },
          { id: 'b', texto: 'Mover el dedo y alterar el contacto con el sensor' },
          { id: 'c', texto: 'Mostrar la señal en otra pantalla' }
        ]
      },
      {
        id: 'filtrado-y-picos-ppg-filtro',
        enunciado: '¿Para qué se usa el filtro del ejemplo?',
        opciones: [
          { id: 'a', texto: 'Para reducir el ruido y facilitar la detección de picos' },
          { id: 'b', texto: 'Para duplicar la frecuencia de muestreo' },
          { id: 'c', texto: 'Para recuperar cualquier tramo dañado por movimiento' }
        ]
      },
      {
        id: 'filtrado-y-picos-ppg-bpm',
        enunciado: '¿A cuántos BPM equivale un intervalo de 0,8 s entre picos?',
        opciones: [
          { id: 'a', texto: '48 BPM' },
          { id: 'b', texto: '80 BPM' },
          { id: 'c', texto: '75 BPM' }
        ]
      }
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
