$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version
$lockedVersion = "1.0.0"
$expectedPermissions = @("storage", "webNavigation", "webRequest") | Sort-Object
$actualPermissions = @($manifest.permissions) | Sort-Object
$expectedHosts = @("http://*/*", "https://*/*") | Sort-Object
$actualHosts = @($manifest.host_permissions) | Sort-Object

if ($manifest.manifest_version -ne 3) {
  throw "Chrome Web Store package must use Manifest V3."
}

if ($version -ne $lockedVersion) {
  throw "Extension version is locked at $lockedVersion. Change it only with explicit user approval."
}

if (Compare-Object $expectedPermissions $actualPermissions) {
  throw "Unexpected manifest permissions. Review and justify every permission before packaging."
}

if (Compare-Object $expectedHosts $actualHosts) {
  throw "Unexpected host permissions."
}

if ($manifest.incognito -ne "not_allowed") {
  throw "Incognito access must remain disabled to keep private browsing out of shared history."
}

$javascriptFiles = @(
  "background.js",
  "content.js",
  "history.js",
  "onboarding.js",
  "page-observer.js",
  "popup.js"
)

foreach ($file in $javascriptFiles) {
  $filePath = Join-Path $projectRoot $file
  & node --check $filePath

  if ($LASTEXITCODE -ne 0) {
    throw "JavaScript syntax check failed: $file"
  }

  $source = Get-Content -Raw -LiteralPath $filePath

  if ($source -match '(?<![A-Za-z0-9_$])eval\s*\(' -or
      $source -match '\bnew\s+Function\s*\(' -or
      $source -match 'createElement\s*\(\s*["'']script["'']\s*\)') {
    throw "Potential dynamic or injected code found: $file"
  }
}

$localeFiles = Get-ChildItem -LiteralPath (Join-Path $projectRoot "_locales") -Filter "messages.json" -Recurse
$referencePath = Join-Path $projectRoot "_locales\en\messages.json"
$referenceKeys = (Get-Content -Raw -LiteralPath $referencePath | ConvertFrom-Json).PSObject.Properties.Name | Sort-Object

foreach ($file in $localeFiles) {
  $messages = Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json
  $keys = $messages.PSObject.Properties.Name | Sort-Object
  $difference = Compare-Object $referenceKeys $keys

  if ($difference) {
    throw "Locale keys differ from English: $($file.FullName)"
  }

  if ($messages.extensionDescription.message.Length -gt 132) {
    throw "Localized extension description exceeds 132 characters: $($file.FullName)"
  }
}

$htmlFiles = @("history.html", "onboarding.html", "popup.html")
$usedLocaleKeys = @()

foreach ($file in $javascriptFiles) {
  $source = Get-Content -Raw -LiteralPath (Join-Path $projectRoot $file)
  $matches = [regex]::Matches($source, '(?<![A-Za-z0-9_$])t\("([A-Za-z0-9_]+)"')
  $usedLocaleKeys += $matches | ForEach-Object { $_.Groups[1].Value }
}

foreach ($file in $htmlFiles) {
  $html = Get-Content -Raw -LiteralPath (Join-Path $projectRoot $file)

  if ($html -match '<script(?!\s+[^>]*\bsrc=)[^>]*>') {
    throw "Inline script found: $file"
  }

  $matches = [regex]::Matches(
    $html,
    'data-i18n(?:-placeholder|-aria-label)?="([A-Za-z0-9_]+)"'
  )
  $usedLocaleKeys += $matches | ForEach-Object { $_.Groups[1].Value }
}

$manifestMessages = [regex]::Matches(
  (Get-Content -Raw -LiteralPath $manifestPath),
  '__MSG_([A-Za-z0-9_]+)__'
)
$usedLocaleKeys += $manifestMessages | ForEach-Object { $_.Groups[1].Value }
$missingLocaleKeys = $usedLocaleKeys |
  Sort-Object -Unique |
  Where-Object { $_ -notin $referenceKeys }

if ($missingLocaleKeys) {
  throw "Missing locale keys: $($missingLocaleKeys -join ', ')"
}

Add-Type -AssemblyName System.Drawing

foreach ($size in @(16, 32, 48, 128)) {
  $iconPath = Join-Path $projectRoot "icons\icon-$size.png"
  $image = [System.Drawing.Image]::FromFile($iconPath)

  try {
    if ($image.Width -ne $size -or $image.Height -ne $size) {
      throw "Incorrect icon dimensions: $iconPath"
    }
  } finally {
    $image.Dispose()
  }
}

$runtimePaths = @(
  "_locales",
  "icons",
  "background.js",
  "content.js",
  "history.css",
  "history.html",
  "history.js",
  "manifest.json",
  "onboarding.css",
  "onboarding.html",
  "onboarding.js",
  "page-observer.js",
  "popup.html",
  "popup.js",
  "styles.css"
)

foreach ($path in $runtimePaths) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $path))) {
    throw "Required package path is missing: $path"
  }
}

$distDirectory = Join-Path $projectRoot "dist"
$packagePath = Join-Path $distDirectory "site-domains-explorer-$version.zip"
New-Item -ItemType Directory -Path $distDirectory -Force | Out-Null

if (Test-Path -LiteralPath $packagePath) {
  Remove-Item -LiteralPath $packagePath -Force
}

$absoluteRuntimePaths = $runtimePaths | ForEach-Object { Join-Path $projectRoot $_ }
Compress-Archive -LiteralPath $absoluteRuntimePaths -DestinationPath $packagePath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)

try {
  if (-not ($archive.Entries | Where-Object FullName -eq "manifest.json")) {
    throw "Packaged manifest.json is not at the ZIP root."
  }
} finally {
  $archive.Dispose()
}

Write-Output "Created: $packagePath"
