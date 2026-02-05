import { redirect } from 'next/navigation';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Home() {
  redirect(`${basePath}/login`);
}
