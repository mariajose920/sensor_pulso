-- sensor_pulso · Migración 9: automatizaciones, vistas, derechos del titular y lecciones base
-- RF10, RF11, RF20, RF21, RF22, RF36, RF37, RF38, RF43, RF46, RF54, RF58, RF62, RF72, RF113, RNF04

-- ================================================================ DISPOSITIVOS ESP32 (RF54)
-- El token se muestra UNA sola vez al crearlo; en la base solo queda su hash SHA-256.
create or replace function public.crear_dispositivo(p_nombre text, p_canales smallint default 5)
returns table (dispositivo_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid;
begin
  if not public.es_admin() then raise exception 'Solo el administrador' using errcode = '42501'; end if;
  v_token := 'esp_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.dispositivos (nombre, token_hash, canales, creado_por)
  values (p_nombre, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_canales, auth.uid())
  returning id into v_id;
  perform public.registrar_auditoria('crear_dispositivo', 'dispositivos', v_id::text);
  return query select v_id, v_token;
end $$;

create or replace function public.revocar_dispositivo(p_dispositivo uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador' using errcode = '42501'; end if;
  update public.dispositivos
     set activo = false, revocado_en = now(), revocado_por = auth.uid()
   where id = p_dispositivo and activo;
  update public.sesiones_medicion
     set estado = 'finalizada', fin = now(), motivo_fin = 'dispositivo_revocado'
   where dispositivo_id = p_dispositivo and estado = 'activa';
  insert into public.notificaciones_seguridad (tipo, severidad, mensaje, detalle)          -- RF72
  values ('token_esp32_comprometido', 'alta', 'Se revocó el token de un ESP32',
          jsonb_build_object('dispositivo_id', p_dispositivo, 'motivo', p_motivo));
  perform public.registrar_auditoria('revocar_dispositivo', 'dispositivos', p_dispositivo::text,
          jsonb_build_object('motivo', p_motivo), true);
end $$;

-- Valida el token que envía el ESP32. Solo la llama el servidor (service role), nunca el cliente.
create or replace function public.validar_token_dispositivo(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.dispositivos
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and activo;
  if v_id is not null then
    update public.dispositivos set ultimo_contacto = now() where id = v_id;
  end if;
  return v_id;
end $$;

revoke all on function public.crear_dispositivo(text, smallint), public.revocar_dispositivo(uuid, text)
  from public, anon;
grant execute on function public.crear_dispositivo(text, smallint), public.revocar_dispositivo(uuid, text)
  to authenticated;
revoke all on function public.validar_token_dispositivo(text) from public, anon, authenticated;
grant execute on function public.validar_token_dispositivo(text) to service_role;

-- ================================================================ SESIONES: LATIDO Y PÉRDIDA DE COMUNICACIÓN (RF10, RF11)
create or replace function public.registrar_latido(p_sesion uuid)
returns void language sql security definer set search_path = '' as $$
  update public.sesiones_medicion
     set ultimo_latido = now(), estado = 'activa'
   where id = p_sesion and estado in ('activa', 'perdida') and fin is null
$$;
revoke all on function public.registrar_latido(uuid) from public, anon, authenticated;
grant execute on function public.registrar_latido(uuid) to service_role;

-- Marca como pérdida las sesiones sin latido y cierra sus mediciones conservando lo medido
-- (decisión provisional del pendiente 3.2: guardar lo medido hasta el corte).
create or replace function public.cerrar_sesiones_inactivas()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer; v_seg integer;
begin
  select coalesce((select (valor #>> '{}')::integer from public.config_plataforma
                    where clave = 'segundos_sin_latido_para_perdida'), 30) into v_seg;
  with perdidas as (
    update public.sesiones_medicion
       set estado = 'perdida', fin = now(), motivo_fin = 'perdida_comunicacion'
     where estado = 'activa' and dispositivo_id is not null
       and ultimo_latido < now() - make_interval(secs => v_seg)
    returning id)
  update public.mediciones m
     set fin = now(), estado_conexion = 'perdida'
   where m.sesion_id in (select id from perdidas) and m.fin is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cerrar_sesiones_inactivas() from public, anon, authenticated;

create or replace function public.finalizar_sesion(p_sesion uuid, p_motivo text default 'usuario')
returns void language plpgsql security definer set search_path = '' as $$
declare v_aula uuid; v_ini uuid;
begin
  select aula_id, iniciada_por into v_aula, v_ini from public.sesiones_medicion where id = p_sesion;
  if not found then raise exception 'Sesión no encontrada'; end if;
  if not (v_ini = auth.uid() or public.es_admin()
          or (v_aula is not null and public.es_profesor_del_aula(v_aula))) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.sesiones_medicion set estado = 'finalizada', fin = now(), motivo_fin = p_motivo
   where id = p_sesion and fin is null;
  update public.mediciones set fin = now(), estado_conexion = 'finalizada'
   where sesion_id = p_sesion and fin is null;
end $$;
revoke all on function public.finalizar_sesion(uuid, text) from public, anon;
grant execute on function public.finalizar_sesion(uuid, text) to authenticated;

-- ================================================================ ALERTAS AUTOMÁTICAS FUERA DE RANGO (RF20, RF21)
create or replace function public.rango_aplicable(p_actividad smallint, p_edad smallint)
returns public.rangos language sql stable security definer set search_path = '' as $$
  select r.* from public.rangos r
   where r.vigente and r.actividad_id = p_actividad
     and coalesce(p_edad, 30) between r.edad_min and r.edad_max
   order by r.actualizado_en desc limit 1
$$;

create or replace function public.evaluar_lectura()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m public.mediciones; r public.rangos; v_tipo text; v_limite numeric;
begin
  select * into m from public.mediciones where id = new.medicion_id;
  if m.actividad_id is null then return new; end if;
  select * into r from public.rango_aplicable(m.actividad_id, m.edad_al_medir);
  if r.id is null then return new; end if;

  if new.bpm is not null and new.bpm > r.bpm_max then v_tipo := 'bpm_alto'; v_limite := r.bpm_max;
  elsif new.bpm is not null and new.bpm < r.bpm_min then v_tipo := 'bpm_bajo'; v_limite := r.bpm_min;
  end if;
  if v_tipo is not null and not exists (
       select 1 from public.alertas a
        where a.medicion_id = m.id and a.tipo = v_tipo and a.creada_en > now() - interval '30 seconds') then
    insert into public.alertas (medicion_id, usuario_id, tipo, valor, limite)
    values (m.id, m.usuario_id, v_tipo, new.bpm, v_limite);
  end if;

  if new.spo2 is not null and new.spo2 < r.spo2_min and not exists (
       select 1 from public.alertas a
        where a.medicion_id = m.id and a.tipo = 'spo2_bajo' and a.creada_en > now() - interval '30 seconds') then
    insert into public.alertas (medicion_id, usuario_id, tipo, valor, limite)
    values (m.id, m.usuario_id, 'spo2_bajo', new.spo2, r.spo2_min);
  end if;

  if new.calidad = 'mala' and not exists (
       select 1 from public.alertas a
        where a.medicion_id = m.id and a.tipo = 'senal_mala' and a.creada_en > now() - interval '30 seconds') then
    insert into public.alertas (medicion_id, usuario_id, tipo, sonora)
    values (m.id, m.usuario_id, 'senal_mala', false);
  end if;
  return new;
end $$;
create trigger lecturas_evaluar after insert on public.lecturas
  for each row execute function public.evaluar_lectura();

-- Cierra una medición: promedios, rango y estado (RF20, RF30). Devuelve el resumen.
create or replace function public.finalizar_medicion(p_medicion uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.mediciones; r public.rangos; v_bpm numeric; v_spo2 numeric; v_ok boolean;
begin
  select * into m from public.mediciones where id = p_medicion and usuario_id = auth.uid();
  if not found then raise exception 'Medición no encontrada'; end if;
  select round(avg(bpm), 1), round(avg(spo2), 1) into v_bpm, v_spo2
    from public.lecturas where medicion_id = p_medicion;
  if m.actividad_id is not null and v_bpm is not null then
    select * into r from public.rango_aplicable(m.actividad_id, m.edad_al_medir);
    if r.id is not null then
      v_ok := v_bpm between r.bpm_min and r.bpm_max and (v_spo2 is null or v_spo2 >= r.spo2_min);
    end if;
  end if;
  update public.mediciones
     set fin = coalesce(fin, now()), estado_conexion = 'finalizada',
         bpm_promedio = coalesce(v_bpm, bpm_promedio), spo2_promedio = coalesce(v_spo2, spo2_promedio),
         dentro_de_rango = v_ok
   where id = p_medicion;
  return jsonb_build_object('bpm_promedio', v_bpm, 'spo2_promedio', v_spo2, 'dentro_de_rango', v_ok);
end $$;
revoke all on function public.finalizar_medicion(uuid) from public, anon;
grant execute on function public.finalizar_medicion(uuid) to authenticated;

-- ================================================================ ADMINISTRACIÓN: PROPUESTAS Y AUDITORÍA DE CAMBIOS (RF46, RF62)
create or replace function public.resolver_propuesta(p_propuesta uuid, p_aprobar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.propuestas_cambio;
begin
  if not public.es_admin() then raise exception 'Solo el administrador' using errcode = '42501'; end if;
  select * into p from public.propuestas_cambio where id = p_propuesta and estado = 'pendiente';
  if not found then raise exception 'Propuesta no encontrada o ya resuelta'; end if;

  if p_aprobar then
    if p.tipo = 'rango' then
      if p.entidad_id is not null then
        update public.rangos
           set bpm_min  = coalesce((p.propuesta ->> 'bpm_min')::smallint,  bpm_min),
               bpm_max  = coalesce((p.propuesta ->> 'bpm_max')::smallint,  bpm_max),
               spo2_min = coalesce((p.propuesta ->> 'spo2_min')::smallint, spo2_min),
               spo2_max = coalesce((p.propuesta ->> 'spo2_max')::smallint, spo2_max),
               actualizado_por = p.proponente_id, actualizado_en = now()
         where id = p.entidad_id::uuid;
      else
        insert into public.rangos (actividad_id, edad_min, edad_max, bpm_min, bpm_max, spo2_min, spo2_max, actualizado_por)
        values ((p.propuesta ->> 'actividad_id')::smallint, (p.propuesta ->> 'edad_min')::smallint,
                (p.propuesta ->> 'edad_max')::smallint, (p.propuesta ->> 'bpm_min')::smallint,
                (p.propuesta ->> 'bpm_max')::smallint, coalesce((p.propuesta ->> 'spo2_min')::smallint, 95),
                coalesce((p.propuesta ->> 'spo2_max')::smallint, 100), p.proponente_id);
      end if;
    elsif p.tipo = 'metodo_sync' then
      insert into public.config_plataforma (clave, valor, actualizado_por)
      values ('metodo_sincronizacion', p.propuesta -> 'metodo', auth.uid())
      on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por,
                                        actualizado_en = now();
    elsif p.tipo = 'leccion' and p.entidad_id is not null then
      update public.lecciones set contenido = coalesce(p.propuesta -> 'contenido', contenido),
             titulo = coalesce(p.propuesta ->> 'titulo', titulo), actualizado_por = p.proponente_id
       where id = p.entidad_id::uuid;
    end if;
  end if;

  update public.propuestas_cambio
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         revisado_por = auth.uid(), revisado_en = now()
   where id = p_propuesta;
  perform public.registrar_auditoria('resolver_propuesta', 'propuestas_cambio', p_propuesta::text,
          jsonb_build_object('aprobada', p_aprobar, 'tipo', p.tipo));
end $$;
revoke all on function public.resolver_propuesta(uuid, boolean) from public, anon;
grant execute on function public.resolver_propuesta(uuid, boolean) to authenticated;

create or replace function public.auditar_cambio_rangos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'cambio_rangos', 'rangos', coalesce(new.id, old.id)::text,
          jsonb_build_object('operacion', tg_op, 'antes', to_jsonb(old), 'despues', to_jsonb(new)));
  return coalesce(new, old);
end $$;
create trigger rangos_auditar after insert or update or delete on public.rangos
  for each row execute function public.auditar_cambio_rangos();

create or replace function public.auditar_eliminacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (actor_id, accion, entidad, entidad_id)
  values (auth.uid(), 'eliminacion', tg_table_name, old.id::text);
  return old;
end $$;
create trigger mediciones_auditar_borrado after delete on public.mediciones
  for each row execute function public.auditar_eliminacion();
create trigger aulas_auditar_borrado after delete on public.aulas
  for each row execute function public.auditar_eliminacion();

create or replace function public.auditar_permisos_profesor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'cambio_permisos', 'permisos_profesor', new.profesor_id::text, to_jsonb(new));
  return new;
end $$;
create trigger permisos_auditar after insert or update on public.permisos_profesor
  for each row execute function public.auditar_permisos_profesor();

-- ================================================================ DERECHOS DEL TITULAR (RF58, RF89)
-- Exporta todo lo del titular. Los campos de salud declarados salen cifrados: el servidor los descifra.
create or replace function public.exportar_mis_datos()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  select jsonb_build_object(
    'generado_en', now(),
    'perfil', (select to_jsonb(p) from public.perfiles p where p.id = auth.uid()),
    'consentimientos', coalesce((select jsonb_agg(to_jsonb(c)) from public.consentimientos_aceptados c where c.usuario_id = auth.uid()), '[]'),
    'declaraciones', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'edad', d.edad,
        'datos_cifrados_base64', encode(d.datos_cifrados, 'base64'), 'clave_version', d.clave_version, 'creado_en', d.creado_en))
        from public.declaraciones_paciente d where d.usuario_id = auth.uid()), '[]'),
    'mediciones', coalesce((select jsonb_agg(to_jsonb(m)) from public.mediciones m where m.usuario_id = auth.uid()), '[]'),
    'alertas', coalesce((select jsonb_agg(to_jsonb(a)) from public.alertas a where a.usuario_id = auth.uid()), '[]'),
    'comparaciones', coalesce((select jsonb_agg(to_jsonb(c)) from public.comparaciones c where c.usuario_id = auth.uid()), '[]'),
    'progreso', coalesce((select jsonb_agg(to_jsonb(g)) from public.progreso_lecciones g where g.usuario_id = auth.uid()), '[]'),
    'aulas', coalesce((select jsonb_agg(to_jsonb(e)) from public.aula_estudiantes e where e.usuario_id = auth.uid()), '[]'),
    'evaluaciones', coalesce((select jsonb_agg(to_jsonb(i)) from public.intentos_evaluacion i where i.usuario_id = auth.uid()), '[]'),
    'solicitudes', coalesce((select jsonb_agg(to_jsonb(s)) from public.solicitudes_derechos s where s.usuario_id = auth.uid()), '[]')
  ) into v;
  insert into public.solicitudes_derechos (usuario_id, tipo, estado, resuelta_en)
  values (auth.uid(), 'portabilidad', 'resuelta', now());
  perform public.registrar_auditoria('exportacion_datos', 'perfiles', auth.uid()::text);
  return v;
end $$;

-- Suprime los datos de medición y declarados del titular (RF58, RF89). Se conservan, por ser
-- registro académico del profesor, las calificaciones; la cuenta de acceso la elimina el servidor.
create or replace function public.eliminar_mis_datos()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Requiere sesión' using errcode = '42501'; end if;
  delete from public.mediciones where usuario_id = auth.uid();       -- cascada: señal, lecturas, alertas, publicaciones, comparaciones
  delete from public.declaraciones_paciente where usuario_id = auth.uid();
  delete from public.senales_referencia where propietario_id = auth.uid();
  delete from public.progreso_lecciones where usuario_id = auth.uid();
  delete from public.insignias_usuario where usuario_id = auth.uid();
  update public.consentimientos_aceptados set revocado_en = coalesce(revocado_en, now()) where usuario_id = auth.uid();
  insert into public.solicitudes_derechos (usuario_id, tipo, estado, resuelta_en)
  values (auth.uid(), 'supresion', 'resuelta', now());
  perform public.registrar_auditoria('supresion_datos', 'perfiles', auth.uid()::text);
end $$;
revoke all on function public.exportar_mis_datos(), public.eliminar_mis_datos() from public, anon;
grant execute on function public.exportar_mis_datos(), public.eliminar_mis_datos() to authenticated;

-- ================================================================ VISTAS
-- Evolución personal del BPM en reposo por día, junto al rango esperado (RF36).
-- La correlación con estrés/sueño (RF37) la calcula el servidor tras descifrar esos campos.
create view public.evolucion_reposo with (security_invoker = true) as
  select m.usuario_id,
         (m.inicio at time zone 'America/Santiago')::date as dia,
         round(avg(m.bpm_promedio), 1) as bpm_reposo,
         round(avg(m.spo2_promedio), 1) as spo2_reposo,
         min(r.bpm_min) as bpm_esperado_min,
         max(r.bpm_max) as bpm_esperado_max,
         count(*) as mediciones
  from public.mediciones m
  join public.actividades a on a.id = m.actividad_id and a.codigo = 'reposo'
  left join public.rangos r on r.actividad_id = m.actividad_id and r.vigente
       and coalesce(m.edad_al_medir, 30) between r.edad_min and r.edad_max
  where m.bpm_promedio is not null
  group by m.usuario_id, (m.inicio at time zone 'America/Santiago')::date;

-- Avance del aula por evaluación para el modo docente y el panel en vivo (RF43, RF113).
create view public.avance_evaluaciones with (security_invoker = true) as
  select e.id as evaluacion_id, e.aula_id, e.titulo, e.estado,
         count(i.id) as intentos,
         count(i.id) filter (where i.fin is not null) as terminados,
         count(i.id) filter (where i.nivel = 'logrado') as logrado,
         count(i.id) filter (where i.nivel = 'medianamente_logrado') as medianamente_logrado,
         count(i.id) filter (where i.nivel = 'no_logrado') as no_logrado,
         round(avg(i.porcentaje), 1) as promedio_pct
  from public.evaluaciones e
  left join public.intentos_evaluacion i on i.evaluacion_id = e.id
  group by e.id;

-- Alertas recientes del usuario para el historial (RF21).
create view public.historial_alertas with (security_invoker = true) as
  select a.id, a.usuario_id, a.medicion_id, a.tipo, a.valor, a.limite, a.sonora, a.creada_en
  from public.alertas a;

grant select on public.evolucion_reposo, public.avance_evaluaciones, public.historial_alertas to authenticated;

-- ================================================================ TIEMPO REAL (RNF04, RF08, RF113)
alter publication supabase_realtime add table public.lecturas;
alter publication supabase_realtime add table public.alertas;
alter publication supabase_realtime add table public.sesiones_medicion;
alter publication supabase_realtime add table public.sesion_canales;

-- Cierre de sesiones sin latido, cada minuto, si pg_cron está disponible (RF10).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sensor_pulso_sesiones_inactivas', '* * * * *', 'select public.cerrar_sesiones_inactivas()');
  end if;
end $$;

-- ================================================================ LECCIONES BASE (RF22, RF38, RF39, RF115)
insert into public.lecciones (slug, titulo, categoria, orden, publicada, contenido) values
 ('corazon-y-frecuencia-cardiaca', 'El corazón y la frecuencia cardíaca', 'fisiologia', 1, true,
  '[{"tipo":"texto","texto":"El corazón bombea sangre con cada latido. La frecuencia cardíaca son los latidos por minuto (BPM) y cambia con la actividad, la edad, el estrés, el sueño y la cafeína."}]'),
 ('como-se-obtiene-el-bpm', 'Cómo se obtiene el BPM', 'bpm', 2, true,
  '[{"tipo":"texto","texto":"El sensor emite luz infrarroja (p. ej. 880 nm en el MAX30102). Con cada latido cambia el volumen de sangre bajo la piel y varía la intensidad de luz reflejada. Esa señal (PPG) se analiza: se detectan los picos, se miden los intervalos entre picos y se convierte en BPM. Los nm son la longitud de onda de la luz; el sensor entrega intensidad, no nanómetros."}]'),
 ('saturacion-de-oxigeno', 'La saturación de oxígeno (SpO₂)', 'spo2', 3, true,
  '[{"tipo":"texto","texto":"El sensor usa luz roja (p. ej. 660 nm) e infrarroja. La hemoglobina con y sin oxígeno absorbe distinto cada luz; la razón entre ambas señales se convierte en un porcentaje de saturación. En personas sanas suele estar sobre 95 %. En esta plataforma se muestra el valor medido junto al BPM."}]'),
 ('el-sensor-max30102-y-el-esp32', 'El sensor MAX30102 y el ESP32', 'sensor', 4, true,
  '[{"tipo":"texto","texto":"El MAX30102 tiene LED rojo e infrarrojo y un fotodetector. El ESP32 lee hasta 5 sensores y envía los datos por WiFi con un token propio. Cada canal se asigna a la cuenta de una persona."}]'),
 ('ingenieria-de-la-senal', 'Ingeniería aplicada a la señal', 'ingenieria', 5, true,
  '[{"tipo":"texto","texto":"Filtrado de ruido, detección de picos, variabilidad (HRV), calidad de señal y comparación de señales. El PPG mide pulso por luz; el ECG mide actividad eléctrica y aquí solo se usa como referencia educativa."}]'),
 ('esto-no-es-un-diagnostico', 'Esta plataforma no es un diagnóstico', 'salud', 6, true,
  '[{"tipo":"texto","texto":"La plataforma es educativa y no es un dispositivo médico. Una medición fuera de rango es información sensible, nunca un diagnóstico: ante dudas consulta a un profesional de la salud."}]');
