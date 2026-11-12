-- sensor_pulso · Migración RF110: Optimización de Escritura de Respuestas y Soporte Simultáneo
-- Requerimiento RF110: "Soportar hasta 100 estudiantes respondiendo a la vez."

-- 1. Índices de alto rendimiento para escrituras y lecturas concurrentes
create index if not exists respuestas_intento_idx on public.respuestas (intento_id);
create index if not exists respuestas_pregunta_idx on public.respuestas (pregunta_id);
create index if not exists respuestas_respondida_en_idx on public.respuestas (respondida_en desc);
create index if not exists intentos_evaluacion_eval_usuario_idx on public.intentos_evaluacion (evaluacion_id, usuario_id);

-- 2. Función optimizada para inserción de respuestas simultáneas en bloque (Set-Based Bulk Upsert)
create or replace function public.guardar_respuestas_simultaneas_rf110(
  p_evaluacion_id uuid,
  p_intento_id uuid,
  p_respuestas jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intento record;
  v_total_respuestas integer := 0;
  v_puntaje_total numeric(7,2) := 0;
  v_nivel public.nivel_logro;
begin
  -- 1. Verificación atómica inicial de asignación y estado
  if not public.evaluacion_asignada_a_mi(p_evaluacion_id) then
    raise exception 'La evaluación ya no está asignada a tu cuenta.' using errcode = '42501';
  end if;

  if not public.evaluacion_abierta(p_evaluacion_id) then
    raise exception 'La evaluación está cerrada.' using errcode = '42501';
  end if;

  select i.id, i.evaluacion_id, i.usuario_id, i.puntaje_maximo
    into v_intento
    from public.intentos_evaluacion as i
   where i.id = p_intento_id
     and i.evaluacion_id = p_evaluacion_id
     and i.usuario_id = auth.uid()
     and i.fin is null
   for update; -- Bloqueo a nivel de fila para evitar condiciones de carrera del mismo estudiante

  if not found then
    raise exception 'El intento no está disponible o ya fue finalizado.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_respuestas) is distinct from 'object'
     or p_respuestas = '{}'::jsonb then
    raise exception 'Envía al menos una respuesta.';
  end if;

  -- 2. Inserción / Upsert en bloque (SET-BASED) sin loops procedurales iterativos
  with items as (
    select
      r.clave::uuid as pregunta_id,
      r.valor as respuesta_enviada
    from jsonb_each(p_respuestas) as r(clave, valor)
  ),
  calificadas as (
    select
      p_intento_id as intento_id,
      i.pregunta_id,
      i.respuesta_enviada as respuesta,
      case
        when c.correcta is null then null -- Pregunta abierta (revisión manual)
        when jsonb_typeof(c.correcta) = 'object' then
          abs((i.respuesta_enviada #>> '{}')::numeric - (c.correcta ->> 'valor')::numeric) <= coalesce((c.correcta ->> 'tolerancia')::numeric, 0)
        else
          (i.respuesta_enviada = c.correcta)
      end as es_correcta,
      coalesce(ep.puntaje, q.puntaje, 1) as pts_posibles,
      statement_timestamp() as respondida_en
    from items i
    join public.evaluacion_preguntas ep
      on ep.evaluacion_id = p_evaluacion_id and ep.pregunta_id = i.pregunta_id
    join public.preguntas q
      on q.id = i.pregunta_id
    left join public.preguntas_claves c
      on c.pregunta_id = i.pregunta_id
  ),
  insertadas as (
    insert into public.respuestas (intento_id, pregunta_id, respuesta, es_correcta, puntaje, respondida_en)
    select
      c.intento_id,
      c.pregunta_id,
      c.respuesta,
      c.es_correcta,
      case when c.es_correcta then c.pts_posibles else 0 end,
      c.respondida_en
    from calificadas c
    on conflict (intento_id, pregunta_id) do update
      set respuesta = excluded.respuesta,
          es_correcta = excluded.es_correcta,
          puntaje = excluded.puntaje,
          respondida_en = excluded.respondida_en
    returning 1
  )
  select count(*) into v_total_respuestas from insertadas;

  -- 3. Calcular puntaje consolidado una sola vez y finalizar intento atómicamente
  select coalesce(sum(r.puntaje), 0)
    into v_puntaje_total
    from public.respuestas r
   where r.intento_id = p_intento_id;

  update public.intentos_evaluacion
     set puntaje = v_puntaje_total,
         fin = statement_timestamp()
   where id = p_intento_id
  returning nivel into v_nivel;

  return jsonb_build_object(
    'ok', true,
    'intento_id', p_intento_id,
    'respuestas_guardadas', v_total_respuestas,
    'puntaje', v_puntaje_total,
    'nivel', v_nivel,
    'procesado_en', statement_timestamp()
  );
end;
$$;

revoke all on function public.guardar_respuestas_simultaneas_rf110(uuid, uuid, jsonb) from public, anon;
grant execute on function public.guardar_respuestas_simultaneas_rf110(uuid, uuid, jsonb) to authenticated;

-- 3. Actualizar entregar_evaluacion_rf109 para delegar en la función en bloque optimizada
create or replace function public.entregar_evaluacion_rf109(
  p_evaluacion_id uuid,
  p_intento_id uuid,
  p_respuestas jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.guardar_respuestas_simultaneas_rf110(p_evaluacion_id, p_intento_id, p_respuestas);
end;
$$;
