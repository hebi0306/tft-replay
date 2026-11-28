$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$python = '.capture-venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run npm run capture:setup first.' }

npm run release:verify
if ($LASTEXITCODE -ne 0) { throw 'Capture assets failed validation.' }

& $python -m pip install --disable-pip-version-check --progress-bar off pyinstaller==6.16.0
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller installation failed.' }

$argsForBundle = @(
    '--noconfirm', '--onedir', '--name', 'capture-service',
    '--distpath', 'capture-dist', '--workpath', 'capture-build', '--specpath', 'capture-build',
    '--add-data', "$PSScriptRoot\assets;assets", '--add-data', "$PSScriptRoot\data;data",
    '--collect-all', 'rapidocr_onnxruntime', '--collect-all', 'onnxruntime'
)
foreach ($file in @('unit.onnx', 'champion-identity.onnx', 'champion-identity.json', 'champion-identity-LICENSE.md', 'champion-identity-SOURCE.md')) {
    $argsForBundle += @('--add-data', "$PSScriptRoot\models\$file;models")
}
& $python -m PyInstaller @argsForBundle capture/capture_service.py
if ($LASTEXITCODE -ne 0) { throw 'Capture bundle failed.' }
