import { Link, usePathname } from './lib/router';
import { Styleguide } from './pages/Styleguide';

export default function App() {
  const pathname = usePathname().replace(/\/+$/, '') || '/';
  if (pathname === '/styleguide') return <Styleguide />;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-lg px-xl text-center">
      <h1 className="text-4xl font-bold tracking-tight text-brand-600">NameSwipe</h1>
      <p className="max-w-md text-lg text-ink-secondary">
        Swipe on names together &mdash; when you both swipe right, it&rsquo;s a match.
      </p>
      <Link
        to="/styleguide"
        className="text-base font-medium text-brand-600 underline underline-offset-4 hover:text-brand-700"
      >
        Open the styleguide
      </Link>
    </main>
  );
}
