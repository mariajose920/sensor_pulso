-- sensor_pulso · RF61: enmascaramiento de datos personales en pantallas e informes
--
-- Las pantallas del administrador muestran los datos personales de otras personas (correo, nombre, IP)
-- enmascarados. El administrador puede mostrarlos completos por un tiempo limitado cuando lo necesita,
-- y cada vez queda registrado en la auditoría (acción «revelacion_datos»).
--
--   1. registrar_evento_cliente() acepta «revelacion_datos», solo para el administrador (con MFA).
--   2. Un trigger marca como sospechoso mostrar datos personales 5 o más veces en 10 minutos.
-- El enmascaramiento en sí es de presentación y vive en src/utils/enmascarar.js; la columna
-- clasificacion_datos.enmascarar indica qué datos se enmascaran.

create or replace function public.registrar_evento_cliente(
  p_accion text,
  p_entidad text default null,
  p_entidad_id text default null,
  p_detalle jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil record;
  v_detalle jsonb;
begin
  if auth.uid() is null then
    raise exception 'Requiere sesión' using errcode = '42501';
  end if;
  if p_accion not in ('eliminacion', 'eliminacion_aula', 'cambio_permisos', 'revelacion_datos') then
    raise exception 'Acción de auditoría no permitida desde el cliente';
  end if;
  if p_accion = 'revelacion_datos' and not public.es_admin() then
    raise exception 'Solo el administrador puede mostrar datos personales sin enmascarar' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_detalle, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_detalle, '{}'::jsonb)::text) > 4000 then
    raise exception 'Detalle de auditoría no válido';
  end if;

  select pf.nombre, pf.correo into v_perfil
    from public.perfiles as pf
   where pf.id = auth.uid();

  -- Los datos del actor los pone el servidor; se descartan los que mande el cliente.
  v_detalle := (coalesce(p_detalle, '{}'::jsonb) - 'actor_nombre' - 'actor_correo')
    || jsonb_build_object(
         'actor_nombre', coalesce(v_perfil.nombre, ''),
         'actor_correo', coalesce(v_perfil.correo, '')
       );

  perform public.registrar_auditoria(p_accion, left(p_entidad, 60), left(p_entidad_id, 120), v_detalle);
end $$;

revoke all on function public.registrar_evento_cliente(text, text, text, jsonb) from public, anon;
grant execute on function public.registrar_evento_cliente(text, text, text, jsonb) to authenticated;

comment on function public.registrar_evento_cliente(text, text, text, jsonb) is
  'RF62/RF61: auditoría de acciones del navegador (eliminacion, eliminacion_aula, cambio_permisos y revelacion_datos solo admin)';

-- ---------------------------------------------------------------- revelaciones repetidas = sospechoso
create or replace function public.auditoria_marcar_revelaciones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previas integer;
begin
  if new.accion = 'revelacion_datos' and not new.sospechoso and new.actor_id is not null then
    select count(*) into v_previas from public.auditoria as a
     where a.actor_id = new.actor_id and a.accion = 'revelacion_datos'
       and a.ocurrio_en > now() - interval '10 minutes';
    if v_previas >= 4 then
      new.sospechoso := true;
      new.detalle := coalesce(new.detalle, '{}'::jsonb)
        || jsonb_build_object('motivo_sospecha', 'Datos personales mostrados sin enmascarar muchas veces en pocos minutos');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists auditoria_marcar_revelaciones on public.auditoria;
create trigger auditoria_marcar_revelaciones
  before insert on public.auditoria
  for each row execute function public.auditoria_marcar_revelaciones();
