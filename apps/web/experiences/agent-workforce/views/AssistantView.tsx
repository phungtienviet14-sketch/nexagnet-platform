'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAssistantClient } from '../services/client-context';
import type { AgentGroupId, AssistantActionSuggestion, AssistantMessage } from '../services/types';

interface AssistantViewProps {
  readonly initialPrompt?: string;
  readonly onNavigateToAlert?: (alertId: string) => void;
  readonly onNavigateToDoc?: (docId: string) => void;
  readonly onNavigateToAgent?: (agentId: AgentGroupId) => void;
}

const QUICK_PROMPTS = [
  'Hôm nay có việc gì cần tôi xử lý?',
  'Tóm tắt các cảnh báo quan trọng.',
  'Tìm quy trình phê duyệt hợp đồng.',
  'Tóm tắt hoạt động kinh doanh hôm nay.',
];

export function AssistantView({
  initialPrompt,
  onNavigateToAlert,
  onNavigateToDoc,
  onNavigateToAgent,
}: AssistantViewProps) {
  const assistantClient = useAssistantClient();
  const [messages, setMessages] = useState<readonly AssistantMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    assistantClient.getInitialConversation().then((conv) => {
      if (isMounted) setMessages(conv);
    });
    return () => {
      isMounted = false;
    };
  }, [assistantClient]);

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleSend(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text || isTyping) return;

    setInputValue('');
    setIsTyping(true);

    try {
      await assistantClient.sendMessage(text);
      const updated = await assistantClient.getInitialConversation();
      setMessages(updated);
    } catch (err) {
      console.error('Loi tro ly:', err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleActionClick = (action: AssistantActionSuggestion) => {
    if (action.actionType === 'view_alert' && action.targetId && onNavigateToAlert) {
      onNavigateToAlert(action.targetId);
    } else if (action.actionType === 'view_doc' && action.targetId && onNavigateToDoc) {
      onNavigateToDoc(action.targetId);
    } else if (action.actionType === 'view_agent' && action.targetId && onNavigateToAgent) {
      onNavigateToAgent(action.targetId as AgentGroupId);
    } else if (action.prompt) {
      handleSend(action.prompt);
    }
  };

  const activeSources = messages.flatMap((m) => m.sources ?? []).slice(-4);

  return (
    <div className="wf-view wf-assistant-view">
      {/* Split Workbench Layout */}
      <div className="wf-workbench">
        {/* Left / Center: Conversation Stream */}
        <main className="wf-workbench-main" aria-label="Khung hội thoại trợ lý điều hành">
          <div className="wf-workbench-header">
            <div className="wf-workbench-header__identity">
              <span className="wf-agent-avatar wf-agent-avatar--exec" aria-hidden="true">
                EXEC
              </span>
              <div>
                <h3 className="wf-workbench-header__title">AI Trợ lý điều hành</h3>
                <span className="wf-workbench-header__subtitle">
                  Tổng hợp tri thức 6 Agent · Tra cứu & hỗ trợ ra quyết định
                </span>
              </div>
            </div>
            <span className="wf-live-tag">
              <span className="wf-live-tag__dot" /> Đang lắng nghe
            </span>
          </div>

          {/* Messages Container */}
          <div className="wf-messages-container" role="log" aria-live="polite">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`wf-message-row ${isUser ? 'wf-message-row--user' : 'wf-message-row--assistant'}`}
                >
                  <div className="wf-message-bubble">
                    <div className="wf-message-header">
                      <span className="wf-message-sender">
                        {isUser ? 'Bạn (Tổng Giám đốc)' : 'AI Trợ lý điều hành'}
                      </span>
                      <span className="wf-message-time">{msg.timestamp}</span>
                    </div>

                    <div className="wf-message-text">
                      {msg.text.split('\n\n').map((para, i) => (
                        <p key={i}>
                          {para.split('\n').map((line, j) => (
                            <React.Fragment key={j}>
                              {line}
                              {j < para.split('\n').length - 1 && <br />}
                            </React.Fragment>
                          ))}
                        </p>
                      ))}
                    </div>

                    {/* Structured Widget (KPI / Table / Risk) */}
                    {msg.structuredData && (
                      <div className="wf-structured-widget">
                        <div className="wf-structured-widget__title">
                          <span aria-hidden="true">📊</span> {msg.structuredData.title}
                        </div>
                        <div className="wf-structured-widget__table">
                          {msg.structuredData.rows.map((row, idx) => (
                            <div
                              key={idx}
                              className={`wf-structured-row ${row.highlight ? 'wf-structured-row--highlight' : ''}`}
                            >
                              <span className="wf-structured-row__label">{row.label}</span>
                              <span className="wf-structured-row__val">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cited Sources */}
                    {Boolean(msg.sources && msg.sources.length > 0) && (
                      <div className="wf-sources-chip-group">
                        <span className="wf-sources-label">Nguồn trích dẫn:</span>
                        {msg.sources?.map((src, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="wf-source-chip"
                            onClick={() => src.docId && onNavigateToDoc && onNavigateToDoc(src.docId)}
                            title={src.snippet}
                          >
                            <span className="wf-source-chip__cat">[{src.category}]</span>
                            <span className="wf-source-chip__title">{src.title}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Action Suggestion Buttons */}
                    {Boolean(msg.actionSuggestions && msg.actionSuggestions.length > 0) && (
                      <div className="wf-actions-group">
                        {msg.actionSuggestions?.map((act, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="wf-action-btn"
                            onClick={() => handleActionClick(act)}
                          >
                            <span aria-hidden="true">⚡</span> {act.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="wf-message-row wf-message-row--assistant">
                <div className="wf-message-bubble">
                  <span className="wf-text-muted">Đang trích xuất tri thức và phân tích...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Rail */}
          <div className="wf-quick-prompts-bar">
            <span className="wf-quick-prompts-label">Gợi ý nhanh:</span>
            <div className="wf-quick-prompts-list">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="wf-quick-prompt-btn"
                  onClick={() => handleSend(prompt)}
                  disabled={isTyping}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Composer Input */}
          <form
            className="wf-composer-box"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              className="wf-composer-input"
              placeholder="Hỏi trợ lý điều hành về công việc, hợp đồng, báo giá hoặc sản xuất..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isTyping}
              aria-label="Nhập câu hỏi cho trợ lý"
            />
            <button
              type="submit"
              className="wf-btn wf-btn--primary wf-btn--sm"
              disabled={!inputValue.trim() || isTyping}
            >
              Gửi <span aria-hidden="true">↵</span>
            </button>
          </form>
        </main>

        {/* Right: Context & Sources Sidebar */}
        <aside className="wf-workbench-sidebar" aria-label="Ngữ cảnh và nguồn tham chiếu">
          {/* Active Context Card */}
          <div className="wf-side-panel">
            <h4 className="wf-side-panel__title">Ngữ cảnh Điều hành</h4>
            <div className="wf-context-kv">
              <span className="wf-kv-label">Vai trò</span>
              <span className="wf-kv-val">Tổng Giám đốc</span>
            </div>
            <div className="wf-context-kv">
              <span className="wf-kv-label">Mô hình AI</span>
              <span className="wf-kv-val">Codex / Sonnet</span>
            </div>
            <div className="wf-context-kv">
              <span className="wf-kv-label">Tri thức</span>
              <span className="wf-kv-val">6 Agent · 1.240 mục</span>
            </div>
            <div className="wf-context-kv">
              <span className="wf-kv-label">Trạng thái</span>
              <span className="wf-kv-val wf-kv-val--ok">Trực tuyến</span>
            </div>
          </div>

          {/* Referenced Sources */}
          <div className="wf-side-panel">
            <h4 className="wf-side-panel__title">Nguồn trích dẫn</h4>
            {activeSources.length > 0 ? (
              <div className="wf-sources-list">
                {activeSources.map((src, i) => (
                  <div key={i} className="wf-source-card">
                    <div className="wf-source-card__top">
                      <span className="wf-source-badge">{src.category}</span>
                      {src.docId && onNavigateToDoc && (
                        <button
                          type="button"
                          className="wf-link-btn"
                          onClick={() => onNavigateToDoc(src.docId!)}
                        >
                          Mở file →
                        </button>
                      )}
                    </div>
                    <div className="wf-source-card__title">{src.title}</div>
                    <p className="wf-source-card__snippet">{src.snippet}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="wf-empty-subtext">Chưa có trích dẫn trong phiên này.</div>
            )}
          </div>

          {/* Quick Shortcuts */}
          <div className="wf-side-panel">
            <h4 className="wf-side-panel__title">Lối tắt nghiệp vụ</h4>
            <div className="wf-shortcuts-list">
              <button
                type="button"
                className="wf-shortcut-item"
                onClick={() => onNavigateToAlert && onNavigateToAlert('alert-legal-01')}
              >
                <span aria-hidden="true">⚖️</span>
                <div>
                  <strong>Hợp đồng VinFast cần duyệt</strong>
                  <small>Phạt chậm tiến độ vượt trần</small>
                </div>
              </button>
              <button
                type="button"
                className="wf-shortcut-item"
                onClick={() => onNavigateToDoc && onNavigateToDoc('doc-invoice-01')}
              >
                <span aria-hidden="true">🧾</span>
                <div>
                  <strong>Hóa đơn Đại Phát (528tr)</strong>
                  <small>Công nợ Net-30 quá hạn 5 ngày</small>
                </div>
              </button>
              <button
                type="button"
                className="wf-shortcut-item"
                onClick={() => onNavigateToAgent && onNavigateToAgent('manufacturing')}
              >
                <span aria-hidden="true">🏭</span>
                <div>
                  <strong>Điều độ Lệnh SX SO-8842</strong>
                  <small>Khắc phục sự cố máy Laser CNC-03</small>
                </div>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
