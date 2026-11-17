import { Link } from '@satilian/router';
import { Checkbox } from '@satilian/ui-kit/checkbox';
import { useEffect, useState } from 'react';
import { AddForm, ShoppingList, storageKey } from './shopping-list';

interface Account {
  id: string;
  name: string;
}

interface Member extends Account {
  isOwner: boolean;
}

interface Group {
  id: string;
  name: string;
  isOwner: boolean;
  items: { id: string; name: string; needed: boolean }[];
}

async function request<T>(path: string, method = 'GET', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(response.status === 401 ? 'Войдите снова.' : `Ошибка запроса (${response.status}).`);
  return response.status === 204 ? (undefined as T) : response.json();
}

export function AccountShoppingList({ shoppingOnly = false }: { shoppingOnly?: boolean }) {
  const [account, setAccount] = useState<Account | 'local' | null>();
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/auth/session', { signal: controller.signal });
        if (response.status === 401) {
          localStorage.removeItem('shopping-list:local-mode');
          setAccount(null);
          return;
        }
        if (!response.ok) throw new Error('Не удалось проверить вход.');
        const session: Account | { mode: 'local' } = await response.json();
        if ('mode' in session) localStorage.setItem('shopping-list:local-mode', '1');
        else localStorage.removeItem('shopping-list:local-mode');
        setAccount('mode' in session ? 'local' : session);
      } catch {
        if (controller.signal.aborted) return;
        if (localStorage.getItem('shopping-list:local-mode') === '1') {
          setAccount('local');
          return;
        }
        if (!controller.signal.aborted)
          setError('Не удалось проверить вход. Проверьте подключение и обновите страницу.');
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (account === 'local') return <ShoppingList shoppingOnly={shoppingOnly} />;
  if (account) {
    return <SharedList account={account} shoppingOnly={shoppingOnly} onLogout={() => setAccount(null)} />;
  }
  return (
    <main>
      <h1>Список покупок</h1>
      {account === null ? (
        <a
          href="/api/auth/login"
          onClick={() => {
            const token = new URLSearchParams(location.hash.slice(1)).get('invite');
            if (token) sessionStorage.setItem('shopping-list:invite', token);
          }}
        >
          Войти через Keycloak
        </a>
      ) : (
        <p>{error || 'Проверяем вход…'}</p>
      )}
    </main>
  );
}

function SharedList({
  account,
  shoppingOnly,
  onLogout,
}: {
  account: Account;
  shoppingOnly: boolean;
  onLogout: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const importKey = `shopping-list:imported:${account.id}`;
  const [canImport, setCanImport] = useState(
    () => !localStorage.getItem(importKey) && Boolean(localStorage.getItem(storageKey)),
  );
  const [invite, setInvite] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('invite') ?? sessionStorage.getItem('shopping-list:invite'),
  );

  useEffect(() => {
    let pending: AbortController | undefined;
    async function load() {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      try {
        const result = await request<Group[]>('groups', 'GET', undefined, controller.signal);
        if (!controller.signal.aborted) setGroups(result);
      } catch (cause) {
        if (!controller.signal.aborted && cause instanceof Error) setError(cause.message);
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    document.addEventListener('visibilitychange', load);
    return () => {
      pending?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [revision]);

  async function act(action: () => Promise<unknown>): Promise<boolean> {
    setError('');
    try {
      await action();
      setRevision((value) => value + 1);
      return true;
    } catch (cause) {
      setError(!navigator.onLine ? 'Для изменения общего списка подключитесь к сети.' : String(cause));
      return false;
    }
  }

  const count = groups.reduce((total, group) => total + group.items.filter((item) => item.needed).length, 0);

  return (
    <main>
      <h1>Список покупок</h1>
      <p>
        {account.name}{' '}
        <button
          type="button"
          onClick={() =>
            void act(async () => {
              await request('auth/logout', 'POST');
              onLogout();
            })
          }
        >
          Выйти
        </button>
      </p>
      <nav aria-label="Режим списка">
        <Link to="/" aria-current={shoppingOnly ? undefined : 'page'}>
          Все товары
        </Link>
        <Link to="/shopping" aria-current={shoppingOnly ? 'page' : undefined}>
          Купить · {count}
        </Link>
      </nav>
      {error && <p role="alert">{error}</p>}
      {canImport && !shoppingOnly && (
        <button
          type="button"
          onClick={() =>
            void act(async () => {
              const raw = localStorage.getItem(storageKey);
              if (!raw) return;
              const groups: unknown = JSON.parse(raw);
              if (!Array.isArray(groups)) throw new Error('Локальный список повреждён.');
              await request('groups/import', 'POST', groups);
              localStorage.setItem(importKey, '1');
              setCanImport(false);
            })
          }
        >
          Импортировать локальный список
        </button>
      )}
      {invite && (
        <button
          type="button"
          onClick={() =>
            void act(async () => {
              await request(`invitations/${encodeURIComponent(invite)}/accept`, 'POST');
              sessionStorage.removeItem('shopping-list:invite');
              history.replaceState(history.state, '', location.pathname + location.search);
              setInvite(null);
            })
          }
        >
          Принять приглашение
        </button>
      )}
      {!shoppingOnly && (
        <AddForm label="Название группы" onAdd={(name) => act(() => request('groups', 'POST', { name }))} />
      )}
      {groups.map((group) => {
        const items = shoppingOnly ? group.items.filter((item) => item.needed) : group.items;
        if (shoppingOnly && items.length === 0) return null;
        const path = `groups/${group.id}`;
        return (
          <section key={group.id} aria-labelledby={group.id}>
            <h2 id={group.id}>{group.name}</h2>
            {!shoppingOnly && group.isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Удалить группу «${group.name}» и её товары?`)) {
                      void act(() => request(path, 'DELETE'));
                    }
                  }}
                >
                  Удалить группу
                </button>
                <ManageMembers path={path} act={act} />
              </>
            )}
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <Checkbox
                    label={item.name}
                    checked={item.needed}
                    onChange={(event) => {
                      const needed = event.currentTarget.checked;
                      void act(() => request(`${path}/items/${item.id}`, 'PATCH', { needed }));
                    }}
                  />
                  {!shoppingOnly && (
                    <button
                      type="button"
                      className="remove"
                      aria-label={`Удалить товар «${item.name}»`}
                      onClick={() => void act(() => request(`${path}/items/${item.id}`, 'DELETE'))}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!shoppingOnly && (
              <AddForm
                label="Название товара"
                onAdd={(name) => act(() => request(`${path}/items`, 'POST', { name }))}
              />
            )}
          </section>
        );
      })}
    </main>
  );
}

function ManageMembers({ path, act }: { path: string; act: (action: () => Promise<unknown>) => Promise<boolean> }) {
  const [members, setMembers] = useState<Member[]>();
  const [token, setToken] = useState('');

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void act(async () => {
            setMembers(await request<Member[]>(`${path}/members`));
          })
        }
      >
        Показать участников
      </button>
      <button
        type="button"
        disabled={Boolean(token)}
        onClick={() =>
          void act(async () => {
            const invitation = await request<{ token: string }>(`${path}/invitations`, 'POST');
            setToken(invitation.token);
          })
        }
      >
        Создать приглашение
      </button>
      {token && (
        <p>
          <input aria-label="Ссылка-приглашение" readOnly value={`${location.origin}/#invite=${token}`} />
          <button
            type="button"
            onClick={() =>
              void act(async () => {
                await request(`${path}/invitations/${token}`, 'DELETE');
                setToken('');
              })
            }
          >
            Отозвать приглашение
          </button>
        </p>
      )}
      {members && (
        <ul>
          {members.map((member) => (
            <li key={member.id}>
              {member.name}{' '}
              {!member.isOwner && (
                <button
                  type="button"
                  onClick={() =>
                    void act(async () => {
                      await request(`${path}/members/${member.id}`, 'DELETE');
                      setMembers((current) => current?.filter((entry) => entry.id !== member.id));
                    })
                  }
                >
                  Удалить
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
