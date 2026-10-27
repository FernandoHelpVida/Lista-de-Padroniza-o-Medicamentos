import { parseMedicamentosFromPages, isContinuationLine, isMonsterItem } from './pdfParser'
import type { ExtractedPageText } from './pdfLoader'

export function runPdfParserValidationTests() {
  const samplePages: ExtractedPageText[] = [
    {
      pageNumber: 1,
      lines: [
        'Tipo Documento: ANEXO I',
        'Relação dos Medicamentos Avaliados e Definição de Padronização',
        '65 3611 – 1300 / 65 3622 0911 Rua das Camélias, 381 – Jardim Cuiabá',
        'Medicamentos Padronizados:',
        'Nome do medicamento Classe Definição',
        'AGUA DESTILADA 5L Água/diluente Padrão',
        'CODEINA 30MG COMPRIMIDO Analgésico opioide Padrão',
        'TRAMADOL 100MG/ML GOTAS FRASCO 10',
        'ML Analgésico opioide Padrão',
        'PARACETAMOL 500MG + CODEINA 30MG',
        'COMPRIMIDO Analgésico/antitérmico Padrão',
        'ACIDO ACETILSALICILICO 100MG',
        'COMPRIMIDO Antiagregante plaquetário Padrão',
      ],
      rawText: '',
    },
    {
      pageNumber: 2,
      lines: [
        'AMOXICILINA 875MG + CLAVULANATO',
        '125MG COMPRIMIDO Antibacteriano Padrão',
        'AMOXICILINA 400MG/5ML + CLAV 57MG/5ML',
        'FRASCO 70 ML Antibacteriano Padrão',
        'SULFA + TRIMETOPRIMA 200MG/5ML +',
        '40MG/5ML SUSPENSAO ORAL FRASCO 100',
        'ML Antibacteriano Padrão',
      ],
      rawText: '',
    },
    {
      pageNumber: 3,
      lines: [
        'INSULINA LANTUS 100UI/ML FRASCO',
        'AMPOLA 10 ML Antidiabético Padrão',
        'INSULINA NPH FRASCO AMPOLA 10 ML Antidiabético Padrão',
        'INSULINA REGULAR FRASCO AMPOLA 10 ML Antidiabético Padrão',
        'DIMENIDRINATO + ASSOCIACOES (DRAMIN Antiemético/antivertiginoso Padrão',
        '65 3611 – 1300 Rua das Camélias',
      ],
      rawText: '',
    },
    {
      pageNumber: 4,
      lines: [
        'Tipo Documento: ANEXO I',
        '65 3611 – 1300 Rua das Camélias',
        'B6 DL) AMPOLA 10 ML',
        'TOPIRAMATO (AMATO) 50MG COMPRIMIDO Antiepiléptico Padrão',
        'LEVETIRACETAM (KEPPRA)100MG/ML',
        'FRASCO 150 ML Antiepiléptico Padrão',
        'VALPROATO DE SODIO (DEPAKENE)',
        '250MG/5ML 100 ML Antiepiléptico Padrão',
      ],
      rawText: '',
    },
    {
      pageNumber: 13,
      lines: [
        'EPISOL SEC OC FPS 60 FRASCO 60 Dermatológico/cosmético NÃO padrão',
        '65 3611 – 1300 Rua das Camélias',
      ],
      rawText: '',
    },
    {
      pageNumber: 14,
      lines: [
        'Tipo Documento: ANEXO I',
        '65 3611 – 1300 Rua das Camélias',
        'G',
        'FISIOGEL LOCAO CREMOSA',
        'FRASCO 400 ML Dermatológico/cosmético NÃO padrão',
      ],
      rawText: '',
    },
  ]

  const result = parseMedicamentosFromPages(samplePages)

  // Asserções
  const amox = result.items.find((i) => i.nome.includes('AMOXICILINA 875MG'))
  if (!amox) throw new Error('AMOXICILINA 875MG não encontrada')
  if (!amox.nome.includes('125MG COMPRIMIDO')) {
    throw new Error(`AMOXICILINA 875MG não incluiu 125MG COMPRIMIDO: ${amox.nome}`)
  }

  const dramin = result.items.find((i) => i.nome.includes('DRAMIN'))
  if (!dramin) throw new Error('DRAMIN não encontrado')
  if (!dramin.nome.includes('B6 DL) AMPOLA 10 ML')) {
    throw new Error(`DRAMIN não unificou através da quebra de página: ${dramin.nome}`)
  }

  const episol = result.items.find((i) => i.nome.includes('EPISOL SEC OC FPS 60'))
  if (!episol) throw new Error('EPISOL não encontrado')
  if (!episol.nome.endsWith('60 G')) {
    throw new Error(`EPISOL não anexou o G órfão da página seguinte: ${episol.nome}`)
  }

  // Verificar que não há fragmento solto isolado
  const fragment = result.items.find((i) => i.nome === '125MG COMPRIMIDO' || i.nome === 'G')
  if (fragment) throw new Error(`Fragmento solto virou item independente: ${fragment.nome}`)

  // Verificar insulinas separadas
  const insulinas = result.items.filter((i) => i.nome.includes('INSULINA'))
  if (insulinas.length !== 3) {
    throw new Error(`Esperado 3 insulinas, encontrado: ${insulinas.length}`)
  }

  return { success: true, totalItems: result.items.length }
}
