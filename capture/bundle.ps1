$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.capture-venv\Scripts\python.exe')) { throw 'Run npm run capture:setup first.' }
& .\.capture-venv\Scripts\python.exe -m pip install --disable-pip-version-check --progress-bar off pyinstaller==6.16.0
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller installation failed.' }
& .\.capture-venv\Scripts\python.exe -m PyInstaller --noconfirm --onedir --name capture-service --distpath capture-dist --workpath capture-build --specpath capture-build --add-data "$PSScriptRoot\assets;assets" --collect-all rapidocr_onnxruntime --collect-all onnxruntime capture/capture_service.py
if ($LASTEXITCODE -ne 0) { throw 'Capture bundle failed.' }
