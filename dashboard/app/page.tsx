import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to dashboard page
  // Middleware will handle authentication and base path
  redirect('/dashboard');
}
