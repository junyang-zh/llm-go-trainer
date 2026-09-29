import { recordGroupId } from '../shared/library';
import { t } from './i18n';
import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { api } from './api';
import { gameTitle, type Conversation, type Library, type SavedGame } from '../shared/library';
import type { Game, ToolActivity } from '../shared/types';
import { finishMessage } from './messages';

function conversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: t('newChat'),
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
  const [review, setReview] = useState(false);
  const [lineage, setLineage] = useState<Pick<SavedGame, 'groupId' | 'sourceId' | 'forkTurn'>>({});
  const [presets, setPresets] = useState<SavedGame[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>(() => [conversation()]);
  const [conversationId, setConversationId] = useState(conversations[0].id);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const pending = useRef(new Map<string, { path: string; value: unknown }>());
  const serverGame = useRef<{ id: string; game: Game } | null>(null);
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
    void flush().catch((e) => setError(t('couldNotSaveHistory', { v0: (e as Error).message })));
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
          setReview(true);
          setLineage({ groupId: last.groupId, sourceId: last.sourceId, forkTurn: last.forkTurn });
        }
        if (data.conversations.length) {
          const restored = data.conversations.map((item) => ({
            ...item,
            messages: item.messages.map((message) =>
              message.state === 'running'
                ? finishMessage(message, 'stopped', t('analysisInterrupted'))
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
        if (active) setError(t('couldNotLoadHistory', { v0: (e as Error).message }));
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);
  useEffect(() => {
    if (!ready || review) return;
    // Agent changes are already persisted. Echoing them back can race with its next tool.
    if (serverGame.current?.id === gameId && serverGame.current.game === game) return;
    const record = {
      ...lineage,
      id: gameId,
      title: gameTitle(game),
      game,
      updatedAt: new Date().toISOString(),
    };
    setGames((items) => [record, ...items.filter((item) => item.id !== gameId)]);
    save('library/games', record);
  }, [game, gameId, ready, review, lineage]);
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
    games: [...games, ...presets],
    review,
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
      void flush().catch((e) => setError(t('couldNotSaveHistory', { v0: (e as Error).message })));
    },
    selectConversation: setConversationId,
    newConversation() {
      const item = conversation();
      setConversations((items) => [item, ...items]);
      setConversationId(item.id);
    },
    applyGameChange(change: NonNullable<ToolActivity['gameChange']>) {
      const { record, context } = change;
      const updateRecords = record.preset ? setPresets : setGames;
      updateRecords((items) => [record, ...items.filter((item) => item.id !== record.id)]);
      if (context) {
        serverGame.current = { id: record.id, game: record.game };
        if (change.operation !== 'rename_game') setReview(true);
        setLineage({
          groupId: record.groupId,
          sourceId: record.sourceId,
          forkTurn: record.forkTurn,
        });
        setGame(record.game);
        setGameId(record.id);
      }
    },
    async renameGame(id: string, title: string) {
      await flush();
      const renamed = await api<SavedGame>(`library/games/${id}/name`, { title });
      setGames((items) => items.map((item) => (item.id === id ? renamed : item)));
      if (id === gameId)
        setGame((value) => ({ ...value, metadata: { ...value.metadata, GN: renamed.title } }));
    },
    async findGame(id: string) {
      const found = [...games, ...presets].find((item) => item.id === id);
      if (found || !id.startsWith('c0000000-')) return found;
      return api<SavedGame>(`library/presets/${encodeURIComponent(id)}`);
    },
    selectGame(item: SavedGame) {
      if (item.preset)
        setPresets((items) => [item, ...items.filter((value) => value.id !== item.id)]);
      else setGames((items) => [item, ...items.filter((value) => value.id !== item.id)]);
      setReview(true);
      setLineage({ groupId: item.groupId, sourceId: item.sourceId, forkTurn: item.forkTurn });
      setGame(item.game);
      setGameId(item.id);
    },
    newGame(value: Game, source?: SavedGame, forkTurn?: number, asReview = false) {
      setReview(false);
      const ancestry = source
        ? { groupId: recordGroupId(source), sourceId: source.id, forkTurn }
        : {};
      setLineage(ancestry);
      if (asReview) {
        const record = {
          id: crypto.randomUUID(),
          game: value,
          title: gameTitle(value),
          updatedAt: new Date().toISOString(),
          ...ancestry,
        };
        setGames((items) => [record, ...items]);
        save('library/games', record);
        setGame(value);
        setGameId(record.id);
        setReview(true);
        return;
      }
      setGame(value);
      setGameId(crypto.randomUUID());
    },
  };
}
