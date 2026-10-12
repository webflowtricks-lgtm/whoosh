import React from 'react';
import { Sword, X } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

interface GameManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  playClickSound: () => void;
}

export default function GameManualModal({ isOpen, onClose, playClickSound }: GameManualModalProps) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onClick={() => onClose()}
        >
          <section
            className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-amber-500/40 bg-slate-950 text-slate-100 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="battle-manual-title"
            onClick={event => event.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 p-2 text-orange-300">
                  <Sword className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 id="battle-manual-title" className="text-sm font-black uppercase tracking-wider text-amber-100 sm:text-lg">
                    {t('Manual', 'Manual')}
                  </h2>
                  <p className="text-[10px] text-slate-400 sm:text-xs">
                    {t('Como jogar e entender os elementos da arena', 'How to play and understand the arena')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  onClose();
                }}
                aria-label={t('Fechar manual', 'Close manual')}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition hover:border-orange-400/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="overflow-y-auto p-3 sm:p-5">
              <div className="mb-4 rounded-xl border border-orange-500/30 bg-orange-950/30 p-3 sm:p-4">
                <p className="text-xs font-bold leading-relaxed text-orange-100 sm:text-sm">
                  {t(
                    'Monte uma equipe de 3 ninjas. Escolha habilidades, gerencie o chakra e proteja seus aliados. Vence quem derrotar a equipe adversária.',
                    'Build a team of 3 ninjas. Choose skills, manage chakra, and protect your allies. Defeat the opposing team to win.'
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-amber-300 sm:text-sm">
                    {t('1. Turnos e ações', '1. Turns and actions')}
                  </h3>
                  <ul className="space-y-2 text-[11px] leading-relaxed text-slate-300 sm:text-xs">
                    <li><span className="font-bold text-amber-200">{t('Escolha uma habilidade e toque no alvo indicado.', 'Choose a skill and tap a valid target.')}</span>{' '}{t('Faça isso para cada ninja que puder agir. A ação fica preparada, ainda não é executada.', 'Do this for each ninja able to act. The action is queued, not executed yet.')}</li>
                    <li><span className="font-bold text-amber-200">{t('Finalize o turno', 'End your turn')}</span>{' '}{t('para confirmar as ações preparadas. Se não escolher nenhuma, você passa sem atacar. Confira custos e alvos antes de finalizar.', 'to confirm queued actions. If you choose none, you pass without attacking. Check costs and targets first.')}</li>
                    <li><span className="font-bold text-orange-200">{t('Contra a IA:', 'Against AI:')}</span>{' '}{t('você prepara suas ações e depois a IA age.', 'you plan and then the AI acts.')}{' '}<span className="font-bold text-sky-200">{t('No online:', 'Online:')}</span>{' '}{t('o mesmo líder fixo da partida planeja primeiro; o outro jogador planeja em seguida. As ações dos dois são resolvidas antes do próximo turno.', 'the same fixed match leader plans first, followed by the other player. Both sides’ actions resolve before the next turn.')}</li>
                    <li><span className="font-bold text-rose-300">{t('Tempo:', 'Timer:')}</span> {t('a partida online tem limite de tempo para a fase; se acabar, o turno pode ser passado automaticamente.', 'online phases are timed; when time runs out, the turn may be passed automatically.')}</li>
                  </ul>
                </article>

                <article className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-cyan-300 sm:text-sm">
                    {t('2. Chakra e custos', '2. Chakra and costs')}
                  </h3>
                  <ul className="space-y-2 text-[11px] leading-relaxed text-slate-300 sm:text-xs">
                    <li><span className="font-bold text-cyan-200">{t('Geração de chakra:', 'Chakra generation:')}</span>{' '}{t('no início, cada equipe recebe 1 chakra aleatório. Nos turnos seguintes, recebe 1 por aliado vivo; perder ninjas reduz a geração futura.', 'each team starts with 1 random chakra. On later turns, it gains 1 per living ally; losing ninjas reduces future generation.')}</li>
                    <li className="flex flex-wrap gap-x-2 gap-y-1">
                      <span className="font-bold text-green-300">{t('Verde: Taijutsu', 'Green: Taijutsu')}</span>
                      <span className="font-bold text-blue-300">{t('Azul: Ninjutsu', 'Blue: Ninjutsu')}</span>
                      <span className="font-bold text-purple-300">{t('Roxo: Genjutsu', 'Purple: Genjutsu')}</span>
                      <span className="font-bold text-red-300">{t('Vermelho: Linhagem', 'Red: Bloodline')}</span>
                      <span className="font-bold text-slate-300">{t('Cinza/Rand: qualquer tipo', 'Gray/Rand: any type')}</span>
                    </li>
                    <li><span className="font-bold text-cyan-200">{t('Ícones na habilidade mostram o custo.', 'Skill icons show the cost.')}</span>{' '}{t('“Rand” pode ser pago com qualquer chakra disponível; quando necessário, o jogo abre a seleção da combinação. Habilidades grátis não consomem chakra.', '“Rand” can be paid with any available chakra; when needed, the game lets you choose which beads to spend. Free skills cost no chakra.')}</li>
                    <li><span className="font-bold text-cyan-200">{t('Troca: 4 chakras por 1 chakra escolhido.', 'Trade: 4 chakra beads for 1 chosen bead.')}</span>{' '}{t('Use-a quando faltar um tipo específico.', 'Use it when you need a specific type.')}</li>
                  </ul>
                </article>

                <article className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-300 sm:text-sm">
                    {t('3. Ler as habilidades', '3. Reading skills')}
                  </h3>
                  <ul className="space-y-2 text-[11px] leading-relaxed text-slate-300 sm:text-xs">
                    <li><span className="font-bold text-white">{t('Custo:', 'Cost:')}</span> {t('chakras necessários para preparar a habilidade. A soma de todas as ações precisa caber no seu estoque.', 'chakra required to queue the skill. The combined cost of your actions must fit your pool.')}</li>
                    <li><span className="font-bold text-white">{t('Recarga:', 'Cooldown:')}</span> {t('turnos restantes até poder usar novamente. “Permanente” indica um efeito configurado para durar indefinidamente, não que a habilidade seja passiva.', 'turns remaining until it can be used again. “Permanent” means an effect is configured to last indefinitely, not that the skill is passive.')}</li>
                    <li><span className="font-bold text-white">{t('Alvo:', 'Target:')}</span> {t('informa quem pode receber a habilidade: inimigo, aliado, si mesmo, todos ou qualquer personagem vivo. O tipo pode mudar por efeitos ativos; siga os alvos destacados na arena.', 'shows who can receive the skill: enemy, ally, self, all, or any living character. Effects can change targeting; follow the targets highlighted in the arena.')}</li>
                    <li><span className="font-bold text-emerald-200">{t('Requisitos precisam ser atendidos:', 'Requirements must be met:')}</span>{' '}{t('efeito ativo, habilidade anterior, HP baixo ou efeito no alvo. Recarga, atordoamento e limite de usos também podem bloquear uma ação.', 'active effect, previous skill, low HP, or an effect on the target. Cooldown, stun, and usage limits can also block a skill.')}</li>
                  </ul>
                </article>

                <article className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-violet-300 sm:text-sm">
                    {t('4. Efeitos e condições', '4. Effects and conditions')}
                  </h3>
                  <ul className="space-y-2 text-[11px] leading-relaxed text-slate-300 sm:text-xs">
                    <li><span className="font-bold text-rose-300">{t('Dano:', 'Damage:')}</span> {t('reduz a vida (HP). Escudos absorvem dano antes da vida; reduções e imunidades podem diminuir ou impedir certos danos.', 'reduces health (HP). Shields absorb damage before health; reductions and immunities can lower or prevent certain damage.')}</li>
                    <li><span className="font-bold text-blue-300">{t('Proteção:', 'Protection:')}</span> {t('escudo absorve dano; redução diminui o dano recebido; invulnerabilidade bloqueia categorias de habilidades conforme a condição. Algumas habilidades ignoram proteções específicas.', 'shields absorb damage; reduction lowers incoming damage; invulnerability blocks skill categories according to its conditions. Some skills bypass specific protections.')}</li>
                    <li><span className="font-bold text-yellow-300">{t('Atordoamento (Stun):', 'Stun:')}</span> {t('pode impedir habilidades dos tipos afetados enquanto durar. Leia os tipos no efeito; nem todo stun bloqueia todas as habilidades.', 'can prevent affected skill types while active. Check the types shown on the effect; not every stun blocks all skills.')}</li>
                    <li><span className="font-bold text-fuchsia-300">{t('Queimadura, sangramento e aflição:', 'Burn, bleeding, and affliction:')}</span> {t('são danos contínuos. Eles causam dano quando o conjurador encerra o turno, respeitando duração, atrasos e imunidades.', 'are damage-over-time effects. They deal damage when their caster ends a turn, subject to duration, delays, and immunities.')}</li>
                    <li><span className="font-bold text-violet-200">{t('Contra-ataque anula; reflexão redireciona.', 'Counters cancel; reflection redirects.')}</span>{' '}{t('O resultado depende das regras do efeito. Observe ícones, duração e descrição dos efeitos ativos.', 'The outcome depends on the effect’s rules. Check active effect icons, duration, and descriptions.')}</li>
                    <li><span className="font-bold text-fuchsia-200">{t('Outros efeitos:', 'Other effects:')}</span>{' '}{t('curar, aumentar ou reduzir dano, remover efeitos, drenar/roubar chakra, criar stacks ou alterar alvos. Consulte os detalhes da habilidade; números nos efeitos indicam valores ou stacks quando aplicável.', 'healing, boosting or reducing damage, removing effects, draining/stealing chakra, adding stacks, or changing targets. Check skill details; numbers on effects show values or stacks when applicable.')}</li>
                  </ul>
                </article>

                <article className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-sky-300 sm:text-sm">
                    {t('5. Alvos e sobrevivência', '5. Targets and survival')}
                  </h3>
                  <ul className="space-y-2 text-[11px] leading-relaxed text-slate-300 sm:text-xs">
                    <li><span className="font-bold text-sky-200">{t('Toque em um alvo válido', 'Tap a valid target')}</span>{' '}{t('no retrato ou personagem. Habilidades de alvo único exigem escolher um combatente; “Todos” afeta os personagens vivos correspondentes automaticamente.', 'on the portrait or character. Single-target skills require choosing a combatant; “All” affects the corresponding living characters automatically.')}</li>
                    <li><span className="font-bold text-sky-200">{t('Aliado/si mesmo:', 'Ally/self:')}</span>{' '}{t('podem ser alvos da sua equipe. “Qualquer vivo” pode alcançar qualquer equipe. Habilidades de ressurreição compatíveis podem selecionar um aliado derrotado.', 'can target your team. “Any living” can target either team. Compatible resurrection skills can select a defeated ally.')}</li>
                    <li><span className="font-bold text-rose-200">{t('Invisibilidade e invulnerabilidade:', 'Invisibility and invulnerability:')}</span>{' '}{t('podem impedir a seleção ou bloquear habilidades conforme o tipo. Procure outro alvo ou use uma habilidade compatível.', 'can prevent selection or block skills depending on their type. Choose another target or use a compatible skill.')}</li>
                    <li><span className="font-bold text-amber-300">{t('Vitória:', 'Victory:')}</span> {t('derrote a equipe adversária. Acompanhe HP, efeitos e possíveis habilidades de ressurreição antes de decidir seu próximo alvo.', 'defeat the opposing team. Track HP, effects, and possible resurrection skills before choosing your next target.')}</li>
                  </ul>
                </article>

                <article className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-orange-300 sm:text-sm">
                    {t('6. Painel da batalha', '6. Battle interface')}
                  </h3>
                  <ul className="space-y-2 text-[11px] leading-relaxed text-slate-300 sm:text-xs">
                    <li><span className="font-bold text-white">{t('Retratos e barras:', 'Portraits and bars:')}</span> {t('identificam os combatentes; a barra numérica indica vida atual e máxima.', 'identify combatants; the numeric bar shows current and maximum health.')} <span className="font-bold text-amber-200">{t('Toque em um aliado para abrir suas habilidades.', 'Tap an ally to open their skills.')}</span></li>
                    <li><span className="font-bold text-white">{t('Ícones junto ao personagem:', 'Icons by a character:')}</span> {t('mostram efeitos ativos, como escudo, stun, proteção ou dano contínuo.', 'show active effects such as shield, stun, protection, or damage over time.')} <span className="font-bold text-amber-200">{t('Consulte o efeito para ver detalhes e duração, quando disponíveis.', 'Inspect an effect to see details and duration when available.')}</span></li>
                    <li><span className="font-bold text-white">{t('Chakra e turno:', 'Chakra and turn:')}</span> {t('o painel central mostra seu estoque, o número do turno e de quem é a fase de planejamento.', 'the center panel shows your chakra pool, turn number, and whose planning phase it is.')}</li>
                    <li><span className="font-bold text-white">{t('Log:', 'Log:')}</span> {t('registra ações e resultados já resolvidos.', 'records resolved actions and outcomes.')} <span className="font-bold text-amber-200">{t('Confira dano, cura, custos e efeitos aplicados.', 'Review damage, healing, costs, and applied effects.')}</span></li>
                    <li><span className="font-bold text-white">{t('Missões e configurações:', 'Missions and settings:')}</span> {t('consulte objetivos da partida e ajuste opções da batalha pelos respectivos botões.', 'check match objectives and adjust battle options with their respective buttons.')}</li>
                  </ul>
                </article>
              </div>

              <p className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-950/25 p-3 text-[11px] leading-relaxed text-emerald-100 sm:text-xs">
                <span className="font-black text-emerald-300">{t('Dica:', 'Tip:')}</span>{' '}
                <span className="font-bold text-emerald-200">{t('Planeje o gasto total antes de finalizar.', 'Plan your total spend before ending the turn.')}</span>{' '}
                {t('Combine habilidades de preparação com finalizadores e mantenha ninjas vivos para gerar mais chakra nos próximos turnos.', 'Pair setup skills with finishers, and keep ninjas alive to generate more chakra on future turns.')}
              </p>
            </div>
          </section>
        </div>

  );
}
