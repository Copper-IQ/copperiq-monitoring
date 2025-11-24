# Dashboard folder organization script
# Maps dashboards to Grafana folders matching alert structure

$dashboards = @{
    # Infrastructure folder (uid: infrastructure)
    "aks-cluster.json" = "infrastructure"
    "infrastructure-overview.json" = "infrastructure"
    
    # Applications folder (uid: applications)
    "argocd.json" = "applications"
    "cert-manager.json" = "applications"
    "content-platform.json" = "applications"
    "rabbitmq.json" = "applications"
    
    # Databases folder (uid: databases)
    "azure-mysql.json" = "databases"
    "azure-postgresql.json" = "databases"
}

$dashboardDir = "C:\Users\ChrisBlokland\projects\copperiq\copperiq-monitoring\helm\dashboards"

foreach ($dashboard in $dashboards.Keys) {
    $folderUid = $dashboards[$dashboard]
    $filePath = Join-Path $dashboardDir $dashboard
    
    if (-not (Test-Path $filePath)) {
        Write-Warning "Dashboard not found: $dashboard"
        continue
    }
    
    Write-Host "Processing $dashboard -> folder: $folderUid" -ForegroundColor Cyan
    
    # Load JSON
    $json = Get-Content $filePath -Raw | ConvertFrom-Json
    
    # Add/update folderUid property at root level
    $json | Add-Member -NotePropertyName "folderUid" -NotePropertyValue $folderUid -Force
    
    # Save back to file with proper formatting
    $json | ConvertTo-Json -Depth 100 -Compress:$false | Set-Content $filePath -Encoding UTF8
    
    Write-Host "  ✓ Updated $dashboard" -ForegroundColor Green
}

Write-Host "`n✅ All dashboards organized into folders!" -ForegroundColor Green
Write-Host "`nFolder structure:" -ForegroundColor Yellow
Write-Host "  infrastructure: aks-cluster, infrastructure-overview" -ForegroundColor Gray
Write-Host "  applications: argocd, cert-manager, content-platform, rabbitmq" -ForegroundColor Gray
Write-Host "  databases: azure-mysql, azure-postgresql" -ForegroundColor Gray
