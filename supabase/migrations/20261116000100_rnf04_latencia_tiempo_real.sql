-- ============================================================================
-- sensor_pulso · Migración RNF04: Latencia Baja en Tiempo Real (Hasta 100 Alumnos)
-- ============================================================================
-- Requerimiento RNF04:
-- "Tiempo real con latencia baja, incluso con hasta 100 estudiantes respondiendo a la vez."
--
-- Optimizaciones:
--   1. Índices compuestos de alta concurrencia para lecturas y agregación rápida.
--   2. Optimización de la función RPC obtener_avance_en_vivo_rf113:
--      Reemplaza subconsultas correlacionadas en bucle por agregación agrupada (GROUP BY)
--      reduciendo el tiempo de cálculo de O(N) a O(1) con 100 estudiantes.
-- ============================================================================

-- 1. Índices compuestos para acelerar conteo y ordenamiento en tiempo real
create index if not exists respuestas_intento_respondida_idx
  on public.respuestas (intento_id, respondida_en desc);

create index if not exists respuestas_intento_pregunta_idx
  on public.respuestas (intento_id, pregunta_id);

create index if not exists intentos_eval_avance_vivo_idx
  on public.intentos_evaluacion (evaluacion_id, fin, conectado, ultimo_heartbeat desc);

-- 2. Función RPC optimizada para baja latencia con hasta 100 estudiantes simultáneos
create or replace function public.obtener_avance_en_vivo_rf113(
  p_evaluacion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eval record;
  v_total_preguntas integer := 0;
  v_total_asignados integer := 0;
  v_total_respuestas integer := 0;
  v_conectados integer := 0;
  v_en_progreso integer := 0;
  v_finalizados integer := 0;
  v_estudiantes jsonb := '[]'::jsonb;
  v_avance_global numeric(5,2) := 0;
begin
  -- 1. Validar que la evaluación existe y que el solicitante es profesor del aula o admin
  select e.id, e.aula_id, e.titulo, e.tipo, e.modo, e.estado, e.tiempo_limite_s, e.iniciada_en
    into v_eval
    from public.evaluaciones e
   where e.id = p_evaluacion_id;

  if not found then
    raise exception 'Evaluación no encontrada' using errcode = 'P0002';
  end if;

  if not (public.profesor_de_evaluacion(p_evaluacion_id) or public.es_admin()) then
    raise exception 'Solo el profesor del aula puede ver el avance en vivo.' using errcode = '42501';
  end if;

  -- 2. Cantidad de preguntas de la evaluación
  select count(*)::integer into v_total_preguntas
    from public.evaluacion_preguntas
   where evaluacion_id = p_evaluacion_id;

  -- 3. Estudiantes asignados y conteo de respuestas optimizado por pre-agrupación (RNF04)
  with estudiantes_elegibles as (
    select distinct m.usuario_id, p.nombre, p.correo
      from public.aula_estudiantes m
      join public.perfiles p on p.id = m.usuario_id
      join public.evaluaciones e on e.aula_id = m.aula_id
      join public.evaluacion_asignaciones a on a.evaluacion_id = e.id
     where e.id = p_evaluacion_id
       and m.estado = 'activo'
       and (
         a.alcance = 'aula'
         or (a.alcance = 'estudiante' and a.usuario_id = m.usuario_id)
         or (a.alcance = 'curso' and exists (
               select 1 from public.curso_estudiantes c
                where c.curso_id = a.curso_id and c.usuario_id = m.usuario_id
            ))
       )
  ),
  respuestas_conteo as (
    select r.intento_id, count(*)::integer as total_respuestas
      from public.respuestas r
      join public.intentos_evaluacion ie on ie.id = r.intento_id
     where ie.evaluacion_id = p_evaluacion_id
     group by r.intento_id
  ),
  resumen_intentos as (
    select
      ee.usuario_id,
      ee.nombre,
      ee.correo,
      i.id as intento_id,
      i.inicio,
      i.fin,
      i.puntaje,
      i.puntaje_maximo,
      i.porcentaje,
      i.nivel,
      i.ultimo_heartbeat,
      coalesce(
        i.conectado = true and i.fin is null and i.ultimo_heartbeat >= statement_timestamp() - interval '60 seconds',
        false
      ) as esta_conectado,
      case
        when i.fin is not null then 'finalizado'
        when i.inicio is not null then 'en_progreso'
        else 'no_iniciado'
      end as estado_alumno,
      coalesce(rc.total_respuestas, 0) as respuestas_alumno
    from estudiantes_elegibles ee
    left join public.intentos_evaluacion i
      on i.evaluacion_id = p_evaluacion_id and i.usuario_id = ee.usuario_id
    left join respuestas_conteo rc
      on rc.intento_id = i.id
  )
  select
    count(*)::integer,
    count(*) filter (where esta_conectado)::integer,
    count(*) filter (where estado_alumno = 'en_progreso')::integer,
    count(*) filter (where estado_alumno = 'finalizado')::integer,
    coalesce(sum(respuestas_alumno), 0)::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'usuario_id', usuario_id,
        'nombre', nombre,
        'correo', correo,
        'intento_id', intento_id,
        'conectado', esta_conectado,
        'estado', estado_alumno,
        'respuestas_guardadas', respuestas_alumno,
        'total_preguntas', v_total_preguntas,
        'porcentaje_avance', case
          when v_total_preguntas > 0 then round((respuestas_alumno::numeric / v_total_preguntas::numeric) * 100, 1)
          else 0
        end,
        'puntaje', puntaje,
        'porcentaje_calificacion', porcentaje,
        'nivel', nivel,
        'ultimo_heartbeat', ultimo_heartbeat,
        'inicio', inicio,
        'fin', fin
      ) order by esta_conectado desc, respuestas_alumno desc, nombre asc
    ), '[]'::jsonb)
    into
      v_total_asignados,
      v_conectados,
      v_en_progreso,
      v_finalizados,
      v_total_respuestas,
      v_estudiantes
    from resumen_intentos;

  -- 4. Cálculo del avance global
  if v_total_asignados > 0 and v_total_preguntas > 0 then
    v_avance_global := round((v_total_respuestas::numeric / (v_total_asignados * v_total_preguntas)::numeric) * 100, 1);
    if v_avance_global > 100 then
      v_avance_global := 100;
    end if;
  else
    v_avance_global := 0;
  end if;

  return jsonb_build_object(
    'evaluacion_id', v_eval.id,
    'aula_id', v_eval.aula_id,
    'titulo', v_eval.titulo,
    'tipo', v_eval.tipo,
    'modo', v_eval.modo,
    'estado', v_eval.estado,
    'tiempo_limite_s', v_eval.tiempo_limite_s,
    'iniciada_en', v_eval.iniciada_en,
    'total_asignados', v_total_asignados,
    'total_preguntas', v_total_preguntas,
    'conectados', v_conectados,
    'en_progreso', v_en_progreso,
    'finalizados', v_finalizados,
    'total_respuestas', v_total_respuestas,
    'porcentaje_avance_global', v_avance_global,
    'actualizado_en', statement_timestamp(),
    'estudiantes', v_estudiantes
  );
end;
$$;

revoke all on function public.obtener_avance_en_vivo_rf113(uuid) from public, anon;
grant execute on function public.obtener_avance_en_vivo_rf113(uuid) to authenticated;
