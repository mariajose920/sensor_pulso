-- sensor_pulso · Migración 4: ESP32, sesiones, canales, mediciones, señal y alertas
-- RF05–RF12, RF14–RF21, RF30, RF54, RF65, RF111, RF114, RNF04, RNF09

create type public.estado_conexion as enum ('activa', 'perdida', 'finalizada');       -- RF11
create type public.ritmo_cardiaco  as enum ('normal', 'taquicardia', 'bradicardia', 'irregular'); -- RF18
create type public.calidad_senal   as enum ('buena', 'regular', 'mala');              -- RF15
create type public.fuente_senal    as enum ('sensor', 'simulador', 'csv', 'dataset', 'referencia'); -- RF27

-- ================================================================ ESP32
create table public.dispositivos (                         -- RF54
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  token_hash    text not null unique,                      -- SHA-256 del token; el token en claro nunca se guarda
  canales       smallint not null default 5 check (canales between 1 and 5),
  activo        boolean not null default true,
  revocado_en   timestamptz,
  revocado_por  uuid references public.perfiles (id),
  ultimo_contacto timestamptz,
  creado_por    uuid references public.perfiles (id),
  creado_en     timestamptz not null default now(),
  check (activo = (revocado_en is null))
);

-- ================================================================ SESIONES
create table public.sesiones_medicion (                    -- RF09, RF10, RF11, RF12
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid references public.dispositivos (id),  -- null = simulador / sin ESP32
  iniciada_por   uuid not null references public.perfiles (id),
  aula_id        uuid references public.aulas (id) on delete set null,
  evaluacion_id  uuid,                                      -- FK se agrega en la migración de evaluaciones
  ronda          smallint not null default 1 check (ronda >= 1),     -- RF111
  estado         estado_conexion not null default 'activa',
  motivo_fin     text,                                      -- 'usuario','perdida_comunicacion','sensor_desconectado'
  inicio         timestamptz not null default now(),
  fin            timestamptz,
  ultimo_latido  timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
create index sesiones_dispositivo_idx on public.sesiones_medicion (dispositivo_id, inicio desc);
create index sesiones_aula_idx on public.sesiones_medicion (aula_id) where aula_id is not null;

-- Cada canal (1..5) del ESP32 se asocia a la cuenta de un usuario (RF12, RF111).
create table public.sesion_canales (
  sesion_id  uuid not null references public.sesiones_medicion (id) on delete cascade,
  canal      smallint not null check (canal between 1 and 5),
  usuario_id uuid references public.perfiles (id),
  asignado_en timestamptz,
  primary key (sesion_id, canal)
);
create unique index sesion_canal_un_usuario on public.sesion_canales (sesion_id, usuario_id)
  where usuario_id is not null;

-- El estudiante elige un canal libre (RF111). Atómico: solo toma el canal si está libre.
create or replace function public.elegir_canal(p_sesion uuid, p_canal smallint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; v_aula uuid; v_estado public.estado_conexion;
begin
  select aula_id, estado into v_aula, v_estado from public.sesiones_medicion where id = p_sesion;
  if not found or v_estado <> 'activa' then raise exception 'Sesión no disponible'; end if;
  if v_aula is not null and not public.es_miembro_activo(v_aula) then
    raise exception 'No perteneces al aula de esta sesión' using errcode = '42501';
  end if;
  update public.sesion_canales
     set usuario_id = auth.uid(), asignado_en = now()
   where sesion_id = p_sesion and canal = p_canal and usuario_id is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- El profesor corrige la asignación o libera canales (RF111).
create or replace function public.asignar_canal(p_sesion uuid, p_canal smallint, p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_aula uuid;
begin
  select aula_id into v_aula from public.sesiones_medicion where id = p_sesion;
  if not (public.es_admin() or (v_aula is not null and public.es_profesor_del_aula(v_aula))) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.sesion_canales
     set usuario_id = p_usuario, asignado_en = case when p_usuario is null then null else now() end
   where sesion_id = p_sesion and canal = p_canal;
end $$;

revoke all on function public.elegir_canal(uuid, smallint), public.asignar_canal(uuid, smallint, uuid)
  from public, anon;
grant execute on function public.elegir_canal(uuid, smallint), public.asignar_canal(uuid, smallint, uuid)
  to authenticated;

-- Crea los canales al crear la sesión según el dispositivo.
create or replace function public.crear_canales_sesion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n smallint := 5;
begin
  if new.dispositivo_id is not null then
    select canales into n from public.dispositivos where id = new.dispositivo_id;
  end if;
  insert into public.sesion_canales (sesion_id, canal)
  select new.id, g from generate_series(1, coalesce(n, 5)) g;
  return new;
end $$;
create trigger sesion_crear_canales after insert on public.sesiones_medicion
  for each row execute function public.crear_canales_sesion();

-- ================================================================ MEDICIONES
create table public.mediciones (                           -- RF30
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.perfiles (id) on delete cascade,
  sesion_id       uuid references public.sesiones_medicion (id) on delete set null,
  canal           smallint check (canal between 1 and 5),
  fuente          fuente_senal not null default 'sensor',
  actividad_id    smallint references public.actividades (id),         -- RF14
  declaracion_id  uuid references public.declaraciones_paciente (id) on delete set null,
  consentimiento_version text references public.consentimientos_version (version),
  edad_al_medir   smallint check (edad_al_medir between 5 and 120),
  inicio          timestamptz not null default now(),
  fin             timestamptz,
  duracion_s      integer generated always as (extract(epoch from (fin - inicio))::integer) stored,
  es_reposo_inicial boolean not null default false,                   -- RF13: reposo de 1 minuto
  bpm_promedio    numeric(5,1) check (bpm_promedio between 20 and 250),
  spo2_promedio   numeric(4,1) check (spo2_promedio between 50 and 100),  -- RF114
  hrv_rmssd_ms    numeric(7,2),                                       -- RF17
  regularidad     numeric(4,3) check (regularidad between 0 and 1),   -- RF17
  ritmo           ritmo_cardiaco,                                     -- RF18
  explicacion_ritmo text,
  interpretacion  text,                                               -- RF23: lectura textual y causas de variación
  calidad         calidad_senal,                                      -- RF15
  causa_calidad   text,                                               -- RF16: ruido, movimiento, saturación
  dentro_de_rango boolean,                                            -- RF20
  estado_conexion estado_conexion not null default 'activa',
  nota            text,
  publica         boolean not null default false,                     -- se activa vía publicaciones (RF91)
  creado_en       timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
create index mediciones_usuario_idx on public.mediciones (usuario_id, inicio desc);
create index mediciones_sesion_idx on public.mediciones (sesion_id);
create index mediciones_publica_idx on public.mediciones (actividad_id, ritmo) where publica;

-- No se mide sin consentimiento vigente (RF04, RF59).
create or replace function public.exigir_consentimiento()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.fuente = 'sensor' and not exists (
       select 1 from public.consentimientos_aceptados c
       where c.usuario_id = new.usuario_id and c.revocado_en is null) then
    raise exception 'Se requiere consentimiento informado vigente antes de medir' using errcode = 'check_violation';
  end if;
  if new.consentimiento_version is null then
    select c.version into new.consentimiento_version
      from public.consentimientos_aceptados c
     where c.usuario_id = new.usuario_id and c.revocado_en is null
     order by c.aceptado_en desc limit 1;
  end if;
  return new;
end $$;
create trigger mediciones_consentimiento before insert on public.mediciones
  for each row execute function public.exigir_consentimiento();

-- Señal cruda en bloques (RF06, RF65): tamaño acotado por validación.
create table public.bloques_senal (
  id           bigint generated always as identity primary key,
  medicion_id  uuid not null references public.mediciones (id) on delete cascade,
  orden        integer not null check (orden >= 0),
  t_inicio_ms  bigint not null check (t_inicio_ms >= 0),
  frecuencia_hz numeric(6,1) not null check (frecuencia_hz between 10 and 1000),
  ir           real[] not null,                                     -- infrarrojo (BPM)
  rojo         real[],                                              -- luz roja (SpO₂)
  unique (medicion_id, orden),
  check (cardinality(ir) between 1 and 5000),
  check (rojo is null or cardinality(rojo) = cardinality(ir))
);

-- Lecturas por segundo para el tiempo real y las gráficas de 5 canales (RF07, RF08).
create table public.lecturas (
  id          bigint generated always as identity primary key,
  medicion_id uuid not null references public.mediciones (id) on delete cascade,
  t           timestamptz not null default now(),
  bpm         numeric(5,1) check (bpm between 20 and 250),
  spo2        numeric(4,1) check (spo2 between 50 and 100),
  calidad     calidad_senal
);
create index lecturas_medicion_idx on public.lecturas (medicion_id, t);

-- Alertas fuera de rango (RF21).
create table public.alertas (
  id          uuid primary key default gen_random_uuid(),
  medicion_id uuid not null references public.mediciones (id) on delete cascade,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  tipo        text not null check (tipo in ('bpm_alto','bpm_bajo','spo2_bajo','irregular','senal_mala')),
  valor       numeric(5,1),
  limite      numeric(5,1),
  sonora      boolean not null default true,
  creada_en   timestamptz not null default now()
);
create index alertas_usuario_idx on public.alertas (usuario_id, creada_en desc);

-- ---------------------------------------------------------------- RLS
alter table public.dispositivos enable row level security;
alter table public.sesiones_medicion enable row level security;
alter table public.sesion_canales enable row level security;
alter table public.mediciones enable row level security;
alter table public.bloques_senal enable row level security;
alter table public.lecturas enable row level security;
alter table public.alertas enable row level security;

-- Dispositivos: solo admin (el token nunca viaja al cliente). El ESP32 escribe con service role vía API.
create policy dispositivos_admin on public.dispositivos for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- Funciones security definer para que sesiones y canales no se referencien con RLS (evita recursión).
create or replace function public.tiene_canal_en(p_sesion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sesion_canales c
                 where c.sesion_id = p_sesion and c.usuario_id = auth.uid())
$$;

create or replace function public.puede_ver_sesion(p_sesion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sesiones_medicion s
    where s.id = p_sesion
      and (s.iniciada_por = auth.uid()
           or public.es_admin()
           or (s.aula_id is not null and (public.es_profesor_del_aula(s.aula_id)
                                          or public.es_miembro_activo(s.aula_id)))
           or public.tiene_canal_en(s.id)))
$$;

create policy sesiones_ver on public.sesiones_medicion for select to authenticated
  using ((select public.puede_ver_sesion(id)));
create policy sesiones_crear on public.sesiones_medicion for insert to authenticated
  with check (iniciada_por = (select auth.uid()));
create policy sesiones_editar on public.sesiones_medicion for update to authenticated
  using (iniciada_por = (select auth.uid())
         or (aula_id is not null and (select public.es_profesor_del_aula(aula_id))))
  with check (iniciada_por = (select auth.uid())
         or (aula_id is not null and (select public.es_profesor_del_aula(aula_id))));

create policy canales_ver on public.sesion_canales for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.puede_ver_sesion(sesion_id)));
-- Asignación solo mediante elegir_canal() / asignar_canal().

create policy mediciones_propias on public.mediciones for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
create policy mediciones_admin_ver on public.mediciones for select to authenticated
  using ((select public.es_admin()));

create policy bloques_propios on public.bloques_senal for all to authenticated
  using (exists (select 1 from public.mediciones m where m.id = medicion_id and m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from public.mediciones m where m.id = medicion_id and m.usuario_id = (select auth.uid())));
create policy lecturas_propias on public.lecturas for all to authenticated
  using (exists (select 1 from public.mediciones m where m.id = medicion_id and m.usuario_id = (select auth.uid())))
  with check (exists (select 1 from public.mediciones m where m.id = medicion_id and m.usuario_id = (select auth.uid())));
create policy alertas_propias on public.alertas for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
