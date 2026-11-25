/**
 * Critério de padronização (relação oficial ANEXO I).
 *
 * A coleção `medicamentos` (catálogo oficial importado do ANEXO I, IDs 1–482)
 * é a relação oficial de padronização: apenas registros com status='Padronizado'
 * contam. Produtos_spincare e as linhas do relatório "Saldo de Estoque" não têm
 * vínculo direto com o catálogo — a correspondência é pelo NOME, normalizado:
 * uma descrição é considerada padronizada quando contém (com fronteira de
 * palavra) o nome normalizado de um medicamento da relação oficial.
 *
 * Nada aqui altera dados: é critério de recorte para exibição/aplicação na
 * tela de importação do relatório.
 */
import pb from '@/lib/pocketbase/client'

/** Normaliza nome/descrição: minúsculo, sem acento, só letras/números/espaço. */
export function normalizarNomeProduto(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Carrega os nomes normalizados dos medicamentos PADRONIZADOS (relação oficial). */
export async function carregarNomesPadronizados(): Promise<Set<string>> {
  const recs = await pb.collection('medicamentos').getFullList<{ nome: string }>({
    filter: "status='Padronizado'",
    fields: 'nome',
    sort: '-created',
    requestKey: null,
  })
  const nomes = new Set<string>()
  for (const r of recs) {
    const n = normalizarNomeProduto(r.nome)
    // Nomes muito curtos (< 4 chars) gerariam falso-positivo por contenção.
    if (n.length >= 4) nomes.add(n)
  }
  return nomes
}

// Cache por descrição normalizada (descrições se repetem em milhares de linhas).
const cacheDescricao = new Map<string, boolean>()

/**
 * Diz se uma descrição de produto/linha do relatório pertence à relação oficial
 * de padronização. Compara por contenção com fronteira de palavra: o nome do
 * medicamento deve aparecer na descrição delimitado por espaço/início/fim
 * (a dosagem faz parte do nome, evitando trocar concentrações).
 */
export function ehProdutoPadronizado(
  descricao: string,
  nomesPadronizados: Set<string>,
): boolean {
  const desc = normalizarNomeProduto(descricao)
  if (!desc) return false
  const emCache = cacheDescricao.get(desc)
  if (emCache !== undefined) return emCache

  let resultado = false
  if (nomesPadronizados.has(desc)) {
    resultado = true
  } else {
    for (const nome of nomesPadronizados) {
      const pos = desc.indexOf(nome)
      if (pos === -1) continue
      const inicioOk = pos === 0 || desc[pos - 1] === ' '
      const fim = pos + nome.length
      const fimOk = fim === desc.length || desc[fim] === ' '
      if (inicioOk && fimOk) {
        resultado = true
        break
      }
    }
  }
  cacheDescricao.set(desc, resultado)
  return resultado
}
