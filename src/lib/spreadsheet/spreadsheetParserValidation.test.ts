import {
  parseRawSpreadsheetRows,
  parseCsvToRows,
  mapDefinicaoToStatus,
  buildSpreadsheetMissingReport,
  exportSpreadsheetMissingItemsToCsv,
} from './spreadsheetParser'

export function runSpreadsheetParserValidationTests() {
  // Teste 1: Mapeamento de Definição
  const p1 = mapDefinicaoToStatus('Padrão')
  const p2 = mapDefinicaoToStatus('PADRAO')
  const p3 = mapDefinicaoToStatus('  Padrão  ')
  if (p1 !== 'Padronizado' || p2 !== 'Padronizado' || p3 !== 'Padronizado') {
    throw new Error(`Falha no mapeamento de Padrão: ${p1}`)
  }

  const np1 = mapDefinicaoToStatus('NÃO padrão')
  const np2 = mapDefinicaoToStatus('Nao Padrao')
  const np3 = mapDefinicaoToStatus('não padronizado')
  if (np1 !== 'Não Padronizado' || np2 !== 'Não Padronizado' || np3 !== 'Não Padronizado') {
    throw new Error(`Falha no mapeamento de NÃO padrão: ${np1}`)
  }

  const inat1 = mapDefinicaoToStatus('Inativo')
  const inat2 = mapDefinicaoToStatus('inativos')
  if (inat1 !== 'Inativo' || inat2 !== 'Inativo') {
    throw new Error(`Falha no mapeamento de Inativo: ${inat1}`)
  }

  const invalido = mapDefinicaoToStatus('Outro status')
  if (invalido !== null) {
    throw new Error(`Status inesperado deveria retornar null: ${invalido}`)
  }

  // Teste 2: Parser de CSV estruturado (delimitador ; e ,)
  const csvSample = `ID;Nome do medicamento;Classe;Definição
1;TESTE MED 1;Classe A;Padrão
2;TESTE MED 2;Classe B;NÃO padrão
3;TESTE MED 3;Classe C;Inativo
`
  const rowsFromCsv = parseCsvToRows(csvSample)
  if (rowsFromCsv.length !== 3) {
    throw new Error(`CSV parsing retornou ${rowsFromCsv.length} linhas, esperado 3`)
  }

  const parsedFromCsv = parseRawSpreadsheetRows(rowsFromCsv, 'CSV')
  if (parsedFromCsv.items.length !== 3) {
    throw new Error(`Esperado 3 itens válidos, encontrado: ${parsedFromCsv.items.length}`)
  }
  if (parsedFromCsv.items[0].status !== 'Padronizado' || parsedFromCsv.items[0].pdfId !== 1) {
    throw new Error('Item 1 do CSV com status/id incorreto')
  }
  if (parsedFromCsv.items[1].status !== 'Não Padronizado' || parsedFromCsv.items[1].pdfId !== 2) {
    throw new Error('Item 2 do CSV com status/id incorreto')
  }
  if (parsedFromCsv.items[2].status !== 'Inativo' || parsedFromCsv.items[2].pdfId !== 3) {
    throw new Error('Item 3 do CSV com status/id incorreto')
  }

  // Teste 3: Tolerância a variações de cabeçalho e espaços extras
  const sampleVariations = [
    {
      ' ID ': ' 10 ',
      ' Nome do Medicamento ': '  MEDICAMENTO COM ESPAÇO EXTRA  ',
      ' Classe ': ' Antibacteriano ',
      ' Definição ': '  Padrão  ',
    },
    {
      ID: '11',
      Nome: 'MEDICAMENTO 11',
      Classe: 'Antifúngico',
      Status: 'NÃO padrão',
    },
  ]
  const parsedVariations = parseRawSpreadsheetRows(sampleVariations)
  if (parsedVariations.items.length !== 2) {
    throw new Error(
      `Esperado 2 itens em parsedVariations, obtido: ${parsedVariations.items.length}`,
    )
  }
  if (parsedVariations.items[0].nome !== 'MEDICAMENTO COM ESPAÇO EXTRA') {
    throw new Error(`Nome não foi limpo adequadamente: "${parsedVariations.items[0].nome}"`)
  }
  if (parsedVariations.items[0].pdfId !== 10) {
    throw new Error(`ID não foi parseado corretamente: ${parsedVariations.items[0].pdfId}`)
  }

  // Teste 4: Validação e registro de descartes (nunca silêncio)
  const sampleComErros = [
    {
      ID: '1',
      'Nome do medicamento': 'ITEM VALIDO 1',
      Classe: 'Classe 1',
      Definição: 'Padrão',
    },
    {
      ID: '1', // ID duplicado!
      'Nome do medicamento': 'ITEM DUPLICADO MESMO ID',
      Classe: 'Classe 1',
      Definição: 'Padrão',
    },
    {
      ID: '999', // Fora do intervalo oficial 1-482
      'Nome do medicamento': 'ITEM ID FORA DA REGUA',
      Classe: 'Classe 1',
      Definição: 'Padrão',
    },
    {
      ID: '5',
      'Nome do medicamento': '', // Nome vazio
      Classe: 'Classe 1',
      Definição: 'Padrão',
    },
    {
      ID: '6',
      'Nome do medicamento': 'ITEM COM STATUS INVALIDO',
      Classe: 'Classe 1',
      Definição: 'Valor Estranho XYZ',
    },
  ]

  const resultErros = parseRawSpreadsheetRows(sampleComErros)
  if (resultErros.items.length !== 1) {
    throw new Error(`Esperado apenas 1 item válido, obtido: ${resultErros.items.length}`)
  }
  if (resultErros.descartados.length !== 4) {
    throw new Error(
      `Esperado 4 descartes registrados com motivo, obtido: ${resultErros.descartados.length}`,
    )
  }

  // Teste 5: Relatório de faltantes no intervalo
  const report = buildSpreadsheetMissingReport(resultErros.items, resultErros.descartados, 1, 10)
  // De 1 a 10, apenas o ID 1 é válido -> 9 faltantes
  if (report.length !== 9) {
    throw new Error(`Esperado 9 faltantes no relatório de 1 a 10, obtido: ${report.length}`)
  }

  const id5Faltante = report.find((r) => r.pdfId === 5)
  if (!id5Faltante || id5Faltante.origemEvidencia !== 'descarte_registrado') {
    throw new Error('ID 5 deveria estar no relatório com origem descarte_registrado')
  }

  const id6Faltante = report.find((r) => r.pdfId === 6)
  if (!id6Faltante || !id6Faltante.motivo.includes('Definição de status inesperada')) {
    throw new Error('ID 6 deveria ter o motivo de status inesperado')
  }

  const id10Faltante = report.find((r) => r.pdfId === 10)
  if (!id10Faltante || id10Faltante.origemEvidencia !== 'sem_correspondencia') {
    throw new Error('ID 10 ausente deveria estar marcado como sem_correspondencia')
  }

  // Teste 6: Exportação de CSV
  const csvReport = exportSpreadsheetMissingItemsToCsv(report)
  if (
    !csvReport.includes(
      'ID;Status / Origem;Motivo da Ausência / Descarte;Linha;Texto Bruto da Linha',
    )
  ) {
    throw new Error('Cabeçalho de exportação de CSV faltantes inválido')
  }

  // Teste 7: Coluna opcional de classe detalhada / subclasse
  const sampleWithSubclasse = [
    {
      ID: '1',
      'Nome do medicamento': 'LOSARTANA 100MG COMPRIMIDO',
      Classe: 'Anti-hipertensivo',
      'Classe Detalhada': 'Antagonista do receptor angiotensina',
      Definição: 'Padrão',
    },
    {
      ID: '2',
      'Nome do medicamento': 'CAPTOPRIL 25MG',
      Classe: 'Anti-hipertensivo',
      Subclasse: 'Inibidor da ECA',
      Definição: 'Padrão',
    },
    {
      ID: '3',
      'Nome do medicamento': 'DIPIRONA 500MG',
      Classe: 'Analgésico',
      Definição: 'Padrão',
    },
  ]
  const parsedSubclasse = parseRawSpreadsheetRows(sampleWithSubclasse)
  if (parsedSubclasse.items.length !== 3) {
    throw new Error(`Esperado 3 itens com subclasse, obtido: ${parsedSubclasse.items.length}`)
  }
  if (
    parsedSubclasse.items[0].classeDetalhada !== 'Antagonista do receptor angiotensina' ||
    parsedSubclasse.items[0].classe !== 'Anti-hipertensivo'
  ) {
    throw new Error(
      `Falha ao extrair Classe Detalhada: "${parsedSubclasse.items[0].classeDetalhada}"`,
    )
  }
  if (
    parsedSubclasse.items[1].classeDetalhada !== 'Inibidor da ECA' ||
    parsedSubclasse.items[1].classe !== 'Anti-hipertensivo'
  ) {
    throw new Error(`Falha ao extrair Subclasse: "${parsedSubclasse.items[1].classeDetalhada}"`)
  }
  if (parsedSubclasse.items[2].classeDetalhada) {
    throw new Error('Item 3 não deveria ter classeDetalhada preenchida')
  }

  return {
    success: true,
    testsPassed: 7,
  }
}
