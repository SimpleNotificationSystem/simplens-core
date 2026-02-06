import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to dashboard - middleware will handle authentication
  // If user is not authenticated, middleware redirects to login
  redirect(`/dashboard`);
}
