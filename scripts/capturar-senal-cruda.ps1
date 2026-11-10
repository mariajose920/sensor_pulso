<#
.SYNOPSIS
  Captura la señal CRUDA del sensor (modo diagnóstico del firmware) y la analiza.

.DESCRIPTION
  1. Cierra antes el Monitor Serie del Arduino IDE y cualquier pestaña de la app con el USB conectado.
  2. Apoya el dedo en el sensor SIN moverlo y ejecuta este script.
  3. Guarda las lecturas (n, ms, ir, rojo) en un CSV y muestra el análisis (luz, ruido, pulso, SpO2, qué ajustar).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\capturar-senal-cruda.ps1
  powershell -ExecutionPolicy Bypass -File scripts\capturar-senal-cruda.ps1 -Puerto COM5 -Segundos 60
#>
param(
  [string]$Puerto = '',
  [int]$Segundos = 60,
  [string]$Salida = ''
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

# Puerto: el indicado o el primero que parezca un ESP32 (CH340, CP210x, FTDI)
if (-not $Puerto) {
  $cand = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\((COM\d+)\)' -and $_.Name -match 'CH340|CH9102|CP210|USB-SERIAL|Silicon|FTDI' }
  if (-not $cand) { Write-Host 'No encuentro la placa: conéctala por USB o indica -Puerto COMx.' -ForegroundColor Red; exit 1 }
  $Puerto = ([regex]::Match(($cand | Select-Object -First 1).Name, '\((COM\d+)\)')).Groups[1].Value
}
if ($Segundos -lt 20) { $Segundos = 20 }
if (-not $Salida) { $Salida = Join-Path $raiz ("captura_cruda_{0}.csv" -f (Get-Date -Format 'yyyyMMdd_HHmmss')) }

Write-Host "Puerto: $Puerto · duración: $Segundos s · apoya el dedo y no lo muevas." -ForegroundColor Cyan
$sp = New-Object System.IO.Ports.SerialPort $Puerto, 115200, 'None', 8, 'one'
$sp.ReadTimeout = 300
$sp.DtrEnable = $false
$sp.RtsEnable = $false
try { $sp.Open() } catch { Write-Host "No se pudo abrir ${Puerto}: $($_.Exception.Message). Cierra el Monitor Serie y la pestaña de la app con USB." -ForegroundColor Red; exit 1 }

try {
  Start-Sleep -Milliseconds 400
  $sp.DiscardInBuffer()
  $sp.Write("@SP {`"cmd`":`"raw_on`"}`n")
  $inicio = Get-Date
  $limite = $inicio.AddSeconds($Segundos + 2)
  $lineas = New-Object System.Collections.Generic.List[string]
  $ultimoAviso = 0
  while ((Get-Date) -lt $limite) {
    try {
      $x = $sp.ReadLine().Trim()
      if ($x -match '^RAW,\d+,\d+,\d+,\d+$') { $lineas.Add($x.Substring(4)) }
    } catch [System.TimeoutException] { }
    $seg = [int]((Get-Date) - $inicio).TotalSeconds
    if ($seg -ge $ultimoAviso + 10) { $ultimoAviso = $seg; Write-Host ("  {0,3} s · {1} lecturas" -f $seg, $lineas.Count) }
  }
  $sp.Write("@SP {`"cmd`":`"raw_off`"}`n")
  Start-Sleep -Milliseconds 200
} finally {
  if ($sp.IsOpen) { $sp.Close() }
}

if ($lineas.Count -lt 100) {
  Write-Host "Solo llegaron $($lineas.Count) lecturas. ¿Está cargado el firmware con el modo de captura (comando raw_on)?" -ForegroundColor Red
  exit 1
}
"n,ms,ir,rojo" | Set-Content -Path $Salida -Encoding ASCII
$lineas | Add-Content -Path $Salida -Encoding ASCII
Write-Host "Guardado: $Salida ($($lineas.Count) lecturas)" -ForegroundColor Green

node (Join-Path $raiz 'scripts\analizar-senal-cruda.mjs') $Salida
