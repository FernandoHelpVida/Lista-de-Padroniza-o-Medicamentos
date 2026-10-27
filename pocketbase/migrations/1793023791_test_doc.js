migrate(
  (app) => {
    try {
      // Procurar arquivos PDF existentes nos assets do projeto
      // No Skip Cloud pb_hooks/migrations, podemos testar $documents.toMarkdown com um arquivo
      // ou verificar se há arquivo PDF no diretório
      const fs = require('fs')
      // Se não houver require('fs'), goja pode não ter. Vamos testar.
    } catch (e) {
      // Ignorar
    }
  },
  (app) => {},
)
