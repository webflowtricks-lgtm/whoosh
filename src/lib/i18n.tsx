import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'pt' | 'en';

const LANGUAGE_KEY = 'ninja_app_language';

let currentLanguage: Language = (typeof window !== 'undefined' && (localStorage.getItem(LANGUAGE_KEY) as Language)) || 'pt';
const subscribers: Set<(lang: Language) => void> = new Set();

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_KEY, lang);
  }
  subscribers.forEach((cb) => cb(lang));
}

export function subscribeLanguage(cb: (lang: Language) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Universal translation helper function.
 * Pass Portuguese and English strings directly:
 * t('Entrar na Arena', 'Enter Arena')
 */
export function t(ptText: string, enText: string): string {
  return currentLanguage === 'en' ? enText : ptText;
}

/**
 * Game Text Translator: Converts Portuguese game strings (skill descriptions, quest desc, etc.)
 * into clear English when English is selected.
 */
export function translateGameText(text: string | undefined | null, lang: Language = currentLanguage): string {
  if (!text) return '';
  if (lang === 'pt') return text;

  let translated = text;

  const exactMatches: Record<string, string> = {
    "Descreva os objetivos épicos desta missão para os shinobis.": "Describe the epic objectives of this quest for shinobis.",
    "O Último Espelho de Gelo": "The Last Ice Mirror",
    "Nova Missão Lendária": "New Legendary Quest",
    "Nova Missão Lendária 2": "New Legendary Quest 2",
    "Guerreiro do Amanhecer": "Dawn Warrior",
    "Estudante de Academia": "Academy Student",
    "Estudante Shinobi": "Shinobi Student",
    "Vila da Folha": "Leaf Village",
    "Vila da Areia": "Sand Village",
    "Vila da Névoa": "Mist Village",
    "Vila da Nuvem": "Cloud Village",
    "Vila da Pedra": "Stone Village",
    "Vila da Folha (Konoha)": "Leaf Village (Konoha)",
    "Inimigo Único": "Single Enemy",
    "Todos os Inimigos": "All Enemies",
    "Próprio": "Self",
    "Si mesmo": "Self",
    "Aliado Único": "Single Ally",
    "Todos os Aliados": "All Allies",
    "Físico": "Physical",
    "Chakra": "Chakra",
    "Mental": "Mental",
    "Aflição": "Affliction",
    "Corpo a Corpo": "Melee",
    "Distância": "Ranged",
    "Estratégia": "Strategy",
    "Sangramento": "Bleeding",
    "Invisível": "Invisible",
    "Desconhecido": "Unknown",
  };

  if (exactMatches[translated.trim()]) {
    return exactMatches[translated.trim()];
  }

  // Regex and pattern replacements for skill descriptions & quest descriptions
  const replacements: [RegExp, string][] = [
    [/Descreva os objetivos épicos desta missão para os shinobis\./gi, "Describe the epic objectives of this quest for shinobis."],
    [/causa (\d+) de dano físico/gi, "deals $1 physical damage"],
    [/causa (\d+) de dano de chakra/gi, "deals $1 chakra damage"],
    [/causa (\d+) de dano mental/gi, "deals $1 mental damage"],
    [/causa (\d+) de dano verdadeiro/gi, "deals $1 true damage"],
    [/causa (\d+) de dano de aflição/gi, "deals $1 affliction damage"],
    [/causa (\d+) de dano direto/gi, "deals $1 direct damage"],
    [/causa (\d+) de dano por turno/gi, "deals $1 damage per turn"],
    [/causa (\d+) de dano adicional/gi, "deals $1 additional damage"],
    [/causa (\d+) de dano/gi, "deals $1 damage"],
    [/causando (\d+) de dano/gi, "dealing $1 damage"],
    [/de dano físico/gi, "physical damage"],
    [/de dano de chakra/gi, "chakra damage"],
    [/de dano mental/gi, "mental damage"],
    [/de dano verdadeiro/gi, "true damage"],
    [/de dano de aflição/gi, "affliction damage"],
    [/de dano direto/gi, "direct damage"],
    [/de dano por turno/gi, "damage per turn"],
    [/de dano adicional/gi, "additional damage"],
    [/de dano/gi, "damage"],
    [/a um inimigo/gi, "to an enemy"],
    [/a todos os inimigos/gi, "to all enemies"],
    [/a um aliado/gi, "to an ally"],
    [/a todos os aliados/gi, "to all allies"],
    [/a si mesmo/gi, "to self"],
    [/atordoando-o por (\d+) turno/gi, "stunning them for $1 turn"],
    [/atordoando-o por (\d+) turnos/gi, "stunning them for $1 turns"],
    [/atordoando-os por (\d+) turnos/gi, "stunning them for $1 turns"],
    [/por (\d+) turnos/gi, "for $1 turns"],
    [/por (\d+) turno/gi, "for $1 turn"],
    [/reduz o dano recebido em (\d+)/gi, "reduces damage received by $1"],
    [/redução de dano fixa/gi, "fixed damage reduction"],
    [/redução de dano/gi, "damage reduction"],
    [/concedendo (\d+) pontos de/gi, "granting $1 points of"],
    [/concede (\d+) pontos de/gi, "grants $1 points of"],
    [/pontos de escudo/gi, "shield points"],
    [/pontos de vida/gi, "health points"],
    [/cura (\d+) de HP/gi, "heals $1 HP"],
    [/cura (\d+) HP/gi, "heals $1 HP"],
    [/curando (\d+) de HP/gi, "healing $1 HP"],
    [/requer que \[(.*?)\] esteja ativo/gi, "requires [$1] to be active"],
    [/requer que \[(.*?)\] estejam ativos/gi, "requires [$1] to be active"],
    [/de recarga/gi, "cooldown"],
    [/tornando-se invulnerável a todas as habilidades recebidas/gi, "becoming invulnerable to all incoming skills"],
    [/tornando-se invulnerável/gi, "becoming invulnerable"],
    [/a todas as habilidades/gi, "to all skills"],
    [/a um alvo/gi, "to a target"],
    [/Aumenta o dano causado em (\d+)/gi, "Increases damage dealt by $1"],
    [/Reduz o dano causado em (\d+)/gi, "Decreases damage dealt by $1"],
    [/Cria vários clones/gi, "Creates several clones"],
    [/distrai um inimigo/gi, "distracts an enemy"],
    [/atinge um inimigo com/gi, "strikes an enemy with"],
  ];

  for (const [pattern, replacement] of replacements) {
    translated = translated.replace(pattern, replacement);
  }

  return translated;
}

const configuredEnglishText: Record<string, string> = {
  EVENTO: 'EVENT',
  'EVENTO NARUTO': 'NARUTO EVENT',
  'EVENTO UCHIHA': 'UCHIHA EVENT',
  'EVENTO PRINCIPAL': 'MAIN EVENT',
  FESTIVAL: 'FESTIVAL',
  'DESAFIO ESPECIAL': 'SPECIAL CHALLENGE',
  'Evento Limitado': 'Limited-Time Event',
  'Evento especial': 'Special Event',
  'Evento ativo': 'Event active',
  'Evento encerrado': 'Event ended',
  '4 dias 18 horas': '4 days 18 hours',
  '11 dias': '11 days',
  '2 dias 05 horas': '2 days 05 hours',
  'Evento Ninja': 'Ninja Event',
  Ativo: 'Active',
  'Naruto: O Início de uma Lenda': 'Naruto: The Beginning of a Legend',
  PRONTO: 'READY',
  metas: 'goals',
  'das metas completas': 'of goals completed',
  METAS: 'GOALS',
  COMPLETAS: 'COMPLETED',
  Resgatado: 'Claimed',
  Resgatando: 'Claiming',
  Resgatar: 'Claim',
  'Em andamento': 'In progress',
  'Fechar eventos': 'Close events',
  'resgatado!': 'claimed!',
  'Recompensa:': 'Reward:',
  'Prêmio surpresa': 'Surprise reward',
  Moedas: 'Coins',
  moedas: 'coins',
  Ryos: 'Ryos',
  Gems: 'Gems',
  '500 moedas': '500 coins',
  '300 moedas': '300 coins',
  '50 Ryos': '50 Ryos',
  '40 Ryos': '40 Ryos',
  'Título: "Herói da Aliança"': 'Title: "Alliance Hero"',
  'Moldura Exclusiva "Guerra Shinobi"': 'Exclusive "Shinobi War" Frame',
  'Título: "Caçador de Renegados"': 'Title: "Rogue Hunter"',
  '4ª Grande Guerra Shinobi': 'Fourth Great Shinobi War',
  'Evento de Batalha Global de Aliança': 'Global Alliance Battle Event',
  'A Aliança Shinobi precisa da sua força no campo de batalha! Participe das batalhas da Arena, vença com seus ninjas e ajude a proteger o mundo ninja contra a ameaça dos Edo Tensei.':
    'The Shinobi Alliance needs your strength on the battlefield! Join arena battles, win with your ninjas, and help protect the ninja world from the Edo Tensei threat.',
  'Vença 3 partidas na Arena Tática': 'Win 3 matches in the Tactical Arena',
  'Cause 1.500 de dano total em combate': 'Deal 1,500 total damage in combat',
  'Use habilidades de Ninjutsu 15 vezes': 'Use Ninjutsu skills 15 times',
  'Complete 5 Missões Ninja no Quadro de Missões': 'Complete 5 Ninja Missions on the Mission Board',
  'Festival da Folha - Konoha': 'Leaf Festival - Konoha',
  'Comemoração de Outono': 'Autumn Celebration',
  'Celebre a paz em Konohagakure! Ganhe bônus de moedas ao jogar partidas diárias e complete desafios de suporte e cura.':
    'Celebrate peace in Konohagakure! Earn bonus coins by playing daily matches and complete support and healing challenges.',
  'Recupere 800 de Vida acumulados em batalhas': 'Restore 800 total health in battles',
  'Monte um esquadrão completo de ninjas da Folha': 'Build a full squad of Leaf Village ninjas',
  'Ameaça Vermelha: Caça às Bestas': 'Red Threat: Tailed Beast Hunt',
  'Desafio Semanal Akatsuki': 'Weekly Akatsuki Challenge',
  'Membros da Akatsuki foram avistados nas fronteiras do País do Fogo. Conclua combates usando invulnerabilidade e contra-ataque!':
    'Akatsuki members have been spotted at the borders of the Land of Fire. Finish battles using invulnerability and counterattacks!',
  'Aplique Atordoamento ou Silêncio 5 vezes em inimigos': 'Apply Stun or Silence to enemies 5 times',
  'Gere 600 de Escudo acumulados': 'Generate 600 total shield points',
  'Laços de Sangue: Sasuke & Itachi': 'Blood Ties: Sasuke & Itachi',
  'Desafio especial do Clã Uchiha': 'Special Uchiha Clan Challenge',
  'Lute ao lado dos irmãos Uchiha em batalhas contra a IA e online. Vença, use suas habilidades e prove sua força para conquistar prêmios surpresa.':
    'Fight alongside the Uchiha brothers in AI and online battles. Win, use your skills, and prove your strength to earn surprise rewards.',
  'Vença 1 batalha na Arena': 'Win 1 battle in the Arena',
  'Vença 5 batalhas com Sasuke na equipe': 'Win 5 battles with Sasuke on your team',
  'Vença 5 batalhas com Itachi na equipe': 'Win 5 battles with Itachi on your team',
  'Use 30 habilidades com Sasuke': 'Use 30 skills with Sasuke',
  'Use 30 habilidades com Itachi': 'Use 30 skills with Itachi',
  'Cause 10.000 de dano usando Sasuke': 'Deal 10,000 damage using Sasuke',
  'Cause 10.000 de dano usando Itachi': 'Deal 10,000 damage using Itachi',
  'Receba 5.000 de dano em batalhas com Sasuke na equipe': 'Take 5,000 damage in battles with Sasuke on your team',
  '500 Moedas': '500 Coins',
  '900 Moedas': '900 Coins',
  '600 Moedas': '600 Coins',
  '1.000 Moedas': '1,000 Coins',
  '750 Moedas': '750 Coins',
  '1.250 Moedas': '1,250 Coins',
  '15 Gems': '15 Gems',
  '20 Gems': '20 Gems',
  '25 Gems': '25 Gems',
  'Um genin entusiasmado do Time 7. Naruto tem o objetivo de se tornar Hokage. Seus Clones das Sombras o protegem e copiam seus movimentos para realizar combos poderosos e desferir o lendário Rasengan.':
    'An enthusiastic genin on Team 7, Naruto dreams of becoming Hokage. His Shadow Clones protect him and copy his moves, letting him perform powerful combos and unleash the legendary Rasengan.',
  'Vila da Folha': 'Leaf Village',
  'Vila da Areia': 'Sand Village',
  'Vila da Névoa': 'Hidden Mist Village',
  'Vila da Nuvem': 'Hidden Cloud Village',
  'Vila da Pedra': 'Hidden Stone Village',
  'Time 7': 'Team 7',
  Jinchuriki: 'Jinchuriki',
  Vento: 'Wind',
  Agulhas: 'Needles',
  Besta: 'Beast',
  Clássico: 'Classic',
  'Clã Shinobi': 'Shinobi Clan',
  Cobras: 'Snakes',
  Dançarino: 'Dancer',
  'Espadachins da Névoa': 'Mist Swordsmen',
  Espelhos: 'Mirrors',
  Estiloso: 'Stylish',
  Estrategista: 'Strategist',
  Fogo: 'Fire',
  Gelo: 'Ice',
  Insetos: 'Insects',
  Leque: 'Fan',
  Mente: 'Mind',
  Médico: 'Medical Ninja',
  Portões: 'Inner Gates',
  Reencarnado: 'Reanimated',
  Relâmpago: 'Lightning',
  Sapos: 'Toads',
  'Shinobi Solitário': 'Lone Shinobi',
  Sombras: 'Shadows',
  Sons: 'Sounds',
  Terra: 'Earth',
  'Time 10': 'Team 10',
  'Time 8': 'Team 8',
  'Time Asuma': 'Team Asuma',
  'Time Guy': 'Team Guy',
  'Vila do Som': 'Sound Village',
  'À Distância': 'Ranged',
  Água: 'Water',
  'Pacote de Fragmentos de Skin': 'Skin Fragment Pack',
  'Receba de 1 a 10 fragmentos de uma skin aleatória.': 'Receive 1 to 10 fragments of a random skin.',
  'Lenda dos Sannin': 'Legend of the Sannin',
  'Título exclusivo de prestígio reconhecido por todos os países ninjas.': 'An exclusive prestige title recognized by every ninja nation.',
  'Akatsuki Renegado': 'Rogue Akatsuki',
  'Título para aqueles que trilham o caminho da névoa e das sombras.': 'A title for those who walk the path of mist and shadows.',
  'Mestre dos Oito Portões': 'Eight Gates Master',
  'Título honroso concedido a guerreiros que dominam a força do Taijutsu.': 'An honorable title awarded to warriors who have mastered the power of taijutsu.',
  'Deus dos Shinobis': 'God of Shinobi',
  'O mais alto título do mundo ninja, gravado nos monumentos da arena.': 'The highest title in the ninja world, engraved on the arena monuments.',
  'Naruto Modo Sábio': 'Naruto Sage Mode',
  'Visual lendário de Naruto vestindo a capa vermelha do Modo Sábio de Senjutsu.': "Naruto's legendary look wearing the red cloak of Senjutsu Sage Mode.",
  'Sasuke Traje Hebi': 'Sasuke Hebi Outfit',
  'Visual de Sasuke durante a formação do esquadrão Hebi na caça a Itachi.': "Sasuke's outfit during the formation of the Hebi squad in its hunt for Itachi.",
  'Kakashi Capitão ANBU': 'Kakashi, ANBU Captain',
  'Traje operacional sombrio das Forças Especiais ANBU de Konoha.': "A dark operational uniform of Konoha's ANBU Special Forces.",
  'Rasengan Perfeito': 'Perfect Rasengan',
  'Efeito visual especial de carga, lançamento e impacto para a habilidade Rasengan do Naruto.': "A special charge, launch, and impact visual effect for Naruto's Rasengan skill.",
  'Fogo da Vontade': 'Will of Fire',
  'Moldura reluzente inspirada no fogo e determinação dos ninjas de Konoha.': "A radiant frame inspired by the fire and determination of Konoha's ninjas.",
  'Sharingan Carmesim': 'Crimson Sharingan',
  'Moldura com áurea rubra misteriosa inspirada no lendário Dōjutsu do Clã Uchiha.': 'A frame with a mysterious crimson aura, inspired by the legendary dojutsu of the Uchiha Clan.',
  'Operativo ANBU': 'ANBU Operative',
  'Moldura prateada elegante reservada para ninjas das forças especiais de esquadrão.': 'An elegant silver frame reserved for special squad forces ninjas.',
  'Bolsa de Moedas': 'Coin Pouch',
  'Bolsa contendo 1.000 moedas para desbloqueios e compras na loja.': 'A pouch containing 1,000 coins for unlocks and shop purchases.',
  'Baú do Tesouro Ninja': 'Ninja Treasure Chest',
  'Grande baú com 3.000 moedas para expansão rápida do seu império ninja.': 'A large chest with 3,000 coins to quickly expand your ninja empire.',
  'Título existente concedido por padrão ou como recompensa.': 'An existing title granted by default or as a reward.',
  Estudante: 'Student',
  'Genin de Konoha': 'Konoha Genin',
  'Herói da Aliança': 'Alliance Hero',
  'Novo Título': 'New Title',
  'Giro da roleta': 'Roulette Spin',
  'Gire a roleta e ganhe uma figurinha aleatória.': 'Spin the roulette to win a random card.',
  'TÍTULO': 'TITLE',
  'MÍTICO': 'MYTHIC',
  'LENDÁRIO': 'LEGENDARY',
  'RARO': 'RARE',
  'HABILIDADE': 'SKILL',
  'PACOTE': 'BUNDLE',
  'OFERTA': 'DEAL',
  'RECOMPENSA': 'REWARD',
  'Moedas insuficientes!': 'Not enough coins!',
  'Ryos insuficientes!': 'Not enough Ryos!',
};

const characterDescriptionsEn: Record<string, string> = {
  'Um prodígio do Time 7. Buscando poder e vingança, Sasuke ativa seu Sharingan para analisar inimigos, antecipar seus ataques e golpear com relâmpagos letais do Chidori.':
    "A Team 7 prodigy. Seeking power and revenge, Sasuke activates his Sharingan to analyze enemies, anticipate their attacks, and strike with Chidori's deadly lightning.",
  'Uma ninja médica genin do Time 7. Altamente inteligente, Sakura cura seus aliados, utiliza sua Sakura Interior para resistir ao combate e desfere socos devastadores de chakra.':
    'A genin medical ninja on Team 7. Highly intelligent, Sakura heals her allies, uses her Inner Sakura to endure combat, and delivers devastating chakra-powered punches.',
  'O líder Jonin de elite do Time 7. Conhecido mundialmente como o Ninja Copiador, Kakashi usa seu Sharingan para antecipar movimentos, se esconde no subsolo e desfere sua icônica Espada Relâmpago.':
    'The elite jonin leader of Team 7. Known worldwide as the Copy Ninja, Kakashi uses his Sharingan to anticipate movements, hides underground, and delivers his iconic Lightning Blade.',
  'Um genin aterrorizante da Vila da Areia que abriga o Shukaku de Uma Cauda. Gaara se protege com uma armadura de areia e manipula a areia para prender e soterrar seus oponentes.':
    'A fearsome genin from the Sand Village who hosts the One-Tail Shukaku. Gaara protects himself with a sand armor and manipulates sand to trap and bury his opponents.',
  'Um especialista dedicado da Vila da Folha. Sem habilidades em ninjutsu, Lee treina incansavelmente em taijutsu, usando força física extrema e abrindo os portões internos para colidir com os oponentes.':
    'A dedicated specialist from the Leaf Village. With no ninjutsu abilities, Lee trains tirelessly in taijutsu, using extreme physical strength and opening the Inner Gates to charge into opponents.',
  'O infame shinobi renegado da organização Akatsuki. Itachi prende os inimigos in genjutsus mentais profundos e comanda as chamas negras inextinguíveis do Amaterasu.':
    "The infamous rogue shinobi of the Akatsuki. Itachi traps enemies in deep mental genjutsu and commands Amaterasu's inextinguishable black flames.",
  'O prodígio genial do Clã Hyuga. Usando seu Byakugan, Neji atinge as vias de chakra do oponente, bloqueando suas habilidades e desviando todo o dano com a rotação de palmas.':
    "The brilliant prodigy of the Hyuga Clan. Using his Byakugan, Neji strikes an opponent's chakra points, blocking their abilities and deflecting all damage with Palm Rotation.",
  'Um adorável e forte membro do clã Akimichi. Choji expande o tamanho do seu corpo para esmagar os inimigos e consome pílulas secretas para se curar e amplificar dramaticamente sua força.':
    'A lovable and strong member of the Akimichi Clan. Choji enlarges his body to crush enemies and consumes secret pills to heal himself and dramatically amplify his strength.',
  'O estrategista genial do Time 10. Shikamaru usa suas sombras para prender e estrangular os oponentes de longe, enquanto medita para recuperar chakra e planejar cada passo da batalha.':
    'The brilliant strategist of Team 10. Shikamaru uses his shadows to trap and strangle opponents from afar while meditating to recover chakra and plan every move of the battle.',
  'A herdeira tímida do Clã Hyuga do Time 8. Hinata ativa seu Byakugan para obter excelente percepção defensiva e usa seu Punho Suave para golpear precisamente as vias de chakra inimigas.':
    'The shy heiress of the Hyuga Clan on Team 8. Hinata activates her Byakugan for excellent defensive perception and uses her Gentle Fist to strike enemy chakra points with precision.',
  'O Jonin mestre supremo de taijutsu do Time Guy. A lendária "Fera Nobre Verde da Folha" usa chutes devastadores e abre seus portões internos para obliterar qualquer barreira oponente.':
    'The supreme taijutsu master jonin of Team Guy. The legendary "Noble Green Beast of the Leaf" uses devastating kicks and opens his Inner Gates to obliterate any opposing barrier.',
  'Um dos lendários Sannin de Konoha, o carismático "Sábio dos Sapos". Ele comanda o óleo de sapo inflamável, agulhas de cabelo protetoras e pode convocar o gigantesco Gamabunta.':
    "One of Konoha's legendary Sannin, the charismatic \"Toad Sage.\" He commands flammable toad oil and protective hair needles, and can summon the gigantic Gamabunta.",
  'Um dos lendários Sannin de Konoha e criador da Vila do Som. Dominando cobras gigantescas e as propriedades da imortalidade, ele estende sua espada Kusanagi para empalar qualquer oponente.':
    "One of Konoha's legendary Sannin and founder of the Sound Village. Mastering giant snakes and the secrets of immortality, he extends his Kusanagi sword to impale any opponent.",
  'A lendária médica Sannin de Konoha. Tsunade acumula uma força colossal em seus músculos para destruir o solo e utiliza o milagroso selo Byakugou para curar qualquer ferimento instantaneamente.':
    "Konoha's legendary medical Sannin. Tsunade channels colossal strength into her muscles to shatter the ground and uses the miraculous Byakugou Seal to heal any wound instantly.",
  'O lendário espadachim "Demônio da Névoa Oculta". Zabuza conjura uma neblina impenetrável para se esconder e fatiar silenciosamente seus oponentes com a enorme espada Kubikiribocho.':
    'The legendary swordsman known as the "Demon of the Hidden Mist." Zabuza conjures an impenetrable mist to hide and silently slice his opponents with the massive Kubikiribocho sword.',
  'O fiel e talentoso parceiro de Zabuza. Detentor do Kekkei Genkai de liberação de gelo, ele prende os oponentes em espelhos de cristais de gelo de altíssima velocidade e ataca com agulhas de acupuntura.':
    "Zabuza's loyal and talented partner. Possessing the Ice Release Kekkei Genkai, he traps opponents in high-speed mirrors of ice crystals and attacks with acupuncture needles.",
  'A lenda lendária das pistas de dança, a versão mais estilosa do deserto. Ele envolve seus oponentes com batidas de discoteca pesadas, aprisionando-os no caixão de funk e dançando até a ressurreição.':
    "The legendary dance-floor legend, the desert's most stylish version. He surrounds opponents with heavy disco beats, trapping them in the funk coffin and dancing until resurrection.",
  'A ninja tática da Vila da Areia. Usando seu leque de ferro gigante, Temari manipula fortes correntes de vento para rasgar e repelir os oponentes, controlando a batalha com furacões cortantes.':
    'The tactical ninja of the Sand Village. Using her giant iron fan, Temari manipulates powerful gusts of wind to tear through and repel opponents, controlling the battle with cutting hurricanes.',
  'O genin selvagem do Time 8. Acompanhado por seu fiel cão Akamaru, Kiba desfere ataques combinados velozes de garras e presas com a técnica Presa Sobre Presa.':
    'The wild genin of Team 8. Accompanied by his loyal dog Akamaru, Kiba unleashes swift combined claw-and-fang attacks with the Fang Over Fang technique.',
  'A bela kunoichi do Time 10. Ino usa técnicas mentais de transferência de mente para controlar ou paralisar as mentes dos oponentes, deixando armadilhas de cabelo de chakra no chão para imobilizar.':
    "The beautiful kunoichi of Team 10. Ino uses mind-transfer techniques to control or paralyze opponents' minds, leaving chakra-hair traps on the ground to immobilize them.",
  'O reservado genin mestre de insetos do Time 8. Shino comanda insetos parasitas Kikaichu que drenam o chakra do oponente lentamente até que sequem.':
    "The reserved genin insect master of Team 8. Shino commands Kikaichu parasitic insects that slowly drain an opponent's chakra until they are left completely depleted.",
  'Um shinobi de elite com habilidades excepcionais e arsenal único. Mestre em técnicas de combate adaptadas para lutas intensas de Unison.':
    'An elite shinobi with exceptional abilities and a unique arsenal. A master of combat techniques adapted for intense Unison battles.',
};

export function localizeContentText(
  portugueseText: string | undefined | null,
  englishText: string | undefined | null,
  lang: Language = currentLanguage,
): string {
  if (lang === 'pt') return portugueseText || '';
  const english = englishText?.trim();
  const source = portugueseText?.trim();
  const containsPortuguese = (value: string) =>
    /[áàâãçéêíóôõú]|\b(?:de|da|do|das|dos|uma|um|em|no|na|nos|nas|por|para|com|que|seu|sua|seus|suas|não|habilidade|habilidades|inimigo|inimigos|aliado|aliados|personagem|personagens|dano|vida|turno|turnos|causa|causar|aumenta|reduz|atordoamento|recompensa|você)\b/i.test(value);

  if (english && !containsPortuguese(english)) return english;
  if (!source) return '';
  if (configuredEnglishText[source] || characterDescriptionsEn[source]) {
    return configuredEnglishText[source] || characterDescriptionsEn[source];
  }
  const translated = translateGameText(source, lang);
  if (translated !== source && !containsPortuguese(translated)) return translated;
  if (!containsPortuguese(source)) return source;
  return 'English translation missing';
}

export function translateTargetType(targetType: string | undefined, lang: Language = currentLanguage): string {
  if (!targetType) return '';
  if (lang === 'pt') {
    switch (targetType) {
      case 'Enemy': return 'Inimigo Único';
      case 'AllEnemies': return 'Todos os Inimigos';
      case 'Self': return 'Próprio';
      case 'Ally': return 'Aliado Único';
      case 'AllAllies': return 'Todos os Aliados';
      case 'AnyLiving': return 'Qualquer Personagem Vivo';
      default: return targetType;
    }
  } else {
    switch (targetType) {
      case 'Enemy': return 'Single Enemy';
      case 'AllEnemies': return 'All Enemies';
      case 'Self': return 'Self';
      case 'Ally': return 'Single Ally';
      case 'AllAllies': return 'All Allies';
      case 'AnyLiving': return 'Any Living Character';
      default: return targetType;
    }
  }
}

export function translateSkillName(skillName: string | undefined, lang: Language = currentLanguage): string {
  if (!skillName) return '';
  if (lang === 'pt') return skillName;
  const namesMap: Record<string, string> = {
    "Clone de Sombra": "Shadow Clone",
    "Técnica de Substituição": "Substitution Technique",
    "Selamento de Chakra": "Chakra Seal",
    "Bola de Fogo": "Fireball",
    "Aflição": "Affliction",
    "Paralisia de Cooldown": "Cooldown Paralyze",
  };
  return namesMap[skillName] || skillName;
}

export function translateSkillDesc(desc: string | undefined, lang: Language = currentLanguage): string {
  return translateGameText(desc, lang);
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (pt: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'pt',
  setLanguage: () => {},
  t: (pt: string, en: string) => pt,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLang] = useState<Language>(getLanguage());

  useEffect(() => {
    const unsubscribe = subscribeLanguage((newLang) => {
      setLang(newLang);
    });
    return unsubscribe;
  }, []);

  const handleSetLanguage = (newLang: Language) => {
    setLanguage(newLang);
  };

  const translate = (pt: string, en: string) => {
    return language === 'en' ? en : pt;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
