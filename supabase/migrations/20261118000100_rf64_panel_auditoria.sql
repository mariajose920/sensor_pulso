-- sensor_pulso · RF64: panel del administrador para revisar los registros de auditoría y filtrar eventos sospechosos
--
-- 1. Marcado automático de eventos sospechosos en el servidor (trigger BEFORE INSERT sobre public.auditoria).
--    Los registros son inmutables (RF63): la marca se decide al insertar y no se puede cambiar después.
-- 2. listar_auditoria(): consulta paginada y filtrada (fechas, acciones, actor, IP, texto, solo sospechosos).
-- 3. resumen_auditoria(): totales por acción y de sospechosos para los contadores del panel.
-- 4. registrar_descarga() acepta 'auditoria_csv' para que exportar el registro también quede auditado (RF62).
-- Las tres funciones de lectura exigen es_admin() (que incluye MFA) y no se otorgan a anon.

create index if not exists auditoria_sospechoso_idx
  on public.auditoria (ocurrio_en desc) where sospechoso;
create index if not exists auditoria_accion_entidad_idx
  on public.auditoria (accion, entidad_id, ocurrio_en desc);

-- ---------------------------------------------------------------- marcado de sospechosos
create or replace function public.auditoria_marcar_sospechoso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text;
  v_previos integer;
  v_hora integer;
begin
  if new.sospechoso then
    return new;                                   -- ya viene marcado por quien lo registró
  end if;

  -- Ráfaga de intentos fallidos sobre una misma cuenta (3 o más en 10 minutos)
  if new.accion = 'login_fallido' and new.entidad_id is not null then
    select count(*) into v_previos from public.auditoria a
     where a.accion = 'login_fallido' and a.entidad_id = new.entidad_id
       and a.ocurrio_en > now() - interval '10 minutes';
    if v_previos >= 2 then
      v_motivo := 'Ráfaga de intentos de inicio de sesión fallidos sobre la misma cuenta';
    end if;

  -- Un cambio de rol que otorga el privilegio de administrador
  elsif new.accion = 'cambio_rol'
        and coalesce(new.detalle ->> 'admin_despues', 'false') = 'true'
        and coalesce(new.detalle ->> 'admin_antes', 'false') <> 'true' then
    v_motivo := 'Se otorgó el privilegio de administrador';

  -- Descargas o exportaciones masivas por el mismo actor (10 o más en 10 minutos)
  elsif new.accion in ('descarga', 'exportacion_datos') and new.actor_id is not null then
    select count(*) into v_previos from public.auditoria a
     where a.actor_id = new.actor_id and a.accion in ('descarga', 'exportacion_datos')
       and a.ocurrio_en > now() - interval '10 minutes';
    if v_previos >= 9 then
      v_motivo := 'Descargas masivas del mismo usuario en pocos minutos';
    end if;

  -- Eliminaciones masivas por el mismo actor (5 o más en 10 minutos)
  elsif new.accion in ('eliminacion', 'eliminacion_aula', 'supresion_datos', 'retiro_estudiantes')
        and new.actor_id is not null then
    select count(*) into v_previos from public.auditoria a
     where a.actor_id = new.actor_id
       and a.accion in ('eliminacion', 'eliminacion_aula', 'supresion_datos', 'retiro_estudiantes')
       and a.ocurrio_en > now() - interval '10 minutes';
    if v_previos >= 4 then
      v_motivo := 'Eliminaciones masivas del mismo usuario en pocos minutos';
    end if;
  end if;

  -- Cambios sensibles en horario inusual (00:00 a 05:59, hora de Chile)
  if v_motivo is null and new.accion in ('cambio_rol', 'cambio_rangos') then
    v_hora := extract(hour from (clock_timestamp() at time zone 'America/Santiago'));
    if v_hora < 6 then
      v_motivo := 'Cambio sensible realizado en horario inusual (00:00 a 05:59)';
    end if;
  end if;

  if v_motivo is not null then
    new.sospechoso := true;
    new.detalle := coalesce(new.detalle, '{}'::jsonb) || jsonb_build_object('motivo_sospecha', v_motivo);
  end if;
  return new;
end;
$$;

drop trigger if exists auditoria_marcar_sospechoso on public.auditoria;
create trigger auditoria_marcar_sospechoso
  before insert on public.auditoria
  for each row execute function public.auditoria_marcar_sospechoso();

-- ---------------------------------------------------------------- consulta paginada
create or replace function public.listar_auditoria(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_acciones text[] default null,
  p_actor text default null,
  p_ip text default null,
  p_busqueda text default null,
  p_solo_sospechosos boolean default false,
  p_limite integer default 50,
  p_desplazamiento integer default 0
)
returns table (
  id bigint, ocurrio_en timestamptz, actor_id uuid, actor_nombre text, actor_correo text,
  accion text, entidad text, entidad_id text, detalle jsonb, ip text, sospechoso boolean, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_busqueda text;
  v_ip text;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede consultar la auditoría' using errcode = '42501';
  end if;

  -- Se escapan % _ \ para que el texto escrito se busque literalmente
  v_actor := nullif(btrim(p_actor), '');
  if v_actor is not null then
    v_actor := '%' || replace(replace(replace(v_actor, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  v_busqueda := nullif(btrim(p_busqueda), '');
  if v_busqueda is not null then
    v_busqueda := '%' || replace(replace(replace(v_busqueda, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  v_ip := nullif(btrim(p_ip), '');
  if v_ip is not null then
    v_ip := replace(replace(replace(v_ip, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select a.id, a.ocurrio_en, a.actor_id, pf.nombre, pf.correo,
         a.accion, a.entidad, a.entidad_id, a.detalle, host(a.ip), a.sospechoso,
         count(*) over ()
    from public.auditoria as a
    left join public.perfiles as pf on pf.id = a.actor_id
   where (p_desde is null or a.ocurrio_en >= p_desde)
     and (p_hasta is null or a.ocurrio_en <= p_hasta)
     and (p_acciones is null or cardinality(p_acciones) = 0 or a.accion = any (p_acciones))
     and (not coalesce(p_solo_sospechosos, false) or a.sospechoso)
     and (v_actor is null or pf.nombre ilike v_actor or pf.correo ilike v_actor or a.entidad_id ilike v_actor
          or (a.detalle ->> 'actor_correo') ilike v_actor)
     and (v_ip is null or host(a.ip) like v_ip)
     and (v_busqueda is null or a.accion ilike v_busqueda or a.entidad ilike v_busqueda
          or a.entidad_id ilike v_busqueda or a.detalle::text ilike v_busqueda)
   order by a.ocurrio_en desc, a.id desc
   limit greatest(1, least(coalesce(p_limite, 50), 200))
  offset greatest(0, coalesce(p_desplazamiento, 0));
end;
$$;

revoke all on function public.listar_auditoria(timestamptz, timestamptz, text[], text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.listar_auditoria(timestamptz, timestamptz, text[], text, text, text, boolean, integer, integer) to authenticated;

-- ---------------------------------------------------------------- resumen para los contadores
create or replace function public.resumen_auditoria(
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_por_accion jsonb;
  v_total bigint;
  v_sospechosos bigint;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede consultar la auditoría' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(t.accion, t.n), '{}'::jsonb), coalesce(sum(t.n), 0), coalesce(sum(t.s), 0)
    into v_por_accion, v_total, v_sospechosos
    from (
      select a.accion, count(*) as n, count(*) filter (where a.sospechoso) as s
        from public.auditoria as a
       where (p_desde is null or a.ocurrio_en >= p_desde)
         and (p_hasta is null or a.ocurrio_en <= p_hasta)
       group by a.accion
    ) as t;

  return jsonb_build_object('total', v_total, 'sospechosos', v_sospechosos, 'por_accion', v_por_accion);
end;
$$;

revoke all on function public.resumen_auditoria(timestamptz, timestamptz) from public, anon;
grant execute on function public.resumen_auditoria(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- exportar el registro también se audita
create or replace function public.registrar_descarga(p_tipo text, p_entidad_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  if p_tipo not in ('informe_pdf','datos_csv','grafico_imagen','auditoria_csv') then
    raise exception 'Tipo de descarga no válido';
  end if;
  if p_tipo = 'auditoria_csv' and not public.es_admin() then
    raise exception 'Solo el administrador puede exportar la auditoría' using errcode = '42501';
  end if;
  perform public.registrar_auditoria('descarga', 'descargas', p_entidad_id, jsonb_build_object('tipo', p_tipo));
end $$;
revoke all on function public.registrar_descarga(text, text) from public, anon;
grant execute on function public.registrar_descarga(text, text) to authenticated;

comment on function public.listar_auditoria(timestamptz, timestamptz, text[], text, text, text, boolean, integer, integer) is
  'RF64: consulta paginada y filtrada de la auditoría (solo administrador con MFA)';
