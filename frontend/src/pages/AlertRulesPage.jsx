import { Bell, Flame, MessageSquareWarning, Clock, Info } from 'lucide-react'

const rules = [
  {
    icon: <Flame className="w-5 h-5 text-orange-500" />,
    title: 'Leads Esfriando',
    bg: 'bg-orange-50 border-orange-200',
    headerBg: 'bg-orange-100',
    description: 'Leads em raias ativas sem nenhuma mensagem trocada há mais do limite definido por raia.',
    items: [
      {
        label: 'Lead Quente',
        color: 'bg-orange-50 text-orange-700 border-orange-200',
        rule: 'Alerta após 1 dia sem contato',
        reason: 'Lead de alta intenção — esfria rápido.',
      },
      {
        label: 'Qualificando',
        color: 'bg-purple-50 text-purple-700 border-purple-200',
        rule: 'Alerta após 2 dias sem contato',
        reason: 'Ainda em processo de qualificação.',
      },
      {
        label: 'Lead Frio',
        color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        rule: 'Alerta após 3 dias sem contato',
        reason: 'Já é uma raia morna — alerta só se completamente abandonado.',
      },
    ],
    extra: 'O tempo é medido a partir da última mensagem enviada ou recebida (lastMessageAt). Se nunca houve mensagem, conta desde a criação do lead.',
  },
  {
    icon: <MessageSquareWarning className="w-5 h-5 text-amber-600" />,
    title: 'Sem Resposta',
    bg: 'bg-amber-50 border-amber-200',
    headerBg: 'bg-amber-100',
    description: 'Leads em raias ativas onde a última mensagem foi enviada por nós (IA ou operador) e o lead ainda não respondeu.',
    items: [
      {
        label: 'Threshold',
        color: 'bg-amber-50 text-amber-700 border-amber-200',
        rule: '1h sem resposta do lead',
        reason: 'Janela mínima de espera antes de considerar sem resposta.',
      },
      {
        label: 'Raias monitoradas',
        color: 'bg-gray-50 text-gray-700 border-gray-200',
        rule: 'Novo Lead · Qualificando · Lead Quente · Lead Frio',
        reason: 'Leads em Agendado e Perdido não são monitorados.',
      },
    ],
    extra: null,
  },
  {
    icon: <Clock className="w-5 h-5 text-rose-500" />,
    title: 'Alerta Visual no Kanban',
    bg: 'bg-rose-50 border-rose-200',
    headerBg: 'bg-rose-100',
    description: 'Cards no Kanban mudam de cor quando um lead está sem resposta.',
    items: [
      {
        label: 'Amarelo',
        color: 'bg-yellow-50 text-yellow-700 border-yellow-300',
        rule: '1h a 3h sem resposta',
        reason: 'Atenção — lead aguardando retorno.',
      },
      {
        label: 'Vermelho',
        color: 'bg-red-50 text-red-700 border-red-300',
        rule: '3h ou mais sem resposta',
        reason: 'Urgente — lead pode estar perdendo interesse.',
      },
    ],
    extra: 'O alerta só aparece quando a última mensagem foi enviada por nós (IA ou operador). Se o lead foi o último a falar, o card fica normal.',
  },
]

export default function AlertRulesPage() {
  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Regras de Alertas</h1>
          <p className="text-xs text-gray-500">Como o sistema identifica leads que precisam de atenção</p>
        </div>
      </div>

      <div className="space-y-6">
        {rules.map((rule, i) => (
          <div key={i} className={`rounded-2xl border ${rule.bg} overflow-hidden`}>
            <div className={`${rule.headerBg} px-5 py-4 flex items-center gap-2`}>
              {rule.icon}
              <h2 className="text-sm font-bold text-gray-800">{rule.title}</h2>
            </div>

            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-gray-600">{rule.description}</p>

              <div className="space-y-2">
                {rule.items.map((item, j) => (
                  <div key={j} className="bg-white rounded-xl border border-white/80 p-3 flex items-start gap-3">
                    <span className={`text-xs px-2 py-1 rounded-md border whitespace-nowrap shrink-0 ${item.color}`}>
                      {item.label}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{item.rule}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.reason}</p>
                    </div>
                  </div>
                ))}
              </div>

              {rule.extra && (
                <div className="flex items-start gap-2 bg-white/60 rounded-lg px-3 py-2">
                  <Info className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-500">{rule.extra}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
