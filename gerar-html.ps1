$origem = "C:\Users\iNFORMARK Loja\Desktop\iphone-inteligencia\Bot"
$docs = Join-Path $origem "docs"

New-Item -ItemType Directory -Force -Path $docs | Out-Null

$arquivoRelatorio = Get-ChildItem -Path $origem -Filter "relatorio_menor_preco_*.csv" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

$arquivoPrecos = Join-Path $origem "precos.csv"

function Nova-TabelaHtml {
    param (
        [array]$Dados,
        [string]$IdTabela
    )

    if (-not $Dados -or $Dados.Count -eq 0) {
        return "<p>Nenhum dado encontrado.</p>"
    }

    $colunas = $Dados[0].PSObject.Properties.Name

    $thead = ""
    foreach ($col in $colunas) {
        $colEscapado = [System.Net.WebUtility]::HtmlEncode([string]$col)
        $thead += "<th>$colEscapado</th>`n"
    }

    $tbody = ""
    foreach ($linha in $Dados) {
        $tbody += "<tr>`n"
        foreach ($col in $colunas) {
            $valor = $linha.$col
            if ($null -eq $valor) { $valor = "" }
            $valorEscapado = [System.Net.WebUtility]::HtmlEncode([string]$valor)
            $tbody += "<td>$valorEscapado</td>`n"
        }
        $tbody += "</tr>`n"
    }

    return @"
<div class="table-wrap">
    <table id="$IdTabela">
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
"@
}

$dadosRelatorio = @()
$dadosPrecos = @()

if ($arquivoRelatorio) {
    $dadosRelatorio = Import-Csv $arquivoRelatorio.FullName
}

if (Test-Path $arquivoPrecos) {
    $dadosPrecos = Import-Csv $arquivoPrecos
}

$tabelaRelatorio = Nova-TabelaHtml -Dados $dadosRelatorio -IdTabela "tabelaRelatorio"
$tabelaPrecos = Nova-TabelaHtml -Dados $dadosPrecos -IdTabela "tabelaPrecos"

$atualizadoEm = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
$nomeArquivoRelatorio = if ($arquivoRelatorio) { $arquivoRelatorio.Name } else { "Nenhum relatório encontrado" }
$nomeArquivoPrecos = if (Test-Path $arquivoPrecos) { "precos.csv" } else { "precos.csv não encontrado" }

$html = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relat&oacute;rio Informark</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #f3f4f6;
            margin: 0;
            padding: 20px;
            color: #111827;
        }

        .container {
            max-width: 1320px;
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
            margin-bottom: 10px;
        }

        .meta {
            color: #6b7280;
            margin-bottom: 8px;
        }

        .tabs {
            display: flex;
            gap: 10px;
            margin: 20px 0 15px 0;
            flex-wrap: wrap;
        }

        .tab-btn {
            border: none;
            background: #e5e7eb;
            color: #111827;
            padding: 10px 16px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 15px;
            font-weight: bold;
        }

        .tab-btn.active {
            background: #111827;
            color: white;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .subtitulo {
            margin-top: 10px;
            margin-bottom: 8px;
            font-weight: bold;
        }

        .filtros {
            display: grid;
            grid-template-columns: repeat(5, minmax(160px, 1fr));
            gap: 10px;
            margin: 15px 0;
        }

        input, select {
            width: 100%;
            padding: 12px;
            font-size: 15px;
            border: 1px solid #d1d5db;
            border-radius: 10px;
            box-sizing: border-box;
            background: white;
        }

        .table-wrap {
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            min-width: 900px;
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
            position: sticky;
            top: 0;
        }

        tr:hover td {
            background: #f9fafb;
        }

        .resumo {
            font-size: 14px;
            color: #4b5563;
            margin-bottom: 10px;
        }

        @media (max-width: 900px) {
            .filtros {
                grid-template-columns: 1fr;
            }

            body {
                padding: 12px;
            }

            .card {
                padding: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>Relat&oacute;rio Informark</h1>
            <div class="meta">&Uacute;ltima atualiza&ccedil;&atilde;o: $atualizadoEm</div>

            <div class="tabs">
                <button class="tab-btn active" onclick="abrirAba('abaRelatorio', this)">Menor Pre&ccedil;o</button>
                <button class="tab-btn" onclick="abrirAba('abaPrecos', this)">Planilha de Pre&ccedil;os</button>
            </div>

            <div id="abaRelatorio" class="tab-content active">
                <div class="subtitulo">Arquivo base: $nomeArquivoRelatorio</div>

                <div class="filtros">
                    <input type="text" id="buscaRelatorio" placeholder="Buscar no relat&oacute;rio...">
                    <select id="produtoRelatorio">
                        <option value="">Todos os produtos</option>
                    </select>
                    <select id="modeloRelatorio">
                        <option value="">Todos os modelos</option>
                    </select>
                    <select id="gbRelatorio">
                        <option value="">Todos os GB</option>
                    </select>
                    <select id="condicaoRelatorio">
                        <option value="">Todas as condi&ccedil;&otilde;es</option>
                    </select>
                </div>

                <div class="resumo" id="resumoRelatorio"></div>
                $tabelaRelatorio
            </div>

            <div id="abaPrecos" class="tab-content">
                <div class="subtitulo">Arquivo base: $nomeArquivoPrecos</div>

                <div class="filtros">
                    <input type="text" id="buscaPrecos" placeholder="Buscar na planilha de pre&ccedil;os...">
                    <select id="produtoPrecos">
                        <option value="">Todos os produtos</option>
                    </select>
                    <select id="modeloPrecos">
                        <option value="">Todos os modelos</option>
                    </select>
                    <select id="gbPrecos">
                        <option value="">Todos os GB</option>
                    </select>
                    <select id="condicaoPrecos">
                        <option value="">Todas as condi&ccedil;&otilde;es</option>
                    </select>
                </div>

                <div class="resumo" id="resumoPrecos"></div>
                $tabelaPrecos
            </div>
        </div>
    </div>

    <script>
        function abrirAba(idAba, botao) {
            document.querySelectorAll('.tab-content').forEach(function(aba) {
                aba.classList.remove('active');
            });

            document.querySelectorAll('.tab-btn').forEach(function(btn) {
                btn.classList.remove('active');
            });

            document.getElementById(idAba).classList.add('active');
            botao.classList.add('active');
        }

        function detectarIndices(tabelaId) {
            const ths = Array.from(document.querySelectorAll('#' + tabelaId + ' thead th'))
                .map(th => th.innerText.trim().toLowerCase());

            function acharIndiceExatoOuParcial(prioridades) {
                for (const termo of prioridades) {
                    const exato = ths.findIndex(nome => nome === termo);
                    if (exato >= 0) return exato;
                }

                for (const termo of prioridades) {
                    const parcial = ths.findIndex(nome => nome.includes(termo));
                    if (parcial >= 0) return parcial;
                }

                return -1;
            }

            return {
                produto: acharIndiceExatoOuParcial(['produto', 'tipo', 'categoria']),
                modelo: acharIndiceExatoOuParcial(['modelo', 'nome modelo']),
                gb: acharIndiceExatoOuParcial(['gb', 'armazenamento', 'memoria', 'memória', 'capacidade']),
                condicao: acharIndiceExatoOuParcial(['condicao', 'condição', 'estado'])
            };
        }

        function preencherSelectComValores(selectId, valores) {
            const select = document.getElementById(selectId);
            if (!select) return;

            const valorAtual = select.value;
            const primeiroOption = select.options[0].outerHTML;

            select.innerHTML = primeiroOption;

            valores
                .filter(v => v && v.trim() !== '')
                .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }))
                .forEach(valor => {
                    const option = document.createElement('option');
                    option.value = valor;
                    option.textContent = valor;
                    select.appendChild(option);
                });

            select.value = valorAtual;
        }

        function configurarFiltros(config) {
            const tabela = document.getElementById(config.tabelaId);
            if (!tabela) return;

            const busca = document.getElementById(config.buscaId);
            const produtoSelect = document.getElementById(config.produtoId);
            const modeloSelect = document.getElementById(config.modeloId);
            const gbSelect = document.getElementById(config.gbId);
            const condicaoSelect = document.getElementById(config.condicaoId);
            const resumo = document.getElementById(config.resumoId);

            const indices = detectarIndices(config.tabelaId);

            function obterLinhas() {
                return Array.from(document.querySelectorAll('#' + config.tabelaId + ' tbody tr'));
            }

            function popularFiltros() {
                const linhas = obterLinhas();

                const produtos = new Set();
                const modelos = new Set();
                const gbs = new Set();
                const condicoes = new Set();

                linhas.forEach(linha => {
                    const tds = linha.querySelectorAll('td');

                    if (indices.produto >= 0 && tds[indices.produto]) produtos.add(tds[indices.produto].innerText.trim());
                    if (indices.modelo >= 0 && tds[indices.modelo]) modelos.add(tds[indices.modelo].innerText.trim());
                    if (indices.gb >= 0 && tds[indices.gb]) gbs.add(tds[indices.gb].innerText.trim());
                    if (indices.condicao >= 0 && tds[indices.condicao]) condicoes.add(tds[indices.condicao].innerText.trim());
                });

                preencherSelectComValores(config.produtoId, Array.from(produtos));
                preencherSelectComValores(config.modeloId, Array.from(modelos));
                preencherSelectComValores(config.gbId, Array.from(gbs));
                preencherSelectComValores(config.condicaoId, Array.from(condicoes));
            }

            function aplicarFiltros() {
                const linhas = obterLinhas();

                const termo = (busca?.value || '').toLowerCase().trim();
                const produto = (produtoSelect?.value || '').toLowerCase().trim();
                const modelo = (modeloSelect?.value || '').toLowerCase().trim();
                const gb = (gbSelect?.value || '').toLowerCase().trim();
                const condicao = (condicaoSelect?.value || '').toLowerCase().trim();

                let visiveis = 0;

                linhas.forEach(linha => {
                    const tds = linha.querySelectorAll('td');
                    const texto = linha.innerText.toLowerCase();

                    const valorProduto = (indices.produto >= 0 && tds[indices.produto]) ? tds[indices.produto].innerText.toLowerCase().trim() : '';
                    const valorModelo = (indices.modelo >= 0 && tds[indices.modelo]) ? tds[indices.modelo].innerText.toLowerCase().trim() : '';
                    const valorGb = (indices.gb >= 0 && tds[indices.gb]) ? tds[indices.gb].innerText.toLowerCase().trim() : '';
                    const valorCondicao = (indices.condicao >= 0 && tds[indices.condicao]) ? tds[indices.condicao].innerText.toLowerCase().trim() : '';

                    const okBusca = !termo || texto.includes(termo);
                    const okProduto = !produto || valorProduto === produto;
                    const okModelo = !modelo || valorModelo === modelo;
                    const okGb = !gb || valorGb === gb;
                    const okCondicao = !condicao || valorCondicao === condicao;

                    const mostrar = okBusca && okProduto && okModelo && okGb && okCondicao;
                    linha.style.display = mostrar ? '' : 'none';

                    if (mostrar) visiveis++;
                });

                if (resumo) {
                    resumo.textContent = visiveis + ' registro(s) encontrado(s)';
                }
            }

            popularFiltros();
            aplicarFiltros();

            [busca, produtoSelect, modeloSelect, gbSelect, condicaoSelect].forEach(el => {
                if (el) {
                    el.addEventListener('input', aplicarFiltros);
                    el.addEventListener('change', aplicarFiltros);
                }
            });
        }

        configurarFiltros({
            tabelaId: 'tabelaRelatorio',
            buscaId: 'buscaRelatorio',
            produtoId: 'produtoRelatorio',
            modeloId: 'modeloRelatorio',
            gbId: 'gbRelatorio',
            condicaoId: 'condicaoRelatorio',
            resumoId: 'resumoRelatorio'
        });

        configurarFiltros({
            tabelaId: 'tabelaPrecos',
            buscaId: 'buscaPrecos',
            produtoId: 'produtoPrecos',
            modeloId: 'modeloPrecos',
            gbId: 'gbPrecos',
            condicaoId: 'condicaoPrecos',
            resumoId: 'resumoPrecos'
        });
    </script>
</body>
</html>
"@

$destino = Join-Path $docs "index.html"
[System.IO.File]::WriteAllText($destino, $html, [System.Text.UTF8Encoding]::new($false))

Write-Host "HTML gerado em docs\index.html com filtros de produto, modelo, GB e condição"