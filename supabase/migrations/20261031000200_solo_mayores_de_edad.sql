-- sensor_pulso · Migración 10: solo se miden personas mayores de edad (RF03)
-- La plataforma es para usuarios con correo institucional y no recoge datos de salud de menores
-- (RF77 a RF87, sin efecto). La edad del paciente debe ser de 18 años o más.

-- "not valid": exige el límite en toda fila nueva o modificada sin fallar si ya hay datos de prueba
-- de menores. Esas filas se revisan y se depuran aparte; después se puede ejecutar "validate constraint".
alter table public.declaraciones_paciente drop constraint declaraciones_paciente_edad_check;
alter table public.declaraciones_paciente
  add constraint declaraciones_paciente_edad_check check (edad between 18 and 120) not valid;

alter table public.mediciones drop constraint mediciones_edad_al_medir_check;
alter table public.mediciones
  add constraint mediciones_edad_al_medir_check check (edad_al_medir between 18 and 120) not valid;

-- Los rangos de referencia solo para menores dejan de estar vigentes (no se borran: quedan en la auditoría).
update public.rangos set vigente = false where edad_max < 18 and vigente;
