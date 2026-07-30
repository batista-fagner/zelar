import zelarLogoHorizontal from '../assets/zelar-logo-horizontal.jpg'
import zelarLogo from '../assets/zelar-logo.jpg'

const WHATSAPP_NUMBER = '5527999234193'

const waMensagemFamilia  = encodeURIComponent('Olá! Preciso contratar um cuidador.')
const waMensagemTrabalho = encodeURIComponent('Olá! Quero trabalhar como cuidador(a) pela Zelar.')
const waMensagemCurso    = encodeURIComponent('Olá! Quero fazer o curso de cuidador(a).')
const waMensagemJuridico = encodeURIComponent('Olá! Preciso de suporte jurídico previdenciário.')

const waLinkFamilia  = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMensagemFamilia}`
const waLinkTrabalho = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMensagemTrabalho}`
const waLinkCurso    = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMensagemCurso}`
const waLinkJuridico = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMensagemJuridico}`

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-zelar-brown-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={zelarLogo} alt="Zelar" className="w-9 h-9 rounded-lg object-contain" />
          <span className="font-bold text-gray-800 text-lg tracking-tight">Zelar</span>
        </div>
        <span className="text-zelar-brown-700 text-sm font-semibold">Cuidado com quem você ama</span>
      </nav>

      {/* ── HERO ── */}
      <section className="pt-32 pb-24 px-6 bg-zelar-cream relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-10 right-10 w-72 h-72 bg-zelar-sage/30 rounded-full opacity-40 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-zelar-blue/20 rounded-full opacity-40 blur-3xl" />

        <div className="max-w-6xl mx-auto relative grid md:grid-cols-2 gap-12 items-center">
          {/* Logo */}
          <div className="flex justify-center md:justify-start order-1">
            <img
              src={zelarLogoHorizontal}
              alt="Zelar — Saúde e Cuidado"
              className="w-full max-w-md object-contain"
            />
          </div>

          {/* Texto */}
          <div className="text-center md:text-left order-2">
            <span className="inline-block bg-zelar-brown-100 text-zelar-brown-700 text-xs font-semibold px-3 py-1 rounded-full mb-6 tracking-wide uppercase">
              Cuidado profissional com quem você ama
            </span>
            <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
              Quem cuida de você,<br />
              <span className="text-zelar-brown">merece o melhor.</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-xl mx-auto md:mx-0 mb-10 leading-relaxed">
              A Zelar conecta famílias a cuidadores capacitados para atendimento domiciliar e hospitalar,
              com segurança, empatia e profissionalismo.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
              <a
                href={waLinkFamilia}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-zelar-brown hover:bg-zelar-brown-800 text-white font-bold px-8 py-4 rounded-2xl text-base shadow-lg shadow-zelar-brown-200 transition"
              >
                <WhatsAppIcon />
                Preciso de um Cuidador
              </a>
              <a
                href={waLinkTrabalho}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-800 font-bold px-8 py-4 rounded-2xl text-base border-2 border-gray-200 transition"
              >
                <WhatsAppIcon color="#695e4a" />
                Quero ser Cuidador
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVIÇOS ── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Como podemos te ajudar?</h2>
            <p className="text-gray-400 text-base">Escolha o serviço que faz sentido pra você</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Card Família — Fluxo 1 (verde-sálvia) */}
            <div className="group relative bg-zelar-sage/10 border border-zelar-sage/30 rounded-3xl p-8 hover:shadow-xl hover:shadow-zelar-sage/20 transition-all duration-300">
              <div className="w-14 h-14 bg-zelar-sage rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-lg shadow-zelar-sage/30">
                🏠
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Contratar Cuidador</h3>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Cuidadores capacitados para atendimento domiciliar ou hospitalar de idosos, adultos,
                crianças e gestantes. Nossa equipe entende sua necessidade e indica o cuidador ideal.
              </p>
              <ul className="space-y-2 mb-8">
                {['Atendimento domiciliar e hospitalar', 'Triagem e seleção do cuidador', 'Acompanhamento da equipe Zelar', 'Pagamento facilitado (PIX, cartão ou boleto)'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="w-5 h-5 bg-zelar-sage/20 text-zelar-sage rounded-full flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={waLinkFamilia}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-zelar-sage hover:opacity-90 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-zelar-sage/30"
              >
                <WhatsAppIcon />
                Solicitar agora
              </a>
            </div>

            {/* Card Trabalhar como Cuidador — Fluxo 2 (azul acinzentado) */}
            <div className="group relative bg-zelar-blue/10 border border-zelar-blue/30 rounded-3xl p-8 hover:shadow-xl hover:shadow-zelar-blue/20 transition-all duration-300">
              <div className="w-14 h-14 bg-zelar-blue rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-lg shadow-zelar-blue/30">
                🤝
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Quero ser Cuidador</h3>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Já tem certificado de cuidador? Envie seu currículo e entre pra rede Zelar.
                Ainda não tem? A gente te encaminha direto pro nosso curso de capacitação.
              </p>
              <ul className="space-y-2 mb-8">
                {['Cadastro rápido pelo WhatsApp', 'Envio de currículo (se já certificado)', 'Encaminhamento pro curso (se ainda não tem)', 'Acesso a oportunidades de trabalho'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="w-5 h-5 bg-zelar-blue/20 text-zelar-blue rounded-full flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={waLinkTrabalho}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-zelar-blue hover:opacity-90 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-zelar-blue/30"
              >
                <WhatsAppIcon />
                Quero trabalhar
              </a>
            </div>

            {/* Card Curso de Cuidador — Fluxo 3 (pêssego) */}
            <div className="group relative bg-zelar-peach/10 border border-zelar-peach/40 rounded-3xl p-8 hover:shadow-xl hover:shadow-zelar-peach/20 transition-all duration-300">
              <div className="w-14 h-14 bg-zelar-peach rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-lg shadow-zelar-peach/30">
                🎓
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Curso de Cuidador</h3>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Capacitação completa pra você atuar com segurança, técnica e propósito
                e sair na frente pras vagas da rede Zelar.
              </p>
              <ul className="space-y-2 mb-8">
                {['Curso completo de capacitação', 'Certificado de conclusão', 'Pagamento via PIX, cartão ou boleto', 'Prioridade nas vagas da rede Zelar'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="w-5 h-5 bg-zelar-peach/20 text-zelar-brown-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={waLinkCurso}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-zelar-peach hover:opacity-90 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-zelar-peach/30"
              >
                <WhatsAppIcon />
                Quero me capacitar
              </a>
            </div>

            {/* Card Jurídico Previdenciário — Fluxo 4 (roxo) */}
            <div className="group relative bg-zelar-purple/10 border border-zelar-purple/30 rounded-3xl p-8 hover:shadow-xl hover:shadow-zelar-purple/20 transition-all duration-300">
              <div className="w-14 h-14 bg-zelar-purple rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-lg shadow-zelar-purple/30">
                ⚖️
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Suporte Jurídico Previdenciário</h3>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Orientação sobre aposentadoria, benefícios do INSS e direitos previdenciários,
                com encaminhamento pra advogada parceira especializada.
              </p>
              <ul className="space-y-2 mb-8">
                {['Análise do seu caso', 'Orientação sobre benefícios do INSS', 'Encaminhamento pra advogada especializada', 'Atendimento inicial sem compromisso'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="w-5 h-5 bg-zelar-purple/20 text-zelar-purple rounded-full flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={waLinkJuridico}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-zelar-purple hover:opacity-90 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-zelar-purple/30"
              >
                <WhatsAppIcon />
                Falar com a equipe
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="py-24 px-6 bg-zelar-cream">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Como funciona?</h2>
            <p className="text-gray-400">Em 3 passos simples você garante o cuidado que precisa</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', icon: '💬', title: 'Fale com a gente', desc: 'Mande uma mensagem no WhatsApp. A Zelar te atende na hora e entende o que você precisa.' },
              { step: '02', icon: '🤝', title: 'Avaliação gratuita', desc: 'Agendamos uma conversa pra entender a situação e encontrar o cuidador ideal.' },
              { step: '03', icon: '❤️', title: 'Cuidado em ação', desc: 'O cuidador é apresentado à família e o atendimento começa com acompanhamento da Zelar.' },
            ].map(item => (
              <div key={item.step} className="bg-white rounded-2xl p-7 shadow-sm border border-zelar-brown-100 text-center">
                <span className="text-xs font-bold text-zelar-brown-400 tracking-widest">{item.step}</span>
                <div className="text-4xl my-3">{item.icon}</div>
                <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIFERENCIAIS ── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Por que escolher a Zelar?</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: '🛡️', title: 'Cuidadores capacitados', desc: 'Todos os cuidadores passam por formação específica antes de atender.' },
              { icon: '⚡', title: 'Atendimento imediato', desc: 'Respondemos no WhatsApp sem espera e sem burocracia.' },
              { icon: '📋', title: 'Gestão transparente', desc: 'Contrato claro, sem vínculo empregatício direto e com suporte da equipe.' },
              { icon: '🌱', title: 'Crescimento contínuo', desc: 'Cuidadores têm acesso a cursos e novas oportunidades na rede Zelar.' },
            ].map(item => (
              <div key={item.title} className="flex gap-4 p-6 rounded-2xl bg-zelar-cream border border-zelar-brown-100">
                <span className="text-3xl shrink-0">{item.icon}</span>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 px-6 bg-zelar-brown text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-4">Pronto para começar?</h2>
          <p className="text-zelar-brown-100 text-lg mb-10 leading-relaxed">
            Fale conosco e dê o primeiro passo rumo a um cuidado de qualidade.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={waLinkFamilia}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-white text-zelar-brown-700 font-bold px-8 py-4 rounded-2xl text-base hover:bg-zelar-cream transition shadow-lg"
            >
              <WhatsAppIcon color="#695e4a" />
              Preciso de um Cuidador
            </a>
            <a
              href={waLinkTrabalho}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-zelar-brown-600 hover:bg-zelar-brown-500 text-white font-bold px-8 py-4 rounded-2xl text-base border-2 border-zelar-brown-500 transition"
            >
              <WhatsAppIcon />
              Quero ser Cuidador
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-zelar-brown-900 text-zelar-brown-200 py-10 px-6 text-center text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 bg-zelar-brown-600 rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">Z</span>
          </div>
          <span className="font-semibold text-white">Zelar</span>
        </div>
        <p>Cuidado profissional com quem você ama.</p>
        <p className="mt-1 text-zelar-brown-400 text-xs">© 2026 Zelar. Todos os direitos reservados.</p>
      </footer>

    </div>
  )
}

function WhatsAppIcon({ color = '#ffffff', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}
