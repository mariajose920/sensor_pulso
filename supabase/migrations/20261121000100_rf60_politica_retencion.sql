-- sensor_pulso · RF60: política de retención (borrado o anonimización automática tras un periodo definido)
--
-- Antes: 4 políticas (lecturas, fichas de sesión, intentos de acceso, contadores) y una función diaria que
-- ignoraba la acción «anonimizar». Las mediciones, la señal PPG cruda, las alertas y las comparaciones no se
-- eliminaban nunca. Esta migración:
--   1. Agrega las políticas que faltaban y hace posible «anonimizar» las mediciones.
--   2. Un solo lugar (retencion_filas) decide qué se toca, y lo usan la vista previa y la ejecución: lo que el
--      administrador ve como «pendiente» es exactamente lo que se aplicará.
--   3. Cada ejecución deja en la auditoría el detalle por tabla y si fue automática o manual.
--   4. El administrador puede ver el estado, simular, cambiar los plazos y aplicar la retención a mano (todo auditado).
-- Nunca se toca: el registro de auditoría (inmutable) ni lo publicado en la galería mientras su titular no lo retire.

-- ---------------------------------------------------------------- 1. estructura
alter table public.politicas_retencion
  add column if not exists ultima_ejecucion timestamptz,
  add column if not exists ultimas_filas integer;

alter table public.politicas_retencion drop constraint if exists politicas_retencion_dias_max;
alter table public.politicas_retencion
  add constraint politicas_retencion_dias_max check (dias <= 3650);

-- Las mediciones se anonimizan (nunca se borran por retención) y solo ellas se anonimizan.
alter table public.politicas_retencion drop constraint if exists politicas_retencion_accion_valida;
alter table public.politicas_retencion
  add constraint politicas_retencion_accion_valida check ((tabla = 'mediciones') = (accion = 'anonimizar'));

-- Una medición anonimizada ya no pertenece a nadie: se conserva solo para estadísticas.
alter table public.mediciones alter column usuario_id drop not null;
comment on column public.mediciones.usuario_id is
  'Titular de la medición. Queda en NULL cuando la política de retención anonimiza la medición (RF60).';

insert into public.politicas_retencion (tabla, dias, accion) values
  ('lecturas', 365, 'borrar'),
  ('declaraciones_paciente', 365, 'borrar'),
  ('intentos_login', 90, 'borrar'),
  ('limites_peticiones', 2, 'borrar'),
  ('bloques_senal', 365, 'borrar'),
  ('alertas', 365, 'borrar'),
  ('comparaciones', 730, 'borrar'),
  ('mediciones', 730, 'anonimizar'),
  ('bloqueos_cuenta', 30, 'borrar'),
  ('invitaciones_aula', 180, 'borrar')
on conflict (tabla) do nothing;

insert into public.clasificacion_datos (tabla, columna, clase, cifrado_campo, enmascarar) values
  ('politicas_retencion', 'ultima_ejecucion', 'privado', false, false),
  ('politicas_retencion', 'ultimas_filas', 'privado', false, false)
on conflict (tabla, columna) do nothing;

-- ---------------------------------------------------------------- 2. qué se toca y cuántas filas
-- p_ejecutar = false: solo cuenta (vista previa). p_ejecutar = true: borra o anonimiza y devuelve cuántas filas.
create or replace function public.retencion_filas(
  p_tabla text, p_dias integer, p_accion text, p_ejecutar boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_corte timestamptz := now() - make_interval(days => p_dias);
  n integer := 0;
begin
  if p_tabla = 'lecturas' and p_accion = 'borrar' then
    if p_ejecutar then
      with d as (delete from public.lecturas where t < v_corte returning 1) select count(*) into n from d;
    else
      select count(*) into n from public.lecturas where t < v_corte;
    end if;

  elsif p_tabla = 'bloques_senal' and p_accion = 'borrar' then
    -- La señal de una medición publicada en la galería se conserva: su titular la publicó y puede retirarla.
    if p_ejecutar then
      with d as (
        delete from public.bloques_senal as b using public.mediciones as m
         where m.id = b.medicion_id and m.inicio < v_corte and not m.publica
        returning 1
      ) select count(*) into n from d;
    else
      select count(*) into n from public.bloques_senal as b
        join public.mediciones as m on m.id = b.medicion_id
       where m.inicio < v_corte and not m.publica;
    end if;

  elsif p_tabla = 'declaraciones_paciente' and p_accion = 'borrar' then
    -- La ficha propia (sesion_id nulo) se conserva: solo se borran las fichas ligadas a una sesión o canal.
    if p_ejecutar then
      with d as (
        delete from public.declaraciones_paciente where creado_en < v_corte and sesion_id is not null returning 1
      ) select count(*) into n from d;
    else
      select count(*) into n from public.declaraciones_paciente where creado_en < v_corte and sesion_id is not null;
    end if;

  elsif p_tabla = 'alertas' and p_accion = 'borrar' then
    if p_ejecutar then
      with d as (delete from public.alertas where creada_en < v_corte returning 1) select count(*) into n from d;
    else
      select count(*) into n from public.alertas where creada_en < v_corte;
    end if;

  elsif p_tabla = 'comparaciones' and p_accion = 'borrar' then
    if p_ejecutar then
      with d as (delete from public.comparaciones where creada_en < v_corte returning 1) select count(*) into n from d;
    else
      select count(*) into n from public.comparaciones where creada_en < v_corte;
    end if;

  elsif p_tabla = 'mediciones' and p_accion = 'anonimizar' then
    -- Se corta el vínculo con la persona y se limpian los campos que permiten reconocerla.
    -- Quedan los valores medidos (BPM, SpO₂, ritmo) para estadísticas. Lo publicado no se toca.
    if p_ejecutar then
      with d as (
        update public.mediciones
           set usuario_id = null, nota = null, id_cliente = null, declaracion_id = null, sesion_id = null
         where usuario_id is not null and inicio < v_corte and not publica
        returning 1
      ) select count(*) into n from d;
    else
      select count(*) into n from public.mediciones where usuario_id is not null and inicio < v_corte and not publica;
    end if;

  elsif p_tabla = 'intentos_login' and p_accion = 'borrar' then
    if p_ejecutar then
      with d as (delete from public.intentos_login where ocurrio_en < v_corte returning 1) select count(*) into n from d;
    else
      select count(*) into n from public.intentos_login where ocurrio_en < v_corte;
    end if;

  elsif p_tabla = 'limites_peticiones' and p_accion = 'borrar' then
    if p_ejecutar then
      with d as (delete from public.limites_peticiones where ventana < v_corte returning 1) select count(*) into n from d;
    else
      select count(*) into n from public.limites_peticiones where ventana < v_corte;
    end if;

  elsif p_tabla = 'bloqueos_cuenta' and p_accion = 'borrar' then
    if p_ejecutar then
      with d as (delete from public.bloqueos_cuenta where bloqueado_hasta < v_corte returning 1) select count(*) into n from d;
    else
      select count(*) into n from public.bloqueos_cuenta where bloqueado_hasta < v_corte;
    end if;

  elsif p_tabla = 'invitaciones_aula' and p_accion = 'borrar' then
    if p_ejecutar then
      with d as (delete from public.invitaciones_aula where enviada_en < v_corte returning 1) select count(*) into n from d;
    else
      select count(*) into n from public.invitaciones_aula where enviada_en < v_corte;
    end if;
  end if;

  return n;
end;
$$;

revoke all on function public.retencion_filas(text, integer, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. ejecución con registro por tabla
create or replace function public.retencion_ejecutar(p_origen text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer;
  total integer := 0;
  v_por_tabla jsonb := '{}'::jsonb;
begin
  for r in select * from public.politicas_retencion as p where p.activa order by p.tabla loop
    n := public.retencion_filas(r.tabla, r.dias, r.accion, true);
    total := total + n;
    v_por_tabla := v_por_tabla || jsonb_build_object(r.tabla, n);
    update public.politicas_retencion
       set ultima_ejecucion = now(), ultimas_filas = n
     where tabla = r.tabla;
  end loop;

  -- La auditoría nunca se toca; cada ejecución deja constancia de qué se hizo y quién la pidió.
  insert into public.auditoria (actor_id, accion, entidad, detalle)
  values (auth.uid(), 'retencion', 'sistema',
          jsonb_build_object('origen', p_origen, 'filas', total, 'por_tabla', v_por_tabla));
  return total;
end;
$$;

revoke all on function public.retencion_ejecutar(text) from public, anon, authenticated;

-- La que agenda pg_cron (no se otorga a nadie más).
create or replace function public.aplicar_retencion()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.retencion_ejecutar('automatica');
end;
$$;

revoke all on function public.aplicar_retencion() from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. funciones del administrador
create or replace function public.vista_previa_retencion()
returns table (
  tabla text, dias integer, accion text, activa boolean,
  pendientes integer, ultima_ejecucion timestamptz, ultimas_filas integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede consultar la retención' using errcode = '42501';
  end if;

  return query
  select p.tabla, p.dias, p.accion, p.activa,
         public.retencion_filas(p.tabla, p.dias, p.accion, false),
         p.ultima_ejecucion, p.ultimas_filas
    from public.politicas_retencion as p
   order by p.tabla;
end;
$$;

revoke all on function public.vista_previa_retencion() from public, anon;
grant execute on function public.vista_previa_retencion() to authenticated;

create or replace function public.estado_retencion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron boolean;
  v_horario text;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede consultar la retención' using errcode = '42501';
  end if;

  v_cron := exists (select 1 from pg_extension where extname = 'pg_cron');
  if v_cron then
    begin
      execute 'select schedule from cron.job where jobname = $1' into v_horario using 'sensor_pulso_retencion';
    exception when others then
      v_horario := null;
    end;
  end if;

  return jsonb_build_object('cron_disponible', v_cron, 'programada', v_horario is not null, 'horario', v_horario);
end;
$$;

revoke all on function public.estado_retencion() from public, anon;
grant execute on function public.estado_retencion() to authenticated;

create or replace function public.ejecutar_retencion_ahora()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede aplicar la retención' using errcode = '42501';
  end if;
  return public.retencion_ejecutar('manual');
end;
$$;

revoke all on function public.ejecutar_retencion_ahora() from public, anon;
grant execute on function public.ejecutar_retencion_ahora() to authenticated;

create or replace function public.actualizar_politica_retencion(
  p_tabla text, p_dias integer, p_activa boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede cambiar la retención' using errcode = '42501';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 3650 then
    raise exception 'El plazo debe estar entre 1 y 3650 días';
  end if;

  update public.politicas_retencion
     set dias = p_dias, activa = coalesce(p_activa, activa)
   where tabla = p_tabla;
  if not found then
    raise exception 'No existe una política de retención para %', p_tabla;
  end if;
end;
$$;

revoke all on function public.actualizar_politica_retencion(text, integer, boolean) from public, anon;
grant execute on function public.actualizar_politica_retencion(text, integer, boolean) to authenticated;

-- Todo cambio de plazo, acción o estado queda en la auditoría (viene del RPC o de un cambio directo).
create or replace function public.politicas_retencion_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'cambio_retencion', 'politicas_retencion', new.tabla,
          jsonb_build_object(
            'antes', jsonb_build_object('dias', old.dias, 'accion', old.accion, 'activa', old.activa),
            'despues', jsonb_build_object('dias', new.dias, 'accion', new.accion, 'activa', new.activa)));
  return new;
end;
$$;

drop trigger if exists politicas_retencion_auditar on public.politicas_retencion;
create trigger politicas_retencion_auditar
  after update of dias, accion, activa on public.politicas_retencion
  for each row
  when (old.dias is distinct from new.dias or old.accion is distinct from new.accion or old.activa is distinct from new.activa)
  execute function public.politicas_retencion_auditar();

-- ---------------------------------------------------------------- 5. agenda diaria (04:00)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sensor_pulso_retencion', '0 4 * * *', 'select public.aplicar_retencion()');
  end if;
end $$;
