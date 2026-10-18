import React, { useState } from 'react';
import { CheckCircle, Mail, Send, ShieldAlert } from 'lucide-react';
import type { QuestReward } from '../types';
import { configFetch } from '../lib/api';
import { CARD_PACK_REWARD_MAX } from '../lib/cardRoulette';

type RewardType = QuestReward['type'] | 'none';

export default function AdminMailCenter({ playClickSound }: { playClickSound: () => void }) {
  const [sendToAll, setSendToAll] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [rewardType, setRewardType] = useState<RewardType>('none');
  const [rewardValue, setRewardValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError('');
    setSuccess('');

    const rewards: QuestReward[] = rewardType === 'none'
      ? []
      : [{ type: rewardType, value: rewardValue.trim() }];
    try {
      const response = await configFetch('/api/admin/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendToAll,
          targetId: sendToAll ? undefined : targetId.trim(),
          subject: subject.trim(),
          message: message.trim(),
          rewards,
        }),
      });
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const result = isJson
        ? await response.json().catch(() => ({})) as {
          success?: boolean;
          error?: string;
          sentCount?: number;
        }
        : {};
      if (!response.ok || !result.success) {
        if (response.status === 404 && !isJson && import.meta.env.DEV) {
          throw new Error('A rota ainda não foi carregada no servidor local. Reinicie `npm run dev` e atualize a página.');
        }
        throw new Error(result.error || `Falha ao enviar (HTTP ${response.status}).`);
      }
      setSuccess(`Mensagem enviada para ${result.sentCount ?? 0} conta(s).`);
      setTargetId('');
      setSubject('');
      setMessage('');
      setRewardType('none');
      setRewardValue('');
    } catch (cause) {
      console.error('Falha ao enviar mensagem administrativa:', cause);
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl sm:p-6">
        <div className="mb-2 flex items-center gap-2">
          <Mail className="h-5 w-5 text-sky-400" />
          <h2 className="text-lg font-bold uppercase tracking-wider text-white font-mono">Mensagens para usuários</h2>
        </div>
        <p className="mb-5 text-xs text-slate-400 font-mono">
          Envie uma mensagem para uma conta pelo ID (nome de usuário) ou para todos os usuários. O destinatário recebe a mensagem na caixa de entrada do lobby e precisa resgatar ou marcar como lida.
        </p>

        <form onSubmit={event => void sendMessage(event)} className="space-y-4">
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-2 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Destinatários</legend>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              <input type="radio" checked={!sendToAll} onChange={() => setSendToAll(false)} />
              Uma conta
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              <input type="radio" checked={sendToAll} onChange={() => setSendToAll(true)} />
              Todos os usuários
            </label>
          </fieldset>

          {!sendToAll && (
            <label className="block max-w-md">
              <span className="mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">ID da conta</span>
              <input
                required
                value={targetId}
                onChange={event => setTargetId(event.target.value)}
                maxLength={80}
                placeholder="Ex.: 12345"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500"
              />
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Assunto</span>
              <input
                required
                value={subject}
                onChange={event => setSubject(event.target.value)}
                maxLength={120}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Prêmio opcional</span>
              <select
                value={rewardType}
                onChange={event => { setRewardType(event.target.value as RewardType); setRewardValue(''); }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500"
              >
                <option value="none">Somente mensagem</option>
                <option value="ryos">Ryos</option>
                <option value="gems">Gemas</option>
                <option value="title">Título</option>
                <option value="unlock_character">Personagem</option>
                <option value="frame">Moldura</option>
                <option value="banner">Banner</option>
                <option value="card_pack">Pacotes Ninja Card</option>
              </select>
            </label>
          </div>

          {rewardType !== 'none' && (
            <label className="block max-w-md">
              <span className="mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                {rewardType === 'card_pack'
                  ? `Quantidade de pacotes (máximo ${CARD_PACK_REWARD_MAX})`
                  : rewardType === 'ryos' || rewardType === 'gems'
                    ? 'Quantidade'
                    : 'ID ou valor do prêmio'}
              </span>
              <input
                required
                type={rewardType === 'ryos' || rewardType === 'gems' || rewardType === 'card_pack' ? 'number' : 'text'}
                min={rewardType === 'ryos' || rewardType === 'gems' || rewardType === 'card_pack' ? 1 : undefined}
                max={rewardType === 'card_pack' ? CARD_PACK_REWARD_MAX : undefined}
                step={rewardType === 'ryos' || rewardType === 'gems' || rewardType === 'card_pack' ? 1 : undefined}
                value={rewardValue}
                onChange={event => setRewardValue(event.target.value)}
                maxLength={2048}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Mensagem</span>
            <textarea
              required
              value={message}
              onChange={event => setMessage(event.target.value)}
              maxLength={2000}
              rows={5}
              className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500"
            />
          </label>

          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              <ShieldAlert className="h-4 w-4 shrink-0" />{error}
            </p>
          )}
          {success && (
            <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle className="h-4 w-4 shrink-0" />{success}
            </p>
          )}
          <button
            type="submit"
            onClick={playClickSound}
            disabled={sending || !subject.trim() || !message.trim() || (!sendToAll && !targetId.trim()) || (rewardType !== 'none' && !rewardValue.trim())}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Enviando...' : sendToAll ? 'Enviar para todos' : 'Enviar mensagem'}
          </button>
        </form>
      </section>
    </main>
  );
}
