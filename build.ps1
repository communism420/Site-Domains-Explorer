$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$developmentManifestPath = Join-Path $projectRoot "manifest.json"
$chromiumManifestPath = Join-Path $projectRoot "manifest.chromium.json"
$firefoxManifestPath = Join-Path $projectRoot "manifest.firefox.json"
$developmentManifest = Get-Content -Raw -LiteralPath $developmentManifestPath | ConvertFrom-Json
$chromiumManifest = Get-Content -Raw -LiteralPath $chromiumManifestPath | ConvertFrom-Json
$firefoxManifest = Get-Content -Raw -LiteralPath $firefoxManifestPath | ConvertFrom-Json
$version = $developmentManifest.version
$lockedVersion = "1.0.1"
$expectedPermissions = @("storage", "webNavigation", "webRequest") | Sort-Object
$expectedHosts = @("http://*/*", "https://*/*") | Sort-Object

function Assert-ManifestBaseline {
  param(
    [Parameter(Mandatory)] $Manifest,
    [Parameter(Mandatory)] [string] $Label
  )

  if ($Manifest.manifest_version -ne 3) {
    throw "$Label package must use Manifest V3."
  }

  if ($Manifest.version -ne $lockedVersion) {
    throw "$Label extension version is locked at $lockedVersion. Change it only with explicit user approval."
  }

  $actualPermissions = @($Manifest.permissions) | Sort-Object

  if (Compare-Object $expectedPermissions $actualPermissions) {
    throw "Unexpected $Label manifest permissions. Review and justify every permission before packaging."
  }

  $actualHosts = @($Manifest.host_permissions) | Sort-Object

  if (Compare-Object $expectedHosts $actualHosts) {
    throw "Unexpected $Label host permissions."
  }

  if ($Manifest.incognito -ne "not_allowed") {
    throw "$Label private browsing access must remain disabled to keep private browsing out of shared history."
  }
}

Assert-ManifestBaseline -Manifest $developmentManifest -Label "Cross-browser development"
Assert-ManifestBaseline -Manifest $chromiumManifest -Label "Chromium"
Assert-ManifestBaseline -Manifest $firefoxManifest -Label "Firefox"

if ($chromiumManifest.version -ne $version -or $firefoxManifest.version -ne $version) {
  throw "Development, Chromium, and Firefox manifest versions must match."
}

$sharedManifestProperties = @(
  "manifest_version",
  "name",
  "version",
  "incognito",
  "default_locale",
  "description",
  "homepage_url",
  "permissions",
  "host_permissions",
  "icons",
  "action",
  "options_ui",
  "content_scripts",
  "content_security_policy"
)

foreach ($property in $sharedManifestProperties) {
  $developmentValue = $developmentManifest.$property | ConvertTo-Json -Depth 20 -Compress

  foreach ($variant in @(
    @{ Label = "Chromium"; Manifest = $chromiumManifest },
    @{ Label = "Firefox"; Manifest = $firefoxManifest }
  )) {
    $variantValue = $variant.Manifest.$property | ConvertTo-Json -Depth 20 -Compress

    if ($developmentValue -cne $variantValue) {
      throw "Shared manifest property differs in $($variant.Label): $property"
    }
  }
}

$developmentBackgroundScripts = @($developmentManifest.background.scripts)

if ($developmentManifest.minimum_chrome_version -ne "121" -or
    $developmentManifest.background.service_worker -ne "background.js" -or
    $developmentBackgroundScripts.Count -ne 1 -or
    $developmentBackgroundScripts[0] -ne "background.js" -or
    $developmentManifest.background.PSObject.Properties.Name -contains "persistent") {
  throw "Development manifest must provide both MV3 background environments."
}

if ($chromiumManifest.minimum_chrome_version -ne "102") {
  throw "Unexpected minimum Chrome version."
}

if ($chromiumManifest.background.service_worker -ne "background.js" -or
    $chromiumManifest.background.PSObject.Properties.Name -contains "scripts") {
  throw "Chromium manifest must use only background.service_worker."
}

$firefoxBackgroundScripts = @($firefoxManifest.background.scripts)

if ($firefoxBackgroundScripts.Count -ne 1 -or
    $firefoxBackgroundScripts[0] -ne "background.js" -or
    $firefoxManifest.background.PSObject.Properties.Name -contains "service_worker" -or
    $firefoxManifest.background.persistent -ne $false) {
  throw "Firefox manifest must use a non-persistent background.scripts event page."
}

$geckoSettings = $firefoxManifest.browser_specific_settings.gecko
$geckoAndroidSettings = $firefoxManifest.browser_specific_settings.gecko_android
$firefoxDataPermissions = @($geckoSettings.data_collection_permissions.required)
$developmentGeckoJson = $developmentManifest.browser_specific_settings | ConvertTo-Json -Depth 20 -Compress
$firefoxGeckoJson = $firefoxManifest.browser_specific_settings | ConvertTo-Json -Depth 20 -Compress

if ($geckoSettings.id -ne "site-domains-explorer@communism420.github.io" -or
    $geckoSettings.strict_min_version -ne "140.0" -or
    $geckoAndroidSettings.strict_min_version -ne "142.0" -or
    $firefoxDataPermissions.Count -ne 1 -or
    $firefoxDataPermissions[0] -ne "none") {
  throw "Unexpected Firefox browser_specific_settings configuration."
}

if ($developmentGeckoJson -cne $firefoxGeckoJson) {
  throw "Development and Firefox browser_specific_settings must match."
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

  if ($file -ne "page-observer.js") {
    $apiAdapter = 'const webExtensionApi = globalThis.browser ?? globalThis.chrome;'

    if (-not $source.Contains($apiAdapter)) {
      throw "Cross-browser WebExtension API adapter is missing: $file"
    }

    if ($source -match '(?<!globalThis\.)\b(?:chrome|browser)\.[A-Za-z_$]') {
      throw "Direct browser-specific API access found: $file"
    }
  }
}

& node --test (Join-Path $projectRoot "tests\platform-smoke.test.js")

if ($LASTEXITCODE -ne 0) {
  throw "Cross-browser platform smoke tests failed."
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

foreach ($path in @($developmentManifestPath, $chromiumManifestPath, $firefoxManifestPath)) {
  $manifestMessages = [regex]::Matches(
    (Get-Content -Raw -LiteralPath $path),
    '__MSG_([A-Za-z0-9_]+)__'
  )
  $usedLocaleKeys += $manifestMessages | ForEach-Object { $_.Groups[1].Value }
}
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
  "onboarding.css",
  "onboarding.html",
  "onboarding.js",
  "page-observer.js",
  "popup.html",
  "popup.js",
  "styles.css"
)

foreach ($path in @($runtimePaths) + @(
  "manifest.json",
  "manifest.chromium.json",
  "manifest.firefox.json"
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $path))) {
    throw "Required package path is missing: $path"
  }
}

$distDirectory = Join-Path $projectRoot "dist"
$chromiumPackagePath = Join-Path $distDirectory "site-domains-explorer-$version.zip"
$firefoxPackagePath = Join-Path $distDirectory "site-domains-explorer-firefox-$version.zip"
New-Item -ItemType Directory -Path $distDirectory -Force | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Add-PackageFile {
  param(
    [Parameter(Mandatory)] [System.IO.Compression.ZipArchive] $Archive,
    [Parameter(Mandatory)] [string] $SourcePath,
    [Parameter(Mandatory)] [string] $EntryName
  )

  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $Archive,
    $SourcePath,
    $EntryName.Replace("\", "/"),
    [System.IO.Compression.CompressionLevel]::Optimal
  ) | Out-Null
}

function New-ExtensionPackage {
  param(
    [Parameter(Mandatory)] [string] $PackagePath,
    [Parameter(Mandatory)] [string] $ManifestPath
  )

  if (Test-Path -LiteralPath $PackagePath) {
    Remove-Item -LiteralPath $PackagePath -Force
  }

  $archive = [System.IO.Compression.ZipFile]::Open(
    $PackagePath,
    [System.IO.Compression.ZipArchiveMode]::Create
  )

  try {
    foreach ($runtimePath in $runtimePaths) {
      $absolutePath = Join-Path $projectRoot $runtimePath
      $item = Get-Item -LiteralPath $absolutePath

      if ($item.PSIsContainer) {
        foreach ($file in Get-ChildItem -LiteralPath $absolutePath -Recurse -File) {
          $entryName = $file.FullName.Substring($projectRoot.Length).TrimStart(
            [char[]]@("\", "/")
          )
          Add-PackageFile -Archive $archive -SourcePath $file.FullName -EntryName $entryName
        }
      } else {
        Add-PackageFile -Archive $archive -SourcePath $item.FullName -EntryName $runtimePath
      }
    }

    Add-PackageFile -Archive $archive -SourcePath $ManifestPath -EntryName "manifest.json"
  } finally {
    $archive.Dispose()
  }
}

function Test-ExtensionPackage {
  param(
    [Parameter(Mandatory)] [string] $PackagePath,
    [Parameter(Mandatory)] [ValidateSet("Chromium", "Firefox")] [string] $Browser
  )

  $archive = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)

  try {
    $manifestEntries = @($archive.Entries | Where-Object FullName -eq "manifest.json")

    if ($manifestEntries.Count -ne 1) {
      throw "$Browser package must contain exactly one manifest.json at the ZIP root."
    }

    $sourceOnlyManifests = @(
      $archive.Entries | Where-Object FullName -in @(
        "manifest.chromium.json",
        "manifest.firefox.json"
      )
    )

    if ($sourceOnlyManifests.Count -gt 0) {
      throw "$Browser package contains a source-only manifest."
    }

    $duplicateEntries = $archive.Entries |
      Group-Object FullName |
      Where-Object Count -gt 1

    if ($duplicateEntries) {
      throw "$Browser package contains duplicate ZIP entries."
    }

    $reader = New-Object System.IO.StreamReader($manifestEntries[0].Open())

    try {
      $packagedManifest = $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }

    Assert-ManifestBaseline -Manifest $packagedManifest -Label $Browser

    if ($Browser -eq "Chromium" -and (
        $packagedManifest.background.service_worker -ne "background.js" -or
        $packagedManifest.background.PSObject.Properties.Name -contains "scripts" -or
        $packagedManifest.PSObject.Properties.Name -contains "browser_specific_settings")) {
      throw "Chromium package contains the wrong background or browser-specific configuration."
    }

    if ($Browser -eq "Firefox" -and (
        @($packagedManifest.background.scripts).Count -ne 1 -or
        @($packagedManifest.background.scripts)[0] -ne "background.js" -or
        $packagedManifest.background.PSObject.Properties.Name -contains "service_worker" -or
        $packagedManifest.browser_specific_settings.gecko.id -ne $geckoSettings.id)) {
      throw "Firefox package contains the wrong background or browser-specific configuration."
    }
  } finally {
    $archive.Dispose()
  }
}

New-ExtensionPackage -PackagePath $chromiumPackagePath -ManifestPath $chromiumManifestPath
New-ExtensionPackage -PackagePath $firefoxPackagePath -ManifestPath $firefoxManifestPath
Test-ExtensionPackage -PackagePath $chromiumPackagePath -Browser "Chromium"
Test-ExtensionPackage -PackagePath $firefoxPackagePath -Browser "Firefox"

Write-Output "Created Chromium: $chromiumPackagePath"
Write-Output "Created Firefox: $firefoxPackagePath"
