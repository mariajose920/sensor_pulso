-- RF111 / RF12 / RF08 · Varios canales por sesión solo para profesor y administrador (RNF12)
--
-- Antes (migración 20261027000400) el índice único `sesion_canal_un_usuario` impedía que cualquier
-- cuenta tuviera más de un canal por sesión. Ahora:
--   * estudiantes y usuarios normales siguen con UN solo canal por sesión (lo exige un trigger);
--   * profesor y administrador pueden tener hasta 5 (los 5 canales del ESP32);
--   * `agregar_canal_automatico()` toma el siguiente canal libre sin que nadie lo elija a mano;
--   * cada canal agregado deja constancia de los tres requisitos previos a medir (RF03 ficha del
--     paciente, RF88 política de privacidad, RF04/RF59 consentimiento informado vigente).

-- ---------------------------------------------------------------- 1. quitar el límite rígido
drop index if exists public.sesion_canal_un_usuario;

-- ¿Esta cuenta puede tener más de un canal por sesión? Solo profesor o administrador.
create or replace function public.puede_tener_varios_canales(p_usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.es_admin or p.rol = 'profesor' from public.perfiles p where p.id = p_usuario), false)
$$;
revoke all on function public.puede_tener_varios_canales(uuid) from public, anon;
grant execute on function public.puede_tener_varios_canales(uuid) to authenticated;

-- ---------------------------------------------------------------- 2. requisitos por canal (evidencia)
-- Una fila por canal ocupado que haya pasado por «Agregar otro canal». Solo la escribe la función
-- `agregar_canal_automatico`; no hay políticas de insert/update/delete para los clientes.
alter table public.declaraciones_paciente
  add column if not exists sesion_id uuid references public.sesiones_medicion (id) on delete set null,
  add column if not exists canal smallint check (canal between 1 and 5);
comment on column public.declaraciones_paciente.sesion_id is
  'RF111: ficha de la persona de un canal adicional (sesión y canal). Null = ficha propia de la cuenta.';

create table public.sesion_canal_requisitos (
  sesion_id              uuid not null,
  canal                  smallint not null,
  usuario_id             uuid not null references public.perfiles (id) on delete cascade,
  declaracion_id         uuid not null references public.declaraciones_paciente (id) on delete cascade, -- RF03
  politica_version       text not null,                                                                 -- RF88
  consentimiento_version text not null references public.consentimientos_version (version),             -- RF04, RF59
  completado_en          timestamptz not null default now(),
  primary key (sesion_id, canal),
  foreign key (sesion_id, canal) references public.sesion_canales (sesion_id, canal) on delete cascade
);
create index sesion_canal_requisitos_usuario_idx on public.sesion_canal_requisitos (usuario_id);

alter table public.sesion_canal_requisitos enable row level security;
create policy canal_requisitos_ver on public.sesion_canal_requisitos for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_admin()));
revoke all on public.sesion_canal_requisitos from anon;
revoke insert, update, delete on public.sesion_canal_requisitos from authenticated;

-- ---------------------------------------------------------------- 3. regla por rol (reemplaza al índice)
create or replace function public.limitar_canales_por_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if tg_op = 'UPDATE' and new.usuario_id is not distinct from old.usuario_id then
    return new;
  end if;

  -- Si el canal cambia de dueño o se libera, los requisitos del dueño anterior ya no valen.
  if tg_op = 'UPDATE' and old.usuario_id is not null then
    delete from public.sesion_canal_requisitos where sesion_id = old.sesion_id and canal = old.canal;
  end if;

  if new.usuario_id is null then
    return new;
  end if;

  -- Serializa a quien pide dos canales a la vez en la misma sesión.
  perform pg_advisory_xact_lock(hashtextextended(new.sesion_id::text || new.usuario_id::text, 0));

  select count(*) into n from public.sesion_canales
   where sesion_id = new.sesion_id and usuario_id = new.usuario_id and canal <> new.canal;

  if n >= 1 and not public.puede_tener_varios_canales(new.usuario_id) then
    raise exception 'Solo el profesor y el administrador pueden tener más de un canal por sesión'
      using errcode = '23505';
  end if;
  return new;
end $$;

create trigger sesion_canales_limite_por_usuario
  before insert or update of usuario_id on public.sesion_canales
  for each row execute function public.limitar_canales_por_usuario();

-- ---------------------------------------------------------------- 4. «Agregar otro canal»
-- Toma el siguiente canal libre (el de número más bajo) para quien llama. Nadie elige el número.
-- Solo profesor o administrador (con MFA si está exigido, RF49). Exige los tres requisitos:
--   p_declaracion            ficha RF03 de la persona de este canal (guardada por quien llama)
--   p_politica_version       versión vigente de la política de privacidad aceptada (RF88)
--   p_consentimiento_version versión activa del consentimiento informado aceptado (RF04)
--   p_canal                  solo para volver a completar los requisitos de un canal que ya es tuyo
--                            (por ejemplo tras recargar la página). Si es null se toma el siguiente libre.
create or replace function public.agregar_canal_automatico(
  p_sesion uuid,
  p_declaracion uuid,
  p_politica_version text,
  p_consentimiento_version text,
  p_canal smallint default null
) returns smallint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_aula uuid; v_inicia uuid; v_estado public.estado_conexion;
  v_canal smallint; v_propios integer;
begin
  if v_uid is null or not (public.es_admin() or public.es_profesor()) then
    raise exception 'Solo el profesor y el administrador pueden agregar otro canal' using errcode = '42501';
  end if;

  select aula_id, iniciada_por, estado into v_aula, v_inicia, v_estado
    from public.sesiones_medicion where id = p_sesion;
  if not found or v_estado <> 'activa' then raise exception 'Sesión no disponible'; end if;
  if not (public.es_admin() or v_inicia = v_uid
          or (v_aula is not null and public.es_profesor_del_aula(v_aula))) then
    raise exception 'No tienes permiso sobre esta sesión' using errcode = '42501';
  end if;

  -- Requisitos previos: ficha propia, política vigente y consentimiento activo.
  if p_declaracion is null or not exists (
       select 1 from public.declaraciones_paciente d where d.id = p_declaracion and d.usuario_id = v_uid) then
    raise exception 'Falta la ficha del paciente de este canal (RF03)' using errcode = 'P0001';
  end if;
  if p_politica_version is distinct from
     (select d.version from public.documentos_legales d where d.clave = 'politica_privacidad') then
    raise exception 'Debes aceptar la política de privacidad vigente (RF88)' using errcode = 'P0001';
  end if;
  if p_consentimiento_version is null or not exists (
       select 1 from public.consentimientos_version c where c.version = p_consentimiento_version and c.activa) then
    raise exception 'Falta el consentimiento informado vigente (RF04)' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_sesion::text || v_uid::text, 0));

  if p_canal is not null then
    -- Completar requisitos de un canal propio: no se toma otro canal.
    if not exists (select 1 from public.sesion_canales
                    where sesion_id = p_sesion and canal = p_canal and usuario_id = v_uid) then
      raise exception 'Ese canal no es tuyo' using errcode = '42501';
    end if;
    v_canal := p_canal;
    delete from public.sesion_canal_requisitos where sesion_id = p_sesion and canal = v_canal;
  else
    select count(*) into v_propios from public.sesion_canales where sesion_id = p_sesion and usuario_id = v_uid;
    if v_propios >= 5 then raise exception 'Ya tienes los 5 canales de esta sesión'; end if;

    -- Siguiente canal libre; skip locked evita que dos personas tomen el mismo.
    select canal into v_canal from public.sesion_canales
     where sesion_id = p_sesion and usuario_id is null
     order by canal limit 1 for update skip locked;
    if v_canal is null then raise exception 'No hay canales libres en esta sesión'; end if;

    update public.sesion_canales set usuario_id = v_uid, asignado_en = now()
     where sesion_id = p_sesion and canal = v_canal;
  end if;

  update public.declaraciones_paciente set sesion_id = p_sesion, canal = v_canal where id = p_declaracion;

  insert into public.sesion_canal_requisitos
    (sesion_id, canal, usuario_id, declaracion_id, politica_version, consentimiento_version)
  values (p_sesion, v_canal, v_uid, p_declaracion, p_politica_version, p_consentimiento_version);

  return v_canal;
end $$;

revoke all on function public.agregar_canal_automatico(uuid, uuid, text, text, smallint) from public, anon;
grant execute on function public.agregar_canal_automatico(uuid, uuid, text, text, smallint) to authenticated;
