'use client';

import React, { useState } from 'react';
import { Placeholder } from '../ui/Placeholder';
import { useAccessibilityChatbot } from '../../hooks/useDifaMap';

export interface ChatPanelProps {
  selectedLocationId?: string;
  userLocation?: { latitude: number; longitude: number };
}

/**
 * AI Accessibility Assistant (§10 Fitur 4).
 * Hook chatbot sudah jadi; ini hanya kulit sementara.
 */
export default function ChatPanel({ selectedLocationId, userLocation }: ChatPanelProps) {
  const { messages, isSending, sendMessage } = useAccessibilityChatbot();
  const [draft, setDraft] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    setDraft('');
    await sendMessage(text, userLocation, selectedLocationId);
  };

  return (
    <section aria-labelledby="judul-chat" className="panel">
      <h2 id="judul-chat" className="panel-title">
        Asisten Aksesibilitas
      </h2>

      <Placeholder
        label="Panel Chatbot AI"
        docRef="DEVELOPMENT.md §10 Fitur 4"
        description="Desain final: gelembung percakapan, kartu sumber data yang dirujuk, dan pertanyaan preset."
        checklist={[
          'Gelembung pesan user vs asisten yang terbedakan tanpa mengandalkan warna saja',
          'Kartu "sumber data" dari referencedLocations',
          'Tombol pertanyaan preset untuk pengguna baru',
          'aria-live pada area balasan agar screen reader membacakan jawaban baru',
        ]}
      />

      {/* aria-live: screen reader ikut membacakan balasan yang baru masuk */}
      <div className="ph-chat" aria-live="polite">
        {messages.map((m, i) => (
          <p key={i} className="ph-chat-msg" data-role={m.role}>
            <strong>{m.role === 'user' ? 'Anda: ' : 'DifaMap AI: '}</strong>
            {m.content}
          </p>
        ))}
        {isSending && <p className="panel-state">Asisten sedang mengetik…</p>}
      </div>

      <form onSubmit={submit} className="ph-chat-form">
        <label htmlFor="input-chat" className="ph-sr-only">
          Tulis pertanyaan untuk asisten aksesibilitas
        </label>
        <input
          id="input-chat"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Contoh: titik mana yang paling butuh perbaikan?"
        />
        <button type="submit" disabled={isSending} className="ph-btn">
          Kirim
        </button>
      </form>
    </section>
  );
}
