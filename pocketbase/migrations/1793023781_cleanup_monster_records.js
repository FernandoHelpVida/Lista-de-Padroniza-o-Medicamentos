migrate(
  (app) => {
    // Limpeza idempotente de registros monstros corrompidos criados por fusão indevida de linhas
    const meds = app.findRecordsByFilter('medicamentos', "id != ''", '', 2000, 0)

    let deletedCount = 0

    meds.forEach((med) => {
      const nome = (med.getString('nome') || '').toUpperCase().trim()

      // Heurísticas de detecção de registros corrompidos/monstros:
      // 1. Nome excessivamente longo (> 120 chars) com 2+ ocorrências de formas farmacêuticas
      // 2. 2 ou mais ocorrências de COMPRIMIDO ou CAPSULA no nome
      // 3. Prefixos de markdown de títulos de cabeçalho residuais como '### ' ou '## NOME DO MEDICAMENTO'
      // 4. Fragmentos residuais de fusão com 'ANTIBACTERIANO ANTIBACTERIANO'

      let isMonster = false

      if (nome.length > 120) {
        const compCount = (nome.match(/\bCOMPRIMIDO\b/g) || []).length
        const capsCount = (nome.match(/\bCAPSULA\b/g) || []).length
        const ampCount = (nome.match(/\bAMPOLA\b/g) || []).length
        const frascoCount = (nome.match(/\bFRASCO\b/g) || []).length
        const totalForms = compCount + capsCount + ampCount + frascoCount
        if (totalForms >= 2) {
          isMonster = true
        }
      }

      if (!isMonster) {
        const compCount = (nome.match(/\bCOMPRIMIDO\b/g) || []).length
        if (compCount >= 2) {
          isMonster = true
        }
      }

      if (!isMonster) {
        const capsCount = (nome.match(/\bCAPSULA\b/g) || []).length
        if (capsCount >= 2) {
          isMonster = true
        }
      }

      if (!isMonster) {
        if (
          nome.startsWith('###') ||
          nome.startsWith('##') ||
          nome.includes('## NOME DO MEDICAMENTO') ||
          nome.includes('ANTIBACTERIANO ANTIBACTERIANO')
        ) {
          isMonster = true
        }
      }

      // Caso específico relatado pelo usuário e verificado no banco
      if (med.id === 'kuypla4ht4uplho') {
        isMonster = true
      }

      if (isMonster) {
        try {
          console.log(`[CLEANUP_MONSTER] Deletando registro ${med.id}: ${nome.substring(0, 60)}...`)
          app.delete(med)
          deletedCount++
        } catch (err) {
          console.log(`[CLEANUP_MONSTER_ERR] Erro ao deletar ${med.id}: ${err}`)
        }
      }
    })

    console.log(`[CLEANUP_MONSTER_DONE] Total de registros monstros deletados: ${deletedCount}`)
  },
  (app) => {
    // Operação irreversível e idempotente em rollback
  },
)
