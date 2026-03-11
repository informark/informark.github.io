$origem = "C:\Users\iNFORMARK Loja\Desktop\iphone-inteligencia\Bot"
$destino = "G:\Meu Drive\BotRelatorios"

New-Item -ItemType Directory -Force -Path $destino | Out-Null

$arquivosFixos = @(
    "precos.csv",
    "promocoes_enviadas.csv",
    "preco_dia.csv"
)

foreach ($arquivo in $arquivosFixos) {
    $src = Join-Path $origem $arquivo
    $dst = Join-Path $destino $arquivo

    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "Copiado: $arquivo"
    }
    else {
        Write-Host "Nao encontrado: $arquivo"
    }
}

Get-ChildItem $origem -Filter "relatorio_menor_preco_*.csv" -ErrorAction SilentlyContinue | ForEach-Object {
    $dst = Join-Path $destino $_.Name
    Copy-Item $_.FullName $dst -Force
    Write-Host "Copiado: $($_.Name)"
}

Write-Host "Arquivos sincronizados com Google Drive"