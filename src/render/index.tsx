import { renderToString } from 'react-dom/server';
import App from '../components/app';

export function render(pathname: string) {
  return renderToString(<App pathname={pathname} />);
}
