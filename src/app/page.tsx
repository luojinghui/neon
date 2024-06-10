import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-between p-4">
      <div>Home page</div>
      <Link href="/chat">Chat</Link>
    </div>
  );
}
