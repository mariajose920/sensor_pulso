<template>
  <figure class="esquema">
    <svg v-if="nombre === 'corazon'" viewBox="0 0 320 220" role="img" :aria-label="alt">
      <path class="forma" d="M160 205 C60 140 30 90 50 55 C70 20 125 25 160 65 C195 25 250 20 270 55 C290 90 260 140 160 205 Z" />
      <line class="tabique" x1="160" y1="65" x2="160" y2="200" />
      <line class="tabique" x1="62" y1="112" x2="258" y2="112" />
      <text class="rotulo" x="108" y="90" text-anchor="middle">Aurícula</text>
      <text class="rotulo" x="108" y="102" text-anchor="middle">derecha</text>
      <text class="rotulo" x="212" y="90" text-anchor="middle">Aurícula</text>
      <text class="rotulo" x="212" y="102" text-anchor="middle">izquierda</text>
      <text class="rotulo" x="115" y="150" text-anchor="middle">Ventrículo</text>
      <text class="rotulo" x="115" y="162" text-anchor="middle">derecho</text>
      <text class="rotulo" x="205" y="150" text-anchor="middle">Ventrículo</text>
      <text class="rotulo" x="205" y="162" text-anchor="middle">izquierdo</text>
      <circle class="nodo" cx="82" cy="72" r="6" />
      <text class="nota" x="8" y="30">Nodo sinusal</text>
      <line class="guia" x1="48" y1="34" x2="78" y2="68" />
    </svg>

    <svg v-else-if="nombre === 'cadena_sensor'" viewBox="0 0 360 210" role="img" :aria-label="alt">
      <rect class="forma" x="40" y="20" width="280" height="62" rx="31" />
      <text class="rotulo" x="180" y="56" text-anchor="middle">Yema del dedo (vasos con sangre)</text>
      <rect class="sensor" x="40" y="140" width="280" height="50" rx="6" />
      <text class="rotulo" x="180" y="200" text-anchor="middle">Sensor MAX30102</text>
      <circle class="led-rojo" cx="95" cy="165" r="12" />
      <text class="nota" x="95" y="132" text-anchor="middle">LED rojo</text>
      <circle class="led-ir" cx="180" cy="165" r="12" />
      <text class="nota" x="180" y="132" text-anchor="middle">LED infrarrojo</text>
      <rect class="detector" x="250" y="153" width="46" height="24" rx="4" />
      <text class="nota" x="273" y="132" text-anchor="middle">Fotodetector</text>
      <line class="rayo rojo" x1="95" y1="150" x2="130" y2="84" />
      <line class="rayo ir" x1="180" y1="150" x2="200" y2="84" />
      <line class="rayo vuelve" x1="240" y1="84" x2="268" y2="150" />
      <text class="nota" x="274" y="106">luz que vuelve</text>
    </svg>

    <svg v-else-if="nombre === 'esp32_flujo'" viewBox="0 0 640 110" role="img" :aria-label="alt">
      <rect class="caja" x="5" y="30" width="110" height="50" rx="8" /><text class="rotulo" x="60" y="60" text-anchor="middle">MAX30102</text>
      <rect class="caja fuerte" x="170" y="30" width="110" height="50" rx="8" /><text class="rotulo" x="225" y="60" text-anchor="middle">ESP32</text>
      <rect class="caja" x="335" y="30" width="110" height="50" rx="8" /><text class="rotulo" x="390" y="60" text-anchor="middle">Servidor</text>
      <rect class="caja" x="505" y="30" width="125" height="50" rx="8" /><text class="rotulo" x="567" y="60" text-anchor="middle">Pantalla web</text>
      <line class="flecha" x1="115" y1="55" x2="170" y2="55" /><text class="nota" x="142" y="24" text-anchor="middle">I²C</text>
      <line class="flecha" x1="280" y1="55" x2="335" y2="55" /><text class="nota" x="307" y="24" text-anchor="middle">WiFi</text>
      <line class="flecha" x1="445" y1="55" x2="505" y2="55" /><text class="nota" x="475" y="24" text-anchor="middle">datos</text>
    </svg>

    <svg v-else-if="nombre === 'razon_r'" viewBox="0 0 420 170" role="img" :aria-label="alt">
      <text class="rotulo" x="10" y="22">Absorción de luz</text>
      <text class="nota" x="40" y="60">Con oxígeno</text>
      <rect class="barra-ir" x="130" y="46" width="170" height="16" rx="3" />
      <text class="nota" x="304" y="59">infrarroja: más</text>
      <rect class="barra-rojo" x="130" y="68" width="70" height="16" rx="3" />
      <text class="nota" x="204" y="81">roja: menos</text>
      <text class="nota" x="40" y="124">Sin oxígeno</text>
      <rect class="barra-ir" x="130" y="110" width="90" height="16" rx="3" />
      <text class="nota" x="224" y="123">infrarroja: menos</text>
      <rect class="barra-rojo" x="130" y="132" width="160" height="16" rx="3" />
      <text class="nota" x="294" y="145">roja: más</text>
    </svg>
    <figcaption class="pie">{{ alt }}</figcaption>
  </figure>
</template>

<script setup>
defineProps({
  nombre: { type: String, required: true },
  alt: { type: String, default: '' }
})
</script>

<style scoped>
.esquema { margin: 1rem 0; text-align: center; }
svg { width: 100%; max-width: 560px; height: auto; }
.forma { fill: #fecaca; stroke: #b91c1c; stroke-width: 2; }
.tabique { stroke: #b91c1c; stroke-width: 1.5; stroke-dasharray: 4 3; }
.rotulo { font-size: 12px; fill: var(--color-text); font-weight: 600; }
.nota { font-size: 11px; fill: var(--color-muted); }
.nodo { fill: #facc15; stroke: #a16207; stroke-width: 1.5; }
.guia { stroke: var(--color-muted); stroke-width: 1; }
.sensor { fill: #e2e8f0; stroke: #475569; stroke-width: 1.5; }
.led-rojo { fill: #ef4444; }
.led-ir { fill: #7c3aed; }
.detector { fill: #38bdf8; stroke: #0369a1; }
.rayo { stroke-width: 2; stroke-dasharray: 5 3; }
.rayo.rojo { stroke: #ef4444; }
.rayo.ir { stroke: #7c3aed; }
.rayo.vuelve { stroke: #0369a1; }
.caja { fill: var(--color-surface); stroke: var(--color-border); stroke-width: 2; }
.caja.fuerte { fill: #dbeafe; stroke: var(--color-primary); }
.flecha { stroke: var(--color-muted); stroke-width: 2; }
.barra-ir { fill: #7c3aed; }
.barra-rojo { fill: #ef4444; }
.pie { font-size: 0.8rem; color: var(--color-muted); margin-top: 0.35rem; }
</style>
