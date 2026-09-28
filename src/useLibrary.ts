import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { api } from './api';
import { gameTitle, type Conversation, type Library, type SavedGame } from '../shared/library';
import type { Game } from '../shared/types';
import { finishMessage } from './messages';

function conversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: '新对话',
    updatedAt: new Date().toISOString(),
    messages: [],
    history: [],
    draft: '',
  };
}
export function useLibrary(initialGame: Game) {
  const [games, setGames] = useState<SavedGame[]>([]);
  const [gameId, setGameId] = useState<string>(() => crypto.randomUUID());
  const [game, setGame] = useState(initialGame);
  const [conversations, setConversations] = useState<Conversation[]>(() => [conversation()]);
  const [conversationId, setConversationId] = useState(conversations[0].id);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const pending = useRef(new Map<string, { path: string; value: unknown }>());
  const queue = useRef(Promise.resolve());
  function flush() {
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        for (const [key, item] of pending.current) {
          await api(item.path, item.value);
          if (pending.current.get(key) === item) pending.current.delete(key);
        }
        setError('');
      });
    return queue.current;
  }
  function save(path: string, value: { id: string }) {
    pending.current.set(`${path}/${value.id}`, { path, value });
    void flush().catch((e) => setError(`历史保存失败：${(e as Error).message}`));
  }
  useEffect(() => {
    let active = true;
    void api<Library>('library')
      .then((data) => {
        if (!active) return;
        setGames(data.games);
        const last = [...data.games].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (last) {
          setGame(last.game);
          setGameId(last.id);
        }
        if (data.conversations.length) {
          const restored = data.conversations.map((item) => ({
            ...item,
            messages: item.messages.map((message) =>
              message.state === 'running'
                ? finishMessage(message, 'stopped', '应用已关闭，分析已中断')
                : message,
            ),
          }));
          setConversations(restored);
          setConversationId(
            [...restored].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id,
          );
        }
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(`历史读取失败：${(e as Error).message}`);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);
  useEffect(() => {
    if (!ready) return;
    const record = {
      id: gameId,
      title: gameTitle(game),
      game,
      updatedAt: new Date().toISOString(),
    };
    setGames((items) => [record, ...items.filter((item) => item.id !== gameId)]);
    save('library/games', record);
  }, [game, gameId, ready]);
  const activeConversation = conversations.find((item) => item.id === conversationId)!;
  useEffect(() => {
    if (ready) save('library/conversations', activeConversation);
  }, [activeConversation, ready]);
  function update<K extends keyof Conversation>(key: K, value: SetStateAction<Conversation[K]>) {
    setConversations((items) =>
      items.map((item) => {
        if (item.id !== conversationId) return item;
        const next =
          typeof value === 'function'
            ? (value as (previous: Conversation[K]) => Conversation[K])(item[key])
            : value;
        return {
          ...item,
          [key]: next,
          title:
            key === 'messages'
              ? (next as Conversation['messages'])[0]?.question.slice(0, 60) || item.title
              : item.title,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }
  return {
    game,
    setGame,
    gameId,
    games,
    ready,
    error,
    conversations,
    conversationId,
    activeConversation,
    update,
    flush,
    retry: () => {
      if (!ready) {
        setLoadAttempt((value) => value + 1);
        return;
      }
      void flush().catch((e) => setError(`历史保存失败：${(e as Error).message}`));
    },
    selectConversation: setConversationId,
    newConversation() {
      const item = conversation();
      setConversations((items) => [item, ...items]);
      setConversationId(item.id);
    },
    selectGame(item: SavedGame) {
      setGame(item.game);
      setGameId(item.id);
    },
    newGame(value: Game) {
      setGame(value);
      setGameId(crypto.randomUUID());
    },
  };
}
