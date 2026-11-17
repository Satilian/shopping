import { Button } from '@satilian/ui-kit/button';
import { Checkbox } from '@satilian/ui-kit/checkbox';
import { useSyncExternalStore, type FormEvent } from 'react';
import { Link } from '@satilian/router';

interface Item {
  id: string;
  name: string;
  needed: boolean;
}

interface Group {
  id: string;
  name: string;
  items: Item[];
}

export const storageKey = 'shopping-list:v1';
const empty: Group[] = [];
const listeners = new Set<() => void>();
let snapshot = empty;
let storedValue: string | null = null;

function getSnapshot(): Group[] {
  const value = localStorage.getItem(storageKey);
  if (value !== storedValue) {
    snapshot = value ? (JSON.parse(value) as Group[]) : empty;
    storedValue = value;
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function update(change: (groups: Group[]) => Group[]) {
  localStorage.setItem(storageKey, JSON.stringify(change(getSnapshot())));
  listeners.forEach((listener) => listener());
}

function updateGroup(id: string, change: (group: Group) => Group) {
  update((groups) => groups.map((group) => (group.id === id ? change(group) : group)));
}

export function AddForm({ label, onAdd }: { label: string; onAdd: (name: string) => void | Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return;
    if ((await onAdd(name)) !== false && new FormData(form).get('name')?.toString().trim() === name) {
      form.reset();
    }
  }

  return (
    <form onSubmit={submit}>
      <input type="text" name="name" aria-label={label} placeholder={label} maxLength={100} required />
      <Button type="submit">Добавить</Button>
    </form>
  );
}

export function ShoppingList({ shoppingOnly = false }: { shoppingOnly?: boolean }) {
  const groups = useSyncExternalStore(subscribe, getSnapshot, () => empty);
  const count = groups.reduce((total, group) => total + group.items.filter((item) => item.needed).length, 0);
  const visibleGroups = shoppingOnly ? groups.filter((group) => group.items.some((item) => item.needed)) : groups;

  return (
    <main>
      <h1>Список покупок</h1>
      <nav aria-label="Режим списка">
        <Link to="/" aria-current={shoppingOnly ? undefined : 'page'}>
          Все товары
        </Link>
        <Link to="/shopping" aria-current={shoppingOnly ? 'page' : undefined}>
          Купить · {count}
        </Link>
      </nav>
      {!shoppingOnly && (
        <AddForm
          label="Название группы"
          onAdd={(name) => update((current) => [...current, { id: crypto.randomUUID(), name, items: [] }])}
        />
      )}
      {visibleGroups.length === 0 && (
        <p className="empty">{shoppingOnly ? 'Пока ничего не отмечено.' : 'Добавьте первую группу.'}</p>
      )}
      {visibleGroups.map((group) => (
        <section key={group.id} aria-labelledby={group.id}>
          <header>
            <h2 id={group.id}>{group.name}</h2>
            {!shoppingOnly && (
              <button
                type="button"
                className="remove"
                aria-label={`Удалить группу «${group.name}»`}
                onClick={() => {
                  if (window.confirm(`Удалить группу «${group.name}» и её товары?`)) {
                    update((current) => current.filter((entry) => entry.id !== group.id));
                  }
                }}
              >
                Удалить группу
              </button>
            )}
          </header>
          <ul>
            {group.items
              .filter((item) => !shoppingOnly || item.needed)
              .map((item) => (
                <li key={item.id}>
                  <Checkbox
                    label={item.name}
                    checked={item.needed}
                    onChange={(event) => {
                      const needed = event.currentTarget.checked;
                      updateGroup(group.id, (current) => ({
                        ...current,
                        items: current.items.map((entry) => (entry.id === item.id ? { ...entry, needed } : entry)),
                      }));
                    }}
                  />
                  {!shoppingOnly && (
                    <button
                      type="button"
                      className="remove"
                      aria-label={`Удалить товар «${item.name}»`}
                      onClick={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          items: current.items.filter((entry) => entry.id !== item.id),
                        }))
                      }
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
              onAdd={(name) =>
                updateGroup(group.id, (current) => ({
                  ...current,
                  items: [...current.items, { id: crypto.randomUUID(), name, needed: false }],
                }))
              }
            />
          )}
        </section>
      ))}
    </main>
  );
}
