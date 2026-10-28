-- sensor_pulso · Migración 5: preguntas, evaluaciones, intentos y resultados
-- RF104–RF113, RF117, RNF04, RNF09

create type public.nivel_logro as enum ('logrado', 'medianamente_logrado', 'no_logrado');   -- RF112

-- ================================================================ BANCO DE PREGUNTAS
create table public.preguntas (                            -- RF108
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid references public.perfiles (id) on delete set null,
  enunciado     text not null check (length(trim(enunciado)) > 0),
  tipo          text not null check (tipo in ('opcion_multiple','verdadero_falso','numerica','abierta')),
  opciones      jsonb,                                       -- [{"id":"a","texto":"..."}]
  puntaje       numeric(5,2) not null default 1 check (puntaje > 0),
  etiquetas     text[] not null default '{}',
  compartida    boolean not null default false,              -- marcada por el profesor
  revision_global text not null default 'no_solicitada'
                  check (revision_global in ('no_solicitada','pendiente','aprobada','rechazada')),
  revisada_por  uuid references public.perfiles (id),
  leccion_id    uuid,                                        -- reto de una lección (RF42); FK en migración 6
  creado_en     timestamptz not null default now(),
  check ((tipo in ('opcion_multiple') and opciones is not null) or tipo <> 'opcion_multiple')
);
create index preguntas_autor_idx on public.preguntas (autor_id);
create index preguntas_global_idx on public.preguntas (revision_global) where revision_global = 'aprobada';

-- La clave de respuesta vive aparte para que los estudiantes nunca la lean.
create table public.preguntas_claves (
  pregunta_id uuid primary key references public.preguntas (id) on delete cascade,
  correcta    jsonb not null,                                -- "a" | true | {"valor":72,"tolerancia":2}
  explicacion text
);

-- ================================================================ EVALUACIONES
create table public.evaluaciones (
  id             uuid primary key default gen_random_uuid(),
  aula_id        uuid references public.aulas (id) on delete cascade,     -- null = plantilla precargada
  creador_id     uuid references public.perfiles (id) on delete set null,
  titulo         text not null check (length(trim(titulo)) > 0),
  descripcion    text,
  tipo           text not null check (tipo in ('preguntas','ejercicio_aplicado')),     -- RF106
  ejercicio      text check (ejercicio in ('medir_pulso','medir_spo2','comparar_senales')),
  criterio       jsonb,                                       -- RF107, p. ej. {"tipo":"bpm_en_rango","min":60,"max":100}
  precargada     boolean not null default false,              -- RF105
  modo           text not null default 'ventana' check (modo in ('en_vivo','ventana')),   -- RF109
  estado         text not null default 'borrador' check (estado in ('borrador','programada','en_curso','cerrada')),
  tiempo_limite_s integer check (tiempo_limite_s > 0),
  iniciada_en    timestamptz,
  abre_en        timestamptz,
  cierra_en      timestamptz,
  umbral_logrado numeric(5,2) not null default 70 check (umbral_logrado between 1 and 100),    -- RF112
  umbral_medio   numeric(5,2) not null default 40 check (umbral_medio between 0 and 100),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (umbral_medio < umbral_logrado),
  check (cierra_en is null or abre_en is null or cierra_en > abre_en),
  check (tipo <> 'ejercicio_aplicado' or (ejercicio is not null and criterio is not null) or precargada)
);
create index evaluaciones_aula_idx on public.evaluaciones (aula_id);
create trigger evaluaciones_updated before update on public.evaluaciones
  for each row execute function public.set_updated_at();

alter table public.sesiones_medicion
  add constraint sesiones_evaluacion_fk foreign key (evaluacion_id)
  references public.evaluaciones (id) on delete set null;

create table public.evaluacion_preguntas (
  evaluacion_id uuid not null references public.evaluaciones (id) on delete cascade,
  pregunta_id   uuid not null references public.preguntas (id),
  orden         smallint not null default 0,
  puntaje       numeric(5,2),                                -- null = el de la pregunta
  primary key (evaluacion_id, pregunta_id)
);

-- A quién se asigna (RF104): aula completa, un curso o estudiantes concretos.
create table public.evaluacion_asignaciones (
  id            uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references public.evaluaciones (id) on delete cascade,
  alcance       text not null check (alcance in ('aula','curso','estudiante')),
  curso_id      uuid references public.cursos (id) on delete cascade,
  usuario_id    uuid references public.perfiles (id) on delete cascade,
  check ((alcance = 'aula'       and curso_id is null and usuario_id is null)
      or (alcance = 'curso'      and curso_id is not null and usuario_id is null)
      or (alcance = 'estudiante' and usuario_id is not null and curso_id is null))
);
create index asignaciones_eval_idx on public.evaluacion_asignaciones (evaluacion_id);

-- Un intento por estudiante y evaluación; el resultado se actualiza en tiempo real (RF112–RF113).
create table public.intentos_evaluacion (
  id             uuid primary key default gen_random_uuid(),
  evaluacion_id  uuid not null references public.evaluaciones (id) on delete cascade,
  usuario_id     uuid not null references public.perfiles (id) on delete cascade,
  inicio         timestamptz not null default now(),
  fin            timestamptz,
  medicion_id    uuid references public.mediciones (id) on delete set null,   -- ejercicio aplicado
  puntaje        numeric(7,2) not null default 0,
  puntaje_maximo numeric(7,2) not null default 0,
  porcentaje     numeric(5,2) generated always as
                   (case when puntaje_maximo > 0 then round(100 * puntaje / puntaje_maximo, 2) else 0 end) stored,
  nivel          nivel_logro,
  unique (evaluacion_id, usuario_id)
);
create index intentos_usuario_idx on public.intentos_evaluacion (usuario_id);

create table public.respuestas (
  id          uuid primary key default gen_random_uuid(),
  intento_id  uuid not null references public.intentos_evaluacion (id) on delete cascade,
  pregunta_id uuid not null references public.preguntas (id),
  respuesta   jsonb not null,
  es_correcta boolean,
  puntaje     numeric(5,2) not null default 0,
  respondida_en timestamptz not null default now(),
  unique (intento_id, pregunta_id)
);

-- ---------------------------------------------------------------- nivel de logro (RF112)
create or replace function public.calcular_nivel(p_pct numeric, p_logrado numeric, p_medio numeric)
returns public.nivel_logro language sql immutable set search_path = '' as $$
  select case when p_pct >= p_logrado then 'logrado'::public.nivel_logro
              when p_pct >= p_medio   then 'medianamente_logrado'::public.nivel_logro
              else 'no_logrado'::public.nivel_logro end
$$;

create or replace function public.actualizar_nivel_intento()
returns trigger language plpgsql set search_path = '' as $$
declare v_log numeric; v_med numeric; v_pct numeric;
begin
  select umbral_logrado, umbral_medio into v_log, v_med
    from public.evaluaciones where id = new.evaluacion_id;
  v_pct := case when new.puntaje_maximo > 0 then 100 * new.puntaje / new.puntaje_maximo else 0 end;
  new.nivel := public.calcular_nivel(v_pct, v_log, v_med);
  return new;
end $$;
create trigger intento_nivel before insert or update of puntaje, puntaje_maximo on public.intentos_evaluacion
  for each row execute function public.actualizar_nivel_intento();

-- ---------------------------------------------------------------- visibilidad
create or replace function public.evaluacion_abierta(p_eval uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.evaluaciones e
    where e.id = p_eval
      and ((e.modo = 'en_vivo' and e.estado = 'en_curso'
            and (e.tiempo_limite_s is null or now() < e.iniciada_en + make_interval(secs => e.tiempo_limite_s)))
        or (e.modo = 'ventana' and e.estado in ('programada','en_curso')
            and now() >= coalesce(e.abre_en, '-infinity') and now() <= coalesce(e.cierra_en, 'infinity'))))
$$;

create or replace function public.evaluacion_asignada_a_mi(p_eval uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.evaluaciones e
    join public.aula_estudiantes m on m.aula_id = e.aula_id and m.usuario_id = auth.uid() and m.estado = 'activo'
    join public.evaluacion_asignaciones a on a.evaluacion_id = e.id
    where e.id = p_eval
      and (a.alcance = 'aula'
        or (a.alcance = 'estudiante' and a.usuario_id = auth.uid())
        or (a.alcance = 'curso' and exists (select 1 from public.curso_estudiantes c
                                            where c.curso_id = a.curso_id and c.usuario_id = auth.uid()))))
$$;

create or replace function public.profesor_de_evaluacion(p_eval uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evaluaciones e join public.aulas a on a.id = e.aula_id
                 where e.id = p_eval and a.profesor_id = auth.uid())
$$;

-- RF117: el profesor ve intentos/mediciones solo de estudiantes activos en su aula.
create or replace function public.profesor_ve_intento(p_intento uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.intentos_evaluacion i
    join public.evaluaciones e on e.id = i.evaluacion_id
    join public.aulas a on a.id = e.aula_id
    join public.aula_estudiantes m on m.aula_id = a.id and m.usuario_id = i.usuario_id and m.estado = 'activo'
    where i.id = p_intento and a.profesor_id = auth.uid())
$$;

create or replace function public.profesor_ve_medicion(p_medicion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.intentos_evaluacion i
    where i.medicion_id = p_medicion and public.profesor_ve_intento(i.id))
$$;

create or replace function public.puede_ver_pregunta(p_pregunta uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.preguntas q
    where q.id = p_pregunta
      and (q.autor_id = auth.uid()
        or public.es_admin()
        or (q.compartida and q.revision_global = 'aprobada' and public.es_profesor())
        or exists (select 1 from public.evaluacion_preguntas ep
                   where ep.pregunta_id = q.id
                     and (public.profesor_de_evaluacion(ep.evaluacion_id)
                          or (public.evaluacion_asignada_a_mi(ep.evaluacion_id)
                              and public.evaluacion_abierta(ep.evaluacion_id))))))
$$;

-- ---------------------------------------------------------------- funciones de uso
-- Armar preguntas al azar del banco propio y del global aprobado (RF108).
create or replace function public.armar_preguntas_aleatorias(p_eval uuid, p_cantidad int, p_etiquetas text[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.profesor_de_evaluacion(p_eval) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  with elegidas as (
    select q.id from public.preguntas q
    where (q.autor_id = auth.uid() or (q.compartida and q.revision_global = 'aprobada'))
      and q.leccion_id is null
      and (p_etiquetas is null or q.etiquetas && p_etiquetas)
      and not exists (select 1 from public.evaluacion_preguntas ep
                      where ep.evaluacion_id = p_eval and ep.pregunta_id = q.id)
    order by random() limit p_cantidad)
  insert into public.evaluacion_preguntas (evaluacion_id, pregunta_id, orden)
  select p_eval, id, row_number() over ()::smallint from elegidas;
  get diagnostics n = row_count;
  return n;
end $$;

-- Iniciar el intento propio (valida asignación y ventana/estado).
create or replace function public.iniciar_intento(p_eval uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_max numeric;
begin
  if not public.evaluacion_asignada_a_mi(p_eval) then
    raise exception 'Evaluación no asignada' using errcode = '42501';
  end if;
  if not public.evaluacion_abierta(p_eval) then
    raise exception 'La evaluación no está abierta';
  end if;
  select coalesce(sum(coalesce(ep.puntaje, q.puntaje)), 0) into v_max
    from public.evaluacion_preguntas ep join public.preguntas q on q.id = ep.pregunta_id
   where ep.evaluacion_id = p_eval;
  insert into public.intentos_evaluacion (evaluacion_id, usuario_id, puntaje_maximo)
  values (p_eval, auth.uid(), case when v_max = 0 then 100 else v_max end)
  on conflict (evaluacion_id, usuario_id) do update set evaluacion_id = excluded.evaluacion_id
  returning id into v_id;
  return v_id;
end $$;

-- Responder y calificar en el servidor, sin exponer la clave (RF107).
create or replace function public.responder_pregunta(p_intento uuid, p_pregunta uuid, p_respuesta jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_clave jsonb; v_pts numeric; v_ok boolean;
  v_valor numeric; v_tol numeric;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento and usuario_id = auth.uid();
  if not found or v_int.fin is not null then raise exception 'Intento no disponible'; end if;
  if not public.evaluacion_abierta(v_int.evaluacion_id) then raise exception 'La evaluación está cerrada'; end if;

  select coalesce(ep.puntaje, q.puntaje) into v_pts
    from public.evaluacion_preguntas ep join public.preguntas q on q.id = ep.pregunta_id
   where ep.evaluacion_id = v_int.evaluacion_id and ep.pregunta_id = p_pregunta;
  if not found then raise exception 'La pregunta no pertenece a la evaluación'; end if;

  select correcta into v_clave from public.preguntas_claves where pregunta_id = p_pregunta;
  if v_clave is null then
    v_ok := null;                                               -- abierta: revisión manual
  elsif jsonb_typeof(v_clave) = 'object' then                   -- numérica con tolerancia
    v_valor := (v_clave ->> 'valor')::numeric; v_tol := coalesce((v_clave ->> 'tolerancia')::numeric, 0);
    v_ok := abs((p_respuesta #>> '{}')::numeric - v_valor) <= v_tol;
  else
    v_ok := (p_respuesta = v_clave);
  end if;

  insert into public.respuestas (intento_id, pregunta_id, respuesta, es_correcta, puntaje)
  values (p_intento, p_pregunta, p_respuesta, v_ok, case when v_ok then v_pts else 0 end)
  on conflict (intento_id, pregunta_id) do update
    set respuesta = excluded.respuesta, es_correcta = excluded.es_correcta,
        puntaje = excluded.puntaje, respondida_en = now();

  update public.intentos_evaluacion i
     set puntaje = (select coalesce(sum(r.puntaje), 0) from public.respuestas r where r.intento_id = i.id)
   where i.id = p_intento;
  return v_ok;
end $$;

-- Calificación automática del ejercicio aplicado (RF107). La similitud la calcula el servidor.
create or replace function public.calificar_ejercicio(p_intento uuid, p_medicion uuid, p_similitud numeric default null)
returns public.nivel_logro language plpgsql security definer set search_path = '' as $$
declare
  v_int public.intentos_evaluacion; v_ev public.evaluaciones; v_m public.mediciones;
  v_ok boolean := false; v_nivel public.nivel_logro;
begin
  select * into v_int from public.intentos_evaluacion where id = p_intento and usuario_id = auth.uid();
  if not found then raise exception 'Intento no disponible'; end if;
  select * into v_ev from public.evaluaciones where id = v_int.evaluacion_id;
  select * into v_m from public.mediciones where id = p_medicion and usuario_id = auth.uid();
  if not found then raise exception 'Medición no válida'; end if;
  if not public.evaluacion_abierta(v_ev.id) then raise exception 'La evaluación está cerrada'; end if;

  v_ok := case v_ev.criterio ->> 'tipo'
    when 'bpm_en_rango'  then v_m.bpm_promedio  between (v_ev.criterio ->> 'min')::numeric and (v_ev.criterio ->> 'max')::numeric
    when 'spo2_en_rango' then v_m.spo2_promedio between (v_ev.criterio ->> 'min')::numeric and (v_ev.criterio ->> 'max')::numeric
    when 'similitud_minima' then coalesce(p_similitud, 0) >= (v_ev.criterio ->> 'valor')::numeric
    else false end;

  update public.intentos_evaluacion
     set medicion_id = p_medicion, puntaje = case when v_ok then 100 else 0 end,
         puntaje_maximo = 100, fin = now()
   where id = p_intento
  returning nivel into v_nivel;
  return v_nivel;
end $$;

create or replace function public.finalizar_intento(p_intento uuid)
returns public.nivel_logro language plpgsql security definer set search_path = '' as $$
declare v_nivel public.nivel_logro;
begin
  update public.intentos_evaluacion set fin = now()
   where id = p_intento and usuario_id = auth.uid() and fin is null
  returning nivel into v_nivel;
  return v_nivel;
end $$;

revoke all on function public.armar_preguntas_aleatorias(uuid,int,text[]), public.iniciar_intento(uuid),
  public.responder_pregunta(uuid,uuid,jsonb), public.calificar_ejercicio(uuid,uuid,numeric),
  public.finalizar_intento(uuid) from public, anon;
grant execute on function public.armar_preguntas_aleatorias(uuid,int,text[]), public.iniciar_intento(uuid),
  public.responder_pregunta(uuid,uuid,jsonb), public.calificar_ejercicio(uuid,uuid,numeric),
  public.finalizar_intento(uuid) to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.preguntas enable row level security;
alter table public.preguntas_claves enable row level security;
alter table public.evaluaciones enable row level security;
alter table public.evaluacion_preguntas enable row level security;
alter table public.evaluacion_asignaciones enable row level security;
alter table public.intentos_evaluacion enable row level security;
alter table public.respuestas enable row level security;

create policy preguntas_ver on public.preguntas for select to authenticated
  using ((select public.puede_ver_pregunta(id)));
create policy preguntas_crear on public.preguntas for insert to authenticated
  with check (autor_id = (select auth.uid()) and (select public.es_profesor())
              and (not compartida or (select public.tiene_permiso('compartir_banco'))));
create policy preguntas_editar on public.preguntas for update to authenticated
  using (autor_id = (select auth.uid()) or (select public.es_admin()))
  with check (autor_id = (select auth.uid()) or (select public.es_admin()));
create policy preguntas_borrar on public.preguntas for delete to authenticated
  using (autor_id = (select auth.uid()) or (select public.es_admin()));

create policy claves_autor on public.preguntas_claves for all to authenticated
  using (exists (select 1 from public.preguntas q where q.id = pregunta_id
                 and (q.autor_id = (select auth.uid()) or (select public.es_admin()))))
  with check (exists (select 1 from public.preguntas q where q.id = pregunta_id
                 and (q.autor_id = (select auth.uid()) or (select public.es_admin()))));

create policy evaluaciones_ver on public.evaluaciones for select to authenticated
  using ((select public.profesor_de_evaluacion(id)) or (select public.es_admin())
         or (select public.evaluacion_asignada_a_mi(id))
         or (precargada and (select public.es_profesor())));
create policy evaluaciones_crear on public.evaluaciones for insert to authenticated
  with check (creador_id = (select auth.uid()) and aula_id is not null
              and (select public.es_profesor_del_aula(aula_id)));
create policy evaluaciones_editar on public.evaluaciones for update to authenticated
  using ((select public.profesor_de_evaluacion(id))) with check ((select public.es_profesor_del_aula(aula_id)));
create policy evaluaciones_borrar on public.evaluaciones for delete to authenticated
  using ((select public.profesor_de_evaluacion(id)));
create policy evaluaciones_admin on public.evaluaciones for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy eval_preg_ver on public.evaluacion_preguntas for select to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id)) or (select public.es_admin())
         or ((select public.evaluacion_asignada_a_mi(evaluacion_id)) and (select public.evaluacion_abierta(evaluacion_id))));
create policy eval_preg_gestion on public.evaluacion_preguntas for all to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id)))
  with check ((select public.profesor_de_evaluacion(evaluacion_id)));

create policy asignaciones_ver on public.evaluacion_asignaciones for select to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id))
         or (usuario_id = (select auth.uid())));
create policy asignaciones_gestion on public.evaluacion_asignaciones for all to authenticated
  using ((select public.profesor_de_evaluacion(evaluacion_id)))
  with check ((select public.profesor_de_evaluacion(evaluacion_id)));

-- Intentos: el estudiante ve el suyo; el profesor, los de estudiantes activos (RF113, RF117).
-- Tras un retiro (RF102) el profesor conserva calificación y nivel como registro académico,
-- pero pierde respuestas y mediciones (esas políticas siguen exigiendo al estudiante activo).
create policy intentos_ver on public.intentos_evaluacion for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.profesor_de_evaluacion(evaluacion_id)));
-- Los cambios se hacen solo mediante las funciones de arriba.

create policy respuestas_ver on public.respuestas for select to authenticated
  using (exists (select 1 from public.intentos_evaluacion i
                 where i.id = intento_id and i.usuario_id = (select auth.uid()))
         or (select public.profesor_ve_intento(intento_id)));

-- Mediciones de ejercicios aplicados visibles al profesor mientras el estudiante siga activo (RF117).
create policy mediciones_profesor_ver on public.mediciones for select to authenticated
  using ((select public.profesor_ve_medicion(id)));
create policy bloques_profesor_ver on public.bloques_senal for select to authenticated
  using ((select public.profesor_ve_medicion(medicion_id)));
create policy lecturas_profesor_ver on public.lecturas for select to authenticated
  using ((select public.profesor_ve_medicion(medicion_id)));

-- Tiempo real para el panel en vivo (RF113).
alter publication supabase_realtime add table public.intentos_evaluacion;
