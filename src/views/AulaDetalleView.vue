<template>
  <div class="aula-detalle-container">
    <!-- Estado de carga inicial -->
    <div v-if="cargando" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando información del aula...</p>
    </div>

    <!-- Error de permisos / Acceso no autorizado (Criterio RF103) -->
    <div v-else-if="errorAcceso" class="access-denied-card card">
      <div class="access-denied-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>
      <h2 class="access-denied-title">Acceso Restringido</h2>
      <p class="access-denied-desc">{{ errorAcceso }}</p>
      <div class="access-denied-actions">
        <router-link to="/aulas" class="btn btn-primary">
          ← Volver a Mis Aulas
        </router-link>
      </div>
    </div>

    <!-- Contenido del Aula si está autorizado -->
    <div v-else-if="aula" class="aula-content">
      <!-- RF94: los promedios de BPM y SpO₂ son material educativo, no un diagnóstico -->
      <AvisoEducativo compacto />
      <!-- Barra superior / Breadcrumb -->
      <div class="top-nav-bar">
        <router-link to="/aulas" class="back-link">
          ← Volver al listado de Aulas
        </router-link>
      </div>

      <!-- Cabecera del Aula -->
      <div class="aula-hero card mb-4">
        <div class="hero-header">
          <div>
            <div class="title-with-badge">
              <h1 class="aula-hero-title">{{ aula.nombre }}</h1>
              <span class="badge" :class="aula.codigo_activo ? 'badge-profesor' : 'badge-desactivado'">
                {{ aula.codigo_activo ? '● Código Activo' : '○ Código Desactivado' }}
              </span>
            </div>
            <p class="aula-hero-desc">{{ aula.descripcion || 'Sin descripción adicional para este espacio académico.' }}</p>
            <div class="aula-hero-meta">
              <span>Docente: <strong>{{ aula.profesor_nombre || 'Docente Titular' }}</strong></span>
              <span class="meta-separator">•</span>
              <span>Capacidad: <strong>{{ aula.max_estudiantes || 100 }} estudiantes</strong></span>
            </div>
          </div>

          <!-- Caja del Código de Acceso RF100 -->
          <div class="codigo-hero-card">
            <span class="codigo-hero-label">Código de Aula:</span>
            <div class="codigo-hero-display">
              <code :class="{ 'codigo-tachado': !aula.codigo_activo }">{{ aula.codigo }}</code>
              <button @click="copiarCodigo(aula.codigo)" class="btn-copy" title="Copiar código al portapapeles">
                {{ copiado ? 'Copiado' : 'Copiar' }}
              </button>
            </div>
            <div class="codigo-hero-actions">
              <button 
                @click="alternarEstadoCodigo" 
                class="btn-code-action"
                :class="aula.codigo_activo ? 'btn-warn-action' : 'btn-success-action'"
              >
                {{ aula.codigo_activo ? 'Desactivar' : 'Activar' }}
              </button>
              <button 
                @click="confirmarRegenerarCodigo" 
                class="btn-code-action"
                title="Generar un nuevo código para esta aula"
              >
                Regenerar
              </button>
              <button 
                @click="abrirModalInvitar" 
                class="btn-code-action btn-invite"
              >
                Invitar
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Alertas de retroalimentación -->
      <div v-if="feedbackMensaje" class="alert mb-4" :class="feedbackExito ? 'alert-success' : 'alert-error'">
        {{ feedbackMensaje }}
      </div>

      <!-- BARRA DE PESTAÑAS (RF103: Estudiantes, Cursos y Evaluaciones) -->
      <div class="tabs-nav mb-4">
        <button 
          @click="tabActiva = 'estudiantes'" 
          class="tab-btn" 
          :class="{ 'tab-btn-active': tabActiva === 'estudiantes' }"
        >
          Estudiantes <span class="tab-badge">{{ estudiantes.length }}</span>
        </button>

        <button 
          @click="tabActiva = 'cursos'" 
          class="tab-btn" 
          :class="{ 'tab-btn-active': tabActiva === 'cursos' }"
        >
          Cursos (Secciones) <span class="tab-badge">{{ cursos.length }}</span>
        </button>

        <button 
          @click="tabActiva = 'evaluaciones'" 
          class="tab-btn" 
          :class="{ 'tab-btn-active': tabActiva === 'evaluaciones' }"
        >
          Evaluaciones <span class="tab-badge">{{ evaluacionesVisibles.length }}</span>
        </button>
      </div>

            <!-- ======================================================== -->
      <!-- PESTAÑA 1: ESTUDIANTES (RF102 Selección múltiple/Retiro) -->
      <!-- ======================================================== -->
      <div v-if="tabActiva === 'estudiantes'" class="tab-panel">
        <div class="panel-header mb-3">
          <div>
            <h2 class="panel-title">Estudiantes Inscritos</h2>
            <p class="panel-desc">Alumnos que forman parte de esta aula y tienen acceso a las mediciones y actividades.</p>
          </div>
          <div class="panel-actions-group">
            <!-- Botón de retiro masivo (RF102) -->
            <button 
              v-if="estudiantesSeleccionadosParaEliminar.length > 0" 
              @click="abrirConfirmacionEliminarVarios" 
              class="btn btn-danger btn-sm"
              style="background: #dc2626; color: white; border: none; margin-right: 0.5rem; font-weight: 600;"
            >
              Retirar Seleccionados ({{ estudiantesSeleccionadosParaEliminar.length }})
            </button>
            <button @click="abrirModalInvitar" class="btn btn-primary btn-sm">
              Invitar Estudiante por Correo
            </button>
          </div>
        </div>

        <div v-if="estudiantes.length === 0" class="empty-state card">
          <p>Aún no hay estudiantes inscritos en esta aula.</p>
          <small>Comparte el código <strong>{{ aula.codigo }}</strong> o envíales una invitación por correo.</small>
          <div class="mt-3">
            <button @click="abrirModalInvitar" class="btn btn-secondary btn-sm">
              Enviar Primera Invitación
            </button>
          </div>
        </div>

        <div v-else class="table-responsive card">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">
                  <input 
                    type="checkbox" 
                    :checked="todosSeleccionados" 
                    @change="alternarSeleccionarTodos"
                    title="Seleccionar o deseleccionar todos"
                  />
                </th>
                <th>Nombre del Estudiante</th>
                <th>Correo Institucional</th>
                <th>Secciones Asignadas</th>
                <th>Estado</th>
                <th style="width: 90px; text-align: center;">Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="est in estudiantes" :key="est.usuario_id">
                <td style="text-align: center;">
                  <input 
                    type="checkbox" 
                    :value="est.usuario_id" 
                    v-model="estudiantesSeleccionadosParaEliminar" 
                  />
                </td>
                <td>
                  <strong>{{ est.nombre }}</strong>
                </td>
                <td>
                  <code class="email-code">{{ est.correo }}</code>
                </td>
                <td>
                  <span 
                    v-for="seccion in obtenerSeccionesEstudiante(est.usuario_id)" 
                    :key="seccion.id"
                    class="badge badge-section mr-1"
                  >
                    {{ seccion.nombre }}
                  </span>
                  <span v-if="obtenerSeccionesEstudiante(est.usuario_id).length === 0" class="text-muted-small">
                    Sin sección
                  </span>
                </td>
                <td>
                  <span class="badge badge-profesor">Activo</span>
                </td>
                <td style="text-align: center;">
                  <button 
                    @click="abrirConfirmacionEliminarUno(est)" 
                    class="btn-icon" 
                    style="color: #dc2626; cursor: pointer; border: none; background: none; font-size: 1rem;" 
                    title="Retirar estudiante del aula"
                  >
                    Retirar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- PESTAÑA 2: CURSOS (SECCIONES)                           -->
      <!-- ======================================================== -->
      <div v-if="tabActiva === 'cursos'" class="tab-panel">
        <div class="panel-header mb-3">
          <div>
            <h2 class="panel-title">Cursos y Secciones del Aula</h2>
            <p class="panel-desc">Subgrupos para organizar a los estudiantes en talleres, turnos o grupos de práctica.</p>
          </div>
          <button @click="abrirModalNuevoCurso" class="btn btn-primary btn-sm">
            + Nueva Sección
          </button>
        </div>

        <div v-if="cursos.length === 0" class="empty-state card">
          <p>No hay secciones creadas en esta aula.</p>
          <small>Crea una sección para agrupar estudiantes según turnos o prácticas con el sensor.</small>
          <div class="mt-3">
            <button @click="abrirModalNuevoCurso" class="btn btn-primary btn-sm">
              + Crear Primera Sección
            </button>
          </div>
        </div>

        <div v-else class="cursos-grid">
          <div v-for="c in cursos" :key="c.id" class="curso-detail-card card">
            <div class="curso-detail-header">
              <h3 class="curso-name">{{ c.nombre }}</h3>
              <div class="curso-actions-btn-group">
                <button 
                  @click="abrirModalEditarCurso(c)" 
                  class="btn-icon" 
                  title="Renombrar curso"
                >
                  Editar
                </button>
                <button 
                  @click="confirmarEliminarCurso(c)" 
                  class="btn-icon text-danger" 
                  title="Eliminar curso"
                >
                  Eliminar
                </button>
              </div>
            </div>

            <div class="curso-stats-box">
              <span class="badge badge-students-count">
                {{ c.cantidad_estudiantes || (c.estudiantes_ids?.length || 0) }} Estudiante(s)
              </span>
            </div>

            <!-- Listado breve de estudiantes asignados -->
            <div class="curso-assigned-list">
              <span class="assigned-title">Alumnos en este curso:</span>
              <div v-if="(c.estudiantes_ids || []).length === 0" class="text-muted-small">
                Ningún estudiante asignado aún.
              </div>
              <div v-else class="assigned-tags">
                <span 
                  v-for="idEst in c.estudiantes_ids" 
                  :key="idEst" 
                  class="student-tag"
                >
                  {{ obtenerNombreEstudiante(idEst) }}
                </span>
              </div>
            </div>

            <div class="curso-card-footer mt-3">
              <button @click="abrirModalAsignarEstudiantes(c)" class="btn btn-secondary btn-sm w-100">
                Gestionar Alumnos de la Sección
              </button>
            </div>
          </div>
        </div>
      </div>

            <!-- ======================================================== -->
      <!-- PESTAÑA 3: EVALUACIONES (RF103, RF104, RF117)             -->
      <div v-if="tabActiva === 'evaluaciones'" class="tab-panel">
        <!-- Vista 1: Lista de Evaluaciones -->
        <div v-if="!evaluacionSeleccionada" class="evaluaciones-list-view">
          <div class="panel-header mb-4" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h2 class="panel-title">Evaluaciones y Controles Prácticos</h2>
              <p class="panel-desc">
                {{ isAdmin || isProfesor ? 'Asigna y administra evaluaciones al aula, por cursos o estudiantes individuales (RF104).' : 'Evaluaciones asignadas para ti en este espacio académico.' }}
              </p>
            </div>
            <!-- Botón de asignación rápida para el Docente -->
            <button 
              v-if="isAdmin || isProfesor" 
              @click="abrirModalAsignar()" 
              class="btn btn-primary"
            >
              🎯 Asignar Evaluación
            </button>
          </div>

          <!-- Estado vacío -->
          <div v-if="evaluacionesVisibles.length === 0" class="empty-state card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.75" style="margin: 0 auto 0.75rem auto; display: block;">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            <p style="font-weight: 600; color: #334155;">
              {{ isAdmin || isProfesor ? 'No hay evaluaciones registradas en esta aula.' : 'No tienes evaluaciones asignadas a ti en esta aula actualmente.' }}
            </p>
            <small style="color: #64748b;">
              {{ isAdmin || isProfesor ? 'Usa el botón "Asignar Evaluación" o crea una en la sección de Evaluaciones.' : 'Cuando tu profesor te asigne un control práctico o teórico aparecerá aquí.' }}
            </small>
          </div>

          <!-- Cuadrícula de Evaluaciones con Badge de Asignación RF104 -->
          <div v-else class="evaluaciones-grid">
            <div v-for="ev in evaluacionesVisibles" :key="ev.id" class="eval-card-modern">
              <div class="eval-card-top">
                <div class="eval-card-badge-row">
                  <span class="eval-status-pill" :class="ev.activa ? 'status-activa' : 'status-borrador'">
                    <span class="status-dot"></span>
                    {{ ev.activa ? 'Activa' : 'Borrador' }}
                  </span>
                  
                  <!-- Badge del Alcance RF104 -->
                  <span class="badge-asignacion" :class="'badge-asig-' + (ev.asignaciones && ev.asignaciones.length ? ev.asignaciones[0].alcance : 'ninguno')">
                    🎯 {{ obtenerTextoAsignacion(ev) }}
                  </span>

                  <span class="eval-tag-tipo">{{ ev.tipo === 'ejercicio_aplicado' ? 'Práctica Clínica' : 'Cuestionario Teórico' }}</span>
                </div>
                <h3 class="eval-card-title">{{ ev.titulo }}</h3>
                <p class="eval-card-desc">{{ ev.descripcion || 'Sin instrucciones adicionales especificadas.' }}</p>
              </div>

              <div class="eval-card-meta-chips">
                <div class="meta-chip">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span>{{ ev.tiempo_limite_s ? Math.round(ev.tiempo_limite_s / 60) : 30 }} min</span>
                </div>
                <div class="meta-chip">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  <span>{{ ev.preguntas ? ev.preguntas.length : 5 }} preguntas</span>
                </div>
                <div class="meta-chip">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span>{{ formatearFecha(ev.creada_en || ev.creado_en) }}</span>
                </div>
              </div>

              <div class="eval-card-footer" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <!-- Botón Docente 1: Ver Desempeño (RF117) -->
                <button 
                  v-if="isAdmin || isProfesor"
                  @click="seleccionarEvaluacionParaVer(ev)" 
                  class="btn-eval-accion"
                  style="flex: 2;"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 12h5l3 8 4-16 3 8h5"/>
                  </svg>
                  <span>Ver Desempeño</span>
                </button>

                <!-- Botón Docente 2: Asignar / Cambiar Alcance (RF104) -->
                <button 
                  v-if="isAdmin || isProfesor"
                  @click="abrirModalAsignar(ev)" 
                  class="btn-eval-accion btn-secundario-eval"
                  style="flex: 1; background: #f8fafc; color: #0284c7; border: 1px solid #bae6fd;"
                  title="Configurar a quién se asigna esta evaluación"
                >
                  <span>🎯 Asignar</span>
                </button>

                <!-- Botón Estudiante: Rendir Evaluación -->
                <button 
                  v-if="!isAdmin && !isProfesor"
                  class="btn-eval-accion"
                  style="background: #10b981;"
                  @click="mostrarFeedback(true, 'Iniciando evaluación asignada para tu perfil...')"
                >
                  <span>📝 Rendir Evaluación</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Vista 2: Panel de Desempeño de la Evaluación Seleccionada -->
        <div v-else class="eval-desempeno-panel">
          <!-- Barra superior de navegación de vuelta -->
          <div class="desempeno-nav-bar mb-3">
            <button @click="cerrarPanelEvaluacion" class="btn-regresar-eval">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              <span>Volver al listado de evaluaciones</span>
            </button>
            <span class="badge badge-docente-header">Panel Docente</span>
          </div>

          <!-- Cabecera de la Evaluación y Banner de Privacidad -->
          <div class="eval-hero-card card mb-4">
            <div class="eval-hero-info">
              <h2 class="eval-hero-title">{{ evaluacionSeleccionada.titulo }}</h2>
              <p class="eval-hero-desc">{{ evaluacionSeleccionada.descripcion }}</p>
            </div>

            <!-- Banner Garantía de Confidencialidad Médica -->
            <div class="confidencialidad-banner">
              <div class="confidencialidad-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div class="confidencialidad-content">
                <strong>Garantía de Confidencialidad Médica:</strong>
                <span>
                  Este panel muestra exclusivamente las calificaciones, respuestas y mediciones asignadas a esta evaluación. Los datos de salud declarados (estrés, sueño, cafeína, medicación) permanecen cifrados en el servidor y son estrictamente inaccesibles para el docente.
                </span>
              </div>
            </div>
          </div>

          <!-- Métricas Agregadas del Aula (KPI Cards) -->
          <div v-if="estadisticasEval" class="kpi-metricas-grid mb-4">
            <div class="kpi-card kpi-blue">
              <div class="kpi-header">
                <span class="kpi-label">Promedio Calificación</span>
                <div class="kpi-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                </div>
              </div>
              <div class="kpi-value text-blue">{{ estadisticasEval.promedioCalificacion }}%</div>
              <div class="kpi-subtext">{{ estadisticasEval.totalEvaluados }} de {{ estadisticasEval.totalEstudiantes }} evaluados</div>
            </div>

            <div class="kpi-card kpi-green">
              <div class="kpi-header">
                <span class="kpi-label">Tasa de Aprobación</span>
                <div class="kpi-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
              </div>
              <div class="kpi-value text-green">{{ estadisticasEval.tasaAprobacion }}%</div>
              <div class="kpi-subtext">Logrado: {{ estadisticasEval.distribucionNiveles.logrado }} · Parcial: {{ estadisticasEval.distribucionNiveles.medianamente_logrado }}</div>
            </div>

            <div class="kpi-card kpi-indigo">
              <div class="kpi-header">
                <span class="kpi-label">Frecuencia Grupal</span>
                <div class="kpi-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </div>
              </div>
              <div class="kpi-value text-indigo">{{ estadisticasEval.promedioBpm ? estadisticasEval.promedioBpm + ' BPM' : 'N/A' }}</div>
              <div class="kpi-subtext">Promedio en reposo evaluado</div>
            </div>

            <div class="kpi-card kpi-teal">
              <div class="kpi-header">
                <span class="kpi-label">SpO₂ Grupal</span>
                <div class="kpi-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                  </svg>
                </div>
              </div>
              <div class="kpi-value text-teal">{{ estadisticasEval.promedioSpo2 ? estadisticasEval.promedioSpo2 + '%' : 'N/A' }}</div>
              <div class="kpi-subtext">Absorción óptica grupal en rango</div>
            </div>
          </div>

          <!-- Tabla de Estudiantes Evaluados -->
          <div class="estudiantes-eval-seccion card">
            <div class="seccion-header-row mb-3">
              <div>
                <h3 class="seccion-eval-title">Resultados Individuales por Estudiante</h3>
                <p class="seccion-eval-desc">
                  Solo se listan estudiantes actualmente activos en el aula. Si un estudiante es retirado, la visibilidad se suspende de inmediato.
                </p>
              </div>
              <span class="total-evaluados-pill">{{ intentosEvaluacion.length }} registrados</span>
            </div>

            <div v-if="cargandoDesempeno" class="loading-state">
              <div class="spinner"></div>
              <p>Cargando resultados de la evaluación...</p>
            </div>

            <div v-else-if="intentosEvaluacion.length === 0" class="empty-state">
              <p>Aún no hay intentos registrados por estudiantes activos para esta evaluación.</p>
              <small>Los resultados aparecerán aquí conforme los estudiantes completen sus pruebas.</small>
            </div>

            <div v-else class="table-responsive">
              <table class="data-table-modern">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Calificación</th>
                    <th>Nivel Logrado</th>
                    <th>Medición Asignada</th>
                    <th style="text-align: center;">Respuestas</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="intento in intentosEvaluacion" :key="intento.id">
                    <!-- Estudiante con avatar de iniciales -->
                    <td>
                      <div class="student-profile-cell">
                        <div class="student-avatar-circle">
                          {{ obtenerIniciales(intento.estudiante_nombre) }}
                        </div>
                        <div class="student-name-group">
                          <strong class="student-name">{{ intento.estudiante_nombre }}</strong>
                          <span class="student-email">{{ intento.estudiante_correo }}</span>
                        </div>
                      </div>
                    </td>

                    <!-- Calificación con mini barra de progreso -->
                    <td>
                      <div class="score-display-cell">
                        <div class="score-header-val">
                          <span class="score-percentage">{{ intento.porcentaje }}%</span>
                          <span class="score-points">({{ intento.puntaje }}/{{ intento.puntaje_maximo }} pts)</span>
                        </div>
                        <div class="score-progress-bar">
                          <div 
                            class="score-progress-fill" 
                            :style="{ 
                              width: `${Math.min(100, Math.max(0, intento.porcentaje))}%`,
                              backgroundColor: intento.porcentaje >= 80 ? '#16a34a' : (intento.porcentaje >= 60 ? '#d97706' : '#dc2626')
                            }"
                          ></div>
                        </div>
                      </div>
                    </td>

                    <!-- Nivel Logrado Badge -->
                    <td>
                      <span 
                        class="badge-nivel-pill" 
                        :class="'nivel-' + (intento.nivel || 'default')"
                      >
                        {{ obtenerTextoNivel(intento.nivel) }}
                      </span>
                    </td>

                    <!-- Medición Asignada con botón Ver Señal PPG -->
                    <td>
                      <div v-if="intento.medicion" class="medicion-cell-row">
                        <span class="medicion-val-chip font-mono">
                          {{ intento.medicion.bpm }} BPM · {{ intento.medicion.spo2 }}%
                        </span>
                        <button 
                          @click="abrirModalMedicion(intento)" 
                          class="btn-ver-ppg" 
                          title="Ver trazo de bioseñal registrada"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                          </svg>
                          <span>Ver Señal PPG</span>
                        </button>
                      </div>
                      <span v-else class="text-muted-xs">Sin medición asignada</span>
                    </td>

                    <!-- Botón Ver Respuestas -->
                    <td style="text-align: center;">
                      <button 
                        @click="abrirModalRespuestas(intento)" 
                        class="btn-ver-respuestas"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        <span>Ver Respuestas ({{ intento.respuestas?.length || 0 }})</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODALES                                                 -->
    <!-- ======================================================== -->

    <!-- MODAL VER RESPUESTAS DEL ESTUDIANTE -->
    <div v-if="intentoVerRespuestas" class="modal-backdrop" @click.self="intentoVerRespuestas = null">
      <div class="modal-card modal-card-xl">
        <!-- Cabecera del modal con avatar y cierre -->
        <div class="modal-header-custom mb-3">
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <div class="student-avatar-circle avatar-lg">
              {{ obtenerIniciales(intentoVerRespuestas.estudiante_nombre) }}
            </div>
            <div>
              <h3 class="modal-title" style="margin: 0; font-size: 1.25rem;">
                Revisión de Respuestas y Calificación
              </h3>
              <p class="modal-subtitle" style="margin: 0.2rem 0 0 0;">
                Estudiante: <strong>{{ intentoVerRespuestas.estudiante_nombre }}</strong> ({{ intentoVerRespuestas.estudiante_correo }})
              </p>
            </div>
          </div>
          <button type="button" @click="intentoVerRespuestas = null" class="btn-close-modal" aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Banner Amplio de Resumen de Evaluación -->
        <div class="revision-score-banner mb-3">
          <div class="score-banner-block">
            <span class="score-banner-label">Calificación Final</span>
            <div class="score-banner-value-row">
              <span class="score-banner-number">{{ intentoVerRespuestas.porcentaje }}%</span>
              <div class="score-mini-track">
                <div 
                  class="score-mini-fill" 
                  :style="{ 
                    width: `${Math.min(100, Math.max(0, intentoVerRespuestas.porcentaje))}%`,
                    backgroundColor: intentoVerRespuestas.porcentaje >= 80 ? '#16a34a' : (intentoVerRespuestas.porcentaje >= 60 ? '#d97706' : '#dc2626')
                  }"
                ></div>
              </div>
            </div>
          </div>

          <div class="score-banner-divider"></div>

          <div class="score-banner-block">
            <span class="score-banner-label">Puntaje Total</span>
            <div class="score-banner-pts">
              <strong>{{ intentoVerRespuestas.puntaje }}</strong> <span class="pts-total">/ {{ intentoVerRespuestas.puntaje_maximo }} puntos</span>
            </div>
            <div class="score-banner-correctas">
              {{ contarRespuestasCorrectas(intentoVerRespuestas.respuestas) }} de {{ intentoVerRespuestas.respuestas?.length || 5 }} correctas
            </div>
          </div>

          <div class="score-banner-divider"></div>

          <div class="score-banner-block">
            <span class="score-banner-label">Nivel de Logro Alcanzado</span>
            <div>
              <span class="badge-nivel-pill badge-nivel-lg" :class="'nivel-' + (intentoVerRespuestas.nivel || 'default')">
                {{ obtenerTextoNivel(intentoVerRespuestas.nivel) }}
              </span>
            </div>
            <span class="score-banner-eval-desc">Evaluación formativa / sumativa</span>
          </div>
        </div>

        <!-- Lista Amplia y Cómoda de Preguntas Respondidas -->
        <div class="revision-preguntas-container">
          <div 
            v-for="(r, idx) in intentoVerRespuestas.respuestas" 
            :key="r.pregunta_id || idx" 
            class="pregunta-revision-card"
            :class="r.es_correcta ? 'card-correcta' : 'card-incorrecta'"
          >
            <!-- Cabecera de la pregunta -->
            <div class="pregunta-revision-top">
              <div class="pregunta-badge-group">
                <span class="pregunta-numero-pill">Pregunta {{ idx + 1 }}</span>
                <span class="pregunta-status-badge" :class="r.es_correcta ? 'badge-ok' : 'badge-bad'">
                  <svg v-if="r.es_correcta" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  <span>{{ r.es_correcta ? 'Respuesta Correcta' : 'Respuesta Incorrecta' }}</span>
                </span>
              </div>
              <div class="pregunta-puntos-tag" :class="r.es_correcta ? 'tag-puntos-ok' : 'tag-puntos-bad'">
                {{ r.es_correcta ? '+' + r.puntaje + ' pts' : '0 pts' }}
              </div>
            </div>

            <!-- Enunciado de la pregunta -->
            <h4 class="pregunta-enunciado">{{ r.pregunta }}</h4>

            <!-- Caja de Respuesta Entregada -->
            <div class="respuesta-box-layout">
              <div class="respuesta-row-item" :class="r.es_correcta ? 'row-correcta' : 'row-incorrecta'">
                <div class="respuesta-label-col">
                  <span class="label-txt">Respuesta del Estudiante:</span>
                </div>
                <div class="respuesta-val-col">
                  <strong class="val-txt">{{ r.respuesta }}</strong>
                </div>
              </div>

              <!-- Si fue incorrecta, mostrar la solución esperada para el docente -->
              <div v-if="!r.es_correcta && r.respuesta_esperada" class="respuesta-row-item row-solucion">
                <div class="respuesta-label-col">
                  <span class="label-txt label-esperada">Respuesta Correcta:</span>
                </div>
                <div class="respuesta-val-col">
                  <strong class="val-txt val-esperada">{{ r.respuesta_esperada }}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 1.25rem;">
          <button type="button" @click="intentoVerRespuestas = null" class="btn btn-primary">
            Cerrar Respuestas
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL VER MEDICIÓN Y TRAZO PPG DEL ESTUDIANTE -->
    <div v-if="intentoVerMedicion" class="modal-backdrop" @click.self="intentoVerMedicion = null">
      <div class="modal-card modal-card-xl">
        <!-- Cabecera del modal -->
        <div class="modal-header-custom mb-3">
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <div class="student-avatar-circle avatar-lg">
              {{ obtenerIniciales(intentoVerMedicion.estudiante_nombre) }}
            </div>
            <div>
              <h3 class="modal-title" style="margin: 0; font-size: 1.25rem;">
                Bioseñal Fotopletismográfica (PPG)
              </h3>
              <p class="modal-subtitle" style="margin: 0.2rem 0 0 0;">
                Estudiante: <strong>{{ intentoVerMedicion.estudiante_nombre }}</strong> ({{ intentoVerMedicion.estudiante_correo }})
              </p>
            </div>
          </div>
          <button type="button" @click="intentoVerMedicion = null" class="btn-close-modal" aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- 3 Tarjetas de Biomarcadores Fisiológicos -->
        <div class="bioseñal-stats-grid mb-3">
          <div class="bioseñal-stat-card card-frecuencia">
            <div class="bioseñal-card-header">
              <span class="bioseñal-stat-label">Frecuencia Cardíaca</span>
              <span class="badge badge-subtle-success">Rango normal</span>
            </div>
            <div class="bioseñal-stat-val text-dark">
              {{ intentoVerMedicion.medicion?.bpm }} <span class="unit-text">BPM</span>
            </div>
            <div class="bioseñal-subdesc">Ventana normal: 60 - 100 BPM en reposo</div>
          </div>

          <div class="bioseñal-stat-card card-spo2">
            <div class="bioseñal-card-header">
              <span class="bioseñal-stat-label">Saturación SpO₂</span>
              <span class="badge badge-subtle-info">Rango normal</span>
            </div>
            <div class="bioseñal-stat-val text-blue">
              {{ intentoVerMedicion.medicion?.spo2 }} <span class="unit-text">%</span>
            </div>
            <div class="bioseñal-subdesc">Adecuada absorción óptica (>= 95%)</div>
          </div>

          <div class="bioseñal-stat-card card-perfusion">
            <div class="bioseñal-card-header">
              <span class="bioseñal-stat-label">Índice de Perfusión</span>
              <span class="badge badge-subtle-teal">Pulso Óptimo</span>
            </div>
            <div class="bioseñal-stat-val text-teal">
              {{ intentoVerMedicion.medicion?.indicePerfusion || '4.2' }} <span class="unit-text">%</span>
            </div>
            <div class="bioseñal-subdesc">Amplitud pulsátil AC/DC (> 1.5%)</div>
          </div>
        </div>

        <!-- Barra de Especificaciones de Adquisición Óptica -->
        <div class="sensor-spec-bar mb-3">
          <div class="spec-item">
            <span class="spec-label">Dispositivo:</span>
            <strong>MAX30102 Óptico de Pulso</strong>
          </div>
          <div class="spec-divider"></div>
          <div class="spec-item">
            <span class="spec-label">Longitudes de Onda:</span>
            <strong>Infrarrojo 880 nm + Rojo 660 nm</strong>
          </div>
          <div class="spec-divider"></div>
          <div class="spec-item">
            <span class="spec-label">Muestreo:</span>
            <strong>100 Hz (10 ms por muestra)</strong>
          </div>
          <div class="spec-divider"></div>
          <div class="spec-item signal-conforme-item">
            <span class="pulse-indicator-dot"></span>
            <strong>Señal Fisiológica Conforme</strong>
          </div>
        </div>

        <!-- Osciloscopio Clínico de Bioseñal PPG -->
        <div class="oscilloscope-container mb-3">
          <div class="oscilloscope-header">
            <div class="osc-title-group">
              <span class="osc-channel-name">CANAL ÓPTICO DE PULSO (IR 880 nm)</span>
              <span class="osc-rate">Escala: 200 ms/div · Filtro Pasa-banda 0.5 - 5 Hz</span>
            </div>
            <div class="osc-features-legend">
              <span class="legend-item"><span class="legend-dot peak-dot"></span>Pico Sistólico</span>
              <span class="legend-item"><span class="legend-dot notch-dot"></span>Incisura Dícrota</span>
              <span class="legend-item"><span class="legend-dot wave-dot"></span>Onda Dícrota</span>
            </div>
          </div>

          <!-- Pantalla SVG del osciloscopio con rejilla médica y trazo realista -->
          <div class="oscilloscope-screen">
            <svg viewBox="0 0 800 160" preserveAspectRatio="none" class="oscilloscope-svg">
              <defs>
                <!-- Rejilla médica de osciloscopio -->
                <pattern id="osc-grid" width="40" height="32" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="40" y2="0" stroke="#1e293b" stroke-width="1" />
                  <line x1="0" y1="0" x2="0" y2="32" stroke="#1e293b" stroke-width="1" />
                </pattern>
                <!-- Gradiente de área bajo la curva PPG -->
                <linearGradient id="ppg-glow-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.30" />
                  <stop offset="60%" stop-color="#0284c7" stop-opacity="0.10" />
                  <stop offset="100%" stop-color="#0284c7" stop-opacity="0.0" />
                </linearGradient>
                <!-- Filtro de resplandor para el haz de pulso -->
                <filter id="neon-glow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#38bdf8" flood-opacity="0.6"/>
                </filter>
              </defs>

              <!-- Fondo con rejilla -->
              <rect width="800" height="160" fill="#090d16" />
              <rect width="800" height="160" fill="url(#osc-grid)" />

              <!-- Línea base horizontal (Y = 125) -->
              <line x1="0" y1="125" x2="800" y2="125" stroke="#334155" stroke-dasharray="4,4" stroke-width="1" />

              <!-- Relleno bajo la curva PPG -->
              <path
                d="M 0 125
                   C 20 120, 32 30, 48 24 C 58 24, 68 55, 78 72 C 84 76, 92 64, 102 62 C 114 62, 135 110, 160 125
                   C 180 120, 192 30, 208 24 C 218 24, 228 55, 238 72 C 244 76, 252 64, 262 62 C 274 62, 295 110, 320 125
                   C 340 120, 352 30, 368 24 C 378 24, 388 55, 398 72 C 404 76, 412 64, 422 62 C 434 62, 455 110, 480 125
                   C 500 120, 512 30, 528 24 C 538 24, 548 55, 558 72 C 564 76, 572 64, 582 62 C 594 62, 615 110, 640 125
                   C 660 120, 672 30, 688 24 C 698 24, 708 55, 718 72 C 724 76, 732 64, 742 62 C 754 62, 775 110, 800 125
                   L 800 160 L 0 160 Z"
                fill="url(#ppg-glow-gradient)"
              />

              <!-- Trazo de la Onda PPG con curva fluida continua y realista -->
              <path
                d="M 0 125
                   C 20 120, 32 30, 48 24 C 58 24, 68 55, 78 72 C 84 76, 92 64, 102 62 C 114 62, 135 110, 160 125
                   C 180 120, 192 30, 208 24 C 218 24, 228 55, 238 72 C 244 76, 252 64, 262 62 C 274 62, 295 110, 320 125
                   C 340 120, 352 30, 368 24 C 378 24, 388 55, 398 72 C 404 76, 412 64, 422 62 C 434 62, 455 110, 480 125
                   C 500 120, 512 30, 528 24 C 538 24, 548 55, 558 72 C 564 76, 572 64, 582 62 C 594 62, 615 110, 640 125
                   C 660 120, 672 30, 688 24 C 698 24, 708 55, 718 72 C 724 76, 732 64, 742 62 C 754 62, 775 110, 800 125"
                fill="none"
                stroke="#38bdf8"
                stroke-width="2.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                filter="url(#neon-glow)"
              />

              <!-- Puntos fisiológicos anatómicos en el segundo ciclo -->
              <circle cx="208" cy="24" r="3.5" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" />
              <circle cx="238" cy="72" r="3" fill="#fbbf24" stroke="#ffffff" stroke-width="1.2" />
              <circle cx="262" cy="62" r="3" fill="#34d399" stroke="#ffffff" stroke-width="1.2" />
            </svg>
          </div>

          <!-- Escala de tiempo en el eje inferior -->
          <div class="oscilloscope-timeline">
            <span>0.0 s</span>
            <span>1.0 s</span>
            <span>2.0 s</span>
            <span>3.0 s</span>
            <span>4.0 s</span>
            <span>5.0 s</span>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 1.25rem;">
          <button type="button" @click="intentoVerMedicion = null" class="btn btn-primary">
            Cerrar Bioseñal
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL INVITAR ESTUDIANTE POR CORREO (RF100) -->
    <div v-if="modalInvitarAbierto" class="modal-backdrop" @click.self="modalInvitarAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title">Invitar Estudiante al Aula</h3>
        <p class="modal-subtitle">
          Aula: <strong>{{ aula?.nombre }}</strong> (Código: <code>{{ aula?.codigo }}</code>)
        </p>

        <div v-if="errorInvitacionModal" class="alert alert-error mb-3" style="font-size: 0.85rem; padding: 0.65rem 0.85rem; margin-bottom: 1rem; border-left: 4px solid #ef4444;">
          <strong>Error de envío:</strong> {{ errorInvitacionModal }}
        </div>

        <form @submit.prevent="enviarInvitacion">
          <div class="form-group">
            <label class="form-label">Correo Institucional del Estudiante (@alu.unach.cl) *</label>
            <input 
              v-model="correoInvitacion" 
              type="email" 
              class="form-input" 
              placeholder="estudiante@alu.unach.cl" 
              required 
              :disabled="enviandoInvitacion"
            />
            <small class="help-text">El código de acceso será enviado a través de Resend a la casilla del estudiante.</small>
          </div>

          <div class="modal-actions">
            <button type="button" @click="modalInvitarAbierto = false" class="btn btn-secondary" :disabled="enviandoInvitacion">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="enviandoInvitacion">
              <span v-if="enviandoInvitacion">Enviando con Resend...</span>
              <span v-else>Enviar Invitación</span>
            </button>
          </div>
        </form>

        <!-- Historial de invitaciones -->
        <div class="invitaciones-historial mt-4" style="margin-top: 1.5rem; border-top: 1px solid var(--color-border); padding-top: 1rem;">
          <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--color-muted);">
            Registro de Envíos en esta Aula
          </h4>
          <div v-if="cargandoInvitaciones" style="font-size: 0.8rem; color: var(--color-muted);">
            Consultando registros...
          </div>
          <div v-else-if="listaInvitaciones.length === 0" style="font-size: 0.8rem; color: var(--color-muted);">
            No hay registros previos de invitaciones para esta aula.
          </div>
          <div v-else class="invitaciones-lista" style="max-height: 140px; overflow-y: auto; font-size: 0.8rem;">
            <div 
              v-for="inv in listaInvitaciones" 
              :key="inv.id" 
              style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #f1f5f9;"
            >
              <div>
                <strong>{{ inv.correo }}</strong>
                <small style="display: block; color: #94a3b8;">
                  {{ formatearFecha(inv.enviada_en || inv.intentado_en) }}
                  <span v-if="inv.error_detalle" style="color: #ef4444; display: block;">{{ inv.error_detalle }}</span>
                </small>
              </div>
              <span 
                :class="inv.estado === 'fallido' ? 'badge badge-desactivado' : 'badge badge-profesor'" 
                style="font-size: 0.72rem;"
              >
                {{ inv.estado === 'fallido' ? 'Fallido' : 'Enviado' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL CREAR / RENOMBRAR CURSO (RF101) -->
    <div v-if="modalCursoAbierto" class="modal-backdrop" @click.self="modalCursoAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title">{{ modoCurso === 'crear' ? 'Crear Nueva Sección' : 'Renombrar Sección' }}</h3>
        <p class="modal-subtitle">Aula: <strong>{{ aula?.nombre }}</strong></p>

        <form @submit.prevent="guardarCurso">
          <div class="form-group">
            <label class="form-label">Nombre del Curso (Sección) *</label>
            <input 
              v-model="nombreCursoInput" 
              type="text" 
              class="form-input" 
              placeholder="Ej: Sección 1 - Turno Mañana" 
              required 
            />
          </div>

          <div class="modal-actions">
            <button type="button" @click="modalCursoAbierto = false" class="btn btn-secondary">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="guardandoCurso">
              {{ guardandoCurso ? 'Guardando...' : (modoCurso === 'crear' ? 'Crear Sección' : 'Actualizar') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL ASIGNAR ESTUDIANTES AL CURSO (RF101) -->
    <div v-if="modalAsignarAbierto" class="modal-backdrop" @click.self="modalAsignarAbierto = false">
      <div class="modal-card modal-card-lg">
        <h3 class="modal-title">Asignar Alumnos a: {{ cursoSeleccionado?.nombre }}</h3>
        <p class="modal-subtitle">
          Marca los estudiantes del aula que pertenecerán a esta sección:
        </p>

        <div v-if="estudiantes.length === 0" class="empty-state">
          No hay estudiantes inscritos en el aula todavía. Invítalos primero para poder asignarlos a este curso.
        </div>

        <div v-else class="students-checkbox-list">
          <label 
            v-for="est in estudiantes" 
            :key="est.usuario_id" 
            class="checkbox-item"
          >
            <input 
              type="checkbox" 
              :value="est.usuario_id" 
              v-model="estudiantesSeleccionados" 
            />
            <div>
              <strong>{{ est.nombre }}</strong>
              <p><code>{{ est.correo }}</code></p>
            </div>
          </label>
        </div>

        <div class="modal-actions mt-3">
          <button type="button" @click="modalAsignarAbierto = false" class="btn btn-secondary">Cancelar</button>
          <button @click="guardarAsignacionEstudiantes" class="btn btn-primary" :disabled="guardandoAsignacion">
            {{ guardandoAsignacion ? 'Guardando...' : 'Guardar Asignaciones' }}
          </button>
        </div>
      </div>
    </div>
  </div>
      <!-- MODAL CONFIRMAR RETIRO DE ESTUDIANTES (RF102) -->
    <div v-if="modalRetiroAbierto" class="modal-backdrop" @click.self="modalRetiroAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title" style="color: #dc2626;">Confirmar Retiro de Estudiante(s)</h3>
        <p class="modal-subtitle">
          ¿Estás seguro de que deseas retirar del aula <strong>{{ aula?.nombre }}</strong> a los siguientes alumnos?
        </p>

        <div class="retiro-lista-box" style="max-height: 160px; overflow-y: auto; background: #f8fafc; border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 1rem;">
          <div v-for="est in estudiantesARetirar" :key="est.usuario_id" style="padding: 0.3rem 0; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem;">
            <strong>{{ est.nombre }}</strong> <span style="color: #64748b;">({{ est.correo }})</span>
          </div>
        </div>

        <div class="alert alert-warning" style="font-size: 0.8rem; margin-bottom: 1.25rem; line-height: 1.4;">
          <strong>Criterios de seguridad:</strong>
          <ul style="margin: 0.25rem 0 0 1rem; padding: 0;">
            <li>La cuenta del estudiante y sus mediciones personales <strong>no se borrarán</strong>.</li>
            <li>El docente conservará las calificaciones y nivel, pero perderá acceso a mediciones detalladas.</li>
            <li>El estudiante podrá volver a ingresar si cuenta con un código activo.</li>
          </ul>
        </div>

        <div class="modal-actions">
          <button type="button" @click="modalRetiroAbierto = false" class="btn btn-secondary" :disabled="procesandoRetiro">
            Cancelar
          </button>
          <button @click="confirmarRetirarEstudiantes" class="btn btn-danger" :disabled="procesandoRetiro" style="background: #dc2626; color: white; border: none; font-weight: 700; padding: 0.5rem 1rem; border-radius: 0.35rem; cursor: pointer;">
            {{ procesandoRetiro ? 'Retirando...' : 'Confirmar Retiro' }}
          </button>
        </div>
      </div>
    </div>
        <!-- ======================================================== -->
    <!-- MODAL ASIGNAR EVALUACIÓN (RF104: AULA, CURSO, ESTUDIANTE) -->
    <!-- ======================================================== -->
    <div v-if="modalAsignarEvaluacionAbierto" class="modal-backdrop" @click.self="modalAsignarEvaluacionAbierto = false">
      <div class="modal-card modal-card-lg">
        <h3 class="modal-title">🎯 Asignar Evaluación al Aula</h3>
        <p class="modal-subtitle">
          Configura a quiénes estará dirigida esta evaluación en <strong>{{ aula?.nombre }}</strong>.
        </p>

        <form @submit.prevent="guardarAsignacionEvaluacion">
          <!-- 1. Selección de Evaluación -->
          <div class="form-group mb-3">
            <label class="form-label">Evaluación a Asignar *</label>
            <select v-model="evaluacionParaAsignarId" class="form-select" required>
              <option disabled value="">-- Selecciona una evaluación --</option>
              <option v-for="ev in evaluaciones" :key="ev.id" :value="ev.id">
                {{ ev.titulo }} ({{ ev.tipo === 'ejercicio_aplicado' ? 'Práctica' : 'Teórica' }})
              </option>
            </select>
          </div>

          <!-- 2. Selección de Alcance (Las 3 modalidades del RF104) -->
          <div class="form-group mb-3">
            <label class="form-label">Modalidad de Asignación (Alcance) *</label>
            <div class="alcance-options-grid">
              <label class="alcance-option-card" :class="{ activo: alcanceSeleccionado === 'aula' }">
                <input type="radio" value="aula" v-model="alcanceSeleccionado" name="alcance" />
                <div class="alcance-info">
                  <strong>🏫 Toda el Aula</strong>
                  <p>Todos los estudiantes activos inscritos en esta aula tendrán acceso.</p>
                </div>
              </label>

              <label class="alcance-option-card" :class="{ activo: alcanceSeleccionado === 'curso' }">
                <input type="radio" value="curso" v-model="alcanceSeleccionado" name="alcance" />
                <div class="alcance-info">
                  <strong>👥 Por Curso / Sección</strong>
                  <p>Solo los estudiantes inscritos en una sección específica podrán rendirla.</p>
                </div>
              </label>

              <label class="alcance-option-card" :class="{ activo: alcanceSeleccionado === 'estudiante' }">
                <input type="radio" value="estudiante" v-model="alcanceSeleccionado" name="alcance" />
                <div class="alcance-info">
                  <strong>👤 Estudiantes Específicos</strong>
                  <p>Selecciona manualmente uno o varios estudiantes concretos del aula.</p>
                </div>
              </label>
            </div>
          </div>

          <!-- 3A. Si el alcance es 'curso' -->
          <div v-if="alcanceSeleccionado === 'curso'" class="form-group mb-3 alcance-subseccion">
            <label class="form-label">Selecciona el Curso / Sección *</label>
            <div v-if="cursos.length === 0" class="alert alert-warning" style="font-size: 0.85rem;">
              No hay cursos creados en esta aula. Crea un curso en la pestaña "Cursos (Secciones)" primero.
            </div>
            <select v-else v-model="cursoAsignacionId" class="form-select" required>
              <option disabled value="">-- Selecciona una sección --</option>
              <option v-for="c in cursos" :key="c.id" :value="c.id">
                {{ c.nombre }} ({{ (c.estudiantes_ids || []).length }} alumnos)
              </option>
            </select>
          </div>

          <!-- 3B. Si el alcance es 'estudiante' -->
          <div v-if="alcanceSeleccionado === 'estudiante'" class="form-group mb-3 alcance-subseccion">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
              <label class="form-label" style="margin: 0;">Selecciona Estudiantes Concretos *</label>
              <button 
                type="button" 
                @click="alternarTodosEstudiantesAsignacion" 
                style="font-size: 0.8rem; background: none; border: none; color: #0284c7; cursor: pointer; text-decoration: underline;"
              >
                {{ estudiantesAsignacionIds.length === estudiantes.length ? 'Deseleccionar todos' : 'Seleccionar todos' }}
              </button>
            </div>
            <div v-if="estudiantes.length === 0" class="alert alert-warning" style="font-size: 0.85rem;">
              No hay estudiantes inscritos en el aula actualmente.
            </div>
            <div v-else class="students-checkbox-list" style="max-height: 180px; overflow-y: auto;">
              <label 
                v-for="est in estudiantes" 
                :key="est.usuario_id" 
                class="checkbox-item"
              >
                <input 
                  type="checkbox" 
                  :value="est.usuario_id" 
                  v-model="estudiantesAsignacionIds" 
                />
                <div>
                  <strong>{{ est.nombre }}</strong>
                  <p><code>{{ est.correo }}</code></p>
                </div>
              </label>
            </div>
            <small v-if="estudiantesAsignacionIds.length" style="color: #0284c7; font-weight: 600; display: block; margin-top: 0.35rem;">
              ✓ {{ estudiantesAsignacionIds.length }} estudiante(s) seleccionado(s)
            </small>
          </div>

          <!-- Botones de Acción -->
          <div class="modal-actions mt-4">
            <button type="button" @click="modalAsignarEvaluacionAbierto = false" class="btn btn-secondary" :disabled="guardandoAsignacionEval">
              Cancelar
            </button>
            <button type="submit" class="btn btn-primary" :disabled="guardandoAsignacionEval">
              {{ guardandoAsignacionEval ? 'Guardando Asignación...' : 'Confirmar Asignación' }}
            </button>
          </div>
        </form>
      </div>
    </div>
</template>

<script setup>
import AvisoEducativo from '../components/AvisoEducativo.vue'
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { asignarEvaluacion } from '../services/evaluacionesService'
import {
  obtenerAulaPorId,
  obtenerEstudiantesAula,
  obtenerCursosAula,
  obtenerEvaluacionesAula,
  obtenerIntentosEvaluacionAula,
  obtenerEstadisticasEvaluacionAula,
  alternarEstadoCodigoAula,
  regenerarCodigoAulaDocente,
  enviarInvitacionCorreo,
  obtenerInvitacionesAula,
  crearCurso,
  renombrarCurso,
  eliminarCurso,
  actualizarEstudiantesCurso,
  retirarEstudiantesAula
} from '../services/aulasService'

const route = useRoute()
const router = useRouter()
const { currentUserId, currentUserName, isAdmin, isProfesor } = useAuth()


const aulaId = route.params.id
const aula = ref(null)
const cargando = ref(true)
const errorAcceso = ref('')
const tabActiva = ref('estudiantes') // 'estudiantes' | 'cursos' | 'evaluaciones'
const copiado = ref(false)

const estudiantes = ref([])
const cursos = ref([])
const evaluaciones = ref([])
const feedbackMensaje = ref('')
const feedbackExito = ref(true)

// Modales
const modalInvitarAbierto = ref(false)
const correoInvitacion = ref('')
const enviandoInvitacion = ref(false)
const errorInvitacionModal = ref('')
const listaInvitaciones = ref([])
const cargandoInvitaciones = ref(false)

const modalCursoAbierto = ref(false)
const modoCurso = ref('crear')
const cursoSeleccionado = ref(null)
const nombreCursoInput = ref('')
const guardandoCurso = ref(false)

const modalAsignarAbierto = ref(false)
const estudiantesSeleccionados = ref([])
const guardandoAsignacion = ref(false)

// RF117: Visibilidad del profesor sobre evaluaciones asignadas
const evaluacionSeleccionada = ref(null)
const intentosEvaluacion = ref([])
const estadisticasEval = ref(null)
const cargandoDesempeno = ref(false)
const intentoVerRespuestas = ref(null)
const intentoVerMedicion = ref(null)

const seleccionarEvaluacionParaVer = async (ev) => {
  evaluacionSeleccionada.value = ev
  cargandoDesempeno.value = true
  try {
    const [resIntentos, resStats] = await Promise.all([
      obtenerIntentosEvaluacionAula(aulaId, ev.id),
      obtenerEstadisticasEvaluacionAula(aulaId, ev.id)
    ])
    intentosEvaluacion.value = resIntentos.data || []
    estadisticasEval.value = resStats.data || null
  } catch (err) {
    console.error('Error cargando desempeño de evaluación:', err)
  } finally {
    cargandoDesempeno.value = false
  }
}

const cerrarPanelEvaluacion = () => {
  evaluacionSeleccionada.value = null
  intentosEvaluacion.value = []
  estadisticasEval.value = null
}

const abrirModalRespuestas = (intento) => {
  intentoVerRespuestas.value = intento
}

const abrirModalMedicion = (intento) => {
  intentoVerMedicion.value = intento
}

const contarRespuestasCorrectas = (respuestas) => {
  if (!Array.isArray(respuestas)) return 0
  return respuestas.filter(r => r.es_correcta).length
}

const obtenerIniciales = (nombre) => {
  if (!nombre) return 'ES'
  const partes = nombre.trim().split(/\s+/)
  if (partes.length >= 2) {
    return (partes[0][0] + partes[1][0]).toUpperCase()
  }
  return nombre.slice(0, 2).toUpperCase()
}

const obtenerTextoNivel = (nivel) => {
  switch (nivel) {
    case 'logrado': return 'Logrado'
    case 'medianamente_logrado': return 'Medianamente Logrado'
    case 'no_logrado': return 'No Logrado'
    default: return nivel || 'Sin evaluar'
  }
}

const obtenerEstiloBadgeNivel = (nivel) => {
  switch (nivel) {
    case 'logrado':
      return { background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }
    case 'medianamente_logrado':
      return { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }
    case 'no_logrado':
      return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }
    default:
      return { background: '#f1f5f9', color: '#475569' }
  }
}

const formatearFecha = (fecha) => {
  if (!fecha) return ''
  try {
    const d = new Date(fecha)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString()
  } catch (_) {
    return ''
  }
}

const cargarDatos = async () => {
  cargando.value = true
  errorAcceso.value = ''

  // 1. Criterio de aceptación estricto RF103: Solo entra el profesor dueño o el admin
  const resAula = await obtenerAulaPorId(aulaId, {
    usuarioId: currentUserId.value,
    esAdmin: isAdmin.value
  })

  if (!resAula.success) {
    cargando.value = false
    if (resAula.noAutorizado) {
      errorAcceso.value = resAula.error
    } else {
      errorAcceso.value = resAula.error || 'El aula no fue encontrada.'
    }
    return
  }

  aula.value = resAula.data

  // 2. Criterio de aceptación RF103: Las 3 pestañas muestran datos reales
  try {
    const [resEst, resCur, resEv] = await Promise.all([
      obtenerEstudiantesAula(aulaId),
      obtenerCursosAula(aulaId),
      obtenerEvaluacionesAula(aulaId)
    ])

    estudiantes.value = resEst.data || []
    cursos.value = resCur.data || []
    evaluaciones.value = resEv.data || []
  } catch (err) {
    console.error('Error cargando pestañas del aula:', err)
  } finally {
    cargando.value = false
  }
}

// Helpers para nombres de estudiantes y secciones
const obtenerNombreEstudiante = (id) => {
  const est = estudiantes.value.find(e => e.usuario_id === id)
  return est ? est.nombre : 'Estudiante'
}

const obtenerSeccionesEstudiante = (usuarioId) => {
  return cursos.value.filter(c => (c.estudiantes_ids || []).includes(usuarioId))
}

// RF100: Código y Copiar
const copiarCodigo = async (codigo) => {
  if (!codigo) return
  try {
    await navigator.clipboard.writeText(codigo)
    copiado.value = true
    setTimeout(() => { copiado.value = false }, 2500)
  } catch (_) {}
}

const alternarEstadoCodigo = async () => {
  const res = await alternarEstadoCodigoAula({
    aulaId: aula.value.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })
  if (res.success) {
    aula.value.codigo_activo = res.codigo_activo
    mostrarFeedback(true, res.codigo_activo ? 'Código de acceso activado.' : 'Código de acceso desactivado.')
  } else {
    mostrarFeedback(false, res.error)
  }
}

const confirmarRegenerarCodigo = async () => {
  if (!confirm(`¿Regenerar el código de "${aula.value.nombre}"? El código anterior dejará de funcionar.`)) return
  const res = await regenerarCodigoAulaDocente({
    aulaId: aula.value.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })
  if (res.success) {
    aula.value.codigo = res.nuevoCodigo
    aula.value.codigo_activo = true
    mostrarFeedback(true, `Nuevo código generado: ${res.nuevoCodigo}`)
  } else {
    mostrarFeedback(false, res.error)
  }
}

// RF100: Invitaciones
const cargarHistorialInvitaciones = async () => {
  cargandoInvitaciones.value = true
  try {
    const res = await obtenerInvitacionesAula(aulaId)
    listaInvitaciones.value = res.data || []
  } catch (_) {
    listaInvitaciones.value = []
  } finally {
    cargandoInvitaciones.value = false
  }
}

const abrirModalInvitar = async () => {
  correoInvitacion.value = ''
  errorInvitacionModal.value = ''
  modalInvitarAbierto.value = true
  await cargarHistorialInvitaciones()
}

const enviarInvitacion = async () => {
  if (!correoInvitacion.value) return
  enviandoInvitacion.value = true
  errorInvitacionModal.value = ''

  const res = await enviarInvitacionCorreo({
    aulaId: aula.value.id,
    correoEstudiante: correoInvitacion.value,
    profesorId: currentUserId.value,
    profesorNombre: currentUserName.value,
    esAdmin: isAdmin.value
  })

  enviandoInvitacion.value = false

  if (res.success) {
    mostrarFeedback(true, res.message)
    errorInvitacionModal.value = ''
    correoInvitacion.value = ''
    modalInvitarAbierto.value = false
    // Recargar estudiantes
    const resEst = await obtenerEstudiantesAula(aulaId)
    estudiantes.value = resEst.data || []
  } else {
    errorInvitacionModal.value = res.error
    await cargarHistorialInvitaciones()
  }
}

// RF101: Gestión de Cursos
const abrirModalNuevoCurso = () => {
  modoCurso.value = 'crear'
  cursoSeleccionado.value = null
  nombreCursoInput.value = ''
  modalCursoAbierto.value = true
}

const abrirModalEditarCurso = (curso) => {
  modoCurso.value = 'editar'
  cursoSeleccionado.value = curso
  nombreCursoInput.value = curso.nombre
  modalCursoAbierto.value = true
}

const guardarCurso = async () => {
  if (!nombreCursoInput.value.trim()) return
  guardandoCurso.value = true

  if (modoCurso.value === 'crear') {
    const res = await crearCurso({
      aulaId: aula.value.id,
      nombre: nombreCursoInput.value.trim(),
      profesorId: currentUserId.value,
      esAdmin: isAdmin.value
    })
    guardandoCurso.value = false
    if (res.success) {
      modalCursoAbierto.value = false
      mostrarFeedback(true, 'Sección creada correctamente.')
      const resCur = await obtenerCursosAula(aulaId)
      cursos.value = resCur.data || []
    } else {
      mostrarFeedback(false, res.error)
    }
  } else {
    const res = await renombrarCurso({
      cursoId: cursoSeleccionado.value.id,
      nuevoNombre: nombreCursoInput.value.trim(),
      aulaId: aula.value.id,
      profesorId: currentUserId.value,
      esAdmin: isAdmin.value
    })
    guardandoCurso.value = false
    if (res.success) {
      modalCursoAbierto.value = false
      mostrarFeedback(true, 'Sección renombrada correctamente.')
      const resCur = await obtenerCursosAula(aulaId)
      cursos.value = resCur.data || []
    } else {
      mostrarFeedback(false, res.error)
    }
  }
}

const confirmarEliminarCurso = async (curso) => {
  if (!confirm(`¿Eliminar la sección "${curso.nombre}"?`)) return
  const res = await eliminarCurso({
    cursoId: curso.id,
    aulaId: aula.value.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })
  if (res.success) {
    mostrarFeedback(true, 'Sección eliminada.')
    const resCur = await obtenerCursosAula(aulaId)
    cursos.value = resCur.data || []
  } else {
    mostrarFeedback(false, res.error)
  }
}

const abrirModalAsignarEstudiantes = (curso) => {
  cursoSeleccionado.value = curso
  estudiantesSeleccionados.value = [...(curso.estudiantes_ids || [])]
  modalAsignarAbierto.value = true
}

const guardarAsignacionEstudiantes = async () => {
  guardandoAsignacion.value = true
  const res = await actualizarEstudiantesCurso({
    cursoId: cursoSeleccionado.value.id,
    aulaId: aula.value.id,
    estudiantesIds: estudiantesSeleccionados.value
  })
  guardandoAsignacion.value = false

  if (res.success) {
    modalAsignarAbierto.value = false
    mostrarFeedback(true, 'Alumnos de la sección actualizados.')
    const resCur = await obtenerCursosAula(aulaId)
    cursos.value = resCur.data || []
  } else {
    mostrarFeedback(false, res.error)
  }
}

const mostrarFeedback = (exito, mensaje) => {
  feedbackExito.value = exito
  feedbackMensaje.value = mensaje
  setTimeout(() => { feedbackMensaje.value = '' }, 4000)
}

onMounted(() => {
  cargarDatos()
})

// Selección múltiple y retiro de estudiantes (RF102)
const estudiantesSeleccionadosParaEliminar = ref([])
const modalRetiroAbierto = ref(false)
const estudiantesARetirar = ref([])
const procesandoRetiro = ref(false)

const todosSeleccionados = computed(() => {
  return estudiantes.value.length > 0 && estudiantesSeleccionadosParaEliminar.value.length === estudiantes.value.length
})

const alternarSeleccionarTodos = () => {
  if (todosSeleccionados.value) {
    estudiantesSeleccionadosParaEliminar.value = []
  } else {
    estudiantesSeleccionadosParaEliminar.value = estudiantes.value.map(e => e.usuario_id)
  }
}

const abrirConfirmacionEliminarUno = (est) => {
  estudiantesARetirar.value = [est]
  modalRetiroAbierto.value = true
}

const abrirConfirmacionEliminarVarios = () => {
  estudiantesARetirar.value = estudiantes.value.filter(e => 
    estudiantesSeleccionadosParaEliminar.value.includes(e.usuario_id)
  )
  modalRetiroAbierto.value = true
}

const confirmarRetirarEstudiantes = async () => {
  if (estudiantesARetirar.value.length === 0) return
  procesandoRetiro.value = true

  const ids = estudiantesARetirar.value.map(e => e.usuario_id)
  const res = await retirarEstudiantesAula({
    aulaId: aula.value.id,
    estudiantesIds: ids,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })

  procesandoRetiro.value = false
  modalRetiroAbierto.value = false
  estudiantesSeleccionadosParaEliminar.value = []

  if (res.success) {
    mostrarFeedback(true, res.message)
    // Recargar lista de estudiantes y cursos
    await cargarDatos()
  } else {
    mostrarFeedback(false, res.error)
  }
}

// ============================================================================
// RF104: ASIGNACIÓN DE EVALUACIONES (AULA, CURSO, ESTUDIANTE)
// ============================================================================
const modalAsignarEvaluacionAbierto = ref(false)
const evaluacionParaAsignarId = ref('')
const alcanceSeleccionado = ref('aula') // 'aula' | 'curso' | 'estudiante'
const cursoAsignacionId = ref('')
const estudiantesAsignacionIds = ref([])
const guardandoAsignacionEval = ref(false)

const abrirModalAsignar = (ev = null) => {
  if (ev) {
    evaluacionParaAsignarId.value = ev.id
    if (ev.asignaciones && ev.asignaciones.length > 0) {
      const primera = ev.asignaciones[0]
      alcanceSeleccionado.value = primera.alcance
      if (primera.alcance === 'curso') {
        cursoAsignacionId.value = primera.curso_id || ''
      } else if (primera.alcance === 'estudiante') {
        estudiantesAsignacionIds.value = ev.asignaciones.map(a => a.usuario_id).filter(Boolean)
      }
    } else {
      alcanceSeleccionado.value = 'aula'
      cursoAsignacionId.value = ''
      estudiantesAsignacionIds.value = []
    }
  } else {
    evaluacionParaAsignarId.value = evaluaciones.value[0]?.id || ''
    alcanceSeleccionado.value = 'aula'
    cursoAsignacionId.value = ''
    estudiantesAsignacionIds.value = []
  }
  modalAsignarEvaluacionAbierto.value = true
}

const alternarTodosEstudiantesAsignacion = () => {
  if (estudiantesAsignacionIds.value.length === estudiantes.value.length) {
    estudiantesAsignacionIds.value = []
  } else {
    estudiantesAsignacionIds.value = estudiantes.value.map(e => e.usuario_id)
  }
}

const guardarAsignacionEvaluacion = async () => {
  if (!evaluacionParaAsignarId.value) {
    mostrarFeedback(false, 'Selecciona una evaluación para asignar.')
    return
  }
  if (alcanceSeleccionado.value === 'curso' && !cursoAsignacionId.value) {
    mostrarFeedback(false, 'Debes seleccionar un curso o sección.')
    return
  }
  if (alcanceSeleccionado.value === 'estudiante' && estudiantesAsignacionIds.value.length === 0) {
    mostrarFeedback(false, 'Debes seleccionar al menos un estudiante.')
    return
  }

  guardandoAsignacionEval.value = true
  const res = await asignarEvaluacion({
    evaluacionId: evaluacionParaAsignarId.value,
    aulaId,
    alcance: alcanceSeleccionado.value,
    cursoId: cursoAsignacionId.value || null,
    estudiantesIds: estudiantesAsignacionIds.value,
    puedeGestionar: isAdmin.value || isProfesor.value
  })
  guardandoAsignacionEval.value = false

  if (res.success) {
    modalAsignarEvaluacionAbierto.value = false
    const textoAlcance = alcanceSeleccionado.value === 'aula' 
      ? 'a toda el aula'
      : (alcanceSeleccionado.value === 'curso' ? 'a la sección seleccionada' : `a ${estudiantesAsignacionIds.value.length} estudiante(s)`)
    mostrarFeedback(true, `¡Éxito! Evaluación asignada ${textoAlcance}.`)
    
    // Recargar evaluaciones del aula para actualizar inmediatamente los badges
    const resEv = await obtenerEvaluacionesAula(aulaId)
    evaluaciones.value = resEv.data || []
  } else {
    mostrarFeedback(false, res.error || 'Error al guardar asignación.')
  }
}

const obtenerTextoAsignacion = (ev) => {
  const asigs = ev.asignaciones || []
  if (!asigs.length) return 'Sin asignar'
  const primera = asigs[0]
  if (primera.alcance === 'aula') return 'Toda el Aula'
  if (primera.alcance === 'curso') {
    const c = cursos.value.find(cur => cur.id === primera.curso_id)
    return `Curso: ${c ? c.nombre : 'Sección'}`
  }
  if (primera.alcance === 'estudiante') {
    return `${asigs.length} Estudiante${asigs.length > 1 ? 's' : ''}`
  }
  return 'Personalizada'
}

// RF104 Criterio de Aceptación 2: El estudiante ve SOLO las evaluaciones que le corresponden
const evaluacionesVisibles = computed(() => {
  if (isAdmin.value || isProfesor.value) {
    return evaluaciones.value
  }
  // Rol Estudiante: aislar estrictamente las que le tocan
  const misCursosIds = cursos.value
    .filter(c => (c.estudiantes_ids || []).includes(currentUserId.value))
    .map(c => c.id)

  return evaluaciones.value.filter(ev => {
    const asigs = ev.asignaciones || []
    if (!asigs.length) return false
    return asigs.some(a => {
      if (a.alcance === 'aula') return true
      if (a.alcance === 'curso' && misCursosIds.includes(a.curso_id)) return true
      if (a.alcance === 'estudiante' && a.usuario_id === currentUserId.value) return true
      return false
    })
  })
})
</script>

<style scoped>
.aula-detalle-container {
  max-width: 980px;
  margin: 0 auto;
  padding-bottom: 2.5rem;
}

.top-nav-bar {
  margin-bottom: 1rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
}
.back-link:hover {
  text-decoration: underline;
}

/* Hero Header */
.aula-hero {
  padding: 1.5rem;
  border-radius: 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.hero-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.aula-hero-title {
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0;
  color: var(--color-text);
}

.aula-hero-desc {
  color: var(--color-muted);
  font-size: 0.95rem;
  margin: 0.5rem 0 0.75rem 0;
  max-width: 580px;
}

.aula-hero-meta {
  font-size: 0.85rem;
  color: var(--color-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.meta-separator {
  color: var(--color-border);
}

/* Código Hero Card */
.codigo-hero-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.85rem 1rem;
  min-width: 260px;
  text-align: center;
}

.codigo-hero-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--color-muted);
  display: block;
  margin-bottom: 0.25rem;
}

.codigo-hero-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.codigo-hero-display code {
  font-size: 1.35rem;
  font-weight: 800;
  background: #eff6ff;
  color: var(--color-primary);
  padding: 0.2rem 0.6rem;
  border-radius: 0.35rem;
  letter-spacing: 0.08em;
}

.codigo-tachado {
  text-decoration: line-through;
  opacity: 0.5;
}

.btn-copy {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 0.35rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-copy:hover {
  background: #f1f5f9;
}

.codigo-hero-actions {
  display: flex;
  gap: 0.35rem;
  justify-content: center;
}

.btn-code-action {
  font-size: 0.72rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.3rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: white;
}
.btn-warn-action { color: #d97706; }
.btn-success-action { color: #16a34a; }
.btn-invite { background: #eff6ff; color: var(--color-primary); font-weight: 600; }

/* Tabs Bar */
.tabs-nav {
  display: flex;
  border-bottom: 2px solid var(--color-border);
  gap: 0.5rem;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-btn:hover {
  color: var(--color-primary);
}

.tab-btn-active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.tab-badge {
  background: #e2e8f0;
  color: #334155;
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 1rem;
}

.tab-btn-active .tab-badge {
  background: #dbeafe;
  color: var(--color-primary);
}

/* Panel Header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
}

.panel-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
}

.panel-desc {
  font-size: 0.85rem;
  color: var(--color-muted);
  margin: 0.25rem 0 0 0;
}

/* Estudiantes Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.9rem;
}

.data-table th, .data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.data-table th {
  background: #f8fafc;
  font-weight: 600;
  color: var(--color-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.email-code {
  font-size: 0.82rem;
  background: #f1f5f9;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
}

.badge-section {
  background: #e0e7ff;
  color: #3730a3;
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 0.35rem;
}

/* Cursos Grid */
.cursos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.25rem;
}

.curso-detail-card {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
}

.curso-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.curso-name {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
}

.curso-actions-btn-group {
  display: flex;
  gap: 0.25rem;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
}
.btn-icon:hover {
  background: #f1f5f9;
}

.badge-students-count {
  background: #eff6ff;
  color: var(--color-primary);
  font-size: 0.8rem;
  padding: 0.25rem 0.6rem;
  border-radius: 0.5rem;
}

.curso-assigned-list {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  flex-grow: 1;
}

.assigned-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-muted);
  display: block;
  margin-bottom: 0.35rem;
}

.assigned-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.student-tag {
  background: #f1f5f9;
  padding: 0.2rem 0.5rem;
  border-radius: 0.35rem;
  font-size: 0.78rem;
}

/* Evaluaciones Grid */
.evaluaciones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1.25rem;
}

.eval-card {
  padding: 1.25rem;
}

.eval-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.eval-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.eval-desc {
  font-size: 0.85rem;
  color: var(--color-muted);
  line-height: 1.45;
  margin-bottom: 1rem;
}

.eval-meta-row {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--color-muted);
  border-top: 1px solid var(--color-border);
  padding-top: 0.75rem;
  flex-wrap: wrap;
}

/* Modales */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}

.modal-card {
  background: var(--color-surface);
  border-radius: 0.75rem;
  max-width: 480px;
  width: 100%;
  padding: 1.75rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
}

.modal-card-lg {
  max-width: 600px;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.modal-subtitle {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: 1rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.students-checkbox-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem;
  border-radius: 0.35rem;
  cursor: pointer;
}
.checkbox-item:hover {
  background: #f8fafc;
}

.checkbox-item p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-muted);
}

/* Denied state */
.access-denied-card {
  text-align: center;
  padding: 3rem 1.5rem;
  max-width: 500px;
  margin: 3rem auto;
}

.access-denied-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.access-denied-title {
  font-size: 1.35rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
  color: #dc2626;
}

.access-denied-desc {
  color: var(--color-muted);
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--color-muted);
}

.text-muted-small {
  font-size: 0.8rem;
  color: var(--color-muted);
}

/* ======================================================== */
/* ESTILOS MODERNOS Y VISUALES: EVALUACIONES Y PANEL        */
/* ======================================================== */
.evaluaciones-list-view {
  display: flex;
  flex-direction: column;
}

.eval-card-modern {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.eval-card-modern:hover {
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}

.eval-card-badge-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.eval-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-activa {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.status-borrador {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.eval-tag-tipo {
  font-size: 0.72rem;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.eval-card-title {
  font-size: 1.12rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 0.45rem 0;
  line-height: 1.35;
}

.eval-card-desc {
  font-size: 0.86rem;
  color: #475569;
  line-height: 1.5;
  margin: 0 0 1rem 0;
}

.eval-card-meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.15rem;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.76rem;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.25rem 0.55rem;
  border-radius: 6px;
}

.eval-card-footer {
  border-top: 1px solid #f1f5f9;
  padding-top: 0.85rem;
}

.btn-eval-accion {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: #0284c7;
  color: #ffffff;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-eval-accion:hover {
  background: #0369a1;
}

/* Panel Desempeño */
.btn-regresar-eval {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: transparent;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-regresar-eval:hover {
  background: #f1f5f9;
}

.badge-docente-header {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
  font-weight: 700;
  padding: 0.3rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.78rem;
}

.eval-hero-card {
  padding: 1.35rem 1.6rem;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.eval-hero-title {
  font-size: 1.38rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.35rem 0;
}

.eval-hero-desc {
  font-size: 0.88rem;
  color: #475569;
  margin: 0 0 1rem 0;
  line-height: 1.45;
}

.confidencialidad-banner {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 0.8rem 1rem;
}

.confidencialidad-icon-wrap {
  flex-shrink: 0;
  margin-top: 2px;
}

.confidencialidad-content {
  font-size: 0.82rem;
  color: #0369a1;
  line-height: 1.5;
}

.confidencialidad-content strong {
  color: #0c4a6e;
  margin-right: 0.35rem;
}

/* KPI Cards */
.kpi-metricas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.kpi-card {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-top: 3px solid;
  border-radius: 0.75rem;
  padding: 1rem 1.15rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.kpi-blue { border-top-color: #0284c7; }
.kpi-green { border-top-color: #16a34a; }
.kpi-indigo { border-top-color: #6366f1; }
.kpi-teal { border-top-color: #0d9488; }

.kpi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
}

.kpi-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
  color: #64748b;
}

.kpi-icon {
  color: #94a3b8;
}

.kpi-value {
  font-size: 1.65rem;
  font-weight: 800;
  line-height: 1.2;
  margin-bottom: 0.25rem;
}

.text-blue { color: #0284c7; }
.text-green { color: #16a34a; }
.text-indigo { color: #6366f1; }
.text-teal { color: #0d9488; }

.kpi-subtext {
  font-size: 0.75rem;
  color: #64748b;
}

/* Tabla Estudiantes */
.estudiantes-eval-seccion {
  padding: 1.25rem 1.5rem;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.seccion-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.seccion-eval-title {
  font-size: 1.12rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 0.2rem 0;
}

.seccion-eval-desc {
  font-size: 0.82rem;
  color: #64748b;
  margin: 0;
}

.total-evaluados-pill {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
}

.data-table-modern {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.data-table-modern th {
  text-align: left;
  padding: 0.75rem 1rem;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  font-weight: 700;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.data-table-modern td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.data-table-modern tr:hover td {
  background: #fafafa;
}

.student-profile-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.student-avatar-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 700;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid #bae6fd;
}

.student-name-group {
  display: flex;
  flex-direction: column;
}

.student-name {
  font-size: 0.9rem;
  color: #0f172a;
  font-weight: 700;
}

.student-email {
  font-size: 0.75rem;
  color: #64748b;
  font-family: monospace;
}

.score-display-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 100px;
}

.score-header-val {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.score-percentage {
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
}

.score-points {
  font-size: 0.74rem;
  color: #64748b;
}

.score-progress-bar {
  height: 5px;
  width: 90px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.score-progress-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.badge-nivel-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.nivel-logrado {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.nivel-medianamente_logrado {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}

.nivel-no_logrado {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.nivel-default {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.medicion-cell-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.medicion-val-chip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.25rem 0.5rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
}

.btn-ver-ppg {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #0369a1;
  padding: 0.25rem 0.55rem;
  border-radius: 6px;
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-ver-ppg:hover {
  background: #f0f9ff;
  border-color: #7dd3fc;
}

.btn-ver-respuestas {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #0284c7;
  border: none;
  color: #ffffff;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-ver-respuestas:hover {
  background: #0369a1;
}

/* Modales Personalizados y Espaciosos */
.modal-card-xl {
  max-width: 860px;
  width: 95%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 1.85rem 2.25rem;
  border-radius: 1rem;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.28);
  overflow: hidden;
}

.avatar-lg {
  width: 44px;
  height: 44px;
  font-size: 1rem;
}

.modal-header-custom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-close-modal {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-close-modal:hover {
  color: #0f172a;
  background: #f1f5f9;
}

/* Modal Respuestas */
.revision-score-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem 1.4rem;
  gap: 1.25rem;
}

.score-banner-block {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.score-banner-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  font-weight: 700;
}

.score-banner-value-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.score-banner-number {
  font-size: 1.6rem;
  font-weight: 800;
  color: #0284c7;
  line-height: 1;
}

.score-mini-track {
  width: 75px;
  height: 7px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.score-mini-fill {
  height: 100%;
  border-radius: 9999px;
}

.score-banner-divider {
  width: 1px;
  height: 44px;
  background: #e2e8f0;
}

.score-banner-pts {
  font-size: 1.15rem;
  color: #0f172a;
}

.pts-total {
  font-size: 0.82rem;
  color: #64748b;
  font-weight: normal;
}

.score-banner-correctas {
  font-size: 0.78rem;
  color: #16a34a;
  font-weight: 600;
}

.badge-nivel-lg {
  padding: 0.35rem 0.85rem;
  font-size: 0.82rem;
}

.score-banner-eval-desc {
  font-size: 0.72rem;
  color: #94a3b8;
}

.revision-preguntas-container {
  overflow-y: auto;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-right: 0.5rem;
}

.revision-preguntas-container::-webkit-scrollbar {
  width: 6px;
}

.revision-preguntas-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 9999px;
}

.pregunta-revision-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-left: 5px solid;
  border-radius: 0.75rem;
  padding: 1.15rem 1.35rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  transition: box-shadow 0.15s ease;
}

.card-correcta {
  border-left-color: #16a34a;
}

.card-incorrecta {
  border-left-color: #dc2626;
}

.pregunta-revision-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.55rem;
}

.pregunta-badge-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.pregunta-numero-pill {
  background: #f1f5f9;
  color: #334155;
  font-weight: 700;
  font-size: 0.76rem;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
}

.pregunta-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
}

.badge-ok {
  background: #ecfdf5;
  color: #065f46;
}

.badge-bad {
  background: #fef2f2;
  color: #991b1b;
}

.pregunta-puntos-tag {
  font-weight: 800;
  font-size: 0.88rem;
  padding: 0.2rem 0.65rem;
  border-radius: 6px;
}

.tag-puntos-ok {
  background: #ecfdf5;
  color: #047857;
}

.tag-puntos-bad {
  background: #fef2f2;
  color: #b91c1c;
}

.pregunta-enunciado {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 0.75rem 0;
  line-height: 1.45;
}

.respuesta-box-layout {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.respuesta-row-item {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.65rem 0.9rem;
  border-radius: 6px;
  font-size: 0.88rem;
}

.row-correcta {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.row-incorrecta {
  background: #fef2f2;
  border: 1px solid #fee2e2;
}

.row-solucion {
  background: #ecfdf5;
  border: 1px solid #d1fae5;
}

.respuesta-label-col {
  min-width: 180px;
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 600;
}

.label-esperada {
  color: #047857;
}

.val-txt {
  color: #0f172a;
  font-size: 0.92rem;
}

.val-esperada {
  color: #047857;
}

/* Modal Bioseñal Ampliado */
.bioseñal-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.bioseñal-stat-card {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 0.95rem 1.15rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.card-frecuencia {
  border-top: 3px solid #0f172a;
}

.card-spo2 {
  border-top: 3px solid #0284c7;
}

.card-perfusion {
  border-top: 3px solid #0d9488;
}

.bioseñal-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
}

.bioseñal-stat-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.badge-subtle-success {
  background: #ecfdf5;
  color: #047857;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
}

.badge-subtle-info {
  background: #f0f9ff;
  color: #0284c7;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
}

.badge-subtle-teal {
  background: #f0fdfa;
  color: #0d9488;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
}

.bioseñal-stat-val {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.2;
}

.unit-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
}

.bioseñal-subdesc {
  font-size: 0.74rem;
  color: #64748b;
  margin-top: 0.25rem;
}

.sensor-spec-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.65rem 1rem;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: #334155;
}

.spec-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.spec-label {
  color: #64748b;
}

.spec-divider {
  width: 1px;
  height: 18px;
  background: #cbd5e1;
}

.signal-conforme-item {
  color: #047857;
}

.pulse-indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
  display: inline-block;
  margin-right: 0.3rem;
}

.oscilloscope-container {
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem 0.75rem 1.25rem;
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5);
}

.oscilloscope-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.osc-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.osc-channel-name {
  color: #38bdf8;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  font-family: monospace;
}

.osc-rate {
  color: #64748b;
  font-size: 0.72rem;
  font-family: monospace;
}

.osc-features-legend {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.72rem;
  color: #94a3b8;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.peak-dot { background: #38bdf8; }
.notch-dot { background: #fbbf24; }
.wave-dot { background: #34d399; }

.oscilloscope-screen {
  width: 100%;
  border-radius: 6px;
  overflow: hidden;
}

.oscilloscope-svg {
  width: 100%;
  height: 160px;
  display: block;
}

.oscilloscope-timeline {
  display: flex;
  justify-content: space-between;
  color: #64748b;
  font-size: 0.7rem;
  font-family: monospace;
  margin-top: 0.4rem;
  padding: 0 0.25rem;
}

/* RF104: Estilos para asignaciones de evaluaciones */
.alcance-options-grid {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.4rem;
}
.alcance-option-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.15s ease;
}
.alcance-option-card:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}
.alcance-option-card.activo {
  border-color: #0284c7;
  background: #f0f9ff;
}
.alcance-info strong {
  display: block;
  font-size: 0.9rem;
  color: #0f172a;
}
.alcance-info p {
  margin: 0.15rem 0 0 0;
  font-size: 0.78rem;
  color: #64748b;
}
.alcance-subseccion {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 0.85rem;
  margin-top: 0.5rem;
}
.badge-asignacion {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.badge-asig-aula {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}
.badge-asig-curso {
  background: #f5f3ff;
  color: #6d28d9;
  border: 1px solid #ddd6fe;
}
.badge-asig-estudiante {
  background: #fdf2f8;
  color: #be185d;
  border: 1px solid #fbcfe8;
}
.badge-asig-ninguno {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
</style>