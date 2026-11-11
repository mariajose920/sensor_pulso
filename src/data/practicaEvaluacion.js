// Banco de preguntas para practicar antes de las evaluaciones.
// Todo sale de las lecciones de esta misma sección (src/data/lecciones.js).
// Cada opción trae `porQue`: la explicación que se muestra si la eligió (si es incorrecta)
// o la que confirma la respuesta (si es la correcta). Solo una opción por pregunta es correcta.

import { PREGUNTAS_EXTRA } from './practicaEvaluacionExtra.js'

const o = (texto, porQue, correcta = false) => ({ texto, porQue, correcta })

const PREGUNTAS_BASE = [
  // ── El corazón ─────────────────────────────────────────────
  {
    id: 'corazon-1', leccion: 'corazon',
    enunciado: '¿Qué cámara del corazón envía la sangre al resto del cuerpo?',
    opciones: [
      o('Aurícula derecha', 'La aurícula derecha solo recibe la sangre que vuelve del cuerpo; no la impulsa a la circulación sistémica.'),
      o('Ventrículo derecho', 'El ventrículo derecho envía la sangre a los pulmones (circulación pulmonar), no al resto del cuerpo.'),
      o('Ventrículo izquierdo', 'Correcto: es el más fuerte porque impulsa la sangre a todo el cuerpo.', true),
      o('Aurícula izquierda', 'La aurícula izquierda recibe la sangre que viene de los pulmones; las que impulsan son los ventrículos.')
    ]
  },
  {
    id: 'corazon-2', leccion: 'corazon',
    enunciado: '¿Qué estructura funciona como marcapasos natural del corazón?',
    opciones: [
      o('Las válvulas', 'Las válvulas solo aseguran que la sangre avance en un solo sentido; no generan el impulso eléctrico.'),
      o('El nodo sinusal', 'Correcto: es un grupo de células de la aurícula derecha que genera el impulso eléctrico de cada latido.', true),
      o('El ventrículo izquierdo', 'El ventrículo izquierdo es la cámara más fuerte, pero se contrae cuando recibe el impulso; no lo genera.'),
      o('El fotodetector', 'El fotodetector es una parte del sensor MAX30102, no del corazón.')
    ]
  },
  {
    id: 'corazon-3', leccion: 'corazon',
    enunciado: 'En un latido, ¿qué ocurre justo después de que el nodo sinusal genera el impulso eléctrico?',
    opciones: [
      o('Los ventrículos se contraen (sístole)', 'Los ventrículos se contraen después de que las aurículas ya los llenaron, no justo tras el impulso.'),
      o('Las aurículas se contraen y llenan los ventrículos', 'Correcto: primero se contraen las aurículas, luego los ventrículos.', true),
      o('El corazón se relaja (diástole)', 'La relajación (diástole) viene al final del latido, cuando el corazón vuelve a llenarse.'),
      o('Las válvulas dejan de funcionar', 'Las válvulas funcionan todo el tiempo para que la sangre avance en un solo sentido.')
    ]
  },
  {
    id: 'corazon-4', leccion: 'corazon',
    enunciado: '¿Cómo se calcula el gasto cardíaco?',
    opciones: [
      o('Frecuencia cardíaca + volumen sistólico', 'No se suman: el gasto es cuánta sangre mueve por minuto, y eso es una multiplicación (latidos × sangre por latido).'),
      o('Frecuencia cardíaca × volumen sistólico', 'Correcto: latidos por minuto × sangre que se expulsa en cada latido.', true),
      o('Frecuencia cardíaca ÷ volumen sistólico', 'Dividir no da una cantidad de sangre por minuto; el gasto crece cuando suben ambos factores.'),
      o('SpO₂ × frecuencia cardíaca', 'La SpO₂ indica cuánto oxígeno lleva la sangre, no cuánta sangre mueve el corazón.')
    ]
  },

  // ── Frecuencia cardíaca ────────────────────────────────────
  {
    id: 'fc-1', leccion: 'frecuencia-cardiaca',
    enunciado: 'Un adulto en reposo registra 108 BPM. ¿Cómo se clasifica con los rangos de reposo de un adulto?',
    opciones: [
      o('Bradicardia', 'La bradicardia es menos de 60 BPM; 108 está por encima.'),
      o('Normal', 'El rango normal en reposo es de 60 a 100 BPM; 108 lo supera.'),
      o('Taquicardia', 'Correcto: más de 100 BPM en reposo es taquicardia (puede ser normal tras ejercicio, estrés o cafeína).', true),
      o('Hipoxia leve', 'La hipoxia se mide con la SpO₂, no con los BPM.')
    ]
  },
  {
    id: 'fc-2', leccion: 'frecuencia-cardiaca',
    enunciado: 'Una persona muy entrenada registra 48 BPM en reposo. ¿Cómo se clasifica?',
    opciones: [
      o('Bradicardia', 'Correcto: menos de 60 BPM es bradicardia, y puede ser normal en personas muy entrenadas.', true),
      o('Normal', 'El rango normal en reposo empieza en 60 BPM; 48 queda por debajo.'),
      o('Taquicardia', 'La taquicardia es más de 100 BPM; 48 es un corazón lento, no acelerado.'),
      o('Irregular', 'Irregular habla de la regularidad de los intervalos, no del número de BPM.')
    ]
  },
  {
    id: 'fc-3', leccion: 'frecuencia-cardiaca',
    enunciado: '¿Cuál de estas situaciones hace que la frecuencia cardíaca BAJE?',
    opciones: [
      o('Estrés y emociones fuertes', 'La adrenalina acelera el corazón, así que el estrés la sube.'),
      o('Cafeína', 'La cafeína es un estimulante: sube la frecuencia.'),
      o('Sueño y relajación', 'Correcto: al dormir o relajarse la frecuencia baja.', true),
      o('Fiebre o calor', 'La fiebre, la deshidratación y el calor hacen que el corazón lata más rápido.')
    ]
  },
  {
    id: 'fc-4', leccion: 'frecuencia-cardiaca',
    enunciado: '¿Qué mide la variabilidad de la frecuencia cardíaca (HRV)?',
    opciones: [
      o('El promedio de BPM de la medición', 'El promedio es el BPM; la HRV mira cuánto cambia el tiempo entre latidos aunque el promedio sea el mismo.'),
      o('Cuánto cambia el tiempo entre un latido y el siguiente', 'Correcto: esa variación en milisegundos se calcula con el índice RMSSD.', true),
      o('El porcentaje de oxígeno en la sangre', 'Eso es la SpO₂, que se calcula con luz roja e infrarroja.'),
      o('La altura de la onda en la pantalla', 'La altura es la amplitud de la señal; no es la HRV.')
    ]
  },

  // ── Sensor MAX30102 ────────────────────────────────────────
  {
    id: 'sensor-1', leccion: 'sensor-max30102',
    enunciado: '¿Qué técnica usa el MAX30102 para ver el pulso a través del dedo?',
    opciones: [
      o('Electrocardiografía', 'El electrocardiograma mide la actividad eléctrica con electrodos; el MAX30102 no usa electrodos.'),
      o('Fotopletismografía (PPG)', 'Correcto: ilumina la yema del dedo y mide cuánta luz vuelve.', true),
      o('Ecografía', 'La ecografía usa ultrasonido; el sensor usa luz.'),
      o('Presión arterial con brazalete', 'El sensor no aprieta ni mide presión: solo mide la luz que vuelve del dedo.')
    ]
  },
  {
    id: 'sensor-2', leccion: 'sensor-max30102',
    enunciado: 'Los valores 660 nm y 880 nm del sensor corresponden a…',
    opciones: [
      o('Los BPM que detecta cada LED', 'Los nanómetros no son BPM: los BPM se calculan después, a partir de cómo sube y baja la intensidad.'),
      o('La longitud de onda de la luz del LED rojo y del infrarrojo', 'Correcto: 660 nm es el LED rojo y 880 nm el infrarrojo.', true),
      o('Las direcciones I²C del sensor', 'La dirección I²C del sensor es 0x57.'),
      o('El tamaño de la memoria FIFO', 'La FIFO guarda muestras; sus capacidades no se miden en nanómetros.')
    ]
  },
  {
    id: 'sensor-3', leccion: 'sensor-max30102',
    enunciado: '¿Cuál es la dirección I²C del MAX30102?',
    opciones: [
      o('0x21', '21 es el número del pin GPIO que usa el ESP32 para SDA, no la dirección del sensor.'),
      o('0x22', '22 es el pin GPIO de SCL en el ESP32; no es la dirección del sensor.'),
      o('0x57', 'Correcto: es la dirección con la que el ESP32 habla con el sensor.', true),
      o('0x3C', 'Esa es la dirección típica de otros dispositivos (por ejemplo pantallas OLED), no del MAX30102.')
    ]
  },

  // ── ESP32 ──────────────────────────────────────────────────
  {
    id: 'esp32-1', leccion: 'esp32',
    enunciado: '¿Cuántas muestras por segundo toma el ESP32 del sensor?',
    opciones: [
      o('5', 'El 5 es el número máximo de canales, no la velocidad de muestreo.'),
      o('25', 'El 25 es el tamaño de cada bloque que se envía, no las muestras por segundo.'),
      o('50', 'Correcto: toma 50 muestras por segundo y las agrupa en bloques de 25.', true),
      o('100', 'Son 50 muestras por segundo, no 100.')
    ]
  },
  {
    id: 'esp32-2', leccion: 'esp32',
    enunciado: '¿Con qué pines del ESP32 se conecta el sensor por I²C?',
    opciones: [
      o('GPIO 5 y GPIO 6', 'Esos no son los pines usados en este proyecto.'),
      o('GPIO 21 (SDA) y GPIO 22 (SCL)', 'Correcto: son los pines I²C del ESP32 en este montaje.', true),
      o('0x57 y 0x58', '0x57 es la dirección del sensor, no un pin del ESP32.'),
      o('3,3 V y GND', 'Esos pines dan la alimentación al sensor; los datos viajan por SDA y SCL.')
    ]
  },

  // ── Cómo se obtienen los resultados ────────────────────────
  {
    id: 'res-1', leccion: 'como-se-obtienen-los-resultados',
    enunciado: 'Los picos de la señal llegan cada 800 ms. ¿Cuántos BPM son?',
    opciones: [
      o('60 BPM', 'Probablemente tomaste el 60 de los 60 000 sin dividir. BPM = 60 000 ÷ 800.'),
      o('75 BPM', 'Correcto: 60 000 ÷ 800 = 75 BPM.', true),
      o('80 BPM', 'Confundiste el intervalo (800 ms) con los BPM. Hay que dividir 60 000 entre el intervalo.'),
      o('48 BPM', 'Ese resultado no sale de 60 000 ÷ 800; revisa la división.')
    ]
  },
  {
    id: 'res-2', leccion: 'como-se-obtienen-los-resultados',
    enunciado: 'Los picos llegan cada 600 ms. ¿Cuántos BPM son?',
    opciones: [
      o('60 BPM', 'Eso correspondería a un pico cada 1 000 ms. Con 600 ms los latidos son más rápidos.'),
      o('90 BPM', 'Con 90 BPM los picos llegarían cada unos 667 ms; revisa la división 60 000 ÷ 600.'),
      o('100 BPM', 'Correcto: 60 000 ÷ 600 = 100 BPM.', true),
      o('120 BPM', 'Eso correspondería a un pico cada 500 ms.')
    ]
  },
  {
    id: 'res-3', leccion: 'como-se-obtienen-los-resultados',
    enunciado: '¿Por qué después de detectar un pico se espera un mínimo de 380 ms antes de buscar el siguiente?',
    opciones: [
      o('Para ahorrar batería', 'No es por energía: es para no contar latidos de más.'),
      o('Para no confundir la muesca dícrota con otro latido', 'Correcto: la pequeña muesca que sigue al pico (cierre de la válvula aórtica) podría contarse como un latido extra.', true),
      o('Para que el dedo se enfríe', 'La temperatura del dedo no tiene que ver con ese tiempo de espera.'),
      o('Para calcular la SpO₂', 'La SpO₂ se calcula con la razón R de luz roja e infrarroja, no con este tiempo.')
    ]
  },

  // ── SpO₂ ───────────────────────────────────────────────────
  {
    id: 'spo2-1', leccion: 'saturacion-de-oxigeno',
    enunciado: 'Una medición da SpO₂ de 92 %. ¿Cómo se interpreta?',
    opciones: [
      o('Normal', 'Lo normal es 95 % o más; 92 % está por debajo.'),
      o('Hipoxia leve', 'Correcto: de 90 % a 94 % es hipoxia leve y conviene repetir la medición.', true),
      o('Hipoxia moderada', 'La moderada va de 85 % a 89 %; 92 % está por encima.'),
      o('Hipoxia severa', 'La severa es menos de 85 %.')
    ]
  },
  {
    id: 'spo2-2', leccion: 'saturacion-de-oxigeno',
    enunciado: 'Una medición da SpO₂ de 87 %. ¿Cómo se interpreta?',
    opciones: [
      o('Hipoxia leve', 'La leve es de 90 % a 94 %; 87 % está por debajo.'),
      o('Hipoxia moderada', 'Correcto: de 85 % a 89 % es hipoxia moderada y se recomienda consultar a un profesional.', true),
      o('Hipoxia severa', 'La severa es menos de 85 %; 87 % todavía está sobre ese límite.'),
      o('Normal', 'Lo normal es 95 % o más.')
    ]
  },
  {
    id: 'spo2-3', leccion: 'saturacion-de-oxigeno',
    enunciado: '¿Cuál de estas situaciones puede mostrar una SpO₂ falsamente ALTA?',
    opciones: [
      o('Manos tibias', 'Las manos tibias mejoran la señal; el frío es lo que la empeora.'),
      o('Presencia de monóxido de carbono', 'Correcto: el sensor lo confunde con oxígeno y puede mostrar un valor más alto del real.', true),
      o('Dedo quieto', 'Mantener el dedo quieto ayuda a medir bien.'),
      o('Presión suave sobre el sensor', 'La presión suave es la recomendada; la excesiva es la que altera la medición.')
    ]
  },
  {
    id: 'spo2-4', leccion: 'saturacion-de-oxigeno',
    enunciado: '¿Qué datos se usan para calcular la razón R de la SpO₂?',
    opciones: [
      o('Solo los BPM', 'Los BPM salen de los intervalos entre picos; la SpO₂ usa la luz roja y la infrarroja.'),
      o('La parte pulsátil (AC) y continua (DC) de la señal roja y de la infrarroja', 'Correcto: R = (AC rojo ÷ DC rojo) ÷ (AC infrarrojo ÷ DC infrarrojo).', true),
      o('El intervalo entre picos en milisegundos', 'Eso sirve para los BPM, no para la razón R.'),
      o('El tiempo de conexión del ESP32 al WiFi', 'La conexión WiFi no interviene en el cálculo de la SpO₂.')
    ]
  },

]

// Banco completo: hasta 16 preguntas por tema (112 en total)
export const PREGUNTAS_PRACTICA = [...PREGUNTAS_BASE, ...PREGUNTAS_EXTRA]
