import { RouterProvider } from '@satilian/router';
import { ShoppingList } from './shopping-list';

const routes = [
  { id: 'catalog', path: '/', element: <ShoppingList /> },
  { id: 'shopping', path: '/shopping', element: <ShoppingList shoppingOnly /> },
];

export default function App({ pathname }: { pathname?: string }) {
  return <RouterProvider config={{ routes }} pathname={pathname} />;
}
