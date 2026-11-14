-- sensor_pulso · RF62 (corrección): registro de auditoría de acciones hechas desde el navegador
-- Antes el cliente guardaba estas acciones en localStorage y su insert directo en public.auditoria
-- fallaba en silencio (la tabla no tiene política de insert). Ahora pasan por esta función del servidor:
--   · el actor sale de auth.uid() (el cliente no puede suplantarlo),
--   · solo se aceptan acciones de una lista cerrada que el servidor no registra por sí mismo,
--   · el sello de tiempo lo pone el servidor (trigger de RF63).
-- Las demás acciones de RF62 ya las registra el servidor: login (registrar_intento_login), cambio_rol y
-- cambio_rangos (triggers), descarga (registrar_descarga), publicacion y retiro_publicacion (publicar_medicion /
-- retirar_publicacion), retiro_estudiantes, exportacion_datos y supresion_datos.

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
  if p_accion not in ('eliminacion', 'eliminacion_aula', 'cambio_permisos') then
    raise exception 'Acción de auditoría no permitida desde el cliente';
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
  'RF62: auditoría de acciones del navegador (eliminacion, eliminacion_aula, cambio_permisos) con actor y hora del servidor';
