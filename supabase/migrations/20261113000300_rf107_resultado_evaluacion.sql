-- sensor_pulso · RF107 (ampliación): resultado y correcciones de una evaluación entregada
-- Al entregar, el estudiante ve su calificación automática: porcentaje y nivel (logrado, medianamente logrado,
-- no logrado), la corrección de cada pregunta (su respuesta, la correcta y la explicación) y el resultado de cada
-- ejercicio aplicado. La clave de respuestas sigue sin ser legible para el estudiante: solo esta función la
-- devuelve, y únicamente cuando el intento ya fue entregado y es del propio estudiante.

create or replace function public.resultado_evaluacion(p_intento uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_ev public.evaluaciones; v_preguntas jsonb; v_ejercicios jsonb;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento and usuario_id = auth.uid();
  if not found then raise exception 'Intento no disponible' using errcode = '42501'; end if;
  if v_int.fin is null then
    raise exception 'Entrega la evaluación para ver las correcciones';
  end if;
  select * into v_ev from public.evaluaciones where id = v_int.evaluacion_id;

  -- Preguntas: respuesta del estudiante, si fue correcta, clave y explicación
  select coalesce(jsonb_agg(jsonb_build_object(
           'pregunta_id', q.id,
           'orden', ep.orden,
           'enunciado', q.enunciado,
           'tipo', q.tipo,
           'opciones', q.opciones,
           'respondida', r.id is not null,
           'respuesta', r.respuesta,
           'es_correcta', r.es_correcta,
           'puntaje', coalesce(r.puntaje, 0),
           'puntaje_maximo', coalesce(ep.puntaje, q.puntaje),
           'correcta', k.correcta,
           'explicacion', k.explicacion
         ) order by ep.orden, q.creado_en), '[]'::jsonb)
    into v_preguntas
    from public.evaluacion_preguntas ep
    join public.preguntas q on q.id = ep.pregunta_id
    left join public.respuestas r on r.intento_id = p_intento and r.pregunta_id = q.id
    left join public.preguntas_claves k on k.pregunta_id = q.id
   where ep.evaluacion_id = v_int.evaluacion_id;

  -- Ejercicios aplicados
  if v_ev.tipo = 'mixta' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', e.orden,
             'ejercicio', e.ejercicio,
             'calificado', ie.id is not null,
             'puntaje', coalesce(ie.puntaje, 0),
             'puntaje_maximo', e.puntaje,
             'porcentaje', coalesce(ie.porcentaje, 0),
             'cumple', ie.criterio_cumplido,
             'valor', ie.valor_obtenido,
             'motivo', ie.detalle ->> 'motivo',
             'criterio', e.criterio - 'referencia'
           ) order by e.orden), '[]'::jsonb)
      into v_ejercicios
      from public.evaluacion_ejercicios e
      left join public.intento_ejercicios ie on ie.intento_id = p_intento and ie.ejercicio_id = e.id
     where e.evaluacion_id = v_int.evaluacion_id;
  elsif v_ev.tipo = 'ejercicio_aplicado' then
    v_ejercicios := jsonb_build_array(jsonb_build_object(
      'orden', 1,
      'ejercicio', v_ev.ejercicio,
      'calificado', v_int.medicion_id is not null,
      'puntaje', v_int.puntaje,
      'puntaje_maximo', v_int.puntaje_maximo,
      'porcentaje', v_int.porcentaje,
      'cumple', v_int.criterio_cumplido,
      'valor', v_int.valor_obtenido,
      'motivo', v_int.detalle ->> 'motivo',
      'criterio', (v_ev.criterio - 'referencia')
    ));
  else
    v_ejercicios := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'intento_id', p_intento,
    'titulo', v_ev.titulo,
    'tipo', v_ev.tipo,
    'puntaje', v_int.puntaje,
    'puntaje_maximo', v_int.puntaje_maximo,
    'porcentaje', v_int.porcentaje,
    'nivel', v_int.nivel,
    'umbral_logrado', v_ev.umbral_logrado,
    'umbral_medio', v_ev.umbral_medio,
    'preguntas', v_preguntas,
    'ejercicios', v_ejercicios
  );
end $$;

revoke all on function public.resultado_evaluacion(uuid) from public, anon;
grant execute on function public.resultado_evaluacion(uuid) to authenticated;
