<template>
  <div class="medicion-view">
    <!-- Estado discreto del guardado de la ficha en segundo plano (RF03): no bloquea el avance de pasos -->
    <div v-if="avisoFichaVisible" class="ficha-toast" :class="'ficha-toast-' + estadoGuardadoFicha.estado" role="status" aria-live="polite" data-testid="ficha-toast">
      <span>{{ estadoGuardadoFicha.mensaje }}</span>
      <button v-if="estadoGuardadoFicha.estado === 'error'" type="button" class="ficha-toast-btn" @click="reintentarGuardadoFicha">Reintentar</button>
    </div>
    <!-- RF01: lo primero que se ve es quién está identificado (solo cuando hay sesión activa) -->
    <div v-if="isAuthenticated">
      <UserIdentifier />
    </div>

    <!-- Encabezado de la vista -->
    <div class="view-header">
      <div>
        <h1 class="view-title">Medición y Tiempo Real</h1>
      </div>
    </div>

    <!-- Bloqueo para visitantes sin sesión -->
    <div v-if="!isAuthenticated" class="card guard-access-card guard-warning mb-4" role="region" aria-label="Inicio de sesión requerido" data-testid="guard-sin-sesion-medicion">
      <div class="guard-icon-wrap guard-icon-warn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div class="guard-content">
        <h2 class="guard-title">Se requiere inicio de sesión para operar el sensor de pulso</h2>
        <p class="guard-desc">
          Para conectarte al sensor y registrar bioseñales en tiempo real, debes identificarte con tu cuenta institucional de la UNACH (@alu.unach.cl o @unach.cl).
        </p>
        <div class="guard-actions">
          <router-link to="/login?redirect=/medicion&motivo=medicion" class="btn btn-primary">
            Iniciar Sesión
          </router-link>
          <router-link to="/aprendizaje/simulador" class="btn btn-secondary">
            Continuar en Modo Simulador Educativo
          </router-link>
        </div>
      </div>
    </div>

    <template v-else>
    <!-- Aviso superior si el docente conectado no tiene permiso de sensor -->
    <div v-if="profesorSinPermisoSensor" class="card guard-access-card guard-info mb-4" role="region" data-testid="profesor-sin-permiso-banner">
      <div class="guard-icon-wrap guard-icon-info">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </div>
      <div class="guard-content">
        <h2 class="guard-title">Cuenta Docente: Permiso de Operación y Publicación no Habilitado</h2>
        <p class="guard-desc">
          Profesor: Tu cuenta actualmente no cuenta con el permiso activo para conectarse al sensor físico ni publicar registros en la galería comunitaria.
        </p>
        <p class="guard-subdesc">
          Si requieres realizar prácticas con el sensor en tus clases, solicita al Administrador que active tu permiso en el Panel de Administración Institucional.
        </p>
        <div class="guard-actions">
          <router-link to="/aulas" class="btn btn-primary btn-sm">Ir a Mis Aulas</router-link>
          <router-link to="/comparacion" class="btn btn-secondary btn-sm">Ver Galería Pública</router-link>
          <router-link to="/aprendizaje/simulador" class="btn btn-secondary btn-sm">Modo Simulador</router-link>
        </div>
      </div>
    </div>

    <!-- Stepper Visual Superior -->
    <nav class="stepper-nav card" aria-label="Progreso del protocolo de medición">
      <div 
        v-for="paso in pasosInfo" 
        :key="paso.numero"
        class="stepper-item"
        :class="{
          'activo': pasoActual === paso.numero,
          'completado': pasoActual > paso.numero,
          'bloqueado': pasoActual < paso.numero
        }"
        @click="irAPaso(paso.numero)"
        role="button"
        :tabindex="pasoActual >= paso.numero ? 0 : -1"
      >
        <div class="stepper-circulo">
          <span v-if="pasoActual > paso.numero">✓</span>
          <span v-else>{{ paso.numero }}</span>
        </div>
        <div class="stepper-etiquetas">
          <span class="stepper-nombre">{{ paso.nombre }}</span>
          <span class="stepper-desc">{{ paso.descCorta }}</span>
        </div>
      </div>
    </nav>

    <!-- ===================================================================== -->
    <!-- PASO 1: CONSENTIMIENTO INFORMADO (RF04 / RF59 / RF76)                 -->
    <!-- ===================================================================== -->
    <section v-if="pasoActual === 1" class="wizard-step-card card anim-fade" aria-labelledby="paso1-titulo">
      <div class="step-intro">
        <span class="step-badge">Paso 1 de 5 · Ética y Privacidad</span>
        <h2 id="paso1-titulo" class="step-heading">Consentimiento Informado Previo y Específico</h2>
        <p class="step-desc">
          En cumplimiento con la <strong>Ley N° 19.628 de Protección de la Vida Privada (Chile)</strong> y las directrices éticas de bioingeniería, toda captura de parámetros fisiológicos exige información transparente y autorización voluntaria previa.
        </p>
      </div>

      <!-- Estado actual de consentimiento -->
      <div v-if="consentimientoVigente" class="alert alert-success" style="margin: 1rem 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <strong>✓ Consentimiento Vigente Registrado</strong>
            <div style="font-size: 0.85rem; color: #166534; margin-top: 2px;">
              Versión {{ consentimientoEstado.version }} autorizada el 
              <strong>{{ consentimientoEstado.fechaHoraTexto || 'recientemente' }}</strong>.
            </div>
          </div>
          <span class="badge badge-success">Auditoría Inmutable </span>
        </div>
      </div>

      <!-- Los 4 Pilares del Consentimiento (RF76) -->
      <div class="pilares-grid">
        <div class="pilar-card">
          <div class="pilar-num">1</div>
          <div class="pilar-content">
            <h4>Finalidad Específica</h4>
            <p>Actividad educativa y experimental de laboratorio universitario para medir, graficar y analizar PPG (BPM, SpO₂ y HRV). No constituye diagnóstico médico ni tiene fines comerciales.</p>
          </div>
        </div>

        <div class="pilar-card">
          <div class="pilar-num">2</div>
          <div class="pilar-content">
            <h4>Datos Recogidos</h4>
            <p>Señal fotopletismográfica (PPG a 100 Hz), frecuencia cardíaca (BPM), saturación (% SpO₂), variabilidad R-R, edad y factores basales (estrés, sueño, cafeína y medicación).</p>
          </div>
        </div>

        <div class="pilar-card">
          <div class="pilar-num">3</div>
          <div class="pilar-content">
            <h4>Responsable del Tratamiento</h4>
            <p>Equipo del proyecto sensor pulso — Universidad Adventista de Chile (UNACH), Facultad de Ingeniería y Negocios. Custodiado con cifrado TLS y políticas RLS en PostgreSQL.</p>
          </div>
        </div>

        <div class="pilar-card">
          <div class="pilar-num">4</div>
          <div class="pilar-content">
            <h4>Plazo de Conservación</h4>
            <p>Hasta 12 meses desde la última medición académica para fines de evaluación docente, garantizando el derecho del titular a solicitar su eliminación en cualquier momento.</p>
          </div>
        </div>
      </div>

      <!-- Checkbox de Aceptación Voluntaria -->
      <div class="consentimiento-check-box">
        <label class="consentimiento-check-label">
          <input 
            type="checkbox" 
            v-model="consentimientoAceptadoCheck" 
            class="checkbox-custom" 
          />
          <span>
            Declaro haber leído y comprendido los 4 pilares informados. Otorgo libre y voluntariamente mi consentimiento para registrar mis señales de pulso para fines estrictamente académicos.
          </span>
        </label>
      </div>

      <!-- Botones de Acción Paso 1 -->
      <div class="step-nav-actions">
        <div></div>
        <button 
          type="button" 
          class="btn btn-primary btn-lg"
          :disabled="!puedeAvanzarPaso1"
          @click="confirmarPaso1"
        >
          <span>Aceptar y Pasar a Datos del Paciente</span> ➔
        </button>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- PASO 2: DATOS DEL PACIENTE Y FACTORES BASALES (RF03)                   -->
    <!-- ===================================================================== -->
    <section v-else-if="pasoActual === 2" class="wizard-step-card card anim-fade" aria-labelledby="paso2-titulo">
      <div class="step-intro">
        <span class="step-badge">Paso 2 de 5 · Anamnesis y Factores</span>
        <h2 id="paso2-titulo" class="step-heading">Ficha del Paciente y Factores Fisiológicos Basales</h2>
        <p class="step-desc">
          En fotopletismografía, la frecuencia cardíaca y la variabilidad están moduladas directamente por el tono simpático. Declarar la edad (≥18 años), estrés, cafeína y sueño es imprescindible para justificar clínicamente la medición.
        </p>
      </div>

    <!-- Componente Oficial de Ficha del Paciente RF03 -->
     <DatosPacienteCard 
     ref="pacienteCardRef"
     @paciente-actualizado="onPacienteActualizado" 
      @abrir-consentimiento="pasoActual = 1" 
      />

      <div v-if="errorPacientePaso2" class="alert alert-danger" style="margin-top: 1rem;">
         {{ errorPacientePaso2 }}
      </div>

      <!-- Botones de Acción Paso 2 -->
      <div class="step-nav-actions">
        <button type="button" class="btn btn-secondary" @click="pasoActual = 1">
          ⬅ Volver al Consentimiento
        </button>
        <button type="button" class="btn btn-primary btn-lg" @click="confirmarPaso2">
          <span>Guardar Ficha y Pasar al Reposo de 1 Minuto </span> ➔
        </button>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- PASO 3: REPOSO DE 1 MINUTO (60 SEGUNDOS)                              -->
    <!-- ===================================================================== -->
    <section v-else-if="pasoActual === 3" class="wizard-step-card card anim-fade" aria-labelledby="paso3-titulo">
      <div class="step-intro">
        <span class="step-badge">Paso 3 de 5 · Estabilización Hemodinámica</span>
        <h2 id="paso3-titulo" class="step-heading">Período de Reposo Cardiovascular Basal (1 Minuto)</h2>
        <p class="step-desc">
          Según las directrices de la <strong>American Heart Association (AHA)</strong>, para registrar una frecuencia cardíaca basal fidedigna el participante debe descansar al menos 1 minuto en calma, evitando taquicardias reactivas por deambulación o nerviosismo.
        </p>
      </div>

      <!-- Cronómetro de Reposo Circular e Interactivo Centrado -->
      <div class="reposo-timer-card">
        <div class="reposo-timer-center">
          <div class="timer-circulo-wrapper">
            <svg class="timer-svg" viewBox="0 0 140 140">
              <circle class="timer-bg-circle" cx="70" cy="70" r="62" />
              <circle 
                class="timer-progress-circle" 
                cx="70" 
                cy="70" 
                r="62" 
                :stroke-dasharray="circunferenciaTimer"
                :stroke-dashoffset="offsetTimer"
              />
            </svg>
            <div class="timer-center-text">
              <span class="timer-numeros">{{ tiempoFormateado }}</span>
              <span class="timer-label">{{ reposoCompletado ? 'Completado' : reposoEnCurso ? 'En reposo...' : 'Listo' }}</span>
            </div>
          </div>

          <!-- Guía Visual de Respiración Rítmica -->
          <div class="respiracion-guia-centrada">
            <div class="pulmon-pulso-icon" :class="{ 'anim-pulsar': reposoEnCurso }">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <div class="respiracion-texto-centrado">
              <strong v-if="reposoCompletado" class="color-exito">Fisiología basal estabilizada (AHA)</strong>
              <strong v-else-if="reposoEnCurso" class="color-progreso">Inhala suavemente... Exhala despacio...</strong>
              <strong v-else>Presiona iniciar para comenzar el reposo de 1 minuto</strong>
              <p>Respirar rítmicamente activa el nervio vago y estabiliza el intervalo R-R antes de medir.</p>
            </div>
          </div>

          <!-- Controles del Temporizador -->
          <div class="timer-controles">
            <button 
              v-if="!reposoEnCurso && !reposoCompletado" 
              type="button" 
              class="btn btn-primary btn-lg"
              @click="iniciarReposo"
            >
              Iniciar Reposo (60 s)
            </button>

            <button 
              v-else-if="reposoEnCurso" 
              type="button" 
              class="btn btn-warning btn-lg"
              @click="pausarReposo"
            >
              Pausar Reposo
            </button>

            <button 
              v-else-if="reposoCompletado" 
              type="button" 
              class="btn btn-secondary btn-sm"
              @click="reiniciarReposo"
            >
              Repetir Reposo (1 min)
            </button>

            <!-- Botón de Agilidad para Pruebas Docentes / Laboratorio -->
            <button 
              type="button" 
              class="btn btn-secondary btn-sm btn-omitir" 
              title="Acelera el temporizador a 0 s para pruebas rápidas de laboratorio o evaluación docente"
              @click="omitirReposoLaboratorio"
            >
              Omitir Reposo (Modo Laboratorio)
            </button>
          </div>
        </div>

        <!-- Instrucciones Clínicas de Reposo con Iconos Profesionales SVG -->
        <div class="instrucciones-grid">
          <div class="inst-item">
            <div class="inst-icon-svg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="4" y="2" width="16" height="12" rx="2"></rect>
                <line x1="4" y1="14" x2="4" y2="22"></line>
                <line x1="20" y1="14" x2="20" y2="22"></line>
                <line x1="4" y1="18" x2="20" y2="18"></line>
              </svg>
            </div>
            <div>
              <strong>Espalda Apoyada</strong>
              <p>Sentado cómodamente, pies en el piso y sin cruzar las piernas.</p>
            </div>
          </div>

          <div class="inst-item">
            <div class="inst-icon-svg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
            </div>
            <div>
              <strong>Brazo a la Altura Cardíaca</strong>
              <p>Mano apoyada sobre la mesa, sin tensión en los dedos.</p>
            </div>
          </div>

          <div class="inst-item">
            <div class="inst-icon-svg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
            </div>
            <div>
              <strong>Silencio Absoluto</strong>
              <p>No hablar ni reírse durante el minuto de reposo.</p>
            </div>
          </div>

          <div class="inst-item">
            <div class="inst-icon-svg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>
              </svg>
            </div>
            <div>
              <strong>Temperatura Confortable</strong>
              <p>Dedos templados para asegurar una perfusión periférica adecuada.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Botones de Acción Paso 3 -->
      <div class="step-nav-actions">
        <button type="button" class="btn btn-secondary" @click="pasoActual = 2">
          Volver a Ficha
        </button>
        <button 
          type="button" 
          class="btn btn-primary btn-lg"
          :disabled="!reposoCompletado"
          @click="confirmarPaso3"
        >
          <span>Pasar a la Medición (Paso 4)</span>
        </button>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- PASO 4: MEDICIÓN EN TIEMPO REAL (TODO LO QUE ES MEDICIÓN)             -->
    <!-- ===================================================================== -->
    <section v-else-if="pasoActual === 4" class="anim-fade" aria-labelledby="paso4-titulo">
      <AvisoEducativo v-if="!esDocenteVista" compacto />
      <div class="card step-intro-medicion">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h2 id="paso4-titulo" class="step-heading" style="margin: 0.25rem 0;">
              Medición de la Frecuencia Cardíaca y Señal PPG
            </h2>
            <p class="step-desc" style="margin: 0;">
              El paciente completó su reposo. Adquiriendo datos ópticos del sensor MAX30102 en tiempo real por la fuente que elijas (WiFi o USB).
            </p>
          </div>
        </div>
      </div>

      <!-- Banner Clínico del Paciente Vinculado (RF03 / RF19) -->
      <div v-if="pacienteActivo" class="paciente-clinico-banner">
        <div class="pac-banner-header">
          <div class="pac-avatar-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div class="pac-title-block">
            <div class="pac-nombre-row">
              <span class="pac-live-dot"></span>
              <span class="pac-nombre">{{ pacienteActivo.nombre }}</span>
              <span class="pac-edad-chip">{{ pacienteActivo.edad }} años</span>
            </div>
            <span class="pac-sub">Ficha validada para adquisición de bioseñales</span>
          </div>
          <div v-if="consentimientoEstado.vigente" class="pac-consent-pill" data-testid="consentimiento-valido">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Consentimiento Válido</span>
          </div>
          <div v-else class="pac-consent-pill pill-sin" data-testid="consentimiento-no-valido">
            <span>Sin consentimiento válido</span>
            <button type="button" class="btn-enlace-docente" @click="pasoActual = 1">Abrir consentimiento</button>
          </div>
        </div>

        <div class="pac-tags-row">
          <div class="pac-tag-item">
            <span class="pac-tag-label">Estrés:</span>
            <strong class="pac-tag-val">{{ pacienteActivo.nivelEstres }}</strong>
          </div>
          <div class="pac-tag-item">
            <span class="pac-tag-label">Medicación:</span>
            <strong class="pac-tag-val">{{ pacienteActivo.medicacion || 'Ninguna' }}</strong>
          </div>
          <div class="pac-tag-item">
            <span class="pac-tag-label">Contexto:</span>
            <strong class="pac-tag-val">{{ pacienteActivo.actividadNombre || pacienteActivo.actividadPrevia || 'Reposo basal' }}</strong>
          </div>
          <div v-if="pacienteActivo.cafeina" class="pac-tag-item">
            <span class="pac-tag-label">Cafeína:</span>
            <strong class="pac-tag-val">{{ pacienteActivo.cafeina }}</strong>
          </div>
        </div>
      </div>

      <!-- Bloqueo de hardware si el docente conectado no tiene permiso habilitado -->
      <div v-if="profesorSinPermisoSensor" class="card guard-access-card guard-info mb-4" data-testid="profesor-sin-permiso-paso4">
        <div class="guard-icon-wrap guard-icon-info">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div class="guard-content">
          <h3 class="guard-title">Acceso al Sensor Restringido para Cuenta Docente sin Permiso</h3>
          <p class="guard-desc">
            La conexión WiFi/USB y la adquisición de señales en vivo requieren que un Administrador habilite el permiso de operación y publicación en tu perfil docente.
          </p>
        </div>
      </div>

      <template v-else>
      <!-- 1) ¿Cómo se mide? WiFi o USB: el resto de la pantalla depende de la respuesta -->
      <FuenteMedicionSelector />

      <!-- Solo con fines de aprendizaje: se muestra con cualquiera de las dos fuentes -->
      <div class="alert alert-info aviso-aprendizaje" role="note" data-testid="aviso-solo-aprendizaje">
        <strong>Solo con fines de aprendizaje.</strong>
        Esta medición es un ejercicio educativo: no es un dispositivo médico, no entrega diagnósticos y no reemplaza la evaluación de un profesional de la salud.
      </div>

      <!-- 2) Con la fuente conectada: pacientes y canales -->
      <template v-if="esDocenteVista">
        <!-- Solo un botón: al agregar el paciente aparece su gráfica y se puede agregar otro -->
        <CanalesPacientesPanel v-if="fuenteConectada" @agregado="alAgregarCanal" />
      </template>
      <template v-else>
        <!-- Estudiantes y usuarios: eligen su canal libre -->
        <VinculacionCanales @canal-seleccionado="seleccionarCanal" @solicitar-consentimiento="solicitarConsentimientoConAccion" />
      </template>
      </template>

      <!-- Control y Gestión de Sesión de Medición en Vivo (RF09, RF10, RF11, RF111) -->
      <!-- (Docente/administrador: el estado de la conexión se ve en «¿Cómo vas a medir?» y cada paciente se cierra con
           «Terminar»; el control de sesión con cronómetro y rondas queda para estudiantes y usuarios.) -->
      <details v-if="!esDocenteVista" class="herramientas-prueba">
        <summary>Sesión de medición (inicio, fin y estado)</summary>
        <SesionMedicionControl @ver-resultados="finalizarMedicionYVerResultados" />
      </details>

      <!-- RF10 / RF11: si se pierde la comunicación en plena medición, se avisa y las gráficas quedan con lo último recibido -->
      <div v-if="esDocenteVista && perdioConexion" class="alert alert-warning" role="alert" data-testid="comunicacion-perdida">
        <strong>Se perdió la comunicación con el sensor.</strong>
        Las gráficas muestran lo último que llegó. Revisa la conexión por {{ fuenteActual === 'usb' ? 'USB' : 'WiFi' }}; al volver, la medición
        continúa sola. Si no vuelve, pulsa «Terminar» en cada gráfica para guardar lo medido.
      </div>

      <!-- Un canal sin datos del paciente, términos y consentimiento no puede medir -->
      <div v-if="!canalSeleccionadoListo && !docenteSinCanal && !esDocenteVista" class="alert alert-warning" role="alert" data-testid="canal-bloqueado">
        <strong>El Canal {{ canalSeleccionado }} aún no puede medir.</strong>
        Completa los datos del paciente, los términos y condiciones y el consentimiento de esa persona.
      </div>

      <!-- Fuente conectada pero sin datos del sensor: no se muestran valores ni gráficas inventados -->
      <div v-if="canalSeleccionadoListo && fuenteConectada && !sensorDetectado" class="alert alert-warning" role="status" data-testid="sensor-no-detectado">
        <strong>Sensor no detectado.</strong>
        La fuente está conectada pero todavía no llegan datos de los sensores. Revisa que el sensor MAX30102 esté conectado al ESP32 y apoya el dedo sobre él.
      </div>

      <!-- Sensor conectado a la placa pero sin dedo apoyado: la señal es plana -->
      <div v-if="medicionActiva && canalActivoData?.calidad === 'sin_dedo'" class="alert alert-warning" role="status" data-testid="sin-dedo">
        <strong>Sin dedo sobre el sensor.</strong>
        La placa envía datos, pero no detecta un dedo: apóyalo suavemente sobre el sensor para ver el pulso.
      </div>

      <!-- 3) Gráficos: uno por canal o todos juntos con un color por canal. Con WiFi aparecen al agregar el
           paciente; con USB, al pulsar «Iniciar medición». -->
      <div ref="zonaGraficas">
        <GraficasCanalesPropios
          v-if="(sensorDetectado || perdioConexion) && graficablesPropios.length >= 1"
          :graficables="graficablesPropios"
          :frecuenciaHz="esp32State.frecuenciaHz"
          :sesion-id="canalesState.sesionActivaId"
          :fuente="simuladorActivo ? 'simulador' : 'sensor'"
          :paciente-de="pacienteDeCanal"
          @quitar="quitarCanal"
        />
      </div>

      <!-- Valores del canal seleccionado (plegado para el docente). La única gráfica es la del canal, más arriba. -->
      <component :is="esDocenteVista ? 'details' : 'div'" v-if="medicionActiva" class="detalle-canal">
      <summary v-if="esDocenteVista">Valores del canal seleccionado</summary>
      <!-- Monitores de Biomarcadores Fisiológicos en Tiempo Real (RF07: BPM, RF114: SpO₂) -->
      <div class="biomarcadores-grid">
        <!-- RF07: Monitor y Despliegue del Valor de Frecuencia Cardíaca (BPM) -->
        <ValorBpmCard
          :canal="canalSeleccionado"
          :bpm="canalActivoData?.bpm || 0"
          :instantBpm="monitorBpm.stats.instantBpm"
          :promedioBpm="monitorBpm.stats.averageBpm"
          :minBpm="monitorBpm.stats.minBpm"
          :maxBpm="monitorBpm.stats.maxBpm"
          :totalLecturas="monitorBpm.stats.totalLecturas"
          :estabilidadTexto="monitorBpm.stats.estabilidad"
          :estabilidadNivel="monitorBpm.stats.estabilidadNivel"
          :edadPaciente="pacienteActivo?.edad || 25"
          :actividadPaciente="pacienteActivo?.actividadPrevia || 'reposo'"
        />

        <!-- RF114: Monitor y Despliegue de la Saturación de Oxígeno (SpO₂) con MAX30102 -->
        <ValorSpo2Card
          :canal="canalSeleccionado"
          :spo2="canalActivoData?.spo2 || 0"
          :instantSpo2="monitorSpo2.stats.instantSpo2"
          :promedioSpo2="monitorSpo2.stats.averageSpo2"
          :minSpo2="monitorSpo2.stats.minSpo2"
          :maxSpo2="monitorSpo2.stats.maxSpo2"
          :totalLecturas="monitorSpo2.stats.totalLecturas"
          :ratioR="monitorSpo2.stats.ratioR"
          :perfusionIndex="monitorSpo2.stats.indicePerfusion"
        />
      </div>
      </component>

      <!-- RF21: Alerta Fuera de Rango: Visual, Sonora y con Registro en el Historial -->
      <AlertaFueraRangoBanner
        v-if="medicionActiva"
        :alerta-activa="alertaFueraRangoActiva"
        :tipo="alertaFueraRangoTipo"
        :valor="alertaFueraRangoValor"
        :limite="alertaFueraRangoLimite"
        :diferencia="alertaFueraRangoDiferencia"
        :diagnostico="alertaFueraRangoDiagnostico"
        :medicion-id="sesionActivaId"
        :usuario-id="currentUserId"
      />

      <!-- Comparación Cuantitativa y Visual con el Rango Fisiológico (RF20) -->
      <ComparadorRangoCard
        v-if="medicionActiva"
        :bpm="canalActivoData?.bpm || monitorBpm.stats.instantBpm || 0"
        :spo2="canalActivoData?.spo2 || monitorSpo2.stats.instantSpo2 || 0"
        :paciente="pacienteActivo"
      />

      <!-- RF08: Visualizar hasta 5 canales a la vez, cada uno con BPM y SpO₂ (con soporte de asignación RF12) -->
      <MultiCanalMonitor
        v-if="canalesMostrados.length && !esDocenteVista"
        :canales="canalesMostrados"
        :canalSeleccionado="canalSeleccionado"
        :miCanalAsignado="miCanalAsignado"
        :obtenerNombreAsignado="obtenerNombreAsignado"
        @select="seleccionarCanal"
      />

      <!-- Panel de Pruebas, Diagnóstico y Firmware -->
      <details v-if="usuarioActual.rol === 'admin'" class="herramientas-prueba">
        <summary>Herramientas de prueba, firmware y documentación (WiFi)</summary>
      <div class="card test-panel">
        <div class="test-tabs">
          <button 
            class="tab-btn" 
            :class="{ active: tabActiva === 'simulador' }"
            @click="tabActiva = 'simulador'"
          >
            Emulador de Pruebas WiFi
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: tabActiva === 'firmware' }"
            @click="tabActiva = 'firmware'"
          >
            Código de Firmware ESP32
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: tabActiva === 'api' }"
            @click="tabActiva = 'api'"
          >
            Documentación de Ingesta y Canales
          </button>
        </div>

        <!-- Tab 1: Emulador de Pruebas WiFi -->
        <div v-if="tabActiva === 'simulador'" class="tab-content">
          <p class="tab-description">
            Permite simular el envío de paquetes HTTP POST idénticos a los generados por el microcontrolador ESP32 mediante WiFi hacia el endpoint <code>/api/esp32/telemetria</code>.
          </p>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Token de Dispositivo:</label>
              <input 
                type="text" 
                class="form-control font-mono" 
                v-model="tokenPrueba" 
                placeholder="esp_demotoken_unach_2026_rf05"
              />
              <small class="form-text">El token autentica al ESP32 frente al servidor. Un token inválido o revocado será rechazado con HTTP 403.</small>
            </div>

            <div class="action-buttons">
              <button class="btn btn-secondary" @click="enviarUnicoPaquete" :disabled="enviandoManual">
                {{ enviandoManual ? 'Enviando...' : 'Enviar 1 Paquete de Prueba' }}
              </button>
              <button 
                class="btn" 
                :class="simuladorActivo ? 'btn-danger' : 'btn-success'"
                @click="toggleSimulador"
              >
                {{ simuladorActivo ? 'Detener Emisión Continua' : 'Transmisión Continua (1 Hz)' }}
              </button>
            </div>
            <div class="simulation-presets-row" style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
              <span class="preset-label" style="font-size: 0.8rem; color: var(--color-muted); font-weight: 600;">Pruebas de Alerta:</span>
              <button type="button" class="btn btn-sm btn-outline-danger" @click="enviarPaquetePersonalizado(128, 98)" title="Simula taquicardia para activar alerta">
                Taquicardia (128 BPM)
              </button>
              <button type="button" class="btn btn-sm btn-outline-warning" @click="enviarPaquetePersonalizado(48, 98)" title="Simula bradicardia para activar alerta">
                Bradicardia (48 BPM)
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger" @click="enviarPaquetePersonalizado(76, 88)" title="Simula desaturación de oxígeno para activar alerta">
                Desaturación (88% SpO₂)
              </button>
              <button type="button" class="btn btn-sm btn-outline-success" @click="enviarPaquetePersonalizado(72, 98)" title="Simula parámetros normales">
                Normal (72 BPM / 98%)
              </button>
            </div>
          </div>

          <div v-if="ultimoResultadoEnvio" class="alert" :class="ultimoResultadoEnvio.ok ? 'alert-success' : 'alert-danger'">
            <strong>Resultado:</strong> {{ ultimoResultadoEnvio.mensaje || ultimoResultadoEnvio.error }}
            <span class="font-mono" style="float: right;">{{ ultimoResultadoEnvio.timestamp }}</span>
          </div>
        </div>

        <!-- Tab 2: Firmware -->
        <div v-if="tabActiva === 'firmware'" class="tab-content">
          <p class="tab-description">
            El firmware completo en C++ para Arduino/PlatformIO está guardado en 
            <code>firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino</code>.
          </p>
          <div class="firmware-code-box">
            <pre><code>// 1. Configurar WiFi y Token de Dispositivo (RF54)
#define WIFI_SSID "TU_RED_WIFI"
#define WIFI_PASS "TU_PASSWORD"
#define DISPOSITIVO_TOKEN "esp_demotoken_unach_2026_rf05"
// 2. El ESP32 sintetiza las ondas de los 5 canales de prueba con muesca dícrota
// y las transmite por HTTP POST a 1 Hz con cabecera X-ESP32-Token: &lt;token&gt;</code></pre>
          </div>
        </div>

        <!-- Tab 3: Documentación de Ingesta -->
        <div v-if="tabActiva === 'api'" class="tab-content">
          <p class="tab-description">
            Especificación de la arquitectura de vinculación de canales y telemetría:
          </p>
          <table class="api-table">
            <tbody>
              <tr>
              <th>Visualización 5 Canales</th>
              <td>Supervisión simultánea de hasta 5 canales fisiológicos del ESP32 con BPM, SpO₂ y calidad en tiempo real.</td>
            </tr>
            <tr>
              <th>Medición SpO₂</th>
              <td>Adquisición óptica dual 660 nm (Rojo) y 880-940 nm (IR) con sensor MAX30102.</td>
            </tr>
            <tr>
              <th>Vinculación Canales</th>
              <td>Función atómica <code>elegir_canal(p_sesion, p_canal)</code>: Asigna el canal al estudiante que lo selecciona.</td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
      </details>

      <!-- Botones de Acción Paso 4 -->
      <div class="step-nav-actions" style="margin-top: 1.5rem;">
        <button type="button" class="btn btn-secondary" @click="pasoActual = 3">
          ⬅ Volver al Reposo (Paso 3)
        </button>
        <button type="button" class="btn btn-success btn-lg" @click="finalizarMedicionYVerResultados">
          <span>Finalizar Medición y Ver Resultados (Paso 5)</span> ➔
        </button>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- PASO 5: RESULTADOS Y DIAGNÓSTICO CLÍNICO (RF18 / RF19)                -->
    <!-- ===================================================================== -->
    <section v-else-if="pasoActual === 5" class="wizard-step-card card anim-fade" aria-labelledby="paso5-titulo">
      <div class="step-intro">
        <span class="step-badge" style="background: #dcfce7; color: #166534;">Paso 5 de 5 · Informe Final Consolidado</span>
        <h2 id="paso5-titulo" class="step-heading">Resultados Clínicos y Evaluación del Ritmo</h2>
        <p class="step-desc">
          Medición completada y consolidada con éxito. A continuación se presenta el informe completo con la clasificación médica fundamentada según la American Heart Association y la vinculación de factores basales.
        </p>
      </div>

      <!-- RF75: los resultados son orientativos, no un diagnóstico -->
      <AvisoEducativo />

      <!-- Contenedor Imprimible Exclusivo para el Informe Clínico y Evaluación del Ritmo -->
      <div id="informe-clinico-imprimible">
        <!-- Resumen del Paciente Vinculado (RF03) -->
        <div v-if="pacienteActivo" class="resultado-paciente-card">
          <div class="res-pac-header">
            <div>
              <strong>Paciente Evaluado:</strong> {{ pacienteActivo.nombre }} ({{ pacienteActivo.edad }} años)
            </div>
            <span class="badge badge-primary">Ficha Validada</span>
          </div>
          <div class="res-pac-tags">
            <span class="tag-item">Estrés: <strong>{{ pacienteActivo.nivelEstres }}</strong></span>
            <span class="tag-item">Sueño: <strong>{{ pacienteActivo.sueno || 'No especificado' }}</strong></span>
            <span class="tag-item">Cafeína: <strong>{{ pacienteActivo.cafeina || 'Ninguna' }}</strong></span>
            <span class="tag-item">Medicación: <strong>{{ pacienteActivo.medicacion || 'Ninguna' }}</strong></span>
            <span class="tag-item">Contexto: <strong>{{ pacienteActivo.actividadNombre || pacienteActivo.actividadPrevia || 'Reposo basal' }}</strong></span>
            <span v-if="sesionState.sesionActiva" class="tag-item" style="border-color: #bbf7d0; background: #f0fdf4;">
              Sesión: <strong style="color: #15803d;">#{{ sesionState.sesionActiva.id.substring(0, 8) }} (Ronda {{ sesionState.sesionActiva.ronda }})</strong>
            </span>
          </div>
        </div>

        <!-- Valores Consolidados de la Medición -->
        <div class="valores-consolidados-grid">
          <div class="valor-box">
            <div class="valor-titulo">Frecuencia Cardíaca</div>
            <div class="valor-num">{{ resultadosFinales.bpm }} <small>BPM</small></div>
            <div class="valor-sub">Promedio en {{ pacienteActivo?.actividadNombre || 'reposo basal' }}</div>
          </div>

          <div class="valor-box">
            <div class="valor-titulo">Saturación de Oxígeno</div>
            <div class="valor-num color-spo2">{{ resultadosFinales.spo2 }} <small>%</small></div>
            <div class="valor-sub">SpO₂ por absorción óptica</div>
          </div>

          <div class="valor-box">
            <div class="valor-titulo">Estabilidad / HRV</div>
            <div class="valor-num color-pi">{{ monitorBpm.stats.estabilidadNivel || 'normal' }}</div>
            <div class="valor-sub">{{ monitorBpm.stats.totalLecturas }} lecturas acumuladas</div>
          </div>

          <div class="valor-box">
            <div class="valor-titulo">Índice de Perfusión (PI)</div>
            <div class="valor-num">{{ monitorSpo2.stats.indicePerfusion ? monitorSpo2.stats.indicePerfusion.toFixed(1) : '4.5' }} <small>%</small></div>
            <div class="valor-sub">Amplitud pulsátil AC/DC</div>
          </div>
        </div>

        <!-- Grid 50-50: Evaluación de Rangos (RF20) + Significado Clínico (RF23) -->
        <div class="resultados-analisis-grid">
          <!-- Columna Izquierda (50%): Evaluación Cuantitativa y Visual de Rangos (RF20) -->
          <ComparadorRangoCard
            :bpm="resultadosFinales.bpm"
            :spo2="resultadosFinales.spo2"
            :paciente="pacienteActivo"
          />

          <!-- Columna Derecha (50%): Significado Clínico y Factores del Caso (RF23) -->
          <InterpretacionResultados
            :bpm="resultadosFinales.bpm"
            :spo2="resultadosFinales.spo2"
            :paciente="pacienteActivo"
          />
        </div>

        <!-- RF22: cómo se obtuvieron el BPM y la SpO₂ de esta medición -->
        <details class="explicacion-obtencion">
          <summary>¿Cómo se obtuvieron estos resultados?</summary>
          <ExplicacionResultados
            tipo="ambos"
            :bpm="resultadosFinales.bpm"
            :spo2="resultadosFinales.spo2"
            :ratioR="monitorSpo2.stats.ratioR"
          />
        </details>

        <!-- Tarjeta de Clasificación del Ritmo Cardíaco (RF18 AHA / Mayo Clinic) -->
        <div 
          v-if="clasificacionRitmo" 
          class="ritmo-diagnostico-card"
          :style="{ borderColor: clasificacionRitmo.bordeHex, backgroundColor: clasificacionRitmo.bgHex }"
        >
          <div class="ritmo-diag-header">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="punto-ritmo" :style="{ backgroundColor: clasificacionRitmo.colorHex }"></span>
              <strong :style="{ color: clasificacionRitmo.colorHex }" style="font-size: 1.15rem;">
                {{ clasificacionRitmo.nombre }}
              </strong>
              <span class="badge badge-subtle">{{ clasificacionRitmo.rangoBpm }}</span>
            </div>
            <span class="badge" :class="clasificacionRitmo.badgeClass">
              Guía Médica AHA
            </span>
          </div>

          <p class="ritmo-diag-criterio">
            <strong>Criterio Cuantitativo:</strong> {{ clasificacionRitmo.criterioNumerico }}
          </p>

          <!-- Bloque del "Porqué" Fisiológico Fundamentado -->
          <div class="ritmo-porque-box">
            <div class="porque-titulo">¿Por qué se clasifica así? (Fundamento Clínico):</div>
            <p class="porque-texto">{{ clasificacionRitmo.explicacionPorque }}</p>

            <!-- Correlación dinámica con factores del paciente (RF03) -->
            <div v-if="clasificacionRitmo.correlacionFactores" class="correlacion-factores-box">
              <strong>Correlación con Factores de la Ficha:</strong>
              <p>{{ clasificacionRitmo.correlacionFactores }}</p>
            </div>

            <div class="porque-fuente">
              Fuente médica oficial: 
              <a :href="clasificacionRitmo.enlaceFuente" target="_blank" rel="noopener">
                {{ clasificacionRitmo.fuenteOficial }} ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Tarjeta de Guardado y Publicación Comunitaria Anonimizada -->
      <div class="publicacion-paso5-card card mt-4 mb-3" data-testid="publicacion-paso5-card">
        <div class="pub-header-row">
          <div>
            <h3 class="pub-title">Publicación Comunitaria y Docente (Opcional)</h3>
            <p class="pub-desc">
              Comparte este registro fisiológico para análisis didáctico en la Galería Pública Universitaria (visible con o sin sesión, siempre anonimizado).
            </p>
          </div>
          <span class="badge-anonima-pill">Anonimización Garantizada</span>
        </div>

        <div v-if="!evalPublicacionPaso5.preguntar" class="alert alert-info" style="margin: 0.75rem 0 0 0; font-size: 0.86rem;">
          {{ evalPublicacionPaso5.nota || 'La publicación no está disponible para esta sesión o medición.' }}
        </div>

        <template v-else>
          <label class="pub-checkbox-row">
            <input type="checkbox" v-model="quierePublicarPaso5" class="checkbox-custom" />
            <span><strong>Publicar esta medición en la Galería Pública UNACH</strong></span>
          </label>

          <div v-if="quierePublicarPaso5" class="anonimato-garantia-box">
            <div class="anonimato-titulo">Garantía de Anonimización Biomédica</div>
            <VistaPreviaAnonimizacion
              :registro="registroVistaPreviaPaso5"
              :nombre-privado="pacienteActivo?.nombre || currentUserName"
              :correo-privado="user?.email || ''"
              :edad-privada="pacienteActivo?.edad"
              :declaracion-id="pacienteActivo?.id"
              :titulo-personalizado="tituloPublicacionPaso5"
            />

            <div class="pub-titulo-card">
              <div class="pub-titulo-top">
                <label class="pub-titulo-label" for="titulo-pub-paso5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <span>Título descriptivo anónimo <small>(opcional)</small></span>
                </label>
                <span class="pub-titulo-counter">{{ tituloPublicacionPaso5.length }} / 80</span>
              </div>

              <div class="pub-titulo-input-wrap">
                <input
                  id="titulo-pub-paso5"
                  v-model="tituloPublicacionPaso5"
                  type="text"
                  class="pub-titulo-input"
                  maxlength="80"
                  placeholder="Ej: Medición en reposo tras taller práctico de fisiología"
                />
                <button
                  v-if="tituloPublicacionPaso5"
                  type="button"
                  class="pub-titulo-clear"
                  aria-label="Limpiar título"
                  @click="tituloPublicacionPaso5 = ''"
                >
                  ×
                </button>
              </div>

              <div class="pub-titulo-chips">
                <span class="chips-label">Sugerencias rápidas:</span>
                <button
                  type="button"
                  class="chip-sugerencia"
                  @click="tituloPublicacionPaso5 = 'Medición basal en reposo'"
                >
                  Medición basal en reposo
                </button>
                <button
                  type="button"
                  class="chip-sugerencia"
                  @click="tituloPublicacionPaso5 = 'Práctica de laboratorio UNACH'"
                >
                  Práctica de laboratorio UNACH
                </button>
                <button
                  type="button"
                  class="chip-sugerencia"
                  @click="tituloPublicacionPaso5 = 'Control fisiológico post-actividad'"
                >
                  Control fisiológico post-actividad
                </button>
              </div>
            </div>
          </div>

          <div v-if="resultadoPublicacionPaso5" class="alert mt-3" :class="resultadoPublicacionPaso5.ok ? 'alert-success' : 'alert-warning'" role="status">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
              <div>
                <strong>{{ resultadoPublicacionPaso5.titulo }}</strong>
                <span v-if="resultadoPublicacionPaso5.detalle"> {{ resultadoPublicacionPaso5.detalle }}</span>
              </div>
              <router-link
                v-if="resultadoPublicacionPaso5.ok"
                to="/comparacion?modo=publicas"
                class="btn btn-primary btn-sm"
              >
                Ver en la Galería Pública
              </router-link>
            </div>
          </div>

          <div class="pub-actions-row mt-3">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="publicandoPaso5"
              @click="guardarYPublicarPaso5(false)"
            >
              {{ publicandoPaso5 ? 'Guardando...' : 'Guardar en mi Historial Privado' }}
            </button>
            <button
              v-if="quierePublicarPaso5"
              type="button"
              class="btn btn-primary"
              data-testid="btn-abrir-vista-previa-paso5"
              :disabled="publicandoPaso5"
              @click="abrirModalConfirmacionPaso5"
            >
              {{ publicandoPaso5 ? 'Publicando...' : 'Vista Previa y Confirmar Publicación Anónima' }}
            </button>
          </div>
        </template>
      </div>

      <!-- Modal de Confirmación con Vista Previa de Anonimización antes de Confirmar Publicación -->
      <div
        v-if="modalVistaPreviaPaso5Visible"
        class="modal-anon-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-anon-paso5-titulo"
        data-testid="modal-confirmar-publicacion-paso5"
        @click.self="modalVistaPreviaPaso5Visible = false"
      >
        <div class="modal-anon-card card">
          <div class="modal-anon-header">
            <h2 id="modal-anon-paso5-titulo" class="modal-anon-title">
              Vista Previa de Anonimización antes de Confirmar Publicación
            </h2>
            <button
              type="button"
              class="modal-anon-close"
              aria-label="Cerrar vista previa"
              :disabled="publicandoPaso5"
              @click="modalVistaPreviaPaso5Visible = false"
            >
              ×
            </button>
          </div>

          <div class="modal-anon-body">
            <VistaPreviaAnonimizacion
              :registro="registroVistaPreviaPaso5"
              :nombre-privado="pacienteActivo?.nombre || currentUserName"
              :correo-privado="user?.email || ''"
              :edad-privada="pacienteActivo?.edad"
              :declaracion-id="pacienteActivo?.id"
              :titulo-personalizado="tituloPublicacionPaso5"
            />
          </div>

          <div class="modal-anon-footer">
            <button
              type="button"
              class="btn btn-secondary"
              data-testid="btn-cancelar-publicacion-paso5"
              :disabled="publicandoPaso5"
              @click="soloGuardarDesdeModalPaso5"
            >
              Cancelar / Solo guardar en privado
            </button>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="btn-confirmar-publicacion-paso5"
              :disabled="publicandoPaso5"
              @click="confirmarYPublicarDesdeModalPaso5"
            >
              {{ publicandoPaso5 ? 'Publicando...' : 'Confirmar y Publicar de Forma Anónima' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Botones de Acción Paso 5 -->
      <div class="step-nav-actions" style="margin-top: 1.5rem;">
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary" @click="pasoActual = 4">
            Volver a Medición en Vivo
          </button>
          <button type="button" class="btn btn-secondary" @click="reiniciarTodo">
            Iniciar Nueva Medición
          </button>
        </div>

        <button type="button" class="btn btn-primary btn-lg" @click="guardarInformePdf">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: text-bottom;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Guardar Informe PDF
        </button>
      </div>
    </section>
    </template>

    <!-- Modal Emergente de Consentimiento -->
    <ConsentimientoModal
      :visible="modalConsentimientoVisible"
      @aceptado="onConsentimientoAceptado"
      @rechazado="onConsentimientoRechazado"
      @cerrar="cerrarConsentimiento"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import UserIdentifier from '../components/UserIdentifier.vue'
import AvisoEducativo from '../components/AvisoEducativo.vue'
import ConsentimientoModal from '../components/ConsentimientoModal.vue'
import DatosPacienteCard from '../components/DatosPacienteCard.vue'
import FuenteMedicionSelector from '../components/FuenteMedicionSelector.vue'
import CanalesPacientesPanel from '../components/CanalesPacientesPanel.vue'
import ValorBpmCard from '../components/ValorBpmCard.vue'
import ValorSpo2Card from '../components/ValorSpo2Card.vue'
import CanalCard from '../components/CanalCard.vue'
import MultiCanalMonitor from '../components/MultiCanalMonitor.vue'
import GraficasCanalesPropios from '../components/GraficasCanalesPropios.vue'
import { canalesGraficables } from '../utils/graficasCanales.js'
import { esDocente } from '../utils/canalesMultiples.js'
import { contextoPaciente, evaluarPublicacion, rangoDeEdad, armarRegistroTerminado } from '../utils/terminarMedicion.js'
import { usePuedePublicar } from '../composables/usePuedePublicar'
import { guardarMedicion, publicarMedicion, registrarPublicacionAnonimaLocal } from '../services/medicionesService'
import VistaPreviaAnonimizacion from '../components/VistaPreviaAnonimizacion.vue'
import GuardarMedicionCard from '../components/GuardarMedicionCard.vue'
import ExplicacionResultados from '../components/ExplicacionResultados.vue'
import VinculacionCanales from '../components/VinculacionCanales.vue'
import ComparadorRangoCard from '../components/ComparadorRangoCard.vue'
import InterpretacionResultados from '../components/InterpretacionResultados.vue'
import AlertaFueraRangoBanner from '../components/AlertaFueraRangoBanner.vue'
import { useAuth } from '../composables/useAuth'
import { sesionActivaId } from '../services/sesionMedicionService'
import { evaluarComparacionRango } from '../utils/comparacionRangos.js'
import SesionMedicionControl from '../components/SesionMedicionControl.vue'
import { sesionState } from '../services/sesionMedicionService'

import { crearMonitorEstadisticasBpm } from '../services/bpmService'
import { crearMonitorEstadisticasSpo2 } from '../services/spo2Service'
import { consentimientoService, consentimientoEstado, formatearFechaHora, formatearFechaHoraCorta } from '../services/consentimientoService'
import { pacienteService, estadoGuardadoFicha } from '../services/pacienteService'
import { clasificarRitmo } from '../services/ritmoService'
import { descargarInformeClinicoPdf } from '../services/informePdfService'
import {
  esp32State,
  iniciarSondeoWiFi,
  detenerSondeoWiFi,
  fuenteElegida,
  usbState,
  desconectarUsb,
  emitirPaquetePruebaWiFi,
  toggleSimuladorWiFi,
  simuladorActivo,
  setCanalOsciloscopio
} from '../services/esp32Service'
import {
  canalesState,
  usuarioActual,
  miCanalAsignado,
  misCanales,
  requisitosCanales,
  desvincularMiCuenta,
  puedeMedirEnCanal
} from '../services/canalesService'

// ============================================================================
// 1. STEPPER Y FLUJO DEL ASISTENTE (RF13: 5 PASOS)
// ============================================================================
const { user, currentUserName, currentUserId, isAuthenticated, isProfesor, isAdmin, tienePermisoProfesor, recargarPermisosProfesor, permisosProfesorCargados, permisoConsultado } = useAuth()
const { cuenta: cuentaPublicar, cargar: cargarCondicionesPublicar } = usePuedePublicar()

const profesorSinPermisoSensor = computed(() => {
  if (!isAuthenticated.value || isAdmin.value || !isProfesor.value) return false
  if (!permisosProfesorCargados.value) return false
  if (permisoConsultado.value === false) return false
  return !tienePermisoProfesor('publicar_galeria')
})

const quierePublicarPaso5 = ref(false)
const tituloPublicacionPaso5 = ref('')
const publicandoPaso5 = ref(false)
const resultadoPublicacionPaso5 = ref(null)
const modalVistaPreviaPaso5Visible = ref(false)

const rangoEdadPaso5 = computed(() => rangoDeEdad(pacienteActivo.value?.edad))
const evalPublicacionPaso5 = computed(() => evaluarPublicacion({
  haySesion: isAuthenticated.value,
  sesionReal: isAuthenticated.value ? true : false,
  esAdmin: isAdmin.value,
  rol: isProfesor.value ? 'profesor' : 'usuario',
  permisos: { publicar_galeria: tienePermisoProfesor('publicar_galeria') },
  permisoConsultado: permisoConsultado.value,
  consentimientoVigente: true,
  fuente: 'sensor',
  pacienteConConsentimientoPropio: false
}))

const registroVistaPreviaPaso5 = computed(() => armarRegistroTerminado({
  canal: canalSeleccionado.value || 1,
  paciente: {
    nombre: pacienteActivo.value?.nombre || currentUserName.value || '',
    edad: pacienteActivo.value?.edad || null,
    actividad: pacienteActivo.value?.actividadNombre || pacienteActivo.value?.actividadPrevia || 'reposo',
    declaracionId: pacienteActivo.value?.id || null
  },
  metricas: {
    bpm: resultadosFinales.bpm,
    spo2: resultadosFinales.spo2,
    hrv: { sdnn: resultadosFinales.sdnn, rmssd: resultadosFinales.rmssd },
    ritmo: { clase: clasificacionRitmo.value?.clase || 'normal', explicacion: clasificacionRitmo.value?.explicacionPorque || '' },
    ruido: { nivel: 'buena', causas: [] }
  },
  fuente: 'sensor',
  sesionId: sesionActivaId.value
}))

function abrirModalConfirmacionPaso5() {
  modalVistaPreviaPaso5Visible.value = true
}

async function soloGuardarDesdeModalPaso5() {
  modalVistaPreviaPaso5Visible.value = false
  await guardarYPublicarPaso5(false)
}

async function confirmarYPublicarDesdeModalPaso5() {
  await guardarYPublicarPaso5(true)
  modalVistaPreviaPaso5Visible.value = false
}

async function guardarYPublicarPaso5(conPublicacion) {
  if (publicandoPaso5.value) return
  publicandoPaso5.value = true
  resultadoPublicacionPaso5.value = null
  try {
    const registro = armarRegistroTerminado({
      canal: canalSeleccionado.value || 1,
      paciente: {
        nombre: pacienteActivo.value?.nombre || '',
        edad: pacienteActivo.value?.edad || null,
        actividad: pacienteActivo.value?.actividadNombre || pacienteActivo.value?.actividadPrevia || 'reposo',
        declaracionId: pacienteActivo.value?.id || null
      },
      metricas: {
        bpm: resultadosFinales.bpm,
        spo2: resultadosFinales.spo2,
        hrv: { sdnn: resultadosFinales.sdnn, rmssd: resultadosFinales.rmssd },
        ritmo: { clase: clasificacionRitmo.value?.clase || 'normal', explicacion: clasificacionRitmo.value?.explicacionPorque || '' },
        ruido: { nivel: 'buena', causas: [] }
      },
      fuente: 'sensor',
      sesionId: sesionActivaId.value
    })
    const resG = await guardarMedicion(registro.datos)
    if (!conPublicacion) {
      resultadoPublicacionPaso5.value = {
        ok: true,
        titulo: 'Medición guardada en tu historial privado.',
        detalle: 'No fue publicada en la galería.'
      }
      return
    }
    const tituloFinal = tituloPublicacionPaso5.value.trim() || null
    let publicadaEnServidor = false
    if (resG.ok && resG.id) {
      const resP = await publicarMedicion(resG.id, tituloFinal)
      publicadaEnServidor = Boolean(resP.ok)
    }
    if (!publicadaEnServidor) {
      registrarPublicacionAnonimaLocal({
        titulo: tituloFinal,
        rangoEdad: rangoEdadPaso5.value,
        actividadNombre: pacienteActivo.value?.actividadNombre || pacienteActivo.value?.actividadPrevia || 'Reposo basal',
        bpm: resultadosFinales.bpm,
        spo2: resultadosFinales.spo2,
        calidad: 'buena',
        ritmo: clasificacionRitmo.value?.clase || 'normal',
        dentroDeRango: resultadosFinales.dentroDeRango !== false
      })
    }
    resultadoPublicacionPaso5.value = {
      ok: true,
      titulo: 'Medición guardada y publicada de forma anónima.',
      detalle: 'Ya es visible para toda la comunidad en la Galería Pública sin datos personales.'
    }
  } finally {
    publicandoPaso5.value = false
  }
}

// ============================================================================
// EVALUACIÓN REACTIVA DE RANGOS Y GESTIÓN DE ALERTAS (RF20 y RF21)
// ============================================================================
const bpmActualEnVivo = computed(() => {
  return canalActivoData.value?.bpm || monitorBpm.stats.instantBpm || 0
})

const spo2ActualEnVivo = computed(() => {
  return canalActivoData.value?.spo2 || monitorSpo2.stats.instantSpo2 || 0
})

const evaluacionRangoEnVivo = computed(() => {
  const bpm = bpmActualEnVivo.value
  const spo2 = spo2ActualEnVivo.value
  if (!bpm && !spo2) return null
  return evaluarComparacionRango({
    bpm,
    spo2: spo2 > 0 ? spo2 : null,
    edad: pacienteActivo.value?.edad || 25,
    actividad: pacienteActivo.value?.actividadNombre || pacienteActivo.value?.actividadPrevia || 'reposo'
  })
})

const alertaFueraRangoActiva = computed(() => {
  return pasoActual.value === 4 && evaluacionRangoEnVivo.value?.dentroDeRango === false
})

const alertaFueraRangoTipo = computed(() => {
  const ev = evaluacionRangoEnVivo.value
  if (!ev) return 'bpm_alto'
  if (ev.spo2 && !ev.spo2.dentro && ev.spo2.estado === 'bajo') return 'spo2_bajo'
  if (ev.bpm && !ev.bpm.dentro) {
    return ev.bpm.estado === 'alto' ? 'bpm_alto' : 'bpm_bajo'
  }
  return 'bpm_alto'
})

const alertaFueraRangoValor = computed(() => {
  const ev = evaluacionRangoEnVivo.value
  if (!ev) return null
  if (alertaFueraRangoTipo.value === 'spo2_bajo') return ev.spo2?.valor
  return ev.bpm?.valor
})

const alertaFueraRangoLimite = computed(() => {
  const ev = evaluacionRangoEnVivo.value
  if (!ev) return null
  if (alertaFueraRangoTipo.value === 'spo2_bajo') return ev.spo2?.min
  return alertaFueraRangoTipo.value === 'bpm_alto' ? ev.bpm?.max : ev.bpm?.min
})

const alertaFueraRangoDiferencia = computed(() => {
  const ev = evaluacionRangoEnVivo.value
  if (!ev) return 0
  if (alertaFueraRangoTipo.value === 'spo2_bajo') return ev.spo2?.diferencia || 0
  return ev.bpm?.diferencia || 0
})

const alertaFueraRangoDiagnostico = computed(() => {
  const ev = evaluacionRangoEnVivo.value
  if (!ev) return ''
  if (alertaFueraRangoTipo.value === 'spo2_bajo') return ev.spo2?.diagnostico || ''
  return ev.bpm?.diagnostico || ''
})

async function enviarPaquetePersonalizado(bpm, spo2) {
  if (!consentimientoEstado.value.vigente) {
    solicitarConsentimientoConAccion(() => enviarPaquetePersonalizado(bpm, spo2))
    return
  }
  enviandoManual.value = true
  try {
    const res = await emitirPaquetePruebaWiFi(tokenPrueba.value, { bpm, spo2 })
    ultimoResultadoEnvio.value = {
      ok: true,
      mensaje: `Paquete simulado emitido (Canal 1: ${bpm} BPM, ${spo2}% SpO₂)`,
      timestamp: new Date().toLocaleTimeString()
    }
  } catch (err) {
    ultimoResultadoEnvio.value = {
      ok: false,
      error: `Error al enviar paquete: ${err.message}`,
      timestamp: new Date().toLocaleTimeString()
    }
  } finally {
    enviandoManual.value = false
  }
}

const pasoActual = ref(1)
if (typeof window !== 'undefined') window.__setMedicionPaso = (n) => { pasoActual.value = n }

const pasosInfo = [
  { numero: 1, nombre: 'Consentimiento', descCorta: 'Ética y Ley 19.628' },
  { numero: 2, nombre: 'Datos Paciente', descCorta: 'Ficha y factores basales' },
  { numero: 3, nombre: 'Reposo (1 min)', descCorta: 'Estabilización AHA' },
  { numero: 4, nombre: 'Medición', descCorta: 'Toma de FC y onda en vivo' },
  { numero: 5, nombre: 'Resultados', descCorta: 'Diagnóstico y guardado' }
]

function irAPaso(num) {
  if (num < pasoActual.value) {
    pasoActual.value = num
  }
}

// ============================================================================
// 2. PASO 1: CONSENTIMIENTO INFORMADO
// ============================================================================
const consentimientoAceptadoCheck = ref(false)

const consentimientoVigente = computed(() => {
  return consentimientoEstado.value?.vigente === true
})

const puedeAvanzarPaso1 = computed(() => {
  return consentimientoVigente.value || consentimientoAceptadoCheck.value
})

async function confirmarPaso1() {
  if (!consentimientoVigente.value && consentimientoAceptadoCheck.value) {
    await consentimientoService.aceptarConsentimiento({
      origen: 'medicion_asistente_rf13',
      modalidad: 'paso_a_paso'
    })
  }
  pasoActual.value = 2
}

// ============================================================================
// 3. PASO 2: DATOS DEL PACIENTE (RF03)
// ============================================================================
const pacienteCardRef = ref(null)
const pacienteActivo = ref(null)
const errorPacientePaso2 = ref('')

function onPacienteActualizado(datos) {
  pacienteActivo.value = datos
  errorPacientePaso2.value = ''
}

// Guardado de la ficha en segundo plano: el aviso discreto sale de estadoGuardadoFicha (Guardando… / Guardada / error)
const avisoFichaVisible = ref(false)
let temporizadorAvisoFicha = null
watch(() => estadoGuardadoFicha.value.estado, (estado) => {
  clearTimeout(temporizadorAvisoFicha)
  avisoFichaVisible.value = estado === 'guardando' || estado === 'guardado' || estado === 'error'
  if (estado === 'guardado') temporizadorAvisoFicha = setTimeout(() => { avisoFichaVisible.value = false }, 2500)
})
// Cuando el servidor confirma, la ficha activa recibe el id de su fila (lo usa «Terminar» para ligar la medición)
watch(() => estadoGuardadoFicha.value.ficha, (f) => {
  if (f?.id && pacienteActivo.value && !pacienteActivo.value.id) {
    pacienteActivo.value = { ...pacienteActivo.value, id: f.id, creadoEn: f.creadoEn, origen: f.origen, pendienteSync: Boolean(f.pendienteSync) }
  }
})
function reintentarGuardadoFicha() {
  pacienteService.reintentarSincronizacion()
}

async function confirmarPaso2() {
  errorPacientePaso2.value = ''

  // 1. Si la tarjeta está en modo edición, le ordenamos guardar los datos ingresados. La tarjeta valida y guarda la copia
  //    de la pestaña al instante y envía al servidor en segundo plano: aquí NO se espera a la red (la interfaz no se congela).
  //    Si el usuario no cambió nada, no se vuelve a guardar.
  if (pacienteCardRef.value?.modoEdicion) {
    const guardadoExitoso = await pacienteCardRef.value.guardar()
    if (!guardadoExitoso) {
      return // Si faltó la edad o el estrés, la tarjeta mostrará los mensajes en rojo y no avanza
    }
  }

  // 2. Obtenemos los datos confirmados
  const datos = pacienteActivo.value || pacienteService.obtenerUltimaDeclaracion()

  if (!datos || !datos.nombre || datos.nombre.trim().length < 2) {
    errorPacientePaso2.value = 'Por favor ingresa y guarda el nombre del paciente en la ficha.'
    return
  }
  const edadNum = Number(datos.edad)
  if (!edadNum || edadNum < 18 || edadNum > 120) {
    errorPacientePaso2.value = 'La persona debe ser mayor de edad (18 años o más): revisa la fecha de nacimiento.'
    return
  }
  if (!datos.nivelEstres) {
    errorPacientePaso2.value = 'Por favor selecciona el nivel de estrés basal del participante.'
    return
  }

  pacienteActivo.value = datos
  pasoActual.value = 3 // Avanza al reposo de 1 minuto
}

// ============================================================================
// 4. PASO 3: REPOSO DE 1 MINUTO (60 SEGUNDOS)
// ============================================================================
const SEGUNDOS_REPOSO_TOTAL = 60
const segundosRestantesReposo = ref(SEGUNDOS_REPOSO_TOTAL)
const reposoEnCurso = ref(false)
const reposoCompletado = ref(false)
let timerReposoInterval = null

const circunferenciaTimer = 2 * Math.PI * 54
const offsetTimer = computed(() => {
  const fraccion = (SEGUNDOS_REPOSO_TOTAL - segundosRestantesReposo.value) / SEGUNDOS_REPOSO_TOTAL
  return circunferenciaTimer * (1 - fraccion)
})

const tiempoFormateado = computed(() => {
  const m = Math.floor(segundosRestantesReposo.value / 60)
  const s = segundosRestantesReposo.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function iniciarReposo() {
  reposoEnCurso.value = true
  if (timerReposoInterval) clearInterval(timerReposoInterval)

  timerReposoInterval = setInterval(() => {
    if (segundosRestantesReposo.value > 0) {
      segundosRestantesReposo.value--
    } else {
      clearInterval(timerReposoInterval)
      timerReposoInterval = null
      reposoEnCurso.value = false
      reposoCompletado.value = true
    }
  }, 1000)
}

function pausarReposo() {
  reposoEnCurso.value = false
  if (timerReposoInterval) {
    clearInterval(timerReposoInterval)
    timerReposoInterval = null
  }
}

function reiniciarReposo() {
  pausarReposo()
  segundosRestantesReposo.value = SEGUNDOS_REPOSO_TOTAL
  reposoCompletado.value = false
}

function omitirReposoLaboratorio() {
  pausarReposo()
  segundosRestantesReposo.value = 0
  reposoCompletado.value = true
}

function confirmarPaso3() {
  if (!reposoCompletado.value) return
  pasoActual.value = 4
}

// ============================================================================
// 5. PASO 4: MEDICIÓN DE LA FC (TODO LO QUE ES MEDICIÓN)
// ============================================================================
const modalConsentimientoVisible = ref(false)
const accionPendienteConsentimiento = ref(null)
const mensajeAlertaConsentimiento = ref('')

function solicitarConsentimientoConAccion(accion) {
  mensajeAlertaConsentimiento.value = ''
  accionPendienteConsentimiento.value = typeof accion === 'function' ? accion : null
  modalConsentimientoVisible.value = true
}

function cerrarConsentimiento() {
  modalConsentimientoVisible.value = false
  accionPendienteConsentimiento.value = null
}

function onConsentimientoRechazado() {
  cerrarConsentimiento()
}

function onConsentimientoAceptado() {
  modalConsentimientoVisible.value = false
  if (accionPendienteConsentimiento.value) {
    const fn = accionPendienteConsentimiento.value
    accionPendienteConsentimiento.value = null
    fn()
  }
}

const monitorBpm = crearMonitorEstadisticasBpm()
const monitorSpo2 = crearMonitorEstadisticasSpo2()

const canalSeleccionado = ref(1)
const tabActiva = ref('simulador')
const tokenPrueba = ref('esp_demotoken_unach_2026_rf05')
const enviandoManual = ref(false)
const ultimoResultadoEnvio = ref(null)

// Solo datos reales del ESP32: sin sensor no se inventan canales ni valores
const canalesMostradosTodos = computed(() => esp32State.canales || [])

// ¿El sensor está enviando datos? (conectado por WiFi y con canales recibidos)
const sensorDetectado = computed(() => Boolean(esp32State.conectado) && (esp32State.canales || []).length > 0)

// Profesor/admin: solo los canales tomados; un canal libre no muestra nada
const canalesMostrados = computed(() => {
  if (!esDocente(usuarioActual.rol)) return canalesMostradosTodos.value
  const tomados = new Set(canalesState.canales.filter(c => c.usuario_id).map(c => c.canal))
  return canalesMostradosTodos.value.filter(c => tomados.has(c.canal))
})

const canalActivoData = computed(() => {
  return canalesMostrados.value.find(c => c.canal === canalSeleccionado.value)
})

// RF111: un canal adicional (profesor/admin) no mide sin ficha + términos + consentimiento de su persona
// Profesor/admin sin ningún canal: primero deben usar «Agregar canal» (ficha, términos y consentimiento)
const docenteSinCanal = computed(() => esDocente(usuarioActual.rol) && misCanales.value.length === 0)
const canalSeleccionadoListo = computed(() => !docenteSinCanal.value && puedeMedirEnCanal(canalSeleccionado.value))
// Se muestran gráficas y valores solo con el canal habilitado Y el sensor detectado
// Docente/administrador: ven su propio flujo (fuente → pacientes y canales → gráficas)
const esDocenteVista = computed(() => esDocente(usuarioActual.rol))
const fuenteActual = computed(() => esp32State.fuente)
// ¿La fuente elegida está conectada? WiFi: el ESP32 envía datos; USB: el puerto está abierto
const fuenteConectada = computed(() =>
  fuenteActual.value === 'wifi' ? Boolean(esp32State.conectado)
    : fuenteActual.value === 'usb' ? Boolean(usbState.conectado)
      : false
)
// La gráfica aparece apenas hay un canal listo y el sensor envía datos (WiFi o USB)
const medicionActiva = computed(() => canalSeleccionadoListo.value && sensorDetectado.value)

// Al agregar un paciente se muestra su gráfica de inmediato y la pantalla se mueve para dejarla en el centro
const zonaGraficas = ref(null)
function centrarGraficas() {
  nextTick(() => {
    setTimeout(() => {
      const zona = zonaGraficas.value
      const tarjetas = zona ? zona.querySelectorAll('[data-testid="grafica-canal"]') : []
      const destino = tarjetas.length ? tarjetas[tarjetas.length - 1]
        : (zona?.firstElementChild || document.querySelector('[data-testid="sensor-no-detectado"]'))
      if (!destino?.scrollIntoView) return
      const reducir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      destino.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'center' })
    }, 150)
  })
}
function alAgregarCanal(canal) {
  seleccionarCanal(canal)
  centrarGraficas()
}
async function quitarCanal(canal) {
  try { await desvincularMiCuenta(canal) } catch { /* el panel de canales ya informa los errores */ }
}

// RF10 / RF11: la comunicación se «perdió» si estaba conectada, había pacientes midiendo y dejó de estarlo
const perdioConexion = ref(false)
watch(fuenteConectada, (ahora, antes) => {
  if (ahora) perdioConexion.value = false
  else if (antes && esDocenteVista.value && misCanales.value.length > 0) perdioConexion.value = true
})
watch(fuenteActual, () => { perdioConexion.value = false }) // al cambiar de WiFi a USB no hay nada «perdido»

// Si el canal en pantalla no es de este docente, se pasa a su primer canal habilitado
watch(() => misCanales.value.map(c => c.canal).join(','), () => {
  if (!esDocenteVista.value || !misCanales.value.length) return
  if (!misCanales.value.some(c => c.canal === canalSeleccionado.value)) seleccionarCanal(misCanales.value[0].canal)
})

// RF111: canales míos ya listos para medir (el primero solo muestra el osciloscopio; desde el segundo, vista elegible)
const graficablesPropios = computed(() =>
  canalesGraficables(misCanales.value, canalesMostrados.value, c => requisitosCanales[c]?.ficha?.nombre)
)

// «Terminar»: datos del paciente DE ESE CANAL (su ficha, no la de la cuenta) para guardar la medición
function pacienteDeCanal(canal) {
  const req = requisitosCanales[canal]
  return contextoPaciente({
    fichaCanal: req?.ficha || null,
    fichaCuenta: pacienteActivo.value,
    declaracionIdCanal: req?.declaracionId || null,
    nombreCuenta: usuarioActual.nombre
  })
}

function obtenerNombreAsignado(canalNum) {
  const ch = canalesState.canales.find(c => c.canal === canalNum)
  if (!ch || !ch.usuario_id) return null
  return ch.usuario_nombre || ch.usuario_email || 'Estudiante asignado'
}

function seleccionarCanal(canal) {
  canalSeleccionado.value = canal
  setCanalOsciloscopio(canal)
  const ch = canalesMostrados.value.find(c => c.canal === canal)
  if (ch && puedeMedirEnCanal(canal)) {
    if (ch.bpm) monitorBpm.registrarLectura(ch.bpm, pacienteActivo.value?.edad, pacienteActivo.value?.actividadPrevia)
    if (ch.spo2) monitorSpo2.registrarLectura(ch.spo2)
  }
}

watch(() => canalActivoData.value?.bpm, (nuevoBpm) => {
  if (nuevoBpm && canalSeleccionadoListo.value) {
    monitorBpm.registrarLectura(nuevoBpm, pacienteActivo.value?.edad, pacienteActivo.value?.actividadPrevia)
  }
}, { immediate: true })

watch(() => canalActivoData.value?.spo2, (nuevoSpo2) => {
  if (nuevoSpo2 && canalSeleccionadoListo.value) {
    monitorSpo2.registrarLectura(nuevoSpo2)
  }
}, { immediate: true })

watch(miCanalAsignado, (nuevoCanal) => {
  if (nuevoCanal) {
    seleccionarCanal(nuevoCanal)
  }
})

function toggleSimulador() {
  if (!consentimientoEstado.value.vigente) {
    solicitarConsentimientoConAccion(() => toggleSimulador())
    return
  }
  toggleSimuladorWiFi(tokenPrueba.value)
}

async function enviarUnicoPaquete() {
  enviandoManual.value = true
  try {
    const res = await emitirPaquetePruebaWiFi(tokenPrueba.value)
    ultimoResultadoEnvio.value = {
      ok: true,
      mensaje: `Paquete #${res.paquete} recibido exitosamente vía WiFi (${res.canales_recibidos} canales procesados)`,
      timestamp: new Date().toLocaleTimeString()
    }
  } catch (err) {
    ultimoResultadoEnvio.value = {
      ok: false,
      error: `Error al enviar paquete: ${err.message}`,
      timestamp: new Date().toLocaleTimeString()
    }
  } finally {
    enviandoManual.value = false
  }
}

// ============================================================================
// 6. PASO 5: RESULTADOS Y DIAGNÓSTICO CLÍNICO (RF18)
// ============================================================================
const resultadosFinales = reactive({
  bpm: 72,
  spo2: 98,
  sdnn: 38,
  rmssd: 32
})

const clasificacionRitmo = ref(null)

function finalizarMedicionYVerResultados() {
  const bpmMedio = monitorBpm.stats.averageBpm || canalActivoData.value?.bpm || resultadosFinales.bpm || 74
  const spo2Medio = monitorSpo2.stats.averageSpo2 || canalActivoData.value?.spo2 || resultadosFinales.spo2 || 98

  resultadosFinales.bpm = Math.round(bpmMedio)
  resultadosFinales.spo2 = Math.round(spo2Medio)
  // HRV real calculado de los latidos medidos en vivo (respaldo 38 y 32 solo si no hubo sensor conectado)
  resultadosFinales.sdnn = monitorBpm.stats.sdnn > 0 ? monitorBpm.stats.sdnn : 38
  resultadosFinales.rmssd = monitorBpm.stats.rmssd > 0 ? monitorBpm.stats.rmssd : 32

  // Calcular comparación con rango fisiológico (RF20)
  const evalRangoFinal = evaluarComparacionRango({
    bpm: resultadosFinales.bpm,
    spo2: resultadosFinales.spo2,
    edad: pacienteActivo.value?.edad || 25,
    actividad: pacienteActivo.value?.actividadNombre || pacienteActivo.value?.actividadPrevia || 'reposo'
  })
  resultadosFinales.dentroDeRango = evalRangoFinal.dentroDeRango

  // Calcular clasificación clínica RF18
  clasificacionRitmo.value = clasificarRitmo({
    bpm: resultadosFinales.bpm,
    instantBpm: monitorBpm.stats.instantBpm || resultadosFinales.bpm,
    sdnn: resultadosFinales.sdnn,
    rmssd: resultadosFinales.rmssd,
    lastIntervalMs: Math.round(60000 / resultadosFinales.bpm),
    regularityLevel: monitorBpm.stats.estabilidadNivel === 'inestable' ? 'irregular' : 'normal',
    totalBeats: Math.max(5, monitorBpm.stats.totalLecturas),
    paciente: pacienteActivo.value
  })

  pasoActual.value = 5
  if (typeof window !== 'undefined' && window.scrollTo) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function guardarInformePdf() {
  const evalComp = evaluarComparacionRango({
    bpm: resultadosFinales.bpm,
    spo2: resultadosFinales.spo2,
    edad: pacienteActivo.value?.edad || 25,
    actividad: pacienteActivo.value?.actividadNombre || pacienteActivo.value?.actividadPrevia || 'reposo'
  })

  descargarInformeClinicoPdf({
    comparacion: evalComp,
    paciente: pacienteActivo.value,
    sesion: sesionState.sesionActiva,
    resultados: {
      bpm: resultadosFinales.bpm,
      spo2: resultadosFinales.spo2,
      estabilidad: monitorBpm.stats.estabilidadNivel || 'normal',
      pi: monitorSpo2.stats.indicePerfusion ? monitorSpo2.stats.indicePerfusion.toFixed(1) : '3.2'
    },
    clasificacion: clasificacionRitmo.value || {}
  })
}

function reiniciarTodo() {
  reiniciarReposo()
  pasoActual.value = 1
}

onMounted(async () => {
  if (isProfesor.value && !isAdmin.value) {
    await recargarPermisosProfesor().catch(() => {})
  }
  await cargarCondicionesPublicar().catch(() => {})
  await consentimientoService.verificarConsentimientoVigente()
  if (consentimientoEstado.value.vigente) {
    consentimientoAceptadoCheck.value = true
  }

  const dec = pacienteService.obtenerUltimaDeclaracion()
  if (dec) {
    pacienteActivo.value = dec
  }
  // Tras volver a iniciar sesión la copia de la pestaña está vacía: se carga la ficha guardada en segundo plano (sin esperar)
  // y ya queda descifrada en memoria cuando se llegue al paso 2.
  pacienteService.obtenerDeclaracionActiva().then((activo) => {
    if (activo && !activo.incompleta && !pacienteActivo.value) pacienteActivo.value = activo
  }).catch(() => { /* la tarjeta de la ficha muestra el motivo si no se pudo leer */ })

  iniciarSondeoWiFi(1000)
  if (miCanalAsignado.value) {
    seleccionarCanal(miCanalAsignado.value)
  }
})

onBeforeUnmount(() => {
  detenerSondeoWiFi()
  desconectarUsb()
  pausarReposo()
})
</script>

<style scoped>
.ficha-toast {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.8rem;
  border-radius: 0.5rem;
  background: #0f172a;
  color: #f8fafc;
  font-size: 0.82rem;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
.ficha-toast-error { background: #92400e; }
.ficha-toast-btn {
  background: transparent;
  color: inherit;
  border: 1px solid currentColor;
  border-radius: 0.3rem;
  padding: 0.1rem 0.5rem;
  cursor: pointer;
}

.medicion-view {
  padding-bottom: 2rem;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.view-title {
  font-size: 1.85rem;
  font-weight: 800;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.view-subtitle {
  color: var(--color-muted);
  font-size: 0.95rem;
  max-width: 780px;
}

.header-modo-tag {
  background: #f1f5f9;
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.9rem;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

/* Stepper de 5 Pasos Clínicos */
.stepper-nav {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0.75rem;
  margin-bottom: 1.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.stepper-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
  min-width: 140px;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s ease;
}

.stepper-item.activo {
  background: #eff6ff;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.stepper-item.completado {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.stepper-item.bloqueado {
  opacity: 0.65;
  cursor: not-allowed;
}

.stepper-circulo {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #cbd5e1;
  color: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.stepper-item.activo .stepper-circulo {
  background: var(--color-primary);
  color: #ffffff;
}

.stepper-item.completado .stepper-circulo {
  background: #166534;
  color: #ffffff;
}

.stepper-etiquetas {
  display: flex;
  flex-direction: column;
}

.stepper-nombre {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
}

.stepper-desc {
  font-size: 0.72rem;
  color: var(--color-muted);
}

/* Tarjeta contenedora de Paso */
.wizard-step-card {
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.step-intro {
  margin-bottom: 1.25rem;
}

.step-intro-medicion {
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
  border: 1px solid #bbf7d0;
  border-radius: 8px;
}

.step-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  background: #e0f2fe;
  color: #0369a1;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  margin-bottom: 0.35rem;
}

.step-heading {
  font-size: 1.3rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.35rem;
}

.step-desc {
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.5;
}

/* Pilares RF76 */
.pilares-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  margin: 1.25rem 0;
}

.pilar-card {
  display: flex;
  gap: 0.75rem;
  padding: 0.85rem;
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.pilar-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
}

.pilar-content h4 {
  font-size: 0.88rem;
  color: #1e3a8a;
  margin-bottom: 0.25rem;
  font-weight: 700;
}

.pilar-content p {
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.4;
  margin: 0;
}

.consentimiento-check-box {
  background: #fffbeb;
  border: 1px solid #fde68a;
  padding: 1rem;
  border-radius: 6px;
  margin: 1.25rem 0;
}

.consentimiento-check-label {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: #92400e;
  cursor: pointer;
  line-height: 1.45;
}

.checkbox-custom {
  margin-top: 3px;
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

/* Reposo de 1 Minuto */
.reposo-timer-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.5rem;
  margin: 1rem 0;
}

.timer-display-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2.5rem;
  flex-wrap: wrap;
  padding: 1rem 0;
}

.timer-circulo-wrapper {
  position: relative;
  width: 140px;
  height: 140px;
}

.timer-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.timer-bg-circle {
  fill: none;
  stroke: #e2e8f0;
  stroke-width: 8;
}

.timer-progress-circle {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.8s linear;
}

.timer-center-text {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.timer-numeros {
  font-size: 1.8rem;
  font-weight: 800;
  font-family: monospace;
  color: var(--color-primary);
}

.timer-label {
  font-size: 0.72rem;
  color: var(--color-muted);
  text-transform: uppercase;
  font-weight: 600;
}

.respiracion-guia {
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: 380px;
}

.pulmon-animado {
  font-size: 3rem;
  transition: transform 3s ease-in-out;
}

.anim-inhalar {
  animation: respirarCiclo 6s infinite ease-in-out;
}

@keyframes respirarCiclo {
  0% { transform: scale(1); }
  50% { transform: scale(1.35); }
  100% { transform: scale(1); }
}

.respiracion-texto strong {
  display: block;
  font-size: 0.95rem;
  color: #0f172a;
  margin-bottom: 0.25rem;
}

.respiracion-texto p {
  font-size: 0.82rem;
  color: #64748b;
  margin: 0;
}

.instrucciones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.85rem;
  margin: 1.25rem 0;
}

.inst-item {
  display: flex;
  gap: 0.6rem;
  background: #ffffff;
  border: 1px solid var(--color-border);
  padding: 0.75rem;
  border-radius: 6px;
}

.inst-icon {
  font-size: 1.4rem;
}

.inst-item strong {
  font-size: 0.85rem;
  color: #1e3a8a;
  display: block;
}

.inst-item p {
  font-size: 0.78rem;
  color: #64748b;
  margin: 0.2rem 0 0 0;
}

.timer-controles {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.btn-omitir {
  font-size: 0.78rem;
  opacity: 0.8;
}

/* Paso 5: Resultados */
.resultado-paciente-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  padding: 0.85rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.res-pac-header {
  font-size: 0.95rem;
  color: #0f172a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.res-pac-tags {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.tag-item {
  font-size: 0.78rem;
  background: #e2e8f0;
  padding: 2px 8px;
  border-radius: 4px;
  color: #334155;
}

.valores-consolidados-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

.resultados-analisis-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
  align-items: stretch;
}

@media (max-width: 900px) {
  .resultados-analisis-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}

.valor-box {
  background: #ffffff;
  border: 1px solid var(--color-border);
  padding: 0.85rem;
  border-radius: 6px;
  text-align: center;
}

.valor-titulo {
  font-size: 0.75rem;
  color: var(--color-muted);
  text-transform: uppercase;
  font-weight: 600;
}

.valor-num {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0.2rem 0;
}

.valor-num small {
  font-size: 0.85rem;
  color: #64748b;
}

.valor-sub {
  font-size: 0.72rem;
  color: #94a3b8;
}

.color-spo2 { color: #0284c7; }
.color-pi { color: #0d9488; }

/* Tarjeta RF18 AHA */
.ritmo-diagnostico-card {
  border: 1.5px solid;
  padding: 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.25rem;
}

.ritmo-diag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.punto-ritmo {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.ritmo-diag-criterio {
  font-size: 0.88rem;
  color: #334155;
  margin-bottom: 0.75rem;
  line-height: 1.45;
}

.ritmo-porque-box {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  padding: 0.85rem 1rem;
  border-radius: 6px;
}

.porque-titulo {
  font-size: 0.85rem;
  font-weight: 700;
  color: #1e3a8a;
  margin-bottom: 0.35rem;
}

.porque-texto {
  font-size: 0.85rem;
  color: #334155;
  line-height: 1.45;
  margin: 0 0 0.5rem 0;
}

.correlacion-factores-box {
  background: #f8fafc;
  border-left: 3px solid #0284c7;
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  color: #0369a1;
  border-radius: 0 4px 4px 0;
  margin: 0.5rem 0;
}

.correlacion-factores-box p {
  margin: 0.2rem 0 0 0;
}

.porque-fuente {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.5rem;
}

.porque-fuente a {
  color: #0284c7;
  text-decoration: none;
}

.porque-fuente a:hover {
  text-decoration: underline;
}

.auditoria-inmutable-card {
  background: #f1f5f9;
  border: 1px dashed #94a3b8;
  padding: 0.65rem 0.85rem;
  border-radius: 6px;
  font-size: 0.82rem;
  color: #475569;
}

.audit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Botones de Navegación */
.step-nav-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 1.25rem;
  border-top: 1px solid var(--color-border);
  margin-top: 1.25rem;
}

/* Estilos de la Vista de Medición Original */
.paciente-vinculado-banner {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.punto-verde {
  color: #16a34a;
  font-size: 0.9rem;
}

.biomarcadores-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}

.pac-consent-pill.pill-sin { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
.btn-enlace-docente { background: none; border: 0; padding: 0 0 0 0.4rem; color: var(--color-primary); text-decoration: underline; cursor: pointer; font-size: 0.78rem; }
.aviso-aprendizaje { margin-bottom: 1rem; }
.detalle-canal { margin: 1rem 0; }
.detalle-canal > summary { cursor: pointer; font-weight: 600; color: var(--color-muted); padding: 0.5rem 0; }
.herramientas-prueba { margin: 1rem 0; }
.herramientas-prueba > summary { cursor: pointer; font-weight: 600; color: var(--color-muted); padding: 0.5rem 0; }
.test-panel {
  margin-bottom: 1.5rem;
  padding: 1.25rem;
}

.test-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.5rem;
}

.tab-btn {
  background: none;
  border: none;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-weight: 600;
  color: var(--color-muted);
  border-radius: 4px;
}

.tab-btn.active {
  background: #eff6ff;
  color: var(--color-primary);
}

.form-row {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.flex-1 { flex: 1; }

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.firmware-code-box pre {
  background: #0f172a;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
  overflow-x: auto;
}

.api-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.api-table th, .api-table td {
  border: 1px solid var(--color-border);
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.api-table th {
  background: #f8fafc;
  font-weight: 700;
  width: 25%;
}

.anim-fade {
  animation: fadeIn 0.25s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 640px) {
  .stepper-desc { display: none; }
  .biomarcadores-grid { grid-template-columns: 1fr; }
  .step-nav-actions { flex-direction: column-reverse; }
  .step-nav-actions button { width: 100%; }
}

/* ========================================================================= */
/* PASO 3: REPOSO CARDIOVASCULAR COMPLETAMENTE CENTRADO                      */
/* ========================================================================= */
.reposo-timer-card {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 2.25rem 1.5rem;
  margin: 1.25rem 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
}

.reposo-timer-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.timer-circulo-wrapper {
  position: relative;
  width: 150px;
  height: 150px;
  margin: 0 auto 1.25rem auto !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timer-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.timer-bg-circle {
  fill: none;
  stroke: #e2e8f0;
  stroke-width: 8;
}

.timer-progress-circle {
  fill: none;
  stroke: #0284c7;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.8s ease;
}

.timer-center-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
}

.timer-numeros {
  font-size: 2.3rem;
  font-weight: 800;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #0f172a;
  line-height: 1;
}

.timer-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-top: 0.35rem;
}

.respiracion-guia-centrada {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin: 0 auto 1.5rem auto;
  max-width: 520px;
  width: 100%;
}

.pulmon-pulso-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  color: #0284c7;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 0.75rem auto;
  transition: transform 0.4s ease, box-shadow 0.4s ease;
}

.pulmon-pulso-icon.anim-pulsar {
  animation: pulsarRespira 4s infinite ease-in-out;
  box-shadow: 0 0 0 12px rgba(2, 132, 199, 0.15);
}

@keyframes pulsarRespira {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.35); }
  50% { transform: scale(1.22); box-shadow: 0 0 0 14px rgba(2, 132, 199, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(2, 132, 199, 0); }
}

.respiracion-texto-centrado {
  text-align: center;
}

.respiracion-texto-centrado strong {
  font-size: 1.05rem;
  display: block;
  margin-bottom: 0.25rem;
  color: #0f172a;
}

.respiracion-texto-centrado p {
  font-size: 0.85rem;
  color: #64748b;
  margin: 0;
}

.color-exito {
  color: #16a34a !important;
}

.color-progreso {
  color: #0284c7 !important;
}

.timer-controles {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0 auto 1.5rem auto;
}

.instrucciones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.85rem;
  width: 100%;
  margin-top: 1rem;
  border-top: 1px solid #f1f5f9;
  padding-top: 1.25rem;
  text-align: left;
}

.inst-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.75rem 0.9rem;
  border-radius: 8px;
}

.inst-icon-svg {
  color: #0284c7;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  background: #ffffff;
  border: 1px solid #e0f2fe;
  border-radius: 8px;
  flex-shrink: 0;
}

.inst-item strong {
  font-size: 0.84rem;
  color: #0f172a;
  display: block;
}

.inst-item p {
  font-size: 0.76rem;
  color: #64748b;
  margin: 0.15rem 0 0 0;
}

/* ========================================================================= */
/* PASO 4: BANNER CLÍNICO DEL PACIENTE                                       */
/* ========================================================================= */
.paciente-clinico-banner {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-left: 4px solid #10b981;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.pac-banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}

.pac-avatar-badge {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #ecfdf5;
  color: #059669;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pac-title-block {
  flex: 1;
  min-width: 180px;
}

.pac-nombre-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.pac-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
  display: inline-block;
}

.pac-nombre {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
}

.pac-edad-chip {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.pac-sub {
  font-size: 0.78rem;
  color: #64748b;
  display: block;
  margin-top: 2px;
}

.pac-consent-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.pac-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.pac-tag-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.8rem;
}

.pac-tag-label {
  color: #64748b;
  font-size: 0.75rem;
}

.pac-tag-val {
  color: #1e293b;
  text-transform: capitalize;
}

@media print {
  body * {
    visibility: hidden;
  }
  #informe-clinico-imprimible, #informe-clinico-imprimible * {
    visibility: visible;
  }
  #informe-clinico-imprimible {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
.explicacion-obtencion {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}
.explicacion-obtencion > summary {
  cursor: pointer;
  font-weight: 600;
  min-height: var(--alto-tactil);
  display: flex;
  align-items: center;
}
.explicacion-obtencion[open] > summary { margin-bottom: 0.75rem; }

/* Tarjetas de Resguardo de Sesión y Permiso Docente */
.guard-access-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.35rem 1.5rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
}
.guard-warning {
  background: #fffbeb;
  border-color: #fde68a;
}
.guard-info {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.guard-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.guard-icon-warn {
  background: #fef3c7;
  color: #b45309;
}
.guard-icon-info {
  background: #dbeafe;
  color: #1d4ed8;
}
.guard-content {
  flex: 1;
}
.guard-title {
  margin: 0 0 0.4rem 0;
  font-size: 1.12rem;
  font-weight: 700;
  color: #0f172a;
}
.guard-desc {
  margin: 0 0 0.5rem 0;
  font-size: 0.92rem;
  color: #334155;
  line-height: 1.5;
}
.guard-subdesc {
  margin: 0 0 0.9rem 0;
  font-size: 0.84rem;
  color: #475569;
}
.guard-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.85rem;
}

/* Publicación Anonimizada en Paso 5 */
.publicacion-paso5-card {
  padding: 1.25rem 1.4rem;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
}
.pub-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.pub-title {
  margin: 0 0 0.25rem 0;
  font-size: 1.08rem;
  font-weight: 700;
  color: #0f172a;
}
.pub-desc {
  margin: 0;
  font-size: 0.86rem;
  color: #475569;
}
.badge-anonima-pill {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
}
.pub-checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1rem;
  font-size: 0.94rem;
  cursor: pointer;
}
.anonimato-garantia-box {
  margin-top: 0.85rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem 1.15rem;
}
.anonimato-titulo {
  font-weight: 700;
  font-size: 0.92rem;
  color: #0369a1;
  margin-bottom: 0.35rem;
}
.anonimato-intro {
  font-size: 0.84rem;
  color: #475569;
  margin: 0 0 0.75rem 0;
}
.anonimato-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.85rem;
}
.anonimato-col {
  padding: 0.75rem 0.9rem;
  border-radius: 6px;
  font-size: 0.82rem;
}
.col-si {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}
.col-no {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}
.anonimato-col ul {
  margin: 0.4rem 0 0 1.1rem;
  padding: 0;
}
.anonimato-col li {
  margin-bottom: 0.2rem;
}
.pub-titulo-card {
  margin-top: 1rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.65rem;
  padding: 0.95rem 1.1rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}
.pub-titulo-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.pub-titulo-label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: #1e293b;
  cursor: pointer;
}
.pub-titulo-label svg {
  color: #2563eb;
}
.pub-titulo-label small {
  font-weight: 500;
  color: #64748b;
}
.pub-titulo-counter {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
}
.pub-titulo-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.pub-titulo-input {
  width: 100%;
  padding: 0.65rem 2.25rem 0.65rem 0.9rem;
  font-size: 0.9rem;
  color: #0f172a;
  background: #f8fafc;
  border: 1.5px solid #cbd5e1;
  border-radius: 0.5rem;
  transition: all 0.18s ease;
  outline: none;
}
.pub-titulo-input::placeholder {
  color: #94a3b8;
}
.pub-titulo-input:focus {
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}
.pub-titulo-clear {
  position: absolute;
  right: 0.55rem;
  background: #e2e8f0;
  border: none;
  color: #475569;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 999px;
  font-size: 1rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.pub-titulo-clear:hover {
  background: #cbd5e1;
  color: #0f172a;
}
.pub-titulo-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.chips-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: #64748b;
  margin-right: 0.15rem;
}
.chip-sugerencia {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.22rem 0.65rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.chip-sugerencia:hover {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
}
.pub-actions-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.modal-anon-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}
.modal-anon-card {
  width: 100%;
  max-width: 900px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #cbd5e1;
  padding: 0;
}
.modal-anon-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.15rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.modal-anon-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
}
.modal-anon-close {
  background: transparent;
  border: none;
  font-size: 1.4rem;
  color: #64748b;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  line-height: 1;
}
.modal-anon-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  flex: 1;
}
.modal-anon-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-wrap: wrap;
}
</style>