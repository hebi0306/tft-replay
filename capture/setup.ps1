param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.capture-venv\Scripts\python.exe')) {
  & $Python -m venv .capture-venv
  if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12 x64, or pass -Python with its executable path.' }
}
& .\.capture-venv\Scripts\python.exe -m pip install --disable-pip-version-check --progress-bar off --only-binary=:all: -r capture/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Capture dependency installation failed.' }
Write-Host 'Capture ready. Run npm start and configure the capture source in the match library.'
