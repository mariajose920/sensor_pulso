// RNF01: puntos de corte del diseño responsivo. Deben coincidir con los @media de src/style.css.
//
//   hasta 400 px   móvil muy pequeño
//   401 a 640 px   móvil
//   641 a 1024 px  tablet
//   1025 a 1399 px computador
//   desde 1400 px  pantalla muy ancha
export const BP = {
  movilMuyPequeno: 400,
  movil: 640,
  tablet: 1024,
  anchoGrande: 1400
}

export const consultas = {
  esMovil: `(max-width: ${BP.movil}px)`,
  esMovilVertical: `(max-width: ${BP.movil}px) and (orientation: portrait)`,
  esTactil: '(pointer: coarse)'
}
