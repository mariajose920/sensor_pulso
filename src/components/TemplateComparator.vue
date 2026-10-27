<template>
  <div class="card">
    <div style="border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; margin-bottom: 1rem;">
      <h3 class="card-title" style="margin-bottom: 0.25rem;">
        Comparacion con Plantilla de Reposo y ECG Educativo (RF24)
      </h3>
      <p style="font-size: 0.85rem; color: var(--color-muted);">
        El sensor MAX30102 mide pulso por absorcion optica (PPG). El ECG normal se muestra como referencia didactica para contrastar intervalos y naturaleza de la senal.
      </p>
    </div>

    <!-- Tabla Comparativa Directa de Parametros (RF24) -->
    <div style="overflow-x: auto; margin-bottom: 1.5rem;">
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
        <thead>
          <tr style="background: var(--color-bg); border-bottom: 2px solid var(--color-border); color: var(--color-muted); font-size: 0.75rem; text-transform: uppercase;">
            <th style="padding: 0.6rem;">Parametro</th>
            <th style="padding: 0.6rem; color: #0284c7;">Plantilla Reposo PPG (RF24)</th>
            <th style="padding: 0.6rem; color: var(--color-success);">Senal del Sensor (MAX30102)</th>
            <th style="padding: 0.6rem; color: #6366f1;">ECG Educativo (Electrico)</th>
          </tr>
        </thead>
        <tbody style="border-bottom: 1px solid var(--color-border);">
          <tr style="border-bottom: 1px solid var(--color-border);">
            <td style="padding: 0.6rem; font-weight: 600;">Frecuencia (BPM)</td>
            <td style="padding: 0.6rem; font-family: monospace; color: #0284c7; font-weight: 600;">72 BPM</td>
            <td style="padding: 0.6rem; font-family: monospace; font-weight: 600;">
              {{ currentBpm > 0 ? currentBpm + ' BPM' : 'En espera' }}
            </td>
            <td style="padding: 0.6rem; font-family: monospace; color: #6366f1;">72 BPM (Referencia)</td>
          </tr>
          <tr style="border-bottom: 1px solid var(--color-border);">
            <td style="padding: 0.6rem; font-weight: 600;">Intervalo de Ciclo</td>
            <td style="padding: 0.6rem; font-family: monospace; color: #0284c7;">833 ms</td>
            <td style="padding: 0.6rem; font-family: monospace;">
              {{ lastIntervalMs > 0 ? lastIntervalMs + ' ms' : '--' }}
            </td>
            <td style="padding: 0.6rem; font-family: monospace; color: #6366f1;">833 ms (Intervalo R-R)</td>
          </tr>
          <tr style="border-bottom: 1px solid var(--color-border);">
            <td style="padding: 0.6rem; font-weight: 600;">Principio Fisico</td>
            <td style="padding: 0.6rem; color: var(--color-muted);">Volumen sanguineo microvascular</td>
            <td style="padding: 0.6rem; color: var(--color-muted);">Luz infrarroja absorbida por tejido</td>
            <td style="padding: 0.6rem; color: var(--color-muted);">Potenciales de accion electricos (mV)</td>
          </tr>
          <tr>
            <td style="padding: 0.6rem; font-weight: 600;">Morfologia</td>
            <td style="padding: 0.6rem; color: var(--color-muted);">Pico sistolico, escotadura, diastole</td>
            <td style="padding: 0.6rem; color: var(--color-muted);">Curva de pulso continuo arterial</td>
            <td style="padding: 0.6rem; color: var(--color-muted);">Complejo QRS puntiagudo, ondas P y T</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Comparador Visual Didactico SVG (2 ciclos completos) -->
    <div style="position: relative; width: 100%; height: 160px; background: #070a13; border: 1px solid var(--color-border); border-radius: 0.5rem; overflow: hidden; padding: 0.5rem;">
      <svg style="width: 100%; height: 100%;" viewBox="0 0 500 140" preserveAspectRatio="none">
        <line v1="10" v2="130" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,2" v-for="x in [125, 250, 375]" :key="x" :x1="x" :x2="x" y1="10" y2="130" />
        <line x1="0" y1="110" x2="500" y2="110" stroke="#334155" stroke-width="1" />

        <!-- Curva ECG Didactica (violeta) -->
        <path :d="ecgPath" fill="none" stroke="#818cf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Curva PPG Plantilla en reposo (cyan) -->
        <path :d="ppgPath" fill="none" stroke="#06b6d4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Etiquetas didacticas -->
        <text x="35" y="24" fill="#a5b4fc" font-size="9" font-family="monospace">Pico R (ECG)</text>
        <line x1="40" y1="28" x2="40" y2="40" stroke="#818cf8" stroke-width="1" stroke-dasharray="2,2" />

        <text x="85" y="16" fill="#67e8f9" font-size="9" font-family="monospace">Pico Sistolico (PPG)</text>
        <line x1="88" y1="20" x2="88" y2="35" stroke="#06b6d4" stroke-width="1" stroke-dasharray="2,2" />

        <text x="45" y="70" fill="#f87171" font-size="8" font-family="monospace">&rarr; Retardo PTT ~200 ms &rarr;</text>
      </svg>

      <!-- Leyenda -->
      <div style="position: absolute; bottom: 8px; right: 10px; display: flex; gap: 0.75rem; font-size: 0.75rem; background: rgba(12, 18, 34, 0.95); padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b;">
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span style="display: inline-block; width: 12px; height: 2px; background: #06b6d4;"></span>
          <span style="color: #67e8f9;">Plantilla PPG Reposo</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span style="display: inline-block; width: 12px; height: 2px; background: #818cf8;"></span>
          <span style="color: #a5b4fc;">ECG Educativo</span>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; margin-top: 1rem; font-size: 0.8rem; color: var(--color-muted);">
      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">Pico Sistolico (PPG)</b>
        <p style="margin-top: 0.25rem;">Registra el aumento de volumen sanguineo que arriba al dedo tras la eyeccion ventricular con retardo mecanico.</p>
      </div>
      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">Escotadura Dicrota</b>
        <p style="margin-top: 0.25rem;">Inflexion provocada por el cierre subito de la valvula aortica al inicio de la fase diastolica.</p>
      </div>
      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">Diferencia con ECG</b>
        <p style="margin-top: 0.25rem;">El sensor MAX30102 mide pulso por luz y no actividad electrica del corazon (RF24).</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { generateRestingTemplate } from '../utils/ppgMath.js'

const props = defineProps({
  currentBpm: { type: Number, default: 72 },
  lastIntervalMs: { type: Number, default: 833 }
})

const template = generateRestingTemplate(120, 2)

const ppgPath = computed(() => {
  const points = template.map((pt, idx) => {
    const x = (idx / (template.length - 1)) * 480 + 10
    const y = 110 - pt.ppg * 75
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${points.join(' L ')}`
})

const ecgPath = computed(() => {
  const points = template.map((pt, idx) => {
    const x = (idx / (template.length - 1)) * 480 + 10
    const y = 85 - pt.ecg * 50
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${points.join(' L ')}`
})
</script>
