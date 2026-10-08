Get-ChildItem -Path "src/**/*.entity.ts" -Recurse | ForEach-Object {
     = Get-Content -Path .FullName -Raw
     =  -replace "[^\x00-\x7F]", ""
    [System.IO.File]::WriteAllText(.FullName, , [System.Text.Encoding]::ASCII)
}
