migrate(
  (app) => {
    // 1. Seed Admin User
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'fernandofernandes@helpvida.com.br')
    } catch (_) {
      const adminUser = new Record(users)
      adminUser.setEmail('fernandofernandes@helpvida.com.br')
      adminUser.setPassword('Skip@Pass')
      adminUser.setVerified(true)
      adminUser.set('name', 'Fernando Fernandes')
      app.save(adminUser)
    }

    // 2. Seed Medicamentos
    const medCol = app.findCollectionByNameOrId('medicamentos')

    const items = [
      // --- PÁGINA 1: Padronizados ---
      {
        nome: 'CODEINA 30MG COMPRIMIDO',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide padronizado para alívio de dor moderada a intensa.',
      },
      {
        nome: 'FENTANIL 50MCG/ML AMPOLA 2 ML',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide de alta potência para analgesia profunda ou anestesia.',
      },
      {
        nome: 'METADONA 10MG COMPRIMIDO',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Opioide sintético para dor crônica intensa e controle da dor.',
      },
      {
        nome: 'METADONA 5MG COMPRIMIDO',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Opioide sintético para dor crônica intensa.',
      },
      {
        nome: 'MORFINA 10MG/ML AMPOLA 1 ML',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide potente injetável para dor aguda ou crônica intensa.',
      },
      {
        nome: 'MORFINA 1MG/ML AMPOLA 2 ML',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide potente injetável.',
      },
      {
        nome: 'MORFINA 30MG COMPRIMIDO',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide potente em comprimido oral.',
      },
      {
        nome: 'TRAMADOL 100MG COMPRIMIDO',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide sintético de ação central para dor moderada.',
      },
      {
        nome: 'TRAMADOL 100MG/ML GOTAS 10 ML',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide sintético em gotas orais.',
      },
      {
        nome: 'TRAMADOL 50MG CAPSULA',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide de ação central em cápsula.',
      },
      {
        nome: 'TRAMADOL 50MG/ML AMPOLA 2 ML',
        classe: 'Analgésico opioide',
        status: 'Padronizado',
        descricao: 'Analgésico opioide injetável para dor pós-operatória e aguda.',
      },
      {
        nome: 'DIPIRONA 1G COMPRIMIDO',
        classe: 'Analgésico/antitérmico',
        status: 'Padronizado',
        descricao: 'Analgésico e antipirético de amplo uso clínico.',
      },
      {
        nome: 'DIPIRONA 500MG COMPRIMIDO',
        classe: 'Analgésico/antitérmico',
        status: 'Padronizado',
        descricao: 'Analgésico e antipirético oral.',
      },
      {
        nome: 'DIPIRONA 500MG/ML AMPOLA 2 ML',
        classe: 'Analgésico/antitérmico',
        status: 'Padronizado',
        descricao: 'Analgésico e antipirético injetável.',
      },
      {
        nome: 'DIPIRONA 500MG/ML FR 10 ML',
        classe: 'Analgésico/antitérmico',
        status: 'Padronizado',
        descricao: 'Analgésico e antipirético gotas orais.',
      },
      {
        nome: 'PARACETAMOL 200MG/ML FR15 ML',
        classe: 'Analgésico/antitérmico',
        status: 'Padronizado',
        descricao: 'Analgésico e antitérmico pediátrico em gotas.',
      },
      {
        nome: 'PARACETAMOL 500MG + CODEINA 30MG COMPRIMIDO',
        classe: 'Analgésico/antitérmico',
        status: 'Padronizado',
        descricao: 'Associação analgésica para dor moderada a intensa.',
      },
      {
        nome: 'AMICACINA 250MG/ML AMPOLA 2 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Aminoglicosídeo injetável para infecções bacterianas graves.',
      },
      {
        nome: 'AMOXICILINA 400MG/5ML + CLAV 57MG/5ML FR 70 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Associação de penicilina com inibidor de betalactamase em suspensão oral.',
      },
      {
        nome: 'AMOXICILINA 875MG + CLAV 125MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Associação de amoxicilina e ácido clavulânico em comprimidos.',
      },
      {
        nome: 'AZITROMICINA 200MG/5ML SUSPENSAO ORAL FR 15 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Macrolídeo em suspensão para infecções do trato respiratório e outras.',
      },
      {
        nome: 'AZITROMICINA 500MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Macrolídeo oral de posologia diária única.',
      },
      {
        nome: 'CEFACLOR 250MG/5ML FR 100 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Cefalosporina de 2ª geração em suspensão oral.',
      },
      {
        nome: 'CEFALEXINA 250MG/5ML FR 100 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Cefalosporina de 1ª geração em suspensão oral.',
      },
      {
        nome: 'CEFEPIMA 1G FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Cefalosporina de 4ª geração injetável de amplo espectro.',
      },
      {
        nome: 'CEFEPIMA 2G FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Cefalosporina de 4ª geração injetável de amplo espectro.',
      },
      {
        nome: 'CEFTRIAXONA 1G FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Cefalosporina de 3ª geração de amplo espectro.',
      },
      {
        nome: 'CIPROFLOXACINO 400MG BOLSA 200 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Fluoroquinolona injetável para infecções sistêmicas.',
      },
      {
        nome: 'CIPROFLOXACINO 500MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Fluoroquinolona oral de amplo espectro.',
      },
      {
        nome: 'CLINDAMICINA 150MG/ML AMPOLA 4 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Lincosamida injetável ativa contra gram-positivos e anaeróbios.',
      },
      {
        nome: 'CLINDAMICINA 300MG CAPSULA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Lincosamida oral para infecções bacterianas suscetíveis.',
      },

      // --- PÁGINA 2: Padronizados ---
      {
        nome: 'DAPTOMICINA 500MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Lipopeptídeo cíclico injetável para infecções graves por gram-positivos.',
      },
      {
        nome: 'ERTAPENEM 1G FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Carbapenêmico injetável de dose única diária.',
      },
      {
        nome: 'FOSFOMICINA TROM SACHE 8 G',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Antibiótico em sachê para infecções urinárias agudas não complicadas.',
      },
      {
        nome: 'GENTAMICINA 80MG/2ML AMPOLA 2 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Aminoglicosídeo injetável para infecções bacterianas graves.',
      },
      {
        nome: 'LEVOFLOXACINO 5MG/ML BOLSA 100 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Fluoroquinolona respiratória injetável.',
      },
      {
        nome: 'LEVOFLOXACINO 750MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Fluoroquinolona respiratória em alta dose oral.',
      },
      {
        nome: 'LINEZOLIDA 600MG BOLSA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Oxazolidinona injetável para infecções bacterianas resistentes (MRSA, VRE).',
      },
      {
        nome: 'MEROPENEM 1G FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Carbapenêmico de amplo espectro injetável.',
      },
      {
        nome: 'METRONIDAZOL 250MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Antibacteriano e antiprotozoário oral para anaeróbios.',
      },
      {
        nome: 'METRONIDAZOL 5MG/ML BOLSA 100 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Antibacteriano injetável para infecções anaeróbias.',
      },
      {
        nome: 'MOXIFLOXACINO 1,6MG/ML PO PARA SOLUCAO INJETAVEL BOLSA 250 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Fluoroquinolona injetável para infecções respiratórias complexas.',
      },
      {
        nome: 'MOXIFLOXACINO 400MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Fluoroquinolona oral de amplo espectro.',
      },
      {
        nome: 'NITROFURANTOINA 100MG CAPSULA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Antibacteriano urinário para cistites e profilaxia.',
      },
      {
        nome: 'PIPERACILINA +TAZOBACTAM 4,5G FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Penicilina antipseudomonas associada a inibidor de betalactamase.',
      },
      {
        nome: 'SULFA + TRIMETOPRIMA 200MG/5ML + 40MG/5ML SUSPENSAO ORAL FR 100 ML',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Associação sulfametoxazol e trimetoprima pediátrica.',
      },
      {
        nome: 'SULFA + TRIMETROPIMA 800MG 160MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Sulfametoxazol + trimetoprima em dose dupla oral.',
      },
      {
        nome: 'TEICOPLANINA 400MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Glicopeptídeo injetável para infecções por gram-positivos multirresistentes.',
      },
      {
        nome: 'VANCOMICINA 500MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Padronizado',
        descricao: 'Glicopeptídeo injetável para infecções estafilocócicas e enterocócicas graves.',
      },
      {
        nome: 'FLUCONAZOL 150MG CAPSULA',
        classe: 'Antifúngico',
        status: 'Padronizado',
        descricao: 'Triazol antifúngico oral para candidíase e micoses sistêmicas.',
      },
      {
        nome: 'FLUCONAZOL 2MG/ML BOLSA 100 ML',
        classe: 'Antifúngico',
        status: 'Padronizado',
        descricao: 'Antifúngico injetável para infecções fúngicas invasivas.',
      },
      {
        nome: 'NISTATINA 100,000 UI/ML SUSPENSAO ORAL 50 ML',
        classe: 'Antifúngico',
        status: 'Padronizado',
        descricao: 'Antifúngico tópico oral para candidíase orofaríngea.',
      },
      {
        nome: 'BROMOPRIDA 10MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Procinético e antiemético oral.',
      },
      {
        nome: 'BROMOPRIDA 4MG/ML GOTAS 20 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Procinético e antiemético em gotas orais.',
      },
      {
        nome: 'BROMOPRIDA 5MG/ML AMPOLA 2 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Procinético e antiemético injetável.',
      },
      {
        nome: 'CIMETIDINA 150MG/ML AMPOLA 2 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antagonista H2 injetável para supressão ácida gástrica.',
      },
      {
        nome: 'DOMPERIDONA 10MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antagonista dopaminérgico periférico para motilidade gastrointestinal.',
      },
      {
        nome: 'DOMPERIDONA 1MG/ML 100 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiemético e procinético em suspensão oral.',
      },
      {
        nome: 'ESOMEPRAZOL 20MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Inibidor de bomba de prótons para doença do refluxo e úlcera péptica.',
      },
      {
        nome: 'ESOMEPRAZOL 40MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Inibidor de bomba de prótons oral de alta potência.',
      },
      {
        nome: 'HIDROXIDO DE ALUMINO + HIDROXIDO DE MAGNESIO + SIMETICONA FR 240 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiácido e antiflatulento em suspensão oral.',
      },
      {
        nome: 'OMEPRAZOL 10MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Inibidor de bomba de prótons oral para supressão ácida.',
      },
      {
        nome: 'OMEPRAZOL 20MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Inibidor de bomba de prótons para refluxo e gastrite.',
      },
      {
        nome: 'METOCLOPRAMIDA 10MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiemético e estimulante da motilidade gástrica.',
      },
      {
        nome: 'METOCLOPRAMIDA 4MG/ML FR 10 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiemético e procinético em solução gotas.',
      },
      {
        nome: 'METOCLOPRAMIDA 5MG/ML AMPOLA 2 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiemético e procinético injetável.',
      },
      {
        nome: 'ONDANSETRONA 2MG/ML AMPOLA 2 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antagonista 5-HT3 potente antiemético injetável.',
      },
      {
        nome: 'ONDANSETRONA 2MG/ML AMPOLA 4 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antagonista 5-HT3 injetável para náuseas e vômitos.',
      },
      {
        nome: 'ONDANSETRONA 4MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiemético antagonista 5-HT3 oral.',
      },
      {
        nome: 'ONDANSETRONA 8MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiemético antagonista 5-HT3 oral.',
      },
      {
        nome: 'PANTOPRAZOL 40MG FRASCO AMPOLA',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Inibidor de bomba de prótons injetável para hemorragia digestiva e profilaxia.',
      },
      {
        nome: 'SIMETICONA 40MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiflatulento oral para alívio de gases e cólicas abdominais.',
      },

      // --- PÁGINA 3: Padronizados ---
      {
        nome: 'SIMETICONA 75MG/ML FR 15 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Antiflatulento em emulsão oral gotas.',
      },
      {
        nome: 'SUCRALFATO 200MG/ML 10 ML',
        classe: 'Gastrointestinal',
        status: 'Padronizado',
        descricao: 'Protetor da mucosa gástrica e duodenal.',
      },
      {
        nome: 'ÁGUA DESTILADA 5L',
        classe: 'Água/Diluente',
        status: 'Padronizado',
        descricao: 'Diluente estéril para preparo de medicamentos e soluções.',
      },
      {
        nome: 'LIDOCAINA 2% 30 G',
        classe: 'Anestésico local',
        status: 'Padronizado',
        descricao: 'Anestésico tópico local em gel/pomada.',
      },
      {
        nome: 'LIDOCAINA 2% SEM VASO FRASCO AMPOLA 20 ML',
        classe: 'Anestésico local',
        status: 'Padronizado',
        descricao: 'Anestésico local injetável sem vasoconstritor.',
      },
      {
        nome: 'ALPRAZOLAM 0,5MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico para transtornos de ansiedade e pânico.',
      },
      {
        nome: 'ALPRAZOLAM 1MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico ansiolítico.',
      },
      {
        nome: 'CLOBAZAM 10MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico com ação ansiolítica e anticonvulsivante.',
      },
      {
        nome: 'CLOBAZAM 20MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico ansiolítico e antiepiléptico.',
      },
      {
        nome: 'CLONAZEPAM 2,5MG/ML 20 ML',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico em solução gotas oral.',
      },
      {
        nome: 'CLONAZEPAM 2MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico ansiolítico e anticonvulsivante oral.',
      },
      {
        nome: 'DIAZEPAM 10MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico sedativo, relaxante muscular e ansiolítico.',
      },
      {
        nome: 'DIAZEPAM 5MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico sedativo e ansiolítico.',
      },
      {
        nome: 'DIAZEPAM 5MG/ML AMPOLA 2 ML',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico injetável para crises convulsivas e sedação rápida.',
      },
      {
        nome: 'MIDAZOLAM 5MG/ML AMPOLA 3 ML',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico de curta ação para sedação e indução anestésica.',
      },
      {
        nome: 'NITRAZEPAM 5MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Padronizado',
        descricao: 'Benzodiazepínico hipnótico para insônia severa.',
      },
      {
        nome: 'ACIDO ACETILSALICILICO 100MG COMPRIMIDO',
        classe: 'Antiagregante plaquetário',
        status: 'Padronizado',
        descricao: 'Antiagregante plaquetário profilático cardiovascular.',
      },
      {
        nome: 'CLOPIDOGREL 75MG COMPRIMIDO',
        classe: 'Antiagregante plaquetário',
        status: 'Padronizado',
        descricao: 'Inibidor da agregação plaquetária ativado por ADP.',
      },
      {
        nome: 'ADENOSINA 3MG/ML AMPOLA 2 ML',
        classe: 'Antiarrítmico',
        status: 'Padronizado',
        descricao: 'Antiarrítmico para reversão de taquicardia supraventricular paroxística.',
      },
      {
        nome: 'AMIODARONA 200MG COMPRIMIDO',
        classe: 'Antiarrítmico',
        status: 'Padronizado',
        descricao: 'Antiarrítmico de classe III para arritmias ventriculares e atriais.',
      },
      {
        nome: 'AMIODARONA 50MG/ML AMPOLA 3 ML',
        classe: 'Antiarrítmico',
        status: 'Padronizado',
        descricao: 'Antiarrítmico injetável para emergências cardiovasculares.',
      },
      {
        nome: 'MONTELUCASTE 4MG COMPRIMIDO',
        classe: 'Antiasmático',
        status: 'Padronizado',
        descricao: 'Antagonista de receptores de leucotrienos para asma e rinite alérgica.',
      },
      {
        nome: 'MONTELUCASTE 5MG COMPRIMIDO',
        classe: 'Antiasmático',
        status: 'Padronizado',
        descricao: 'Antagonista de receptores de leucotrienos mastigável.',
      },
      {
        nome: 'APIXABANA 2,5MG COMPRIMIDO',
        classe: 'Anticoagulante',
        status: 'Padronizado',
        descricao: 'Inibidor direto do fator Xa oral.',
      },
      {
        nome: 'APIXABANA 5MG COMPRIMIDO',
        classe: 'Anticoagulante',
        status: 'Padronizado',
        descricao: 'Inibidor oral direto do fator Xa para prevenção de TEV e AVC.',
      },
      {
        nome: 'ENOXAPARINA 20MG SERINGA PREENCHIDA',
        classe: 'Anticoagulante',
        status: 'Padronizado',
        descricao: 'Heparina de baixo peso molecular subcutânea.',
      },
      {
        nome: 'ENOXAPARINA 40MG SERINGA PREENCHIDA',
        classe: 'Anticoagulante',
        status: 'Padronizado',
        descricao: 'Heparina de baixo peso molecular para profilaxia e tratamento de TEV.',
      },
      {
        nome: 'ENOXAPARINA 60MG SERINGA PREENCHIDA',
        classe: 'Anticoagulante',
        status: 'Padronizado',
        descricao: 'Heparina de baixo peso molecular em dose terapêutica.',
      },
      {
        nome: 'RIVAROXABANA 10MG COMPRIMIDO',
        classe: 'Anticoagulante',
        status: 'Padronizado',
        descricao: 'Anticoagulante oral inibidor direto do fator Xa.',
      },
      {
        nome: 'RIVAROXABANA 20MG COMPRIMIDO',
        classe: 'Anticoagulante',
        status: 'Padronizado',
        descricao: 'Anticoagulante oral para fibrilação atrial e TEV.',
      },
      {
        nome: 'ATROPINA 1% 5 ML',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Padronizado',
        descricao: 'Anticolinérgico oftálmico/solução antimuscarínica.',
      },
      {
        nome: 'ESCOPOLAMINA 10MG/ML GOTAS 20 ML',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Padronizado',
        descricao: 'Antiespasmódico oral para cólicas biliares e gastrointestinais.',
      },
      {
        nome: 'ESCOPOLAMINA 20MG/ML AMPOLA 1 ML',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Padronizado',
        descricao: 'Antiespasmódico injetável para alívio imediato de espasmos.',
      },
      {
        nome: 'ESCOPOLAMINA DIPIRONA GOTAS 20 ML',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Padronizado',
        descricao: 'Associação antiespasmódica e analgésica em gotas.',
      },
      {
        nome: 'AMITRIPTILINA 25MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Antidepressivo tricíclico usado também para dor neuropática.',
      },
      {
        nome: 'DESVENLAFAXINA 100MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Inibidor da recaptação de serotonina e noradrenalina (IRSN).',
      },
      {
        nome: 'DESVENLAFAXINA 50MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Antidepressivo IRSN para transtorno depressivo maior.',
      },
      {
        nome: 'DULOXETINA 30MG CAPSULA',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'IRSN oral para depressão, fibromialgia e neuropatia diabética.',
      },
      {
        nome: 'DULOXETINA 60MG CAPSULA',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Antidepressivo IRSN em cápsula de liberação retardada.',
      },
      {
        nome: 'ESCITALOPRAM 10MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Inibidor seletivo da recaptação de serotonina (ISRS).',
      },
      {
        nome: 'ESCITALOPRAM 15MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Antidepressivo ISRS de alta especificidade.',
      },
      {
        nome: 'ESCITALOPRAM 20MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Antidepressivo ISRS em dose máxima oral.',
      },

      // --- PÁGINA 4: Padronizados ---
      {
        nome: 'FLUOXETINA 20MG CAPSULA',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Antidepressivo ISRS para depressão, TOC e bulimia.',
      },
      {
        nome: 'MIRTAZAPINA 30MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Antidepressivo noradrenérgico e específico serotoninérgico.',
      },
      {
        nome: 'SERTRALINA 50MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'ISRS amplamente utilizado com bom perfil cardiovascular.',
      },
      {
        nome: 'TRAZODONA 50MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Padronizado',
        descricao: 'Antidepressivo com efeito hipnótico e sedativo.',
      },
      {
        nome: 'GLICLAZIDA 30MG COMPRIMIDO',
        classe: 'Antidiabético',
        status: 'Padronizado',
        descricao: 'Sulfonilureia de liberação modificada para diabetes tipo 2.',
      },
      {
        nome: 'INSULINA LANTUS 100UI/ML FRASCO AMPOLA 10 ML',
        classe: 'Antidiabético',
        status: 'Padronizado',
        descricao: 'Insulina glargina de ação prolongada para controle basal.',
      },
      {
        nome: 'METFORMINA (GLIFAGE XR) 500MG COMPRIMIDO',
        classe: 'Antidiabético',
        status: 'Padronizado',
        descricao: 'Biguanida de liberação prolongada para controle glicêmico.',
      },
      {
        nome: 'METFORMINA 850MG COMPRIMIDO',
        classe: 'Antidiabético',
        status: 'Padronizado',
        descricao: 'Biguanida de primeira escolha no tratamento do DM2.',
      },
      {
        nome: 'BETAISTINA 24MG COMPRIMIDO',
        classe: 'Antiemético/antivertiginoso',
        status: 'Padronizado',
        descricao: 'Análogo de histamina para síndrome de Ménière e vertigem.',
      },
      {
        nome: 'DIMENIDRINATO 25MG/ML + PIRIDOXINA 5MG/ML GOTAS 20 ML',
        classe: 'Antiemético/antivertiginoso',
        status: 'Padronizado',
        descricao: 'Antiemético e antivertiginoso em gotas.',
      },
      {
        nome: 'TOPIRAMATO (AMATO) 50MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Anticonvulsivante e profilaxia de enxaqueca.',
      },
      {
        nome: 'CARBAMAZEPINA 200MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Anticonvulsivante e estabilizador de humor oral.',
      },
      {
        nome: 'DIVALPROATO DE SODIO 500MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico de amplo espectro para crises convulsivas e mania.',
      },
      {
        nome: 'FENITOINA 100MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Anticonvulsivante hidantoínico oral.',
      },
      {
        nome: 'FENOBARBITAL 100MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Barbitúrico antiepiléptico de longa ação.',
      },
      {
        nome: 'FENOBARBITAL 40MG/ML GOTAS 20 ML',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Barbitúrico em gotas pediátricas/orais.',
      },
      {
        nome: 'GABAPENTINA 300MG CAPSULA',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Anticonvulsivante indicado também para dor neuropática.',
      },
      {
        nome: 'LACOSAMIDA 100MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico modulador de canais de sódio voltagem-dependentes.',
      },
      {
        nome: 'LACOSAMIDA 50MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico em dose inicial de titulação.',
      },
      {
        nome: 'LAMOTRIGINA 100MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Anticonvulsivante e estabilizador no transtorno bipolar.',
      },
      {
        nome: 'LAMOTRIGINA 25 MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico para titulação de dose inicial.',
      },
      {
        nome: 'LAMOTRIGINA 50MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico para controle de crises parciais e generalizadas.',
      },
      {
        nome: 'LEVETIRACETAM (KEPPRA)100MG/ML 150 ML',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico oral em solução oral.',
      },
      {
        nome: 'LEVETIRACETAM 750MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico oral de excelente tolerabilidade.',
      },
      {
        nome: 'OXCARBAZEPINA 300MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico análogo da carbamazepina.',
      },
      {
        nome: 'OXCARBAZEPINA 600MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico para controle de crises parciais.',
      },
      {
        nome: 'OXCARBAZEPINA 60MG/ML SUSPENSAO ORAL 100 ML',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico em suspensão pediátrica e oral.',
      },
      {
        nome: 'PREGABALINA 150MG CAPSULA',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Modulador de canais de cálcio para dor neuropática e ansiedade.',
      },
      {
        nome: 'PREGABALINA (DORENE) 25MG/ML 60 ML',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Solução oral de pregabalina para ajuste fino de dose.',
      },
      {
        nome: 'PREGABALINA 50MG CAPSULA',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Análogo de GABA para dor neuropática e crises parciais.',
      },
      {
        nome: 'PREGABALINA 75MG CAPSULA',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Cápsula de pregabalina para dor crônica e ansiedade.',
      },
      {
        nome: 'TOPIRAMATO 100MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Anticonvulsivante e estabilizador oral.',
      },
      {
        nome: 'TOPIRAMATO 25MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico de baixa dose para início de tratamento.',
      },
      {
        nome: 'VALPROATO DE SODIO (DEPAKENE) 250MG/5ML 100 ML',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Xarope anticonvulsivante de ácido valproico/valproato.',
      },
      {
        nome: 'VALPROATO DE SODIO 500MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Padronizado',
        descricao: 'Antiepiléptico e estabilizador de humor oral.',
      },

      // --- PÁGINA 5: Padronizados ---
      {
        nome: 'ALOPURINOL 100MG COMPRIMIDO',
        classe: 'Antigotoso',
        status: 'Padronizado',
        descricao: 'Inibidor da xantina oxidase para redução do ácido úrico.',
      },
      {
        nome: 'ANLODIPINO 5MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Padronizado',
        descricao: 'Bloqueador dos canais de cálcio di-hidropiridínico.',
      },
      {
        nome: 'CARVEDILOL 12,5MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Padronizado',
        descricao: 'Betabloqueador com ação vasodilatadora alfa-1 para insuficiência cardíaca.',
      },
      {
        nome: 'DOXAZOSINA 2MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Padronizado',
        descricao: 'Bloqueador alfa-1 adrenérgico para hipertensão e HPB.',
      },
      {
        nome: 'ENALAPRIL 20MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Padronizado',
        descricao: 'Inibidor da enzima conversora de angiotensina (IECA).',
      },
      {
        nome: 'HIDRALAZINA 50MG',
        classe: 'Anti-hipertensivo',
        status: 'Padronizado',
        descricao: 'Vasodilatador direto arteriolar.',
      },
      {
        nome: 'LOSARTANA 50MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Padronizado',
        descricao: 'Bloqueador dos receptores de angiotensina II (BRA).',
      },
      {
        nome: 'METOPROLOL 25MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Padronizado',
        descricao: 'Betabloqueador cardiosseletivo (succinato de metoprolol).',
      },
      {
        nome: 'METOPROLOL 50MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Padronizado',
        descricao: 'Betabloqueador cardiosseletivo de liberação controlada.',
      },
      {
        nome: 'DEXCLORFENIRAMINA 2MG/5ML XAROPE 100 ML',
        classe: 'Anti-histamínico',
        status: 'Padronizado',
        descricao: 'Anti-histamínico H1 clássico em xarope para alergias.',
      },
      {
        nome: 'DEXCLORFENIRAMINA + BETA XAROPE FR120 ML',
        classe: 'Anti-histamínico',
        status: 'Padronizado',
        descricao: 'Associação antialérgica de anti-histamínico e corticoide betametasona.',
      },
      {
        nome: 'FEXOFENADINA 180MG COMPRIMIDO',
        classe: 'Anti-histamínico',
        status: 'Padronizado',
        descricao: 'Anti-histamínico de segunda geração não sedativo.',
      },
      {
        nome: 'LORATADINA 1MG/ML XAROPE 100 ML',
        classe: 'Anti-histamínico',
        status: 'Padronizado',
        descricao: 'Anti-histamínico H1 não sedativo em xarope pediátrico/adulto.',
      },
      {
        nome: 'ACIDO MEFENAMICO 500MG COMPRIMIDO',
        classe: 'Anti-inflamatório não esteroidal',
        status: 'Padronizado',
        descricao: 'AINE indicado para dismenorreia e dor inflamatória.',
      },
      {
        nome: 'CETOPROFENO 100MG COMPRIMIDO',
        classe: 'Anti-inflamatório não esteroidal',
        status: 'Padronizado',
        descricao: 'AINE oral de potente ação anti-inflamatória e analgésica.',
      },
      {
        nome: 'CETOPROFENO 100MG FRASCO AMPOLA',
        classe: 'Anti-inflamatório não esteroidal',
        status: 'Padronizado',
        descricao: 'AINE injetável para crises agudas de dor e inflamação.',
      },
      {
        nome: 'IBUPROFENO 100MG/ML 20 ML',
        classe: 'Anti-inflamatório não esteroidal',
        status: 'Padronizado',
        descricao: 'AINE pediátrico e adulto em gotas orais.',
      },
      {
        nome: 'IBUPROFENO 600MG COMPRIMIDO',
        classe: 'Anti-inflamatório não esteroidal',
        status: 'Padronizado',
        descricao: 'AINE oral de alta dose para processos inflamatórios osteoarticulares.',
      },
      {
        nome: 'ALBENDAZOL 40MG/ML 10 ML',
        classe: 'Antiparasitário',
        status: 'Padronizado',
        descricao: 'Anti-helmíntico oral em suspensão de dose única.',
      },
      {
        nome: 'IVERMECTINA 6MG COMPRIMIDO',
        classe: 'Antiparasitário',
        status: 'Padronizado',
        descricao:
          'Antiparasitário oral de amplo espectro (filariose, escabiose, estrongiloidíase).',
      },
      {
        nome: 'CLORPROMAZINA 25MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico típico fenotiazínico sedativo.',
      },
      {
        nome: 'CLORPROMAZINA (AMPLICTIL) 40MG/ML GOTAS 20 ML',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico de primeira geração em solução oral gotas.',
      },
      {
        nome: 'CLORPROMAZINA 5MG/ML AMPOLA 5 ML',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao:
          'Antipsicótico injetável para contenção de agitação psicomotora e soluço refratário.',
      },
      {
        nome: 'OLANZAPINA 10MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico atípico para esquizofrenia e transtorno bipolar.',
      },
      {
        nome: 'OLANZAPINA 2,5MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico de segunda geração em dose baixa.',
      },
      {
        nome: 'OLANZAPINA 5MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico atípico oral.',
      },
      {
        nome: 'PERICIAZINA (NEULEPTIL) 1% GOTAS 20 ML',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico sedativo infantil/oral modulador de conduta.',
      },
      {
        nome: 'PERICIAZINA (NEULEPTIL) 4% GOTAS 20 ML',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico sedativo adulto em gotas orais.',
      },
      {
        nome: 'QUETIAPINA 100MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico atípico multifuncional oral.',
      },
      {
        nome: 'QUETIAPINA 25MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico atípico em baixa dose com efeito sedativo.',
      },
      {
        nome: 'RISPERIDONA 1MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico atípico para transtornos psicóticos e autismo.',
      },
      {
        nome: 'RISPERIDONA 1MG/ML 30 ML',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico atípico em solução oral.',
      },
      {
        nome: 'RISPERIDONA 2MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Padronizado',
        descricao: 'Antipsicótico atípico oral.',
      },
      {
        nome: 'ACICLOVIR 200MG COMPRIMIDO',
        classe: 'Antiviral',
        status: 'Padronizado',
        descricao: 'Antiviral para infecções por Herpes simplex e Varicela zoster.',
      },
      {
        nome: 'ACICLOVIR 50MG/G CREME 10 G',
        classe: 'Antiviral',
        status: 'Padronizado',
        descricao: 'Antiviral tópico para herpes labial e genital recorrente.',
      },

      // --- PÁGINA 6: NÃO padronizados ---
      {
        nome: 'BUPRENORFINA 10MG ADESIVO TRANSDERMICO',
        classe: 'Analgésico opioide',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'BUPRENORFINA 5MG ADESIVO TRANSDERMICO',
        classe: 'Analgésico opioide',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CODEINA 3MG/ML FR 120 ML',
        classe: 'Analgésico opioide',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'MORFINA 10MG COMPRIMIDO',
        classe: 'Analgésico opioide',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'TRAMADOL 50MG/ML AMPOLA 1 ML',
        classe: 'Analgésico opioide',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'DIPIRONA 300MG SUPOSITORIO',
        classe: 'Analgésico/antitérmico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMICACINA 50MG/ML AMPOLA 2 ML',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMOXICILINA 250MG/5ML 150 ML',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMPICILINA 1G FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMPICILINA 1G + SUBACTAM 500MG PO PARA SOLUCAO INJETAVEL',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMPICILINA 2G + SUBACTAM 1G PO PARA SOLUCAO INJETAVEL',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AXETILCEFUROXIMA 250MG/5ML SUSPENSAO ORAL 70 ML',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AZITROMICINA 500MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'BENZILPENICILINA BENZATINA 1,200,000UI FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CEFADROXILA 500MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CEFDINIR 250MG/5ML FR 100 ML',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CEFTAZIDIMA 1G FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CEFTAZIDIMA 2,000MG + AVIBACTAM 500MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CLARITROMICINA 250MG/5ML SOLUCAO ORAL FR 60 ML',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CLARITROMICINA 500MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CLARITROMICINA 500MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'MEROPENEM 500MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'NITROFURANTOINA 5MG/ML SUSPENSAO ORAL 480 ML',
        classe: 'Antibacteriano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CICLOPIROX OLAMINA 10MG/ML 15 ML',
        classe: 'Antifúngico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ITRACONAZOL 100MG COMPRIMIDO',
        classe: 'Antifúngico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CIMETIDINA 200MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'DEXLANSOPRAZOL 60MG CAPSULA',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'VONOPRAZANA 20MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'OMEPRAZOL 10 MG CAPSULA',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'OMEPRAZOL 20MG CAPSULA',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },

      // --- PÁGINA 7: NÃO padronizados ---
      {
        nome: 'OMEPRAZOL 40MG CAPSULA',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'OMEPRAZOL 40MG FRASCO AMPOLA',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ONDANSETRONA 8MG',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'PANTOPRAZOL 20MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'PANTOPRAZOL 40MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'SIMETICONA 125MG CAPSULA GEL',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'SIMETICONA 80MG/ML + HOMATROPINA 2,5MG/ML SOLUCAO ORAL 20 ML',
        classe: 'Gastrointestinal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CLONAZEPAM 0,5MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'DIAZEPAM 5MG SUPOSITORIO',
        classe: 'Ansiolítico/sedativo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LORAZEPAM 2MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'MIDAZOLAM 1MG/0,1ML SPRAY 100 DOSES',
        classe: 'Ansiolítico/sedativo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ASPIRINA PREVENT 100MG COMPRIMIDO',
        classe: 'Antiagregante plaquetário',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CILOSTAZOL 100MG COMPRIMIDO',
        classe: 'Antiagregante plaquetário',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'SOMALGIM CARDIO 100MG CP',
        classe: 'Antiagregante plaquetário',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMIODARONA 100MG COMPRIMIDO',
        classe: 'Antiasmático',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'MONTELUCASTE 4MG SACHE',
        classe: 'Antiasmático',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ENOXAPARINA 80MG SERINGA PREENCHIDA',
        classe: 'Anticoagulante',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'RIVAROXABANA 15MG COMPRIMIDO',
        classe: 'Anticoagulante',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ATROPINA 0,25MG/ML AMPOLA 1 ML',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ATROPINA 0,5% 5 ML',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCOPOLAMINA 0,25MG/ML GEL TRANSDERMICO 30 ML',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCOPOLAMINA 10MG COMPRIMIDO',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCOPOLAMINA 10MG + DIPIRONA 250MG COMPRIMIDO',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCOPOLAMINA 10MG + PARACETAMOL 500MG COMPRIMIDO (BUSCODUO)',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCOPOLAMINA 20MG + DIPIRONA 2,5G AMPOLA 5 ML',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCOPOLAMINA 2,5MG 5G GEL TRANSDERMICO 30 G',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCOPOLAMINA 1,5MG/ML GEL',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCOPOLAMINA 1MG/ML GEL',
        classe: 'Anticolinérgico/antiespasmódico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'RIVASTIGMINA 18MG 9,5MG ADESIVO TRANSDERMICO',
        classe: 'Antidemencial',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AGOMELATINA 25MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMITRIPTILINA 10MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMITRIPTILINA 3% + LIDOCAINA 7% + CETOPROFENO 5% + SALICITATO DE METILA 2% + MENTOL 5% + CANFORA 3% + AMINOFILINA 2% + CICLOBENZAPRINA 1% PENTRAVAN QSP FR 90 DOSES',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao: 'Fórmula magistral tópica combinada. Requer justificativa médica fundamentada.',
      },

      // --- PÁGINA 8: NÃO padronizados ---
      {
        nome: 'CITALOPRAM 20MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'TRAZODONA (DONAREN) 100MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ESCITALOPRAN 20MG/ML GOTAS 15 ML',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'FLUVOXAMINA 50MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'SERTRALINA 100MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'SERTRALINA 25 MG COMPRIMIDO',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'VENLAFAXINA 75MG CAPSULA',
        classe: 'Antidepressivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LINAGLIPTINA 5MG COMPRIMIDO',
        classe: 'Antidiabético',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'METFORMINA 500MG COMPRIMIDO',
        classe: 'Antidiabético',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'BETAISTINA 16MG COMPRIMIDO',
        classe: 'Antiemético/antivertiginoso',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'DIMENIDRINATO 50MG + PIRIDOXINA 10MG COMPRIMIDO',
        classe: 'Antiemético/antivertiginoso',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'MECLOZINA 25MG COMPRIMIDO',
        classe: 'Antiemético/antivertiginoso',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CARBAMAZEPINA 400MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'DIVALPROATO DE SODIO (DEPAKOTE SPRINKLE) 125MG CAPSULA',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'FENITOINA 50MG/ML AMPOLA 5 ML',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'GABAPENTINA 400MG CAPSULA',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'FENOBARBITAL (GARDENAL) 100MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'FENOBARBITAL (GARDENAL) 50MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LACOSAMIDA 200MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LEVETIRACETAM 250MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LEVETIRACETAM 500MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LEVETIRACETAM (KEPPRA XR) 500MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'VALPROATO DE SODIO + ACIDO VALPROICO (TORVAL) 300MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ANLODIPINO 10MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ATENOLOL 50MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'BISOPROLOL 2,5MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'BISOPROLOL 5MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CARVEDILOL 6,25MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CLONIDINA 0,100MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'BISOPROLOL (CONCOR) 5MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },

      // --- PÁGINA 9: NÃO padronizados ---
      {
        nome: 'ENALAPRIL 10MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ENALAPRIL 5MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'SACUBITRIL VALSARTANA 50MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LOSARTANA 100MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LOSARTANA 25MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'OLMESARTANA 40MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'VALSARTANA 320MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'VALSARTANA 80MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'FEXOFENADINA (ALLEGRA) 6MG/ML SUSPENSAO ORAL 150 ML',
        classe: 'Anti-histamínico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'HIDROXIZINA 2MG/ML 120 ML',
        classe: 'Anti-histamínico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'PROMETAZINA 25MG COMPRIMIDO',
        classe: 'Anti-histamínico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CETOPROFENO IM 50MG/ML AMPOLA 2 ML',
        classe: 'Anti-inflamatório não esteroidal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'DICLOFENACO DIETILAMONIO 10MG/G GEL 60 G',
        classe: 'Anti-inflamatório não esteroidal',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'AMANTADINA 100MG COMPRIMIDO',
        classe: 'Antiparkinsoniano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LEVODOPA 100MG +BENSERAZIDA 25MG COMPRIMIDO',
        classe: 'Antiparkinsoniano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LEVODOPA 100MG 25MG COMPRIMIDO',
        classe: 'Antiparkinsoniano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'TRIEXIFENIDIL 2MG COMPRIMIDO',
        classe: 'Antiparkinsoniano',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ARIPIPRAZOL 10MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'QUETIAPINA (ATIP) XR 50MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'CLORPROMAZINA 100MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'HALOPERIDOL 5MG/ML AMPOLA 1 ML',
        classe: 'Antipsicótico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'QUETIAPINA 200MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'FENDIZOATO DE CLOPERASTINA (SEKI) 3,54MG/ML XAROPE 120 ML',
        classe: 'Antitussígeno',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'LEVODROPROPIZINA 6MG/ML XAROPE 120 ML',
        classe: 'Antitussígeno',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },
      {
        nome: 'ACICLOVIR 250MG FRASCO AMPOLA',
        classe: 'Antiviral',
        status: 'Não Padronizado',
        observacao:
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      },

      // --- PÁGINA 9 e 10: Medicamentos INATIVOS ---
      {
        nome: 'AMPICILINA 50MG/ML SUSPENSAO ORAL 150 ML',
        classe: 'Antibacteriano',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'BISMUTO 300MG CAPSULA',
        classe: 'Gastrointestinal',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'CASPOFUNGINA 50MG FRASCO AMPOLA',
        classe: 'Antifúngico',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'DOXICICLINA 100MG COMPRIMIDO',
        classe: 'Antibacteriano',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'GENTAMICINA 40MG/ML AMPOLA 1 ML',
        classe: 'Antibacteriano',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'IMIPENEM 500MG + CILASTATINA 500MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'TEICOPLANINA 200MG FRASCO AMPOLA',
        classe: 'Antibacteriano',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'TERBINAFINA 250MG COMPRIMIDO',
        classe: 'Antifúngico',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'VONOPRAZANA 10MG COMPRIMIDO',
        classe: 'Gastrointestinal',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'MIDAZOLAM 7,5MG COMPRIMIDO',
        classe: 'Ansiolítico/sedativo',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'CILOSTAZOL 50MG COMPRIMIDO',
        classe: 'Antiagregante plaquetário',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'CIPROEPTADINA 4MG + COBAMAMIDA 1MG COMPRIMIDO',
        classe: 'Antialérgico/estimulante do apetite',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'DESVENLAFAXINA 50MG COMPRIMIDO (INATIVO)',
        classe: 'Antidepressivo',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'VENLAFAXINA 37,5MG CAPSULA',
        classe: 'Antidepressivo',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'DAPAGLIFLOZINA 10MG + METFORMINA 1.000 MG COMPRIMIDO',
        classe: 'Antidiabético',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'GLICLAZIDA 60MG COMPRIMIDO',
        classe: 'Antidiabético',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'DIVALPROATO DE SODIO ER 500MG COMPRIMIDO',
        classe: 'Antiepiléptico',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'ATENOLOL 25MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'CAPTOPRIL 25MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'CLONIDINA 0,150MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'SACUBITRIL VALSARTANA (ENTRESTO) 200MG COMPRIMIDO',
        classe: 'Anti-hipertensivo',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'BILASTINA 2,5MG/ML XAROPE 120 ML',
        classe: 'Anti-histamínico',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'DESLORATADINA 0,5MG/ML XAROPE 60 ML',
        classe: 'Anti-histamínico',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'MESALAZINA 250MG',
        classe: 'Anti-inflamatório intestinal',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'MESALAZINA 800MG COMPRIMIDO',
        classe: 'Anti-inflamatório intestinal',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'LEVODOPA 200MG + BENSERAZIDA 50MG COMPRIMIDO',
        classe: 'Antiparkinsoniano',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
      {
        nome: 'QUETIAPINA 50MG COMPRIMIDO',
        classe: 'Antipsicótico',
        status: 'Inativo',
        descricao: 'Medicamento inativo no sistema da farmácia.',
      },
    ]

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      try {
        app.findFirstRecordByData('medicamentos', 'nome', item.nome)
        // Already exists, skip
      } catch (_) {
        const rec = new Record(medCol)
        rec.set('nome', item.nome)
        rec.set('classe', item.classe)
        rec.set('status', item.status)
        rec.set('descricao', item.descricao || '')
        rec.set('observacao', item.observacao || '')
        app.save(rec)
      }
    }
  },
  (app) => {
    // down: optionally remove seeded records
    try {
      const medCol = app.findCollectionByNameOrId('medicamentos')
      app.truncateCollection(medCol)
    } catch (_) {}
  },
)
