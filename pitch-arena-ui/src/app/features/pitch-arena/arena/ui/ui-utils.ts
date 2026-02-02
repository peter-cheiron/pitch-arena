import { ChatUIMessage } from './chat-ui';

export type ChatExportInteraction = {
  questioner: 'system' | 'user' | 'ai';
  responder: 'user' | 'ai';
  question: string;
  answer: string | null;
};

export const buildInteractions = (
  messages: ChatUIMessage[],
): ChatExportInteraction[] => {
  const interactions: ChatExportInteraction[] = [];
  let pending: ChatUIMessage | null = null;

  for (const message of messages) {
    if (message.role === 'system') continue;

    if (!pending) {
      pending = message;
      continue;
    }

    if (pending.role === message.role) {
      interactions.push({
        questioner: pending.role,
        responder: pending.role === 'ai' ? 'user' : 'ai',
        question: pending.text,
        answer: null,
      });
      pending = message;
      continue;
    }

    interactions.push({
      questioner: pending.role,
      responder: message.role,
      question: pending.text,
      answer: message.text,
    });
    pending = null;
  }

  if (pending) {
    interactions.push({
      questioner: pending.role,
      responder: pending.role === 'ai' ? 'user' : 'ai',
      question: pending.text,
      answer: null,
    });
  }

  return interactions;
};

export const downloadJson = (payload: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};


