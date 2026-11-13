-- sensor_pulso · RF03 (ampliación): la ficha propia del paciente se conserva en la base
-- La ficha propia de cada persona (estudiante, profesor o administrador) debe quedar guardada aunque cierre la sesión o
-- pasen días sin conectarse, y solo cambiar cuando la persona lo pida. La retención diaria (RF60) borraba las fichas por
-- fecha de creación (365 días), también la propia. Ahora la retención solo alcanza a las fichas de canales adicionales y
-- de sesiones (sesion_id no nulo); la ficha propia (sesion_id nulo) solo se elimina cuando la persona ejerce su derecho
-- de supresión (función de derechos del titular) o borra su cuenta.

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
      -- La ficha propia (sesion_id nulo) se conserva: solo se borran las fichas ligadas a una sesión/canal.
      delete from public.declaraciones_paciente
       where creado_en < now() - make_interval(days => r.dias)
         and sesion_id is not null;
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
