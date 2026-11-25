-- sensor_pulso · RF56: clasificación de los datos (públicos, privados, sensibles de salud)
--
-- La tabla public.clasificacion_datos ya existía con solo 10 columnas clasificadas. Esta migración:
--   1. Agrega la regla de integridad: solo un dato sensible de salud puede llevar cifrado por campo.
--   2. Completa el catálogo con todas las columnas que contienen datos de personas, de salud o públicos
--      (no pisa lo que un administrador ya haya cambiado: on conflict do nothing).
--   3. resumen_clasificacion(): totales por clase, cobertura y columnas del catálogo que ya no existen.
--   4. columnas_sin_clasificar(): columnas de la base que todavía no están en el catálogo.
-- Las columnas técnicas (id, claves foráneas «..._id», autores «..._por» y marcas de tiempo «..._en») no se clasifican.
-- El tratamiento de cada clase (quién accede, cifrado, publicación, conservación) está descrito en
-- src/data/clasificacionDatos.js y se muestra al administrador y a las personas usuarias.

-- ---------------------------------------------------------------- 1. integridad
alter table public.clasificacion_datos
  drop constraint if exists clasificacion_cifrado_solo_sensible;
alter table public.clasificacion_datos
  add constraint clasificacion_cifrado_solo_sensible
  check (not cifrado_campo or clase = 'sensible_salud');

-- ---------------------------------------------------------------- 2. catálogo completo
insert into public.clasificacion_datos (tabla, columna, clase, cifrado_campo, enmascarar) values
  -- Cuentas y perfiles: datos personales
  ('perfiles', 'correo', 'privado', false, true),
  ('perfiles', 'nombre', 'privado', false, true),
  ('perfiles', 'rol', 'privado', false, false),
  ('perfiles', 'es_admin', 'privado', false, false),
  ('perfiles', 'mfa_requerido', 'privado', false, false),
  ('perfiles', 'politica_version', 'privado', false, false),
  ('consentimientos_aceptados', 'version', 'privado', false, false),
  ('solicitudes_derechos', 'tipo', 'privado', false, false),
  ('solicitudes_derechos', 'detalle', 'privado', false, false),
  ('solicitudes_derechos', 'estado', 'privado', false, false),
  ('solicitudes_derechos', 'respuesta', 'privado', false, false),
  ('invitaciones_aula', 'correo', 'privado', false, true),

  -- Ficha declarada y mediciones: datos de salud
  ('declaraciones_paciente', 'nombre', 'privado', false, true),
  ('declaraciones_paciente', 'edad', 'privado', false, false),
  ('declaraciones_paciente', 'datos_cifrados', 'sensible_salud', true, true),
  ('declaraciones_paciente', 'clave_version', 'privado', false, false),
  ('declaraciones_paciente', 'canal', 'privado', false, false),
  ('mediciones', 'edad_al_medir', 'privado', false, false),
  ('mediciones', 'fuente', 'privado', false, false),
  ('mediciones', 'canal', 'privado', false, false),
  ('mediciones', 'estado_conexion', 'privado', false, false),
  ('mediciones', 'publica', 'privado', false, false),
  ('mediciones', 'id_cliente', 'privado', false, false),
  ('mediciones', 'consentimiento_version', 'privado', false, false),
  ('mediciones', 'inicio', 'sensible_salud', false, false),
  ('mediciones', 'fin', 'sensible_salud', false, false),
  ('mediciones', 'duracion_s', 'sensible_salud', false, false),
  ('mediciones', 'es_reposo_inicial', 'sensible_salud', false, false),
  ('mediciones', 'bpm_promedio', 'sensible_salud', false, false),
  ('mediciones', 'spo2_promedio', 'sensible_salud', false, false),
  ('mediciones', 'hrv_rmssd_ms', 'sensible_salud', false, false),
  ('mediciones', 'regularidad', 'sensible_salud', false, false),
  ('mediciones', 'ritmo', 'sensible_salud', false, false),
  ('mediciones', 'explicacion_ritmo', 'sensible_salud', false, false),
  ('mediciones', 'interpretacion', 'sensible_salud', false, false),
  ('mediciones', 'calidad', 'sensible_salud', false, false),
  ('mediciones', 'causa_calidad', 'sensible_salud', false, false),
  ('mediciones', 'dentro_de_rango', 'sensible_salud', false, false),
  ('mediciones', 'nota', 'sensible_salud', false, false),
  ('lecturas', 't', 'sensible_salud', false, false),
  ('lecturas', 'bpm', 'sensible_salud', false, false),
  ('lecturas', 'spo2', 'sensible_salud', false, false),
  ('lecturas', 'calidad', 'sensible_salud', false, false),
  ('bloques_senal', 't_inicio_ms', 'sensible_salud', false, false),
  ('bloques_senal', 'frecuencia_hz', 'sensible_salud', false, false),
  ('bloques_senal', 'ir', 'sensible_salud', false, false),
  ('bloques_senal', 'rojo', 'sensible_salud', false, false),
  ('comparaciones', 'metodo_sync', 'sensible_salud', false, false),
  ('comparaciones', 'desfase_ms', 'sensible_salud', false, false),
  ('comparaciones', 'similitud', 'sensible_salud', false, false),
  ('comparaciones', 'diferencia_bpm', 'sensible_salud', false, false),
  ('comparaciones', 'analisis', 'sensible_salud', false, false),
  ('alertas', 'tipo', 'sensible_salud', false, false),
  ('alertas', 'valor', 'sensible_salud', false, false),
  ('alertas', 'limite', 'privado', false, false),
  ('alertas', 'sonora', 'privado', false, false),

  -- Aulas y evaluaciones: datos académicos de personas
  ('aulas', 'nombre', 'privado', false, false),
  ('aulas', 'descripcion', 'privado', false, false),
  ('aulas', 'codigo', 'privado', false, false),
  ('aulas', 'codigo_activo', 'privado', false, false),
  ('aulas', 'max_estudiantes', 'privado', false, false),
  ('aulas', 'archivada', 'privado', false, false),
  ('evaluaciones', 'titulo', 'privado', false, false),
  ('evaluaciones', 'descripcion', 'privado', false, false),
  ('evaluaciones', 'tipo', 'privado', false, false),
  ('evaluaciones', 'modo', 'privado', false, false),
  ('evaluaciones', 'estado', 'privado', false, false),
  ('evaluaciones', 'tiempo_limite_s', 'privado', false, false),
  ('evaluaciones', 'umbral_logrado', 'privado', false, false),
  ('evaluaciones', 'umbral_medio', 'privado', false, false),
  ('evaluaciones', 'max_reintentos', 'privado', false, false),
  ('intentos_evaluacion', 'inicio', 'privado', false, false),
  ('intentos_evaluacion', 'fin', 'privado', false, false),
  ('intentos_evaluacion', 'puntaje', 'privado', false, false),
  ('intentos_evaluacion', 'puntaje_maximo', 'privado', false, false),
  ('intentos_evaluacion', 'porcentaje', 'privado', false, false),
  ('intentos_evaluacion', 'nivel', 'privado', false, false),
  ('intentos_evaluacion', 'conectado', 'privado', false, false),
  ('intentos_evaluacion', 'similitud', 'privado', false, false),
  ('intentos_evaluacion', 'criterio_cumplido', 'privado', false, false),
  ('intentos_evaluacion', 'calificaciones', 'privado', false, false),
  ('intentos_evaluacion', 'valor_obtenido', 'sensible_salud', false, false),
  ('respuestas', 'respuesta', 'privado', false, false),
  ('respuestas', 'es_correcta', 'privado', false, false),
  ('respuestas', 'puntaje', 'privado', false, false),

  -- Dispositivos, sesiones y seguridad: datos técnicos privados
  ('dispositivos', 'nombre', 'privado', false, false),
  ('dispositivos', 'token_hash', 'privado', false, true),
  ('dispositivos', 'canales', 'privado', false, false),
  ('dispositivos', 'activo', 'privado', false, false),
  ('dispositivos', 'ultimo_contacto', 'privado', false, false),
  ('sesiones_medicion', 'ronda', 'privado', false, false),
  ('sesiones_medicion', 'estado', 'privado', false, false),
  ('sesiones_medicion', 'motivo_fin', 'privado', false, false),
  ('sesiones_medicion', 'inicio', 'privado', false, false),
  ('sesiones_medicion', 'fin', 'privado', false, false),
  ('sesiones_medicion', 'ultimo_latido', 'privado', false, false),
  ('auditoria', 'accion', 'privado', false, false),
  ('auditoria', 'entidad', 'privado', false, false),
  ('auditoria', 'detalle', 'privado', false, false),
  ('auditoria', 'ip', 'privado', false, true),
  ('auditoria', 'sospechoso', 'privado', false, false),
  ('intentos_login', 'correo', 'privado', false, true),
  ('intentos_login', 'ip', 'privado', false, true),
  ('intentos_login', 'exitoso', 'privado', false, false),
  ('incidentes', 'titulo', 'privado', false, false),
  ('incidentes', 'descripcion', 'privado', false, false),
  ('incidentes', 'severidad', 'privado', false, false),
  ('incidentes', 'estado', 'privado', false, false),
  ('incidentes', 'afecta_datos_personales', 'privado', false, false),

  -- Contenido público: se muestra a cualquier persona, con o sin sesión
  ('publicaciones', 'titulo', 'publico', false, false),
  ('publicaciones', 'token_enlace', 'publico', false, false),
  ('publicaciones', 'rango_edad', 'publico', false, false),
  ('publicaciones', 'ritmo', 'publico', false, false),
  ('publicaciones', 'calidad', 'publico', false, false),
  ('publicaciones', 'bpm_promedio', 'publico', false, false),
  ('publicaciones', 'spo2_promedio', 'publico', false, false),
  ('publicaciones', 'dentro_de_rango', 'publico', false, false),
  ('lecciones', 'slug', 'publico', false, false),
  ('lecciones', 'titulo', 'publico', false, false),
  ('lecciones', 'categoria', 'publico', false, false),
  ('lecciones', 'contenido', 'publico', false, false),
  ('lecciones', 'orden', 'publico', false, false),
  ('lecciones', 'publicada', 'publico', false, false),
  ('rangos', 'edad_min', 'publico', false, false),
  ('rangos', 'edad_max', 'publico', false, false),
  ('rangos', 'bpm_min', 'publico', false, false),
  ('rangos', 'bpm_max', 'publico', false, false),
  ('rangos', 'spo2_min', 'publico', false, false),
  ('rangos', 'spo2_max', 'publico', false, false),
  ('rangos', 'vigente', 'publico', false, false),
  ('actividades', 'codigo', 'publico', false, false),
  ('actividades', 'nombre', 'publico', false, false),
  ('actividades', 'descripcion', 'publico', false, false),
  ('actividades', 'activa', 'publico', false, false),
  ('datasets_publicos', 'nombre', 'publico', false, false),
  ('datasets_publicos', 'fuente', 'publico', false, false),
  ('datasets_publicos', 'url', 'publico', false, false),
  ('datasets_publicos', 'licencia', 'publico', false, false),
  ('datasets_publicos', 'descripcion', 'publico', false, false),
  ('senales_referencia', 'tipo', 'publico', false, false),
  ('senales_referencia', 'nombre', 'publico', false, false),
  ('senales_referencia', 'descripcion', 'publico', false, false),
  ('senales_referencia', 'explicacion', 'publico', false, false),
  ('senales_referencia', 'frecuencia_hz', 'publico', false, false),
  ('senales_referencia', 'ppg', 'publico', false, false),
  ('senales_referencia', 'ecg_ref', 'publico', false, false),
  ('senales_referencia', 'bpm_referencia', 'publico', false, false),
  ('senales_referencia', 'ritmo', 'publico', false, false),
  ('senales_referencia', 'edad_min', 'publico', false, false),
  ('senales_referencia', 'edad_max', 'publico', false, false),
  ('senales_referencia', 'aprobada', 'publico', false, false),
  ('documentos_legales', 'clave', 'publico', false, false),
  ('documentos_legales', 'titulo', 'publico', false, false),
  ('documentos_legales', 'contenido', 'publico', false, false),
  ('documentos_legales', 'version', 'publico', false, false),

  -- Resto de la base: configuración, banco de preguntas, seguridad y contenido de apoyo,
  ('bloques_senal', 'orden', 'sensible_salud', false, false),
  ('evaluaciones', 'ejercicio', 'privado', false, false),
  ('evaluaciones', 'criterio', 'privado', false, false),
  ('evaluaciones', 'precargada', 'privado', false, false),
  ('intentos_evaluacion', 'ultimo_heartbeat', 'privado', false, false),
  ('intentos_evaluacion', 'detalle', 'privado', false, false),
  ('documentos_legales', 'vigente_desde', 'publico', false, false),
  ('admins_iniciales', 'correo', 'privado', false, true),
  ('permisos_profesor', 'crear_aulas', 'privado', false, false),
  ('permisos_profesor', 'publicar_galeria', 'privado', false, false),
  ('permisos_profesor', 'compartir_banco', 'privado', false, false),
  ('permisos_profesor', 'editar_rangos', 'privado', false, false),
  ('permisos_profesor', 'editar_contenidos', 'privado', false, false),
  ('consentimientos_version', 'version', 'publico', false, false),
  ('consentimientos_version', 'texto', 'publico', false, false),
  ('consentimientos_version', 'finalidad', 'publico', false, false),
  ('consentimientos_version', 'datos_recogidos', 'publico', false, false),
  ('consentimientos_version', 'responsable', 'publico', false, false),
  ('consentimientos_version', 'plazo_conservacion', 'publico', false, false),
  ('consentimientos_version', 'vigente_desde', 'publico', false, false),
  ('consentimientos_version', 'activa', 'publico', false, false),
  ('propuestas_cambio', 'tipo', 'privado', false, false),
  ('propuestas_cambio', 'propuesta', 'privado', false, false),
  ('propuestas_cambio', 'motivo', 'privado', false, false),
  ('propuestas_cambio', 'estado', 'privado', false, false),
  ('config_plataforma', 'clave', 'privado', false, false),
  ('config_plataforma', 'valor', 'privado', false, false),
  ('cursos', 'nombre', 'privado', false, false),
  ('aula_estudiantes', 'estado', 'privado', false, false),
  ('sesion_canales', 'canal', 'privado', false, false),
  ('sesion_canal_requisitos', 'canal', 'privado', false, false),
  ('sesion_canal_requisitos', 'politica_version', 'privado', false, false),
  ('sesion_canal_requisitos', 'consentimiento_version', 'privado', false, false),
  ('preguntas', 'enunciado', 'privado', false, false),
  ('preguntas', 'tipo', 'privado', false, false),
  ('preguntas', 'opciones', 'privado', false, false),
  ('preguntas', 'puntaje', 'privado', false, false),
  ('preguntas', 'etiquetas', 'privado', false, false),
  ('preguntas', 'compartida', 'privado', false, false),
  ('preguntas', 'revision_global', 'privado', false, false),
  ('preguntas_claves', 'correcta', 'privado', false, false),
  ('preguntas_claves', 'explicacion', 'privado', false, false),
  ('evaluacion_preguntas', 'orden', 'privado', false, false),
  ('evaluacion_preguntas', 'puntaje', 'privado', false, false),
  ('evaluacion_asignaciones', 'alcance', 'privado', false, false),
  ('evaluacion_ejercicios', 'orden', 'privado', false, false),
  ('evaluacion_ejercicios', 'ejercicio', 'privado', false, false),
  ('evaluacion_ejercicios', 'criterio', 'privado', false, false),
  ('evaluacion_ejercicios', 'puntaje', 'privado', false, false),
  ('intento_ejercicios', 'puntaje', 'privado', false, false),
  ('intento_ejercicios', 'puntaje_maximo', 'privado', false, false),
  ('intento_ejercicios', 'porcentaje', 'privado', false, false),
  ('intento_ejercicios', 'similitud', 'privado', false, false),
  ('intento_ejercicios', 'criterio_cumplido', 'privado', false, false),
  ('intento_ejercicios', 'detalle', 'privado', false, false),
  ('intento_ejercicios', 'calificaciones', 'privado', false, false),
  ('intento_ejercicios', 'valor_obtenido', 'sensible_salud', false, false),
  ('rangos_personales', 'bpm_min', 'sensible_salud', false, false),
  ('rangos_personales', 'bpm_max', 'sensible_salud', false, false),
  ('rangos_personales', 'spo2_min', 'sensible_salud', false, false),
  ('rangos_personales', 'spo2_max', 'sensible_salud', false, false),
  ('rangos_personales', 'edad_min', 'privado', false, false),
  ('rangos_personales', 'edad_max', 'privado', false, false),
  ('progreso_lecciones', 'completada', 'privado', false, false),
  ('progreso_lecciones', 'mejor_puntaje', 'privado', false, false),
  ('insignias', 'codigo', 'publico', false, false),
  ('insignias', 'nombre', 'publico', false, false),
  ('insignias', 'descripcion', 'publico', false, false),
  ('insignias', 'criterio', 'publico', false, false),
  ('bloqueos_cuenta', 'correo', 'privado', false, true),
  ('bloqueos_cuenta', 'ip', 'privado', false, true),
  ('bloqueos_cuenta', 'bloqueado_hasta', 'privado', false, false),
  ('bloqueos_cuenta', 'motivo', 'privado', false, false),
  ('limites_peticiones', 'clave', 'privado', false, true),
  ('limites_peticiones', 'ventana', 'privado', false, false),
  ('limites_peticiones', 'contador', 'privado', false, false),
  ('notificaciones_seguridad', 'tipo', 'privado', false, false),
  ('notificaciones_seguridad', 'severidad', 'privado', false, false),
  ('notificaciones_seguridad', 'mensaje', 'privado', false, false),
  ('notificaciones_seguridad', 'detalle', 'privado', false, false),
  ('notificaciones_seguridad', 'leida', 'privado', false, false),
  ('brechas', 'afectados_estimados', 'privado', false, false),
  ('brechas', 'datos_comprometidos', 'privado', false, false),
  ('brechas', 'medidas', 'privado', false, false),
  ('incidentes', 'lecciones', 'privado', false, false),
  ('incidentes', 'asignado_a', 'privado', false, false),
  ('clasificacion_datos', 'tabla', 'privado', false, false),
  ('clasificacion_datos', 'columna', 'privado', false, false),
  ('clasificacion_datos', 'clase', 'privado', false, false),
  ('clasificacion_datos', 'cifrado_campo', 'privado', false, false),
  ('clasificacion_datos', 'enmascarar', 'privado', false, false),
  ('politicas_retencion', 'tabla', 'privado', false, false),
  ('politicas_retencion', 'dias', 'privado', false, false),
  ('politicas_retencion', 'accion', 'privado', false, false),
  ('politicas_retencion', 'activa', 'privado', false, false)
on conflict (tabla, columna) do nothing;

-- ---------------------------------------------------------------- 3. cobertura: columnas sin clasificar
create or replace function public.columnas_sin_clasificar()
returns table (tabla text, columna text, tipo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede consultar la clasificación' using errcode = '42501';
  end if;

  return query
  select c.table_name::text, c.column_name::text, c.data_type::text
    from information_schema.columns as c
    join information_schema.tables as t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
   where c.table_schema = 'public'
     and c.column_name !~ '(^id$|_id$|_en$|_por$)'     -- columnas técnicas: no se clasifican
     and not exists (
       select 1 from public.clasificacion_datos as k
        where k.tabla = c.table_name and k.columna = c.column_name
     )
   order by c.table_name, c.ordinal_position;
end;
$$;

revoke all on function public.columnas_sin_clasificar() from public, anon;
grant execute on function public.columnas_sin_clasificar() to authenticated;

-- ---------------------------------------------------------------- resumen para el panel del administrador
create or replace function public.resumen_clasificacion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_por_clase jsonb;
  v_total integer;
  v_cifrados integer;
  v_enmascaradas integer;
  v_sin_clasificar integer;
  v_huerfanas jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede consultar la clasificación' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(x.clase, x.n), '{}'::jsonb), coalesce(sum(x.n), 0)
    into v_por_clase, v_total
    from (select k.clase, count(*) as n from public.clasificacion_datos as k group by k.clase) as x;

  select count(*) filter (where k.cifrado_campo), count(*) filter (where k.enmascarar)
    into v_cifrados, v_enmascaradas
    from public.clasificacion_datos as k;

  select count(*) into v_sin_clasificar from public.columnas_sin_clasificar();

  -- Filas del catálogo cuya columna ya no existe en la base (por ejemplo, tras renombrarla)
  select coalesce(jsonb_agg(k.tabla || '.' || k.columna order by k.tabla, k.columna), '[]'::jsonb)
    into v_huerfanas
    from public.clasificacion_datos as k
   where not exists (
     select 1 from information_schema.columns as c
      where c.table_schema = 'public' and c.table_name = k.tabla and c.column_name = k.columna
   );

  return jsonb_build_object(
    'total', v_total,
    'por_clase', v_por_clase,
    'cifrados', v_cifrados,
    'enmascaradas', v_enmascaradas,
    'sin_clasificar', v_sin_clasificar,
    'huerfanas', v_huerfanas
  );
end;
$$;

revoke all on function public.resumen_clasificacion() from public, anon;
grant execute on function public.resumen_clasificacion() to authenticated;

comment on function public.resumen_clasificacion() is
  'RF56: totales por clase de dato, cobertura del catálogo y filas huérfanas (solo administrador con MFA)';
