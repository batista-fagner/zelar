```mermaid
graph TD
    %% FUNNEL_FAMILIA
    FA1["👨‍👩‍👧 Família envia mensagem"]
    FA2["🤖 Clara identifica FUNNEL_FAMILIA"]
    FA3["📋 Clara coleta informações<br/>- Idade<br/>- Mobilidade<br/>- Higiene<br/>- Medicação<br/>- Diagnósticos"]
    FA4{Local do<br/>atendimento?}
    FA5["🏥 Envia catálogo<br/>hospitalar"]
    FA6{Complexidade?}
    FA6A["📗 Catálogo<br/>Simples"]
    FA6B["📘 Catálogo<br/>Médio"]
    FA6C["📕 Catálogo<br/>Complexo"]
    FA7["💳 Cliente escolhe<br/>e recebe link<br/>de pagamento"]
    FA8["⏳ Kanban:<br/>Aguardando<br/>Pagamento"]
    FA9["👨‍💼 Operador confirma<br/>pagamento"]
    FA10["✅ Sistema registra<br/>pagamento"]
    FA11["🔔 Clara avisa<br/>à família"]
    FA12["🏃 Sistema busca<br/>cuidadores compatíveis"]
    FA13["📱 WhatsApp enviado<br/>a TODOS os cuidadores<br/>Primeiro a responder<br/>ACEITO ganha"]
    FA14{Resposta<br/>recebida?}
    FA15["🎉 Cuidador vencedor<br/>recebe confirmação"]
    FA16["😞 Demais recebem<br/>mensagem de recusa"]
    FA17["💬 Clara informa<br/>cuidador à família"]
    FA18["📝 Clara pergunta<br/>quem preenche<br/>cadastro"]
    FA19["📋 Envia link<br/>Google Form"]
    FA20["📱 Google Apps Script<br/>detecta envio<br/>POST /webhooks/form-submit"]
    FA21["✅ Clara confirma<br/>cadastro recebido"]
    FA22["📊 Kanban:<br/>Serviço Ativo"]
    FA23["⏰ 1h antes:<br/>Clara notifica<br/>família"]
    FA24["⭐ Clara envia<br/>pesquisa de<br/>satisfação"]

    %% FUNNEL_CUIDADOR
    FC1["👤 Candidato envia<br/>mensagem interesse"]
    FC2["🤖 Clara identifica<br/>FUNNEL_CUIDADOR"]
    FC3["❓ Clara coleta<br/>- Experiência<br/>- Disponibilidade<br/>- Região"]
    FC4["📚 Clara apresenta<br/>curso de 2 dias"]
    FC5["📝 Clara envia<br/>formulário inscrição"]
    FC6["📱 Google Form enviado<br/>POST /webhooks/form-submit"]
    FC7["✅ Clara confirma<br/>inscrição recebida"]
    FC8["📊 Kanban:<br/>Inscrito no Curso"]
    FC9["🎓 Candidato conclui<br/>curso de 2 dias"]
    FC10["👨‍💼 Operador cadastra<br/>novo cuidador"]
    FC11["✅ Cuidador entra<br/>na base ativa"]
    FC12["🎉 Clara envia<br/>boas-vindas"]

    %% Conexão entre funis
    FC11 -->|alimenta banco| BANCO["💾 Banco de<br/>Cuidadores<br/>Ativo"]
    BANCO -->|usado em| FA12

    %% FUNNEL_FAMILIA flow
    FA1 --> FA2 --> FA3 --> FA4
    FA4 -->|Hospital| FA5
    FA4 -->|Domiciliar| FA6
    FA6 -->|Simples| FA6A
    FA6 -->|Médio| FA6B
    FA6 -->|Complexo| FA6C
    FA6A --> FA7
    FA6B --> FA7
    FA6C --> FA7
    FA5 --> FA7
    FA7 --> FA8
    FA8 --> FA9 --> FA10 --> FA11
    FA11 --> FA12 --> FA13
    FA13 --> FA14
    FA14 -->|Sim| FA15 --> FA17
    FA14 -->|Não| FA16
    FA17 --> FA18 --> FA19
    FA19 --> FA20 --> FA21 --> FA22
    FA22 --> FA23
    FA23 --> FA24

    %% FUNNEL_CUIDADOR flow
    FC1 --> FC2 --> FC3 --> FC4 --> FC5
    FC5 --> FC6 --> FC7 --> FC8
    FC8 --> FC9 --> FC10 --> FC11 --> FC12

    style FA1 fill:#e1f5ff
    style FA2 fill:#b3e5fc
    style FC1 fill:#f3e5f5
    style FC2 fill:#e1bee7
    style BANCO fill:#fff9c4
