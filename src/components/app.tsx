import { RouterProvider } from '@satilian/router';
import { AccountShoppingList } from './account-shopping-list';

const routes = [
  { id: 'catalog', path: '/', element: <AccountShoppingList /> },
  { id: 'shopping', path: '/shopping', element: <AccountShoppingList shoppingOnly /> },
];

export default function App({ pathname }: { pathname?: string }) {
  return <RouterProvider config={{ routes }} pathname={pathname} />;
}
