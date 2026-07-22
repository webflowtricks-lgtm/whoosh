/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NinjaEvent } from '../types';

const STORAGE_KEY = 'naruto_ninja_events';

export const DEFAULT_NINJA_EVENTS: NinjaEvent[] = [
  {
    id: 'guerra-ninja-1',
    title: '4ª Grande Guerra Shinobi',
    subtitle: 'Evento de Batalha Global de Aliança',
    description: 'A Aliança Shinobi precisa da sua força no campo de batalha! Participe das batalhas da Arena, vença com seus ninjas e ajude a proteger o mundo ninja contra a ameaça dos Edo Tensei.',
    bannerUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
    badge: 'EVENTO PRINCIPAL',
    timeLeft: '4 dias 18 horas',
    featured: true,
    objectives: [
      {
        id: 'gn1-obj1',
        description: 'Vença 3 partidas na Arena Tática',
        current: 2,
        target: 3,
        rewardType: 'ryos',
        rewardValue: 500,
        rewardLabel: '500 Ryos'
      },
      {
        id: 'gn1-obj2',
        description: 'Cause 1.500 de dano total em combate',
        current: 1250,
        target: 1500,
        rewardType: 'gems',
        rewardValue: 50,
        rewardLabel: '50 Gemas Ninja'
      },
      {
        id: 'gn1-obj3',
        description: 'Use habilidades de Ninjutsu 15 vezes',
        current: 15,
        target: 15,
        rewardType: 'title',
        rewardValue: 'Herói da Aliança',
        rewardLabel: 'Título: "Herói da Aliança"'
      },
      {
        id: 'gn1-obj4',
        description: 'Complete 5 Missões Ninja no Quadro de Missões',
        current: 3,
        target: 5,
        rewardType: 'frame',
        rewardValue: 'Guerra Shinobi',
        rewardLabel: 'Moldura Exclusiva "Guerra Shinobi"'
      }
    ]
  },
  {
    id: 'festival-folha-2026',
    title: 'Festival da Folha - Konoha',
    subtitle: 'Comemoração de Outono',
    description: 'Celebre a paz em Konohagakure! Ganhe bônus de Ryos ao jogar partidas diárias e complete desafios de suporte e cura.',
    bannerUrl: 'https://images.unsplash.com/photo-1528164344705-47542687990d?w=800&auto=format&fit=crop&q=80',
    badge: 'FESTIVAL',
    timeLeft: '11 dias',
    featured: false,
    objectives: [
      {
        id: 'ff-obj1',
        description: 'Recupere 800 de Vida acumulados em batalhas',
        current: 800,
        target: 800,
        rewardType: 'ryos',
        rewardValue: 300,
        rewardLabel: '300 Ryos'
      },
      {
        id: 'ff-obj2',
        description: 'Monte um esquadrão completo de ninjas da Folha',
        current: 1,
        target: 1,
        rewardType: 'gems',
        rewardValue: 30,
        rewardLabel: '30 Gemas'
      }
    ]
  },
  {
    id: 'invasao-akatsuki',
    title: 'Ameaça Vermelha: Caça às Bestas',
    subtitle: 'Desafio Semanal Akatsuki',
    description: 'Membros da Akatsuki foram avistados nas fronteiras do País do Fogo. Conclua combates usando invulnerabilidade e contra-ataque!',
    bannerUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=80',
    badge: 'DESAFIO ESPECIAL',
    timeLeft: '2 dias 05 horas',
    featured: false,
    objectives: [
      {
        id: 'ak-obj1',
        description: 'Aplique Atordoamento ou Silêncio 5 vezes em inimigos',
        current: 5,
        target: 5,
        rewardType: 'title',
        rewardValue: 'Caçador de Renegados',
        rewardLabel: 'Título: "Caçador de Renegados"'
      },
      {
        id: 'ak-obj2',
        description: 'Gere 600 de Escudo acumulados',
        current: 420,
        target: 600,
        rewardType: 'gems',
        rewardValue: 40,
        rewardLabel: '40 Gemas Ninja'
      }
    ]
  }
];

export function getEvents(): NinjaEvent[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse events from localStorage:', e);
    }
  }
  return DEFAULT_NINJA_EVENTS;
}

export function saveEvents(events: NinjaEvent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function resetToDefaultEvents(): NinjaEvent[] {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_NINJA_EVENTS));
  return DEFAULT_NINJA_EVENTS;
}
