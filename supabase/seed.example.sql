-- Ejemplo (RF44): registrar el correo del primer administrador ANTES de que se registre.
-- Copiar a un archivo local no versionado, cambiar el correo y ejecutar una sola vez.
insert into public.admins_iniciales (correo) values ('nombreapellido@unach.cl')
on conflict do nothing;
