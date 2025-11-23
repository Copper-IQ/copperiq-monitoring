# Fix Grafana alert templates to use correct template syntax
# Based on official Grafana documentation

$alertFiles = Get-ChildItem "grafana-alerts/*.yaml" -Exclude "folders.yaml","contact-points.yaml","notification-policies.yaml","README.md","SECRETS.md"

foreach ($file in $alertFiles) {
    Write-Host "Fixing $($file.Name)..."
    
    $content = Get-Content $file.FullName -Raw
    
    # Replace humanize functions with conditional checks using $values.B.Value
    # B is the reduce stage that produces a single value from the time series
    
    # Percentage values (0.8 → 80%)
    $content = $content -replace '\{\{ \$value \| humanizePercentage \}\}', '{{ if $values.B }}{{ humanizePercentage $values.B.Value }}{{ end }}'
    $content = $content -replace '\{\{ printf "%.1f%%" \(mul \$value 100\) \}\}', '{{ if $values.B }}{{ humanizePercentage $values.B.Value }}{{ end }}'
    $content = $content -replace '\{\{ printf "%.1f%%" \(mulf \$value 100\.0\) \}\}', '{{ if $values.B }}{{ humanizePercentage $values.B.Value }}{{ end }}'
    
    # Duration values (1.5 → "1.5s")  
    $content = $content -replace '\{\{ \$value \| humanizeDuration \}\}', '{{ if $values.B }}{{ humanizeDuration $values.B.Value }}{{ end }}'
    $content = $content -replace '\{\{ \$value \}\}s', '{{ if $values.B }}{{ humanizeDuration $values.B.Value }}{{ end }}'
    
    # Plain numbers with unit context (e.g., "5 errors/second")
    $content = $content -replace '\{\{ \$value \| humanize \}\}', '{{ if $values.B }}{{ humanize $values.B.Value }}{{ end }}'
    $content = $content -replace '\{\{ \$value \}\}( (?:errors|connections|requests|messages))', '{{ if $values.B }}{{ humanize $values.B.Value }}{{ end }}$1'
    
    Set-Content $file.FullName $content -NoNewline
}

Write-Host "Done! Fixed $($alertFiles.Count) alert files."
