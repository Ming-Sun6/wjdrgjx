# 说明：
# - 这是“整理发布目录”的脚本：只做归档/去重/搬运，不改业务逻辑。
# - 默认先 DryRun（只打印将要做什么），确认无误后再执行真实移动。
#
# 用法：
#   1) 预览：  powershell -ExecutionPolicy Bypass -File .\cleanup-release.ps1
#   2) 执行：  powershell -ExecutionPolicy Bypass -File .\cleanup-release.ps1 -Execute
#
# 目标结构（最终建议）：
# - 根目录仅保留：web.config、server.js、package*.json、*.bat、rukou.html、index.html、public/、private-backups/
# - 站点静态资源统一从 public/ 提供（工具页在 public/function/）
# - 删除/归档重复目录：function/、public/public/、src/（已空）、docs/（仅内部文档可归档）
# - public/ 下的 docs/tests/.superpowers 也建议归档（正式发布通常不需要）

param(
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

function Say($msg) { Write-Host $msg }

function HasPath($path) {
  return ($null -ne $path) -and (Test-Path -LiteralPath $path)
}

function EnsureDir($path) {
  if (-not (Test-Path -LiteralPath $path)) {
    if ($Execute) {
      New-Item -ItemType Directory -Path $path | Out-Null
    } else {
      Say "[DryRun] mkdir $path"
    }
  }
}

function MoveIfExists($src, $dst) {
  if (HasPath $src) {
    EnsureDir (Split-Path -Parent $dst)
    if ($Execute) {
      Move-Item -LiteralPath $src -Destination $dst
    } else {
      Say "[DryRun] move $src  ->  $dst"
    }
  }
}

function RemoveDirIfExists($path) {
  if (HasPath $path) {
    if ($Execute) {
      Remove-Item -LiteralPath $path -Recurse -Force
    } else {
      Say "[DryRun] remove dir $path"
    }
  }
}

function RemoveFileIfExists($path) {
  if (HasPath $path) {
    if ($Execute) {
      Remove-Item -LiteralPath $path -Force
    } else {
      Say "[DryRun] remove file $path"
    }
  }
}

function CopyDir($src, $dst) {
  if (HasPath $src) {
    EnsureDir $dst
    if ($Execute) {
      Copy-Item -LiteralPath $src\* -Destination $dst -Recurse -Force
    } else {
      Say "[DryRun] copy $src\\*  ->  $dst"
    }
  }
}

function DirSame($a, $b) {
  if (-not (Test-Path -LiteralPath $a)) { return $false }
  if (-not (Test-Path -LiteralPath $b)) { return $false }
  $ha = Get-ChildItem -LiteralPath $a -Recurse -File | Sort-Object FullName | ForEach-Object { $_.FullName.Substring($a.Length) + ":" + $_.Length + ":" + $_.LastWriteTimeUtc.Ticks }
  $hb = Get-ChildItem -LiteralPath $b -Recurse -File | Sort-Object FullName | ForEach-Object { $_.FullName.Substring($b.Length) + ":" + $_.Length + ":" + $_.LastWriteTimeUtc.Ticks }
  return (@($ha) -join "`n") -eq (@($hb) -join "`n")
}

$root = (Get-Location).Path
Say "Working dir: $root"
if ($Execute) {
  Say "MODE: EXECUTE"
} else {
  Say "MODE: DRYRUN"
}

# 0) 归档目录
$archiveRoot = Join-Path $root "private-backups\release-archive"
EnsureDir $archiveRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $archiveRoot $stamp
EnsureDir $archive

# 1) 明显的构建/IDE 目录：建议归档后删除
foreach ($d in @(".vs",".tmp",".superpowers")) {
  $p = Join-Path $root $d
  if (HasPath $p) {
    MoveIfExists $p (Join-Path $archive $d)
  }
}

# 2) public/public 这种重复层级：归档后移除
$publicPublic = Join-Path $root "public\public"
if (HasPath $publicPublic) {
  MoveIfExists $publicPublic (Join-Path $archive "public-public")
}

# 3) function/ 与 public/function/：建议以 public/function/ 为准
#    现在 public/rukou.html 已改成相对引用，可把根目录 function/ 归档（先不直接删）
$rootFunction = Join-Path -Path $root -ChildPath 'function'
$publicFunction = Join-Path -Path $root -ChildPath 'public\function'
$hasRootFunction = $false
$hasPublicFunction = $false
if ($null -ne $rootFunction) { $hasRootFunction = Test-Path -LiteralPath $rootFunction }
if ($null -ne $publicFunction) { $hasPublicFunction = Test-Path -LiteralPath $publicFunction }
if ($hasRootFunction -and $hasPublicFunction) {
  if (DirSame $rootFunction $publicFunction) {
    Say "function/ 与 public/function/ 看起来一致：将归档根目录 function/"
    MoveIfExists $rootFunction (Join-Path $archive "function")
  } else {
    Say "WARNING: function/ 与 public/function/ 不一致。已将 function/ 保留不动（避免断链）。你可以手动比对后再归档。"
  }
}

# 4) src/ 目前用于已移除的 WJTI 测试（你这边已清空），如果仍存在则归档
$src = Join-Path $root "src"
if (HasPath $src) {
  $hasFiles = @(Get-ChildItem -LiteralPath $src -Recurse -File -ErrorAction SilentlyContinue).Count -gt 0
  if (-not $hasFiles) {
    MoveIfExists $src (Join-Path $archive "src-empty")
  } else {
    Say "WARNING: src/ 里仍有文件，未自动处理。"
  }
}

# 5) docs/ 是内部文档，正式发布可归档（不删）
$docs = Join-Path $root "docs"
if (HasPath $docs) {
  MoveIfExists $docs (Join-Path $archive "docs")
}

# 6) public/ 下的文档/测试/构建缓存：归档
$publicDocs = Join-Path $root "public\docs"
if (HasPath $publicDocs) {
  MoveIfExists $publicDocs (Join-Path $archive "public-docs")
}

$publicTests = Join-Path $root "public\tests"
if (HasPath $publicTests) {
  MoveIfExists $publicTests (Join-Path $archive "public-tests")
}

$publicSuperpowers = Join-Path $root "public\.superpowers"
if (HasPath $publicSuperpowers) {
  MoveIfExists $publicSuperpowers (Join-Path $archive "public-superpowers")
}

Say ""
Say "完成。你可以："
Say "- 先 DryRun 看输出是否符合预期"
Say "- 然后加 -Execute 执行真实搬运/归档"
