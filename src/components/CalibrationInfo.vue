<template>
  <div class="card" style="font-size: 0.85rem; color: var(--color-muted);">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
      <h3 class="card-title" style="margin-bottom: 0;">
        Calibracion y Factores de Correccion del Sensor (MAX30102)
      </h3>
      <span class="badge badge-usuario" style="font-family: monospace;">
        Algoritmo RF (GitHub)
      </span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
      <!-- Factor 1: Filtro DC -->
      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">1. Remocion de Componente DC</b>
        <p style="margin-top: 0.25rem; font-size: 0.8rem;">
          El 98% de la senal del sensor es tejido y hueso (DC). El filtro paso alto suprime la linea base y extrae unicamente el pulso arterial (AC), evitando que la onda se corte o sature en pantalla.
        </p>
      </div>

      <!-- Factor 2: Inversion Optica -->
      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">2. Inversion de Polaridad Optica</b>
        <p style="margin-top: 0.25rem; font-size: 0.8rem;">
          En sistole entra mas sangre y se absorbe mas luz, por lo que el fotodiodo recibe menos cuentas. Se invierte la polaridad (AC = -AC) para que el pico sistolico apunte hacia arriba como en monitores clinicos.
        </p>
      </div>

      <!-- Factor 3: Repositorio y Formula de Calibracion SpO2 -->
      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">3. Repositorio de Referencia en GitHub</b>
        <p style="margin-top: 0.25rem; font-size: 0.8rem;">
          Repositorio: <a href="https://github.com/aromring/MAX30102_by_RF" target="_blank" style="color: var(--color-primary); text-decoration: underline;">aromring/MAX30102_by_RF</a>.
          Usa la regresion cuadratica calibrada:
          <span style="display: block; font-family: monospace; color: var(--color-primary); font-weight: 600; margin-top: 0.25rem;">
            SpO2 = -45.060*R² + 30.354*R + 94.845
          </span>
        </p>
      </div>
    </div>
  </div>
</template>
