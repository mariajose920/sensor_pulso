-- sensor_pulso · Migración 6: comparación, casos, galería pública y aprendizaje
-- RF24–RF29, RF31, RF33–RF35, RF38–RF42, RF47, RF57, RF91

-- ================================================================ DATASETS Y SEÑALES DE REFERENCIA
create table public.datasets_publicos (                    -- RF47
  id       uuid primary key default gen_random_uuid(),
  nombre   text not null,
  fuente   text not null,                                   -- 'PhysioNet', 'GitHub', ...
  url      text,
  licencia text,
  descripcion text,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now()
);

create table public.senales_referencia (                   -- RF24, RF25, RF27, RF33
  id            uuid primary key default gen_random_uuid(),
  propietario_id uuid references public.perfiles (id) on delete cascade,   -- null = precargada de la plataforma
  dataset_id    uuid references public.datasets_publicos (id) on delete set null,
  tipo          text not null check (tipo in ('ppg_normal','patologia','arritmia','csv','simulada','dataset','validada')),
  nombre        text not null,
  descripcion   text,
  explicacion   text,                                       -- por qué se ve así (educativo)
  frecuencia_hz numeric(6,1) not null check (frecuencia_hz between 10 and 1000),
  ppg           real[] not null check (cardinality(ppg) between 10 and 100000),
  ecg_ref       real[] check (ecg_ref is null or cardinality(ecg_ref) <= 100000),   -- solo referencia educativa
  bpm_referencia numeric(5,1),
  ritmo         ritmo_cardiaco,
  edad_min      smallint, edad_max smallint,
  aprobada      boolean not null default false,             -- visible para todos tras revisión
  creado_en     timestamptz not null default now()
);
create index senales_tipo_idx on public.senales_referencia (tipo) where aprobada;

create table public.comparaciones (                        -- RF26–RF29
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.perfiles (id) on delete cascade,
  medicion_id   uuid not null references public.mediciones (id) on delete cascade,
  contra_medicion_id uuid references public.mediciones (id) on delete set null,
  contra_senal_id    uuid references public.senales_referencia (id) on delete set null,
  metodo_sync   text not null default 'correlacion_cruzada',   -- elegido por el admin (RF28)
  desfase_ms    integer,
  similitud     numeric(4,3) check (similitud between -1 and 1),
  diferencia_bpm numeric(5,1),
  analisis      text,                                        -- RF29
  creada_en     timestamptz not null default now(),
  check ((contra_medicion_id is not null)::int + (contra_senal_id is not null)::int = 1)
);
create index comparaciones_usuario_idx on public.comparaciones (usuario_id, creada_en desc);

alter table public.datasets_publicos enable row level security;
alter table public.senales_referencia enable row level security;
alter table public.comparaciones enable row level security;

create policy datasets_leer on public.datasets_publicos for select to authenticated using (true);
create policy datasets_admin on public.datasets_publicos for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy senales_leer on public.senales_referencia for select to authenticated
  using (aprobada or propietario_id = (select auth.uid()) or (select public.es_admin()));
create policy senales_cargar_propia on public.senales_referencia for insert to authenticated
  with check (propietario_id = (select auth.uid()) and tipo in ('csv','simulada') and not aprobada);
create policy senales_editar_propia on public.senales_referencia for update to authenticated
  using (propietario_id = (select auth.uid())) with check (propietario_id = (select auth.uid()) and not aprobada);
create policy senales_borrar_propia on public.senales_referencia for delete to authenticated
  using (propietario_id = (select auth.uid()));
create policy senales_admin on public.senales_referencia for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy comparaciones_propias on public.comparaciones for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

-- ================================================================ PUBLICACIÓN Y GALERÍA
-- Publicar exige confirmación explícita y guarda una vista anonimizada (RF31, RF57, RF91).
create table public.publicaciones (
  id             uuid primary key default gen_random_uuid(),
  medicion_id    uuid not null unique references public.mediciones (id) on delete cascade,
  autor_id       uuid not null references public.perfiles (id) on delete cascade,
  token_enlace   text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),   -- RF35
  titulo         text,
  -- Datos visibles públicamente: solo rangos y valores no identificativos.
  actividad_id   smallint references public.actividades (id),
  rango_edad     text not null check (rango_edad in ('<18','18-24','25-34','35-49','50+')),
  ritmo          ritmo_cardiaco,
  calidad        calidad_senal,
  bpm_promedio   numeric(5,1),
  spo2_promedio  numeric(4,1),
  dentro_de_rango boolean,
  confirmada_en  timestamptz not null,                      -- confirmación adicional explícita (RF91)
  retirada_en    timestamptz,                               -- revocación (RF90)
  creada_en      timestamptz not null default now()
);
create index publicaciones_galeria_idx on public.publicaciones (actividad_id, rango_edad, ritmo)
  where retirada_en is null;

alter table public.publicaciones enable row level security;

-- Cualquiera, con o sin sesión, ve las publicaciones vigentes (RF31, RF34, RF35).
create policy publicaciones_publicas on public.publicaciones for select to anon, authenticated
  using (retirada_en is null);
create policy publicaciones_autor_ve on public.publicaciones for select to authenticated
  using (autor_id = (select auth.uid()));
create policy publicaciones_admin on public.publicaciones for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
-- Altas y retiros solo mediante publicar_medicion() / retirar_publicacion().

-- La señal de una medición publicada es legible por todos, sin metadatos personales.
create policy bloques_publicos on public.bloques_senal for select to anon, authenticated
  using (exists (select 1 from public.publicaciones p
                 where p.medicion_id = bloques_senal.medicion_id and p.retirada_en is null));

create or replace function public.rango_de_edad(p_edad int)
returns text language sql immutable set search_path = '' as $$
  select case when p_edad < 18 then '<18' when p_edad < 25 then '18-24'
              when p_edad < 35 then '25-34' when p_edad < 50 then '35-49' else '50+' end
$$;

-- Publicar: usuarios y profesores con permiso, solo con sesión y con confirmación (RF31, RF91).
create or replace function public.publicar_medicion(p_medicion uuid, p_confirmar boolean, p_titulo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.mediciones; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  if not coalesce(p_confirmar, false) then
    raise exception 'Falta la confirmación explícita del titular';
  end if;
  if public.es_profesor() and not public.tiene_permiso('publicar_galeria') then
    raise exception 'El profesor no tiene permiso para publicar' using errcode = '42501';
  end if;
  select * into m from public.mediciones where id = p_medicion and usuario_id = auth.uid();
  if not found then raise exception 'Medición no encontrada'; end if;
  if m.fuente <> 'sensor' or m.fin is null then
    raise exception 'Solo se publican mediciones de sensor finalizadas';
  end if;
  if not exists (select 1 from public.consentimientos_aceptados c
                 where c.usuario_id = auth.uid() and c.revocado_en is null) then
    raise exception 'Se requiere consentimiento vigente';
  end if;

  insert into public.publicaciones (medicion_id, autor_id, titulo, actividad_id, rango_edad, ritmo, calidad,
                                    bpm_promedio, spo2_promedio, dentro_de_rango, confirmada_en)
  values (m.id, auth.uid(), p_titulo, m.actividad_id, public.rango_de_edad(coalesce(m.edad_al_medir, 30)),
          m.ritmo, m.calidad, m.bpm_promedio, m.spo2_promedio, m.dentro_de_rango, now())
  on conflict (medicion_id) do update set retirada_en = null, confirmada_en = now(), titulo = excluded.titulo
  returning id into v_id;

  update public.mediciones set publica = true where id = m.id;
  perform public.registrar_auditoria('publicacion', 'mediciones', m.id::text);
  return v_id;
end $$;

create or replace function public.retirar_publicacion(p_medicion uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.publicaciones set retirada_en = now()
   where medicion_id = p_medicion and (autor_id = auth.uid() or public.es_admin());
  update public.mediciones set publica = false
   where id = p_medicion and (usuario_id = auth.uid() or public.es_admin());
  perform public.registrar_auditoria('retiro_publicacion', 'mediciones', p_medicion::text);
end $$;

-- Impide marcar `publica` a mano; solo las funciones anteriores lo cambian (RF91).
create or replace function public.proteger_publica()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.publica is distinct from old.publica
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Use publicar_medicion() con confirmación' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger mediciones_proteger_publica before update of publica on public.mediciones
  for each row execute function public.proteger_publica();

revoke all on function public.publicar_medicion(uuid, boolean, text), public.retirar_publicacion(uuid)
  from public, anon;
grant execute on function public.publicar_medicion(uuid, boolean, text), public.retirar_publicacion(uuid)
  to authenticated;

-- Vista de galería con filtros por actividad, edad y estado (RF34); respeta RLS de publicaciones.
create view public.galeria with (security_invoker = true) as
  select p.id, p.token_enlace, p.titulo, a.codigo as actividad, p.rango_edad, p.ritmo, p.calidad,
         p.bpm_promedio, p.spo2_promedio, p.dentro_de_rango, p.creada_en
  from public.publicaciones p
  left join public.actividades a on a.id = p.actividad_id
  where p.retirada_en is null;
grant select on public.galeria to anon, authenticated;

-- ================================================================ APRENDIZAJE
create table public.lecciones (                            -- RF38, RF39, RF40, RF115
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  titulo     text not null,
  categoria  text not null check (categoria in ('fisiologia','sensor','esp32','bpm','spo2','ingenieria','salud')),
  contenido  jsonb not null default '[]'::jsonb,            -- bloques de texto/gráficos manipulables
  orden      smallint not null default 0,
  publicada  boolean not null default false,
  actualizado_por uuid references public.perfiles (id),
  actualizado_en timestamptz not null default now()
);
create trigger lecciones_updated before update on public.lecciones
  for each row execute function public.set_updated_at();

alter table public.preguntas
  add constraint preguntas_leccion_fk foreign key (leccion_id) references public.lecciones (id) on delete cascade;

create table public.insignias (                            -- RF42
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  criterio    jsonb not null default '{}'::jsonb
);

create table public.progreso_lecciones (
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  leccion_id  uuid not null references public.lecciones (id) on delete cascade,
  completada  boolean not null default false,
  mejor_puntaje numeric(5,2),
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, leccion_id)
);

create table public.insignias_usuario (
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  insignia_id smallint not null references public.insignias (id),
  obtenida_en timestamptz not null default now(),
  primary key (usuario_id, insignia_id)
);

alter table public.lecciones enable row level security;
alter table public.insignias enable row level security;
alter table public.progreso_lecciones enable row level security;
alter table public.insignias_usuario enable row level security;

create policy lecciones_leer on public.lecciones for select to anon, authenticated
  using (publicada or (select public.es_admin()));
create policy lecciones_admin on public.lecciones for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));   -- profesores proponen vía propuestas_cambio (RF46)
create policy insignias_leer on public.insignias for select to anon, authenticated using (true);
create policy insignias_admin on public.insignias for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy progreso_propio on public.progreso_lecciones for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy insignias_usuario_ver on public.insignias_usuario for select to authenticated
  using (usuario_id = (select auth.uid()));
-- Las insignias se otorgan desde el servidor (service role).

-- Retos de lección visibles para cualquier usuario (la clave sigue oculta).
create policy preguntas_retos_ver on public.preguntas for select to authenticated
  using (leccion_id is not null and exists (select 1 from public.lecciones l where l.id = leccion_id and l.publicada));
