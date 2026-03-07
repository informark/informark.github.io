$origem = "C:\Users\iNFORMARK Loja\Desktop\iphone-inteligencia\Bot"
$docs = Join-Path $origem "docs"

New-Item -ItemType Directory -Force -Path $docs | Out-Null

$arquivoMaisRecente = Get-ChildItem -Path $origem -Filter "relatorio_menor_preco_*.csv" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $arquivoMaisRecente) {
    Write-Host "Nenhum relatório encontrado."
    exit
}

$dados = Import-Csv $arquivoMaisRecente.FullName

if (-not $dados -or $dados.Count -eq 0) {
    Write-Host "O relatório está vazio."
    exit
}

$colunas = $dados[0].PSObject.Properties.Name

$thead = ""
foreach ($col in $colunas) {
    $thead += "<th>$col</th>`n"
}

$tbody = ""
foreach ($linha in $dados) {
    $tbody += "<tr>`n"
    foreach ($col in $colunas) {
        $valor = $linha.$col
        if ($null -eq $valor) { $valor = "" }
        $tbody += "<td>$valor</td>`n"
    }
    $tbody += "</tr>`n"
}

$atualizadoEm = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
$nomeArquivo = $arquivoMaisRecente.Name

$html = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório Informark</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #f3f4f6;
            margin: 0;
            padding: 20px;
            color: #111827;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .card {
            background: #ffffff;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        }
        h1 {
            margin-top: 0;
        }
        .meta {
            color: #6b7280;
            margin-bottom: 8px;
        }
        input {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: 1px solid #d1d5db;
            border-radius: 10px;
            box-sizing: border-box;
            margin: 15px 0;
        }
        .table-wrap {
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            min-width: 700px;
            background: white;
        }
        th, td {
            padding: 10px 12px;
            border-bottom: 1px solid #e5e7eb;
            text-align: left;
            white-space: nowrap;
        }
        th {
            background: #111827;
            color: white;
        }
        tr:hover td {
            background: #f9fafb;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>Relatório Informark</h1>
            <div class="meta">Última atualização: $atualizadoEm</div>
            <div class="meta">Arquivo base: $nomeArquivo</div>

            <input type="text" id="busca" placeholder="Buscar por qualquer campo...">

            <div class="table-wrap">
                <table id="tabela">
                    <thead>
                        <tr>
$thead
                        </tr>
                    </thead>
                    <tbody>
$tbody
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const busca = document.getElementById('busca');
        const linhas = document.querySelectorAll('#tabela tbody tr');

        busca.addEventListener('input', function () {
            const termo = this.value.toLowerCase();

            linhas.forEach(function(linha) {
                const texto = linha.innerText.toLowerCase();
                linha.style.display = texto.includes(termo) ? '' : 'none';
            });
        });
    </script>
</body>
</html>
"@

$destino = Join-Path $docs "index.html"
[System.IO.File]::WriteAllText($destino, $html, [System.Text.UTF8Encoding]::new($false))

Write-Host "HTML gerado em docs\index.html"