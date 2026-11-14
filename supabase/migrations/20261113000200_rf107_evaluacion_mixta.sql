-- sensor_pulso · RF107 (ampliación): evaluación mixta = preguntas + uno o más ejercicios aplicados
-- Una evaluación 'mixta' tiene preguntas (evaluacion_preguntas) y varios ejercicios (evaluacion_ejercicios),
-- cada uno con su criterio y su puntaje. El estudiante entrega una medición por ejercicio y el intento
-- suma preguntas + ejercicios. Requiere la migración 20261113000100 (calificación del ejercicio aplicado).

-- ---------------------------------------------------------------- tipo nuevo
alter table public.evaluaciones drop constraint if exists evaluaciones_tipo_check;
alter table public.evaluaciones
  add constraint evaluaciones_tipo_check check (tipo in ('preguntas','ejercicio_aplicado','mixta'));

-- ---------------------------------------------------------------- ejercicios de una evaluación mixta
create table if not exists public.evaluacion_ejercicios (
  id            uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references public.evaluaciones (id) on delete cascade,
  orden         smallint not null default 0,
  ejercicio     text not null check (ejercicio in ('medir_pulso','medir_spo2','comparar_senales')),
  criterio      jsonb not null,
  puntaje       numeric(6,2) not null default 20 check (puntaje > 0 and puntaje <= 1000),
  creado_en     timestamptz not null default now()
);
create index if not exists evaluacion_ejercicios_eval_idx on public.evaluacion_ejercicios (evaluacion_id, orden);

-- Resultado de cada ejercicio dentro de un intento.
create table if not exists public.intento_ejercicios (
  id             uuid primary key default gen_random_uuid(),
  intento_id     uuid not null references public.intentos_evaluacion (id) on delete cascade,
  ejercicio_id   uuid not null references public.evaluacion_ejercicios (id) on delete cascade,
  medicion_id    uuid references public.mediciones (id) on delete set null,
  puntaje        numeric(6,2) not null default 0,          -- puntos obtenidos (porcentaje del ejercicio × su puntaje)
  puntaje_maximo numeric(6,2) not null default 0,
  porcentaje     numeric(5,2) not null default 0,
  valor_obtenido numeric(7,2),
  similitud      numeric(5,2),
  criterio_cumplido boolean,
  detalle        jsonb,
  calificaciones smallint not null default 0,
  calificado_en  timestamptz,
  unique (intento_id, ejercicio_id)
);

alter table public.evaluacion_ejercicios enable row level security;
alter table public.intento_ejercicios enable row level security;

create policy evaluacion_ejercicios_profesor on public.evaluacion_ejercicios for all to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id)))
  with check ((select public.profesor_de_evaluacion(evaluacion_id)));

create policy evaluacion_ejercicios_estudiante on public.evaluacion_ejercicios for select to authenticated
  using ((select public.evaluacion_asignada_a_mi(evaluacion_id)) and (select public.evaluacion_abierta(evaluacion_id)));

-- Los resultados los escriben solo las funciones de abajo; se leen el estudiante dueño y el profesor.
create policy intento_ejercicios_ver on public.intento_ejercicios for select to authenticated
  using (exists (select 1 from public.intentos_evaluacion i
                 where i.id = intento_id
                   and (i.usuario_id = (select auth.uid()) or (select public.profesor_de_evaluacion(i.evaluacion_id)))));

-- ---------------------------------------------------------------- cálculo con un criterio dado
-- Igual que evaluar_ejercicio, pero el criterio llega como parámetro (cada ejercicio de la mixta tiene el suyo).
create or replace function public.evaluar_criterio(
  p_eval uuid, p_criterio jsonb, p_medicion uuid, p_alumno uuid, p_desde timestamptz, p_validar_ventana boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ev public.evaluaciones; v_m public.mediciones;
  v_crit jsonb := p_criterio; v_tipo text; v_min numeric; v_max numeric; v_minimo numeric;
  v_valor numeric; v_sim numeric; v_pts numeric; v_cumple boolean; v_motivo text;
  v_desde timestamptz; v_ref jsonb; v_ref_bpm numeric; v_ref_reg numeric; v_ref_ritmo text; v_ref_nombre text;
begin
  select * into v_ev from public.evaluaciones where id = p_eval;
  if not found then raise exception 'Evaluación no encontrada'; end if;
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

  v_tipo := v_crit ->> 'tipo';

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

revoke all on function public.evaluar_criterio(uuid,jsonb,uuid,uuid,timestamptz,boolean) from public, anon, authenticated;

-- El ejercicio aplicado simple pasa por el mismo cálculo.
create or replace function public.evaluar_ejercicio(
  p_eval uuid, p_medicion uuid, p_alumno uuid, p_desde timestamptz, p_validar_ventana boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ev public.evaluaciones;
begin
  select * into v_ev from public.evaluaciones where id = p_eval;
  if not found or v_ev.tipo <> 'ejercicio_aplicado' then
    raise exception 'La evaluación no es un ejercicio aplicado';
  end if;
  return public.evaluar_criterio(p_eval, v_ev.criterio, p_medicion, p_alumno, p_desde, p_validar_ventana);
end $$;

-- ---------------------------------------------------------------- total del intento en una mixta
-- Preguntas + ejercicios. Se recalcula cada vez que se escribe el puntaje del intento (responder_pregunta,
-- la entrega simultánea del RF110 o la calificación de un ejercicio). Corre antes de `intento_nivel`.
create or replace function public.total_intento_mixta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tipo text; v_pr numeric; v_ej numeric; v_max_pr numeric; v_max_ej numeric;
begin
  select tipo into v_tipo from public.evaluaciones where id = new.evaluacion_id;
  if v_tipo is distinct from 'mixta' then return new; end if;
  select coalesce(sum(r.puntaje), 0) into v_pr from public.respuestas r where r.intento_id = new.id;
  select coalesce(sum(ie.puntaje), 0) into v_ej from public.intento_ejercicios ie where ie.intento_id = new.id;
  select coalesce(sum(coalesce(ep.puntaje, q.puntaje)), 0) into v_max_pr
    from public.evaluacion_preguntas ep join public.preguntas q on q.id = ep.pregunta_id
   where ep.evaluacion_id = new.evaluacion_id;
  select coalesce(sum(e.puntaje), 0) into v_max_ej from public.evaluacion_ejercicios e where e.evaluacion_id = new.evaluacion_id;
  new.puntaje := v_pr + v_ej;
  new.puntaje_maximo := case when v_max_pr + v_max_ej = 0 then 100 else v_max_pr + v_max_ej end;
  return new;
end $$;

drop trigger if exists intento_a_total_mixta on public.intentos_evaluacion;
create trigger intento_a_total_mixta before insert or update of puntaje, puntaje_maximo on public.intentos_evaluacion
  for each row execute function public.total_intento_mixta();

-- ---------------------------------------------------------------- calificar un ejercicio de la mixta (estudiante)
create or replace function public.calificar_ejercicio_mixto(p_intento uuid, p_ejercicio uuid, p_medicion uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_ev public.evaluaciones; v_ej public.evaluacion_ejercicios;
  v_usados smallint; v_r jsonb; v_pct numeric; v_pts numeric; v_nivel public.nivel_logro;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento and usuario_id = auth.uid() for update;
  if not found then raise exception 'Intento no disponible'; end if;
  select * into v_ev from public.evaluaciones where id = v_int.evaluacion_id;
  if v_ev.tipo <> 'mixta' then raise exception 'La evaluación no es mixta'; end if;
  if not public.evaluacion_abierta(v_ev.id) then raise exception 'La evaluación está cerrada'; end if;
  select * into v_ej from public.evaluacion_ejercicios where id = p_ejercicio and evaluacion_id = v_ev.id;
  if not found then raise exception 'El ejercicio no pertenece a la evaluación'; end if;

  select coalesce(max(calificaciones), 0) into v_usados
    from public.intento_ejercicios where intento_id = p_intento and ejercicio_id = p_ejercicio;
  if v_usados >= v_ev.max_reintentos then
    raise exception 'Ya usaste todos tus intentos (%)', v_ev.max_reintentos;
  end if;

  v_r := public.evaluar_criterio(v_ev.id, v_ej.criterio, p_medicion, auth.uid(), v_int.inicio, true);
  v_pct := (v_r ->> 'puntaje')::numeric;
  v_pts := round(v_ej.puntaje * v_pct / 100, 2);

  insert into public.intento_ejercicios as ie
    (intento_id, ejercicio_id, medicion_id, puntaje, puntaje_maximo, porcentaje, valor_obtenido, similitud,
     criterio_cumplido, detalle, calificaciones, calificado_en)
  values (p_intento, p_ejercicio, p_medicion, v_pts, v_ej.puntaje, v_pct, (v_r ->> 'valor')::numeric,
          (v_r ->> 'similitud')::numeric, (v_r ->> 'cumple')::boolean, v_r, 1, now())
  on conflict (intento_id, ejercicio_id) do update
    set medicion_id = excluded.medicion_id, puntaje = excluded.puntaje, puntaje_maximo = excluded.puntaje_maximo,
        porcentaje = excluded.porcentaje, valor_obtenido = excluded.valor_obtenido, similitud = excluded.similitud,
        criterio_cumplido = excluded.criterio_cumplido, detalle = excluded.detalle,
        calificaciones = ie.calificaciones + 1, calificado_en = now();

  -- Recalcula el total del intento (preguntas + ejercicios) y su nivel.
  update public.intentos_evaluacion set puntaje = puntaje where id = p_intento returning nivel into v_nivel;

  return v_r || jsonb_build_object('puntaje_obtenido', v_pts, 'puntaje_ejercicio', v_ej.puntaje, 'nivel', v_nivel,
                                   'intentos_restantes', v_ev.max_reintentos - (v_usados + 1));
end $$;

-- ---------------------------------------------------------------- recalificar (profesor): ahora también la mixta
create or replace function public.recalificar_intento(p_intento uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_tipo text; v_r jsonb; v_nivel public.nivel_logro; v_fila record; v_pct numeric;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento for update;
  if not found then raise exception 'Intento no encontrado'; end if;
  if not public.profesor_de_evaluacion(v_int.evaluacion_id) then
    raise exception 'Solo el profesor de la evaluación puede recalificar' using errcode = '42501';
  end if;
  select tipo into v_tipo from public.evaluaciones where id = v_int.evaluacion_id;

  if v_tipo = 'mixta' then
    for v_fila in
      select ie.id as ie_id, ie.medicion_id, e.criterio, e.puntaje as peso
        from public.intento_ejercicios ie join public.evaluacion_ejercicios e on e.id = ie.ejercicio_id
       where ie.intento_id = p_intento and ie.medicion_id is not null
    loop
      v_r := public.evaluar_criterio(v_int.evaluacion_id, v_fila.criterio, v_fila.medicion_id, v_int.usuario_id, v_int.inicio, false);
      v_pct := (v_r ->> 'puntaje')::numeric;
      update public.intento_ejercicios
         set puntaje = round(v_fila.peso * v_pct / 100, 2), puntaje_maximo = v_fila.peso, porcentaje = v_pct,
             valor_obtenido = (v_r ->> 'valor')::numeric, similitud = (v_r ->> 'similitud')::numeric,
             criterio_cumplido = (v_r ->> 'cumple')::boolean, detalle = v_r, calificado_en = now()
       where id = v_fila.ie_id;
    end loop;
    update public.intentos_evaluacion set puntaje = puntaje, calificado_en = now()
     where id = p_intento returning nivel into v_nivel;
    return jsonb_build_object('nivel', v_nivel, 'mixta', true);
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

revoke all on function public.calificar_ejercicio_mixto(uuid,uuid,uuid), public.recalificar_intento(uuid) from public, anon;
grant execute on function public.calificar_ejercicio_mixto(uuid,uuid,uuid), public.recalificar_intento(uuid) to authenticated;
