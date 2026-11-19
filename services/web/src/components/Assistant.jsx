import { useEffect, useRef, useState } from 'react';
import { Bot, MessageSquare, Send, Sparkles, X } from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { answerQuestion, SUGGESTIONS } from '../lib/assistant';
import { formatNumber } from '../lib/format';

const WELCOME = {
  role: 'bot',
  text: 'Привет! Я локальный аналитический помощник. Отвечаю по данным каталога, установок и рисков, загруженным через публичный API. Внешний LLM и text-to-SQL не используются — цифры нужно проверять в отчётах.',
};

export default function Assistant() {
  const { catalog, risks, devices, summary, installations } = useAppData();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([WELCOME]);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  function send(question) {
    const text = String(question || input).trim();
    if (!text) return;
    const answer = answerQuestion(text, {
      catalog: catalog.data || [],
      rows: installations.rows || [],
      risks: risks.data || [],
      devices: devices.data || [],
      summary: summary.data,
    });
    const partial = installations.loading
      ? ' Внимание: срез установок ещё загружается, ответ может быть неполным.'
      : '';
    setMessages((items) => [
      ...items,
      { role: 'user', text },
      { role: 'bot', text: answer.text + partial, table: answer.table, note: answer.note },
    ]);
    setInput('');
  }

  return (
    <>
      <button
        type="button"
        className={`assistant-fab ${open ? 'assistant-fab-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Открыть ИИ-ассистента"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      {open && (
        <div className="assistant-window">
          <header className="assistant-head">
            <div className="assistant-title">
              <span className="assistant-avatar"><Bot size={18} /></span>
              <div><b>Ассистент ИТ-директора</b><small>локальный офлайн-режим</small></div>
            </div>
            <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Закрыть"><X size={17} /></button>
          </header>

          <div className="assistant-body">
            {messages.map((message, index) => (
              <div key={index} className={`chat-message chat-${message.role}`}>
                {message.role === 'bot' ? <span className="chat-icon"><Sparkles size={13} /></span> : null}
                <div className="chat-bubble">
                  <p>{message.text}</p>
                  {message.table?.rows?.length ? (
                    <div className="chat-table">
                      <table>
                        <thead><tr>{message.table.columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr></thead>
                        <tbody>
                          {message.table.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {message.table.columns.map((column) => (
                                <td key={column.key}>{typeof row[column.key] === 'number' ? formatNumber(row[column.key]) : row[column.key] ?? '—'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {message.note ? <small className="chat-note">{message.note}</small> : null}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {messages.length === 1 ? (
            <div className="assistant-suggestions">
              {SUGGESTIONS.slice(0, 4).map((question) => (
                <button type="button" key={question} onClick={() => send(question)}>{question}</button>
              ))}
            </div>
          ) : null}

          <div className="assistant-input">
            <input
              type="text"
              value={input}
              placeholder="Задайте вопрос по данным…"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && send()}
            />
            <button type="button" onClick={() => send()} aria-label="Отправить"><Send size={16} /></button>
          </div>
        </div>
      )}
    </>
  );
}
