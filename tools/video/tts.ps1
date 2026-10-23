<#
.SYNOPSIS
    Batch text-to-speech for the demo video narration.

.DESCRIPTION
    Reads a JSON file of narration lines and renders one WAV per line using the
    Windows SAPI synthesiser (Microsoft David / Hazel), so the demo can be
    narrated without any network access or API key.

    Each line is written to its own WAV; the build script then places them on the
    timeline. The script also prints the measured duration of every clip so the
    timeline can be built from the real speech length.

.EXAMPLE
    pwsh -File tools/video/tts.ps1 -Input tools/video/lines.json -OutDir tools/video/work/tts
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$LinesFile,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$Voice = "Microsoft David Desktop",
    [int]$Rate = -1
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

Add-Type -AssemblyName System.Speech

$items = Get-Content -Path $LinesFile -Raw | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

$chosen = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq $Voice }
if ($chosen) {
    $synth.SelectVoice($Voice)
} else {
    Write-Warning "voice '$Voice' not installed; using the default voice"
}
if ($Rate -ge -10 -and $Rate -le 10) {
    $synth.Rate = $Rate
}

foreach ($item in $items) {
    $path = Join-Path $OutDir ("{0}.wav" -f $item.id)
    $synth.SetOutputToWaveFile($path)
    $synth.Speak([string]$item.text)
    $synth.SetOutputToNull()
    Write-Output ("{0}`t{1}" -f $item.id, $path)
}

$synth.Dispose()
