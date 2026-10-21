// Utilitário para carregamento dinâmico do PDF.js no navegador
// Suporta carregamento de CDN com fallbacks para garantir funcionamento confiável

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: {
        workerSrc: string
      }
      getDocument: (params: { data: Uint8Array } | string) => {
        promise: Promise<PdfDocumentProxy>
      }
    }
  }
}

export interface PdfDocumentProxy {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
}

export interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

export interface PdfPageProxy {
  getTextContent: () => Promise<{
    items: Array<PdfTextItem | { [key: string]: unknown }>
  }>
}

let pdfjsLoadingPromise: Promise<typeof window.pdfjsLib> | null = null

export function loadPdfJs(): Promise<typeof window.pdfjsLib> {
  if (window.pdfjsLib) {
    return Promise.resolve(window.pdfjsLib)
  }

  if (pdfjsLoadingPromise) {
    return pdfjsLoadingPromise
  }

  pdfjsLoadingPromise = new Promise((resolve, reject) => {
    // Tentar carregar de CDNs confiáveis (cdnjs com fallback unpkg)
    const cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    const fallbackCdnUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
    const fallbackWorkerUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'

    const script = document.createElement('script')
    script.src = cdnUrl
    script.async = true

    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
        resolve(window.pdfjsLib)
      } else {
        reject(new Error('PDF.js carregado mas global pdfjsLib não encontrado.'))
      }
    }

    script.onerror = () => {
      // Fallback
      console.warn('Falha ao carregar PDF.js de cdnjs, tentando unpkg...')
      const fallbackScript = document.createElement('script')
      fallbackScript.src = fallbackCdnUrl
      fallbackScript.async = true
      fallbackScript.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = fallbackWorkerUrl
          resolve(window.pdfjsLib)
        } else {
          reject(new Error('PDF.js unpkg carregado mas global pdfjsLib não encontrado.'))
        }
      }
      fallbackScript.onerror = () => {
        reject(new Error('Não foi possível carregar a biblioteca PDF.js de nenhum CDN.'))
      }
      document.head.appendChild(fallbackScript)
    }

    document.head.appendChild(script)
  })

  return pdfjsLoadingPromise
}

export interface ExtractedPageText {
  pageNumber: number
  lines: string[]
  rawText: string
}

/**
 * Extrai texto página por página mantendo a estrutura de linhas com base nas coordenadas verticais
 */
export async function extractTextFromPdf(fileBuffer: ArrayBuffer): Promise<ExtractedPageText[]> {
  const pdfjs = await loadPdfJs()
  if (!pdfjs) throw new Error('PDF.js não está disponível')

  const doc = await pdfjs.getDocument({ data: new Uint8Array(fileBuffer) }).promise
  const pages: ExtractedPageText[] = []

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const textContent = await page.getTextContent()

    // Agrupar itens por linha (coordenada Y aproximada)
    // transform = [scaleX, skewY, skewX, scaleY, posX, posY]
    type ItemWithPos = { text: string; x: number; y: number }
    const itemsWithPos: ItemWithPos[] = []

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string' && item.str.trim()) {
        const x = Array.isArray(item.transform) ? item.transform[4] : 0
        const y = Array.isArray(item.transform) ? item.transform[5] : 0
        itemsWithPos.push({ text: item.str, x, y })
      }
    }

    // Agrupar itens que estejam na mesma linha (y com diferença <= 3 pontos)
    const lineMap = new Map<number, ItemWithPos[]>()
    for (const item of itemsWithPos) {
      let foundKey: number | null = null
      for (const key of lineMap.keys()) {
        if (Math.abs(key - item.y) <= 3) {
          foundKey = key
          break
        }
      }
      if (foundKey !== null) {
        lineMap.get(foundKey)!.push(item)
      } else {
        lineMap.set(item.y, [item])
      }
    }

    // Ordenar linhas de cima para baixo (y decrescente no sistema de coordenadas do PDF)
    const sortedYKeys = Array.from(lineMap.keys()).sort((a, b) => b - a)

    const lines: string[] = []
    for (const y of sortedYKeys) {
      const lineItems = lineMap.get(y)!
      // Ordenar itens da esquerda para a direita (x crescente)
      lineItems.sort((a, b) => a.x - b.x)
      const lineStr = lineItems
        .map((it) => it.text)
        .join(' ')
        .trim()
      if (lineStr) {
        lines.push(lineStr)
      }
    }

    pages.push({
      pageNumber: pageNum,
      lines,
      rawText: lines.join('\n'),
    })
  }

  return pages
}
