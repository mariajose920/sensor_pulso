-- sensor_pulso · RF107: calificación automática del ejercicio aplicado
-- El profesor define el criterio (RF106) y el servidor califica: BPM o SpO₂ dentro de un rango, o
-- similitud mínima con una señal de referencia. Puntaje parcial, retroalimentación, reintentos y
-- recalificación por el profesor. Todo se calcula en el servidor: el cliente no envía la similitud.
--
-- Criterio de similitud (guardado en evaluaciones.criterio):
--   {"tipo":"similitud_minima","valor":75,"referencia":{"origen":"plantilla"|"medicion","id":"<uuid>"}}

-- ---------------------------------------------------------------- columnas nuevas
alter table public.evaluaciones
  add column if not exists max_reintentos smallint not null default 1
    check (max_reintentos between 1 and 5);

alter table public.intentos_evaluacion
  add column if not exists valor_obtenido numeric(7,2),
  add column if not exists similitud      numeric(5,2),
  add column if not exists criterio_cumplido boolean,
  add column if not exists detalle        jsonb,
  add column if not exists calificaciones smallint not null default 0,
  add column if not exists calificado_en  timestamptz;

comment on column public.evaluaciones.max_reintentos is 'RF107: veces que el estudiante puede enviar una medición para calificar (1 a 5).';
comment on column public.intentos_evaluacion.detalle is 'RF107: retroalimentación del último cálculo (valor, criterio, motivo, puntaje).';

-- ---------------------------------------------------------------- similitud en el servidor
-- Las mediciones no guardan la señal cruda, así que la similitud se calcula con sus rasgos:
-- BPM (peso 0,60), regularidad (0,25) y ritmo (0,15). Solo cuentan los rasgos que existen en ambas
-- partes. La diferencia relativa de BPM se duplica (una diferencia de 50 % da similitud 0 en ese rasgo).
create or replace function public.similitud_rasgos(
  p_bpm_a numeric, p_bpm_b numeric,
  p_reg_a numeric default null, p_reg_b numeric default null,
  p_ritmo_a text default null, p_ritmo_b text default null)
returns numeric language plpgsql immutable set search_path = '' as $$
declare v_num numeric := 0; v_den numeric := 0; v_dif numeric;
begin
  if p_bpm_a is null or p_bpm_b is null or p_bpm_a <= 0 or p_bpm_b <= 0 then return null; end if;
  v_dif := least(1, 2 * abs(p_bpm_a - p_bpm_b) / greatest(p_bpm_a, p_bpm_b));
  v_num := 0.60 * v_dif; v_den := 0.60;
  if p_reg_a is not null and p_reg_b is not null then
    v_num := v_num + 0.25 * least(1, abs(p_reg_a - p_reg_b)); v_den := v_den + 0.25;
  end if;
  if p_ritmo_a is not null and p_ritmo_b is not null then
    v_num := v_num + 0.15 * (case when p_ritmo_a = p_ritmo_b then 0 else 1 end); v_den := v_den + 0.15;
  end if;
  return round(greatest(0, 100 * (1 - v_num / v_den)), 1);
end $$;

-- ---------------------------------------------------------------- puntaje parcial
-- Rango: dentro = 100. Fuera, baja linealmente según la distancia, relativa al ancho del rango.
create or replace function public.puntaje_rango(p_valor numeric, p_min numeric, p_max numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when p_valor between p_min and p_max then 100
    else greatest(0, round(100 * (1 - (case when p_valor < p_min then p_min - p_valor else p_valor - p_max end)
                                       / nullif(p_max - p_min, 0)), 2))
  end
$$;

-- Similitud mínima: cumple = 100; si no, proporcional a lo que alcanzó.
create or replace function public.puntaje_similitud(p_similitud numeric, p_minimo numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case when p_similitud >= p_minimo then 100
              else greatest(0, round(100 * p_similitud / nullif(p_minimo, 0), 2)) end
$$;

-- ---------------------------------------------------------------- cálculo común (interno)
-- Valida la medición y calcula valor, similitud, puntaje y retroalimentación. No escribe nada.
-- p_validar_ventana = false al recalificar: la medición ya fue aceptada antes.
create or replace function public.evaluar_ejercicio(
  p_eval uuid, p_medicion uuid, p_alumno uuid, p_desde timestamptz, p_validar_ventana boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ev public.evaluaciones; v_m public.mediciones;
  v_crit jsonb; v_tipo text; v_min numeric; v_max numeric; v_minimo numeric;
  v_valor numeric; v_sim numeric; v_pts numeric; v_cumple boolean; v_motivo text;
  v_desde timestamptz; v_ref jsonb; v_ref_bpm numeric; v_ref_reg numeric; v_ref_ritmo text; v_ref_nombre text;
begin
  select * into v_ev from public.evaluaciones where id = p_eval;
  if not found or v_ev.tipo <> 'ejercicio_aplicado' then
    raise exception 'La evaluación no es un ejercicio aplicado';
  end if;
  select * into v_m from public.mediciones where id = p_medicion and usuario_id = p_alumno;
  if not found then raise exception 'Medición no válida: debe ser una medición tuya'; end if;
  if v_m.calidad = 'mala' then
    raise exception 'La medición tiene calidad de señal mala; repite la medición';
  end if;

  if p_validar_ventana then
    v_desde := case when v_ev.modo = 'en_vivo' then v_ev.iniciada_en
                    else coalesce(v_ev.abre_en, p_desde - interval '1 day') end;
    if v_desde is not null and v_m.inicio < v_desde then
      raise exception 'La medición es anterior a la apertura de la evaluación; haz una nueva';
    end if;
    if v_m.inicio > now() + interval '5 minutes' then
      raise exception 'La medición tiene una fecha futura';
    end if;
  end if;

  v_crit := v_ev.criterio; v_tipo := v_crit ->> 'tipo';

  if v_tipo = 'bpm_en_rango' then
    v_valor := v_m.bpm_promedio;
    if v_valor is null then raise exception 'La medición no tiene BPM'; end if;
    v_min := (v_crit ->> 'min')::numeric; v_max := (v_crit ->> 'max')::numeric;
    v_pts := public.puntaje_rango(v_valor, v_min, v_max); v_cumple := v_valor between v_min and v_max;
    v_motivo := case when v_cumple then format('Tu pulso (%s BPM) está dentro del rango pedido (%s a %s BPM).', v_valor, v_min, v_max)
                     else format('Tu pulso (%s BPM) está %s del rango pedido (%s a %s BPM).', v_valor,
                                 case when v_valor < v_min then 'por debajo' else 'por encima' end, v_min, v_max) end;

  elsif v_tipo = 'spo2_en_rango' then
    v_valor := v_m.spo2_promedio;
    if v_valor is null then raise exception 'La medición no tiene SpO₂'; end if;
    v_min := (v_crit ->> 'min')::numeric; v_max := (v_crit ->> 'max')::numeric;
    v_pts := public.puntaje_rango(v_valor, v_min, v_max); v_cumple := v_valor between v_min and v_max;
    v_motivo := case when v_cumple then format('Tu SpO₂ (%s %%) está dentro del rango pedido (%s a %s %%).', v_valor, v_min, v_max)
                     else format('Tu SpO₂ (%s %%) está %s del rango pedido (%s a %s %%).', v_valor,
                                 case when v_valor < v_min then 'por debajo' else 'por encima' end, v_min, v_max) end;

  elsif v_tipo = 'similitud_minima' then
    v_ref := v_crit -> 'referencia';
    if v_ref is null or (v_ref ->> 'id') is null then
      raise exception 'La evaluación no tiene señal de referencia definida';
    end if;
    if v_ref ->> 'origen' = 'plantilla' then
      select s.bpm_referencia, s.ritmo::text, s.nombre into v_ref_bpm, v_ref_ritmo, v_ref_nombre
        from public.senales_referencia s where s.id = (v_ref ->> 'id')::uuid and s.aprobada;
      if not found then raise exception 'La señal de referencia ya no está disponible'; end if;
    elsif v_ref ->> 'origen' = 'medicion' then
      -- Solo una medición del propio profesor: nunca los datos de otro estudiante.
      select r.bpm_promedio, r.regularidad, r.ritmo::text, 'Medición de referencia del profesor'
        into v_ref_bpm, v_ref_reg, v_ref_ritmo, v_ref_nombre
        from public.mediciones r where r.id = (v_ref ->> 'id')::uuid and r.usuario_id = v_ev.creador_id;
      if not found then raise exception 'La medición de referencia ya no está disponible'; end if;
    else
      raise exception 'Origen de referencia no válido';
    end if;
    v_sim := public.similitud_rasgos(v_m.bpm_promedio, v_ref_bpm, v_m.regularidad, v_ref_reg, v_m.ritmo::text, v_ref_ritmo);
    if v_sim is null then raise exception 'No hay BPM suficiente para comparar con la referencia'; end if;
    v_minimo := (v_crit ->> 'valor')::numeric; v_valor := v_sim;
    v_pts := public.puntaje_similitud(v_sim, v_minimo); v_cumple := v_sim >= v_minimo;
    v_motivo := case when v_cumple then format('Tu señal tiene %s %% de similitud con «%s» (mínimo %s %%).', v_sim, v_ref_nombre, v_minimo)
                     else format('Tu señal tiene %s %% de similitud con «%s»; el mínimo era %s %%.', v_sim, v_ref_nombre, v_minimo) end;
  else
    raise exception 'La evaluación no tiene un criterio válido';
  end if;

  return jsonb_build_object('valor', v_valor, 'similitud', v_sim, 'cumple', v_cumple,
                            'puntaje', v_pts, 'motivo', v_motivo, 'criterio', v_crit - 'referencia');
end $$;

revoke all on function public.evaluar_ejercicio(uuid,uuid,uuid,timestamptz,boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- calificar (estudiante)
drop function if exists public.calificar_ejercicio(uuid, uuid, numeric);

create or replace function public.calificar_ejercicio(p_intento uuid, p_medicion uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_ev public.evaluaciones; v_r jsonb; v_nivel public.nivel_logro;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento and usuario_id = auth.uid() for update;
  if not found then raise exception 'Intento no disponible'; end if;
  select * into v_ev from public.evaluaciones where id = v_int.evaluacion_id;
  if not public.evaluacion_abierta(v_ev.id) then raise exception 'La evaluación está cerrada'; end if;
  if v_int.calificaciones >= v_ev.max_reintentos then
    raise exception 'Ya usaste todos tus intentos (%)', v_ev.max_reintentos;
  end if;

  v_r := public.evaluar_ejercicio(v_ev.id, p_medicion, auth.uid(), v_int.inicio, true);

  update public.intentos_evaluacion
     set medicion_id = p_medicion, puntaje = (v_r ->> 'puntaje')::numeric, puntaje_maximo = 100,
         valor_obtenido = (v_r ->> 'valor')::numeric, similitud = (v_r ->> 'similitud')::numeric,
         criterio_cumplido = (v_r ->> 'cumple')::boolean, detalle = v_r,
         calificaciones = calificaciones + 1, calificado_en = now(), fin = now()
   where id = p_intento
  returning nivel into v_nivel;

  return v_r || jsonb_build_object('nivel', v_nivel,
                                   'intentos_restantes', v_ev.max_reintentos - (v_int.calificaciones + 1));
end $$;

-- ---------------------------------------------------------------- recalificar (profesor)
-- Vuelve a calcular con el criterio y la referencia actuales, sobre la medición ya entregada.
create or replace function public.recalificar_intento(p_intento uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_r jsonb; v_nivel public.nivel_logro;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento for update;
  if not found then raise exception 'Intento no encontrado'; end if;
  if not public.profesor_de_evaluacion(v_int.evaluacion_id) then
    raise exception 'Solo el profesor de la evaluación puede recalificar' using errcode = '42501';
  end if;
  if v_int.medicion_id is null then raise exception 'El estudiante aún no entregó una medición'; end if;

  v_r := public.evaluar_ejercicio(v_int.evaluacion_id, v_int.medicion_id, v_int.usuario_id, v_int.inicio, false);

  update public.intentos_evaluacion
     set puntaje = (v_r ->> 'puntaje')::numeric, puntaje_maximo = 100,
         valor_obtenido = (v_r ->> 'valor')::numeric, similitud = (v_r ->> 'similitud')::numeric,
         criterio_cumplido = (v_r ->> 'cumple')::boolean, detalle = v_r, calificado_en = now()
   where id = p_intento
  returning nivel into v_nivel;

  return v_r || jsonb_build_object('nivel', v_nivel);
end $$;

revoke all on function public.calificar_ejercicio(uuid,uuid), public.recalificar_intento(uuid) from public, anon;
grant execute on function public.calificar_ejercicio(uuid,uuid), public.recalificar_intento(uuid) to authenticated;
