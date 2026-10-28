-- sensor_pulso · Migración 7: seguridad operativa y cumplimiento
-- RF50, RF56, RF58, RF60, RF67, RF72, RF73, RF88, RF89, RF90, RF92, RF95, RNF14

-- ================================================================ BLOQUEO DE CUENTA Y LÍMITE DE PETICIONES
create table public.intentos_login (                       -- RF50
  id         bigint generated always as identity primary key,
  correo     text not null,
  ip         inet,
  exitoso    boolean not null,
  ocurrio_en timestamptz not null default now()
);
create index intentos_login_correo_idx on public.intentos_login (lower(correo), ocurrio_en desc);

create table public.bloqueos_cuenta (
  correo        text primary key,
  bloqueado_hasta timestamptz not null,
  motivo        text not null default 'intentos_fallidos',
  creado_en     timestamptz not null default now()
);

-- Registra un intento y bloquea 15 min tras 5 fallos en 15 min. Lo llama el servidor.
create or replace function public.registrar_intento_login(p_correo text, p_exitoso boolean, p_ip inet default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_fallos int; v_hasta timestamptz;
begin
  insert into public.intentos_login (correo, ip, exitoso) values (lower(p_correo), p_ip, p_exitoso);
  if p_exitoso then
    delete from public.bloqueos_cuenta where correo = lower(p_correo);
    insert into public.auditoria (accion, entidad, entidad_id, ip)       -- RF62: inicios de sesión
    values ('login', 'perfiles', lower(p_correo), p_ip);
    return null;
  end if;
  select count(*) into v_fallos from public.intentos_login
   where lower(correo) = lower(p_correo) and not exitoso and ocurrio_en > now() - interval '15 minutes';
  if v_fallos >= 5 then
    v_hasta := now() + interval '15 minutes';
    insert into public.bloqueos_cuenta (correo, bloqueado_hasta) values (lower(p_correo), v_hasta)
    on conflict (correo) do update set bloqueado_hasta = excluded.bloqueado_hasta;
    insert into public.auditoria (accion, entidad, entidad_id, detalle, ip, sospechoso)
    values ('bloqueo_cuenta', 'perfiles', lower(p_correo), jsonb_build_object('fallos', v_fallos), p_ip, true);
  end if;
  return v_hasta;
end $$;
revoke all on function public.registrar_intento_login(text, boolean, inet) from public, anon, authenticated;

create table public.limites_peticiones (                   -- RF67
  clave       text not null,                                 -- 'login:ip', 'esp32:dispositivo', 'api:usuario'
  ventana     timestamptz not null,
  contador    integer not null default 1,
  primary key (clave, ventana)
);

create or replace function public.consumir_limite(p_clave text, p_maximo int, p_segundos int default 60)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ventana timestamptz; v_n int;
begin
  v_ventana := to_timestamp(floor(extract(epoch from now()) / p_segundos) * p_segundos);
  insert into public.limites_peticiones (clave, ventana) values (p_clave, v_ventana)
  on conflict (clave, ventana) do update set contador = public.limites_peticiones.contador + 1
  returning contador into v_n;
  return v_n <= p_maximo;
end $$;
revoke all on function public.consumir_limite(text, int, int) from public, anon, authenticated;

-- ================================================================ NOTIFICACIONES, INCIDENTES Y BRECHAS
create table public.notificaciones_seguridad (             -- RF72
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('intentos_masivos','token_esp32_comprometido','bloqueo_cuenta','otro')),
  severidad  text not null default 'media' check (severidad in ('baja','media','alta','critica')),
  mensaje    text not null,
  detalle    jsonb not null default '{}'::jsonb,
  leida      boolean not null default false,
  creada_en  timestamptz not null default now()
);

create table public.incidentes (                           -- RF73
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  descripcion   text,
  severidad     text not null default 'media' check (severidad in ('baja','media','alta','critica')),
  estado        text not null default 'abierto' check (estado in ('abierto','en_analisis','contenido','resuelto','cerrado')),
  reportado_por uuid references public.perfiles (id),
  asignado_a    uuid references public.perfiles (id),
  afecta_datos_personales boolean not null default false,
  abierto_en    timestamptz not null default now(),
  cerrado_en    timestamptz,
  lecciones     text
);

create table public.brechas (                              -- RF92
  id            uuid primary key default gen_random_uuid(),
  incidente_id  uuid not null references public.incidentes (id) on delete cascade,
  afectados_estimados integer,
  datos_comprometidos text,
  afectados_notificados_en timestamptz,
  autoridad_notificada_en  timestamptz,
  medidas       text,
  creada_en     timestamptz not null default now()
);

-- ================================================================ DERECHOS DEL TITULAR
create table public.solicitudes_derechos (                 -- RF58, RF89, RF90
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles (id) on delete cascade,
  tipo         text not null check (tipo in ('acceso','rectificacion','supresion','oposicion','portabilidad','revocar_consentimiento')),
  detalle      text,
  estado       text not null default 'recibida' check (estado in ('recibida','en_proceso','resuelta','rechazada')),
  recibida_en  timestamptz not null default now(),
  vence_en     timestamptz not null default (now() + interval '30 days'),
  resuelta_en  timestamptz,
  atendida_por uuid references public.perfiles (id),
  respuesta    text
);
create index derechos_usuario_idx on public.solicitudes_derechos (usuario_id, recibida_en desc);

-- Revocar el consentimiento retira las publicaciones del titular (RF90).
create or replace function public.revocar_consentimiento()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.consentimientos_aceptados set revocado_en = now()
   where usuario_id = auth.uid() and revocado_en is null;
  update public.publicaciones set retirada_en = now() where autor_id = auth.uid() and retirada_en is null;
  update public.mediciones set publica = false where usuario_id = auth.uid() and publica;
  insert into public.solicitudes_derechos (usuario_id, tipo, estado, resuelta_en)
  values (auth.uid(), 'revocar_consentimiento', 'resuelta', now());
  perform public.registrar_auditoria('revocacion_consentimiento', 'perfiles', auth.uid()::text);
end $$;
revoke all on function public.revocar_consentimiento() from public, anon;
grant execute on function public.revocar_consentimiento() to authenticated;

-- ================================================================ CLASIFICACIÓN, RETENCIÓN Y POLÍTICA
create table public.clasificacion_datos (                  -- RF56, RF61
  tabla        text not null,
  columna      text not null,
  clase        text not null check (clase in ('publico','privado','sensible_salud')),
  cifrado_campo boolean not null default false,
  enmascarar   boolean not null default false,
  primary key (tabla, columna)
);

create table public.politicas_retencion (                  -- RF60
  tabla       text primary key,
  dias        integer not null check (dias > 0),
  accion      text not null check (accion in ('borrar','anonimizar')),
  activa      boolean not null default true
);

create table public.documentos_legales (                   -- RF75, RF88, RF94, RF95
  clave       text primary key,                              -- 'politica_privacidad','aviso_educativo','aviso_no_medico','alojamiento'
  titulo      text not null,
  contenido   text not null,
  version     text not null,
  vigente_desde timestamptz not null default now()
);

-- Aplica la retención. Se agenda con pg_cron (ver migración de datos iniciales). Nunca toca la auditoría.
create or replace function public.aplicar_retencion()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer; total integer := 0;
begin
  for r in select * from public.politicas_retencion where activa loop
    if r.tabla = 'lecturas' and r.accion = 'borrar' then
      delete from public.lecturas where t < now() - make_interval(days => r.dias);
    elsif r.tabla = 'intentos_login' and r.accion = 'borrar' then
      delete from public.intentos_login where ocurrio_en < now() - make_interval(days => r.dias);
    elsif r.tabla = 'limites_peticiones' and r.accion = 'borrar' then
      delete from public.limites_peticiones where ventana < now() - make_interval(days => r.dias);
    elsif r.tabla = 'declaraciones_paciente' and r.accion = 'borrar' then
      delete from public.declaraciones_paciente where creado_en < now() - make_interval(days => r.dias);
    else
      continue;
    end if;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  insert into public.auditoria (accion, entidad, detalle) values ('retencion', 'sistema', jsonb_build_object('filas', total));
  return total;
end $$;
revoke all on function public.aplicar_retencion() from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.intentos_login enable row level security;
alter table public.bloqueos_cuenta enable row level security;
alter table public.limites_peticiones enable row level security;
alter table public.notificaciones_seguridad enable row level security;
alter table public.incidentes enable row level security;
alter table public.brechas enable row level security;
alter table public.solicitudes_derechos enable row level security;
alter table public.clasificacion_datos enable row level security;
alter table public.politicas_retencion enable row level security;
alter table public.documentos_legales enable row level security;

-- intentos_login, bloqueos_cuenta y limites_peticiones: sin políticas (solo service role / funciones).
create policy notif_admin on public.notificaciones_seguridad for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy incidentes_admin on public.incidentes for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy brechas_admin on public.brechas for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy derechos_propios_ver on public.solicitudes_derechos for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_admin()));
create policy derechos_propios_crear on public.solicitudes_derechos for insert to authenticated
  with check (usuario_id = (select auth.uid()) and estado = 'recibida');
create policy derechos_admin_resuelve on public.solicitudes_derechos for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy clasificacion_leer on public.clasificacion_datos for select to authenticated using (true);
create policy clasificacion_admin on public.clasificacion_datos for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy retencion_admin on public.politicas_retencion for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy legales_leer on public.documentos_legales for select to anon, authenticated using (true);
create policy legales_admin on public.documentos_legales for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
