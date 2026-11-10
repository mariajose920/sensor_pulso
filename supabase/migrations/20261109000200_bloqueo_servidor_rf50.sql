-- RF50: Bloqueo de cuenta en servidor por correo e IP tras intentos fallidos.
-- Vive en el servidor PostgreSQL (no en localStorage del navegador).

-- 1. Asegurar tabla de bloqueos con soporte de IP y correo
create table if not exists public.bloqueos_cuenta (
  id              bigint generated always as identity primary key,
  correo          text,
  ip              inet,
  bloqueado_hasta timestamptz not null,
  motivo          text not null default 'intentos_fallidos',
  creado_en       timestamptz not null default now()
);

-- Índices para búsqueda rápida de bloqueo activo
create index if not exists bloqueos_cuenta_correo_idx on public.bloqueos_cuenta (lower(correo), bloqueado_hasta desc);
create index if not exists bloqueos_cuenta_ip_idx on public.bloqueos_cuenta (ip, bloqueado_hasta desc);

-- 2. Función que registra intento de login (éxito o fallo) y bloquea 15 min al 5to intento
create or replace function public.registrar_intento_login(
  p_correo text,
  p_exitoso boolean,
  p_ip inet default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fallos_correo int := 0;
  v_fallos_ip int := 0;
  v_hasta timestamptz;
  v_correo_limpio text := lower(trim(p_correo));
begin
  -- Registrar el intento en el historial del servidor
  insert into public.intentos_login (correo, ip, exitoso)
  values (v_correo_limpio, p_ip, p_exitoso);

  -- Si el login fue exitoso: restablecer intentos y desbloquear cuenta
  if p_exitoso then
    delete from public.bloqueos_cuenta where lower(correo) = v_correo_limpio;
    if p_ip is not null then
      delete from public.bloqueos_cuenta where ip = p_ip;
    end if;

    -- Auditoría de login exitoso
    insert into public.auditoria (accion, entidad, entidad_id, ip)
    values ('login', 'perfiles', v_correo_limpio, p_ip);

    return jsonb_build_object('bloqueado', false, 'segundos_restantes', 0);
  end if;

  -- Contar fallos en los últimos 15 minutos por correo
  select count(*) into v_fallos_correo
    from public.intentos_login
   where lower(correo) = v_correo_limpio
     and not exitoso
     and ocurrio_en > now() - interval '15 minutes';

  -- Contar fallos en los últimos 15 minutos por IP (si se proporciona)
  if p_ip is not null then
    select count(*) into v_fallos_ip
      from public.intentos_login
     where ip = p_ip
       and not exitoso
       and ocurrio_en > now() - interval '15 minutes';
  end if;

  -- Si alcanza o supera el límite (5 intentos) por correo o por IP: BLOQUEAR
  if v_fallos_correo >= 5 or v_fallos_ip >= 5 then
    v_hasta := now() + interval '15 minutes';

    -- Registrar bloqueo en el servidor
    insert into public.bloqueos_cuenta (correo, ip, bloqueado_hasta, motivo)
    values (v_correo_limpio, p_ip, v_hasta, 'intentos_fallidos');

    -- Auditoría de bloqueo
    insert into public.auditoria (accion, entidad, entidad_id, detalle, ip, sospechoso)
    values (
      'bloqueo_cuenta', 
      'perfiles', 
      v_correo_limpio, 
      jsonb_build_object('fallos_correo', v_fallos_correo, 'fallos_ip', v_fallos_ip, 'bloqueado_hasta', v_hasta), 
      p_ip, 
      true
    );

    return jsonb_build_object(
      'bloqueado', true,
      'segundos_restantes', 900,
      'bloqueado_hasta', v_hasta,
      'intentos_fallidos', greatest(v_fallos_correo, v_fallos_ip),
      'intentos_restantes', 0
    );
  end if;

  return jsonb_build_object(
    'bloqueado', false,
    'segundos_restantes', 0,
    'intentos_fallidos', greatest(v_fallos_correo, v_fallos_ip),
    'intentos_restantes', greatest(0, 5 - greatest(v_fallos_correo, v_fallos_ip))
  );
end $$;

-- 3. Función para verificar si un correo o IP está bloqueado ANTES de validar la contraseña
create or replace function public.verificar_estado_bloqueo(
  p_correo text,
  p_ip inet default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bloqueo record;
  v_correo_limpio text := lower(trim(p_correo));
  v_segundos int := 0;
begin
  -- Buscar bloqueo activo vigente por correo o por IP
  select bloqueado_hasta into v_bloqueo
    from public.bloqueos_cuenta
   where (lower(correo) = v_correo_limpio or (p_ip is not null and ip = p_ip))
     and bloqueado_hasta > now()
   order by bloqueado_hasta desc
   limit 1;

  if found and v_bloqueo.bloqueado_hasta > now() then
    v_segundos := ceil(extract(epoch from (v_bloqueo.bloqueado_hasta - now())));
    return jsonb_build_object(
      'bloqueado', true,
      'segundos_restantes', v_segundos,
      'bloqueado_hasta', v_bloqueo.bloqueado_hasta
    );
  end if;

  return jsonb_build_object(
    'bloqueado', false,
    'segundos_restantes', 0,
    'bloqueado_hasta', null
  );
end $$;

-- 4. Otorgar permisos de ejecución para anon y authenticated
grant execute on function public.registrar_intento_login(text, boolean, inet) to anon, authenticated;
grant execute on function public.verificar_estado_bloqueo(text, inet) to anon, authenticated;